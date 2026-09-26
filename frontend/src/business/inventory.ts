/**
 * 道具栏（背包）纯逻辑：兑换常量 + 36 栏位装配 + 插入式重排。
 *
 * 口径（Kevin 口径 v3 + `docs/economy.spec.md` §15，逐条落地；均为纯函数 / 纯数据，跨端无 DOM）：
 * - **整堆格**：竹简 `floor(bamboos_total_pieces / 100)` 格、石榴籽 `floor(seeds_total / 9999)` 格、
 *   **兰帖 `floor(Σ scrolls[].qty / 100)` 格（100 片 = 1 张，与竹简同构）**、
 *   石榴籽玉 **1 枚 = 1 格**；角标 = 该类的道具量上限（100 片 / 9999 颗 / 100 片 / 1 枚）；
 *   **玉格不显示数量角标**（`badge = false`，模板据此不渲染角标）；
 * - **玉只计未镶嵌**：`summary.jades` 里 `mounted_tree_id` 非空的玉**不入行囊、不渲染、不计格**
 *   （口径：已镶嵌玉不属于用户了）⇒ 玉格数 / 占格数 / 溢出**一律只按未镶嵌玉计**；
 * - **余数格**：竹简 / 籽 / 兰帖 `% 每格量 > 0` 时**另加 1 格**，角标显示**实际余量**（如 37 片 / 5925 颗）；
 * - **碎片格**：`fragments > 0` 即占 1 格（1–9 片均占 1 格，0 片不占），角标显示**实际个数**（如 3）；
 *   **兰帖碎片（`scroll_fragments`）同口径**：`> 0` 即占 1 格、角标 = **实际个数**（1–99 片仍占 1 格，上限 99、
 *   满 100 由后端自动合成 1 张兰帖 ⇒ 前端只展示、不判合成）；
 *   **v2 的「碎片恒 0 格」与「零头行」已彻底废弃**（模板 / 样式 / 数据字段 / 逻辑一并删除，不留死代码）；
 * - **兰帖永久有效**（`ScrollLot.expires_at` 恒 `null`）⇒ 兰帖格 `expiresAtMs = Infinity`，
 *   **不排入到期排序、不渲染任何「最近到期 / 有效期至」行**（与玉的永久批次同体例）；
 * - **默认序**（**2026-09-25 变更 · 取代 Z-9**）：竹简 → 兰帖 → 兰帖残页 → 石榴籽玉 → 石榴籽 → 石榴籽碎片；
 *   同类内**到期近的在前**，永久有效的玉排该类最后，
 *   **余数格排在该类最后一个**；同到期以**稳定 id** 兜底 ⇒ 默认序确定可复现；占用格连续排 1..N，
 *   空格在 N+1..36；
 * - **溢出**：占格需求 = 标题「N / 36 格」的 N，> `SLOT_COUNT` 时前 36 格按默认序填充，
 *   **超出的道具不占格**，改为按类型汇总的溢出提示行（玉 → 「背包空间不足，无法合成」；
 *   籽 / 竹简 / 碎片 / **兰帖 / 兰帖碎片** → 「空间不足，无法持有」；玉行恒在最前，
 *   其余各类按默认序：竹简 → 兰帖 → 籽 → 兰帖碎片 → 石榴籽碎片）；
 * - **重排**：`moveItem` = 插入式（口径同 `docs/sibling-order.spec.md` §9 的拖曳），只在已占用格
 *   之间生效；本模块不持有任何状态 ⇒ 显示顺序由调用方（组件内存）决定，刷新即回默认序。
 */
import type { AssetsSummary, BambooLot, Jade, SeedLot } from './api';
import {
  SCROLL_FRAGMENT_NAME,
  SCROLL_ITEM_UNIT,
  SCROLL_NAME,
  SCROLL_PIECES_UNIT,
  SCROLL_STATUS_PERMANENT,
  formatAssetDate,
  jadeSubLine,
  jadeTitle,
  scrollFragmentSynthLine,
} from './asset-text';
import type { ScrollLot, ScrollSummaryFields } from './types';

