/**
 * 出生地 / 居住地 —— 纯逻辑（H5 与小程序共用；零请求、无浏览器 DOM 依赖）
 *
 * 契约 v2（Zang 冻结，前后端同一形状）：
 *   · 树 JSON `people.<handle>.birth_place`      = `{ "origin_code": "<6 位码或空串>", "note": "<备注>" }`
 *     （历史的字符串旧值由后端归一，前端一律按对象处理）
 *   · 树 JSON `people.<handle>.residence_places` = `[{ "origin_code": "", "note": "" }]`
 *     —— **上限 9 条**，顺序即展示顺序；后端对第 10 条返回 400，故前端必须先在 UI 层拦住。
 *   · 读响应由后端派生：`profile.birth = { date, place, place_code, place_note }` 与顶层
 *     `residence_places: [{ place, place_code, place_note }]`（`place` = 码反查后的展示串；空码 → 空串）。
 *   · 提交（`PUT /people/<handle>`）只发**原始码 + 备注**，**不得**提交后端派生的 `place`。
 *
 * 展示串真源在后端写路径（`cloudfunctions/compat-api/lib/geo.js` 的 `resolveOrigin()`）；
 * 本模块的 `placeDisplayOf()` **只用于界面展示**，绝不落库（AGENTS.md §2.3）。
 */
import type { PersonPlaceInput, PersonPlaceView } from './types';

/** 居住地条数上限（契约 v2；后端对第 10 条返回 400 → 前端先行拦截） */
export const MAX_RESIDENCE_PLACES = 9;

/** 码反查展示串与备注之间的分隔符（备注为空时不出现在展示串里） */
export const PLACE_NOTE_SEP = ' · ';

/** 空出生地（契约 v2 的空值形状：空码 + 空备注；提交时字段不得省略） */
export function emptyPlaceInput(): PersonPlaceInput {
  return { origin_code: '', note: '' };
}

/** 文本归一：`undefined` / `null` / 其它类型 → `''`；其余 trim（真源字段可能缺失，不得透传） */
function text(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

/**
 * 任意来源的出生地 / 居住地 → 编辑表单形状 `{ origin_code, note }`。
 * 兼容三种入参：
 *   · 读响应派生形状（`place_code` / `place_note`）
 *   · 树 JSON 形状（`origin_code` / `note`）
 *   · 后端归一前的历史字符串值（整体归入备注，不当作码）
 */
export function normalizePlace(v: unknown): PersonPlaceInput {
  if (typeof v === 'string') return { origin_code: '', note: v.trim() };
  if (!v || typeof v !== 'object') return emptyPlaceInput();
  const o = v as Record<string, unknown>;
  const code = o.origin_code !== undefined ? o.origin_code : o.place_code;
  const note = o.note !== undefined ? o.note : o.place_note;
  return { origin_code: text(code), note: text(note) };
}

/** 空条目：既无码也无备注（不算一条，保存时丢弃、也不计入 9 条上限） */
function isBlankPlace(v: unknown): boolean {
  const p = normalizePlace(v);
  return !p.origin_code && !p.note;
}

/**
 * 列表归一 + **丢弃空条目**；顺序原样保留（顺序即展示顺序）。
 * 两处使用：读取回填（响应 → 表单）与提交装配（表单 → 请求体）。
 */
export function prunePlaces(list: unknown): PersonPlaceInput[] {
  const rows = Array.isArray(list) ? list : [];
  return rows.filter((r) => !isBlankPlace(r)).map(normalizePlace);
}

/** 逐项 + 长度比对（顺序敏感）；两侧都先丢弃空条目再比，故「只加了一行空行」不算改动 */
export function placesDirty(cur: unknown, base: unknown): boolean {
  const a = prunePlaces(cur);
  const b = prunePlaces(base);
  if (a.length !== b.length) return true;
  return a.some((p, i) => p.origin_code !== b[i].origin_code || p.note !== b[i].note);
}

/**
 * 读响应派生形状的展示串 = 码反查展示串 + 备注。
 * 备注为空 → 只有展示串（不带分隔符）；无码的旧数据 → 只有备注。
 */
export function placeDisplayOf(v: unknown): string {
  if (!v || typeof v !== 'object') return '';
  const o = v as Record<string, unknown>;
  const place = text(o.place);
  const note = text(o.place_note);
  if (!note) return place;
  if (!place) return note;
  return `${place}${PLACE_NOTE_SEP}${note}`;
}

/** 读响应派生形状归一：三项全空 → `undefined`（= 无数据，界面不渲染该行） */
export function placeViewOf(v: unknown): PersonPlaceView | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const view: PersonPlaceView = {
    place: text(o.place),
    place_code: text(o.place_code),
    place_note: text(o.place_note),
  };
  return view.place || view.place_code || view.place_note ? view : undefined;
}

/** 居住地读响应列表归一（非法入参 / 缺字段 → `[]`；空条目一律丢弃） */
export function placeViewsOf(list: unknown): PersonPlaceView[] {
  const rows = Array.isArray(list) ? list : [];
  return rows.map(placeViewOf).filter((v): v is PersonPlaceView => !!v);
}
