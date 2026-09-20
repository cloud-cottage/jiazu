/**
 * 始祖挂载（认祖 / Founders Attach）— 逻辑层
 *
 * 设计见 docs/founder-attach.spec.md。与「嫁出/娶入」同构（镜像 + 跨树写入 + 申请制），
 * 差别在**基数**（总谱节点 1:N，每棵树只能挂 1 个）与**只读范围**（始祖节点整节点只读）。
 *
 * 关键约定：
 * - 关系只写在**挂载树**的始祖节点上（external_*，link_type='founder'）；
 *   zhonghua（真身侧）**不写反指针**，避免双写真相 —— 挂载关系由读侧推导：
 *   `tree-meta.trees[*].founder_handle` → 读该始祖的 external_* → 指向本节点即挂载树。
 * - 始祖镜像节点的姓名/性别/生卒来源于真身（落库为展示副本，本树内只读）；
 *   称号等档案属性不落在本树（详情文档随挂载清理）。
 * - 解除后回到「空白占位始祖节点」：保留始祖位（如 I0001）与 tree-meta.founder_*，
 *   清空 external_* 与身份数据（不允许自行填写，需重新认祖）。
 * - 「无始祖」态（重置始祖后 tree-meta.founder_state='none'）：该树任意节点均可发起认祖，
 *   认祖成功即把该节点登记为始祖（本模块 registerFounderInMeta）。
 *
 * 本模块的纯函数（plan / apply / resolve / is / filter 系列）不碰 IO，全部可单测；
 * attachFounder/detachFounder/listAttachedTrees 负责读树 → 事务写（store.updateTrees）。
 */
import crypto from 'node:crypto';
import { getMeta, getTree, getDetail, updateTrees, saveDetail, saveMeta, listTreeIds } from './store.js';
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

/** 始祖镜像节点在本树内的只读提示（后端 403 / UI 只读态同一文案） */
export const MIRROR_LOCK_MESSAGE = '始祖节点信息需在中华世本（总谱）中修改';
/** 始祖镜像指向的是**祖谱**节点时的只读提示（docs/clan-tree.spec.md §4-3） */
export const CLAN_FOUNDER_LOCK_MESSAGE = '始祖节点信息需在本姓祖谱中修改';
/** 祖谱顶端链镜像节点的只读提示（docs/clan-tree.spec.md §3-1 / §3-7） */
export const CHAIN_MIRROR_LOCK_MESSAGE = '该节点为上层（中华世本）镜像，需到总谱修改';
/** 解除挂载后的空白占位始祖节点：不承载身份数据（docs/founder-attach.spec.md §4-2） */
export const PLACEHOLDER_LOCK_MESSAGE = '空白占位始祖节点：请先「认祖」挂载到中华世本后再填写信息';

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

// ---- 只读判定 ----

/** 是否「始祖镜像节点」：本树始祖指向 masterTreeId 的真身 */
export function isFounderMirror(person, masterTreeId) {
  if (!person) return false;
  if (person.external_link_type !== FOUNDER_LINK_TYPE) return false;
  if (!person.external_tree) return false;
  return !masterTreeId || person.external_tree === masterTreeId;
}

/** 是否「上层镜像节点」（任一上层树的镜像：founder / chain；本层内整节点只读） */
export function isUpperMirror(person, treeId) {
  if (!person) return false;
  if (String(person.external_mirror || '') !== 'true') return false;
  if (!person.external_tree) return false;
  if (treeId && person.external_tree === treeId) return false;
  return person.external_link_type === FOUNDER_LINK_TYPE || person.external_link_type === CHAIN_LINK_TYPE;
}

/**
 * 上层镜像节点的只读文案（可编辑 → ''）：
 * - chain 镜像（祖谱顶端世系链）→ 需到总谱修改（docs/clan-tree.spec.md §3-1）
 * - founder 镜像 → 依上层层级：祖谱 / 中华世本
 */
