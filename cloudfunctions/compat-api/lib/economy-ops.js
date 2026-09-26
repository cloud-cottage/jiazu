/**
 * 运营侧内核（P4）— 站内信惰性预警 + 后台资产运维 + 账号注销前置
 *
 * 唯一真源：
 *   分册 `docs/economy-ops.spec.md`：§3 资产获取规则 / §4.2-§4.5 站内信与四类预警（生成条件 · 去重键 · 惰性算法）/
 *     §5 运营后台（grant 校验矩阵与副作用顺序、logs、user 快照）/ §6.2 文案（M1–M4 **逐字**）/ §7 注销口径（K10）/
 *     §11 默认口径（#5 保留 200 条裁已读 · #6 灵气收件人集合 · #7 剩余天数 ceil · #8 limit 上限 200）
 *   总册 `docs/economy.spec.md`：§4-4（`jiazu_messages`）/ §4-5（`jiazu_ops_logs`）/ §4-6（`Tx.type`）/
 *     §6（接口）/ §8（权限口径）
 *   交叉 `docs/economy-market.spec.md` §5-6 / §10-7（注销前置 = `hasOpenListing` / `openListingGuard`）
 *
 * **不重写第二套算法**：sweep / FIFO 整单拒绝 / 批次与流水读写 / 总览投影全部复用
 * `lib/economy-ledger.js`（chargeLots / addLot / sumLots / sweep / recordTx / withAssets / summarize）；
 * 灵气状态机推进与灵气记录读取复用 `lib/economy-spirit.js`（settleAllTrees / SPIRIT_COL）；
 * 注销前置直接调用 `lib/economy-market.js` 的 `openListingGuard`（**不自动撤单、不改挂单状态**）。
 *
 * 分层（纯函数与 IO 分离，便于单测）：
 *   - 纯函数：expiringCandidates / spiritCandidates / trimMessages / m1Text / daysLeftUntil / upsert 判定
 *   - IO 层：withMessages（按单文档串行化）+ ensureWarnings / messagesOf / readMessages /
 *     grantAssets / opsLogs / adminUserAssets / deleteAccount / spiritRecipients
 *
 * 已知限制（与 economy-ledger / economy-spirit 同批）：`jiazu_messages` / `jiazu_ops_logs` 同为单文档
 * `_id='global'` + 仅进程内串行锁，云端多实例并发可丢更新（登记 docs/PENDING_DEPLOY.md，随资产集合一并重构）。
 */

import { colAll, colGet, colSet } from './store.js';
import {
  BAMBOO_TTL_DAYS,
  FRAGMENT_SYNTH_THRESHOLD,
  SCROLL_FRAGMENT_SYNTH_THRESHOLD,
  SCROLL_PIECES_PER_SCROLL,
  SEED_TTL_DAYS,
  addFragments,
  addLot,
  addScrollFragments,
  assetInsufficient,
  chargeLots,
  getAssets,
  recordTx,
  sumLots,
  summarize,
  sweep,
  toNonNegInt,
  withAssets,
} from './economy-ledger.js';
import { SPIRIT_COL, SPIRIT_ID, settleAllTrees } from './economy-spirit.js';
import { openListingGuard } from './economy-market.js';
import { getAnchor } from './scope.js';

// ---- 集合（§4-5 存储契约；改动先改总册） ----

export const MESSAGES_COL = 'jiazu_messages';
export const MESSAGES_ID = 'global';
export const OPS_LOGS_COL = 'jiazu_ops_logs';
export const OPS_LOGS_ID = 'global';
export const USERS_COL = 'jiazu_users';
export const ANCHORS_COL = 'jiazu_anchors';

// ---- 常量（§4.2 / §5.3 / §11-5 · §11-8） ----

/** 每用户保留最近 200 条（超出裁剪最旧的**已读**消息，未读不裁剪，§11-5） */
export const MESSAGE_KEEP_LIMIT = 200;
/** 到期前 30 天预警（M1 的固定数值之一，§6.3） */
export const WARN_DAYS_30 = 30;
/** 到期前 7 天预警（M1 的固定数值之一，§6.3） */
export const WARN_DAYS_7 = 7;
/** 后台发放批次有效期（天，§11-3：籽 / 竹片 = 发放日 + 365 天；玉 `expires_at=null` 永久） */
export const GRANT_TTL_DAYS = 365;
/** `GET /admin/assets/logs` 默认 / 上限（§11-8） */
export const LOGS_LIMIT_DEFAULT = 50;
export const LOGS_LIMIT_MAX = 200;

const DAY_MS = 86400000;
const TX_ADMIN_GRANT = 'admin_grant';
const TX_ACCOUNT_CLEAR = 'account_clear';

// ---- 错误文案（§5.1 校验矩阵 · §5.4 · §7.2） ----

export const ERR_PHONE_FORMAT = '手机号格式不正确';
export const ERR_USER_NOT_FOUND = '用户不存在';
export const ERR_REASON_REQUIRED = '请填写操作原因';
export const ERR_DELTA_ZERO = '资产数量不能全为 0';
export const ERR_DELTA_INT = '资产数量必须为整数';
export const ERR_MISSING_PHONE = '缺少 phone';
export const ERR_NOT_LOGGED_IN = '未登录或登录已过期';
export const ERR_CHIEF_ONLY = '需要总编辑权限';
export const PHONE_RE = /^1\d{10}$/;

