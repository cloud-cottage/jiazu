/**
 * 资产账本内核（P0）— 集合 jiazu_assets（单文档 _id='global'）
 *
 * 唯一真源：docs/economy.spec.md
 *   §3 四类资产定义 / §4-1 存储契约 / §4-6 枚举
 *   §5-1 碎片上限 9 与自动合成 / §5-2 FIFO + 整单拒绝 / §5-3 有效期 / §5-4 惰性结算 / §5-7 唯一写入路径与原子性
 *
 * **已知限制（总监 2026-09-16 拍板：暂不改，部署前重构）**：资产集合当前为**全体用户共用单文档**
 * `_id='global'`，并发保护**仅进程内锁**（下方 `assetsLocks`，同实例内已串行化）——**云端多实例并发会丢更新 / 双花**。
 * 部署前**必须**重构为「**每手机号一文档 + version 乐观锁（CAS）重试**」，本限制登记见 docs/PENDING_DEPLOY.md。
 *
 * 分层（纯函数与 IO 分离，便于单测）：
 *   - 纯函数（只操作传入的 user 记录，无 IO）：sweep / addFragments / chargeLots / addLot / sumLots /
 *     recordTx / nextLotId / beijingDate / summarize / expiringItems
 *   - IO 层：withAssets（colGet → mutator → colSet 整体回写；**同一手机号串行化**，模式同 store.js 的
 *     treeWriteLocks）/ mutateAssets / getAssets
 *
 * **唯一写入路径（§5-7）**：任何路径（脚本 / 云函数旁路 / 前端）都不得直写 jiazu_assets，只经本模块。
 */
import { colGet, colSet } from './store.js';

export const ASSETS_COL = 'jiazu_assets';
export const ASSETS_ID = 'global';

// ---- §5-3 / §3-1 常量（改动先改总纲） ----

export const SEED_TTL_DAYS = 365;
export const BAMBOO_TTL_DAYS = 365;
export const FRAGMENT_CAP = 9;
export const FRAGMENT_SYNTH_THRESHOLD = 10;
export const FRAGMENT_PER_SEED = 10;
/** GET /assets/expiring 默认阈值天数（§11-11） */
export const EXPIRING_DEFAULT_DAYS = 30;

/**
 * P0 使用的 Tx.type 白名单（§4-6 全表的子集；新增取值必须先改总纲再改这里）
 * P1（docs/economy-fee.spec.md §2 对齐表）追加扣费 / 冲正取值：
 *   `edit_fee`（修改 / 同树改父）、`delete_fee`（删除节点）、`move_fee`（跨树迁移）、
 *   `tree_create`（建树扣 9 籽）、`fee_refund`（落库失败原路返还）。
 * P2（docs/spirit-domain.spec.md §3-2 / 总册 §4-6）追加时流子域取值：
 *   `jade_synth`（999 籽 → 玉）、`jade_decompose`（玉 → 999 籽）、
 *   `jade_mount`（镶嵌，`delta` 为 0 的记账条）、`spirit_charge`（玉露灵泽蓄能）。
 */
export const TX_TYPES = [
  'signin',
  'fragment_synth',
  'expire',
  'reward',
  'admin_grant',
  'account_clear',
  'edit_fee',
  'delete_fee',
  'move_fee',
  'tree_create',
  'fee_refund',
  'jade_synth',
  'jade_decompose',
  'jade_mount',
  'spirit_charge',
  // P3（docs/economy-market.spec.md §2-2 / 总册 §4-6）追加市集与官方发售取值：
  //   `market_list`（挂单）、`market_cancel`（撤单）、`market_sell`（卖方入账籽）、
  //   `market_buy`（买方出账籽）、`official_buy`（官方竹简购买）。
  //   挂单到期下架 / 批次作废沿用既有 `expire`。
  'market_list',
  'market_cancel',
  'market_sell',
  'market_buy',
  'official_buy',
];

export const ASSET_INSUFFICIENT = 'ASSET_INSUFFICIENT';