/** 石榴籽：9999 颗 = 1 个道具 */
export const SEEDS_PER_ITEM = 9999;
/** 石榴籽玉：1 枚 = 1 个道具 */
export const JADES_PER_ITEM = 1;
/** 竹简：100 片 = 1 个道具 */
export const BAMBOO_PIECES_PER_ITEM = 100;
/** 兰帖：100 片 = 1 张（与竹简 100 片/格**数值相同、物品不同** ⇒ 各自持有常量，**不得共用**） */
export const SCROLL_PIECES_PER_ITEM = 100;
/** 石榴籽碎片：10 片 = 1 颗石榴籽（服务端 `fragment_cap = 9` ⇒ 实测 1–9 片，仍占 1 格） */
export const FRAGMENTS_PER_ITEM = 10;
/**
 * 兰帖碎片：100 片 = 1 张兰帖（服务端 `scroll_fragment_cap = 99` ⇒ 实测 1–99 片仍占 1 格；
 * 满 100 由**后端**自动合成 1 张兰帖，前端只展示）。与石榴籽碎片各自持有常量，**不得共用**。
 */
export const SCROLL_FRAGMENTS_PER_ITEM = 100;
/** 道具栏位总数：6 × 6 = 36 */
export const SLOT_COUNT = 36;
/** 道具栏列数（6 × 6；渲染端取本常量，避免第二套网格口径） */
export const SLOT_COLUMNS = 6;

/** 道具类型（决定图标 / 文案 / 换算 / 溢出提示）；`scroll` = 兰帖、`scrollFragment` = 兰帖碎片 */
export type InventoryKind = 'bamboo' | 'scroll' | 'jade' | 'seed' | 'scrollFragment' | 'fragment';

/** 格子形态：整堆（角标 = 该类上限）/ 余数（角标 = 实际余量）/ 碎片（角标 = 实际个数） */
export type InventorySlotKind = 'stack' | 'remainder' | 'fragment';

/** 一个道具（占 1 格） */
export interface InventoryItem {
  /** 稳定 id：v-for key + 同到期场景的兜底排序键 ⇒ 默认序可复现 */
  id: string;
  kind: InventoryKind;
  /** 格子形态（提示层据此区分整堆 / 余数 / 碎片） */
  slotKind: InventorySlotKind;
  /** 道具名（逐字：石榴籽玉 / 石榴籽 / 竹简 / 石榴籽碎片 / 兰帖 / 兰帖碎片） */
  name: string;
  /** 格内角标数量：整堆 = 该类道具量上限；余数 / 碎片 = 实际数量 */
  count: number;
  /** 是否渲染格内角标（**玉格不显示数量角标** ⇒ false；其余为 true） */
  badge: boolean;
  /** 该格对应的石榴籽玉 id（仅 `kind === 'jade'`；提示层【分解】据此回传后端） */
  jadeId?: string;
  /** 属性提示正文行：数量 + 到期 / 状态 + 换算依据（道具名单独作提示标题） */
  tooltipLines: string[];
  /** 排序用到期时间戳（ms）；永久有效 = `Infinity`（同类内排最后） */
  expiresAtMs: number;
}

/** 溢出提示行（按类型汇总；超出的道具不渲染格子） */
export interface InventoryOverflow {
  kind: InventoryKind;
  /** 该类溢出道具数 */
  count: number;
  /** 行首量词短语，如 `溢出 4 枚石榴籽玉` */
  label: string;
  /** 逐字提示文案：玉 = `背包空间不足，无法合成`；籽 / 竹简 / 碎片 = `空间不足，无法持有` */
  text: string;
}

/** `buildInventory` 的产物（只读；组件不二次推导） */
export interface Inventory {
  /** 固定 36 格：占用格连续排在前，空格为 `null` */
  slots: (InventoryItem | null)[];
  /** 溢出提示行（占格需求 > `SLOT_COUNT` 才有；溢出的道具不在 `slots` 内） */
  overflows: InventoryOverflow[];
  /** 占格道具总数（含溢出，未截断）—— 即标题「N / 36 格」的 N */
  occupiedTotal: number;
}

