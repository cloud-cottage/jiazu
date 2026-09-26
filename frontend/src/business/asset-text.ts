/**
 * 资产展示文案单点（玉标题 / 玉状态行 / 日期格式化）。
 *
 * 落点：**资产页（`pages/assets/index.vue` 的「我的玉」列表）** 与
 * **道具栏（`components/asset-inventory/` 的属性提示）** 共用本模块 —— 玉的状态文案以本模块为唯一真源，
 * 新增页面一律引用本模块，禁止再复制一套（同 `business/jade-ops.ts` 的「前端唯一副本」约定）。
 *
 * 已知例外（**既有代码，待后续批次收敛**，勿在本模块内追平）：
 * `pages/spirit/index.vue` 仍自带第三份手写副本（第 175 行「未镶嵌 · 可免费分解」、
 * 第 586 / 658 行的「有效期至 / 永久有效」拼装），本次未改该页；本模块的「唯一」仅就
 * 资产页 + 道具栏两条链路成立。
 *
 * 文案口径（逐字，与资产页原实现一致）：
 * - 标题 = `<短 id> · 有效期至 YYYY-MM-DD` / `<短 id> · 永久有效`；
 * - 状态行 = `已镶嵌至 <tree_id> · 不可分解` / `未镶嵌 · 可免费分解`；
 * - 日期空值 / 非法值 → `—`。
 *
 * 兰帖域（`docs/economy.spec.md` §15）追加单点：
 * - 兰帖 / 兰帖碎片的**展示名**与**状态文案**（`SCROLL_NAME` / `SCROLL_FRAGMENT_NAME` /
 *   `SCROLL_STATUS_PERMANENT` / `scrollFragmentSynthLine()`）**只在本模块定义** ——
 *   `business/inventory.ts` 的 `KIND_NAME` / `KIND_CONVERT` 与组件一律引用本模块，
 *   不在组件里散落中文字面；
 * - 兰帖**永久有效**（`ScrollLot.expires_at` 恒 `null`）⇒ 本模块只给「永久有效」，
 *   不提供任何「有效期至 / 最近到期」拼装（口径：兰帖不得排入到期排序或到期提示行）。
 */
import type { Jade } from './api';

/** `YYYY-MM-DD`（本地时区）；空值 → `—`，非法值原样返回 */
export function formatAssetDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 长 id 截断（> 14 字符 → 前 14 + `…`）；空 → `—` */
export function shortAssetId(id: string | undefined): string {
  if (!id) return '—';
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}

/** 玉的展示标题（永久玉显示「永久有效」） */
export function jadeTitle(j: Jade): string {
  return `${shortAssetId(j.id)} · ${j.expires_at ? `有效期至 ${formatAssetDate(j.expires_at)}` : '永久有效'}`;
}

/** 玉的状态行：已镶嵌（不可分解）/ 未镶嵌（可免费分解） */
export function jadeSubLine(j: Jade): string {
  return j.mounted_tree_id ? `已镶嵌至 ${j.mounted_tree_id} · 不可分解` : '未镶嵌 · 可免费分解';
}

/** 兰帖：展示名（逐字；单点 —— 组件 / 行囊逻辑不得另写一遍） */
export const SCROLL_NAME = '兰帖';

/**
 * 兰帖残页：展示名（逐字；单点）。
 * **2026-09-25 更名**：显示名「兰帖碎片」→「兰帖残页」（Kevin 当面给定）；字段名 `scroll_fragments`
 * 与接口入出参**一字未动**，本常量仍是页面 / 组件可见文案的唯一来源。
 */
export const SCROLL_FRAGMENT_NAME = '兰帖残页';

/**
 * 兰帖批次状态行（逐字）：兰帖**永久有效**（`ScrollLot.expires_at` 恒 `null`）
 * ⇒ 恒为「永久有效」，无「有效期至」形态（口径：不得排入到期排序 / 到期提示行）。
 */
