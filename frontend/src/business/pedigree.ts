/**
 * 世系树构建 — 纯业务逻辑（跨端复用）
 *
 * 输入: 人物列表 + 家族列表（Gramps-Web API 数据）
 * 输出: 多根森林树结构（ECharts tree 兼容）
 *
 * 规则:
 * - 根 = 无法确定父母的人物（parent_family_list 为空）
 * - 配偶以"父亲 + 母亲"节点对出现，子女挂在家族下
 * - 同一人出现在多个家庭时，按主家庭归属
 */

import type { PersonSummary } from './types';
import type { FamilySummary } from './api';

export interface TreePersonNode {
  name: string;
  handle: string;
  gramps_id: string;
  gender: 'M' | 'F' | 'U';
  is_living: boolean;
  birth_date?: string;
  death_date?: string;
  /** 跨树链接：目标家族树 id（分迁占位 / 出嫁） */
  external_tree?: string;
  /** 跨树链接：目标树内人物 handle */
  external_person_handle?: string;
  /** 跨树链接类型：branch=分迁占位 / marriage=出嫁 */
  external_link_type?: string;
  /** 配偶姓名（family 中对方家长；用于夫妇卡第二行起“配XX”，嫁入成员因此上卡） */
  spouseNames?: string[];
  /** 称号串（封号·谥号·号，按固定顺序；详情文档 attributes 派生）——卡片姓名后追加 */
  titles?: string;
  /** 外树镜像节点标记（嫁娶生成） */
  external_mirror?: string;
  /** ECharts 节点样式 */
  itemStyle?: {
    color?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number | number[];
  };
  /** 方案B 名卡：自适应卡宽/卡高（ECharts per-node symbolSize） */
  symbolSize?: [number, number];
  /** 方案B 名卡：按卡宽截断后的显示文本（tooltip 仍显全名） */
  _cardText?: string;
  /** ECharts per-node label 覆盖（关键节点标注：卡面文字主题色） */
  label?: { color?: string };
  children?: TreePersonNode[];
  _is_root?: boolean;
  _family_handle?: string;
}

/**
 * 构建世系森林
 *
 * @param opts.founderGrampsId 指定始祖 gramps_id：以始祖为唯一根构建整条世系
 *   （始祖是具体人物，图上直接以真实人物为根，可点击查看/编辑）。
 *   未指定或找不到时，按多根构建，并排除「配偶姻亲」根（其子女已挂在配偶血缘支系下，
 *   避免同一批子女在图示中被重复渲染）。
 * @returns 根节点列表（每棵树的根）
 */
