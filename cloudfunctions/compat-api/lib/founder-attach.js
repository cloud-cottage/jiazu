/**
 * 始祖挂载（认祖 / Founders Attach）— 逻辑层
 *
 * 设计见 docs/founder-attach.spec.md。与「嫁出/娶入」同构（镜像 + 跨树写入 + 申请制），
 * 差别在**基数**（总谱节点 1:N，每棵树只能挂 1 个）与**只读范围**（镜像节点整节点只读）。
 *
 * ★ 始祖真源反转（变体 A · 裁定书 v1 Zang 2026-09-20）——「真身在家族树」口径：
 * - R1 单一真源：`external_*` 指针一律指向**真身所在树**；上层树（世本/祖谱）不写反指针，
 *   反向登记一律**读侧推导**（listAttachedTrees / founderTreeLabel / attachedTreesOf）。
 * - R2 家族树始祖 = **真身，本树可写**：认祖（登记到宗谱）**不覆盖**本树始祖身份字段、
 *   **不清空**本树始祖详情 attributes；解除登记只清跨树指针与上层登记，**保留真身数据**。
 * - R2b 取消「空白占位锁」：未登记始祖的自建节点可自行填写（PLACEHOLDER_LOCK_MESSAGE
 *   只保留给「镜像是孤儿（真身不可达）」的历史脏数据）。
 * - R3 只读不变量统一：`external_mirror==='true'` + `external_tree` 非空且 **≠ 本树** →
 *   **本层一律只读**（不论指向层在上还是在下）；真身节点在其所在树可写。
 *   唯一例外 = person-places 的 isPlaceFieldsOnly（出生地 / 居住地，契约 v2 C6）。
 * - R4 宗谱登记镜像：认祖通过后宗谱**自有段**持 1 个指向家族树始祖真身的只读镜像
 *   （`external_link_type='founder'` + `external_mirror='true'` + `external_tree=<家族树>`）；
 *   同一家族树在宗谱内至多 1 条（重复 → 400）。
 * - R6 世数：`external_chain_gen` 读侧沿 `external_*` 链**下钻到真身节点**再读其详情属性
 *   （链断 / 无属性 → 沿用既有结构推导）。
 *
 * 关键约定：
 * - 关系只写在**挂载树**的始祖节点上（external_*，link_type='founder'）；上层树不写反指针，
 *   由读侧推导：`tree-meta.trees[*].founder_handle` → 读该始祖的 external_* → 指向本节点即挂载树。
 * - 家族树始祖的「登记指针」**不写** `external_mirror='true'`（写了就被 R3 锁死 → 本树无法编辑）；
 *   镜像标记只用于**真身在别树**的展示副本（宗谱顶端世本镜像段 / 宗谱登记镜像 / 立支新树始祖）。
 * - 解除后保留始祖位（如 I0001）与 tree-meta.founder_*，只清 external_* 与上层登记。
 * - 「无始祖」态（重置始祖后 tree-meta.founder_state='none'）：该树任意节点均可发起认祖，
 *   认祖成功即把该节点登记为始祖（本模块 registerFounderInMeta）。
 *
 * 本模块的纯函数（plan / apply / resolve / is / filter 系列）不碰 IO，全部可单测；
 * attachFounder/detachFounder/listAttachedTrees 负责读树 → 事务写（store.updateTrees）。
 */
import crypto from 'node:crypto';
import { getMeta, getTree, getDetail, updateTrees, saveMeta, deleteDetail, listTreeIds, nextPersonId } from './store.js';
// 始祖可编辑性例外（契约 v2 C6）：请求体只含出生地 / 居住地两项时放行
import { isPlaceFieldsOnly } from './person-places.js';

/** 始祖挂载的跨树链接类型（区别于 marriage / branch / child） */
export const FOUNDER_LINK_TYPE = 'founder';
/** 祖谱顶端「世系链」镜像的链接类型（docs/clan-tree.spec.md §4-1：其下链路节点） */
export const CHAIN_LINK_TYPE = 'chain';
/** 认祖申请集合（新建集合 → docs/PENDING_DEPLOY.md） */
export const FOUNDER_REQUEST_COLLECTION = 'jiazu_founder_requests';

/** 层级 kind（tree-meta.trees[*].kind；master=中华世本 / clan=祖谱 / family=普通树） */
export const TREE_KIND = { MASTER: 'master', CLAN: 'clan', FAMILY: 'family' };

/** 层级中文名（文案统一来源） */
export const KIND_LABEL = { master: '中华世本', clan: '祖谱', family: '家族树' };

/** 始祖镜像节点指向的是**中华世本**节点时的只读提示（措辞已随 R3 统一：真身在世本） */
export const MIRROR_LOCK_MESSAGE = '始祖节点信息需在中华世本（总谱）中修改';
/** 始祖镜像指向的是**祖谱**节点时的只读提示（docs/clan-tree.spec.md §4-3） */
export const CLAN_FOUNDER_LOCK_MESSAGE = '始祖节点信息需在本姓祖谱中修改';
/** 世系链镜像节点的只读提示（docs/clan-tree.spec.md §3-1 / §3-7） */
export const CHAIN_MIRROR_LOCK_MESSAGE = '该节点为上层（中华世本）镜像，需到总谱修改';
/**
 * **孤儿镜像**（历史脏数据）的只读提示（R2b）：镜像标记在、真身不可达（无 `external_tree`）。
 * 自 2026-09-20 裁定起，**不再**用于「解除挂载后的空白占位」（那个态已可自建真身）。
 */
export const PLACEHOLDER_LOCK_MESSAGE = '该节点为孤儿镜像（真身不可达）：请先解除登记后在本树重建始祖信息';

/** 认祖申请 id */
export function genRequestId() {
  return crypto.randomBytes(12).toString('hex');
}

// ---- 层级（kind）判定 ----

/**
 * 树层级：tree-meta 显式 kind 优先；旧数据缺省（无 kind 字段）按 family 兼容，
 * 其中 is_master 的历史条目按 master（zhonghua）。docs/clan-tree.spec.md §2
 */
export function treeKindOf(entry) {
  const k = String(entry?.kind || '').trim();
  if (k === TREE_KIND.MASTER || k === TREE_KIND.CLAN || k === TREE_KIND.FAMILY) return k;
  return entry?.is_master ? TREE_KIND.MASTER : TREE_KIND.FAMILY;
}

export function kindLabel(kind) {
  return KIND_LABEL[kind] || KIND_LABEL.family;
}

/**
 * 认祖 target 合法性（docs/clan-tree.spec.md §3-2，Kevin 2026-09-15 硬口径）：
 * - 普通家族树 → 只能是 kind='clan'（**禁止**直挂世本）
 * - 祖谱 → 只能是 kind='master'
 * - 中华世本本身不可认祖
 */
