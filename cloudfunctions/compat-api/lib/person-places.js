/**
 * 出生地 / 居住地（结构化）—— 归一、比对与展示的**唯一真源**（纯函数，零 IO，零 npm 依赖）
 *
 * 契约 v2（Zang 冻结，逐条对应；实现不得自行改口径）：
 *   C1 `people.<handle>.birth_place` = `{ origin_code: '<6 位码或空串>', note: '<备注文本>' }`（两段都存）；
 *   C2 `people.<handle>.residence_places` = `[{ origin_code, note }]`，**上限 9 条**，顺序即展示顺序，无则 `[]`；
 *   C3 读侧容错：历史字符串 → `{ origin_code:'', note:<原串> }`；`null` / 未定义 / 非法类型 →
 *      `{ origin_code:'', note:'' }`；`residence_places` 非数组 → `[]`。**任何输入都不得抛错**；
 *   C5 计费/无改动判定按**规范化后**逐字段比对（数组逐项 + 长度）；
 *   C7 展示串一律走 `lib/geo.js` 的 `resolveOrigin()`（本模块**不另写一套**行政区划反查）；
 *   C8 tree-meta 镜像回写的 `origin_code` / `origin` 由 `treeOriginPatchOf()` 统一给出；
 *   C10 第 10 条由写路径 400 拒绝（文案见 `RESIDENCE_LIMIT_MESSAGE`）；
 *   C1′/C2′ 写路径**形状闸门**：显式提供（非 `undefined` / 非 `null`）的 `residence_places` 必须是数组、
 *      `birth_place` 必须是对象 → 否则 400（见 `assertPlaceFieldShapes`）。C3 的归一只是**读侧容错**，
 *      不得被写路径当「清洗」用：归一后的 `[]` / 空对象会把原值静默清空（且照收 1 片）。
 *   R1 非空 `origin_code` 必须是已登记码 —— 未知码 → 400「出生地行政区划代码无效：<码>」
 *      （`birth_place` 与 `residence_places` 每条同判；见 `assertKnownOriginCodes`）。
 *
 * 展示串口径（C7）：`place` = 码反查展示串，**空码则空串**（备注落在 `place_note`，不冒充展示串）；
 * tree-meta 的 `origin`（C8）另有兜底口径：无码时用备注兜底（`note || ''`）。
 */
import { isKnownOriginCode, resolveOrigin } from './geo.js';

/** 居住地上限（C2 / C10） */
export const MAX_RESIDENCE_PLACES = 9;

/** 第 10 条拒绝文案（C10；后端 400，不得只靠前端） */
export const RESIDENCE_LIMIT_MESSAGE = '居住地最多 9 条';

/** 居住地形状拒绝文案（写路径 C2′：显式提供但非数组 → 400） */
export const RESIDENCE_SHAPE_MESSAGE = '居住地格式无效，应为数组';

/** 出生地形状拒绝文案（写路径 C1′：显式提供但非对象 → 400） */
export const BIRTH_PLACE_SHAPE_MESSAGE = '出生地格式无效，应为对象';

/** 树 JSON 里参与出生地 / 居住地的字段名（写路径白名单 / 始祖放行白名单共用同一份） */
export const PERSON_PLACE_FIELDS = ['birth_place', 'residence_places'];

/** 文本归一：`null` / `undefined` → `''`，其余 trim（码与备注同一口径） */
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * 单个地点项归一 → 恒为 `{ origin_code, note }`（C1 / C3）：
 *   · 字符串（历史形态）→ `{ origin_code:'', note:<原串> }`；
 *   · 对象 → 取 `origin_code` / `note` 字段（缺字段 / 非法值 → 空串）；
 *   · `null` / 未定义 / 数字 / 布尔 / 数组 → `{ origin_code:'', note:'' }`。
 */
export function normalizeBirthPlace(raw) {
  if (typeof raw === 'string') return { origin_code: '', note: raw.trim() };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { origin_code: '', note: '' };
  return { origin_code: text(raw.origin_code), note: text(raw.note) };
}

/** 居住地数组归一 → 恒为数组（非数组 → `[]`，逐项归一同上）；**不截断**（上限由 assertResidencePlacesLimit 拦） */
export function normalizeResidencePlaces(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => normalizeBirthPlace(item));
}

/** C10：第 10 条 → `status=400` 抛错（写路径与路由共用同一判据与文案） */
export function assertResidencePlacesLimit(raw) {
  if (Array.isArray(raw) && raw.length > MAX_RESIDENCE_PLACES) {
    const err = new Error(RESIDENCE_LIMIT_MESSAGE);
    err.status = 400;
    throw err;
  }
  return true;
}

/** `birth_place` 合法形状 = 非空对象且非数组（`{ origin_code, note }` 两段） */
const isBirthPlaceShape = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** 形状拒绝错误（`status=400`；路由用 `errorStatusOf(e, 400)` 落 400） */
function shapeError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * 写路径形状闸门（C1′/C2′；**路由预检与写路径共用同一判据**）：
 * 显式提供（非 `undefined` / 非 `null`）的 `residence_places` 必须是数组、
 * `birth_place` 必须是对象 → 否则 `status=400` 抛错，**不扣费、不落盘、不动原值**。
 *
 * 存在的理由（实测缺陷）：非数组 `residence_places` 经 `normalizeResidencePlaces` 归一为 `[]`，
 * 写路径会把它当成「清空居住地」照常落盘并收 1 片；非对象 `birth_place`（历史字符串 / 数字 / 数组）
 * 归一后丢掉 `origin_code`，同样静默覆盖原出生地。归一是**读侧**容错口径，不是写侧清洗。
 * `undefined` / `null`（未提供）一律放行 —— 等同不改写，与既有口径一致。
 * @returns {true} 通过
 * @throws {Error} `status=400`
 */