export function buildPedigreeForest(
  people: PersonSummary[],
  families: FamilySummary[],
  opts?: { founderGrampsId?: string },
): TreePersonNode[] {
  const { founderGrampsId } = opts || {};

  // handle -> person
  const personMap = new Map<string, PersonSummary>();
  for (const p of people) personMap.set(p.handle, p);

  // 计算每个人的父母家族
  // person.parent_family_list 在 PersonSummary 中未定义——从 families 反推
  // 子 -> 所属家族
  const childToFamilies = new Map<string, string[]>();
  for (const f of families) {
    for (const c of f.child_handles) {
      if (!childToFamilies.has(c)) childToFamilies.set(c, []);
      childToFamilies.get(c)!.push(f.handle);
    }
  }

  // ---- 指定始祖：以始祖为唯一根构建整条世系 ----
  if (founderGrampsId) {
    const founder = people.find((p) => p.gramps_id === founderGrampsId);
    if (founder) {
      const node = buildWithFreshVisited(founder.handle, personMap, families);
      if (node) {
        node._is_root = true;
        return [node];
      }
    }
    // 始祖 gramps_id 在当前数据中不存在（如已迁出）→ 回退多根构建
  }

  // ---- 多根构建 ----
  // 根候选：不是任何家庭的子女
  const rootCandidates: string[] = [];
  for (const p of people) {
    if (!childToFamilies.has(p.handle)) rootCandidates.push(p.handle);
  }
  // 兜底：如果全部有父母（数据缺失），取没有母亲/父亲家庭的人做根
  const candidates =
    rootCandidates.length > 0 ? rootCandidates : people.map((p) => p.handle);

  // 排除配偶姻亲根：
  // - 配偶在本树中且配偶不属于根候选（配偶在血缘链上）→ 本人排除，子女挂在配偶支系下
  // - 配偶也是根候选（始祖夫妇）→ 保留父亲（父系承继），排除母亲
  // - 单亲家族（无配偶记录）→ 保留为根（如寡母独自成支）
  const excluded = new Set<string>();
  for (const h of candidates) {
    const spouseFamilies = families.filter(
      (f) => f.father_handle === h || f.mother_handle === h,
    );
    for (const fam of spouseFamilies) {
      const other = fam.father_handle === h ? fam.mother_handle : fam.father_handle;
      if (!other || !personMap.has(other)) continue; // 单亲家族 → 保留
      if (!rootCandidates.includes(other)) {
        excluded.add(h); // 配偶在血缘链上 → 排除本人
        break;
      }
      if (fam.mother_handle === h) {
        excluded.add(h); // 始祖夫妇 → 排除母亲
        break;
      }
    }
  }
  const effectiveRoots = candidates.filter((h) => !excluded.has(h));

  // 防止环的访问集合
  const visited = new Set<string>();

  function buildNode(handle: string): TreePersonNode | null {
    if (visited.has(handle)) return null;
    const person = personMap.get(handle);
    if (!person) return null;
    visited.add(handle);

    const node: TreePersonNode = {
      name: person.name,
      handle: person.handle,
      gramps_id: person.gramps_id,
      gender: person.gender || 'U',
      is_living: person.is_living,
      birth_date: person.birth_date,
      death_date: person.death_date,
      titles: person.titles,
      external_mirror: person.external_mirror,
      external_tree: person.external_tree,
      external_person_handle: person.external_person_handle,
      external_link_type: person.external_link_type,
      itemStyle: { color: person.gender === 'M' ? '#5D8AA8' : person.gender === 'F' ? '#C97B84' : '#8B8B8B' },
    };

    // 找该人作为父亲/母亲的家族，取其子女
    const children: TreePersonNode[] = [];
    const seenChild = new Set<string>();

    // 该人作为家长的所有家族
    const spouseFamilies = families.filter(
      (f) => f.father_handle === handle || f.mother_handle === handle,
    );

    for (const fam of spouseFamilies) {
      for (const childHandle of fam.child_handles) {
        if (seenChild.has(childHandle)) continue;
        seenChild.add(childHandle);
        const child = buildNode(childHandle);
        if (child) {
          child._family_handle = fam.handle;
          children.push(child);
        }
      }
    }

    // 夫妇卡：收集本人生育家庭的对方家长（配偶/嫁入成员）姓名
    const spouseNames: string[] = [];
    const seenSpouse = new Set<string>();
    for (const fam of spouseFamilies) {
      const other = fam.father_handle === handle ? fam.mother_handle : fam.father_handle;
      if (other && !seenSpouse.has(other) && personMap.has(other)) {
        seenSpouse.add(other);
        const sn = personMap.get(other)?.name;
        if (sn) spouseNames.push(sn);
      }
    }
    if (spouseNames.length) node.spouseNames = spouseNames;

    if (children.length > 0) node.children = children;
    return node;
  }

  const forest: TreePersonNode[] = [];
  for (const rootHandle of effectiveRoots) {
    // 每个根重新建立 visited（多棵树独立）
    // 但共用 visited 会丢节点，这里对每个根用独立 visited
    const node = buildWithFreshVisited(rootHandle, personMap, families);
    if (node) {
      node._is_root = true;
      forest.push(node);
    }
  }

  return forest;
}

function buildWithFreshVisited(
  handle: string,
  personMap: Map<string, PersonSummary>,
  families: FamilySummary[],
): TreePersonNode | null {
  const visited = new Set<string>();

  function build(handle: string): TreePersonNode | null {
    if (visited.has(handle)) return null;
    const person = personMap.get(handle);
    if (!person) return null;
    visited.add(handle);

    const node: TreePersonNode = {
      name: person.name,
      handle: person.handle,
      gramps_id: person.gramps_id,
      gender: person.gender || 'U',
      is_living: person.is_living,
      birth_date: person.birth_date,
      death_date: person.death_date,
      titles: person.titles,
      external_mirror: person.external_mirror,
      external_tree: person.external_tree,
      external_person_handle: person.external_person_handle,
      external_link_type: person.external_link_type,
      itemStyle: {
        color:
          person.gender === 'M' ? '#5D8AA8' : person.gender === 'F' ? '#C97B84' : '#8B8B8B',
      },
    };

    const children: TreePersonNode[] = [];
    const seenChild = new Set<string>();
    const spouseFamilies = families.filter(
      (f) => f.father_handle === handle || f.mother_handle === handle,
    );

    for (const fam of spouseFamilies) {
      for (const childHandle of fam.child_handles) {
        if (seenChild.has(childHandle)) continue;
        seenChild.add(childHandle);
        const child = build(childHandle);
        if (child) {
          child._family_handle = fam.handle;
          children.push(child);
        }
      }
    }

    // 夫妇卡：收集本人生育家庭的对方家长（配偶/嫁入成员）姓名
    const spouseNames: string[] = [];
    const seenSpouse = new Set<string>();
    for (const fam of spouseFamilies) {
      const other = fam.father_handle === handle ? fam.mother_handle : fam.father_handle;
      if (other && !seenSpouse.has(other) && personMap.has(other)) {
        seenSpouse.add(other);
        const sn = personMap.get(other)?.name;
        if (sn) spouseNames.push(sn);
      }
    }
    if (spouseNames.length) node.spouseNames = spouseNames;

    if (children.length > 0) node.children = children;
    return node;
  }

  return build(handle);
}

/**
 * 森林扁平化：方便查找某人在树中的位置
 */
export function flattenForest(forest: TreePersonNode[]): TreePersonNode[] {
  const out: TreePersonNode[] = [];
  function walk(node: TreePersonNode) {
    out.push(node);
    if (node.children) node.children.forEach(walk);
  }
  forest.forEach(walk);
  return out;
}