export const SCROLL_STATUS_PERMANENT = '永久有效';

/**
 * 兰帖**锁定态**文案（逐字；单点）—— 续约申请等待对方确认期间，发起方自持的那张兰帖
 * 已被关系域的 `pending.locked_*` 占用（只占用、不扣除），行囊内该兰帖格须显示本行。
 * 判据由 `business/friends.ts` 从 `GET /friends` 的 `pending` 推导（不新增后端字段）。
 */
export const SCROLL_LOCK_TEXT = '续约待确认 · 锁定中';

/**
 * 兰帖【分解】相关文案（**单点**）—— 口径真源 = `docs/friend-domain.spec.md` §17-7 / §17-8（R-7）：
 * **1 张成品兰帖 = 100 片，分解返还 99 片**（每张留 1 片损耗；返 100 会在返还瞬间触发「满 100 自动合成」
 * ⇒ 分解成为空操作）。数值由调用方传入（`inventory.ts` 的常量），**本模块不复制比例常量**
 * （避免两模块互相 import 成环）。
 */

/** 兰帖分解确认标题（自绘确认层用） */
export const SCROLL_DECOMPOSE_TITLE = '⚠️ 分解兰帖确认';

/**
 * 兰帖分解确认正文（逐行渲染，不合并、不改标点）：
 * `count` 张、每张 `piecesPerItem` 片、每张留 `perLoss = piecesPerItem − refundPerItem` 片损耗。
 */
export function scrollDecomposeConfirmLines(
  count: number,
  piecesPerItem: number,
  refundPerItem: number,
): string[] {
  const n = Math.max(1, Math.floor(Number(count) || 1));
  const perLoss = Math.max(0, piecesPerItem - refundPerItem);
  const pieces = n * piecesPerItem;
  return [
    `本次将分解 ${n} 张${SCROLL_NAME}（每张 ${piecesPerItem} 片），共扣减 ${pieces} 片。`,
    `分解返还 ${n * refundPerItem} 片${SCROLL_FRAGMENT_NAME}（每张留 ${perLoss} 片损耗，共损耗 ${n * perLoss} 片）。`,
    `返还的${SCROLL_FRAGMENT_NAME}满 ${piecesPerItem} 片由后端自动合成 1 张${SCROLL_NAME}。`,
    '是否确认分解？',
  ];
}

/** 兰帖格属性提示层的分解比例行（**先让用户看到比例，再谈操作**） */
export function scrollDecomposeHintLine(piecesPerItem: number, refundPerItem: number): string {
  const perLoss = Math.max(0, piecesPerItem - refundPerItem);
  return `分解 1 张${SCROLL_NAME}：${piecesPerItem} 片 ⇒ 返还 ${refundPerItem} 片${SCROLL_FRAGMENT_NAME}（留 ${perLoss} 片损耗）`;
}

/**
 * 兰帖「格数 / 张数」两口径行（`docs/economy.spec.md` §14-13 —— **两者不是同一个数、不得混用**）：
 * - **格数**（展示层唯一口径）= 行囊占格，**含余数格**（整格 + 零头另占 1 格）；
 * - **张数**（整道具数，= 接口 `scrolls_item_count` 口径）= `floor(片总数 / ${piecesPerItem})`。
 * 实测同体例：**250 片 ⇒ 3 格 / 2 张**。行囊内**一律以格数**渲染占格与逐格角标。
 */
export function scrollCaliberLine(cells: number, items: number, piecesPerItem: number): string {
  return `行囊口径：占 ${cells} 格（含余数格）· 整道具 ${items} 张（1 张 = ${piecesPerItem} 片）—— 格数与张数不同数，勿混`;
}

/** 余数格（不足 1 张成品兰帖）⇒【分解】未达标原因（**必须显示出来，不得静默**） */
export function scrollRemainderReasonLine(count: number, piecesPerItem: number): string {
  return `本格为余数（${count} 片），不足 1 张${SCROLL_NAME}（${piecesPerItem} 片），无法分解`;
}

