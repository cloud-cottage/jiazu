/**
 * 时流子域内核（P2 第一段 · 纯模块，不含路由）— 集合 jiazu_spirit（单文档 `_id='global'`）
 *
 * 唯一真源：docs/spirit-domain.spec.md（时流子域）+ docs/economy.spec.md（存储契约 / 枚举 / 算法）
 *   §3-1 存储契约（jiazu_spirit.trees / SpiritLog）/ §3-3 常量 / §4 四态状态机（7 条迁移）
 *   §5-1 合成三态判定 / §5-2 分解 / §5-3 镶嵌（凹槽唯一 · 不可逆）/ §6-2 五档蓄能表
 *   §6-3 扣费与叠加 / §6-4 临时活动赠送开关 / §7 读口径（logs 成员可见）
 *
 * 分层（纯函数与 IO 分离，便于单测）：
 *   - 纯函数：settle / chargeBase / planOf / giftBundlesOf / giftPiecesOf / plansPayload / stateTextOf
 *   - IO 层：withSpirit（**按 tree_id 串行化**，模式照 economy-ledger.js 的 assetsLocks）+
 *     synthesizeJade / decomposeJade / mountJade / chargeSpirit / spiritInfo / readSpiritEntry / settleAllTrees
 *
 * **不重写第二套算法**：FIFO 扣减 / 整单拒绝 / sweep / 批次与流水读写全部复用
 * lib/economy-ledger.js（chargeLots / addLot / sumLots / sweep / recordTx / withAssets / getAssets /
 * assetInsufficient）；本模块只做「时流子域判定 + 编排」。
 *
 * 锁顺序（**不得颠倒**，防死锁）：`spirit(tree_id) → assets(phone)`；
 * 无任何路径先持 assets 锁再取 spirit 锁。跨集合（jiazu_assets + jiazu_spirit）无事务 API：
 * 先写临界区一侧，第二侧失败 → 用快照回滚第一侧（与 store.updateTrees 的「顺序写 + 失败回滚」口径一致）。
 *
 * 已知限制（与 economy-ledger 同批）：`jiazu_spirit` 同为全体家族树共用单文档 + 仅进程内串行锁，
 * 云端多实例并发可丢更新（登记 docs/PENDING_DEPLOY.md，部署前随资产集合一并重构）。
 */

import { colGet, colSet, getMeta } from './store.js';
import {
  ASSETS_COL,
  ASSETS_ID,
  BAMBOO_TTL_DAYS,
  SEED_TTL_DAYS,
  addLot,
  assetInsufficient,
  chargeLots,
  getAssets,
  nextLotId,
  recordTx,
  summarize,
  sumLots,
  sweep,
  toNonNegInt,
  withAssets,
  beijingDate,
} from './economy-ledger.js';
import { getAnchor } from './scope.js';

// ---- 集合与常量（§3-1 / §3-3：改动先改总册本册） ----

export const SPIRIT_COL = 'jiazu_spirit';
export const SPIRIT_ID = 'global';
/** 账号集合（注入者昵称来源；与 economy-ops.js 同名单点） */
const USERS_COL = 'jiazu_users';
/** 锚点集合（注入者本树节点来源；与 scope.js 同名单点） */
const ANCHORS_COL = 'jiazu_anchors';
/** 中华世本（无时流子域凹槽，§3-3 TREE_ID_MASTER） */
export const MASTER_TREE_ID = process.env.MASTER_TREE_ID || 'zhonghua';

/** 缓冲期长度（天，§3-3） */
export const BUFFER_DAYS = 30;
/** 永久判定阈值（天，§5-1：参与籽**全部**剩余 ≥ 360 天 → 永久） */
export const PERMANENT_THRESHOLD_DAYS = 360;
/** 合成一枚玉的固定消耗 / 分解固定返还（颗，§3-3 SEED_COST） */
export const JADE_SYNTH_SEEDS = 999;
/** 籽的统一有效期（天，分解产籽同样 365 天；**无永久籽**） */
export { SEED_TTL_DAYS };
/** 赠送竹片有效期（天，§6-4） */
export const BAMBOO_DAYS = BAMBOO_TTL_DAYS;
/** 1 束 = 100 片（**存储一律以片计**，§3-3） */
export const BAMBOO_PER_BUNDLE = 100;
/** `GET /spirit` 的 logs 出参上限（最近 N 条、倒序，§7-3） */
export const SPIRIT_LOG_LIMIT = 100;
/** 四态枚举（§4-1） */
export const SPIRIT_STATUSES = ['inactive', 'active', 'buffer', 'expired'];
/** 临时活动赠送开关的环境变量名（逗号分隔档位列表；缺省未设 = 关闭，§6-4） */
export const SPIRIT_GIFT_ACTIVITY_ENV = 'SPIRIT_GIFT_ACTIVITY';

const DAY_MS = 86400000;

