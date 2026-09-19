/**
 * 家族人数新口径（`/tree/rank` 的 `person_count`）
 *
 * 用户 2026-09-19 拍板（契约逐条写死，本轮唯一真源）：
 *   1. 本姓节点（`surname === 本树本姓 S`）无论男女一律计入。
 *   2. 外姓嫁入的女性一律直接计入，不再单独标注/单列（含 `external_mirror === 'true'` 且
 *      `external_link_type === 'marriage'` 的外树媳妇镜像节点）。
 *   3. 「本姓女性嫁出后所生的子女」不计入。纯结构判据：节点 P 被排除 ⟺ 存在家族 F 使
 *      P ∈ F.child_handles，且 F.mother_handle 非空且 surname(F.mother_handle) === S，
 *      且（F.father_handle 为空 或 surname(F.father_handle) !== S），且 surname(P) !== S。
 *      另加等价保险判据：`external_mirror === 'true'` 且 `external_link_type === 'child'`
 *      （跨树婚姻的外树子女镜像）命中即排除。
 *      **保险判据受本姓保护（规则 1 优先于规则 3，2026-09-19 终审）**：本人 `surname === S`
 *      时按规则 1 计入，即使它是 `child` 镜像也不排除；只有 `surname !== S`（含 surname 为空串
 *      或缺失）的外树子女镜像才被排除。
 *      说明：孩子本身本姓时按规则 1 计入（保留下面的 `surname(P) !== S` 就是这条，
 *      招赘/入谱的本姓孩子不受影响）。
 *   4. 其余节点（外姓男性姻亲、无家族关系的记录、外部登记占位节点）本轮**照旧计入** ——
 *      只实现上面三条，不自行扩大排除范围。
 *   5. 本姓 S 解析顺序（`resolveTreeSurname`，路由里不得另写一套）：
 *      tree-meta 条目 `surname_char` → 始祖节点（`founder_handle` → `founder_gramps_id`
 *      → 字面量 `'I0001'` 三级兜底）的 `surname` → 全树非空 `surname` 的众数
 *      （并列取字典序最小，保证确定性）→ `''`（S 为空则规则 3 不生效，直接返回全树人数）。
 *
 * 计数域与既有 `computeTreeDepth().personCount` 完全一致：`tree.people` 的 handle
 *  ∪ 所有 `families` 里 father_handle / mother_handle / child_handles 引用的 handle
 * （真源数据里两者相等；保留并集以免旧数据里「被家族引用但无 people 记录」的节点漏计）。
 *
 * 零 IO、零全局状态：纯函数，只吃 `(tree, entry)`。
 */

/** `entry.surname_char` 的规范化：非字符串 / 空白 → '' */
function charOf(entry) {
  return entry && typeof entry.surname_char === 'string' ? entry.surname_char.trim() : '';
}

/** 节点 surname 的规范化：非字符串 → ''（缺失 ≠ 本姓，恒不等于 S） */
function surnameOf(people, handle) {
  const p = handle ? people[handle] : null;
  return p && typeof p.surname === 'string' ? p.surname.trim() : '';
}

/** 按 gramps_id 找节点（找不到 → undefined） */
function byGrampsId(people, grampsId) {
  if (!grampsId) return undefined;
  return Object.values(people).find((p) => p && p.gramps_id === grampsId);
}

/**
 * 本姓 S。解析顺序见文件头 §5；四级全部落空 → ''。
 * @param {{people?: Record<string, any>}} tree
 * @param {{surname_char?: string, founder_handle?: string, founder_gramps_id?: string}|null|undefined} entry tree-meta 条目
 * @returns {string}
 */
export function resolveTreeSurname(tree, entry) {
  const people = (tree && tree.people) || {};
  const fromMeta = charOf(entry);
  if (fromMeta) return fromMeta;
  // 始祖三级兜底：founder_handle → founder_gramps_id → 'I0001'
  const candidates = [
    entry && entry.founder_handle ? people[entry.founder_handle] : undefined,
    byGrampsId(people, entry && entry.founder_gramps_id),
    byGrampsId(people, 'I0001'),
  ];
  for (const node of candidates) {
    const s = node && typeof node.surname === 'string' ? node.surname.trim() : '';
    if (s) return s;
  }
  // 众数（并列取字典序最小 → 与 key 顺序无关，确定性）
  const freq = new Map();
  for (const p of Object.values(people)) {
    const s = p && typeof p.surname === 'string' ? p.surname.trim() : '';
    if (s) freq.set(s, (freq.get(s) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const key of [...freq.keys()].sort()) {
    const n = freq.get(key);
    if (n > bestCount) {
      best = key;
      bestCount = n;
    }
  }
  return best;
}

/** 计数域：people ∪ families 引用到的全部 handle */
function populationHandles(tree) {
  const set = new Set();
  const people = (tree && tree.people) || {};
  const families = (tree && tree.families) || {};
  for (const h of Object.keys(people)) set.add(h);
  for (const f of Object.values(families)) {
    if (!f) continue;
    if (f.father_handle) set.add(f.father_handle);
    if (f.mother_handle) set.add(f.mother_handle);
    for (const c of f.child_handles || []) set.add(c);
  }
  return set;
}

/**
 * 被排除的 handle 列表（规则 3 主判据 + 保险判据），按「先主判据家族顺序、后保险判据
 * people 顺序」去重收集。返回的是谓词命中的全部 handle（含不在计数域内的引用 handle，
 * 由调用方自行按需过滤；真源数据里不存在这种节点）。
 * @returns {string[]}
 */
export function listExcludedMembers(tree, entry) {
  const people = (tree && tree.people) || {};
  const families = (tree && tree.families) || {};
  const surname = resolveTreeSurname(tree, entry);
  const out = [];
  const seen = new Set();
  const push = (h) => {
    if (!h || seen.has(h)) return;
    seen.add(h);
    out.push(h);
  };
  // S 为空 → 规则 3 不生效（规则 4：其余节点照旧计入）
  if (surname) {
    for (const f of Object.values(families)) {
      if (!f || !f.mother_handle) continue;
      if (surnameOf(people, f.mother_handle) !== surname) continue;
      const father = f.father_handle;
      if (father && surnameOf(people, father) === surname) continue;
      for (const c of f.child_handles || []) {
        if (surnameOf(people, c) !== surname) push(c);
      }
    }
    // 等价保险判据：跨树婚姻的外树子女镜像（受本姓保护 —— 规则 1 优先：本人本姓时计入）
    for (const [h, p] of Object.entries(people)) {
      if (!p) continue;
      if (String(p.external_mirror) === 'true' && String(p.external_link_type) === 'child') {
        if (surnameOf(people, h) !== surname) push(h);
      }
    }
  }
  return out;
}

/**
 * 家族人数（新口径）。`(tree, entry)` → number。
 * S 为空 → 全树人数（规则 3 不生效）；空树 → 0。
 * @returns {number}
 */
export function countFamilyMembers(tree, entry) {
  const handles = populationHandles(tree);
  if (!handles.size) return 0;
  const excluded = new Set(listExcludedMembers(tree, entry));
  let out = 0;
  for (const h of handles) {
    if (!excluded.has(h)) out++;
  }
  return out;
}
