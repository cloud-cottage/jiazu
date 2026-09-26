/**
 * 资产账本内核（P0）— 集合 jiazu_assets（单文档 _id='global'）
 *
 * 唯一真源：docs/economy.spec.md
 *   §3 四类资产定义 / §4-1 存储契约 / §4-6 枚举
 *   §5-1 碎片上限 9 与自动合成 / §5-2 FIFO + 整单拒绝 / §5-3 有效期 / §5-4 惰性结算 / §5-7 唯一写入路径与原子性
 *   §15 物品域扩展（兰帖残页 `scroll_fragments` 上限 99 + 满 100 自动合成；兰帖批次 `scrolls` 恒永久；
 *     1 张 = 100 片 = 1 行囊格；分解 1 张返 99 碎片，避开「分解即合成」回环）
 *
 * **已知限制（总监 2026-09-16 拍板：暂不改，部署前重构）**：资产集合当前为**全体用户共用单文档**
 * `_id='global'`，并发保护**仅进程内锁**（下方 `assetsLocks`，同实例内已串行化）——**云端多实例并发会丢更新 / 双花**。
 * 部署前**必须**重构为「**每手机号一文档 + version 乐观锁（CAS）重试**」，本限制登记见 docs/PENDING_DEPLOY.md。
 *
 * 分层（纯函数与 IO 分离，便于单测）：
 *   - 纯函数（只操作传入的 user 记录，无 IO）：sweep / addFragments / addScrollFragments / decomposeScroll /
 *     chargeLots / addLot / sumLots / recordTx / nextLotId / beijingDate / summarize / expiringItems
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

// ---- §15-2 / §15-3 兰帖域常量（R-2 / R-6 / R-7 / R-9；既有常量取值一律不动） ----

/** 兰帖残页上限（§15-2 · R-2） */
export const SCROLL_FRAGMENT_CAP = 99;
/** 兰帖残页自动合成阈值：满此数立即合成 1 张成品兰帖、碎片取余（§15-2 / §15-4 · R-2） */
export const SCROLL_FRAGMENT_SYNTH_THRESHOLD = 100;
/** 每张成品兰帖的片数（= 1 个行囊格；换算 `floor(Σqty / 本值)`，§15-3 / §15-6② · R-6 / R-11） */
export const SCROLL_PIECES_PER_SCROLL = 100;
/** 兰帖分解返还：1 张 → 99 兰帖残页（留 1 片为损耗，避开「分解即合成」回环，§15-4 · R-7） */
export const SCROLL_DECOMPOSE_REFUND = 99;
/** 好友奖励产出（竹片 / 兰帖的批次来源新增取值，R-1 / R-3；登记要求见 §15-5②③） */
export const SOURCE_FRIEND_REWARD = 'friend_reward';
/** 兰帖批次来源：兰帖残页满 100 自动合成（§15-5③；与 `Tx.type` 的 `scroll_synth` 同字面） */
export const SCROLL_SOURCE_SYNTH = 'scroll_synth';

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
  // P4（docs/economy.spec.md §15-5⑥ · R-10）追加兰帖物品域取值（命名不与既有 19 项重名）：
  //   `scroll_synth`（兰帖残页满 100 自动合成 1 张成品兰帖）、
  //   `scroll_decompose`（兰帖分解返还 99 碎片）。冲正仍只用既有 `fee_refund`。
  'scroll_synth',
  'scroll_decompose',
  // 好友域（裁定 1 · `lib/friend-ops.js` 续约双边扣减）：`scroll_consume`（兰帖消耗留痕）。
  // 冲正复用既有 `fee_refund`（唯一允许的冲正类型），本项**只此一处字面登记**（无运行期追加）。
  'scroll_consume',
];

export const ASSET_INSUFFICIENT = 'ASSET_INSUFFICIENT';

const DAY_MS = 86400000;
const ASSET_LABEL = { seed: '石榴籽', bamboo: '竹片', jade: '石榴籽玉', scroll: '兰帖' };
const ASSET_UNIT = { seed: '颗', bamboo: '片', jade: '枚', scroll: '片' };
const LOT_KEY = { seed: 'seeds', bamboo: 'bamboos', jade: 'jades', scroll: 'scrolls' };

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

