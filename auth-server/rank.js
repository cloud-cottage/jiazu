/**
 * 家族树等级体系
 *
 * 中文等级 | 世代范围（本人上下合计总世代） | UI 展示英文 | 数据库字段名 | 英文定义注释
 * --------|-------------------------------|-------------|-------------|-------------
 * 家乘级   | ≤9 世（上4+下4）              | Family-Rank  | family_rank  | Short-range kinship rank
 * 族乘级   | 10-18 世                      | Clan-Rank    | clan_rank    | Mid-range kinship rank
 * 宗乘级   | 19-72 世                      | Lineage-Rank | lineage_rank | Long-range kinship rank
 * 世乘级   | >72 世                        | Stemma-Rank  | stemma_rank  | Ancient long-range stemmatic record
 *
 * 强制限制: 普通家族树最大深度 ≤ 72 世。超出需管理员把该节点以上并入 zhonghua，
 * 节点成为家族树新始祖，节点以下保留。
 */

// 等级常量
export const RANKS = {
  family: { key: 'family_rank', label: '家乘级', en: 'Family-Rank', min: 0, max: 9, desc: '短程亲属谱系，合计总世代 ≤9 世' },
  clan: { key: 'clan_rank', label: '族乘级', en: 'Clan-Rank', min: 10, max: 18, desc: '中程亲属谱系，合计总世代 10-18 世' },
  lineage: { key: 'lineage_rank', label: '宗乘级', en: 'Lineage-Rank', min: 19, max: 72, desc: '长程亲属谱系，合计总世代 19-72 世' },
  stemma: { key: 'stemma_rank', label: '世乘级', en: 'Stemma-Rank', min: 73, max: Infinity, desc: '远古长程谱系记录，合计总世代 >72 世' },
};

export const MAX_DEPTH = 72;

/** 由总世代数 → 等级 */
export function rankFromDepth(totalGenerations) {
  if (totalGenerations <= 9) return RANKS.family;
  if (totalGenerations <= 18) return RANKS.clan;
  if (totalGenerations <= 72) return RANKS.lineage;
  return RANKS.stemma;
}

/**
 * 计算树的世代深度（总世代数）
 *
 * 算法：
 * 1. 若存在带 external_chain_gen 标记的节点（中华世本源流链），
 *    直接取最大 gen 值作为总世代（显式世数，聚合节点按真实世数计）
 * 2. 否则按 family 图 BFS：根=无父的 person，最长根→叶路径为总世代
 *
 * @param families 归一化家族列表 [{father_handle, mother_handle, child_handles}]
 * @param explicitGens 可选：person handle → 显式世数（external_chain_gen）
 */
export function computeTreeDepth(families, explicitGens = null) {
  // 优先：显式世数
  if (explicitGens && explicitGens.size > 0) {
    return {
      totalGenerations: Math.max(...explicitGens.values()),
      roots: [],
      leaves: [],
      hasCycle: false,
      personCount: explicitGens.size,
      explicit: true,
    };
  }

  // 邻接: person -> [{child, ...}]
  const childOf = new Map(); // person -> Set(parent)
  const parentOf = new Map(); // person -> Set(child)
  for (const f of families) {
    const parents = [f.father_handle, f.mother_handle].filter(Boolean);
    for (const c of f.child_handles) {
      if (!childOf.has(c)) childOf.set(c, new Set());
      for (const p of parents) childOf.get(c).add(p);
    }
    for (const p of parents) {
      if (!parentOf.has(p)) parentOf.set(p, new Set());
      for (const c of f.child_handles) parentOf.get(p).add(c);
    }
  }
  const allPeople = new Set([...childOf.keys(), ...parentOf.keys()]);
  for (const c of childOf.keys()) allPeople.add(c);
  for (const p of parentOf.keys()) allPeople.add(p);

  const roots = [...allPeople].filter((p) => !childOf.has(p) || childOf.get(p).size === 0);
  const leaves = [...allPeople].filter((p) => !parentOf.has(p) || parentOf.get(p).size === 0);

  if (roots.length === 0) {
    // 有环或无根（孤立节点也算根）
    return { totalGenerations: 1, roots: [...allPeople], leaves, hasCycle: true };
  }

  // BFS 从根向下（parentOf 邻接），求最长深度
  // depth[person] = 该节点所在世数（根=1）
  const depth = new Map();
  const queue = [...roots];
  for (const r of roots) depth.set(r, 1);
  let maxDepth = 1;
  let guard = 0;
  while (queue.length && guard < 100000) {
    guard++;
    const cur = queue.shift();
    const curDepth = depth.get(cur) || 1;
    for (const child of parentOf.get(cur) || []) {
      const nd = curDepth + 1;
      if (nd > (depth.get(child) || 0)) {
        depth.set(child, nd);
        maxDepth = Math.max(maxDepth, nd);
        queue.push(child);
      }
    }
  }

  return {
    totalGenerations: maxDepth,
    roots,
    leaves,
    hasCycle: guard >= 100000,
    personCount: allPeople.size,
  };
}
