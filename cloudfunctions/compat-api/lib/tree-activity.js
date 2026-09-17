/**
 * 家族树活跃度聚合（`GET /tree/rank` → `activity`）
 *
 * 口径（派单 · 口径 A）：某树的「近 30 天互动事件数」= 四类申请集合里**涉及该树**的记录条数。
 * - 涉及判定：记录的 `tree_id` / `from_tree` / `to_tree` 任一等于该树（见 eventTrees）；
 *   婚姻记录对 `from_tree` 与 `to_tree` **各计 1 次**（两棵树各自 +1）。
 * - 认祖 / 建谱只按记录的 `tree_id` 计入；`master_tree_id` **不计入**（不是本树的互动）。
 * - 时间取值顺序 `created_at` → `ts` → `handled_at` → `decided_at`；全部缺失或无法解析为合法时间 → 该条不计入。
 * - 窗口判定 `t >= now - windowDays * 24 * 3600 * 1000`（含等号边界）。
 * - 集合不存在 / 为空 / 读取抛错 → 返回 0，绝不抛（活跃度是附属字段，不得拖垮 /tree/rank）。
 */
import { colAll } from './store.js';

/** 申请/互动事件集合（逐字，与 index.js 实际写入的集合名一致） */
export const EVENT_COLLECTIONS = [
  'jiazu_join_requests',
  'jiazu_marriage_requests',
  'jiazu_founder_requests',
  'jiazu_clan_requests',
];

export const WINDOW_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;
/** 时间字段取值顺序（先取到的合法值即用；都不合法 → 该条不计入） */
export const TIME_FIELDS = ['created_at', 'ts', 'handled_at', 'decided_at'];

/**
 * 该记录涉及的全部 tree_id：取 `tree_id` / `from_tree` / `to_tree`，非空且去重（保持字段顺序）。
 * @param {object} rec
 * @returns {string[]}
 */
export function eventTrees(rec) {
  const out = [];
  for (const key of ['tree_id', 'from_tree', 'to_tree']) {
    const raw = rec?.[key];
    if (raw === undefined || raw === null) continue;
    const id = String(raw).trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 记录的互动时间（毫秒时间戳）；无合法时间 → null */
function eventTimeMs(rec) {
  for (const field of TIME_FIELDS) {
    const raw = rec?.[field];
    if (raw === undefined || raw === null || raw === '') continue;
    if (typeof raw === 'number') {
      if (Number.isFinite(raw)) return raw;
      continue;
    }
    const ms = Date.parse(String(raw));
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/** now → 毫秒时间戳；不可解析 → NaN */
function toMs(now) {
  if (now instanceof Date) return now.getTime();
  if (typeof now === 'number') return Number.isFinite(now) ? now : NaN;
  if (now === undefined || now === null || now === '') return Date.now();
  return Date.parse(String(now));
}

/**
 * 纯函数：records 中「涉及 treeId 且在 [now - windowDays, now] 内」的条数。
 * @param {object[]} records
 * @param {string} treeId
 * @param {Date|number|string} now
 * @param {number} [windowDays=30]
 * @returns {number}
 */
export function countRecentEvents(records, treeId, now, windowDays = 30) {
  const id = String(treeId ?? '').trim();
  if (!id) return 0;
  const nowMs = toMs(now);
  if (!Number.isFinite(nowMs)) return 0;
  const days = Number.isFinite(Number(windowDays)) ? Number(windowDays) : 30;
  const from = nowMs - days * DAY_MS; // 含等号边界（t >= from）
  let n = 0;
  for (const rec of records || []) {
    if (!rec || typeof rec !== 'object') continue;
    if (!eventTrees(rec).includes(id)) continue;
    const t = eventTimeMs(rec);
    if (t === null) continue;
    if (t >= from) n += 1;
  }
  return n;
}

/**
 * 某树的近 30 天互动事件数（读 4 个集合逐条判定后求和）。
 * 任何异常（集合缺失 / 读取失败 / meta 不可用）→ 0，绝不抛。
 * @param {string} treeId
 * @param {{now?: Date|number|string}} [opts]
 * @returns {Promise<number>}
 */
export async function treeActivity(treeId, { now } = {}) {
  try {
    const id = String(treeId ?? '').trim();
    if (!id) return 0;
    const at = now === undefined ? new Date() : now;
    const atMs = toMs(at);
    if (!Number.isFinite(atMs)) return 0;
    let total = 0;
    for (const col of EVENT_COLLECTIONS) {
      let records = [];
      try {
        records = await colAll(col);
      } catch {
        records = []; // 集合不存在 / 读取抛错 → 该集合按 0 计
      }
      if (!Array.isArray(records) || records.length === 0) continue;
      try {
        total += countRecentEvents(records, id, atMs, WINDOW_DAYS);
      } catch {
        /* 单集合判定异常不影响其余集合 */
      }
    }
    return total;
  } catch {
    return 0;
  }
}