/** 缺 tree_id 文案（§6-6） */
export const ERR_MISSING_TREE_ID = '缺少 tree_id';
/** 缺 jade_id 文案（§6-6） */
export const ERR_MISSING_JADE_ID = '缺少 jade_id';
export const ERR_TREE_NOT_FOUND = '家族树不存在';
export const ERR_MASTER_NO_SLOT = '中华世本无时流子域凹槽';
export const ERR_JADE_NOT_FOUND = '未找到该石榴籽玉';
export const ERR_JADE_MOUNTED = '该石榴籽玉已镶嵌，不可重复使用';
export const ERR_SLOT_TAKEN = '该家族树凹槽已镶嵌石榴籽玉';
export const ERR_NO_JADE_ON_TREE = '该家族树尚未镶嵌石榴籽玉，无法灌注玉露灵泽';
export const ERR_JADE_MOUNTED_DECOMPOSE = '已镶嵌的石榴籽玉不可分解';
export const ERR_PLAN_INVALID = '不支持的蓄能档位';
export const NOTICE_LOGIN_REQUIRED = '请先登录后查看灵泽蓄能流水';
export const NOTICE_MEMBER_ONLY = '灵泽蓄能流水仅家族成员可查看';

// ---- 蓄能五档表（**§6-2 定稿数值唯一真源**；折扣列仅展示、不参与任何计算） ----

/**
 * 五档蓄能表（§6-2）。字段：
 *   `seeds`              实价（籽，**唯一扣费依据**；不得由折扣反推、不得取整）
 *   `days`               延长天数
 *   `gift_bundles`       **常态**赠送（束；`half_year` = 2 / `yearly` = 8）
 *   `activity_bundles`   **临时活动**赠送上限（束；仅 `quarterly` = 1，受 SPIRIT_GIFT_ACTIVITY 开关约束）
 *   `discount`           营销展示折扣（不参与计算）
 *   `activity_min_discount` 未来活动价格下限（本轮仅登记，不开展活动）
 */
export const SPIRIT_PLANS = [
  { plan: 'daily', label: '单日', seeds: 1, days: 1, gift_bundles: 0, activity_bundles: 0, discount: '100%', activity_min_discount: null },
  { plan: 'monthly', label: '月度', seeds: 29, days: 30, gift_bundles: 0, activity_bundles: 0, discount: '97%', activity_min_discount: null },
  { plan: 'quarterly', label: '季度', seeds: 109, days: 90, gift_bundles: 0, activity_bundles: 1, discount: '91%', activity_min_discount: '83%' },
  { plan: 'half_year', label: '半年度', seeds: 149, days: 180, gift_bundles: 2, activity_bundles: 0, discount: '83%', activity_min_discount: '72%' },
  { plan: 'yearly', label: '年度', seeds: 299, days: 365, gift_bundles: 8, activity_bundles: 0, discount: '82%', activity_min_discount: '60%' },
];

/** 档位 → 表项（不在五档内 → null） */
export function planOf(plan) {
  return SPIRIT_PLANS.find((p) => p.plan === plan) || null;
}

