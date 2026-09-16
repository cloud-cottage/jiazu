/**
 * 家族树节点级可见分层 — 规则纯模块（compat-api 权威实现）
 *
 * 规格：docs/permission-tier.spec.md（§2 档位 / §3 裁剪公式 / §6 access 元信息）
 * auth-server/tree-access.js 与本文件保持同一语义（输入形状不同：本文件吃树 JSON，
 * auth-server 吃 normalized families 列表）。改动前先同步两份与 spec。
 *
 * 规则要点：
 * - guest（未登录）隐藏树梢端 18 世；logged-in（已登录未加入）隐藏 9 世；
 * - 树梢端 = 大世代号端（近代）。可见世数 visibleMax = maxDepth − hideTail；
 * - 浅树兜底：visibleMax < 1 时取 1（至少可见最古老 1 世），mode='floor'；
 * - zhonghua（is_master）与 chief_editor、所属树成员（member）恒 full。
 */

export const GUEST_HIDE_TAIL = 18;
export const LOGIN_HIDE_TAIL = 9;
export const FLOOR_VISIBLE_DEPTH = 1;

/** 由 families 图计算逐人世代号（根=无父者=第 1 世，向下递增）。孤立 person（不在图中）记 depth 1。 */
export function computePersonDepth(people, families) {
  const childOf = new Map(); // person -> Set(parents)
  const parentOf = new Map(); // person -> Set(children)
  for (const f of Object.values(families)) {
    const parents = [f.father_handle, f.mother_handle].filter(Boolean);
    const kids = f.child_handles || [];
    for (const c of kids) {
      if (!childOf.has(c)) childOf.set(c, new Set());
      for (const p of parents) childOf.get(c).add(p);
    }
    for (const p of parents) {
      if (!parentOf.has(p)) parentOf.set(p, new Set());
      for (const c of kids) parentOf.get(p).add(c);
    }
  }
  const allPeople = new Set(Object.keys(people));
  for (const p of childOf.keys()) allPeople.add(p);
  for (const p of parentOf.keys()) allPeople.add(p);

  const depth = new Map();
  const roots = [...allPeople].filter((p) => !childOf.has(p) || childOf.get(p).size === 0);
  let maxDepth = 1;
  for (const r of roots) depth.set(r, 1);
  const queue = [...roots];
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
  // 孤立 person 与异常（有环）节点：视为第 1 世（公开端，保守可见）
  for (const p of allPeople) if (!depth.has(p)) depth.set(p, 1);
  return { depth, maxDepth };
}

/**
 * 计算当前访问者在某树上的可见性。
 * @param {object} opts
 * @param {string} opts.treeId 目标树
 * @param {boolean} opts.isMaster 是否 zhonghua 总谱
 * @param {string|null} opts.role 登录用户角色（user/branch_curator/tree_steward/chief_editor）；null=guest
 * @param {string|null} opts.anchorTreeId 登录用户锚点树（加入的家族树）
 * @param {object} opts.people 树 people map（用于计算深度；master 可省略）
 * @param {object} opts.families 树 families map
 * @param {number} [opts.maxDepth] 可省：外部已算好的总世代（与 family 图同源时）
 * @returns {{mode:'full'|'partial'|'floor', visibleMaxDepth:number, hideTail:number,
 *   isMaster:boolean, member:boolean, loginRequired:boolean, clamped:boolean,
 *   hiddenPeople:Set<string>, isHiddenPerson:(h:string)=>boolean}}
 */
export function computeAccess(opts) {
  const { treeId, isMaster, role, anchorTreeId } = opts;
  const member = !!(anchorTreeId && anchorTreeId === treeId);
  // 特权/成员全可见：总谱、chief_editor、所属树成员（含 tree_steward 自己树）
  if (isMaster || role === 'chief_editor' || member) {
    return {
      mode: 'full', visibleMaxDepth: Infinity, hideTail: 0,
      isMaster: !!isMaster, member, loginRequired: false, clamped: false,
      hiddenPeople: new Set(), isHiddenPerson: () => false,
    };
  }

  const hideTail = role ? LOGIN_HIDE_TAIL : GUEST_HIDE_TAIL;
  const { depth, maxDepth } = opts.maxDepth
    ? { maxDepth: opts.maxDepth, depth: null }
    : computePersonDepth(opts.people || {}, opts.families || {});
  const visibleRaw = maxDepth - hideTail;
  const clamped = visibleRaw < FLOOR_VISIBLE_DEPTH;
  const visibleMaxDepth = clamped ? FLOOR_VISIBLE_DEPTH : visibleRaw;

  const hiddenPeople = new Set();
  if (depth) {
    for (const [h, d] of depth) if (d > visibleMaxDepth) hiddenPeople.add(h);
  } else {
    // 外部给定 maxDepth 时无法精确到人 → 调用侧负责用 hiddenPeople 之外的方式
    // （auth-server 形状见 auth-server/tree-access.js，不走此分支）
  }

  return {
    mode: clamped ? 'floor' : 'partial',
    visibleMaxDepth,
    hideTail,
    isMaster: !!isMaster,
    member,
    loginRequired: !role,
    clamped,
    hiddenPeople,
    isHiddenPerson: (h) => hiddenPeople.has(h),
  };
}

/** family 是否含隐藏成员（father/mother/任一 child）。 */
export function isHiddenFamily(access, fam) {
  return (
    (fam.father_handle && access.hiddenPeople.has(fam.father_handle)) ||
    (fam.mother_handle && access.hiddenPeople.has(fam.mother_handle)) ||
    (fam.child_handles || []).some((c) => access.hiddenPeople.has(c))
  );
}

/** 供 /tree/rank 等端点输出 access 元信息（§6）。 */
export function accessToPayload(access, totalGenerations) {
  return {
    mode: access.mode,
    visible_max_depth: access.mode === 'full' ? totalGenerations : access.visibleMaxDepth,
    hide_tail: access.hideTail,
    is_master: access.isMaster,
    member: access.member,
    login_required: access.loginRequired,
    clamped: access.clamped,
  };
}
