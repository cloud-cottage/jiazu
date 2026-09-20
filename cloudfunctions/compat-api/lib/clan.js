/**
 * 祖谱（Clan Tree）— 逻辑层
 * 内部代号 clan = 产品术语【祖谱】（标识符 / 文件名 / 路由 / 集合名 / kind 值保持不变）
 *
 * 设计见 docs/clan-tree.spec.md。层级：
 *   中华世本（kind='master'） → 祖谱（kind='clan'） → 普通家族树（kind='family'）
 *
 * 关键约定：
 * - 祖谱顶端 = **世本世系链的镜像段**：首个节点 `external_link_type='founder'`（祖谱始祖），
 *   其下链路节点 `'chain'`；镜像节点在本层内**整节点只读**（真身为准，读侧推导，不写反指针）。
 * - 祖谱**自有段**是真实数据（`external_*` 为空），可编辑、可续编、可被普通树认祖。
 * - 建谱 = 申请制：该姓现有树 steward/chief 发起 → chief_editor 审批 → 建树。
 * - 硬口径：始祖唯一性按「世本节点 × 姓」；不同姓可共享同一世本节点。
 *
 * 纯函数（plan/apply/clear/calc 系列）不碰 IO，全部可单测；
 * createClanTree/attachClanToMaster/detachClanFromMaster 负责读树 → 事务写（store.updateTrees）。
 */
import crypto from 'node:crypto';
import {
  getMeta,
  saveMeta,
  getTree,
  getDetail,
  saveDetail,
  deleteDetail,
  createTreeFile,
  updateTrees,
  listTreeIds,
} from './store.js';
import {
  FOUNDER_LINK_TYPE,
  CHAIN_LINK_TYPE,
  TREE_KIND,
  KIND_LABEL,
  treeKindOf,
  kindLabel,
  genRequestId,
  chainGenOf,
  founderRelationNote,
  isUpperMirror,
  isFounderMissing,
  planFounderRegister,
  resolveFounderHandle,
  listAttachedTrees,
} from './founder-attach.js';
import { nextGrampsId, surnamePinyin } from './tree-write.js';
import { idAllocator, reserveFamilyIds, reservePersonIds } from './id-seq.js';
import { isKnownOriginCode, resolveOrigin } from './geo.js';

/** 建谱申请集合（新建集合 → docs/PENDING_DEPLOY.md） */
export const CLAN_REQUEST_COLLECTION = 'jiazu_clan_requests';
/** 顶端镜像节点 handle 前缀：`mir_<上层节点 handle>`（确定性 → 重复认祖幂等，不产生孤儿节点） */
export const CLAN_MIRROR_PREFIX = 'mir_';
/** 镜像链默认/最大深度（0 = 只镜像始祖节点本身；其下即自有段） */
export const DEFAULT_CHAIN_DEPTH = 0;
export const MAX_CHAIN_DEPTH = 12;
/** 建谱申请重复提示 */
export const PENDING_CLAN_MESSAGE = '该姓已有待审批的建谱申请，请等待总编审批';

/** 祖谱未认祖世本时的页面提示（docs/clan-tree.spec.md §5） */
export const NO_MASTER_MESSAGE = '该祖谱未认祖世本';

function genHandle() {
  return crypto.randomBytes(14).toString('hex');
}

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}
function notFound(message) {
  const e = new Error(message);
  e.status = 404;
  return e;
}

// ---- 纯判定 / 计算 ----

/** meta 里按 tree_id 取条目 */
export function entryOf(meta, treeId) {
  if (!meta?.trees) return null;
  return meta.trees[treeId] || Object.values(meta.trees).find((t) => t?.tree_id === treeId) || null;
}

/** 是否祖谱条目 */
export function isClanEntry(entry) {
  return treeKindOf(entry) === TREE_KIND.CLAN;
}

/** 祖谱姓氏（新字段 surname 优先，兼容旧 surname_char） */
export function clanSurnameOf(entry) {
  return String(entry?.surname || entry?.surname_char || '').trim();
}

/**
 * 祖谱 tree_id：`<姓拼音缩写>_<十进制码点>`（例 ji_23395）；冲突追加 _01/_02…
 * docs/clan-tree.spec.md §6
 */