/** 道具名（逐字；兰帖 / 兰帖碎片取自 `asset-text.ts` 单点） */
const KIND_NAME: Record<InventoryKind, string> = {
  bamboo: '竹简',
  scroll: SCROLL_NAME,
  jade: '石榴籽玉',
  seed: '石榴籽',
  scrollFragment: SCROLL_FRAGMENT_NAME,
  fragment: '石榴籽碎片',
};

/**
 * 格内原始数量的单位（片 / 枚 / 颗 / 张）。
 * 兰帖格内原始数量 = **片数** ⇒ 单位「张」只用于整道具数（1 张 = 100 片），片数另标「片」
 * （`asset-text.ts` 的 `SCROLL_PIECES_UNIT`）；碎片类（石榴籽碎片 / 兰帖残页）一律「片」
 * （2026-09-26 量词裁定：兰帖「枚」→「张」、碎片类「个」→「片」）。
 */
const KIND_QTY_UNIT: Record<InventoryKind, string> = {
  bamboo: '片',
  scroll: SCROLL_ITEM_UNIT,
  jade: '枚',
  seed: '颗',
  scrollFragment: '片',
  fragment: '片',
};

/**
 * 溢出行的计数单位（**计的是道具 / 格数，不是原始量**）：玉按枚、兰帖按张（1 张 = 1 格；
 * 2026-09-26 量词裁定）、碎片类（石榴籽碎片 / 兰帖残页）按片；竹简 / 籽维持既有「个」（道具数）。
 */
const KIND_ITEM_UNIT: Record<InventoryKind, string> = {
  bamboo: '个',
  scroll: SCROLL_ITEM_UNIT,
  jade: '枚',
  seed: '个',
  scrollFragment: '片',
  fragment: '片',
};

/** 换算依据行（逐字） */
const KIND_CONVERT: Record<InventoryKind, string> = {
  bamboo: `1 格 = ${BAMBOO_PIECES_PER_ITEM} 片竹简`,
  scroll: `1 张 = ${SCROLL_PIECES_PER_ITEM} 片${SCROLL_NAME}`,
  jade: `1 枚石榴籽玉 = ${JADES_PER_ITEM} 格`,
  seed: `1 格 = ${SEEDS_PER_ITEM} 颗石榴籽`,
  scrollFragment: `1 格 = ${SCROLL_FRAGMENTS_PER_ITEM} 片${SCROLL_FRAGMENT_NAME}`,
  fragment: `1 格 = ${FRAGMENTS_PER_ITEM} 片石榴籽碎片`,
};

/** 溢出提示文案（逐字；玉与「籽 / 竹简 / 碎片 / 兰帖 / 兰帖碎片」两类） */
const KIND_OVERFLOW_TEXT: Record<InventoryKind, string> = {
  jade: '背包空间不足，无法合成',
  seed: '空间不足，无法持有',
  bamboo: '空间不足，无法持有',
  scroll: '空间不足，无法持有',
  scrollFragment: '空间不足，无法持有',
  fragment: '空间不足，无法持有',
};

/** 默认序的类型分组（**2026-09-25 变更 · 取代 Z-9**）：竹简 → 兰帖 → 兰帖残页 → 石榴籽玉 → 石榴籽 → 石榴籽碎片；溢出行的类型序是**另一份清单**（`OVERFLOW_KIND_ORDER`，玉优先），两份**不同源**、**不得顺手统一** */
const KIND_ORDER: Record<InventoryKind, number> = {
  bamboo: 0, scroll: 1, scrollFragment: 2, jade: 3, seed: 4, fragment: 5,
};