/** 业务错误（有 status、无 code → 路由 catch 保持既有 4xx 语义） */
export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ==================== §6.2 站内信文案（**逐字唯一真源**，不得改写 / 增删标点 / 改【】） ====================
//
// M1 为模板（两个运行时填值项：资产类型二选一、【】内保留；天数固定 30 / 7）；
// M2–M4 为字面文案（【时流子域】字面保留，不替换）。落库时 `text` = 以下文案**逐字全文**，
// `title` = §6.3 映射表的短标题（不含【】）。

/** M1 模板（模板中的 `石榴籽/竹片` = 二选一占位，`X` = 固定 30 / 7） */
export const M1_TEMPLATE = '【资产到期提醒】您的【石榴籽/竹片】即将于X日后到期失效，请尽快使用避免损耗。';
/** M2 家族灵气预警（30 天，字面） */
export const M2_TEXT = '【家族灵气预警】本家族【时流子域】灵气剩余30天，即将到期。请及时灌注玉露灵泽续期，避免子域名停用。';
/** M3 家族缓冲期通知（字面） */
export const M3_TEXT = '【家族缓冲期通知】本家族灵气已耗尽，现已进入30天缓冲期。若未及时续期，缓冲期结束后子域名将自动失效。';
/** M4 紧急通知（缓冲期剩 7 天，字面） */
export const M4_TEXT = '【紧急通知】本家族【时流子域】缓冲期仅剩7天，未灌注玉露灵泽续期将永久停用子域名，请尽快操作！';

/** §6.3 `Message.title` 映射（短标题，不含【】） */
export const MESSAGE_TITLES = {
  m1: '资产到期提醒',
  m2: '家族灵气预警',
  m3: '家族缓冲期通知',
  m4: '紧急通知',
};

/** 资产类型 → M1 的【】包裹词（二选一） */
export const ASSET_TEXT_LABEL = { seed: '石榴籽', bamboo: '竹片' };

/**
 * M1 正文（逐字 = M1_TEMPLATE 仅替换两个运行时项：`石榴籽/竹片` 二选一、`X` = 30 / 7）
 * @param {'seed'|'bamboo'} kind
 * @param {30|7} days 固定值（不随实际剩余天数变化，§6.3）
 */
export function m1Text(kind, days) {
  const label = ASSET_TEXT_LABEL[kind] || ASSET_TEXT_LABEL.seed;
  const d = Number(days) === WARN_DAYS_7 ? WARN_DAYS_7 : WARN_DAYS_30;
  return M1_TEMPLATE.replace('【石榴籽/竹片】', `【${label}】`).replace('即将于X日后', `即将于${d}日后`);
}

/** 剩余天数（§11-7：`ceil((到期时刻 − now) / 86400000)`；非法 / 空值 → `NaN`） */
export function daysLeftUntil(expires_at, now = new Date()) {
  if (!expires_at) return NaN;
  const t = Date.parse(expires_at);
  if (!Number.isFinite(t)) return NaN;
  return Math.ceil((t - toMs(now)) / DAY_MS);
}

// ---- 基础工具 ----

const toMs = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const isoOf = (d) => new Date(toMs(d)).toISOString();
const rand6 = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0').slice(0, 6);

/** `Message.id`（§4.2：`msg_<毫秒时间戳>_<6 位随机>`，沿用 wallet.js 的 id 风格） */
export function messageId() {
  return `msg_${Date.now()}_${rand6()}`;
}

/** `OpsLog.id`（§5.3：`op_<毫秒时间戳>_<6 位随机>`） */
export function opsLogId() {
  return `op_${Date.now()}_${rand6()}`;
}

/** 空集合文档（§4-5） */
export function blankMessagesDoc() {
  return { _id: MESSAGES_ID, items: {}, warned: {} };
}

/** 空日志文档 */
export function blankOpsLogsDoc() {
  return { _id: OPS_LOGS_ID, logs: [] };
}

const trimmed = (v) => String(v === undefined || v === null ? '' : v).trim();

// ==================== §4.4 预警：纯函数判定（生成条件 + 去重键 + 逐字文案） ====================

/** 去重键（总册「存储契约」三段格式 + 阶段后缀；**每个键终身只生成一次**） */
export const warnKey = {
  expiring30: (phone, lotId) => `expiring:${phone}:${lotId}@30`,
  expiring7: (phone, lotId) => `expiring:${phone}:${lotId}@7`,
  spirit30: (phone, treeId, spiritExpiresAt) => `spirit:${phone}:${treeId}@30@${spiritExpiresAt}`,
  spiritBuffer: (phone, treeId, spiritExpiresAt) => `spirit:${phone}:${treeId}@buffer@${spiritExpiresAt}`,
  spirit7: (phone, treeId, bufferUntil) => `spirit:${phone}:${treeId}@7@${bufferUntil}`,
};

/**
 * 资产到期预警候选（§4.4 第 1、2 行）：籽 / 竹片批次 `0 < 剩余天数 ≤ 30` → `@30`；`0 < 剩余天数 ≤ 7` → `@7`。
 * 每批次各一次；剩余 ≤ 0 不生成（`sweep` 已剔除该批次）。
 * @returns {Array<{key:string,type:'expiring',title:string,text:string}>}
 */
