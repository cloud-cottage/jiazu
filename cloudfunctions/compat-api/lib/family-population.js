/**
 * 家族人数口径（**纯血缘图**，用户 2026-09-19 重新拍板）
 *
 * 本文件是 `/tree/rank` → `person_count` 的唯一真源。**姓文本已彻底弃用**：
 * `tree-meta.surname_char` / 始祖 surname / 全树众数 三级兜底全部删除，不再参与任何计算。
 * 旧实现（`resolveTreeSurname` / 姓文本排除判据）已整体移除；`index.js` 路由也不再读 surname。
 *
 * ---------------- 口径（逐条） ----------------
 * 1. 父/母映射：对每个家族 F，`F.father_handle` → F 的全部 `child_handles` 的父；
 *    `F.mother_handle` → 母。**只认树内 `people` 里存在的 handle**（引用不到人的槽位等于空）。
 * 2. 根 = 树内「无父」节点（有母无父也算根 —— 父系链到此为止；世本「华胥→风伏羲」
 *    这类母系起始节点因此不断链）。
 * 3. 外来姻亲根 = 根 X，X 占某家族配偶槽（father / mother），且该家族另一槽 Y **不是根**
 *    （Y 有父记录 ⇒ Y 属本树谱系）⇒ X 是通过婚配进入本树的外来者（姑父 / 妹夫 / 女婿类）。
 * 4. 本族 = （根 − 外来姻亲根）沿「父→子女」向下闭包：P 本族 ⟺ P 的父是本族。
 *    女性后代的子女自然不入（其父是别人）；树内婚配由男方算入，自动成立。
 * 5. 婚入妇 = 非本族 且 性别 ≠ `'M'`（含 `'F'` / `'U'`） 且 作为配偶槽出现在
 *    「其配偶是本族」的家族里。
 * 6. **人数（`person_count`） = |本族 ∪ 婚入妇|**（分层见下）。
 *    镜像（`external_mirror === 'true'`）**不单独过滤**：一律以**血缘位置**判定 ——
 *    镜像节点若是某家族的 father/mother 槽，它照常参与父系链推导；它坐在本树血位（本族 / 婚入妇）
 *    就计入，坐在外来姻亲位（如 shen 的季志全 / 纪恒山、gu 的季清昆）或挂在非本族父亲之下
 *    （gu 的季庭亦 / 季贺为）就自然出局。**这条与真源实测验收数值逐条一致**
 *    （ji 87 / gu 21 / liu 17 / shen 10）；若改成「镜像一律剔除」会得到 83 / 19 / 17 / 8，
 *    与验收数值全部不符，故实现以血缘位置为准。
 * 7. 分层：**新口径只对 `kind === 'family'`（或缺省 ⇒ 按 family）生效**；
 *    `zhonghua`（`is_master`，世本）与 `kind === 'clan'`（祖谱）**保持 —— 树内 people 数**
 *    （实测世本 112、祖谱 2 / 2 / 37 / 4 均不变）。
 *
 * 计数域 = `tree.people` 的键（真源数据里 people ⊇ families 引用；引用不到人的 handle 不是人）。
 * 零 IO、零全局状态：纯函数。
 */

/** 家族树种类：`master`（世本）/ `clan`（祖谱）/ `family`（缺省）。 */
export function treeKind(entry) {
  if (!entry) return 'family';
  if (entry.is_master === true || String(entry.kind || '') === 'master') return 'master';
  if (String(entry.kind || '') === 'clan') return 'clan';
  return 'family';
}

/** 镜像节点判定（保留 `external_mirror` 语义：别处真身在本树的显示占位） */
export function isMirrorNode(person) {
  return !!person && String(person.external_mirror) === 'true';
}

/** 性别规范化：非字符串 / 空 → 'U'（未知） */
function genderOf(person) {
  const g = person && typeof person.gender === 'string' ? person.gender.trim() : '';
  return g || 'U';
}

/**
 * 血缘图分析（全部口径的唯一实现）。
 * @param {{people?: Record<string, any>, families?: Record<string, any>}} tree
 * @returns {{
 *   people: Record<string, any>,
 *   roots: Set<string>, inLawRoots: Set<string>, clan: Set<string>, marriedIn: Set<string>,
 *   counted: Set<string>, fatherOf: Map<string, string>,
 * }}
 */