/** 溢出行的类型顺序：玉行恒在最前，其余各类按默认序（竹简 → 兰帖 → 籽 → 兰帖碎片 → 石榴籽碎片） */
const OVERFLOW_KIND_ORDER: InventoryKind[] = ['jade', 'bamboo', 'scroll', 'seed', 'scrollFragment', 'fragment'];

/**
 * 行囊数据源：既有 `GET /assets/summary` 出参 + §15 兰帖域**追加**出参（字段在 `types.ts` 登记为
 * `ScrollSummaryFields`；本单不改 `api.ts`，故在此取交集）。未上云的旧后端不返这些字段 ⇒ `Partial`
 * 缺省按 0 / 空数组处理（不抛错）；后端 summarize 出参字段名逐字见 `types.ts` 注释。
 */
export type InventorySummary = AssetsSummary & Partial<ScrollSummaryFields>;

/** 把资产总览装配成道具栏（`summary` 为空 = 未登录 / 未取到数据 → 36 空格、无溢出） */
export function buildInventory(summary: InventorySummary | null): Inventory {
  const items: InventoryItem[] = [
    ...lotItems('bamboo', summary?.bamboo_lots || [], BAMBOO_PIECES_PER_ITEM),
    ...scrollItems(summary?.scroll_lots || []),
    ...jadeItems(summary?.jades || []),
    ...lotItems('seed', summary?.seed_lots || [], SEEDS_PER_ITEM),
    ...scrollFragmentItems(summary?.scroll_fragments || 0),
    ...fragmentItems(summary?.fragments || 0),
  ];
  items.sort(compareItems);

  const slots: (InventoryItem | null)[] = [];
  for (let i = 0; i < SLOT_COUNT; i += 1) slots.push(items[i] || null);

  return {
    slots,
    overflows: overflowLines(items.slice(SLOT_COUNT)),
    occupiedTotal: items.length,
  };
}