export function expiringCandidates(phone, user, now = new Date()) {
  const out = [];
  for (const [kind, bucket] of [
    ['seed', 'seeds'],
    ['bamboo', 'bamboos'],
  ]) {
    for (const lot of user?.[bucket] || []) {
      if (!lot || !lot.id) continue;
      if (toNonNegInt(lot.qty) <= 0) continue;
      const d = daysLeftUntil(lot.expires_at, now);
      if (!Number.isFinite(d) || d <= 0) continue;
      if (d <= WARN_DAYS_30) {
        out.push({ key: warnKey.expiring30(phone, lot.id), type: 'expiring', title: MESSAGE_TITLES.m1, text: m1Text(kind, WARN_DAYS_30) });
      }
      if (d <= WARN_DAYS_7) {
        out.push({ key: warnKey.expiring7(phone, lot.id), type: 'expiring', title: MESSAGE_TITLES.m1, text: m1Text(kind, WARN_DAYS_7) });
      }
    }
  }
  return out;
}

/**
 * 灵气预警候选（§4.4 第 3、4、5 行；**只读** `jiazu_spirit`，绝不写灵气状态）：
 * - `status='active'` 且 `0 < 灵气剩余 ≤ 30` → `@30`（M2）；
 * - `status='buffer'` → `@buffer`（M3），且 `0 < 缓冲期剩余 ≤ 7` → `@7`（M4）；
 * - 未镶嵌玉（无 `entry.jade`）/ `status='expired'` → 不生成。
 * @returns {Array<{key:string,type:'spirit',title:string,text:string}>}
 */
export function spiritCandidates(phone, treeId, entry, now = new Date()) {
  const out = [];
  if (!phone || !treeId || !entry || !entry.jade) return out;
  if (entry.status === 'active') {
    const d = daysLeftUntil(entry.spirit_expires_at, now);
    if (Number.isFinite(d) && d > 0 && d <= WARN_DAYS_30) {
      out.push({
        key: warnKey.spirit30(phone, treeId, entry.spirit_expires_at),
        type: 'spirit',
        title: MESSAGE_TITLES.m2,
        text: M2_TEXT,
      });
    }
  }
  if (entry.status === 'buffer') {
    out.push({
      key: warnKey.spiritBuffer(phone, treeId, entry.spirit_expires_at),
      type: 'spirit',
      title: MESSAGE_TITLES.m3,
      text: M3_TEXT,
    });
    const d = daysLeftUntil(entry.buffer_until, now);
    if (Number.isFinite(d) && d > 0 && d <= WARN_DAYS_7) {
      out.push({
        key: warnKey.spirit7(phone, treeId, entry.buffer_until),
        type: 'spirit',
        title: MESSAGE_TITLES.m4,
        text: M4_TEXT,
      });
    }
  }
  return out;
}

/**
 * 保留上限裁剪（§4.2 / §11-5）：超出**最近 200 条**时裁剪最旧的**已读**消息；
 * **未读一律不裁剪**（全为未读时允许暂时超过上限，等用户读后再收口）。
 */
export function trimMessages(items, limit = MESSAGE_KEEP_LIMIT) {
  const list = (items || []).slice();
  while (list.length > limit) {
    const idx = list.findIndex((m) => m && m.read === true);
    if (idx < 0) break;
    list.splice(idx, 1);
  }
  return list;
}

// ==================== IO 层：jiazu_messages（单文档 + 串行化） ====================

const messageLocks = new Map();

/**
 * 站内信读改写（唯一 IO 入口）：`warned` 去重标记与消息写入**同一次 `colSet`**（避免重复投递）。
 * mutator 抛错 → 一字节都不回写。
 * @param {(doc:object, ctx:{doc:object, dirty:boolean}) => any} mutator
 */
export async function withMessages(mutator) {
  const lock = messageLocks.get(MESSAGES_ID) || Promise.resolve();
  const run = lock.then(async () => {
    const base = await colGet(MESSAGES_COL, MESSAGES_ID);
    const doc = base ? JSON.parse(JSON.stringify(base)) : blankMessagesDoc();
    doc.items = doc.items || {};
    doc.warned = doc.warned || {};
    const ctx = { doc, dirty: false };
    const result = await mutator(doc, ctx);
    if (ctx.dirty) await colSet(MESSAGES_COL, MESSAGES_ID, doc);
    return result;
  });
  messageLocks.set(MESSAGES_ID, run.catch(() => {}));
  return run;
}

/** 只读快照（不落盘） */
export async function getMessages(phone) {
  const doc = await colGet(MESSAGES_COL, MESSAGES_ID);
  return JSON.parse(JSON.stringify((doc?.items?.[phone] || []).slice()));
}

/** 去重键集合快照（单测断言「同次落库」用） */
export async function warnedKeys() {
  const doc = await colGet(MESSAGES_COL, MESSAGES_ID);
  return { ...(doc?.warned || {}) };
}

/**
 * 惰性补齐预警（§4.5）：**先做资产 `sweep` 与灵气 `settle`**，再补齐当前请求人**尚未生成过**的预警。
 * 只补当前请求人那一份（去重键含手机号，天然按人隔离）；他人下次登入时各自补齐。
 * @param {{phone?:string, role?:string}|string} viewer 当前请求人（手机号或 `authUser` 结果）
 * @param {Date} [now]
 * @returns {Promise<{created:object[], keys:string[]}>}
 */
export async function ensureWarnings(viewer, now = new Date()) {
  const phone = typeof viewer === 'string' ? viewer : viewer?.phone || '';
  const role = typeof viewer === 'string' ? '' : viewer?.role || '';
  if (!phone) return { created: [], keys: [] };

  // ① 资产入口先 sweep（§1.3）→ 结算后的批次才是预警数据源（剩余 ≤ 0 的批次已被剔除）
  const candidates = await withAssets(phone, (user) => {
    sweep(user, now);
    return expiringCandidates(phone, user, now);
  });

  // ② 灵气先 settle（§4.4：预警生成只读状态，推进由状态机负责）→ 再读记录判定三条
  await settleAllTrees(now);
  const spiritDoc = await colGet(SPIRIT_COL, SPIRIT_ID);
  for (const treeId of await recipientTreeIds(phone, role, spiritDoc)) {
    candidates.push(...spiritCandidates(phone, treeId, spiritDoc?.trees?.[treeId], now));
  }

  return putWarnings(phone, candidates, now);
}

