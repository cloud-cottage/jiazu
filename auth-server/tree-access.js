/**
 * 家族树节点级可见分层 — 规则纯模块（auth-server 实现）
 *
 * 规格：docs/permission-tier.spec.md（§2 档位 / §3 裁剪公式 / §6 access 元信息）
 * 与 cloudfunctions/compat-api/lib/tree-access.js 保持同一语义（输入形状不同：
 * 本文件吃 normalized families 列表 [getFamiliesForTree 输出]；compat-api 吃树 JSON
 * map）。改动前先同步两份与 spec。
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

/** families 归一化：Array（auth-server 形状）或 Object map（compat-api 树 JSON 形状）均可。 */
function famArray(families) {
  return Array.isArray(families) ? families : Object.values(families || {});
}

function famKids(f) {
  if (Array.isArray(f.child_handles)) return f.child_handles;
  if (Array.isArray(f.child_ref_list)) return f.child_ref_list.map((c) => c.ref);
  return [];
}

/**
 * 由 families 图计算逐人世代号（根=无父者=第 1 世，向下递增）。
 * 不在图中的孤立 person 不参与深度（调用侧视为可见第 1 世，与 compat-api 一致）。
 * @param {Array|object|null} people 可省略（auth-server 转发路径不知道全集时）
 * @param {Array|object} families normalized families 或树 JSON families map
 * @returns {{ depth: Map<string,number>, maxDepth: number }}
 */
export function computePersonDepth(people, families) {
  const childOf = new Map(); // person -> Set(parents)
  const parentOf = new Map(); // person -> Set(children)
  for (const f of famArray(families)) {
    const parents = [f.father_handle, f.mother_handle].filter(Boolean);
    const kids = famKids(f);
    for (const c of kids) {
      if (!childOf.has(c)) childOf.set(c, new Set());
      for (const p of parents) childOf.get(c).add(p);
    }
    for (const p of parents) {
      if (!parentOf.has(p)) parentOf.set(p, new Set());
      for (const c of kids) parentOf.get(p).add(c);
    }
  }
  const allPeople = new Set();
  if (people) {
    if (Array.isArray(people)) {
      for (const p of people) if (p && p.handle) allPeople.add(p.handle);
    } else {
      for (const k of Object.keys(people)) allPeople.add(k);
    }
  }
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
  // 图中缺失（孤立/环外）person：不标深度 → isHiddenPerson 判 false（公开端，保守可见）
  return { depth, maxDepth };
}

/**
 * 计算当前访问者在某树上的可见性。
 * @param {object} opts
 * @param {string} opts.treeId 目标树
 * @param {boolean} opts.isMaster 是否 zhonghua 总谱
 * @param {string|null} opts.role 登录用户角色；null=guest
 * @param {string|null} opts.anchorTreeId 登录用户锚点树（加入的家族树）
 * @param {Array|object} [opts.families] normalized families（缺省时 mode 仍可判，
 *   但 hiddenPeople 为空 → 调用侧不可裁；主调用方必须传）
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
  const { depth, maxDepth } = computePersonDepth(null, opts.families || {});
  const visibleRaw = maxDepth - hideTail;
  const clamped = visibleRaw < FLOOR_VISIBLE_DEPTH;
  const visibleMaxDepth = clamped ? FLOOR_VISIBLE_DEPTH : visibleRaw;

  const hiddenPeople = new Set();
  for (const [h, d] of depth) if (d > visibleMaxDepth) hiddenPeople.add(h);

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

/** family 是否含隐藏成员（father/mother/任一 child）。兼容 normalized 与 Gramps 原生 child_ref_list。 */
export function isHiddenFamily(access, fam) {
  return (
    (fam.father_handle && access.hiddenPeople.has(fam.father_handle)) ||
    (fam.mother_handle && access.hiddenPeople.has(fam.mother_handle)) ||
    famKids(fam).some((c) => access.hiddenPeople.has(c))
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