export function analyzeFamilyGraph(tree) {
  const people = (tree && tree.people) || {};
  const families = Object.values((tree && tree.families) || {}).filter(Boolean);
  const inPeople = (h) => !!h && Object.prototype.hasOwnProperty.call(people, h);

  // 1. 父/母映射（只认树内 people）
  const fatherOf = new Map();
  const motherOf = new Map();
  for (const f of families) {
    for (const c of f.child_handles || []) {
      if (!inPeople(c)) continue;
      if (inPeople(f.father_handle) && !fatherOf.has(c)) fatherOf.set(c, f.father_handle);
      if (inPeople(f.mother_handle) && !motherOf.has(c)) motherOf.set(c, f.mother_handle);
    }
  }

  // 2. 根 = 无父记录
  const roots = new Set();
  for (const h of Object.keys(people)) if (!fatherOf.has(h)) roots.add(h);

  // 3. 外来姻亲根：占配偶槽，且另一槽不是根（对方有父记录 ⇒ 本树谱系）
  const inLawRoots = new Set();
  for (const f of families) {
    const fa = inPeople(f.father_handle) ? f.father_handle : '';
    const mo = inPeople(f.mother_handle) ? f.mother_handle : '';
    for (const [x, y] of [[fa, mo], [mo, fa]]) {
      if (!x || !y) continue;
      if (!roots.has(x)) continue;
      if (!fatherOf.has(y)) continue;
      inLawRoots.add(x);
    }
  }

  // 4. 本族：从（根 − 外来姻亲根）沿父→子女闭包
  const kidsOf = new Map();
  for (const [c, fa] of fatherOf) {
    if (!kidsOf.has(fa)) kidsOf.set(fa, []);
    kidsOf.get(fa).push(c);
  }
  const clan = new Set();
  const queue = [];
  for (const h of roots) {
    if (inLawRoots.has(h)) continue;
    clan.add(h);
    queue.push(h);
  }
  while (queue.length) {
    const h = queue.shift();
    for (const c of kidsOf.get(h) || []) {
      if (clan.has(c)) continue;
      clan.add(c);
      queue.push(c);
    }
  }

  // 5. 婚入妇：非本族、性别 ≠ 'M'、配偶为本族的配偶槽
  const marriedIn = new Set();
  for (const f of families) {
    const fa = inPeople(f.father_handle) ? f.father_handle : '';
    const mo = inPeople(f.mother_handle) ? f.mother_handle : '';
    for (const [sp, other] of [[mo, fa], [fa, mo]]) {
      if (!sp || !other) continue;
      if (clan.has(sp) || !clan.has(other)) continue;
      if (genderOf(people[sp]) === 'M') continue;
      marriedIn.add(sp);
    }
  }

  // 6. 人数 = 本族 ∪ 婚入妇（镜像按血缘位置，不额外过滤，见文件头 §6）
  const counted = new Set([...clan, ...marriedIn]);
  return { people, roots, inLawRoots, clan, marriedIn, counted, fatherOf, motherOf };
}

/**
 * 分层解析：`kindOrOptions` 可为 `'family'|'clan'|'master'` 字符串、`{ kind, is_master }` 对象，
 * 或省略（⇒ 由 tree-meta 条目 `entry` 推导）。向后兼容旧调用 `(tree, entry)`。
 * @returns {'family'|'clan'|'master'}
 */
function resolveKind(entry, kindOrOptions) {
  if (typeof kindOrOptions === 'string') {
    return treeKind({ kind: kindOrOptions, is_master: kindOrOptions === 'master' });
  }
  if (kindOrOptions && typeof kindOrOptions === 'object') {
    return treeKind({
      kind: kindOrOptions.kind === undefined ? entry && entry.kind : kindOrOptions.kind,
      is_master: kindOrOptions.is_master === undefined ? !!(entry && entry.is_master) : kindOrOptions.is_master,
    });
  }
  return treeKind(entry);
}

/**
 * 家族人数（纯血缘图口径）。
 * @param {{people?: Record<string, any>, families?: Record<string, any>}} tree
 * @param {{kind?: string, is_master?: boolean}|null} [entry] tree-meta 条目（**只用于分层**，不再读 surname）
 * @param {'family'|'clan'|'master'|{kind?: string, is_master?: boolean}} [kindOrOptions]
 *        `'family' | 'clan' | 'master'`，或 `{ kind }` / `{ entry }` 形状；缺省 ⇒ 由 entry 推导（缺省 family）
 *        向后兼容：旧调用 `countFamilyMembers(tree, entry)` 照常工作。
 * @returns {number}
 */
export function countFamilyMembers(tree, entry, kindOrOptions) {
  const kind = resolveKind(entry, kindOrOptions);
  const people = (tree && tree.people) || {};
  // 7. 分层：世本 / 祖谱 保持 = 树内 people 数
  if (kind !== 'family') return Object.keys(people).length;
  return analyzeFamilyGraph(tree).counted.size;
}

/**
 * 本树「不计入人数」的节点 handle 列表（= people − (本族 ∪ 婚入妇)）。
 * 世本 / 祖谱恒为空数组（保持 people 数口径）。
 * **语义已变**：不再基于姓文本，纯血缘图；返回顺序 = people 键顺序。
 * @returns {string[]}
 */
export function listExcludedMembers(tree, entry, kindOrOptions) {
  const kind = resolveKind(entry, kindOrOptions);
  if (kind !== 'family') return [];
  const { people, counted } = analyzeFamilyGraph(tree);
  return Object.keys(people).filter((h) => !counted.has(h));
}