/** 当前请求人**有接收权**的树（§11-6：anchor 用户 + 该树 tree_steward + 全部 chief_editor） */
async function recipientTreeIds(phone, role, spiritDoc) {
  const treeIds = Object.keys(spiritDoc?.trees || {});
  if (treeIds.length === 0) return [];
  if (role === 'chief_editor') return treeIds;
  const anchor = await getAnchor(phone);
  const tid = anchor?.tree_id;
  return tid && treeIds.includes(tid) ? [tid] : [];
}

/** 去重写入：`warned` 未命中才 push（消息与 `warned[key]` 同一次 colSet） */
async function putWarnings(phone, candidates, now) {
  const fresh = (candidates || []).filter(Boolean);
  if (fresh.length === 0) return { created: [], keys: [] };
  return withMessages((doc, ctx) => {
    const created = [];
    const keys = [];
    for (const c of fresh) {
      if (doc.warned[c.key]) continue;
      doc.items[phone] = doc.items[phone] || [];
      doc.items[phone].push({
        id: messageId(),
        type: c.type,
        title: c.title,
        text: c.text,
        created_at: isoOf(now),
        read: false,
      });
      doc.warned[c.key] = true;
      created.push(doc.items[phone][doc.items[phone].length - 1]);
      keys.push(c.key);
    }
    if (created.length > 0) {
      doc.items[phone] = trimMessages(doc.items[phone]);
      ctx.dirty = true;
    }
    return { created, keys };
  });
}

/**
 * `GET /messages` 出参（§4.3）：惰性补齐预警后返回本人消息（`created_at` 倒序，
 * **同刻按写入顺序倒序 —— 后写入者在前**，与 `opsLogs` 同一套确定性写法，见 §4.2 引用 §5.3）+
 * 未读计数。`opts.unreadOnly` 只过滤、不改同刻次序。
 * @param {{phone?:string, role?:string}|string} viewer
 * @param {Date} [now]
 * @param {{unreadOnly?:boolean}} [opts]
 */
export async function messagesOf(viewer, now = new Date(), opts = {}) {
  const phone = typeof viewer === 'string' ? viewer : viewer?.phone || '';
  if (!phone) throw httpError(401, ERR_NOT_LOGGED_IN);
  await ensureWarnings(viewer, now);
  const doc = await colGet(MESSAGES_COL, MESSAGES_ID);
  const mine = (doc?.items?.[phone] || []).slice();
  const unread = mine.filter((m) => !m.read).length;
  const list = opts.unreadOnly ? mine.filter((m) => !m.read) : mine;
  const ts = (m) => {
    const t = Date.parse(m?.created_at || '');
    return Number.isFinite(t) ? t : 0; // 脏值 / 缺 created_at → 排最后
  };
  // 定序完全确定（§4.2 引用 §5.3「同刻定序」，与 opsLogs 同一套写法）：
  // 先按 `ts` 降序，**同刻（同一毫秒）时后写入者在前**（插入下标倒序）——
  // 一次 `ensureWarnings` 可同时生成多条预警（同一次请求内 `created_at` 完全相同，是常态而非异常），
  // 绝不依赖 JS 稳定排序的隐式「保留插入序」（那会给出**相反**的顺序：先写入者在前）。
  // `unreadOnly` 过滤保持原相对次序，故在过滤后取下标仍等于写入序，定序口径不受过滤影响。
  const items = list
    .slice()
    .map((m, index) => ({ m, index, ts: ts(m) }))
    .sort((x, y) => y.ts - x.ts || y.index - x.index)
    .map((entry) => entry.m);
  return { items, unread };
}

/**
 * `POST /messages/read`（§4.3）：`ids` 缺省 = 全部标记已读；不属于本人的 id 忽略不计（不报错）；
 * 重复调用幂等（已读不再写）。
 * @returns {Promise<{ok:true, unread:number, marked:number}>}
 */
export async function readMessages(phone, ids, now = new Date()) {
  if (!phone) throw httpError(401, ERR_NOT_LOGGED_IN);
  const want = Array.isArray(ids) && ids.length > 0 ? new Set(ids.map((x) => String(x))) : null;
  return withMessages((doc, ctx) => {
    const mine = (doc.items[phone] = doc.items[phone] || []);
    let marked = 0;
    for (const m of mine) {
      if (!m || (want && !want.has(String(m.id)))) continue;
      if (!m.read) {
        m.read = true;
        marked += 1;
      }
    }
    if (marked > 0) ctx.dirty = true;
    return { ok: true, unread: mine.filter((m) => !m.read).length, marked };
  });
}

// ==================== §11-6 灵气预警收件人集合 ====================

/**
 * 该树的灵气预警收件人集合（§11-6）：**该树 anchor 用户 + 该树 `tree_steward` + 全部 `chief_editor`**。
 * 惰性生成只补当前请求人；本函数供定时推送（部署阶段）与单测断言收件人集合使用。
 * @returns {Promise<string[]>} 手机号（去重）
 */