/** 可分解的兰帖被待确认的续约申请锁定（`scrollLock`）⇒【分解】未达标原因（**必须显示，不得静默**） */
export function scrollLockedReasonLine(): string {
  return `续约申请待确认：锁定的${SCROLL_NAME}不可分解（可解除该关系或等对方处理后重试）`;
}

/**
 * 兰帖碎片的状态行：满 `perItem` 片由**后端**自动合成 1 张兰帖（前端只展示、不做合成）。
 * 逐字 = `满 <perItem> 自动合成 1 张兰帖`；`perItem` 由 `business/inventory.ts` 的常量传入
 * （避免两模块互相 import 成环）。
 */
export function scrollFragmentSynthLine(perItem: number): string {
  return `满 ${perItem} 自动合成 1 张${SCROLL_NAME}`;
}

// ============ 道具诗句（Kevin 2026-09-25 逐字给定 · **唯一真源**） ============

/**
 * 诗句键（与 `business/inventory.ts` 的 `InventoryKind` **同名同集**）。
 * 本模块**不反向 import** `inventory.ts`（避免两模块互相 import 成环 —— 同「比例 / 上下限数值由调用方传入」的既有约定）。
 */
export type AssetPoemKey = 'bamboo' | 'scroll' | 'scrollFragment' | 'jade' | 'seed' | 'fragment';

/**
 * 六类道具的诗句（**逐字**，含出处；一字不改、不补全、不自造）。
 *
 * **单一来源**：组件 / 页面一律经 `assetPoem()` 引用本表；**任何 `.vue` / 其它模块不得再写一份诗句字面**
 * （同本模块「展示名 / 状态文案单点」的约定）。
 * **展示位置（Kevin 已定）** = 道具属性提示层内（`asset-inventory.vue` 的 `.inv-tip`，z-index 1010）：
 * 点开某道具时，层内显示该道具对应的诗句。
 */
export const ASSET_POEMS: Record<AssetPoemKey, string> = {
  bamboo: '书于简策，以诏子孙，敦睦九族。——古·佚名',
  scroll: '金兰幸有同心契，莫负山中一段香。——明·唐寅《题画》',
  scrollFragment: '用证兰盟，互通芳谱。——古·佚名',
  jade: '五龙一门，金友玉昆。——魏晋·无名氏《秦雍为辛氏语》',
  seed: '榴枝婀娜榴实繁，榴膜轻明榴子鲜。——唐·李商隐《石榴》',
  fragment: '千房同膜，千子如一。——西晋·潘尼《安石榴赋》',
};

/** 取某类道具的诗句（键 = `InventoryItem.kind`）；未知键 → 空串（**不渲染该行**，不新造文案） */
export function assetPoem(kind: string): string {
  return ASSET_POEMS[kind as AssetPoemKey] || '';
}

// ============ 任务中心（批3）用的**既有**物品展示名与单位（单点） ============

/**
 * 石榴籽碎片 / 竹片的展示名与单位（**逐字**；与 `business/inventory.ts` 的 `KIND_NAME.fragment = '石榴籽碎片'`
 * 及 `KIND_QTY_UNIT.fragment = '片'` 同字面 —— 两册各写一份会漂移，新增页面一律引用本模块，勿再抄一遍）。
 * 「竹片」= 既有竹片的**片**口径（`docs/task-center.spec.md` §6-1：「竹简碎片」= 既有竹片，**不新增碎片层**），
 * 故本模块**不**新造「竹简碎片」这个名字。
 */
export const SEED_FRAGMENT_NAME = '石榴籽碎片';
/** 石榴籽碎片量词（碎片类一律「片」；2026-09-26 由「个」改定） */
export const SEED_FRAGMENT_UNIT = '片';
export const BAMBOO_PIECES_NAME = '竹片';
export const BAMBOO_PIECES_UNIT = '片';