export function assertPlaceFieldShapes(body) {
  const b = body || {};
  if (b.residence_places !== undefined && b.residence_places !== null && !Array.isArray(b.residence_places)) {
    throw shapeError(RESIDENCE_SHAPE_MESSAGE);
  }
  if (b.birth_place !== undefined && b.birth_place !== null && !isBirthPlaceShape(b.birth_place)) {
    throw shapeError(BIRTH_PLACE_SHAPE_MESSAGE);
  }
  return true;
}

/** 出生地内容是否非空（码或备注任一有值）—— 读侧决定是否输出 `profile.birth` 用 */
export function hasPlaceContent(raw) {
  const p = normalizeBirthPlace(raw);
  return !!p.origin_code || !!p.note;
}

/** 出生地是否相同（规范化后逐字段；历史字符串与对象同一口径） */
export function sameBirthPlace(a, b) {
  const x = normalizeBirthPlace(a);
  const y = normalizeBirthPlace(b);
  return x.origin_code === y.origin_code && x.note === y.note;
}

/** 居住地是否相同（规范化后**逐项 + 长度**，顺序敏感 —— 顺序即展示顺序） */
export function sameResidencePlaces(a, b) {
  const x = normalizeResidencePlaces(a);
  const y = normalizeResidencePlaces(b);
  if (x.length !== y.length) return false;
  return x.every((v, i) => v.origin_code === y[i].origin_code && v.note === y[i].note);
}

/**
 * 读响应形状（C7）：`{ place, place_code, place_note }`。
 * `place` = 码反查展示串（`resolveOrigin().display`），**空码 / 未知码 → 空串**（备注不冒充展示串）。
 */
export function placeViewOf(raw) {
  const p = normalizeBirthPlace(raw);
  return {
    place: p.origin_code ? resolveOrigin(p.origin_code).display : '',
    place_code: p.origin_code,
    place_note: p.note,
  };
}

/** 读响应形状数组（C7）：居住地逐项转 `{ place, place_code, place_note }`，顺序不变 */
export function residenceViewOf(raw) {
  return normalizeResidencePlaces(raw).map((item) => placeViewOf(item));
}

/**
 * tree-meta 镜像补丁（C8）：`{ origin_code, origin }`。
 * `origin` = `code ? resolveOrigin(code).display : (note || '')`（无码时用备注兜底）。
 */
export function treeOriginPatchOf(raw) {
  const p = normalizeBirthPlace(raw);
  return {
    origin_code: p.origin_code,
    origin: p.origin_code ? resolveOrigin(p.origin_code).display : p.note || '',
  };
}

/** 未知码拒绝文案（R1；与 `PUT /tree-meta` **逐字同口径**，不得另起措辞） */
export function unknownOriginCodeMessage(code) {
  return `出生地行政区划代码无效：${code}`;
}

/**
 * R1（Zang 2026-09-20 裁定）：请求体里**非空**的 `origin_code` 必须是已登记的 6 位码。
 *
 * 覆盖 `birth_place.origin_code` 与 `residence_places[]` **每一条**（含历史字符串形态：归一后无码 ⇒ 放行）。
 * 空码 = 合法「未结构化」，一律放行；未知码 / 非 6 位 → `status=400` + 逐字文案。
 * 目的：脏码不得从**节点**渗进树（进而被 C8′ 镜像到 tree-meta），与 `PUT /tree-meta` 同闸门。
 * @returns {true} 通过
 * @throws {Error} `status=400`（路由用 `errorStatusOf(e, 400)` 落 400）
 */
export function assertKnownOriginCodes(body) {
  const b = body || {};
  const bad = [];
  if (b.birth_place !== undefined && b.birth_place !== null) {
    const code = normalizeBirthPlace(b.birth_place).origin_code;
    if (code && !isKnownOriginCode(code)) bad.push(code);
  }
  if (b.residence_places !== undefined && b.residence_places !== null) {
    for (const item of normalizeResidencePlaces(b.residence_places)) {
      if (item.origin_code && !isKnownOriginCode(item.origin_code)) bad.push(item.origin_code);
    }
  }
  if (bad.length) {
    const err = new Error(unknownOriginCodeMessage(bad[0]));
    err.status = 400;
    throw err;
  }
  return true;
}

/**
 * 请求体是否**只**含出生地 / 居住地两项（C6 始祖放行判据）：
 * 显式提供（非 `undefined` / 非 `null`）的键必须非空且全在白名单内 —— 空 body → `false`（照旧 403）。
 */
export function isPlaceFieldsOnly(body) {
  const b = body || {};
  const keys = Object.keys(b).filter((k) => b[k] !== undefined && b[k] !== null);
  return keys.length > 0 && keys.every((k) => PERSON_PLACE_FIELDS.includes(k));
}