export async function spiritRecipients(treeId) {
  if (!treeId) return [];
  const users = await colAll(USERS_COL);
  const anchors = await colAll(ANCHORS_COL);
  const anchorTreeOf = new Map(anchors.filter((a) => a && a._id).map((a) => [String(a._id), a.tree_id]));
  const phones = new Set();
  for (const u of users) {
    const phone = u?.phone || (u?._id ? String(u._id) : '');
    if (!phone) continue;
    if (u.role === 'chief_editor') phones.add(phone);
    else if (u.role === 'tree_steward' && anchorTreeOf.get(phone) === treeId) phones.add(phone);
    if (anchorTreeOf.get(phone) === treeId) phones.add(phone);
  }
  return [...phones];
}

// ==================== §5 运营后台资产运维 ====================

/**
 * `delta` 允许的键（顺序 = 前端「资产运维」表单显示序）：石榴籽碎片 / 石榴籽 / 竹片 / 石榴籽玉 /
 * 兰帖 / 兰帖残页。**兰帖按「张」表达量词，但键值线上一律以「片」计**（1 张 = 100 片；前端表单
 * 以张输入、提交前 ×100 折成片 ⇒ 后端收发的 `delta.scrolls` 恒为片数，§A2）。
 */
const DELTA_KEYS = ['fragments', 'seeds', 'bamboos', 'jades', 'scrolls', 'scroll_fragments'];

/** delta 归一化与校验（§5.1 校验 4、5）：至少一项、至少一项非 0、每项为整数（可为负） */
export function normalizeDelta(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!src) throw httpError(400, ERR_DELTA_ZERO);
  const delta = {};
  let provided = 0;
  for (const k of DELTA_KEYS) {
    if (src[k] === undefined || src[k] === null) continue;
    provided += 1;
    const v = src[k];
    if (typeof v !== 'number' || !Number.isInteger(v)) throw httpError(400, ERR_DELTA_INT);
    delta[k] = v;
  }
  if (provided === 0) throw httpError(400, ERR_DELTA_ZERO);
  if (DELTA_KEYS.every((k) => !delta[k])) throw httpError(400, ERR_DELTA_ZERO);
  return delta;
}

/** 石榴籽碎片不足（409，口径同账本扣费不足：`code='ASSET_INSUFFICIENT'` + 原文；量词 = 「片」） */
function fragmentsInsufficient(need, current) {
  const e = assetInsufficient(need, current, 'fragment');
  e.message = `资产不足，需 ${need} 片碎片，当前 ${current} 片`;
  e.unit = 'fragments';
  return e;
}

/** 兰帖残页不足（409；量词 = 「片」—— 碎片类一律片，与「张」是两回事） */
function scrollFragmentsInsufficient(need, current) {
  const e = assetInsufficient(need, current, 'scroll_fragment');
  e.message = `资产不足，需 ${need} 片兰帖残页，当前 ${current} 片`;
  e.unit = 'scroll_fragments';
  return e;
}

/**
 * 兰帖（成品）不足（409）：文案必须同时给出**需求张数 + 当前张数 + 当前精确片数**
 * （例「资产不足，需 2 张兰帖，当前 0 张（50 片）」）。`currentPieces` = 扣除前精确片总数；
 * 张数一律向下取整（1 张 = 100 片，余片不凑整）。需求片数不是 100 的整数倍时（仅 API 直调可达，
 * 前端表单送出的恒为 100 的倍数）退回片口径表述，绝不写「1.5 张」这类假张数。
 *
 * **机器可读字段一律为「片」**：`need` / `current` 恒取 `assetInsufficient()` 落下的片值，
 * 与 `unit='scrolls'` 的线上存储口径、与请求 `delta.scrolls` **同分母**（§14-2 / §14-6：
 * `need` 以片为机器可读值、`current` **不得**四舍五入成张）；**「张」只活在上面的人文文案里**。
 * 已修正的历史缺陷（本函数只再设 `message` / `unit`，不再触碰 `need` / `current`）：
 * 曾把 `need` 覆写成「张」、`current` 取整成「张」⇒ 需求片数不可整除时同一响应体内出现
 * 「片 + 张」**两套单位**，消费者直拼两数（如「本次需 {need} …，当前可用 {current} …」）即读错。
 *
 * **不得**改账本 `ASSET_UNIT` 表（那是按片计量的内部口径）。
 */
function scrollsInsufficient(needPieces, currentPieces) {
  const currentItems = Math.floor(currentPieces / SCROLL_PIECES_PER_SCROLL);
  const e = assetInsufficient(needPieces, currentPieces, 'scroll');
  e.message = needPieces % SCROLL_PIECES_PER_SCROLL === 0
    ? `资产不足，需 ${needPieces / SCROLL_PIECES_PER_SCROLL} 张兰帖，当前 ${currentItems} 张（${currentPieces} 片）`
    : `资产不足，需 ${needPieces} 片兰帖，当前 ${currentItems} 张（${currentPieces} 片）`;
  e.unit = 'scrolls';
  return e;
}