export async function upperMirrorLockMessage(person, treeId) {
  if (!isUpperMirror(person, treeId)) return '';
  if (person.external_link_type === CHAIN_LINK_TYPE) return CHAIN_MIRROR_LOCK_MESSAGE;
  const upper = await metaEntryOf(person.external_tree);
  return treeKindOf(upper) === TREE_KIND.CLAN ? CLAN_FOUNDER_LOCK_MESSAGE : MIRROR_LOCK_MESSAGE;
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

/** 空白占位始祖态：始祖位置 + 无姓名 + 无跨树链接（解除挂载后的状态，或历史空占位） */
export function isPlaceholderFounder(tree, person, entry) {
  if (!isFounderNode(tree, person, entry)) return false;
  if (person.external_link_type) return false;
  return !String(person.name || '').trim();
}

/**
 * 始祖节点在本树内的只读判定 → 返回提示文案（可编辑返回 ''）
 * - 镜像态（已挂载）：整节点只读，需在总谱修改
 * - 空白占位态（已解除 / 历史空占位）：不允许自行填写，需重新认祖
 */
export function founderLockMessage(person, tree, masterTreeId, entry) {
  if (!person || !tree) return '';
  if (masterTreeId && tree.tree_id === masterTreeId) return '';
  if (isFounderMirror(person, masterTreeId)) return MIRROR_LOCK_MESSAGE;
  if (isPlaceholderFounder(tree, person, entry)) return PLACEHOLDER_LOCK_MESSAGE;
  return '';
}

/**
 * 节点写只读文案（**路由预检与写路径的唯一判据**）：
 * ① 上层镜像（`upperMirrorLockMessage`：chain 镜像 / founder 镜像指向祖谱或世本）优先，
 * ② 其后才是始祖锁（`founderLockMessage`：本树始祖镜像 / 空白占位）。
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
  const upper = await upperMirrorLockMessage(person, tree.tree_id);
  if (upper) return upper;
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

/** 关系备注：`<真身姓名>（中华世本 · 第 N 世）`（层可换：祖谱；无世数则省略第 N 世） */
export function founderRelationNote(masterName, gen, layerLabel = KIND_LABEL.master) {
  const who = String(masterName || '').trim() || `${layerLabel}节点`;
  const layer = String(layerLabel || KIND_LABEL.master);
  return gen === null || gen === undefined ? `${who}（${layer}）` : `${who}（${layer} · 第 ${gen} 世）`;
}

/**
 * 挂载时写入始祖节点的补丁（纯函数）：
 * - 跨树指针（§3-1）
 * - 姓名/性别/生卒 = 真身数据的**展示副本**（本树内只读，真身为唯一真源）
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

/** 解除挂载：回到空白占位始祖态（保留 handle / gramps_id / 树内家族关系） */
export function planFounderPlaceholder(founder) {
  return {
    ...founder,
    name: '',
    surname: '',
    given: '',
    gender: 'U',
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    external_tree: '',
    external_person_handle: '',
    external_link_type: '',
    external_mirror: '',
    external_relation_note: '',
    external_founder_created_by: '',
  };
}

/**
 * 在树对象上应用挂载（供 store.updateTrees 事务内调用；纯函数：只改传入对象）
 * 同时清空始祖节点自身的档案属性（称号等以真身为准）
 */
export function applyFounderAttach({ tree, founderHandle, masterPerson, masterTreeId, gen, requestedBy = '', layerLabel = KIND_LABEL.master }) {
  const founder = tree.people[founderHandle];
  if (!founder) {
    const e = new Error('始祖节点不存在于该家族树');
    e.status = 404;
    throw e;
  }
  Object.assign(founder, planFounderMirror(founder, masterPerson, masterTreeId, gen, requestedBy, layerLabel));
  return { founder_handle: founderHandle, founder_name: founder.name };
}

/** 在树对象上应用解除（供事务内调用；纯函数） */
export function applyFounderDetach({ tree, founderHandle }) {
  const founder = tree.people[founderHandle];
  if (!founder) {
    const e = new Error('始祖节点不存在于该家族树');
    e.status = 404;
    throw e;
  }
  Object.assign(founder, planFounderPlaceholder(founder));
  return { founder_handle: founderHandle };
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
 * 建立始祖挂载（认祖审批通过 / 总编辑直接挂载两条入口共用）
 * 只写**挂载树**（真身侧不写反指针）；始祖节点的档案属性（称号/事件）一并清空。
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

  assertOneAttachPerTree(founder);

  const masterTree = await getTree(masterTreeId);
  if (!masterTree) throw badRequest(`上层树不存在: ${masterTreeId}`);
  const masterPerson = masterTree.people[masterHandle];
  if (!masterPerson) throw notFound('所选上层树节点不存在');

  const detail = await getDetail(masterTreeId, masterHandle);
  const gen = chainGenOf(detail);
  const layerLabel = kindLabel(treeKindOf(tgt));

  const applied = await updateTrees([treeId], (trees) =>
    applyFounderAttach({
      tree: trees[treeId],
      founderHandle,
      masterPerson,
      masterTreeId,
      gen,
      requestedBy,
      layerLabel,
    }),
  );

  // 无始祖态的认祖 = 指定始祖：同一次写入里把该节点回写为 tree-meta 的始祖（删除 founder_state）
  let registered = null;
  if (founderMissing) {
    const node = (await getTree(treeId))?.people?.[founderHandle] || founder;
    registered = await registerFounderInMeta(treeId, node);
  }

  // 始祖镜像的档案属性以真身为准 → 清空本树详情（称号/事件不落本树）
  try {
    const d = await getDetail(treeId, founderHandle);
    if (d) {
      const cleared = { ...d, attributes: [], events: [], name: masterPerson.name, updated_at: new Date().toISOString() };
      await saveDetail(cleared);
    }
  } catch {
    /* 详情清理是 best-effort：结构真源已在树 JSON 内 */
  }

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
    message: `已认祖：${treeId} 始祖挂载至${layerLabel}「${masterPerson.name}」`,
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
 * 解除始祖挂载（双方均可发起，无需申请，立即生效）
 * 始祖节点回到空白占位态；本树其他节点与真身节点结构都不受影响。
 */
export async function detachFounder({ treeId, founderHandle, masterTreeId, entry = null }) {
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
  const applied = await updateTrees([treeId], (trees) =>
    applyFounderDetach({ tree: trees[treeId], founderHandle }),
  );

  // 占位态不承载身份数据 → 清空始祖节点在本树的档案属性
  try {
    const d = await getDetail(treeId, founderHandle);
    if (d) await saveDetail({ ...d, attributes: [], events: [], name: '', updated_at: new Date().toISOString() });
  } catch {
    /* best-effort */
  }

  return {
    ok: true,
    tree_id: treeId,
    founder_handle: applied.founder_handle,
    master_tree_id: founder.external_tree || upperTreeId,
    master_handle: masterHandle,
    placeholder: true,
    message: `已解除 始祖挂载：${treeId} 始祖回到空白占位态（可重新认祖）`,
  };
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