export function genClanTreeId(meta, surnameChar) {
  const char = String(surnameChar || '').trim();
  if (!char) throw badRequest('缺少姓氏，无法生成祖谱编号');
  const base = `${surnamePinyin(char)}_${char.codePointAt(0)}`;
  const used = new Set(Object.values(meta?.trees || {}).map((t) => t?.tree_id).filter(Boolean));
  if (!used.has(base)) return base;
  for (let i = 1; i < 100; i++) {
    const candidate = `${base}_${String(i).padStart(2, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  throw badRequest(`姓氏「${char}」的祖谱编号已用尽（≥99）`);
}

/**
 * 硬口径 1（Kevin 2026-09-15）：始祖唯一性按「世本节点 × 姓」——
 * 同一世本节点在同姓祖谱中只能被一支认作始祖；不同姓祖谱可共享（赐姓/改姓）。
 * 违反 → 400（docs/clan-tree.spec.md §3-3）。
 */
export function assertClanFounderUnique({ entries, surname, masterTreeId, masterHandle, excludeTreeId = '' }) {
  const char = String(surname || '').trim();
  if (!char || !masterHandle) return null;
  for (const e of Object.values(entries || {})) {
    if (!e || e.tree_id === excludeTreeId) continue;
    if (treeKindOf(e) !== TREE_KIND.CLAN) continue;
    if (clanSurnameOf(e) !== char) continue;
    if (String(e.master_tree_id || '') !== String(masterTreeId || '')) continue;
    if (String(e.master_handle || '') !== String(masterHandle)) continue;
    throw badRequest(
      `「${e.display_title || e.tree_id}」已认该世本节点为始祖（同姓祖谱唯一），请先解除挂载或改认其他节点`,
    );
  }
  return null;
}

/** 上层镜像节点（顶端镜像段内：founder / chain） */
export function isClanMirrorNode(person, treeId) {
  return isUpperMirror(person, treeId);
}

/** 顶端镜像段（按 gramps_id 升序，即由始祖往下） */
export function clanMirrorNodes(tree) {
  if (!tree?.people) return [];
  return Object.values(tree.people)
    .filter((p) => isUpperMirror(p, tree.tree_id))
    .sort((a, b) => String(a.gramps_id || '').localeCompare(String(b.gramps_id || '')));
}

/** 祖谱自有段（真实数据：非上层镜像） */
export function clanOwnNodes(tree) {
  if (!tree?.people) return [];
  return Object.values(tree.people)
    .filter((p) => !isUpperMirror(p, tree.tree_id))
    .sort((a, b) => String(a.gramps_id || '').localeCompare(String(b.gramps_id || '')));
}

/**
 * 统计口径（docs/clan-tree.spec.md §3-6）：祖谱自有段人数与顶端镜像数**分列**，
 * 镜像不计入本宗人数；祖谱人数不计入世本（世本人数只来自世本自己的树 JSON）。
 */
export function clanStats(tree) {
  const own = clanOwnNodes(tree).length;
  const mirrors = clanMirrorNodes(tree).length;
  return { own_count: own, mirror_count: mirrors, total: own + mirrors };
}

/** 沿世系链下钻：取该节点的第一个子女（zhonghua 源流链是线性链） */
export function firstChainChild(tree, handle) {
  if (!tree?.families) return '';
  for (const f of Object.values(tree.families)) {
    if (!f) continue;
    if (f.father_handle === handle || f.mother_handle === handle) {
      const c = (f.child_handles || [])[0];
      if (c && tree.people?.[c]) return c;
    }
  }
  return '';
}

/**
 * 顶端镜像段计划（纯函数）：从上层节点起，向下沿链取 depth 个节点。
 * 返回 [{handle, master_handle, link_type, name, ...}]，首个为始祖（founder），其余 chain。
 */
export function planClanTopMirrors({ masterTree, masterHandle, depth = DEFAULT_CHAIN_DEPTH }) {
  const master = masterTree?.people?.[masterHandle];
  if (!master) throw notFound('所选上层节点不存在');
  const chain = [masterHandle];
  let cur = masterHandle;
  const want = Math.max(0, Math.min(Number(depth) || 0, MAX_CHAIN_DEPTH));
  for (let i = 0; i < want; i++) {
    const next = firstChainChild(masterTree, cur);
    if (!next) break;
    chain.push(next);
    cur = next;
  }
  return chain.map((mh, i) => ({
    handle: `${CLAN_MIRROR_PREFIX}${mh}`,
    master_handle: mh,
    parent_master_handle: i === 0 ? '' : chain[i - 1],
    link_type: i === 0 ? FOUNDER_LINK_TYPE : CHAIN_LINK_TYPE,
    person: masterTree.people[mh],
  }));
}

/** 镜像节点人物（展示副本：姓名/性别/生卒以真身为准；本层只读） */
export function planClanMirrorPerson({ handle, grampsId, masterPerson, masterTreeId, linkType, gen = null, layerLabel = KIND_LABEL.master, requestedBy = '' }) {
  return {
    handle,
    gramps_id: grampsId,
    name: masterPerson.name || '',
    surname: masterPerson.surname || '',
    given: masterPerson.given || '',
    gender: masterPerson.gender || 'U',
    birth_date: masterPerson.birth_date || '',
    death_date: masterPerson.death_date || '',
    birth_place: '',
    death_place: '',
    is_living: false,
    parent_family: '',
    spouse_families: [],
    external_tree: masterTreeId,
    external_person_handle: masterPerson.handle,
    external_link_type: linkType,
    external_mirror: 'true',
    external_relation_note: founderRelationNote(masterPerson.name, gen, layerLabel),
    ...(requestedBy ? { external_founder_created_by: requestedBy } : {}),
  };
}

/**
 * 清空祖谱顶端镜像段（纯函数：只改传入的 tree 对象）
 * - 删除镜像节点、指向镜像的家族；自有段节点被「解挂」为根（保留）
 * 返回 {removed_handles, removed_families}
 */
export function clearClanTopMirror(tree) {
  const mirrors = clanMirrorNodes(tree);
  if (!mirrors.length) return { removed_handles: [], removed_families: [] };
  const rm = new Set(mirrors.map((p) => p.handle));
  const removedFamilies = [];
  for (const [fh, fam] of Object.entries(tree.families || {})) {
    if (!fam) continue;
    const touched =
      rm.has(fam.father_handle) || rm.has(fam.mother_handle) || (fam.child_handles || []).some((c) => rm.has(c));
    if (!touched) continue;
    for (const c of fam.child_handles || []) {
      if (rm.has(c)) continue;
      if (tree.people[c] && tree.people[c].parent_family === fh) tree.people[c].parent_family = '';
    }
    delete tree.families[fh];
    removedFamilies.push(fh);
  }
  // 残留引用清理（配偶家族 / 子女槽位）
  for (const p of Object.values(tree.people)) {
    if (rm.has(p.handle)) continue;
    p.spouse_families = (p.spouse_families || []).filter((fh) => !removedFamilies.includes(fh));
  }
  for (const h of rm) delete tree.people[h];
  return { removed_handles: [...rm], removed_families: removedFamilies };
}

/**
 * 取一个未被占用的 gramps_id：prefer（如始祖位 I0001）可用则用，否则取下一个未用 I 号。
 * 避免重复认祖时与自有段节点抢号。
 */
export function freeGrampsId(tree, prefer = '') {
  const used = new Set();
  for (const p of Object.values(tree?.people || {})) {
    if (p?.gramps_id) used.add(String(p.gramps_id));
  }
  if (prefer && !used.has(prefer)) return prefer;
  return nextGrampsId(tree, 'I');
}

/**
 * 在祖谱树上应用顶端镜像段（纯函数，供 store.updateTrees 事务内调用）
 * - 幂等：先清空既有镜像段再重建（重复认祖不产生孤儿节点）
 * - ownRootHandle：祖谱自有段的支系入口节点，挂到最深镜像之下（链路下端点）
 */
export function applyClanTopMirror({
  tree,
  masterTree,
  masterTreeId,
  masterHandle,
  depth = DEFAULT_CHAIN_DEPTH,
  ownRootHandle = '',
  requestedBy = '',
  layerLabel = KIND_LABEL.master,
  // 铸号器（全站唯一编号；缺省退回树内序号兜底 → 纯函数单测不受影响）
  allocPersonId = null,
  allocFamilyId = null,
}) {
  if (!tree?.people) throw badRequest('祖谱树数据不可用');
  const masters = planClanTopMirrors({ masterTree, masterHandle, depth });
  clearClanTopMirror(tree);

  const newPersonId = typeof allocPersonId === 'function' ? allocPersonId : null;
  const newFamilyId = (typeof allocFamilyId === 'function' && allocFamilyId) || (() => '');
  let prevHandle = '';
  let founderMirror = '';
  let index = 0;
  for (const m of masters) {
    // 镜像节点是全站节点（人读编号全站唯一）→ 有铸号器时用全局号，没有才退回树内序号
    const grampsId = newPersonId ? newPersonId() : freeGrampsId(tree, index === 0 ? 'I0001' : '');
    const mirror = planClanMirrorPerson({
      handle: m.handle,
      grampsId,
      masterPerson: m.person,
      masterTreeId,
      linkType: m.link_type,
      gen: null,
      layerLabel,
      requestedBy,
    });
    tree.people[m.handle] = mirror;
    if (prevHandle) {
      const famHandle = `cfam_${m.handle}`;
      tree.families[famHandle] = {
        handle: famHandle,
        gramps_id: newFamilyId() || nextGrampsId(tree, 'F'),
        father_handle: prevHandle,
        mother_handle: '',
        child_handles: [m.handle],
      };
      mirror.parent_family = famHandle;
      tree.people[prevHandle].spouse_families = [...(tree.people[prevHandle].spouse_families || []), famHandle];
    } else {
      founderMirror = m.handle;
    }
    prevHandle = m.handle;
    index += 1;
  }

  // 自有段支系入口：挂到最深镜像之下（其下即祖谱自有真实数据）
  if (ownRootHandle && tree.people[ownRootHandle] && prevHandle) {
    const famHandle = `cfam_own_${tree.tree_id || ''}`;
    tree.families[famHandle] = {
      handle: famHandle,
      gramps_id: newFamilyId() || nextGrampsId(tree, 'F'),
      father_handle: prevHandle,
      mother_handle: '',
      child_handles: [ownRootHandle],
    };
    tree.people[ownRootHandle].parent_family = famHandle;
    tree.people[prevHandle].spouse_families = [...(tree.people[prevHandle].spouse_families || []), famHandle];
  }

  // 始祖位编号 = 顶端镜像节点的实际编号（全站唯一；无铸号器时的旧数据仍为 I0001）
  tree.founder_gramps_id = founderMirror
    ? String(tree.people[founderMirror]?.gramps_id || '')
    : tree.founder_gramps_id || '';
  return {
    founder_mirror_handle: founderMirror,
    deepest_mirror_handle: prevHandle,
    mirror_count: masters.length,
    own_root_handle: ownRootHandle || '',
  };
}

// ---- 申请单（纯函数） ----

/** 构造建谱申请单（落 jiazu_clan_requests） */
export function buildClanRequest({
  id,
  surname,
  treeId = '',
  masterTreeId,
  masterHandle,
  masterName = '',
  clanTitle = '',
  requestedBy = '',
  note = '',
  originCode = '',
  now = new Date().toISOString(),
}) {
  return {
    _id: id,
    surname: String(surname || '').trim(),
    tree_id: treeId || '',
    master_tree_id: masterTreeId || '',
    master_handle: masterHandle || '',
    master_name: masterName || '',
    clan_title: String(clanTitle || '').slice(0, 40),
    origin_code: String(originCode || '').trim(),
    status: 'pending',
    requested_by: requestedBy || '',
    note: String(note || '').slice(0, 200),
    reject_reason: '',
    decided_by: '',
    decided_at: '',
    created_at: now,
  };
}

/** 待审批建谱申请：chief 看全部；steward 只看自己发起/本树相关的（与 founder-requests 同口径） */
export function filterPendingClanRequests(list, { chief = false, myTreeIds = [], myPhone = '' } = {}) {
  const mine = new Set((myTreeIds || []).filter(Boolean));
  return (list || [])
    .filter((r) => r.status === 'pending')
    .filter((r) => chief || mine.has(r.tree_id) || (!!myPhone && r.requested_by === myPhone))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// ---- 读路径 ----

async function safeMeta() {
  try {
    return await getMeta();
  } catch {
    return null;
  }
}

async function safeTree(getTreeFn, treeId) {
  try {
    return await getTreeFn(treeId);
  } catch {
    return null;
  }
}

/**
 * 认某祖谱为祖的普通家族树（支系入口列表，读侧推导：其始祖 external_tree = 本祖谱）
 *
 * 推导扩展（docs/branch-clan-ops.spec.md §6-1-6 / §13-6）：【立支】后原树始祖是 N **真身**（无跨树指针），
 * 因此新增一条判定 —— **祖谱自有段里 `external_link_type='founder'` 的登记镜像，按其 `external_tree`
 * 计入支系入口**（一条登记 = 一个入口；立支写 2 条 → 原树与新树各 1 个入口）。
 * 同一 tree_id 同时命中两条推导时以「登记镜像」为准（立支后旧始祖镜像指针可能仍留在原树）。
 * @returns {Promise<Array>} [{tree_id, tree_title, kind, founder_name, person_count, relation_note}]
 */
export async function listClanBranches({ clanTreeId, meta = null, getTreeFn = getTree, listIdsFn = listTreeIds } = {}) {
  const m = meta || (await safeMeta());
  const attachments = await listAttachedTrees({ masterTreeId: clanTreeId, meta: m, getTreeFn, listIdsFn });
  const out = [];
  const seen = new Set();
  const push = (row) => {
    if (!row?.tree_id || seen.has(row.tree_id)) return;
    seen.add(row.tree_id);
    out.push(row);
  };
  // ① 立支登记镜像（宗谱自有段）→ 按其 external_tree 计入入口（一条登记 = 一个入口）
  const clanTree = await safeTree(getTreeFn, clanTreeId);
  for (const reg of clanBranchRegistrations(clanTree, clanTreeId, m)) {
    const entry = reg.entry;
    const t = await safeTree(getTreeFn, reg.tree_id);
    const founderHandle = resolveFounderHandle(t, entry);
    const founder = founderHandle ? t?.people?.[founderHandle] : null;
    push({
      tree_id: reg.tree_id,
      kind: treeKindOf(entry),
      tree_title: entry.display_title || reg.tree_id,
      surname_char: entry.surname_char || (founder?.surname || '').slice(0, 1),
      founder_handle: founderHandle || '',
      founder_gramps_id: founder?.gramps_id || entry.founder_gramps_id || '',
      founder_name: founder?.name || entry.founder_name || reg.name || '',
      master_handle: String(reg.person?.external_person_handle || ''),
      relation_note: reg.person?.external_relation_note || '',
      person_count: t?.people ? Object.keys(t.people).length : 0,
      via: 'branch_register',
    });
  }
  // ② 既有推导：普通树始祖镜像的 external_tree = 本祖谱（同 tree_id 已被登记命中时以登记为准）
  for (const a of attachments) {
    if (seen.has(a.tree_id)) continue;
    const entry = entryOf(m, a.tree_id) || { tree_id: a.tree_id };
    const t = await safeTree(getTreeFn, a.tree_id);
    push({
      ...a,
      kind: treeKindOf(entry),
      tree_title: entry.display_title || a.tree_title || a.tree_id,
      person_count: t?.people ? Object.keys(t.people).length : 0,
    });
  }
  out.sort((a, b) => String(a.tree_id).localeCompare(String(b.tree_id)));
  return out;
}

/**
 * 祖谱自有段的「立支登记镜像」清单（纯函数，docs/branch-clan-ops.spec.md §6-1-6）：
 * `external_mirror='true'` + `external_link_type='founder'` + `external_tree` 指向一棵 **普通家族树**
 * （总谱 / 祖谱自身的挂载镜像不算支系入口）；同一 tree_id 只算一条入口。
 * @returns {Array<{tree_id:string, handle:string, name:string, person:object, entry:object}>}
 */
export function clanBranchRegistrations(tree, clanTreeId, meta = null) {
  const out = [];
  const seen = new Set();
  for (const p of Object.values(tree?.people || {})) {
    if (String(p?.external_mirror || '') !== 'true') continue;
    if (p.external_link_type !== FOUNDER_LINK_TYPE) continue;
    const tid = String(p.external_tree || '');
    if (!tid || tid === clanTreeId || seen.has(tid)) continue;
    const entry = entryOf(meta, tid);
    if (!entry || treeKindOf(entry) !== TREE_KIND.FAMILY) continue; // 只认普通家族树
    seen.add(tid);
    out.push({ tree_id: tid, handle: p.handle, name: p.name || '', person: p, entry });
  }
  return out;
}

/** 祖谱条目清单（读侧推导 master_handle：meta 优先 → 顶端 founder 镜像的 external_person_handle） */
export async function listClans({ meta = null, getTreeFn = getTree, listIdsFn = listTreeIds } = {}) {
  const m = meta || (await safeMeta());
  const entries = Object.values(m?.trees || {}).filter((e) => isClanEntry(e));
  const out = [];
  for (const e of entries) {
    const tree = await safeTree(getTreeFn, e.tree_id);
    const founderMirror = tree ? clanMirrorNodes(tree).find((p) => p.external_link_type === FOUNDER_LINK_TYPE) : null;
    const stats = tree ? clanStats(tree) : { own_count: 0, mirror_count: 0, total: 0 };
    out.push({
      tree_id: e.tree_id,
      tree_title: e.display_title || e.tree_id,
      surname: clanSurnameOf(e),
      master_tree_id: e.master_tree_id || founderMirror?.external_tree || '',
      master_handle: e.master_handle || founderMirror?.external_person_handle || '',
      master_name: e.master_name || founderMirror?.name || '',
      founder_handle: e.founder_handle || '',
      attached_to_master: !!founderMirror,
      ...stats,
    });
  }
  out.sort((a, b) => String(a.tree_id).localeCompare(String(b.tree_id)));
  return out;
}

/** 祖谱页面数据（P4 三段版式：顶端镜像链 / 自有世代统计 / 支系入口列表） */
export async function clanInfo({ treeId, meta = null, getTreeFn = getTree, listIdsFn = listTreeIds } = {}) {
  const m = meta || (await safeMeta());
  const entry = entryOf(m, treeId) || { tree_id: treeId };
  const kind = treeKindOf(entry);
  const tree = await safeTree(getTreeFn, treeId);
  const mirrors = tree ? clanMirrorNodes(tree) : [];
  const own = tree ? clanOwnNodes(tree) : [];
  const founderMirror = mirrors.find((p) => p.external_link_type === FOUNDER_LINK_TYPE) || null;
  const branches = kind === TREE_KIND.CLAN ? await listClanBranches({ clanTreeId: treeId, meta: m, getTreeFn, listIdsFn }) : [];
  return {
    tree_id: treeId,
    kind,
    kind_label: kindLabel(kind),
    title: entry.display_title || treeId,
    genealogy_name: entry.genealogy_name || '',
    surname: clanSurnameOf(entry),
    founder_handle: entry.founder_handle || '',
    master_tree_id: entry.master_tree_id || founderMirror?.external_tree || '',
    master_handle: entry.master_handle || founderMirror?.external_person_handle || '',
    master_name: entry.master_name || founderMirror?.name || '',
    attached_to_master: !!founderMirror,
    notice: founderMirror ? '' : NO_MASTER_MESSAGE,
    mirrors: mirrors.map((p) => ({
      handle: p.handle,
      gramps_id: p.gramps_id || '',
      name: p.name || '',
      gender: p.gender || 'U',
      link_type: p.external_link_type,
      gen: null,
      relation_note: p.external_relation_note || '',
      upper_tree_id: p.external_tree || '',
      upper_handle: p.external_person_handle || '',
    })),
    own: own.map((p) => ({
      handle: p.handle,
      gramps_id: p.gramps_id || '',
      name: p.name || '',
      gender: p.gender || 'U',
      birth_date: p.birth_date || '',
      death_date: p.death_date || '',
    })),
    own_count: own.length,
    mirror_count: mirrors.length,
    branch_count: branches.length,
    branches,
  };
}

// ---- 写路径 ----

/**
 * 新建祖谱（chief_editor 审批通过后调用，docs/clan-tree.spec.md §5）：
 * 树 JSON + 顶端世本镜像段 + tree-meta 注册（kind='clan'）
 * - onBeforeWrite：全部校验通过后、落库前调用
 * - ownRootName：可选的祖谱自有支系入口节点（缺省留空，允许后续续编）
 * - originCode（可选）：结构化发源地（6 位行政区划码）；非空先校验（未知 → 400），通过后覆盖 origin
 */
export async function createClanTree({
  surname,
  clanTitle = '',
  genealogyName = '',
  masterTreeId,
  masterHandle,
  chainDepth = DEFAULT_CHAIN_DEPTH,
  ownRootName = '',
  origin = '',
  originCode = '',
  hallName = '',
  description = '',
  initiatorPhone = '',
  onBeforeWrite = null,
}) {
  const char = String(surname || '').trim();
  if (!/^[\u4e00-\u9fa5]$/.test(char)) throw badRequest('请填写单个汉字姓氏');
  if (!masterTreeId || !masterHandle) throw badRequest('请选择中华世本（总谱）中的始祖节点');
  const code = String(originCode || '').trim();
  if (code && !isKnownOriginCode(code)) throw badRequest(`发源地行政区划代码无效：${code}`);

  const meta = await getMeta();
  const masterEntry = entryOf(meta, masterTreeId);
  if (treeKindOf(masterEntry) !== TREE_KIND.MASTER) throw badRequest('祖谱始祖必须指向中华世本（总谱）节点');
  // 硬口径 1：同姓同世本节点唯一
  assertClanFounderUnique({ entries: meta.trees, surname: char, masterTreeId, masterHandle });

  const masterTree = await getTree(masterTreeId);
  const masterPerson = masterTree?.people?.[masterHandle];
  if (!masterPerson) throw notFound('所选中华世本节点不存在');

  if (onBeforeWrite) await onBeforeWrite();

  const treeId = genClanTreeId(meta, char);
  const now = new Date().toISOString();
  const tree = {
    _schema: '1.0',
    tree_id: treeId,
    kind: TREE_KIND.CLAN,
    founder_gramps_id: '', // 由 applyClanTopMirror 落为始祖镜像的全站唯一编号
    version: 1,
    updated_at: now,
    people: {},
    families: {},
  };

  // 自有段支系入口（可选）：建谱时先立一个自有真人节点，作为各普通树认祖的落点
  let ownRootHandle = '';
  const rootGiven = String(ownRootName || '').trim();
  if (rootGiven) {
    ownRootHandle = genHandle();
    const given = rootGiven.startsWith(char) ? rootGiven.slice(char.length) : rootGiven;
    tree.people[ownRootHandle] = {
      handle: ownRootHandle,
      gramps_id: '',
      name: `${char}${given}`,
      surname: char,
      given,
      gender: 'M',
      birth_date: '',
      death_date: '',
      birth_place: '',
      death_place: '',
      parent_family: '',
      spouse_families: [],
      external_tree: '',
      external_person_handle: '',
      external_link_type: '',
    };
  }

  // 铸号：镜像段人数 = 计划镜像数；自有支系入口 +1（全站唯一编号，docs/id-system.spec.md §3）
  const mirrorPlan = planClanTopMirrors({ masterTree, masterHandle, depth: chainDepth });
  const personIds = await reservePersonIds(mirrorPlan.length + (ownRootHandle ? 1 : 0));
  const familyIds = await reserveFamilyIds(mirrorPlan.length + 1);
  const allocPersonId = idAllocator(personIds);
  const allocFamilyId = idAllocator(familyIds);
  const applied = applyClanTopMirror({
    tree,
    masterTree,
    masterTreeId,
    masterHandle,
    depth: chainDepth,
    ownRootHandle,
    requestedBy: initiatorPhone,
    allocPersonId,
    allocFamilyId,
  });
  // 自有支系入口的执行号在镜像段之后分配
  if (ownRootHandle && tree.people[ownRootHandle]) {
    tree.people[ownRootHandle].gramps_id = allocPersonId() || freeGrampsId(tree, '');
  }

  await createTreeFile(tree);
  try {
    await saveDetail({
      tree_id: treeId,
      handle: applied.founder_mirror_handle,
      gramps_id: tree.people[applied.founder_mirror_handle]?.gramps_id || '',
      name: masterPerson.name || '',
      events: [],
      media: [],
      citations: [],
      notes: [],
      attributes: [],
      updated_at: now,
    });
  } catch {
    /* 详情为展示副本，best-effort */
  }

  meta.trees[treeId] = {
    tree_id: treeId,
    kind: TREE_KIND.CLAN,
    path_alias: `/z/${treeId}`,
    surname: char,
    surname_char: char,
    surname_pinyin: surnamePinyin(char),
    display_title: String(clanTitle || '').trim() || `${char}氏祖谱`,
    genealogy_name: String(genealogyName || '').trim() || `${char}氏祖谱`,
    archive_url: '',
    hall_name: String(hallName || '').trim() || `${char}氏宗祠`,
    origin: code ? resolveOrigin(code).display : String(origin || '').trim(),
    origin_code: code,
    description: String(description || '').trim() || `新建祖谱，始祖：${masterPerson.name || ''}（${kindLabel(TREE_KIND.MASTER)}）`,
    master_tree_id: masterTreeId,
    master_handle: masterHandle,
    master_name: masterPerson.name || '',
    founder_handle: ownRootHandle,
    enable_custom_domain: false,
    created_at: now,
    created_by: initiatorPhone || '',
  };
  await saveMeta(meta);

  return {
    ok: true,
    tree_id: treeId,
    kind: TREE_KIND.CLAN,
    path_alias: `/z/${treeId}`,
    surname: char,
    display_title: meta.trees[treeId].display_title,
    master_tree_id: masterTreeId,
    master_handle: masterHandle,
    master_name: masterPerson.name || '',
    founder_handle: ownRootHandle,
    founder_mirror_handle: applied.founder_mirror_handle,
    mirror_count: applied.mirror_count,
    message: `已建立「${meta.trees[treeId].display_title}」（${treeId}），始祖镜像自${kindLabel(TREE_KIND.MASTER)}「${masterPerson.name || ''}」`,
  };
}

/**
 * 祖谱认祖世本（P2）：写入顶端镜像段（founder + chain），自有段保留（可选重挂支系入口）
 * 幂等：重复认祖先清空既有镜像段再重建。
 */
export async function attachClanToMaster({
  treeId,
  masterTreeId,
  masterHandle,
  chainDepth = DEFAULT_CHAIN_DEPTH,
  ownRootHandle = '',
  requestedBy = '',
}) {
  if (!treeId) throw badRequest('缺少 tree_id');
  if (!masterTreeId || !masterHandle) throw badRequest('请选择中华世本（总谱）中的始祖节点');
  const meta = await getMeta();
  const clanEntry = entryOf(meta, treeId);
  if (!clanEntry) throw notFound(`tree-meta 中找不到树: ${treeId}`);
  if (!isClanEntry(clanEntry)) throw badRequest('仅祖谱可认祖到中华世本（总谱）');
  const masterEntry = entryOf(meta, masterTreeId);
  if (treeKindOf(masterEntry) !== TREE_KIND.MASTER) throw badRequest('祖谱只能认祖到中华世本（总谱）');

  const surname = clanSurnameOf(clanEntry);
  // 硬口径 1：同姓同世本节点唯一（异姓可共享）
  assertClanFounderUnique({ entries: meta.trees, surname, masterTreeId, masterHandle, excludeTreeId: treeId });

  const masterTree = await getTree(masterTreeId);
  const masterPerson = masterTree?.people?.[masterHandle];
  if (!masterPerson) throw notFound('所选中华世本节点不存在');

  const rootHandle = String(ownRootHandle || clanEntry.founder_handle || '').trim();
  // 无始祖态（重置后）的祖谱：认祖 = 指定始祖 → 成功后要把被指定节点回写为 meta 的始祖
  const founderMissing = isFounderMissing(clanEntry);
  const mirrorPlan = planClanTopMirrors({ masterTree, masterHandle, depth: chainDepth });
  const personIds = await reservePersonIds(mirrorPlan.length);
  const familyIds = await reserveFamilyIds(mirrorPlan.length + 1);
  const applied = await updateTrees([treeId], (trees) =>
    applyClanTopMirror({
      tree: trees[treeId],
      masterTree,
      masterTreeId,
      masterHandle,
      depth: chainDepth,
      ownRootHandle: rootHandle,
      requestedBy,
      allocPersonId: idAllocator(personIds),
      allocFamilyId: idAllocator(familyIds),
    }),
  );

  clanEntry.master_tree_id = masterTreeId;
  clanEntry.master_handle = masterHandle;
  clanEntry.master_name = masterPerson.name || '';
  if (rootHandle) clanEntry.founder_handle = rootHandle;
  let registered = null;
  if (founderMissing) {
    const node = (await getTree(treeId))?.people?.[rootHandle] || null;
    registered = planFounderRegister(clanEntry, node || { handle: rootHandle });
    // 注意：clanEntry 是 meta.trees 里的对象引用 —— 删除状态位要显式 delete
    delete clanEntry.founder_state;
    clanEntry.founder_handle = registered.founder_handle;
    clanEntry.founder_gramps_id = registered.founder_gramps_id;
    clanEntry.founder_name = registered.founder_name;
  }
  await saveMeta(meta);

  return {
    ok: true,
    tree_id: treeId,
    kind: TREE_KIND.CLAN,
    master_tree_id: masterTreeId,
    master_handle: masterHandle,
    master_name: masterPerson.name || '',
    founder_mirror_handle: applied.founder_mirror_handle,
    mirror_count: applied.mirror_count,
    // 无始祖态的认祖 = 指定始祖：true 表示本次已把该节点回写为祖谱 meta 的始祖
    founder_registered: !!registered,
    founder_handle: rootHandle,
    message: `已认祖：祖谱 ${treeId} 顶端镜像段挂载至${kindLabel(TREE_KIND.MASTER)}「${masterPerson.name || ''}」`,
  };
}

/**
 * 祖谱与世本解除挂载（P2）：清空顶端镜像段、**保留自有段**（docs/clan-tree.spec.md §5/§9）
 */
export async function detachClanFromMaster({ treeId }) {
  if (!treeId) throw badRequest('缺少 tree_id');
  const meta = await getMeta();
  const entry = entryOf(meta, treeId);
  if (!entry) throw notFound(`tree-meta 中找不到树: ${treeId}`);
  if (!isClanEntry(entry)) throw badRequest('该家族树不是祖谱');
  const tree0 = await getTree(treeId);
  if (!tree0) throw notFound(`树不存在: ${treeId}`);
  const mirrors = clanMirrorNodes(tree0);
  if (!mirrors.length) throw badRequest(NO_MASTER_MESSAGE);

  const removed = await updateTrees([treeId], (trees) => clearClanTopMirror(trees[treeId]));
  for (const h of removed.removed_handles) {
    try {
      await deleteDetail(treeId, h);
    } catch {
      /* best-effort */
    }
  }
  entry.master_tree_id = '';
  entry.master_handle = '';
  entry.master_name = '';
  await saveMeta(meta);

  const after = await getTree(treeId);
  const stats = after ? clanStats(after) : { own_count: 0, mirror_count: 0 };
  return {
    ok: true,
    tree_id: treeId,
    kind: TREE_KIND.CLAN,
    removed_mirrors: removed.removed_handles.length,
    kept_own: stats.own_count,
    notice: NO_MASTER_MESSAGE,
    message: `已解除：祖谱顶端镜像段已清空（自有世代 ${stats.own_count} 人保留）；${NO_MASTER_MESSAGE}`,
  };
}

export { genRequestId, chainGenOf };