export function assertAttachTarget({ sourceTreeId = '', sourceEntry = null, targetTreeId = '', targetEntry = null } = {}) {
  const src = treeKindOf(sourceEntry);
  const tgt = treeKindOf(targetEntry);
  if (src === TREE_KIND.MASTER || (sourceTreeId && sourceEntry?.is_master)) {
    throw badRequest('中华世本总谱本身不可认祖');
  }
  if (src === TREE_KIND.CLAN && tgt !== TREE_KIND.MASTER) {
    throw badRequest('祖谱只能认祖到中华世本（总谱）');
  }
  if (src === TREE_KIND.FAMILY && tgt !== TREE_KIND.CLAN) {
    if (tgt === TREE_KIND.MASTER) throw badRequest('普通家族树不得直挂中华世本，请先建立/认祖到本姓祖谱');
    throw badRequest('普通家族树的认祖目标只能是祖谱');
  }
  if (targetTreeId && sourceTreeId && targetTreeId === sourceTreeId) {
    throw badRequest('不能认祖到自己');
  }
  return { source_kind: src, target_kind: tgt };
}

// ---- 只读判定（R3：只读不变量统一） ----

/** 是否「始祖镜像节点」：本树始祖指向 masterTreeId 的真身（保留导出：全站历史判据） */
export function isFounderMirror(person, masterTreeId) {
  if (!person) return false;
  if (person.external_link_type !== FOUNDER_LINK_TYPE) return false;
  if (!person.external_tree) return false;
  return !masterTreeId || person.external_tree === masterTreeId;
}

/** 镜像标记（`external_mirror === 'true'`，任意 link_type；用于「外树展示副本」判定） */
export function isMirrorMarked(person) {
  return !!person && String(person.external_mirror || '') === 'true';
}

/**
 * R3 只读不变量（**本层一律只读**）：`external_mirror==='true'` 且 `external_tree` 非空
 * 且 `external_tree !== 本树`（始祖 founder 镜像 / 世系链 chain 镜像）——
 * **与方向无关**：指向层在上（家族树 ← 祖谱/世本）还是在下（祖谱 ← 家族树）都只读；
 * 真身节点在其**所在树**内可写（R2）。
 *
 * 为什么必须方向无关：真源反转（变体 A）后新增了「宗谱持有家族树始祖的登记镜像」这一**向下**方向
 * （R4），若沿用「只锁上层镜像」的名判据，向下镜像会被判成可写 → 同一份数据出现可写副本（违反 R1）。
 * @param {string} [treeId] 本树 tree_id（不传 = 不排除「指向本树」的自指针）
 */
export function isReadonlyMirror(person, treeId) {
  if (!person) return false;
  if (!isMirrorMarked(person)) return false;
  if (!person.external_tree) return false;
  if (treeId && person.external_tree === treeId) return false;
  return person.external_link_type === FOUNDER_LINK_TYPE || person.external_link_type === CHAIN_LINK_TYPE;
}

/** 名字保留（历史导出名）：判定已按 R3 重构为方向无关的 `isReadonlyMirror` */
export const isUpperMirror = isReadonlyMirror;

/** 孤儿镜像（历史脏数据，R2b）：镜像标记在、真身不可达（无 external_tree）→ 本层只读 */
export function isOrphanMirror(person) {
  return isMirrorMarked(person) && !person.external_tree;
}

/** 家族树始祖的**登记指针**（R2：真身在本树，指针指向宗谱/上层树的落点；**不带镜像标记**） */
export function hasFounderRegistrationPointer(person) {
  return person?.external_link_type === FOUNDER_LINK_TYPE && !!person.external_tree && !isMirrorMarked(person);
}

/**
 * 新方向（变体 A · R3）的只读文案：真身在**家族树**里 → 按树标题生成
 * 「该节点为 <树标题> 始祖的镜像，需在 <树标题> 中修改」。
 */
export function familyMirrorLockMessage(entry, treeId = '') {
  const title = String(entry?.display_title || treeId || '该家族树');
  return `该节点为 ${title} 始祖的镜像，需在 ${title} 中修改`;
}

/**
 * 镜像节点的只读文案（可编辑 → ''）——**按 external_tree 的 kind 与新方向生成**（R3）：
 * - chain 镜像（世系链）→ 需到总谱修改（真身在世本）
 * - founder 镜像指向 **family**（新方向）→「该节点为 <树标题> 始祖的镜像，需在 <树标题> 中修改」
 * - founder 镜像指向 **clan** → 需在本姓祖谱中修改
 * - founder 镜像指向 **master** → 需在中华世本（总谱）中修改
 */
export async function mirrorLockMessageOf(person, treeId) {
  if (!isReadonlyMirror(person, treeId)) return '';
  if (person.external_link_type === CHAIN_LINK_TYPE) return CHAIN_MIRROR_LOCK_MESSAGE;
  const target = await metaEntryOf(person.external_tree);
  const kind = treeKindOf(target);
  if (kind === TREE_KIND.FAMILY) return familyMirrorLockMessage(target, person.external_tree);
  if (kind === TREE_KIND.CLAN) return CLAN_FOUNDER_LOCK_MESSAGE;
  return MIRROR_LOCK_MESSAGE;
}

/** 名字保留（历史导出名）：委托 `mirrorLockMessageOf`（同一判据，不复制实现） */
export function upperMirrorLockMessage(person, treeId) {
  return mirrorLockMessageOf(person, treeId);
}

/** 一树一挂载：已挂载的树再次认祖 → 400「该家族树已认祖，请先解除挂载」 */
export function assertOneAttachPerTree(person) {
  if (person?.external_link_type === FOUNDER_LINK_TYPE && person.external_tree) {
    const e = new Error('该家族树已认祖，请先解除挂载');
    e.status = 400;
    throw e;
  }
}

/**
 * 始祖节点 gramps_id：tree-meta 优先（如 ji_23395_01 → I0058）→ 树 JSON；都没有 → ''。
 * ⚠️ 绝不兜底 'I0001'：未登记始祖的树（如重置后 / 新建树）不得把 I0001 误判为始祖
 * （与前端 person-archive 的 isFounderNode 同口径）。
 */
export function founderGrampsIdOf(tree, entry) {
  return String(entry?.founder_gramps_id || tree?.founder_gramps_id || '');
}

/**
 * 解析一棵树的始祖节点 handle（读侧推导的起点）：
 * 1) tree-meta.founder_handle → 2) tree-meta/tree.founder_gramps_id（不兜底 I0001）
 * @returns {string} 找不到返回 ''
 */
export function resolveFounderHandle(tree, entry) {
  if (!tree?.people) return '';
  const explicit = String(entry?.founder_handle || '');
  if (explicit && tree.people[explicit]) return explicit;
  const want = founderGrampsIdOf(tree, entry);
  if (!want) return '';
  for (const p of Object.values(tree.people)) {
    if (String(p.gramps_id || '') === want) return p.handle;
  }
  return '';
}

/** 该节点是否本树始祖位置的节点 */
export function isFounderNode(tree, person, entry) {
  const fh = resolveFounderHandle(tree, entry);
  return !!fh && !!person && person.handle === fh;
}

// ---- 「发源地」人工指定的始祖认定（契约 v2 C8′ ④/⑤；Kevin 2026-09-20 认可）----

/** 非镜像根节点：`external_mirror !== 'true'` 且 `parent_family` 为空（镜像节点不作始祖候选） */
export function nonMirrorRoots(tree) {
  return Object.values(tree?.people || {}).filter(
    (p) => p && p.handle && !p.parent_family && String(p.external_mirror) !== 'true',
  );
}