/**
 * `POST /admin/assets/grant`（§5.1）：**仅 `chief_editor`**（路由层鉴权）。
 *
 * 校验（任一不通过即整体不写）：手机号格式 400；用户不存在 404；`reason` 必填 400；
 * `delta` 至少一项且至少一项非 0 → 400；每项整数 → 400；负向扣减不足 → **409 资产不足**（整单拒绝，
 * 一字节不写）；发放后 `fragments ≥ 10` → 即时合成（复用账本合成函数，不拒绝、不截断）。
 *
 * §A2（六类资产，2026-09-26 裁定）：`jades` 之后追加 **兰帖 `scrolls`**（键值以**片**计，
 * 1 张 = 100 片；正向 `addLot(..., { expires_at: null })`（**必须显式 null**，无「默认永久」口径）、
 * 负向按张预检后 `chargeLots(..., 'scroll')`）与 **兰帖残页 `scroll_fragments`**（正向走账本
 * `addScrollFragments`（满 100 自动合成 1 张，**不拒绝、不截断**，同 `fragments` 先例）、负向预检后标量扣减）。
 *
 * 副作用顺序（同一请求内）：① `jiazu_assets`（批次 / FIFO 扣减 / 碎片取余）→
 * ② `jiazu_ops_logs` 追加 `OpsLog` → ③ 目标用户 `txs` 追加 `Tx{type:'admin_grant'}`。
 * `evidence` 并入 `reason`（`'<原因>｜依据：<依据>'`，不新增集合字段，§5.2）。
 *
 * @param {string} operator 操作人手机号（路由取自 JWT，**不接受前端传**）
 * @param {{target_phone?:string, delta?:object, reason?:string, evidence?:string}} input
 * @param {Date} [now]
 */
export async function grantAssets(operator, input = {}, now = new Date()) {
  // ① 入参校验（手机号 / 原因 / delta 形状）——不依赖 IO
  const targetPhone = trimmed(input?.target_phone);
  if (!PHONE_RE.test(targetPhone)) throw httpError(400, ERR_PHONE_FORMAT);
  // ② 用户存在性（404 口径同 /admin/set-role）
  const target = await colGet(USERS_COL, targetPhone);
  if (!target) throw httpError(404, `${ERR_USER_NOT_FOUND}: ${targetPhone}`);
  const rawReason = trimmed(input?.reason);
  if (!rawReason) throw httpError(400, ERR_REASON_REQUIRED);
  const evidence = trimmed(input?.evidence);
  const reason = evidence ? `${rawReason}｜依据：${evidence}` : rawReason;
  const delta = normalizeDelta(input?.delta);

  // ③ 资产变更（sweep → 整单拒绝预检 → 批次追加 / FIFO 扣减 → 流水），与 ops log / Tx 同请求内完成
  const log = { id: opsLogId(), ts: isoOf(now), operator, target_phone: targetPhone, delta: { ...delta }, reason };
  const details = await withAssets(targetPhone, (user) => {
    sweep(user, now);

    // —— 负向预检：任一资产不足 → 409 整单拒绝（绝不部分扣减、绝不扣至负）——
    if (delta.fragments < 0) {
      const need = -delta.fragments;
      const current = toNonNegInt(user.fragments);
      if (current < need) throw fragmentsInsufficient(need, current);
    }
    let jadeTaken = null;
    if (delta.jades < 0) {
      const need = -delta.jades;
      const chargeable = (user.jades || []).filter((j) => j && !j.mounted_tree_id);
      const current = chargeable.length;
      if (current < need) throw assetInsufficient(need, current, 'jade');
      // 玉扣减顺序：FIFO（`expires_at` 升序），`null`（永久）视为最晚（§11-11）
      jadeTaken = chargeable
        .slice()
        .sort((a, b) => (a.expires_at ? Date.parse(a.expires_at) : Number.POSITIVE_INFINITY) - (b.expires_at ? Date.parse(b.expires_at) : Number.POSITIVE_INFINITY))
        .slice(0, need)
        .map((j) => j.id);
    }
    let seedsTaken = null;
    if (delta.seeds < 0) seedsTaken = chargeLots(user.seeds, -delta.seeds, 'seed').taken;
    let bamboosTaken = null;
    if (delta.bamboos < 0) bamboosTaken = chargeLots(user.bamboos, -delta.bamboos, 'bamboo').taken;
    // 兰帖（成品）：按**张**预检（片总数不足 need 片即拒），文案给「需求张数 + 当前张数 + 当前精确片数」
    let scrollsTaken = null;
    if (delta.scrolls < 0) {
      const needPieces = -delta.scrolls;
      const currentPieces = sumLots(user.scrolls);
      if (currentPieces < needPieces) throw scrollsInsufficient(needPieces, currentPieces);
      scrollsTaken = chargeLots(user.scrolls, needPieces, 'scroll').taken;
    }
    // 兰帖残页：标量预检（不足 409 整单拒绝）
    if (delta.scroll_fragments < 0) {
      const need = -delta.scroll_fragments;
      const current = toNonNegInt(user.scroll_fragments);
      if (current < need) throw scrollFragmentsInsufficient(need, current);
    }

    // —— 正向发放（批次：籽 / 竹片 365 天、玉永久，`source='admin'`）——
    if (delta.seeds > 0) addLot(user, 'seed', delta.seeds, { ttl_days: SEED_TTL_DAYS, source: 'admin', now });
    if (delta.bamboos > 0) addLot(user, 'bamboo', delta.bamboos, { ttl_days: BAMBOO_TTL_DAYS, source: 'admin', now });
    if (delta.jades > 0) {
      for (let i = 0; i < delta.jades; i += 1) addLot(user, 'jade', 1, { expires_at: null, source: 'admin', now });
    }
    // 兰帖：**1 张 = 100 片，线上一律以片计** ⇒ 直接按片入一个批次（永久必须显式 null）
    if (delta.scrolls > 0) {
      addLot(user, 'scroll', delta.scrolls, { expires_at: null, source: 'admin', now });
    }
    // 碎片正向：走账本同一函数（`fragments += n` → 满 10 立即合成，§5.1 校验 7 / 单测 #5）
    let synthesized = 0;
    if (delta.fragments > 0) synthesized = addFragments(user, delta.fragments, now).synthesized;
    // 兰帖残页正向：走账本同一函数（满 100 立即合成 1 张，**不拒绝、不截断**，同 fragments 先例）
    if (delta.scroll_fragments > 0) addScrollFragments(user, delta.scroll_fragments, now);

    // —— 负向落账 ——
    if (delta.fragments < 0) user.fragments = Math.max(0, toNonNegInt(user.fragments) + delta.fragments);
    if (delta.scroll_fragments < 0) {
      user.scroll_fragments = Math.max(0, toNonNegInt(user.scroll_fragments) + delta.scroll_fragments);
    }
    if (jadeTaken) {
      const drop = new Set(jadeTaken);
      user.jades = (user.jades || []).filter((j) => !drop.has(j.id));
    }
    // 扣尽批次就地移除（§5-2-3：不留 qty=0 残留批）
    if (seedsTaken || bamboosTaken || scrollsTaken) {
      user.seeds = (user.seeds || []).filter((l) => toNonNegInt(l.qty) > 0);
      user.bamboos = (user.bamboos || []).filter((l) => toNonNegInt(l.qty) > 0);
      user.scrolls = (user.scrolls || []).filter((l) => toNonNegInt(l.qty) > 0);
    }

    // —— 收口：脏数据里的 ≥10 碎片顺带合成（不落「碎片 10、籽未生成」中间态）——
    if (Math.floor(Number(user.fragments) || 0) >= FRAGMENT_SYNTH_THRESHOLD) {
      synthesized += addFragments(user, 0, now).synthesized;
    }
    // 兰帖残页同口径收口（脏数据 ≥ 100 ⇒ 顺带合成，不落「残页 100 未合成」中间态）
    if (Math.floor(Number(user.scroll_fragments) || 0) >= SCROLL_FRAGMENT_SYNTH_THRESHOLD) {
      addScrollFragments(user, 0, now);
    }

    // —— 用户侧流水（§5.1 副作用 3）——
    const tx = recordTx(
      user,
      {
        type: TX_ADMIN_GRANT,
        delta,
        ref: {},
        desc: `运营发放：${reason}（log ${log.id}）`,
        operator,
      },
      now,
    );

    return {
      summary: {
        phone: targetPhone,
        fragments: toNonNegInt(user.fragments),
        seeds_total: sumLots(user.seeds),
        bamboos_total_pieces: sumLots(user.bamboos),
        jades: (user.jades || []).length,
        // §A3：兰帖域追加出参（字段名逐字取自账本 summarize 口径；既有字段一字未改）
        scroll_fragments: toNonNegInt(user.scroll_fragments),
        scrolls_total_pieces: sumLots(user.scrolls),
        synthesized,
        signin_date: user.signin_date || '',
        log_id: log.id,
        tx_id: tx.id,
      },
      seed_lots: (user.seeds || []).length,
      bamboo_lots: (user.bamboos || []).length,
      jade_ids_granted: delta.jades > 0 ? (user.jades || []).slice(-delta.jades).map((j) => j.id) : [],
    };
  });

  // ④ 管理侧审计（§5.3：两条台账都要写，缺一视为实现缺陷）
  await appendOpsLog(log);
  return { ok: true, summary: details.summary };
}

