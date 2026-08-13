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
  /** ECharts 节点样式 */
  itemStyle?: { color: string };
  children?: TreePersonNode[];
  _is_root?: boolean;
  _family_handle?: string;
}

/**
 * 构建世系森林
 * @returns 根节点列表（每棵树的根）
 */
export function buildPedigreeForest(
  people: PersonSummary[],
  families: FamilySummary[],
): TreePersonNode[] {
  // handle -> person
  const personMap = new Map<string, PersonSummary>();
  for (const p of people) personMap.set(p.handle, p);

  // 计算每个人的父母家族
  // person.parent_family_list 在 PersonSummary 中未定义——从 families 反推
  // 子 -> 所属家族
  const childToFamilies = new Map<string, string[]>();
  // 家族 handle -> 家族
  const familyMap = new Map<string, FamilySummary>();
  for (const f of families) {
    familyMap.set(f.handle, f);
    for (const c of f.child_handles) {
      if (!childToFamilies.has(c)) childToFamilies.set(c, []);
      childToFamilies.get(c)!.push(f.handle);
    }
  }

  // 找根：不是任何家庭的子女
  const roots: string[] = [];
  for (const p of people) {
    if (!childToFamilies.has(p.handle)) roots.push(p.handle);
  }
  // 兜底：如果全部有父母（数据缺失），取没有母亲/父亲家庭的人做根
  const effectiveRoots = roots.length > 0 ? roots : people.map((p) => p.handle);

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