/**
 * 「始祖」认定（C8′ ④）：`tree-meta.founder_handle` 优先（含 `founder_gramps_id` 兜底）；
 * 缺失 → 取**唯一**的非镜像根节点。0 个 / 多个 → 无法认定（返回 null，**不做任何猜测**）。
 * @returns {{handle: string, source: 'meta'|'root'}|null}
 */
export function resolveOriginFounder(tree, entry = null) {
  const byMeta = resolveFounderHandle(tree, entry);
  if (byMeta) return { handle: byMeta, source: 'meta' };
  const roots = nonMirrorRoots(tree);
  if (roots.length !== 1) return null;
  return { handle: roots[0].handle, source: 'root' };
}

/** 始祖无法认定时的中文短句（路由 400 与只读接口的 `founder:null` 共用同一判据） */
export function founderUndecidedMessage(tree) {
  const roots = nonMirrorRoots(tree);
  if (!roots.length) return '本树无法认定始祖：未登记始祖，且树内没有非镜像根节点';
  if (roots.length > 1) return `本树无法认定始祖：未登记始祖，且非镜像根节点有 ${roots.length} 个`;
  return '';
}

/**
 * 始祖三代候选（C8′ ⑤）：第 1 代 = 始祖本人；第 2 代 = 以始祖为父/母的家族子女；
 * 第 3 代 = 再下一层。顺序 = 逐代、按树内 `people` 键序（稳定）；同一节点只出现一次（防环）。
 * @returns {{handle: string, generation: 1|2|3}[]} 始祖 handle 为空 → []
 */
export function founderThreeGenerations(tree, founderHandle) {
  const out = [];
  const seen = new Set();
  let level = founderHandle && tree?.people?.[founderHandle] ? [founderHandle] : [];
  for (let generation = 1; generation <= 3 && level.length; generation++) {
    const next = [];
    for (const h of level) {
      if (seen.has(h)) continue;
      seen.add(h);
      out.push({ handle: h, generation });
      const p = tree.people[h];
      for (const fh of p?.spouse_families || []) {
        for (const ch of tree.families?.[fh]?.child_handles || []) {
          if (tree.people?.[ch] && !seen.has(ch)) next.push(ch);
        }
      }
    }
    level = next;
  }
  return out;
}

/**
 * 「挂载到 masterTreeId 的始祖镜像节点」handle（读侧推导专用，docs/founder-attach.spec §3-2）。
 * 与 resolveFounderHandle 的区别：祖谱（kind='clan'）的 tree-meta.founder_handle 指向的是
 * **自有支系段入口**（如 季花），而挂到世本的镜像在顶端链首（link_type='founder'）；
 * 所以这里按「external_link_type==='founder' && external_tree===masterTreeId」实扫，始祖位优先。
 * @returns {string} 找不到返回 ''
 */
export function findAttachedFounderHandle(tree, entry, masterTreeId) {
  if (!tree?.people) return '';
  const hits = [];
  for (const [h, p] of Object.entries(tree.people)) {
    if (p?.external_link_type === FOUNDER_LINK_TYPE && p?.external_tree === masterTreeId) hits.push(h);
  }
  if (!hits.length) return '';
  const pref = resolveFounderHandle(tree, entry);
  return hits.includes(pref) ? pref : hits.sort()[0];
}

/**
 * 始祖节点在本树内的只读判定 → 返回提示文案（可编辑返回 ''）
 * - ① 镜像态（真身在别树）→ 整节点只读
 * - ② 孤儿镜像（镜像标记在、真身不可达；历史脏数据）→ 只读（R2b：本文案**只**保留给这一支）
 * - ③ 其余（真身始祖 / 解除登记后的始祖位 / 尚未认祖的自建始祖位）→ `''`（本树可写）
 *
 * @param {object} [entry] 保留参数（调用方兼容）；**R2b 起不再参与判定** ——
 *   「空白占位」形态已不再上锁（家族树始祖未挂载时可由 steward/chief 自建真身）。
 */
export function founderLockMessage(person, tree, masterTreeId, entry = null) {
  if (!person || !tree) return '';
  if (masterTreeId && tree.tree_id === masterTreeId) return '';
  // ① 镜像 / 指针指向 masterTreeId 的历史 founder 指针 → 整节点只读
  const founderPointerToMaster =
    person.external_link_type === FOUNDER_LINK_TYPE && !!person.external_tree && person.external_tree === masterTreeId;
  if ((isMirrorMarked(person) || founderPointerToMaster) && isFounderMirror(person, masterTreeId)) {
    return MIRROR_LOCK_MESSAGE;
  }
  // ② 孤儿镜像（真身不可达）
  if (isOrphanMirror(person)) return PLACEHOLDER_LOCK_MESSAGE;
  return '';
}

/**
 * 节点写只读文案（**路由预检与写路径的唯一判据**）：
 * ① 镜像（`mirrorLockMessageOf`：R3 方向无关 —— 世本/祖谱镜像、世系链镜像、
 *    **宗谱持有的家族树始祖登记镜像**、立支新树的始祖镜像）优先，
 * ② 其后才是始祖锁（`founderLockMessage`：历史 founder 指针 / 孤儿镜像）。
 * `masterTreeId` 树自身（中华世本）恒可编辑 → `''`。
 *
 * 为什么必须是**同一个函数**：两条判据此前分别落在路由层（只查 founderLockMessage）与写路径
 * （再并上 upperMirrorLockMessage）→ 祖谱镜像 / chain 镜像节点在路由预检漏放，走到扣费之后才 403，
 * 响应带 `fee_refunded` 且资产流水出现成对的 `edit_fee -1` + `fee_refund +1`（实测缺陷）。
 * @returns {Promise<string>} 可编辑 → `''`
 */
export async function personEditLockMessage(person, tree, masterTreeId, entry = null) {
  if (!person || !tree) return '';
  if (masterTreeId && tree.tree_id === masterTreeId) return '';
  const mirrorLock = await mirrorLockMessageOf(person, tree.tree_id);
  if (mirrorLock) return mirrorLock;
  return founderLockMessage(person, tree, masterTreeId, entry);
}

/**
 * 断言始祖节点可编辑（写路径统一入口；不可编辑 → 403）
 *
 * 例外（契约 v2 C6）：请求体**只**含 `birth_place` / `residence_places` 两项时放行 ——
 * 始祖的出生地 / 居住地属于本树自填记录（家族树「来源地」镜像也读它），
 * 而姓名 / 生卒 / 健在等身份字段仍走镜像只读（同一请求里夹带任一锁字段 → 照旧 403）。
 *
 * 判据与写路径（`lib/tree-write.js` 的 `updatePerson`）**同一函数** `personEditLockMessage`，
 * 覆盖全部只读分支（本树始祖镜像 / 空白占位 / 祖谱镜像 / 世本镜像 / chain 镜像）——
 * 预检必须拦在扣费之前，被拒请求不得产生任何资产流水。
 * @param {object|null} body PUT 请求体；不传 = 沿用旧口径（一律按只读断言）
 */
export async function assertFounderEditable(tree, handle, masterTreeId, entry = null, body = null) {
  const person = tree?.people?.[handle];
  if (!person) return;
  if (tree.tree_id === masterTreeId) return;
  const metaEntry = entry || (await metaEntryOf(tree.tree_id));
  const msg = await personEditLockMessage(person, tree, masterTreeId, metaEntry);
  if (msg && !isPlaceFieldsOnly(body)) {
    const e = new Error(msg);
    e.status = 403;
    throw e;
  }
}