/**
 * 插入式重排（把 `from` 位次的元素插入到 `to` 位次，其余依次让位）—— 口径同
 * `docs/sibling-order.spec.md` §9 的拖曳（唯一的数组改写入口）。纯函数，返回新数组；
 * 越界 / 原位不动 → 原序副本。
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 默认序比较：类型分组 → 余数格排该类最后 → 到期近的在前（永久最后）→ 稳定 id 兜底 */
function compareItems(a: InventoryItem, b: InventoryItem): number {
  if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  const restA = a.slotKind === 'remainder' ? 1 : 0;
  const restB = b.slotKind === 'remainder' ? 1 : 0;
  if (restA !== restB) return restA - restB;
  if (a.expiresAtMs !== b.expiresAtMs) return a.expiresAtMs - b.expiresAtMs;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * 石榴籽玉：**只收未镶嵌的**（`mounted_tree_id` 非空 = 已镶嵌、不属于用户 ⇒ 不入行囊、不渲染、不计格，
 * 也不参与溢出）；每枚 1 格；`expires_at` 为空即永久（同类内排最后）。玉格**不显示数量角标**。
 */
function jadeItems(jades: Jade[]): InventoryItem[] {
  return jades
    .filter((j) => !j.mounted_tree_id)
    .map((j) => {
      const permanent = !j.expires_at;
      return {
        id: `jade:${j.id}`,
        kind: 'jade' as InventoryKind,
        slotKind: 'stack' as InventorySlotKind,
        name: KIND_NAME.jade,
        count: JADES_PER_ITEM,
        badge: false,
        jadeId: j.id,
        tooltipLines: [
          `${JADES_PER_ITEM} ${KIND_QTY_UNIT.jade}`,
          jadeTitle(j),
          jadeSubLine(j),
          KIND_CONVERT.jade,
        ],
        expiresAtMs: permanent ? Infinity : timestampOf(j.expires_at),
      };
    });
}

/** 石榴籽碎片：`fragments > 0` 即占 1 格（1–9 片均 1 格），角标 = 实际个数；无到期概念 */
function fragmentItems(fragments: number): InventoryItem[] {
  const count = Math.max(0, Math.floor(Number(fragments) || 0));
  if (count <= 0) return [];
  return [{
    id: 'fragment:0',
    kind: 'fragment' as InventoryKind,
    slotKind: 'fragment' as InventorySlotKind,
    name: KIND_NAME.fragment,
    count,
    badge: true,
    tooltipLines: [
      `${count} ${KIND_QTY_UNIT.fragment}`,
      `满 ${FRAGMENTS_PER_ITEM} 自动合成 1 颗石榴籽`,
      KIND_CONVERT.fragment,
    ],
    expiresAtMs: Infinity,
  }];
}

/**
 * 兰帖：`Σ scrolls[].qty` 按 **100 片 = 1 张** 切整堆格，**不足一格的余量另占 1 个余数格**
 * （角标 = 实际余量；该类内排最后）—— 口径与竹简 / 籽的余数占格**同体例**（§15-6②）。
 *
 * **每格恒永久**（`ScrollLot.expires_at` 恒 `null`，§15-3）⇒ `expiresAtMs = Infinity`、
 * 提示正文只给「永久有效」，**不出现任何「最近到期 / 有效期至」行**（U-1）。量为 0 的批次不占格。
 */
function scrollItems(lots: ScrollLot[]): InventoryItem[] {
  const total = (lots || []).reduce((sum, lot) => sum + Math.max(0, Number(lot.qty) || 0), 0);
  const count = Math.floor(total / SCROLL_PIECES_PER_ITEM);
  const rest = total % SCROLL_PIECES_PER_ITEM;
  const make = (id: string, slotKind: InventorySlotKind, qty: number): InventoryItem => ({
    id,
    kind: 'scroll' as InventoryKind,
    slotKind,
    name: KIND_NAME.scroll,
    count: qty,
    badge: true,
    tooltipLines: [
      // 兰帖按「张」表达量词（`SCROLL_PIECES_PER_ITEM` = 100 片 = 1 张）：整堆格恰为 1 张 ⇒「1 张（100 片）」；
      // 余数格不足 1 张（< 100 片）⇒ 只标片数（片数不得标成张）
      slotKind === 'remainder'
        ? `${qty} ${SCROLL_PIECES_UNIT}`
        : `${qty / SCROLL_PIECES_PER_ITEM} ${KIND_QTY_UNIT.scroll}（${qty} ${SCROLL_PIECES_UNIT}）`,
      ...(slotKind === 'remainder' ? [`本格为余数 · 不足 1 ${KIND_QTY_UNIT.scroll}完整${KIND_NAME.scroll}`] : []),
      SCROLL_STATUS_PERMANENT,
      KIND_CONVERT.scroll,
    ],
    expiresAtMs: Infinity,
  });
  const items: InventoryItem[] = [];
  for (let k = 0; k < count; k += 1) items.push(make(`scroll:${k}`, 'stack', SCROLL_PIECES_PER_ITEM));
  if (rest > 0) items.push(make('scroll:rest', 'remainder', rest));
  return items;
}

/**
 * 兰帖碎片：`scroll_fragments > 0` 即占 1 格（1–99 片均 1 格，0 片不占），角标 = **实际个数**；
 * 无到期概念（标量，永久）。上限由**后端**裁定（`scroll_fragment_cap = 99`：满 100 立即自动合成），
 * 前端只展示、不判合成、不重算上限。
 */
function scrollFragmentItems(fragments: number): InventoryItem[] {
  const count = Math.max(0, Math.floor(Number(fragments) || 0));
  if (count <= 0) return [];
  return [{
    id: 'scrollFragment:0',
    kind: 'scrollFragment' as InventoryKind,
    slotKind: 'fragment' as InventorySlotKind,
    name: KIND_NAME.scrollFragment,
    count,
    badge: true,
    tooltipLines: [
      `${count} ${KIND_QTY_UNIT.scrollFragment}`,
      scrollFragmentSynthLine(SCROLL_FRAGMENTS_PER_ITEM),
      KIND_CONVERT.scrollFragment,
    ],
    expiresAtMs: Infinity,
  }];
}

/**
 * 籽 / 竹简：按 `perItem` 个原始单位切成一格一格的整堆格，**不足一格的余量另占 1 个余数格**
 * （角标 = 实际余量；该类内排在最后）。
 *
 * 切法 = **按到期升序的 FIFO**（同到期以批次 id 兜底）⇒ 每格的「最近到期」随格位单调不减，
 * 与默认序「到期近的在前」自洽；余数格取尾部余量的最近到期。
 */
function lotItems(
  kind: 'seed' | 'bamboo',
  lots: SeedLot[] | BambooLot[],
  perItem: number,
): InventoryItem[] {
  const sorted = [...lots]
    .filter((lot) => Number(lot.qty) > 0)
    .sort((a, b) => {
      const ta = timestampOf(a.expires_at);
      const tb = timestampOf(b.expires_at);
      if (ta !== tb) return ta - tb;
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
  const total = sorted.reduce((sum, lot) => sum + Number(lot.qty || 0), 0);
  const count = Math.floor(total / perItem);
  const rest = total % perItem;

  const items: InventoryItem[] = [];
  for (let k = 0; k < count; k += 1) {
    const expiresAt = nearestExpiryOfRange(sorted, k * perItem, (k + 1) * perItem);
    items.push({
      id: `${kind}:${k}`,
      kind,
      slotKind: 'stack',
      name: KIND_NAME[kind],
      count: perItem,
      badge: true,
      tooltipLines: [
        `${perItem} ${KIND_QTY_UNIT[kind]}`,
        `最近到期 ${formatAssetDate(expiresAt)}`,
        KIND_CONVERT[kind],
      ],
      expiresAtMs: timestampOf(expiresAt),
    });
  }
  if (rest > 0) {
    const expiresAt = nearestExpiryOfRange(sorted, count * perItem, total);
    items.push({
      id: `${kind}:rest`,
      kind,
      slotKind: 'remainder',
      name: KIND_NAME[kind],
      count: rest,
      badge: true,
      tooltipLines: [
        `${rest} ${KIND_QTY_UNIT[kind]}`,
        '本格为余数 · 不足 1 格',
        `最近到期 ${formatAssetDate(expiresAt)}`,
        KIND_CONVERT[kind],
      ],
      expiresAtMs: timestampOf(expiresAt),
    });
  }
  return items;
}

/** 第 `[start, end)` 个原始单位（按 FIFO 升序展开）里**最近**的到期时刻（口径同资产页「最近到期」） */
function nearestExpiryOfRange(
  sorted: Array<SeedLot | BambooLot>,
  start: number,
  end: number,
): string {
  let cursor = 0;
  let nearest = '';
  for (const lot of sorted) {
    const from = cursor;
    cursor += Number(lot.qty || 0);
    if (cursor <= start) continue;
    if (from >= end) break;
    if (!nearest || timestampOf(lot.expires_at) < timestampOf(nearest)) nearest = lot.expires_at || '';
  }
  return nearest;
}

/** 溢出提示行：按类型汇总（玉 → 竹简 → 兰帖 → 籽 → 兰帖碎片 → 石榴籽碎片各一行，只有真的溢出才出现） */
function overflowLines(overflowItems: InventoryItem[]): InventoryOverflow[] {
  const out: InventoryOverflow[] = [];
  for (const kind of OVERFLOW_KIND_ORDER) {
    const count = overflowItems.filter((item) => item.kind === kind).length;
    if (!count) continue;
    out.push({
      kind,
      count,
      label: `溢出 ${count} ${KIND_ITEM_UNIT[kind]}${KIND_NAME[kind]}`,
      text: KIND_OVERFLOW_TEXT[kind],
    });
  }
  return out;
}

/** ISO → 时间戳；空值 / 非法值 → `Infinity`（视作最晚，排在该类最后） */
function timestampOf(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const ts = new Date(iso).getTime();
  return Number.isNaN(ts) ? Infinity : ts;
}