const DAY_MS = 86400000;
const ASSET_LABEL = { seed: '石榴籽', bamboo: '竹片', jade: '石榴籽玉' };
const ASSET_UNIT = { seed: '颗', bamboo: '片', jade: '枚' };
const LOT_KEY = { seed: 'seeds', bamboo: 'bamboos', jade: 'jades' };

// ---- 基础工具 ----

let idSeq = 0;
/** 批次 / 流水 id（同一生成器，前缀区分类型：sl_ 籽、bl_ 竹片、jd_ 玉、tx_ 流水） */
export function nextLotId(prefix = 'lot') {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}${idSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const toIso = (d) => new Date(d).toISOString();
const toMs = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

function isoPlusDays(from, days) {
  return new Date(toMs(from) + days * DAY_MS).toISOString();
}

/** 到期判定：`expires_at` 缺省 / `null` = 永久（玉，§5-4-2 恒不过期）；有值则 `<= now` 即过期 */
function isExpired(expires_at, now) {
  if (expires_at === null || expires_at === undefined || expires_at === '') return false;
  const t = Date.parse(expires_at);
  return Number.isFinite(t) && t <= toMs(now);
}

/** FIFO 排序键：`expires_at` 升序（最早到期优先），`null`（永久）排最后 */
function compareLotByExpiry(a, b) {
  const av = a?.expires_at ? Date.parse(a.expires_at) : Number.POSITIVE_INFINITY;
  const bv = b?.expires_at ? Date.parse(b.expires_at) : Number.POSITIVE_INFINITY;
  return (Number.isFinite(av) ? av : Number.POSITIVE_INFINITY) - (Number.isFinite(bv) ? bv : Number.POSITIVE_INFINITY);
}

/** 北京时间（UTC+8）自然日 `YYYY-MM-DD`（§5-4 / docs/economy-ops.spec.md §11-1） */
export function beijingDate(date = new Date()) {
  return new Date(toMs(date) + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 空资产记录（§4-1） */
function blankUser() {
  return { fragments: 0, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' };
}

function ensureUser(doc, phone) {
  doc.users = doc.users || {};
  const cur = doc.users[phone];
  if (!cur) {
    doc.users[phone] = blankUser();
    return doc.users[phone];
  }
  cur.fragments = Number(cur.fragments) || 0;
  cur.seeds = cur.seeds || [];
  cur.bamboos = cur.bamboos || [];
  cur.jades = cur.jades || [];
  cur.txs = cur.txs || [];
  cur.signin_date = cur.signin_date || '';
  return cur;
}

// ---- 错误：资产不足（409，整单拒绝） ----

/**
 * 资产不足错误：`status=409` / `code='ASSET_INSUFFICIENT'` / `need` / `current` / `unit`
 * 文案：「资产不足，需 X 颗石榴籽，当前 Y 颗」（竹片用「片」）
 */
export function assetInsufficient(need, current, unit = 'seed') {
  const label = ASSET_LABEL[unit] || ASSET_LABEL.seed;
  const u = ASSET_UNIT[unit] || ASSET_UNIT.seed;
  const e = new Error(`资产不足，需 ${need} ${u}${label}，当前 ${current} ${u}`);
  e.status = 409;
  e.code = ASSET_INSUFFICIENT;
  e.need = need;
  e.current = current;
  e.unit = unit;
  return e;
}

// ---- §4-1 批次 / 流水构造 ----

/** 批次求和（籽的颗数 / 竹片的片数；忽略非法值，绝不为负） */
export function sumLots(lots) {
  let total = 0;
  for (const lot of lots || []) total += Math.max(0, Math.floor(Number(lot?.qty) || 0));
  return total;
}

/**
 * 追加批次：seed / bamboo（qty 以「颗 / 片」计，`expires_at = now + 365 天`）、
 * jade（无 qty；**`expires_at` 必须由调用方显式传入**——`null` = 永久（仅限已判定为永久时）、
 * ISO 时刻 = 有期限。**无「默认永久」口径**（§4-1 / §11-3），缺省即抛错。
 * @returns {object} 新批次
 */
export function addLot(user, kind, qty, opts = {}) {
  const key = LOT_KEY[kind];
  if (!key) throw new Error(`未知资产类型：${kind}`);
  const now = opts.now ? new Date(opts.now) : new Date();
  let lot;
  if (kind === 'jade') {
    if (opts.expires_at === undefined) {
      throw new Error('玉批次必须显式指定 expires_at（null = 永久，仅限判定为永久时使用）');
    }
    lot = {
      id: opts.id || nextLotId('jd'),
      expires_at: opts.expires_at,
      created_at: toIso(now),
      source: opts.source || 'admin',
    };
  } else {
    const ttl = opts.ttl_days ?? (kind === 'bamboo' ? BAMBOO_TTL_DAYS : SEED_TTL_DAYS);
    lot = {
      id: opts.id || nextLotId(kind === 'bamboo' ? 'bl' : 'sl'),
      qty: Math.max(0, Math.floor(Number(qty) || 0)),
      expires_at: opts.expires_at !== undefined ? opts.expires_at : isoPlusDays(now, ttl),
      source: opts.source || '',
      created_at: toIso(now),
    };
  }
  user[key] = user[key] || [];
  user[key].push(lot);
  return lot;
}

/** 写流水（type 必须是 §4-6 白名单内的取值） */
export function recordTx(user, tx, now = new Date()) {
  const type = String(tx?.type || '');
  if (!TX_TYPES.includes(type)) throw new Error(`未知流水类型：${type}（docs/economy.spec.md §4-6）`);
  const t = { id: nextLotId('tx'), ts: toIso(now), type, delta: tx.delta || {} };
  if (tx.fee_seeds !== undefined) t.fee_seeds = tx.fee_seeds;
  t.ref = tx.ref || {};
  t.desc = String(tx.desc || '');
  if (tx.operator !== undefined) t.operator = tx.operator;
  user.txs = user.txs || [];
  user.txs.push(t);
  return t;
}

// ---- §5-4 惰性结算 ----

/**
 * 惰性结算 `sweep(user, now)`（§5-4-2）：
 * - 剔除所有 `expires_at <= now` 的 SeedLot / BambooLot（每个被剔除批次写一条 `type='expire'` 流水）；
 * - Jade：`expires_at=null`（永久）恒不过期；有值且已过期 → 作废移除（同样写 `expire`，`delta.jades = -1`）；
 * - 扣尽（`qty=0`）的批次就地移除，不写流水（§5-2-3）；
 * - 脏数据收口：`qty` 非法 / `NaN` / 负数一律归 0 就地剔除（同样不写流水），removed 记录与 `expire` 流水的
 *   `delta` **绝不出现 `null` / `NaN`**；
 * - 收口不变量 `0 ≤ fragments ≤ 9`（脏数据里的 ≥10 碎片顺带立即合成，不落中间态）。
 * @returns {Array<{asset:string, lot_id:string, qty:number, expires_at:string}>} 被剔除的批次
 */
export function sweep(user, now = new Date()) {
  const removed = [];
  for (const kind of ['seed', 'bamboo']) {
    const key = LOT_KEY[kind];
    const kept = [];
    for (const lot of user[key] || []) {
      if (!lot) continue;
      // 脏数据收口：非法 / NaN / 负数一律归 0（就地剔除，不写流水），绝不让 NaN 流进 removed 与 expire 流水
      const qty = Math.max(0, Math.floor(Number(lot.qty) || 0));
      if (qty <= 0) continue; // 已扣尽 / 脏数据 → 移除（不写流水）
      lot.qty = qty;
      if (isExpired(lot.expires_at, now)) {
        removed.push({ asset: kind, lot_id: lot.id, qty, expires_at: lot.expires_at });
        continue;
      }
      kept.push(lot);
    }
    user[key] = kept;
  }
  const jades = [];
  for (const jade of user.jades || []) {
    if (!jade) continue;
    if (isExpired(jade.expires_at, now)) {
      removed.push({ asset: 'jade', lot_id: jade.id, qty: 1, expires_at: jade.expires_at });
      continue;
    }
    jades.push(jade);
  }
  user.jades = jades;

  for (const r of removed) {
    recordTx(
      user,
      {
        type: 'expire',
        delta: r.asset === 'seed' ? { seeds: -r.qty } : r.asset === 'bamboo' ? { bamboos: -r.qty } : { jades: -1 },
        desc: `${ASSET_LABEL[r.asset]}批次 ${r.lot_id} 到期作废 ${r.qty} ${ASSET_UNIT[r.asset]}`,
      },
      now,
    );
  }

  user.fragments = Math.max(0, Math.floor(Number(user.fragments) || 0));
  if (user.fragments >= FRAGMENT_SYNTH_THRESHOLD) addFragments(user, 0, now);
  return removed;
}

// ---- §5-1 碎片累加与自动合成 ----

/**
 * 碎片累加 + 满 10 立即合成（§5-1-2/3）：`fragments += n` → 每满 10 立即合成 1 颗籽
 * （每颗一个新 SeedLot：365 天、`source='fragment_synth'`），碎片取余；合成写一条 `fragment_synth` 流水。
 * 合成与碎片累加在同一份 user 记录内完成——不存在「碎片 10 个、籽未生成」的中间态。
 * @returns {{fragments:number, synthesized:number, seed_lots:object[]}}
 */
export function addFragments(user, n, now = new Date()) {
  const add = Math.max(0, Math.floor(Number(n) || 0));
  user.fragments = Math.max(0, Math.floor(Number(user.fragments) || 0)) + add;
  const seed_lots = [];
  while (user.fragments >= FRAGMENT_SYNTH_THRESHOLD) {
    user.fragments -= FRAGMENT_PER_SEED;
    seed_lots.push(addLot(user, 'seed', 1, { source: 'fragment_synth', now }));
  }
  if (seed_lots.length > 0) {
    recordTx(
      user,
      {
        type: 'fragment_synth',
        delta: { fragments: -seed_lots.length * FRAGMENT_PER_SEED, seeds: seed_lots.length },
        desc: `碎片满 ${FRAGMENT_SYNTH_THRESHOLD} 自动合成 ${seed_lots.length} 颗石榴籽`,
      },
      now,
    );
  }
  return { fragments: user.fragments, synthesized: seed_lots.length, seed_lots };
}

// ---- §5-2 FIFO 扣减 + 整单拒绝 ----

/**
 * FIFO 扣减（§5-2）：按 `expires_at` 升序取用；不足 → **抛 409 资产不足** 且**一颗粒都不取**
 * （绝不部分扣减、绝不透支为负）。
 * 扣减后 `qty=0` 的批次留在列表里，由下一次 `sweep` 移除（§5-2-3）。
 * @returns {{ok:true, taken:Array<{id:string,qty:number,expires_at:string}>, need:number, current:number}}
 */
export function chargeLots(lots, n, unit = 'seed') {
  const list = lots || [];
  const need = Math.max(0, Math.floor(Number(n) || 0));
  const current = sumLots(list);
  if (need === 0) return { ok: true, taken: [], need, current };
  if (current < need) throw assetInsufficient(need, current, unit);
  const taken = [];
  let left = need;
  for (const lot of [...list].sort(compareLotByExpiry)) {
    if (left <= 0) break;
    const take = Math.min(Math.max(0, Math.floor(Number(lot.qty) || 0)), left);
    if (take <= 0) continue;
    lot.qty -= take;
    left -= take;
    taken.push({ id: lot.id, qty: take, expires_at: lot.expires_at ?? null });
  }
  return { ok: true, taken, need, current: current - need };
}

// ---- §6-1 读口径（纯投影） ----

/**
 * 即将过期批次（§6-1 GET /assets/expiring）：默认 30 天内到期的籽 / 竹片批次，按到期升序。
 * @returns {Array<{asset:'seed'|'bamboo', lot_id:string, qty:number, expires_at:string, days_left:number}>}
 */
export function expiringItems(user, now = new Date(), days = EXPIRING_DEFAULT_DAYS) {
  const nowMs = toMs(now);
  const d = Number(days);
  const limit = nowMs + (Number.isFinite(d) && d >= 0 ? d : EXPIRING_DEFAULT_DAYS) * DAY_MS;
  const items = [];
  for (const asset of ['seed', 'bamboo']) {
    for (const lot of user[LOT_KEY[asset]] || []) {
      if (!lot || !lot.expires_at || Number(lot.qty) <= 0) continue;
      const expMs = Date.parse(lot.expires_at);
      if (!Number.isFinite(expMs) || expMs > limit) continue;
      items.push({
        asset,
        lot_id: lot.id,
        qty: Math.floor(Number(lot.qty)),
        expires_at: lot.expires_at,
        days_left: Math.max(0, Math.ceil((expMs - nowMs) / DAY_MS)),
      });
    }
  }
  return items.sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
}

/** 资产总览（§6-1 GET /assets/summary）：碎片（含上限）/ 籽（总量 + 批次数 + 明细）/ 竹片（总片数 + 折算束数 + 批次数）/ 玉（枚数 + 每枚 expires_at 或 null）/ 最近 50 条流水 */
export function summarize(user, now = new Date()) {
  const seeds_total = sumLots(user.seeds);
  const bamboos_total_pieces = sumLots(user.bamboos);
  return {
    fragments: Math.max(0, Math.floor(Number(user.fragments) || 0)),
    fragment_cap: FRAGMENT_CAP,
    seeds_total,
    seed_lot_count: (user.seeds || []).length,
    seed_lots: user.seeds || [],
    bamboos_total_pieces,
    bamboo_bundles: Math.floor(bamboos_total_pieces / 100),
    bamboo_lot_count: (user.bamboos || []).length,
    bamboo_lots: user.bamboos || [],
    jades_total: (user.jades || []).length,
    jades: (user.jades || []).map((j) => ({ ...j, permanent: j.expires_at === null })),
    signin_date: user.signin_date || '',
    expiring: expiringItems(user, now),
    txs: (user.txs || []).slice(-50).reverse(),
  };
}

// ---- IO 层（唯一写入路径，§5-7） ----

/** 同一手机号串行化队列（模式照 store.js 的 treeWriteLocks） */
const assetsLocks = new Map();

/**
 * 资产读改写（唯一 IO 入口）：读单文档 → 深拷贝上执行 mutator → 整体回写一次 `colSet`。
 * - mutator 抛错 → **一字节都不回写**（整单拒绝语义：409 后资产不变）
 * - 同一手机号串行化：并发调用按到达顺序排队，绝不丢更新 / 不重复扣费（§5-7-4）
 * @param {string} phone
 * @param {(user:object)=>any} mutator
 */
export async function withAssets(phone, mutator) {
  const lock = assetsLocks.get(phone) || Promise.resolve();
  const run = lock.then(async () => {
    const base = await colGet(ASSETS_COL, ASSETS_ID);
    const doc = base ? JSON.parse(JSON.stringify(base)) : { _id: ASSETS_ID, users: {} };
    const user = ensureUser(doc, phone);
    const result = await mutator(user);
    await colSet(ASSETS_COL, ASSETS_ID, doc);
    return result;
  });
  assetsLocks.set(phone, run.catch(() => {}));
  return run;
}

/** 写路径别名（语义化：一次 mutate = 一次整体回写） */
export const mutateAssets = withAssets;

/** 只读快照（不落盘；一切写入走 withAssets） */
export async function getAssets(phone) {
  const doc = await colGet(ASSETS_COL, ASSETS_ID);
  const cur = doc?.users?.[phone];
  return cur ? JSON.parse(JSON.stringify(cur)) : blankUser();
}