async function safeMeta() {
  try {
    return await getMeta();
  } catch {
    return null;
  }
}

/** meta entry（按 tree_id 查） */
export async function metaEntryOf(treeId) {
  const meta = await safeMeta();
  return Object.values(meta?.trees || {}).find((t) => t.tree_id === treeId) || null;
}

// ---- 挂载字段计划（纯函数） ----

/** 总谱真身的世数文案（details.attributes.external_chain_gen） */
export function chainGenOf(detail) {
  const raw = (detail?.attributes || []).find((a) => a.key === 'external_chain_gen')?.value;
  const n = parseInt(raw || '', 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * R6 世数读侧：从 (treeId, handle) 出发**沿 `external_*` 链下钻到真身节点**，
 * 再读该真身节点详情的 `attributes.external_chain_gen`。
 *
 * - 起点节点自身带 `external_chain_gen` → 直接采用（自身世数优先，与既有自持口径一致）；
 * - 否则若该节点是**镜像**（`external_mirror='true'` 且指向别树、带外部节点 handle）→ 下钻一层；
 * - 链断（无指针 / 目标不存在 / 环）或链上无属性 → `gen: null`（**由调用方沿用既有结构推导**，
 *   绝不猜一个世数）。
 *
 * @param {{treeId:string, handle:string, maxDepth?:number}} p
 * @returns {Promise<{gen:(number|null), source:'attribute'|'none', tree_id:string, handle:string, hops:number}>}
 */
export async function resolveChainGen({ treeId, handle, maxDepth = 8 } = {}) {
  const none = { gen: null, source: 'none', tree_id: String(treeId || ''), handle: String(handle || ''), hops: 0 };
  if (!treeId || !handle) return none;
  const visited = new Set();
  let curTree = String(treeId);
  let curHandle = String(handle);
  for (let hop = 0; hop < maxDepth; hop++) {
    const key = `${curTree}:${curHandle}`;
    if (visited.has(key)) return none; // 环 → 链断
    visited.add(key);
    const detail = await getDetail(curTree, curHandle);
    const gen = chainGenOf(detail);
    if (gen !== null) return { gen, source: 'attribute', tree_id: curTree, handle: curHandle, hops: hop };
    const tree = await getTree(curTree);
    const person = tree?.people?.[curHandle];
    if (!isReadonlyMirror(person, curTree) || !person.external_person_handle) return none;
    curTree = String(person.external_tree);
    curHandle = String(person.external_person_handle);
  }
  return none;
}

/** 关系备注：`<真身姓名>（中华世本 · 第 N 世）`（层可换：祖谱；无世数则省略第 N 世） */
export function founderRelationNote(masterName, gen, layerLabel = KIND_LABEL.master) {
  const who = String(masterName || '').trim() || `${layerLabel}节点`;
  const layer = String(layerLabel || KIND_LABEL.master);
  return gen === null || gen === undefined ? `${who}（${layer}）` : `${who}（${layer} · 第 ${gen} 世）`;
}

/** 宗谱登记镜像的关系备注（R4 逐字口径）：`<姓名>（<家族树标题> · 始祖）` */
export function founderRegistrationNote(name, familyTreeTitle) {
  const who = String(name || '').trim() || '家族树始祖';
  return `${who}（${String(familyTreeTitle || '家族树').trim() || '家族树'} · 始祖）`;
}

/**
 * 镜像节点字段计划（纯函数）：跨树指针（§3-1）+ 姓名/性别/生卒 = 真身数据的**展示副本**。
 * 使用者 = 【宗谱登记镜像】（R4：真身在**家族树**）/ 立支新树始祖镜像（真身在**同层原树**）；
 * 家族树始祖**本身**不再走这里（R2：真身在家族树，走 `planFounderRegistration`）。
 */
export function planFounderMirror(founder, masterPerson, masterTreeId, gen, requestedBy = '', layerLabel = KIND_LABEL.master) {
  return {
    ...founder,
    name: masterPerson.name || '',
    surname: masterPerson.surname || '',
    given: masterPerson.given || '',
    gender: masterPerson.gender || 'U',
    birth_date: masterPerson.birth_date || '',
    death_date: masterPerson.death_date || '',
    external_tree: masterTreeId,
    external_person_handle: masterPerson.handle,
    external_link_type: FOUNDER_LINK_TYPE,
    external_mirror: 'true',
    external_relation_note: founderRelationNote(masterPerson.name, gen, layerLabel),
    ...(requestedBy ? { external_founder_created_by: requestedBy } : {}),
  };
}

/**
 * 认祖登记字段计划（纯函数 · R2）：家族树始祖**保持真身**——
 * 身份字段（姓名 / 性别 / 生卒 / 称号详情）一律**不动**，只写跨树登记指针，
 * 且**不写** `external_mirror='true'`（写了就被 R3 只读不变量锁死，本树始祖将无法再编辑）。
 */
export function planFounderRegistration(founder, { masterTreeId, masterPerson, gen = null, requestedBy = '', layerLabel = KIND_LABEL.clan }) {
  return {
    ...founder,
    external_tree: masterTreeId,
    external_person_handle: masterPerson.handle,
    external_link_type: FOUNDER_LINK_TYPE,
    external_mirror: '',
    external_relation_note: founderRelationNote(masterPerson.name, gen, layerLabel),
    ...(requestedBy ? { external_founder_created_by: requestedBy } : {}),
  };
}

/**
 * 解除登记 / 解除挂载字段计划（纯函数 · R2）：**只清跨树指针与上层登记**，
 * 真身身份数据（姓名 / 性别 / 生卒 / 出生地）与家族关系**原样保留**（不再清成空白占位）。
 */
export function planFounderDetach(founder) {
  return {
    ...founder,
    external_tree: '',
    external_person_handle: '',
    external_link_type: '',
    external_mirror: '',
    external_relation_note: '',
    external_founder_created_by: '',
    external_prev_clan_founder_handle: '',
  };
}

/**
 * 在树对象上应用认祖登记（供 store.updateTrees 事务内调用；纯函数：只改传入对象）
 * 家族树始祖 = 真身：身份字段与详情文档**一个字节不动**（R2）。
 */
export function applyFounderAttach({ tree, founderHandle, masterPerson, masterTreeId, gen, requestedBy = '', layerLabel = KIND_LABEL.clan }) {
  const founder = tree.people[founderHandle];
  if (!founder) {
    const e = new Error('始祖节点不存在于该家族树');
    e.status = 404;
    throw e;
  }
  Object.assign(founder, planFounderRegistration(founder, { masterTreeId, masterPerson, gen, requestedBy, layerLabel }));
  return { founder_handle: founderHandle, founder_name: founder.name };
}

/** 在树对象上应用解除（供事务内调用；纯函数）：真身数据保留 */
export function applyFounderDetach({ tree, founderHandle }) {
  const founder = tree.people[founderHandle];
  if (!founder) {
    const e = new Error('始祖节点不存在于该家族树');
    e.status = 404;
    throw e;
  }
  Object.assign(founder, planFounderDetach(founder));
  return { founder_handle: founderHandle };
}

// ---- 宗谱登记镜像（R4）----

/**
 * 是否「宗谱登记镜像」：落在宗谱自有段、**指向别的树**（家族树真身）的 founder 只读镜像。
 * 与「祖谱顶端世本镜像段」的区别：那一段的 `external_tree` = 世本（master），
 * 本判据的 `external_tree` = 某棵**普通家族树**（R4 唯一约定）。
 */
export function isClanRegistration(person, clanTreeId = '') {
  return isReadonlyMirror(person, clanTreeId);
}

/** 宗谱内某家族树的登记镜像（R4：同一家族树至多 1 条）→ 找不到返回 null */
export function clanRegistrationOf(clanTree, familyTreeId, clanTreeId = '') {
  const cid = clanTreeId || clanTree?.tree_id || '';
  const hits = clanRegistrations(clanTree, cid).filter((p) => String(p.external_tree || '') === String(familyTreeId || ''));
  return hits.length ? hits.sort((a, b) => String(a.gramps_id || '').localeCompare(String(b.gramps_id || '')))[0] : null;
}

/**
 * 宗谱自有段全部**外指镜像**（`external_mirror='true'` 且 `external_tree` ≠ 本树）——
 * 含两类：① R4 **登记镜像**（`external_tree` = 被登记的家族树；
 * 用 `clanRegistrationOf(clanTree, familyTreeId)` 精确取某一棵家族树的登记）；
 * ② 顶端**世本镜像段**（`external_tree` = 中华世本，非登记）。
 * ⚠️ 只排除指向宗谱**自身**的指针；要「只取登记镜像」必须按目标树的 kind 过滤
 * （见 `registerClanFounderIfVacant`：按 meta 的 kind === 'family' 过滤）。
 */
export function clanRegistrations(clanTree, clanTreeId = '') {
  const cid = clanTreeId || clanTree?.tree_id || '';
  return Object.values(clanTree?.people || {}).filter(
    (p) => isClanRegistration(p, cid) && String(p.external_tree || '') && String(p.external_tree) !== cid,
  );
}

/** R4 基数：同一家族树在宗谱内**至多 1 条**登记镜像（重复 → 400） */
export function assertOneRegistrationPerFamilyTree(clanTree, familyTreeId, clanTreeId = '') {
  if (!familyTreeId) return;
  if (clanRegistrationOf(clanTree, familyTreeId, clanTreeId)) {
    throw badRequest('该家族树在本宗谱内已有始祖登记，请先解除登记（或解除挂载）后再操作');
  }
}

/**
 * 宗谱登记镜像计划（纯函数 · R4）：宗谱自有段新增 1 个指向**家族树始祖真身**的只读镜像节点。
 * 字段：`external_tree=<家族树 tree_id>`、`external_person_handle=<家族树始祖 handle>`、
 * `external_link_type='founder'`、`external_mirror='true'`、
 * `external_relation_note='<姓名>（<家族树标题> · 始祖）'`。
 *
 * `prevClanFounderHandle` = 本次登记前宗谱 `tree-meta.founder_handle` 的值（可为空）：
 * 落成 `external_prev_clan_founder_handle`，供「解除登记」时**可逆还原**宗谱始祖登记
 * （⚠️ 非跨树指针：只在宗谱内自查，绝不作为反向引用挂在被登记的家族树上）。
 */
export function planClanRegistrationMirror({
  familyFounder,
  familyTreeId,
  familyTreeTitle = '',
  handle,
  grampsId,
  prevClanFounderHandle = '',
}) {
  const display = planFounderMirror({ handle, gramps_id: grampsId }, familyFounder || {}, familyTreeId, null, '', familyTreeTitle);
  return {
    ...display,
    external_relation_note: founderRegistrationNote(familyFounder?.name, familyTreeTitle),
    ...(prevClanFounderHandle ? { external_prev_clan_founder_handle: String(prevClanFounderHandle) } : {}),
  };
}

/** 在宗谱树对象上应用登记镜像（供事务内调用；纯函数）：登记镜像落在宗谱**自有段** */
export function applyClanRegistration({ clan, registration }) {
  if (!clan?.people || !registration?.handle) throw badRequest('宗谱登记镜像缺少必要字段');
  if (clan.people[registration.handle]) throw badRequest('宗谱登记镜像 handle 冲突');
  clan.people[registration.handle] = { ...registration, parent_family: '', spouse_families: [] };
  return { registration_handle: registration.handle };
}

/** 在宗谱树对象上移除登记镜像（供事务内调用；纯函数）：连带摘掉家族槽位里的引用 */
export function applyClanRegistrationRemoval({ clan, registrationHandle }) {
  const person = clan?.people?.[registrationHandle];
  if (!person) return { removed_handle: '' };
  for (const fam of Object.values(clan.families || {})) {
    fam.child_handles = (fam.child_handles || []).filter((h) => h !== registrationHandle);
  }
  delete clan.people[registrationHandle];
  return { removed_handle: registrationHandle };
}

// ---- 重置始祖（清空本树始祖登记，回到「无始祖」态） ----

/** 本树「无始祖」标志（tree-meta.trees[*].founder_state） */
export const FOUNDER_STATE_NONE = 'none';

// ---- 无始祖态（重置后）：认祖 = 指定始祖 ----

/** 本树是否「无始祖」态（tree-meta.founder_state === 'none'：重置后 / 从未指定） */
export function isFounderMissing(entry) {
  return String(entry?.founder_state || '') === FOUNDER_STATE_NONE;
}

/**
 * 认祖入口守卫（纯函数；前后端同一口径）：
 * - 无始祖态（founder_state='none'）→ **该树任意节点**均可发起认祖（语义：由管理员指定始祖节点）
 * - 已有登记的始祖 → 仅始祖位置节点（meta.founder_handle → founder_gramps_id → 树 JSON）
 *   与祖谱顶端的上层镜像（founder / chain）
 * 注：不兜底 'I0001' —— 未登记始祖的树不得把 I0001 当始祖（见 founderGrampsIdOf）。
 */
export function canInitiateAttach({ tree, person, entry, treeId = '' }) {
  if (!person) return false;
  if (isFounderMissing(entry)) return true;
  if (isFounderNode(tree, person, entry)) return true;
  return isUpperMirror(person, treeId || tree?.tree_id || '');
}

/**
 * 无始祖态认祖成功 → 该被指定节点登记为始祖（纯函数）：
 * 回写 founder_handle / founder_gramps_id / founder_name，并删除 founder_state（回到「有始祖」态）。
 * 其他元数据（堂号/简介/祖谱的上层指针等）原样保留。
 */
export function planFounderRegister(entry, person) {
  const next = { ...(entry || {}) };
  delete next.founder_state;
  next.founder_handle = String(person?.handle || '');
  next.founder_gramps_id = String(person?.gramps_id || '');
  next.founder_name = String(person?.name || '');
  return next;
}

/** 始祖为镜像时的重置拒绝文案（前端提示同一句） */
export const FOUNDER_RESET_MIRROR_MESSAGE = '该始祖为镜像节点，请先「解除挂载」再重置';

/**
 * 当前始祖节点 handle（重置前的「谁是始祖」判定）：
 * ① 已挂载的始祖镜像优先（family 的始祖镜像 / 祖谱顶端世本镜像）——这是**当前生效**的始祖；
 * ② 否则按 tree-meta.founder_handle → founder_gramps_id → 树 JSON 解析（老的、非镜像的真人始祖）；
 *    未登记始祖的树（含 founder_state='none'）→ ''（不兜底 I0001）。
 * @returns {string} 找不到返回 ''
 */
export function currentFounderHandle(tree, entry) {
  if (tree?.people) {
    const hits = [];
    for (const [h, p] of Object.entries(tree.people)) {
      if (p?.external_link_type === FOUNDER_LINK_TYPE && p?.external_tree) hits.push(h);
    }
    if (hits.length) {
      const pref = resolveFounderHandle(tree, entry);
      return hits.includes(pref) ? pref : hits.sort()[0];
    }
  }
  return resolveFounderHandle(tree, entry);
}

/**
 * 重置前的守卫（纯函数）：
 * - 总谱（kind='master'）不可重置 → 400
 * - 当前始祖是镜像（link_type='founder' 或 external_mirror='true'）→ 400「请先解除挂载」
 * @returns {{founder_handle: string, founder_gramps_id: string, founder_name: string}}
 */
export function assertFounderResettable({ entry, tree }) {
  if (treeKindOf(entry) === TREE_KIND.MASTER) throw badRequest('中华世本总谱不可重置始祖');
  const fh = currentFounderHandle(tree, entry);
  const founder = fh ? tree?.people?.[fh] : null;
  if (founder && (founder.external_link_type === FOUNDER_LINK_TYPE || String(founder.external_mirror || '') === 'true')) {
    const e = new Error(FOUNDER_RESET_MIRROR_MESSAGE);
    e.status = 400;
    throw e;
  }
  return {
    founder_handle: fh,
    founder_gramps_id: String(founder?.gramps_id || entry?.founder_gramps_id || ''),
    founder_name: String(founder?.name || entry?.founder_name || ''),
  };
}

/**
 * 重置后的 tree-meta 条目（纯函数）：删除始祖登记字段 + 置 founder_state='none'。
 * 只动这三个字段与状态位，其他元数据（堂号/简介/祖谱的上层指针等）原样保留。
 */
export function planFounderReset(entry) {
  const next = { ...(entry || {}) };
  delete next.founder_handle;
  delete next.founder_gramps_id;
  delete next.founder_name;
  next.founder_state = FOUNDER_STATE_NONE;
  return next;
}

// ---- 申请单（纯函数） ----

/** 构造认祖申请单（落 jiazu_founder_requests） */
export function buildFounderRequest({ id, treeId, founder, masterTreeId, masterPerson, requestedBy = '', note = '', targetKind = '', now = new Date().toISOString() }) {
  return {
    _id: id,
    tree_id: treeId,
    founder_handle: founder.handle,
    founder_gramps_id: founder.gramps_id || '',
    founder_name: founder.name || '',
    master_tree_id: masterTreeId,
    master_handle: masterPerson.handle,
    master_name: masterPerson.name || '',
    status: 'pending',
    requested_by: requestedBy,
    note: String(note || '').slice(0, 200),
    reject_reason: '',
    decided_by: '',
    created_at: now,
    decided_at: '',
    ...(targetKind ? { target_kind: targetKind } : {}),
  };
}

/** 待审批列表过滤：chief 看全部；steward 只看本树（与 marriage-requests 同口径） */
export function filterPendingRequests(list, { chief = false, myTree = '' } = {}) {
  return (list || [])
    .filter((r) => r.status === 'pending')
    .filter((r) => chief || r.tree_id === myTree)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

// ---- 写路径（读树 + 事务落库） ----

/**
 * 建立始祖挂载（认祖审批通过 / 总编辑直接挂载两条入口共用）——**变体 A · R2 / R4**：
 *
 * ① 家族树始祖**保持真身**：只写登记指针，不覆盖身份字段、不写 `external_mirror='true'`、
 *    不清空本树详情 attributes（真身可写，见 `planFounderRegistration`）；
 * ② 宗谱**自有段**新增 1 条只读**登记镜像**（`external_tree = 本家族树`，R4）；
 *    同一家族树在本宗谱内已有登记 → 400（基数 1）；
 * ③ 世数（R6）沿 `external_*` 链下钻到真身节点后读 `external_chain_gen`。
 *
 * 上层树的结构一个字节不改（不写反指针）；本树始祖位置不变（如 I0001 原位）。
 *
 * ⚠️ **R1 硬守卫**：目标树 kind='master'（世本）→ 400「须走 `attachClanToMaster`」。
 * 本函数只写「普通家族树 → 祖谱」的登记（登记镜像落 `masterTreeId` 那棵树），若被 lib 层直调
 * 而目标是世本，登记镜像会落进世本树 = 违反 R1「世本不新建节点」；路由层的 srcKind 分派不足以兜住直调。
 * @returns {Promise<object>}
 */
export async function attachFounder({ treeId, founderHandle, masterTreeId, masterHandle, requestedBy = '', entry = null, targetEntry = null }) {
  if (!treeId || !founderHandle) throw badRequest('缺少 tree_id 或 founder_handle');
  if (!masterTreeId || !masterHandle) throw badRequest('缺少中华世本节点');
  if (treeId === masterTreeId) throw badRequest('中华世本总谱本身不可认祖');

  const meta = entry !== null && entry !== undefined ? entry : await metaEntryOf(treeId);
  const tree0 = await getTree(treeId);
  if (!tree0) throw badRequest(`树不存在: ${treeId}`);
  const founder = tree0.people[founderHandle];
  if (!founder) throw notFound('该家族树中找不到始祖节点');
  // 无始祖态（重置后）：认祖 = 指定始祖 → 任意节点均可；否则仅始祖位置节点
  const founderMissing = isFounderMissing(meta);
  if (!founderMissing && !isFounderNode(tree0, founder, meta)) {
    throw badRequest('仅本家族树的始祖节点可发起认祖');
  }

  // 认祖 target 合法性（docs/clan-tree.spec.md §3-2）：普通树只能认祖谱，祖谱只能认世本
  const tgt = targetEntry !== null && targetEntry !== undefined ? targetEntry : await metaEntryOf(masterTreeId);
  assertAttachTarget({ sourceTreeId: treeId, sourceEntry: meta, targetTreeId: masterTreeId, targetEntry: tgt });

  // ---- R1 硬守卫（lib 层直调口径；与 `index.js` 的 srcKind 分派同口径）----
  // 本函数的写路径只服务「**普通家族树 → 祖谱**」：`applyClanRegistration` 把登记镜像落进
  // `masterTreeId` 指向的那棵树。目标 kind='master'（世本）时若被绕过路由直接调用，
  // 登记镜像会被写进**世本树** → 直接违反 R1「世本不新建节点」（`assertAttachTarget` 允许
  // clan→master，故此处必须再挡一层，不能只靠路由分派）。
  // 祖谱认祖世本一律走 `clan.attachClanToMaster`（docs/clan-tree.spec.md §5 / §11-2）。
  if (treeKindOf(tgt) === TREE_KIND.MASTER) {
    throw badRequest('祖谱认祖世本须走 attachClanToMaster；本接口只受理普通家族树 → 祖谱的登记');
  }

  assertOneAttachPerTree(founder);

  const masterTree = await getTree(masterTreeId);
  if (!masterTree) throw badRequest(`上层树不存在: ${masterTreeId}`);
  const masterPerson = masterTree.people[masterHandle];
  if (!masterPerson) throw notFound('所选上层树节点不存在');

  // R6：沿 external_* 链下钻到真身节点后读世数（链断 → null → 备注省略「第 N 世」）
  const gen = (await resolveChainGen({ treeId: masterTreeId, handle: masterHandle })).gen;
  const layerLabel = kindLabel(treeKindOf(tgt));

  // R4 基数：同一家族树在本宗谱内至多 1 条登记镜像（重复 → 400，先于任何写入）
  assertOneRegistrationPerFamilyTree(masterTree, treeId, masterTreeId);

  const registration = planClanRegistrationMirror({
    familyFounder: founder,
    familyTreeId: treeId,
    familyTreeTitle: String(meta?.display_title || treeId),
    handle: crypto.randomBytes(12).toString('hex'),
    grampsId: await nextPersonId(),
    prevClanFounderHandle: String(tgt?.founder_handle || ''),
  });

  const applied = await updateTrees([treeId, masterTreeId], (trees) => ({
    founder: applyFounderAttach({
      tree: trees[treeId],
      founderHandle,
      masterPerson,
      masterTreeId,
      gen,
      requestedBy,
      layerLabel,
    }),
    registration: applyClanRegistration({ clan: trees[masterTreeId], registration }),
  }));

  // 无始祖态的认祖 = 指定始祖：同一次写入里把该节点回写为 tree-meta 的始祖（删除 founder_state）
  let registered = null;
  if (founderMissing) {
    const node = (await getTree(treeId))?.people?.[founderHandle] || founder;
    registered = await registerFounderInMeta(treeId, node);
  }

  // R4 尾句：宗谱**尚无**始祖登记 → founder_handle 指向本次登记镜像。
  // （宗谱已有前任自有段入口时**保留**：零存量迁移下不得让登记镜像顶掉宗谱自有段落点 /
  //   立支落点 / 世数起点 —— 见裁定书实现说明的偏差登记。）
  await registerClanFounderIfVacant(masterTreeId);

  return {
    ok: true,
    tree_id: treeId,
    founder_handle: applied.founder_handle,
    founder_name: masterPerson.name || '',
    master_tree_id: masterTreeId,
    master_handle: masterHandle,
    master_name: masterPerson.name || '',
    gen,
    target_kind: treeKindOf(tgt),
    relation_note: founderRelationNote(masterPerson.name, gen, layerLabel),
    // 无始祖态的认祖 = 指定始祖：true 表示本次已把该节点回写为 tree-meta 的始祖
    founder_registered: !!registered,
    // R2：本树始祖仍是**真身**（身份字段与详情未被覆盖）；R4：宗谱侧写了 1 条只读登记镜像
    founder_true_body: true,
    clan_registration_handle: registration.handle,
    clan_registration_gramps_id: registration.gramps_id,
    message: `已认祖：${treeId} 始祖登记至${layerLabel}「${masterPerson.name}」（本树始祖仍可编辑）`,
  };
}

/**
 * 「无始祖态认祖 = 指定始祖」落进 tree-meta（走 store.saveMeta 的沙箱护栏路径）：
 * 回写 founder_handle / founder_gramps_id / founder_name = 被指定节点，并删除 founder_state。
 * @returns {Promise<object|null>} 更新后的 meta 条目（meta 无该树 → null，不写）
 */
export async function registerFounderInMeta(treeId, person) {
  const m = await getMeta();
  const trees = m?.trees || {};
  const key = Object.keys(trees).find((k) => trees[k]?.tree_id === treeId) || '';
  if (!key) return null;
  const entry = planFounderRegister(trees[key], person);
  await saveMeta({ ...m, trees: { ...trees, [key]: entry } });
  return entry;
}

/**
 * 宗谱始祖登记（R4 尾句）：宗谱 `tree-meta.founder_handle` **为空**时指向其自有段的登记镜像。
 * 已有前任自有段入口 → **保留**（零存量迁移下不得让登记镜像顶掉宗谱自有段落点）。
 * @returns {Promise<boolean>} 本次是否写入了宗谱始祖登记
 */
export async function registerClanFounderIfVacant(clanTreeId) {
  const m = await getMeta();
  const key = Object.keys(m?.trees || {}).find((k) => m.trees[k]?.tree_id === clanTreeId) || '';
  if (!key) return false;
  const entry = m.trees[key];
  if (String(entry?.founder_handle || '').trim()) return false;
  const clanTree = await getTree(clanTreeId);
  // R4 末句：只认**登记镜像**（`external_tree` 指向一棵普通家族树）——顶端**世本镜像段**
  // （`external_tree` = 中华世本）不是登记，绝不能被选成宗谱始祖登记。
  const kindOfId = (id) =>
    treeKindOf(Object.values(m?.trees || {}).find((t) => String(t?.tree_id || '') === String(id || '')));
  const regs = clanRegistrations(clanTree, clanTreeId).filter((p) => kindOfId(p.external_tree) === TREE_KIND.FAMILY);
  if (!regs.length) return false;
  const primary = regs.sort((a, b) => String(a.gramps_id || '').localeCompare(String(b.gramps_id || '')))[0];
  await saveMeta({
    ...m,
    trees: {
      ...m.trees,
      [key]: {
        ...entry,
        founder_handle: primary.handle,
        founder_gramps_id: primary.gramps_id || '',
        founder_name: primary.name || '',
      },
    },
  });
  return true;
}

/**
 * 解除始祖挂载 / 解除认祖登记（双方均可发起，无需申请，立即生效）——**变体 A · R2**：
 * - 家族树侧：只清跨树指针与上层登记，**真身数据（姓名 / 生卒 / 地点）与详情 attributes 全部保留**；
 * - 宗谱侧：移除该家族树的**登记镜像**（R4），必要时把宗谱 `founder_handle` 还原到登记前的值；
 * - 本树其他节点与上层树结构不受影响。
 */
export async function detachFounder({ treeId, founderHandle, masterTreeId }) {
  if (!treeId || !founderHandle) throw badRequest('缺少 tree_id 或 founder_handle');
  const tree0 = await getTree(treeId);
  if (!tree0) throw badRequest(`树不存在: ${treeId}`);
  const founder = tree0.people[founderHandle];
  if (!founder) throw notFound('该家族树中找不到始祖节点');
  // 上层树可由始祖节点的指针推导（P3：target 已泛化为「任意上层树」）
  const upperTreeId = masterTreeId || founder.external_tree || '';
  if (!upperTreeId) throw badRequest('该始祖节点当前未挂载到任何上层树');
  if (!isFounderMirror(founder, upperTreeId)) throw badRequest('该始祖节点当前未挂载到上层树');

  const masterHandle = founder.external_person_handle || '';
  let upperTree = null;
  try {
    upperTree = await getTree(upperTreeId);
  } catch {
    upperTree = null; // 上层树缺失（历史孤儿）→ 只清理本树指针
  }
  const registration = upperTree ? clanRegistrationOf(upperTree, treeId, upperTreeId) : null;

  const applied = await updateTrees([treeId, ...(upperTree && registration ? [upperTreeId] : [])], (trees) => ({
    founder: applyFounderDetach({ tree: trees[treeId], founderHandle }),
    registration:
      upperTree && registration
        ? applyClanRegistrationRemoval({ clan: trees[upperTreeId], registrationHandle: registration.handle })
        : null,
  }));

  // 宗谱侧登记镜像的详情随节点作废（best-effort）
  if (registration?.handle) {
    try {
      await deleteDetail(upperTreeId, registration.handle);
    } catch {
      /* best-effort */
    }
  }
  // 宗谱创始人登记若指向被移除的登记镜像 → 还原到登记前的值（R4 可逆）
  let clanFounderRestored = false;
  if (registration?.handle) {
    try {
      clanFounderRestored = await restoreClanFounderAfterRemoval(upperTreeId, registration);
    } catch {
      /* best-effort：树内登记镜像已移除，meta 登记留待运维修正 */
    }
  }

  return {
    ok: true,
    tree_id: treeId,
    founder_handle: applied.founder_handle,
    master_tree_id: founder.external_tree || upperTreeId,
    master_handle: masterHandle,
    // R2：不再回到「空白占位」——真身数据保留，本树始祖仍可编辑
    placeholder: false,
    founder_data_kept: true,
    clan_registration_removed: !!registration,
    clan_founder_restored: clanFounderRestored,
    message: `已解除始祖登记：${treeId} 始祖真身数据保留（指针已清，可继续编辑或重新认祖）`,
  };
}

/**
 * 宗谱侧登记镜像被移除后，把宗谱 `tree-meta.founder_handle` 还原到登记前的值
 * （登记镜像上的 `external_prev_clan_founder_handle`；该节点仍在宗谱内才还原，否则清空登记）。
 * @returns {Promise<boolean>} 是否改写了宗谱 meta 条目
 */
async function restoreClanFounderAfterRemoval(clanTreeId, registration) {
  const m = await getMeta();
  const key = Object.keys(m?.trees || {}).find((k) => m.trees[k]?.tree_id === clanTreeId) || '';
  if (!key) return false;
  const entry = m.trees[key];
  if (String(entry?.founder_handle || '') !== String(registration.handle || '')) return false;
  const clanTree = await getTree(clanTreeId);
  const prev = String(registration.external_prev_clan_founder_handle || '');
  const next = { ...entry };
  if (prev && clanTree?.people?.[prev]) {
    next.founder_handle = prev;
    next.founder_gramps_id = String(clanTree.people[prev].gramps_id || '');
    next.founder_name = String(clanTree.people[prev].name || '');
  } else {
    delete next.founder_handle;
    delete next.founder_gramps_id;
    delete next.founder_name;
  }
  await saveMeta({ ...m, trees: { ...m.trees, [key]: next } });
  return true;
}

/**
 * 重置始祖（清空本树始祖登记 → 本树回到「无始祖」态，可在任意节点重新「认祖」）
 *
 * 只写 **tree-meta**（走 store.saveMeta 的沙箱护栏路径）：删除 founder_handle /
 * founder_gramps_id / founder_name 并置 founder_state='none'；**不碰树 JSON / 详情文档**
 * （始祖节点本身仍是可编辑的普通节点）。migrate-output/ 与详情一个字节不改。
 *
 * 拒绝：总谱（kind='master'）→ 400；当前始祖为镜像 → 400（须先「解除挂载」）；
 *       tree-meta 无该树条目 → 404。
 */
export async function resetFounder({ treeId, meta = null } = {}) {
  if (!treeId) throw badRequest('缺少 tree_id');
  const m = meta || (await getMeta());
  const trees = m?.trees || {};
  const key = Object.keys(trees).find((k) => trees[k]?.tree_id === treeId) || '';
  if (!key) throw notFound(`未找到 tree: ${treeId}`);

  let tree = null;
  try {
    tree = await getTree(treeId);
  } catch {
    tree = null; // 树 JSON 缺失（历史孤儿 meta）：无镜像可查，仍允许清空登记
  }
  const previous = assertFounderResettable({ entry: trees[key], tree });

  const nextMeta = { ...m, trees: { ...trees, [key]: planFounderReset(trees[key]) } };
  await saveMeta(nextMeta);

  return {
    ok: true,
    tree_id: treeId,
    founder_state: FOUNDER_STATE_NONE,
    previous,
    message: `已重置始祖：${treeId} 暂无始祖，可在任意节点用「⛩ 认祖」重新指定`,
  };
}

/**
 * 读侧推导：列出全部挂载到 masterTreeId 的家族树（不依赖任何反指针）
 * 扫描每棵树的始祖节点（tree-meta.founder_handle → founder_gramps_id）→
 * 读该始祖 external_* → 指向真身即挂载树。树清单来自 store.listTreeIds()（meta + 存储实有）。
 * @param {object} p
 * @param {string} p.masterTreeId 总谱 tree_id（zhonghua）
 * @param {object} [p.meta] 已取到的 tree-meta（缺省则读）
 * @param {(id:string)=>Promise<object>} [p.getTreeFn] 取树函数（测试注入）
 * @param {()=>Promise<string[]>} [p.listIdsFn] 树清单函数（测试注入）
 */
export async function listAttachedTrees({ masterTreeId, meta = null, getTreeFn = getTree, listIdsFn = listTreeIds } = {}) {
  const m = meta || (await safeMeta());
  const entries = new Map();
  for (const e of Object.values(m?.trees || {})) if (e?.tree_id) entries.set(e.tree_id, e);
  let ids = [];
  try {
    ids = await listIdsFn();
  } catch {
    ids = [];
  }
  if (!ids.length) ids = [...entries.keys()];

  const out = [];
  for (const id of [...new Set(ids)]) {
    if (!id || id === masterTreeId) continue;
    const e = entries.get(id) || { tree_id: id };
    let tree = null;
    try {
      tree = await getTreeFn(id);
    } catch {
      tree = null;
    }
    if (!tree?.people) continue;
    // 读侧推导「谁挂到了本节点」：实扫始祖镜像（祖谱的 meta.founder_handle 指自有段入口，不能直接用）
    const fh = findAttachedFounderHandle(tree, e, masterTreeId);
    if (!fh) continue;
    const f = tree.people[fh];
    if (!f || f.external_link_type !== FOUNDER_LINK_TYPE || f.external_tree !== masterTreeId) continue;
    out.push({
      tree_id: id,
      kind: treeKindOf(e),
      tree_title: e.display_title || id,
      surname_char: e.surname_char || (f.surname || '').slice(0, 1),
      founder_handle: fh,
      founder_gramps_id: f.gramps_id || '',
      founder_name: f.name || '',
      master_handle: f.external_person_handle || '',
      relation_note: f.external_relation_note || '',
    });
  }
  out.sort((a, b) => String(a.tree_id).localeCompare(String(b.tree_id)));
  return out;
}

/** 某个真身节点上的挂载树（真身档案显示【X 家族的始祖节点】用） */
export function attachedTreesOf(attachments, masterHandle) {
  if (!masterHandle) return [];
  return (attachments || []).filter((a) => a.master_handle === masterHandle);
}

/** 挂载树标签：`X 家族的始祖节点` */
export function founderTreeLabel(att) {
  return `${att.surname_char || ''}家族的始祖节点`;
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