/** 空资产记录（§4-1 + §15-2 / §15-3 追加字段；既有字段形状一字不改） */
function blankUser() {
  return { fragments: 0, scroll_fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' };
}

function ensureUser(doc, phone) {
  doc.users = doc.users || {};
  const cur = doc.users[phone];
  if (!cur) {
    doc.users[phone] = blankUser();
    return doc.users[phone];
  }
  // 外部值收口：`Number(x) || 0` 拦不住 Infinity ⇒ 一律走 toNonNegInt（显式判有限性）
  cur.fragments = toNonNegInt(cur.fragments);
  cur.scroll_fragments = toNonNegInt(cur.scroll_fragments);
  cur.seeds = cur.seeds || [];
  cur.bamboos = cur.bamboos || [];
  cur.jades = cur.jades || [];
  cur.scrolls = cur.scrolls || [];
  cur.txs = cur.txs || [];
  cur.signin_date = cur.signin_date || '';
  return cur;
}

// ---- 错误：资产不足（409，整单拒绝） ----

/**
 * 资产不足错误：`status=409` / `code='ASSET_INSUFFICIENT'` / `need` / `current` / `unit`
 * 文案：「资产不足，需 X颗石榴籽，当前 Y 颗」（竹片用「片」）。
 *
 * 籽域口径（docs/economy-fee.spec.md §8 建树行 / 用户拍板）：数字与量词**连写** —— 建树籽不足报
 * 「资产不足，需 9颗石榴籽，当前 N 颗」，不带空格、不带「完整」；竹片 / 玉域沿用既有「X 片竹片」
 * 空格写法（该行文案真源未变，勿混改）。`need` / `current` / `unit` 字段语义与取值一律不变。
 */
export function assetInsufficient(need, current, unit = 'seed') {
  const key = ASSET_LABEL[unit] ? unit : 'seed';
  const label = ASSET_LABEL[key];
  const u = ASSET_UNIT[key];
  const needText = key === 'seed' ? `${need}${u}${label}` : `${need} ${u}${label}`;
  const e = new Error(`资产不足，需 ${needText}，当前 ${current} ${u}`);
  e.status = 409;
  e.code = ASSET_INSUFFICIENT;
  e.need = need;
  e.current = current;
  e.unit = unit;
  return e;
}

// ---- §4-1 批次 / 流水构造 ----

/**
 * 收口：把**外部值**收成非负整数（脏数据口径，§5-1 / §15-2 全库同一处）。
 *
 * **必须先判有限性**：`Math.max(0, Math.floor(Number(x) || 0))` 拦不住 `Infinity` —— 云端 / 前端随意写进来的
 * JSON 文本 `1e999` 经 `JSON.parse` 即得 `Infinity`，`Number(Infinity) || 0` 仍是 `Infinity`、
 * `Math.floor(Infinity)` 仍是 `Infinity`，会**原样穿过**收口表达式：下游既把它当数量累加，
 * 又把它当循环界（`while (v >= 阈值)` 恒真）⇒ 无界循环直至堆耗尽（实测 SIGABRT / rc=-6）。
 * 故 `Infinity` / `-Infinity` / `NaN` / 非法值一律归 0；负数归 0；有限值向下取整。
 */
export function toNonNegInt(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return n > 0 ? Math.floor(n) : 0;
}

/** 批次求和（籽的颗数 / 竹片的片数；收口所有非法 / 非有限值，绝不为负） */
export function sumLots(lots) {
  let total = 0;
  for (const lot of lots || []) total += toNonNegInt(lot?.qty);
  return total;
}

/**
 * 追加批次：seed / bamboo（qty 以「颗 / 片」计，`expires_at = now + 365 天`）、
 * jade（无 qty；**`expires_at` 必须由调用方显式传入**——`null` = 永久（仅限已判定为永久时）、
 * ISO 时刻 = 有期限。**无「默认永久」口径**（§4-1 / §11-3），缺省即抛错。
 * scroll（qty 以**片**计；**`expires_at` 恒为 `null`（永久）且必须由调用方显式传入** ——
 * 照玉的纪律（§15-3 / §11-3）：缺省即抛错、传有期限值亦抛错，**绝无「默认永久」**）。
 * @returns {object} 新批次
 */
export function addLot(user, kind, qty, opts = {}) {
  const key = LOT_KEY[kind];
  if (!key) throw new Error(`未知资产类型：${kind}`);
  const now = opts.now ? new Date(opts.now) : new Date();
  let lot;
  if (kind === 'scroll') {
    if (opts.expires_at === undefined) {
      throw new Error('兰帖批次必须显式指定 expires_at（恒为 null = 永久，§15-3）');
    }
    if (opts.expires_at !== null) {
      throw new Error('兰帖批次 expires_at 恒为 null（永久，§15-3）：不接受有期限值');
    }
    lot = {
      id: opts.id || nextLotId('sc'),
      qty: toNonNegInt(qty),
      expires_at: null,
      source: opts.source || '',
      created_at: toIso(now),
    };
  } else if (kind === 'jade') {
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
      qty: toNonNegInt(qty),
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
 * - 兰帖（`scrolls`，§15-3 / R-8）：**无期限 —— 无论 `now` 推多远一律不剔除**（`expires_at` 恒 `null`）；
 *   仅做**脏数据收口**（`qty` 非法 / `NaN` / 负数 / 已扣尽一律归 0 就地剔除，**不写流水**）；
 * - 收口不变量 `0 ≤ fragments ≤ 9` 与 `0 ≤ scroll_fragments ≤ 99`（脏数据里越界的碎片顺带立即合成，
 *   不落中间态）。
 * @returns {Array<{asset:string, lot_id:string, qty:number, expires_at:string}>} 被剔除的批次
 */
export function sweep(user, now = new Date()) {
  const removed = [];
  for (const kind of ['seed', 'bamboo']) {
    const key = LOT_KEY[kind];
    const kept = [];
    for (const lot of user[key] || []) {
      if (!lot) continue;
      // 脏数据收口：非法 / NaN / 负数 / **非有限（Infinity，如 JSON 文本 1e999）** 一律归 0（就地剔除，
      // 不写流水），绝不让 NaN / Infinity 流进 removed 与 expire 流水 —— 必须显式判有限性（判据 C）
      const qty = toNonNegInt(lot.qty);
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

  // 兰帖（R-8）：无期限 → 不参与到期剔除；仅脏数据收口（qty 非法 / NaN / 负数 / 已扣尽 → 归 0 就地剔除，
  // 不写流水；removed 与 expire 流水的 delta 绝不出现 null / NaN）
  const scrolls = [];
  for (const lot of user.scrolls || []) {
    if (!lot) continue;
    const qty = toNonNegInt(lot.qty);
    if (qty <= 0) continue; // 脏数据（含 Infinity）/ 已扣尽 → 就地剔除（不写流水）
    lot.qty = qty;
    scrolls.push(lot); // 恒永久：不判 expires_at（R-8）
  }
  user.scrolls = scrolls;

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

  // 标量碎片收口（判据 C）：非法 / 非有限（Infinity，如 JSON 1e999）一律归 0 —— 绝不让 Infinity 走到
  // 下面的自动合成分支（那里以该值为循环界）
  user.fragments = toNonNegInt(user.fragments);
  if (user.fragments >= FRAGMENT_SYNTH_THRESHOLD) addFragments(user, 0, now);
  // 兰帖残页同口径收口（R-2 / R-13）：0 ≤ scroll_fragments ≤ 99，越界顺带立即合成，不落中间态
  user.scroll_fragments = toNonNegInt(user.scroll_fragments);
  if (user.scroll_fragments >= SCROLL_FRAGMENT_SYNTH_THRESHOLD) addScrollFragments(user, 0, now);
  return removed;
}

// ---- §5-1 碎片累加与自动合成 ----

/**
 * 碎片累加 + 满 10 立即合成（§5-1-2/3）：`fragments += n` → 每满 10 立即合成 1 颗籽
 * （每颗一个新 SeedLot：365 天、`source='fragment_synth'`），碎片取余；合成写一条 `fragment_synth` 流水。
 * 合成与碎片累加在同一份 user 记录内完成——不存在「碎片 10 片、籽未生成」的中间态。
 * @returns {{fragments:number, synthesized:number, seed_lots:object[]}}
 */
export function addFragments(user, n, now = new Date()) {
  const add = toNonNegInt(n);
  user.fragments = toNonNegInt(user.fragments) + add;
  const seed_lots = [];
  // **一次性结算**（Zang 裁定 (b) / 判据 C）：合成次数 = floor(碎片 / 阈值)，**先把有界整数算出来**，再落 times 次批次；
  // 不再「改完再重读自己」（`while (user.fragments >= 阈值)` 在字段为 Infinity 时恒真 ⇒ 无界循环直至堆耗尽）。
  // 上面两句已把 user.fragments 收口为**有限非负整数** ⇒ times 必为有限整数，迭代次数有界。
  const times = Math.floor(user.fragments / FRAGMENT_SYNTH_THRESHOLD);
  if (times > 0) {
    user.fragments -= times * FRAGMENT_PER_SEED;
    for (let i = 0; i < times; i += 1) {
      seed_lots.push(addLot(user, 'seed', 1, { source: 'fragment_synth', now }));
    }
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

// ---- §15-2 / §15-4 兰帖残页累加 · 自动合成 · 分解（R-2 / R-6 / R-7 / R-13） ----

/**
 * 兰帖残页累加 + 满 100 立即合成（R-2 / R-13，与 `addFragments` 逐条同构）：
 * `scroll_fragments += n` → 每满 100 立即合成 1 张成品兰帖（每张一个新 ScrollLot：100 片、
 * `expires_at = null`（永久，**显式传入**）、`source = 'scroll_synth'`），碎片取余；合成写一条
 * `scroll_synth` 流水（`delta` 含 `scroll_fragments` 与 `scrolls` **两个键**的变动量）。
 * 累加与合成在同一份 user 记录内**一次完成** —— **不存在「碎片 100 片、兰帖未生成」的中间态**。
 * @returns {{scroll_fragments:number, synthesized:number, scroll_lots:object[]}}
 */
export function addScrollFragments(user, n, now = new Date()) {
  const add = toNonNegInt(n);
  user.scroll_fragments = toNonNegInt(user.scroll_fragments) + add;
  const scroll_lots = [];
  // **一次性结算**（同 addFragments，Zang 裁定 (b)）：times = floor(碎片 / 100) 先算后落，循环次数由有界整数
  // 决定；不再 `while (user.scroll_fragments >= 阈值)` 重读自己（Infinity 时该条件恒真 ⇒ 无界循环）。
  const times = Math.floor(user.scroll_fragments / SCROLL_FRAGMENT_SYNTH_THRESHOLD);
  if (times > 0) {
    user.scroll_fragments -= times * SCROLL_FRAGMENT_SYNTH_THRESHOLD;
    for (let i = 0; i < times; i += 1) {
      scroll_lots.push(
        addLot(user, 'scroll', SCROLL_PIECES_PER_SCROLL, {
          source: SCROLL_SOURCE_SYNTH,
          expires_at: null, // §15-3：永久必须显式传入，绝无「默认永久」
          now,
        }),
      );
    }
    recordTx(
      user,
      {
        type: 'scroll_synth',
        delta: {
          scroll_fragments: -scroll_lots.length * SCROLL_FRAGMENT_SYNTH_THRESHOLD,
          scrolls: scroll_lots.length * SCROLL_PIECES_PER_SCROLL,
        },
        desc: `兰帖残页满 ${SCROLL_FRAGMENT_SYNTH_THRESHOLD} 自动合成 ${scroll_lots.length} 张兰帖`,
      },
      now,
    );
  }
  return { scroll_fragments: user.scroll_fragments, synthesized: scroll_lots.length, scroll_lots };
}

/**
 * 兰帖分解（R-7）：`n` 张成品兰帖（每张 = 100 片）→ 返还 `n × 99` 兰帖残页（每张留 1 片为损耗）。
 * - **为什么返 99 而不是 100（R-7 理由）**：返还 100 片会在返还瞬间触发「满 100 自动合成」⇒ 分解成为
 *   **空操作**（分完又合回去）；返 99 片即可避开「分解即合成」回环。**与玉的免费无损耗口径并存、不互套**
 *   （玉产出籽批次不触发自动合成，兰帖产出碎片标量会触发）。
 * - 唯一删除条件 = **数量不足**：`Σ scrolls[].qty < n × 100` → **409 整单拒绝**（一片不扣、不返还、无流水）。
 * - 扣减走 `chargeLots`（`qty=0` 的批次留待下一次 `sweep` 移除，§5-2-3）；兰帖批次恒永久 → 排序全为 `null`。
 * @returns {{decomposed:number, pieces:number, refunded:number, scroll_fragments:number, synthesized:number, taken:object[]}}
 */
export function decomposeScroll(user, n = 1, now = new Date()) {
  const count = toNonNegInt(n); // 外部值收口（判据 C）：非有限 / 非法一律归 0
  const pieces = count * SCROLL_PIECES_PER_SCROLL;
  const charged = chargeLots(user.scrolls || [], pieces, 'scroll'); // 不足 → 抛 409，一单不拆
  const refunded = count * SCROLL_DECOMPOSE_REFUND;
  if (count > 0) {
    recordTx(
      user,
      {
        type: 'scroll_decompose',
        delta: { scroll_fragments: refunded, scrolls: -pieces },
        desc: `分解 ${count} 张兰帖（${pieces} 片），返还 ${refunded} 片兰帖残页（损耗 ${count} 片）`,
      },
      now,
    );
  }
  const after = addScrollFragments(user, refunded, now);
  return {
    decomposed: count,
    pieces,
    refunded,
    scroll_fragments: after.scroll_fragments,
    synthesized: after.synthesized,
    taken: charged.taken,
  };
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
  const need = toNonNegInt(n); // 外部值收口（判据 C）：非有限一律归 0 ⇒ 不会凭 Infinity 触发扣减
  const current = sumLots(list);
  if (need === 0) return { ok: true, taken: [], need, current };
  if (current < need) throw assetInsufficient(need, current, unit);
  const taken = [];
  let left = need;
  for (const lot of [...list].sort(compareLotByExpiry)) {
    if (left <= 0) break;
    const take = Math.min(toNonNegInt(lot.qty), left);
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
      // 收口先于一切判断：qty 为 Infinity / NaN / 非法一律当 0（绝不进 expiring 投影）
      const qty = toNonNegInt(lot?.qty);
      if (!lot || !lot.expires_at || qty <= 0) continue;
      const expMs = Date.parse(lot.expires_at);
      if (!Number.isFinite(expMs) || expMs > limit) continue;
      items.push({
        asset,
        lot_id: lot.id,
        qty,
        expires_at: lot.expires_at,
        days_left: Math.max(0, Math.ceil((expMs - nowMs) / DAY_MS)),
      });
    }
  }
  return items.sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at));
}

/**
 * 资产总览（§6-1 `GET /assets/summary` 的用户面口径；后台运维面见 `opts.include_mounted`）。
 *
 * 玉归属（口径 v6）：
 * - **用户面（缺省）**：**已镶嵌玉不再属于个人**（`mounted_tree_id` 非空 = 归属家族树、凹槽永久占用）
 *   ⇒ 只出未镶嵌玉，`jades_total` 同口径。原始记录保留、不迁移、不删除——`jiazu_assets` 里那条带
 *   `mounted_tree_id` 的玉记录原样留着，供 `/spirit` 注入者反查与凹槽去向追溯。
 * - **后台运维面（`{ include_mounted: true }`，仅 `GET /admin/assets/user`）**：出**全量原始记录**
 *   （含已镶嵌、保留 `mounted_tree_id`），后台要能看到「玉去哪了、镶进了哪棵树」。
 *
 * §15 兰帖域新增出参（R-11，**只增字段、既有出参字段名与形状一字不改**）：`scroll_fragments`、
 * `scroll_fragment_cap`、`scrolls_total_pieces`、`scrolls_item_count`（向下取整整格数）、`scroll_lot_count`、
 * `scroll_lots`（原始批次数组，不经筛选、不增删字段）。
 *
 * @param {object} user
 * @param {Date} [now]
 * @param {{include_mounted?:boolean}} [opts]
 */
export function summarize(user, now = new Date(), opts = {}) {
  const seeds_total = sumLots(user.seeds);
  const bamboos_total_pieces = sumLots(user.bamboos);
  const scroll_lots = user.scrolls || [];
  const scrolls_total_pieces = sumLots(scroll_lots);
  const jades = (user.jades || []).filter((j) => j && (opts.include_mounted || !j.mounted_tree_id));
  return {
    fragments: toNonNegInt(user.fragments),
    fragment_cap: FRAGMENT_CAP,
    seeds_total,
    seed_lot_count: (user.seeds || []).length,
    seed_lots: user.seeds || [],
    bamboos_total_pieces,
    bamboo_bundles: Math.floor(bamboos_total_pieces / 100),
    bamboo_lot_count: (user.bamboos || []).length,
    bamboo_lots: user.bamboos || [],
    // ---- §15-2 / §15-3 / §15-6② 兰帖域新增出参（R-11；既有出参字段名与形状一字未改） ----
    scroll_fragments: toNonNegInt(user.scroll_fragments),
    scroll_fragment_cap: SCROLL_FRAGMENT_CAP,
    scrolls_total_pieces,
    // 行囊整格数 = 向下取整（每 100 片 = 1 格；余数不占整格，展示层单行呈现）
    scrolls_item_count: Math.floor(scrolls_total_pieces / SCROLL_PIECES_PER_SCROLL),
    scroll_lot_count: scroll_lots.length,
    scroll_lots,
    jades_total: jades.length,
    jades: jades.map((j) => ({ ...j, permanent: j.expires_at === null })),
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