/**
 * 兰帖片数单位（**恒「片」**）。
 * 「张」是**整道具数**的量词（1 张 = 100 片），片数是**另一个量**；凡数字为片数时一律标「片」
 * （`docs/economy.spec.md` §14-13 ①格数 / ②张数 两口径不得混用；2026-09-26 量词裁定 A5）。
 * 单点：行囊提示层的兰帖数量行由 `business/inventory.ts` 引用本常量，勿在组件里散落「片」字面。
 */
export const SCROLL_PIECES_UNIT = '片';

/**
 * 兰帖整道具（张）的量词（**恒「张」**；1 张 = 100 片）。
 * 单点：数字为**整道具数**（张）时经本常量拼装；数字为**片数**时一律用 `SCROLL_PIECES_UNIT`。
 * 本常量是「张」的**唯一字面**，三处同源（无一例外，勿再抄一遍）：
 * ① 本常量 `asset-text.ts` 的 `SCROLL_ITEM_UNIT`；
 * ② `business/inventory.ts` 的 `KIND_QTY_UNIT.scroll`（行囊角标 / 余数格提示 / 换算依据行）；
 * ③ `business/inventory.ts` 的 `KIND_ITEM_UNIT.scroll`（溢出行的道具计数）。
 * ②③ 现均**引用本常量**（`inventory.ts` 已从本模块导入；方向与 `SCROLL_NAME` / `SCROLL_FRAGMENT_NAME` 一致，不成环）。
 */
export const SCROLL_ITEM_UNIT = '张';

// ============ 资产变动（delta）文案**单点**（资产页流水 + 后台资产变动日志共用） ============

/**
 * 兰帖 delta（`AssetDelta.scrolls`，线上**恒以片计**）→ 展示片段（**不含正负号**，符号由调用方按页面前缀）：
 * - 片数可被 `piecesPerItem` 整除 ⇒ `N 张兰帖`（N = 片数 ÷ perItem，**绝不出小数张**）；
 * - 否则 ⇒ `M 片兰帖`（数值即片数）。
 *
 * `piecesPerItem` 由调用方传入 `business/inventory.ts` 的 `SCROLL_PIECES_PER_ITEM`
 * （**本模块不复制比例常量**，避免两模块 `import` 成环 —— 同 `scrollFragmentSynthLine` / `scrollCaliberLine`
 * 的既有约定）。**换算式只有本函数一份**：`pages/assets/index.vue`（我的资产流水）与
 * `pages/admin/index.vue`（资产变动日志）一律经本函数，页面内**不得再写 `% 100`**。
 */
export function scrollDeltaLabel(pieces: number, piecesPerItem: number): string {
  const v = Number(pieces) || 0;
  return v % piecesPerItem === 0
    ? `${v / piecesPerItem} ${SCROLL_ITEM_UNIT}${SCROLL_NAME}`
    : `${v} ${SCROLL_PIECES_UNIT}${SCROLL_NAME}`;
}

/**
 * 兰帖残页 delta（`AssetDelta.scroll_fragments`，**片**）→ 展示片段（恒 `N 片兰帖残页`；
 * 残页不论是否满 100 都是**片**口径，不做任何张数换算）。
 */
export function scrollFragmentDeltaLabel(count: number): string {
  return `${Number(count) || 0} ${SEED_FRAGMENT_UNIT}${SCROLL_FRAGMENT_NAME}`;
}

/**
 * 资产字段名 → 展示名（**单点**；任务中心读接口出参的品类数量键经此渲染）。
 * 未知字段 → **原样返回字段名**（绝不新造中文名，也绝不猜品类）。
 */
export function assetNameOf(field: string): string {
  const key = String(field ?? '');
  if (key === 'seed_fragments') return SEED_FRAGMENT_NAME;
  if (key === 'bamboo_pieces') return BAMBOO_PIECES_NAME;
  if (key === 'scroll_fragments') return SCROLL_FRAGMENT_NAME;
  return key;
}