/** 追加一条 `OpsLog`（§5.3；保留符号，负值原样记录） */
export async function appendOpsLog(log) {
  const base = await colGet(OPS_LOGS_COL, OPS_LOGS_ID);
  const doc = base ? JSON.parse(JSON.stringify(base)) : blankOpsLogsDoc();
  doc.logs = Array.isArray(doc.logs) ? doc.logs : [];
  doc.logs.push({
    id: log.id,
    ts: log.ts,
    operator: log.operator,
    target_phone: log.target_phone,
    delta: { ...(log.delta || {}) },
    reason: log.reason,
  });
  await colSet(OPS_LOGS_COL, OPS_LOGS_ID, doc);
  return doc.logs[doc.logs.length - 1];
}

/**
 * `GET /admin/assets/logs`（§5.3）：仅 `chief_editor`（路由层鉴权）；
 * `operator?` / `phone?` 过滤可叠加；`limit?` 默认 50、上限 200。
 * 定序**完全确定**：先按 `ts` 倒序，**同刻（同一毫秒）时后写入者在前**（插入下标倒序）——
 * 不依赖 `Array#sort` 的稳定性，避免同毫秒两次 `grant` 的日志顺序随机。
 */
export async function opsLogs(filters = {}) {
  const operator = trimmed(filters.operator);
  const phone = trimmed(filters.phone);
  const raw = Number(filters.limit);
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), LOGS_LIMIT_MAX) : LOGS_LIMIT_DEFAULT;
  const doc = await colGet(OPS_LOGS_COL, OPS_LOGS_ID);
  let logs = Array.isArray(doc?.logs) ? doc.logs.slice() : [];
  if (operator) logs = logs.filter((l) => l?.operator === operator);
  if (phone) logs = logs.filter((l) => l?.target_phone === phone);
  // 定序完全确定：给每条日志带上插入下标，按「ts 倒序 → 同刻下标倒序」比较，再脱掉下标。
  // 绝不依赖 JS 稳定排序的隐式「保留插入序」（那会让同毫秒日志的顺序变成实现巧合）。
  const tsOf = (entry) => {
    const parsed = Date.parse(entry?.ts || 0);
    return Number.isFinite(parsed) ? parsed : 0; // 脏 ts 归一到 0，保证比较器恒有确定返回值
  };
  logs = logs
    .map((log, index) => ({ log, index, ts: tsOf(log) }))
    .sort((x, y) => y.ts - x.ts || y.index - x.index)
    .map((entry) => entry.log);
  return { logs: logs.slice(0, limit) };
}