/** 临时活动已开启的档位列表（`SPIRIT_GIFT_ACTIVITY` 逗号分隔；缺省未设 = 关闭，§6-4） */
export function giftEnabledPlans(env) {
  const src = env === undefined ? process.env : env || {};
  const raw = src[SPIRIT_GIFT_ACTIVITY_ENV];
  return String(raw === undefined || raw === null ? '' : raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 本次实际赠送**束**数（常态化赠送 + 受开关放行的活动赠送） */
export function giftBundlesOf(plan, env) {
  const P = planOf(plan);
  if (!P) return 0;
  let bundles = P.gift_bundles;
  if (P.activity_bundles > 0 && giftEnabledPlans(env).includes(plan)) bundles += P.activity_bundles;
  return bundles;
}

/** 本次实际赠送**片**数（束 × 100；存储一律以片计） */
export function giftPiecesOf(plan, env) {
  return giftBundlesOf(plan, env) * BAMBOO_PER_BUNDLE;
}

/** `GET /spirit` 的 `plans` 出参（**单一真源**，前端不得硬编码数值，§6-2 / §8-2） */
export function plansPayload(env) {
  const enabled = giftEnabledPlans(env);
  return SPIRIT_PLANS.map((P) => {
    const bundles = giftBundlesOf(P.plan, env);
    return {
      plan: P.plan,
      label: P.label,
      seeds: P.seeds,
      days: P.days,
      gift_bundles: bundles,
      gift_pieces: bundles * BAMBOO_PER_BUNDLE,
      discount: P.discount,
      activity_min_discount: P.activity_min_discount,
      activity: enabled.includes(P.plan),
    };
  });
}

/** `GET /spirit` 的 `activity` 出参（前端「限时活动」标签判定，§6-4） */
export function activityPayload(env) {
  return { gift_enabled_plans: giftEnabledPlans(env) };
}

// ---- 基础工具 ----

const toMs = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const isoOf = (d) => new Date(toMs(d)).toISOString();
const isoPlusDays = (from, days) => new Date(toMs(from) + days * DAY_MS).toISOString();

/** 业务错误（有 status、无 code → 路由 catch 保持既有 4xx 语义） */
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** 籽不足（409）——保持账本内核口径（code=`ASSET_INSUFFICIENT` / `need` / `current` / `unit`），只换业务文案 */
function seedsInsufficient(need, current, message) {
  const e = assetInsufficient(need, current, 'seed');
  if (message) e.message = message;
  return e;
}

/** SpiritLog id（§3-1：`spl_<毫秒时间戳>_<6 位随机>`，沿用 wallet.js 的 id 风格） */
export function spiritLogId() {
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, '0').slice(0, 6);
  return `spl_${Date.now()}_${rand}`;
}

/** 空集合文档 */
function blankSpiritDoc() {
  return { _id: SPIRIT_ID, trees: {} };
}

/** 玉是否已过期（§5-4 sweep 口径：`expires_at=null` = 永久，恒不过期） */
function jadeExpired(jade, now) {
  if (!jade || jade.expires_at === null || jade.expires_at === undefined || jade.expires_at === '') return false;
  const t = Date.parse(jade.expires_at);
  return Number.isFinite(t) && t <= toMs(now);
}

// ---- §4-4 状态机（四态 · 纯函数 · 惰性推进） ----

/**
 * `settle(entry, now)`——按当前时间推进四态（§4-4 纯函数，**不依赖定时任务**、不写 IO）。
 *
 * - `!entry || !entry.jade` → 未镶嵌，不进四态，返回 `false`（不创建记录）；
 * - `spirit_expires_at` 为空 → `inactive`（`buffer_until = null`）；
 * - `now < exp` → `active`；`exp < now < exp + 30 天` → `buffer`（`buffer_until = exp + 30 天`）；
 * - `now >= exp + 30 天` → `expired`（`buffer_until` 保留已过去的截止时刻，供追溯）。
 *
 * @returns {boolean} 字段是否发生变化（调用方据此决定是否写回）
 */
export function settle(entry, now = new Date()) {
  if (!entry || !entry.jade) return false;
  const nowMs = toMs(now);
  const expMs = entry.spirit_expires_at ? Date.parse(entry.spirit_expires_at) : NaN;
  let status;
  let buffer_until;
  if (!Number.isFinite(expMs)) {
    // 从未灌注（或脏值）→ inactive（无到期日即无缓冲，§4-2：不存在 inactive → buffer）
    status = 'inactive';
    buffer_until = null;
  } else {
    const bufMs = expMs + BUFFER_DAYS * DAY_MS;
    if (nowMs < expMs) {
      status = 'active';
      buffer_until = null;
    } else if (nowMs < bufMs) {
      status = 'buffer';
      buffer_until = new Date(bufMs).toISOString();
    } else {
      status = 'expired';
      buffer_until = new Date(bufMs).toISOString();
    }
  }
  const changed = entry.status !== status || (entry.buffer_until || null) !== buffer_until;
  entry.status = status;
  entry.buffer_until = buffer_until;
  return changed;
}

/** 四态文案（§4-6 · 非定稿可调；展示日期按北京时间 UTC+8 折算） */
export function stateTextOf(status, opts = {}) {
  const daysLeft = toNonNegInt(opts.days_left);
  const bufferDaysLeft = toNonNegInt(opts.buffer_days_left);
  switch (status) {
    case 'inactive':
      return { primary: '时流子域 · 未激活', secondary: '灌注玉露灵泽即可开启' };
    case 'active':
      return { primary: `灵气充盈 · 剩余 ${daysLeft} 天`, secondary: `灵气到期日 ${opts.expires_date || ''}` };
    case 'buffer':
      return { primary: `灵气已尽 · 缓冲期剩余 ${bufferDaysLeft} 天`, secondary: `缓冲期至 ${opts.buffer_date || ''}，续期可恢复` };
    case 'expired':
      return { primary: '时流子域已停用', secondary: '灌注玉露灵泽可重新激活（数据保留）' };
    default:
      return { primary: '未开启时流子域', secondary: '镶嵌石榴籽玉，解锁本家族专属空间' };
  }
}

/** 叠加顺延基期（§6-3）：`max(now, 原 spirit_expires_at)`；无原值 / 原值已过 → `now` */
export function chargeBase(spiritExpiresAt, now = new Date()) {
  const nowMs = toMs(now);
  const expMs = spiritExpiresAt ? Date.parse(spiritExpiresAt) : NaN;
  return Number.isFinite(expMs) && expMs > nowMs ? expMs : nowMs;
}

/**
 * 叠加顺延后的新到期时刻（§6-3 三态统一式）：
 * `active` 原值未来 → 原值 + days；`buffer` / `expired` / `inactive` → now + days。
 * **绝不覆盖、绝不缩短**（新值恒 ≥ `now + days`）。
 */
export function chargeNextExpiry(spiritExpiresAt, days, now = new Date()) {
  const d = Math.max(0, Number(days) || 0);
  return new Date(chargeBase(spiritExpiresAt, now) + d * DAY_MS).toISOString();
}

// ---- 读权限（§7-2：成员口径复用 jiazu_anchors + tree-access 的 member 判定） ----

/**
 * 访问者是否为该树成员（§7-2）：`chief_editor` 全局角色视为成员；
 * 其余按锚点判定（`jiazu_anchors[phone].tree_id === tree_id`，与 `tree-access.computeAccess` 的 `member` 同源）。
 * guest（无 phone）→ `false`。
 */
export async function isTreeMember(treeId, viewer) {
  const v = viewer || {};
  if (v.role === 'chief_editor') return true;
  if (!v.phone) return false;
  const anchor = await getAnchor(v.phone);
  return !!(anchor && anchor.tree_id === treeId);
}

/** `GET /spirit` 的访问者权限口径（K1：已登录即可灌注） */
export async function viewerPolicy(treeId, viewer) {
  const v = viewer || {};
  const logged = !!v.phone;
  const member = logged ? await isTreeMember(treeId, v) : false;
  const logsVisible = member;
  return {
    logged,
    member,
    logs_visible: logsVisible,
    can_charge: logged,
    logs_notice: logsVisible ? '' : logged ? NOTICE_MEMBER_ONLY : NOTICE_LOGIN_REQUIRED,
  };
}

// ---- tree-meta 校验 ----

/** `tree-meta` 登记读取：缺 tree_id → 400；树不存在 → 404（§6-6） */
export async function treeMetaOf(treeId) {
  if (!treeId) throw httpError(400, ERR_MISSING_TREE_ID);
  const meta = await getMeta();
  const t = meta?.trees?.[treeId];
  if (!t) throw httpError(404, ERR_TREE_NOT_FOUND);
  return t;
}

/** 该树是否可镶嵌玉（K2：`kind='family'` / `kind='clan'` 可；总谱 `kind='master'` 不可） */
export function mountableKind(tree) {
  const kind = tree?.kind || '';
  return kind === 'family' || kind === 'clan';
}

// ---- IO 层：按 tree_id 串行化（模式照 economy-ledger.js 的 assetsLocks） ----

const spiritLocks = new Map();

/**
 * 时流子域读改写（唯一 IO 入口）：读单文档 → 深拷贝 → **先 settle** → mutator → 整体回写一次 `colSet`。
 * - mutator 抛错 → **一字节都不回写**（整单拒绝语义）
 * - 同一 `tree_id` 串行化：并发调用按到达顺序排队（凹槽唯一性临界区，§5-3 原子性）
 * - 仅在 `settle` 有变化或 mutator 显式置 `ctx.dirty = true` 时才写回（只读入口无副作用）
 * @param {string} treeId
 * @param {(entry: object|null, ctx: {doc:object, now:Date, treeId:string, dirty:boolean}) => any} mutator
 * @param {Date} now
 */
export async function withSpirit(treeId, mutator, now = new Date()) {
  const lock = spiritLocks.get(treeId) || Promise.resolve();
  const run = lock.then(async () => {
    const base = await colGet(SPIRIT_COL, SPIRIT_ID);
    const doc = base ? JSON.parse(JSON.stringify(base)) : blankSpiritDoc();
    doc.trees = doc.trees || {};
    const entry = doc.trees[treeId] || null;
    const settled = settle(entry, now);
    const ctx = { doc, now, treeId, dirty: settled };
    const result = await mutator(entry, ctx);
    if (ctx.dirty) await colSet(SPIRIT_COL, SPIRIT_ID, doc);
    return result;
  });
  spiritLocks.set(treeId, run.catch(() => {}));
  return run;
}

/** 只读快照（惰性推进有变化时写回；不落业务副作用） */
export async function readSpiritEntry(treeId, now = new Date()) {
  return withSpirit(treeId, (entry) => (entry ? JSON.parse(JSON.stringify(entry)) : null), now);
}

/**
 * 其它资产入口的惰性推进（§4-4 触发点）：推进**全部**树记录，仅在真有变化时写回。
 * 最佳努力（不加锁）：与业务写入不构成临界区，冲突时下一次入口再推进一次。
 * @returns {Promise<string[]>} 发生变化的 tree_id 列表
 */
export async function settleAllTrees(now = new Date()) {
  const base = await colGet(SPIRIT_COL, SPIRIT_ID);
  if (!base || !base.trees) return [];
  const doc = JSON.parse(JSON.stringify(base));
  const changed = [];
  for (const [tid, entry] of Object.entries(doc.trees)) if (settle(entry, now)) changed.push(tid);
  if (changed.length > 0) await colSet(SPIRIT_COL, SPIRIT_ID, doc);
  return changed;
}

// ---- §5-1 合成石榴籽玉 ----

/**
 * 合成石榴籽玉（§5-1）：扣 **999 颗**籽（FIFO 最早到期优先，复用 `chargeLots` 整单拒绝），
 * 判定三态：
 *   - 参与籽**全部**剩余 ≥ 360 天（`now + 360 天 <= min(used.expires_at)`，**恰好 360 天算永久**）
 *     → `expires_at = null`（永久）；
 *   - 否则 → `expires_at` = 所用籽中**最早到期者的到期时刻原值**（不按天取整、不改写）。
 * 不足 999 → **409 整单拒绝**（一颗不扣、不产玉）；写流水 `type='jade_synth'`。
 *
 * @returns {Promise<{ok:true, jade_id:string, seeds_deducted:number, expires_at:string|null,
 *   permanent:boolean, seeds_used:Array<{lot_id:string, qty:number, expires_at:string|null}>}>}
 */
export async function synthesizeJade(phone, now = new Date()) {
  return withAssets(phone, async (user) => {
    sweep(user, now);
    let charge;
    try {
      charge = chargeLots(user.seeds, JADE_SYNTH_SEEDS, 'seed');
    } catch (err) {
      throw seedsInsufficient(
        JADE_SYNTH_SEEDS,
        err.current,
        `石榴籽不足：合成石榴籽玉需 ${JADE_SYNTH_SEEDS} 颗完整石榴籽，当前可用 ${err.current} 颗`,
      );
    }
    const seeds_used = charge.taken.map((t) => ({ lot_id: t.id, qty: t.qty, expires_at: t.expires_at ?? null }));
    // 扣尽批次就地移除（§5-2-3：不留 qty=0 残留批；不写流水）
    user.seeds = (user.seeds || []).filter((l) => toNonNegInt(l.qty) > 0);
    const earliestMs = seeds_used.reduce((min, t) => {
      const ms = t.expires_at ? Date.parse(t.expires_at) : Number.POSITIVE_INFINITY;
      return ms < min ? ms : min;
    }, Number.POSITIVE_INFINITY);
    const permanent = Number.isFinite(earliestMs) && toMs(now) + PERMANENT_THRESHOLD_DAYS * DAY_MS <= earliestMs;
    // addLot('jade') 必须显式传 expires_at（缺省抛错；null = 永久，仅限判定为永久时）
    const jade = addLot(user, 'jade', 1, {
      expires_at: permanent ? null : new Date(earliestMs).toISOString(),
      source: 'synthesis',
      now,
    });
    recordTx(
      user,
      {
        type: 'jade_synth',
        delta: { seeds: -JADE_SYNTH_SEEDS, jades: 1 },
        ref: {},
        desc: '合成石榴籽玉',
      },
      now,
    );
    return {
      ok: true,
      jade_id: jade.id,
      seeds_deducted: JADE_SYNTH_SEEDS,
      expires_at: jade.expires_at,
      permanent,
      seeds_used,
    };
  });
}

// ---- §5-2 分解石榴籽玉 ----

/**
 * 分解石榴籽玉（§5-2）：任意玉（**含永久玉**）免费分解、无损耗，
 * 移除该玉 + 返还 **999 颗籽单一新批次**（365 天、`source='jade_decompose'`）+ 流水 `jade_decompose`。
 * 守卫：玉不存在（含已过期）→ **404**；已镶嵌（`mounted_tree_id` 非空）→ **409**（**镶嵌不可逆，无反向路由**）。
 */
export async function decomposeJade(phone, jadeId, now = new Date()) {
  if (!jadeId) throw httpError(400, ERR_MISSING_JADE_ID);
  return withAssets(phone, async (user) => {
    sweep(user, now);
    const jade = (user.jades || []).find((j) => j.id === jadeId);
    if (!jade || jadeExpired(jade, now)) throw httpError(404, ERR_JADE_NOT_FOUND);
    if (jade.mounted_tree_id) throw httpError(409, ERR_JADE_MOUNTED_DECOMPOSE);
    user.jades = (user.jades || []).filter((j) => j.id !== jadeId);
    const lot = addLot(user, 'seed', JADE_SYNTH_SEEDS, { ttl_days: SEED_TTL_DAYS, source: 'jade_decompose', now });
    recordTx(
      user,
      {
        type: 'jade_decompose',
        delta: { jades: -1, seeds: JADE_SYNTH_SEEDS },
        ref: { jade_id: jadeId },
        desc: '分解石榴籽玉',
      },
      now,
    );
    return {
      ok: true,
      seeds_returned: JADE_SYNTH_SEEDS,
      seed_expires_at: lot.expires_at,
      seed_lot_id: lot.id,
      jade_id: jadeId,
    };
  });
}

// ---- §5-3 镶嵌石榴籽玉 ----

/**
 * 镶嵌石榴籽玉（§5-3）：每树**仅可镶 1 枚**；玉必须本人持有、未镶嵌；
 * 镶嵌后玉**永久销毁**（用户视角：不可取回 / 不可分解 / 不可二次使用）、凹槽**永久占用不释放**；
 * **不赠送初始灵气**（`status='inactive'`、`spirit_expires_at = null`、`logs = []`）。
 *
 * 原子性：**先写 `jiazu_spirit`（凹槽占用 = 唯一性临界区）再写 `jiazu_assets`**，
 * 第二步失败 → 用快照回滚第一步（本模块内部按 tree_id 串行化 → 并发二次镶嵌只有一个成功）。
 *
 * 可镶嵌的树 = `tree-meta` 登记的 `kind='family'` 与 `kind='clan'`；`kind='master'`（中华世本）→ 400。
 */
export async function mountJade(phone, treeId, jadeId, now = new Date()) {
  if (!treeId) throw httpError(400, ERR_MISSING_TREE_ID);
  if (!jadeId) throw httpError(400, ERR_MISSING_JADE_ID);
  const tree = await treeMetaOf(treeId);
  if (!mountableKind(tree) || treeId === MASTER_TREE_ID) throw httpError(400, ERR_MASTER_NO_SLOT);

  // ① 个人侧预检（本人持有、未镶嵌、未过期）
  const assets = await getAssets(phone);
  const mine = (assets.jades || []).find((j) => j.id === jadeId);
  if (!mine || jadeExpired(mine, now)) throw httpError(404, ERR_JADE_NOT_FOUND);
  if (mine.mounted_tree_id) throw httpError(409, ERR_JADE_MOUNTED);

  const mountedAt = isoOf(now);
  const slot = { jade_id: jadeId, mounted_at: mountedAt, expires_at: mine.expires_at ?? null };

  // ② 凹槽占用（临界区）
  const mounted = await withSpirit(
    treeId,
    (entry, ctx) => {
      if (entry && entry.jade) throw httpError(409, ERR_SLOT_TAKEN);
      for (const e of Object.values(ctx.doc.trees || {})) {
        if (e && e.jade && e.jade.jade_id === jadeId) throw httpError(409, ERR_JADE_MOUNTED);
      }
      ctx.doc.trees[treeId] = {
        jade: { jade_id: slot.jade_id, mounted_at: slot.mounted_at, expires_at: slot.expires_at },
        spirit_expires_at: null,
        buffer_until: null,
        status: 'inactive',
        logs: [],
      };
      ctx.dirty = true;
      return { mounted_at: slot.mounted_at };
    },
    now,
  );

  // ③ 个人侧去向留痕（记录保留、不做物理删除；失败 → 回滚 ② 的凹槽）
  try {
    await withAssets(phone, (user) => {
      const j = (user.jades || []).find((x) => x.id === jadeId);
      if (!j) throw httpError(404, ERR_JADE_NOT_FOUND);
      j.mounted_tree_id = treeId;
      recordTx(
        user,
        {
          type: 'jade_mount',
          delta: { jades: 0 },
          ref: { tree_id: treeId, jade_id: jadeId },
          desc: '镶嵌石榴籽玉，解锁时流子域',
        },
        now,
      );
    });
  } catch (e) {
    await withSpirit(
      treeId,
      (entry, ctx) => {
        delete ctx.doc.trees[treeId];
        ctx.dirty = true;
      },
      now,
    ).catch(() => {});
    throw e;
  }

  return {
    ok: true,
    tree_id: treeId,
    jade_id: jadeId,
    mounted_at: mounted.mounted_at,
    jade_expires_at: slot.expires_at,
    status: 'inactive',
    spirit_expires_at: null,
  };
}

// ---- §6 玉露灵泽蓄能 ----

/**
 * 灌注玉露灵泽（§6-3）：消耗**个人**籽（FIFO、不足 → 409 整单拒绝），
 * `spirit_expires_at = max(now, 原值) + days`（**叠加顺延，绝不覆盖**），`status='active'` 且清空 `buffer_until`；
 * 追加一条 `SpiritLog` 与 `Tx(type='spirit_charge')`；受开关放行时发放赠送竹片（`BambooLot`，365 天、
 * `source='spirit_gift'`）。
 * 前置：该树必须**已镶嵌玉**（否则 409）；`plan` 非法 → 400。
 *
 * @param {string} phone 灌注者手机号（**任何已登录用户**均可，K1）
 * @param {string} treeId
 * @param {string} plan 五档之一
 * @param {Date} [now]
 * @param {{env?:object}} [opts] `env` 覆盖环境变量读取（单测用；缺省读 `process.env`）
 */
export async function chargeSpirit(phone, treeId, plan, now = new Date(), opts = {}) {
  if (!treeId) throw httpError(400, ERR_MISSING_TREE_ID);
  const P = planOf(plan);
  if (!P) throw httpError(400, ERR_PLAN_INVALID);
  await treeMetaOf(treeId); // 树不存在 → 404
  const giftPieces = giftPiecesOf(plan, opts.env);
  const assetsSnapshot = await getAssets(phone);
  let assetsWritten = false;

  try {
    return await withSpirit(
      treeId,
      async (entry, ctx) => {
        if (!entry || !entry.jade) throw httpError(409, ERR_NO_JADE_ON_TREE);
        const before = entry.spirit_expires_at || null;

        // 个人籽扣减 + 赠片（复用账本内核：sweep → 整单拒绝 → 扣减 → 批次/流水）
        const details = await withAssets(phone, async (user) => {
          sweep(user, now);
          let charge;
          try {
            charge = chargeLots(user.seeds, P.seeds, 'seed');
          } catch (err) {
            throw seedsInsufficient(P.seeds, err.current, `石榴籽不足：本次需 ${P.seeds} 颗，当前可用 ${err.current} 颗`);
          }
          user.seeds = (user.seeds || []).filter((l) => toNonNegInt(l.qty) > 0);
          let gift_lot_id = null;
          if (giftPieces > 0) {
            gift_lot_id = addLot(user, 'bamboo', giftPieces, { source: 'spirit_gift', now }).id;
          }
          recordTx(
            user,
            {
              type: 'spirit_charge',
              delta: giftPieces > 0 ? { seeds: -P.seeds, bamboos: giftPieces } : { seeds: -P.seeds },
              ref: { tree_id: treeId, plan },
              desc: `灌注玉露灵泽（${plan}）`,
            },
            now,
          );
          return {
            seeds_used: charge.taken.map((t) => ({ lot_id: t.id, qty: t.qty, expires_at: t.expires_at ?? null })),
            seeds_balance_after: sumLots(user.seeds),
            gift_lot_id,
          };
        });
        assetsWritten = true;

        // 灵气叠加顺延（active 原值未来 → 原值 + days；buffer / expired / inactive → now + days）
        const newExp = chargeNextExpiry(before, P.days, now);
        entry.spirit_expires_at = newExp;
        entry.buffer_until = null;
        entry.status = 'active';
        entry.logs = entry.logs || [];
        const log = {
          id: spiritLogId(),
          ts: isoOf(now),
          phone,
          plan,
          seeds: P.seeds,
          days: P.days,
          gift_bamboos: giftPieces,
          spirit_expires_at_after: newExp,
        };
        entry.logs.push(log);
        ctx.dirty = true;

        return {
          ok: true,
          tree_id: treeId,
          plan,
          seeds_deducted: P.seeds,
          days: P.days,
          spirit_expires_at: newExp,
          spirit_expires_at_before: before,
          buffer_until_preview: isoPlusDays(newExp, BUFFER_DAYS),
          status: 'active',
          gift_bamboos: giftPieces,
          gift_bundles: Math.floor(giftPieces / BAMBOO_PER_BUNDLE),
          gift_lot_id: details.gift_lot_id,
          seeds_used: details.seeds_used,
          seeds_balance_after: details.seeds_balance_after,
          log_id: log.id,
          message: '灌注成功',
        };
      },
      now,
    );
  } catch (e) {
    // 落库失败回滚：资产侧已写、灵气侧失败 → 用快照恢复个人记录（best-effort，同 store.updateTrees 口径）
    if (assetsWritten) {
      await withAssets(phone, (user) => Object.assign(user, JSON.parse(JSON.stringify(assetsSnapshot)))).catch(() => {});
    }
    throw e;
  }
}

// ---- §7 灵气流水视图 ----

// ---- §7-2 注入者反查（已镶玉区块展示口径 · 读侧 · 零迁移 / 零新字段） ----

/** 手机号脱敏（昵称缺失时的兜底展示；**手机号绝不整串下发前端**） */
export function maskPhone(phone) {
  const s = String(phone || '');
  if (!s) return '';
  return s.length >= 7 ? `${s.slice(0, 3)}****${s.slice(-4)}` : `${s.slice(0, 3)}****`;
}

/**
 * 已镶玉的**注入者**反查（`GET /spirit` 的 `injector` 出参口径）。
 *
 * 来源 = **读侧反查**（零迁移、零新字段、零新集合）：在 `jiazu_assets`（单文档 `global`，
 * `users[phone].jades`）里反查 `mounted_tree_id === treeId` 的那一枚玉 → 持有者手机号 →
 * `jiazu_users` 昵称 + `jiazu_anchors` 锚点（`tree_id` / `person_handle`）。
 * 全程 `colGet` **只读**（不 sweep、不回写 ⇒ 不扰动真源）。
 *
 * 三态：
 * - 反查到 + 锚点 `tree_id === treeId` → `{ nickname, person_handle }`（前端给可点档案链接）；
 * - 反查到 + 无锚点 / 锚点跨树 → `{ nickname, person_handle: null }`（前端示「注入者无本树节点」）；
 * - 反查不到（玉记录已被清空 / 账号注销清空资产）→ `null`（前端示「注入者信息不可考」）。
 *
 * 昵称缺失 → 脱敏手机号兜底。**出参不含手机号**。
 */
export async function injectorOf(treeId) {
  if (!treeId) return null;
  const doc = await colGet(ASSETS_COL, ASSETS_ID);
  let phone = '';
  for (const [p, rec] of Object.entries(doc?.users || {})) {
    if ((rec?.jades || []).some((j) => j && j.mounted_tree_id === treeId)) {
      phone = p;
      break;
    }
  }
  if (!phone) return null;
  const account = await colGet(USERS_COL, phone);
  const nickname = String(account?.nickname || '').trim() || maskPhone(phone);
  const anchor = await colGet(ANCHORS_COL, phone);
  const personHandle = anchor && anchor.tree_id === treeId && anchor.person_handle ? anchor.person_handle : null;
  return { nickname, person_handle: personHandle };
}

/**
 * `GET /spirit` 出参（§7-1 / §7-2）。
 * 处理顺序：取树（400 / 404）→ `settle` 推进 → 组装出参（**推进后**的状态为准）。
 * `logs` **仅该树成员可见**（锚点用户 / tree_steward / chief_editor 口径复用 `isTreeMember`），
 * 否则返回 `[]` + `logs_notice`；`plans` 由本接口下发（单一真源）。
 *
 * @param {string} treeId
 * @param {{phone?:string, role?:string}|null} viewer
 * @param {Date} [now]
 * @param {{env?:object}} [opts]
 */
export async function spiritInfo(treeId, viewer = null, now = new Date(), opts = {}) {
  const tree = await treeMetaOf(treeId);
  const entry = await readSpiritEntry(treeId, now);
  const mounted = !!(entry && entry.jade);
  const status = mounted ? entry.status : null;
  const spiritExpiresAt = mounted ? entry.spirit_expires_at || null : null;
  const bufferUntil = mounted ? entry.buffer_until || null : null;
  const nowMs = toMs(now);
  const daysLeft = spiritExpiresAt ? Math.max(0, Math.ceil((Date.parse(spiritExpiresAt) - nowMs) / DAY_MS)) : 0;
  const bufferDaysLeft = bufferUntil ? Math.max(0, Math.ceil((Date.parse(bufferUntil) - nowMs) / DAY_MS)) : 0;
  const policy = await viewerPolicy(treeId, viewer);

  const allLogs = mounted ? entry.logs || [] : [];
  const logs = policy.logs_visible
    ? [...allLogs].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, SPIRIT_LOG_LIMIT)
    : [];
  const state = stateTextOf(status, {
    days_left: daysLeft,
    buffer_days_left: bufferDaysLeft,
    expires_date: spiritExpiresAt ? beijingDate(spiritExpiresAt) : '',
    buffer_date: bufferUntil ? beijingDate(bufferUntil) : '',
  });

  return {
    tree_id: treeId,
    kind: tree.kind || null,
    mounted,
    status,
    spirit_expires_at: spiritExpiresAt,
    buffer_until: bufferUntil,
    buffer_until_preview: spiritExpiresAt ? isoPlusDays(spiritExpiresAt, BUFFER_DAYS) : null,
    days_left: daysLeft,
    buffer_days_left: bufferDaysLeft,
    jade: mounted ? { ...entry.jade } : null,
    // 注入者（已镶玉区块展示口径）：未镶嵌 → null；已镶嵌 → 读侧反查（三态见 injectorOf）
    injector: mounted ? await injectorOf(treeId) : null,
    logs,
    logs_total: allLogs.length,
    logs_visible: policy.logs_visible,
    logs_notice: policy.logs_notice,
    state_text: state,
    can_charge: policy.can_charge,
    activity: activityPayload(opts.env),
    plans: plansPayload(opts.env),
  };
}

/** 时流子域单树摘要（供 hall / mine 入口条复用，§8-1；不做权限裁剪，仅门面信息） */
export async function spiritSummary(treeId, now = new Date(), opts = {}) {
  const tree = await treeMetaOf(treeId);
  const entry = await readSpiritEntry(treeId, now);
  const mounted = !!(entry && entry.jade);
  const spiritExpiresAt = mounted ? entry.spirit_expires_at || null : null;
  const daysLeft = spiritExpiresAt ? Math.max(0, Math.ceil((Date.parse(spiritExpiresAt) - toMs(now)) / DAY_MS)) : 0;
  return {
    tree_id: treeId,
    kind: tree.kind || null,
    mounted,
    status: mounted ? entry.status : null,
    spirit_expires_at: spiritExpiresAt,
    buffer_until: mounted ? entry.buffer_until || null : null,
    days_left: daysLeft,
    jade: mounted ? { ...entry.jade } : null,
    activity: activityPayload(opts.env),
  };
}

/** 资产总览（转发账本内核，方便路由单点引入时流子域模块；不另写一套） */
export { summarize };