/**
 * `GET /admin/assets/user`（§5.4）：仅 `chief_editor`（路由层鉴权）；查某用户资产总览
 * （字段名对齐 `/assets/summary` 公开形态，仅把「本人」改为 `phone`）。
 * **玉口径 = 全量原始记录**（`include_mounted`）：后台必须看到「已镶嵌玉去哪了、镶进哪棵树」
 * —— `jades` 枚数与 `jade_list` 都含已镶嵌、且保留 `mounted_tree_id`（用户面 `/assets/summary`
 * 仍只出未镶嵌，两端口径就此分开，见 `economy-ledger.summarize` 注释）。
 * 前置：`sweep(now)`（总额与明细均为结算后口径）。
 * §A4（2026-09-26 裁定）：追加兰帖域 5 个出参（`scroll_fragments` / `scroll_fragment_cap` /
 * `scrolls_total_pieces` / `scrolls_item_count` / `scroll_lots`，字段名逐字取自账本 `summarize()`）。
 */
export async function adminUserAssets(phone, now = new Date()) {
  const target = trimmed(phone);
  if (!target) throw httpError(400, ERR_MISSING_PHONE);
  const user = await colGet(USERS_COL, target);
  if (!user) throw httpError(404, `${ERR_USER_NOT_FOUND}: ${target}`);
  return withAssets(target, (assets) => {
    sweep(assets, now);
    const s = summarize(assets, now, { include_mounted: true });
    return {
      phone: target,
      fragments: s.fragments,
      seeds_total: s.seeds_total,
      bamboos_total_pieces: s.bamboos_total_pieces,
      jades: s.jades_total,
      seed_lots: s.seed_lots,
      bamboo_lots: s.bamboo_lots,
      jade_list: s.jades,
      // §A4：兰帖域追加 5 个出参（字段名**逐字**取自账本 `summarize()`，**不得另起名**）
      scroll_fragments: s.scroll_fragments,
      scroll_fragment_cap: s.scroll_fragment_cap,
      scrolls_total_pieces: s.scrolls_total_pieces,
      scrolls_item_count: s.scrolls_item_count,
      scroll_lots: s.scroll_lots,
      signin_date: s.signin_date,
    };
  });
}

// ==================== §7 账号注销（K10 注销前置） ====================

/**
 * 账号注销（§7.2）：**先挂单前置，后清空资产**。
 * ① 存在 `status='open'` 市集挂单 → **409「请先撤销未成交挂单」**（`openListingGuard`；**不自动撤单、
 *    不改挂单状态、不清资产**，`sold` / `cancelled` / `expired` 无碍）；
 * ② 通过 → 先写一条 `type='account_clear'` 流水，再整体置空六类资产与 `signin_date`（**不可恢复**）；
 * ③ **保留流水审计**（历史 `Tx` / `jiazu_ops_logs` / `jiazu_wallets` 不动）与 `jiazu_users` / `jiazu_anchors`。
 *
 * 六类口径（Kevin 2026-09-26 当面裁定，取代原「四类」写法）：`fragments` / `seeds` / `bamboos` / `jades`
 * **+ `scrolls`（兰帖，以**片**计）/ `scroll_fragments`（兰帖残页）**。兰帖批次 `qty` 线上**一律以片计**，
 * 故 `cleared.scrolls` / `delta.scrolls` 直接取 `sumLots`，**不做任何 ×100 / ÷100 换算**。
 *
 * @returns {Promise<{ok:true, phone:string, cleared:object, tx_id:string}>}
 */
export async function deleteAccount(phone, now = new Date()) {
  if (!phone) throw httpError(401, ERR_NOT_LOGGED_IN);
  await openListingGuard(phone, now); // ① 注销前置（K10 定稿）
  return withAssets(phone, (user) => {
    sweep(user, now);
    const cleared = {
      fragments: toNonNegInt(user.fragments),
      seeds: sumLots(user.seeds),
      bamboos: sumLots(user.bamboos),
      jades: (user.jades || []).length,
      // 兰帖域（六类）：`scrolls` 以**片**计（`sumLots` 直取，无 ×100 换算）；残页同口径取非负整数
      scrolls: sumLots(user.scrolls),
      scroll_fragments: toNonNegInt(user.scroll_fragments),
    };
    // ② 先写流水（审计记录保留），再整体置空；`delta` 符号保留、键名一律为真源资产键
    const tx = recordTx(
      user,
      {
        type: TX_ACCOUNT_CLEAR,
        delta: {
          fragments: -cleared.fragments,
          seeds: -cleared.seeds,
          bamboos: -cleared.bamboos,
          jades: -cleared.jades,
          scrolls: -cleared.scrolls,
          scroll_fragments: -cleared.scroll_fragments,
        },
        ref: {},
        desc: '账号注销：清空个人资产（不可恢复）',
      },
      now,
    );
    user.fragments = 0;
    user.seeds = [];
    user.bamboos = [];
    user.jades = [];
    user.scrolls = [];
    user.scroll_fragments = 0;
    user.signin_date = '';
    return { ok: true, phone, cleared, tx_id: tx.id, txs_kept: (user.txs || []).length };
  });
}

/** 只读资产快照转发（路由单点引入用；不另写一套） */
export { getAssets };
