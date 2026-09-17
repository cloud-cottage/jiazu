/**
 * 立支 / 汇宗（P5 · 结构操作）— lib/branch-clan-ops.js
 *
 * 规格（唯一真源）：docs/branch-clan-ops.spec.md
 *   §3 已锁定口径 / §5 数据结构（tree-meta / external_* 镜像写法 / 后台设置键）/
 *   §6-1 立支（结构校验 → 跨树体检 → 扣 9999 籽 → 上移祖先链入宗谱 + 新建家族树 + 宗谱两条登记）/
 *   §6-2 汇宗（整树真实节点迁入他树普通节点之下 + 源树条目与树 JSON 删除 + 灵气折损并入）/
 *   §7 拒绝矩阵 / §8 接口契约 / §13 待确认默认口径。
 * 关联：docs/id-system.spec.md（换树不换号：handle / gramps_id 一律不变）、
 *   docs/economy.spec.md §5-2（籽 FIFO 与整单拒绝）、docs/spirit-domain.spec.md §4-1（灵气四态）。
 *
 * 分层（与 lib/tree-write.js / lib/clan.js 同风格）：
 *   - 纯函数（不碰 IO，可单测）：planAncestorChainMove / planBranchRegistrations /
 *     applyAncestorChainMove / planConvergeMove / applyConvergeMove / computeSpiritTransfer
 *   - 编排（读树 → 校验 → 扣费 → 落库）：establishBranch / convergeClan
 *
 * **不重写第二套实现**：
 *   - 跨树引用体检复用 lib/tree-write.js 的 `scanExternalRefs`（同款扫描，绝不复制）；
 *   - 落点家族复用 `ensureParentFamily` / `reusableParentFamily` 的家族复用顺序；
 *   - 悬空引用修复复用 `repairTreeRefs`；结构自检复用 `checkTreeIntegrity`；
 *   - 籽扣减 / 整单拒绝 / 原路冲正复用 lib/economy-fee.js 的 `charger` / `refund`（账本内核）；
 *   - 灵气读写复用 lib/economy-spirit.js 的 `withSpirit` / `settle` / `chargeBase`。
 *
 * 写序（照规格 §6-1-4 / §6-2-4，固定不得颠倒）：
 *   立支：结构校验 → 跨树体检 → 扣费 → createTreeFile（新树首写）→ updateTrees([原树, 宗谱]) 单事务
 *        → 详情随迁（best-effort）→ saveMeta → 任一步失败：回收新树文件 + 原路冲正 + 抛原错误
 *   汇宗：结构校验 → 跨树体检 → confirm_people 比对 → updateTrees([源树, 目标树]) 单事务
 *        → 详情随迁 → 删源树 tree-meta 条目 + 树 JSON → jiazu_spirit 折损并入 / 源树置 expired
 */
import crypto from 'node:crypto';
import {
  createTreeFile,
  deleteDetail,
  deleteTree,
  getDetail,
  getMeta,
  getTree,
  listTreeIds,
  saveDetail,
  saveMeta,
  updateTrees,
} from './store.js';
import {
  FOUNDER_LINK_TYPE,
  TREE_KIND,
  resolveFounderHandle,
  currentFounderHandle,
  treeKindOf,
} from './founder-attach.js';
import {
  LINK_LABEL,
  checkTreeIntegrity,
  ensureParentFamily,
  nextTreeId,
  repairTreeRefs,
  scanExternalRefs,
  treeLabelOf,
} from './tree-write.js';
import { idAllocator, reserveFamilyIds, reservePersonIds } from './id-seq.js';
import { resolveNode } from './id-resolve.js';
import { FEE } from './economy-fee.js';
import { chargeBase, settle, withSpirit } from './economy-spirit.js';

// ---- 常量（§5-4 / §6-2-7；数值唯一真源见 lib/economy-fee.js 与 lib/wallet.js）----

/** 立支费默认值（颗完整石榴籽；运行时以 jiazu_wallets.config.branch_fee_seeds 覆盖） */
export const DEFAULT_BRANCH_FEE_SEEDS = FEE.branch_fee_seeds;
/** 汇宗灵气折损比例默认值（0–1，默认 50%） */
export const DEFAULT_CONVERGE_SPIRIT_RATIO = 0.5;
/** 汇宗「范围变化」复用既有已登记域名码（§13-9；不新造码） */
export const SCOPE_CHANGED_CODE = 'DELETE_SCOPE_CHANGED';
/** 落库失败统一文案（§7 / §15-#8：与 lib/economy-fee.js 的共享口径**逐字一致**；不得回显系统错误码与堆栈） */
export const INTERNAL_ERROR_TEXT = '服务内部错误';
/** 汇宗阶段失败时的源树 reconcile 标记（§6-2-4 ⑥） */
export const SHELL_RECONCILE_STATE = 'empty_source_shell';

const DAY_MS = 86400000;

function genHandle() {
  return crypto.randomBytes(12).toString('hex');
}

function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/**
 * 上移链上某节点「详情文档缺失」的告警文案（§8-1 `warnings?`）：
 * 带姓名 + 全站编号 + handle，便于运维按 handle 定位缺失的详情文档。
 */
function missingDetailWarning(person, handle) {
  const name = person?.name || handle;
  const gramps = String(person?.gramps_id || '') || handle;
  return `节点「${name}」（${gramps} · ${handle}）详情文档缺失，仅结构真源已迁移`;
}

/** meta 里按 tree_id 取条目（兼容 key ≠ tree_id 的历史条目） */
function entryOf(meta, treeId) {
  if (!meta?.trees) return null;
  return meta.trees[treeId] || Object.values(meta.trees).find((t) => t?.tree_id === treeId) || null;
}

/** meta 里某 tree_id 的键名 */
function keyOf(meta, treeId) {
  const trees = meta?.trees || {};
  return Object.keys(trees).find((k) => trees[k]?.tree_id === treeId) || '';
}

// ---- 纯函数 ①：上移祖先链计划（§6-1-3）----

/**
 * 上移集合 = N 的上级链：N 的父 → 其父 → … → 本树始祖节点（含沿途家族记录）。
 * - 链顶的「本树始祖节点」是宗谱节点的镜像（展示副本）→ **丢弃该镜像**（不计入迁入集合、不再上溯）；
 * - 迁入集合 = 链上除始祖镜像外的全部真实节点与家族（handle / gramps_id 一律不变）；
 * - 连着始祖镜像的那个家族**留在原树**（只摘掉随迁子女），避免旁支（N 的叔伯辈）失去父系挂接。
 *
 * @param {{tree:object, personHandle:string, founderHandle:string}} p
 * @returns {{ok:boolean, moved_people:string[], moved_families:string[], chain_top_handle:string,
 *   top_family_handle:string, dropped_mirror_handle:string}}
 */
export function planAncestorChainMove({ tree, personHandle, founderHandle = '' }) {
  const movedPeople = [];
  const movedFamilies = [];
  let topFamilyHandle = '';
  let cur = personHandle;
  const seen = new Set([personHandle]);
  let ok = false;
  while (true) {
    const node = tree?.people?.[cur];
    const fam = tree?.families?.[node?.parent_family || ''];
    if (!fam) break;
    // 沿父系槽位向上（与 tree-write.generationOf 同口径：父 → 母）
    const up = [fam.father_handle, fam.mother_handle].find((h) => h && h !== cur && tree.people[h]) || '';
    if (!up || seen.has(up)) break;
    seen.add(up);
    if (founderHandle && up === founderHandle) {
      ok = true;
      topFamilyHandle = fam.handle; // 链顶家族（始祖镜像 → 链顶真实节点）留在原树
      break;
    }
    movedPeople.push(up);
    movedFamilies.push(fam.handle);
    cur = up;
  }
  return {
    ok,
    moved_people: movedPeople,
    moved_families: movedFamilies,
    chain_top_handle: movedPeople.length ? movedPeople[movedPeople.length - 1] : '',
    top_family_handle: topFamilyHandle,
    dropped_mirror_handle: ok ? founderHandle : '',
  };
}

// ---- 纯函数 ②：宗谱两条登记镜像（§5-3 / §6-1-6）----

/** 镜像展示副本字段（姓名 / 性别 / 生卒 = N 的展示副本；整节点只读） */
function mirrorFieldsOf(person) {
  return {
    name: person.name || '',
    surname: person.surname || '',
    given: person.given || '',
    gender: person.gender || 'U',
    birth_date: person.birth_date || '',
    death_date: person.death_date || '',
    birth_place: '',
    death_place: '',
    is_living: person.is_living === undefined ? !person.death_date : person.is_living,
  };
}

/**
 * 两条宗谱登记镜像（落在宗谱自有段；一条登记 = 一个「支系入口列表」入口）：
 *   原树登记：`external_tree = 原树`、`external_person_handle = N.handle`
 *   新树登记：`external_tree = 新树`、`external_person_handle = 新树始祖镜像 handle`
 * 两条都是 `external_link_type='founder'` + `external_mirror='true'`（整节点只读）。
 */
export function planBranchRegistrations({
  sourceTreeId,
  sourceTreeTitle = '',
  newTreeId,
  newTreeTitle = '',
  person,
  mirrorHandle,
  handles = [],
  grampsIds = [],
}) {
  const rows = [
    {
      handle: handles[0],
      gramps_id: grampsIds[0],
      external_tree: sourceTreeId,
      external_person_handle: String(person?.handle || ''),
      external_relation_note: `「${person?.name || ''}」（${sourceTreeTitle || sourceTreeId} · 立支登记）`,
    },
    {
      handle: handles[1],
      gramps_id: grampsIds[1],
      external_tree: newTreeId,
      external_person_handle: mirrorHandle,
      external_relation_note: `「${person?.name || ''}」（${newTreeTitle || newTreeId} · 立支登记）`,
    },
  ];
  return rows.map((r) => ({
    handle: r.handle,
    gramps_id: r.gramps_id,
    ...mirrorFieldsOf(person || {}),
    parent_family: '',
    spouse_families: [],
    external_tree: r.external_tree,
    external_person_handle: r.external_person_handle,
    external_link_type: FOUNDER_LINK_TYPE,
    external_mirror: 'true',
    external_relation_note: r.external_relation_note,
  }));
}

/** 新树始祖镜像节点（§5-3：展示副本 + 指向 N 真身） */
export function planBranchFounderMirror({ person, sourceTreeId, sourceTreeTitle = '', handle, grampsId }) {
  return {
    handle,
    gramps_id: grampsId,
    ...mirrorFieldsOf(person || {}),
    parent_family: '',
    spouse_families: [],
    external_tree: sourceTreeId,
    external_person_handle: String(person?.handle || ''),
    external_link_type: FOUNDER_LINK_TYPE,
    external_mirror: 'true',
    external_relation_note: `「${person?.name || ''}」（${sourceTreeTitle || sourceTreeId} · 立支始祖）`,
  };
}

// ---- 纯函数 ③：立支在树对象上落库（供 updateTrees 事务内调用）----

/**
 * 在原树 + 宗谱上应用立支结构改动（纯函数：只改传入对象；§6-1-3 / §6-1-4 ⑤）。
 * 原树：摘除上移链（人物 + 家族）→ 链顶家族只摘随迁子女 → repairTreeRefs 修悬空引用
 *       → 树 JSON 顶层 `founder_gramps_id` 改为 N 的编号（§5-2 读侧一致性）
 * 宗谱：搬入上移链（handle / gramps_id 不变）→ 链顶挂到 `clanFounderHandle` 之下
 *       （复用 ensureParentFamily 的家族复用顺序）→ 追加两条 N 始祖登记镜像
 * @returns {{moved_ancestors:number, moved_families:number, chain_top_handle:string,
 *   clan_family_handle:string, created_family:boolean, registration_family:string, repair:object}}
 */
export function applyAncestorChainMove({
  src,
  clan,
  plan,
  newFounderHandle = '',
  clanFounderHandle = '',
  registrations = [],
  allocFamilyId = null,
}) {
  const moved = new Set(plan.moved_people);
  const takenPeople = {};
  const takenFamilies = {};
  for (const h of plan.moved_people) if (src.people?.[h]) takenPeople[h] = JSON.parse(JSON.stringify(src.people[h]));
  for (const fh of plan.moved_families) if (src.families?.[fh]) takenFamilies[fh] = JSON.parse(JSON.stringify(src.families[fh]));

  // ① 原树摘链
  for (const fh of Object.keys(takenFamilies)) delete src.families[fh];
  for (const h of Object.keys(takenPeople)) delete src.people[h];
  // ② 链顶家族留在原树：只摘掉随迁子女（旁支子女继续挂在旧始祖镜像之下）
  const topFam = plan.top_family_handle ? src.families?.[plan.top_family_handle] : null;
  if (topFam) topFam.child_handles = (topFam.child_handles || []).filter((c) => !moved.has(c));
  // ③ 悬空引用修复 + 顶层始祖编号改写（resolveFounderHandle 兜底读的是它）
  const repair = repairTreeRefs(src);
  const newFounder = newFounderHandle ? src.people?.[newFounderHandle] : null;
  if (newFounder) src.founder_gramps_id = String(newFounder.gramps_id || '');

  // ④ 宗谱搬入
  for (const [fh, fam] of Object.entries(takenFamilies)) clan.families[fh] = fam;
  for (const [h, p] of Object.entries(takenPeople)) clan.people[h] = p;

  // ⑤ 链顶挂到宗谱落点之下（reusableParentFamily / ensureParentFamily 同款顺序）
  let clanFamily = null;
  let createdFamily = false;
  if (plan.chain_top_handle && clan.people[plan.chain_top_handle]) {
    const r = ensureParentFamily(clan, clanFounderHandle, allocFamilyId);
    clanFamily = r.family;
    createdFamily = r.created;
    if (!clanFamily.child_handles.includes(plan.chain_top_handle)) clanFamily.child_handles.push(plan.chain_top_handle);
    clan.people[plan.chain_top_handle].parent_family = clanFamily.handle;
  }

  // ⑥ 两条登记镜像（一条登记 = 一个支系入口）：专用家族挂在该落点之下，登记在宗谱自有段
  let registrationFamily = '';
  if (registrations.length && clan.people[clanFounderHandle]) {
    const fh = genHandle();
    const grampsId = typeof allocFamilyId === 'function' ? allocFamilyId() : '';
    if (!grampsId) throw fail('家族编号预留不足：立支登记家族无法铸号', 500);
    clan.families[fh] = {
      handle: fh,
      gramps_id: grampsId,
      father_handle: clanFounderHandle,
      mother_handle: '',
      child_handles: registrations.map((r) => r.handle),
    };
    const root = clan.people[clanFounderHandle];
    root.spouse_families = [...(root.spouse_families || []), fh];
    for (const reg of registrations) {
      clan.people[reg.handle] = { ...reg, parent_family: fh, spouse_families: [] };
    }
    registrationFamily = fh;
  }

  // ⑦ 宗谱侧悬空引用修复（未随迁的配偶槽位 / 留在原树的旁支子女槽位 → 置空）
  repairTreeRefs(clan);
  return {
    moved_ancestors: plan.moved_people.length,
    moved_families: plan.moved_families.length,
    chain_top_handle: plan.chain_top_handle,
    clan_family_handle: clanFamily ? clanFamily.handle : '',
    created_family: createdFamily,
    registration_family: registrationFamily,
    repair,
  };
}

// ---- 纯函数 ④：汇宗迁移计划 + 落库（§6-2-3 / §6-2-4 ②）----

/**
 * 迁移集合与落点计划（纯函数，不写 IO）：
 * - 迁移集合 = 源树全部**真实节点**（`external_mirror !== 'true'`）；镜像节点（始祖镜像等）**不随迁、随树丢弃**；
 * - 迁移家族 = 至少一位家长在迁移集合内的家族记录（连着镜像家长的家族记录留在源树、随树作废）；
 * - 落点 = X 的家族（复用 ensureParentFamily 顺序：对应槽位空着 → 同槽位 → 新建，编号走 nextFamilyId 预留）；
 * - 源树真实段的根（父家族未随迁）挂到 X 的家族之下。
 */
export function planConvergeMove({ src, dst, targetHandle, newFamilyIds = [] }) {
  const real = Object.values(src.people || {}).filter((p) => String(p?.external_mirror || '') !== 'true');
  const moving = new Set(real.map((p) => p.handle));
  const movedFamilies = Object.values(src.families || {})
    .filter((f) => moving.has(f.father_handle) || moving.has(f.mother_handle))
    .map((f) => f.handle);
  const discardedMirrors = Object.values(src.people || {})
    .filter((p) => String(p?.external_mirror || '') === 'true')
    .map((p) => p.handle);

  const { family: targetFamily, created: createdFamily } = ensureParentFamily(dst, targetHandle, idAllocator(newFamilyIds));

  const people = {};
  const families = {};
  for (const h of moving) {
    people[h] = JSON.parse(JSON.stringify(src.people[h]));
    delete src.people[h];
  }
  for (const fh of movedFamilies) {
    families[fh] = JSON.parse(JSON.stringify(src.families[fh]));
    delete src.families[fh];
  }
  for (const [h, p] of Object.entries(people)) dst.people[h] = p;
  for (const [fh, f] of Object.entries(families)) dst.families[fh] = f;

  // 源树真实段的根 → 挂到 X 的家族之下（父家族随镜像/未随迁 → 成为目标树下的一支）
  const roots = [];
  for (const h of moving) {
    const p = dst.people[h];
    if (!p.parent_family || !dst.families[p.parent_family]) roots.push(h);
  }
  for (const h of roots) {
    if (!targetFamily.child_handles.includes(h)) targetFamily.child_handles.push(h);
    dst.people[h].parent_family = targetFamily.handle;
  }
  repairTreeRefs(dst);
  repairTreeRefs(src);
  return {
    moved_people: [...moving],
    moved_families: movedFamilies,
    discarded_mirrors: discardedMirrors,
    roots,
    family_handle: targetFamily.handle,
    created_family: createdFamily,
  };
}

/** 汇宗在 updateTrees 闭包内的两树应用（纯函数 + 结构自检） */
export function applyConvergeMove({ src, dst, targetHandle, newFamilyIds = [] }) {
  const moved = planConvergeMove({ src, dst, targetHandle, newFamilyIds });
  const problems = [...checkTreeIntegrity(dst), ...checkTreeIntegrity(src)];
  if (problems.length) throw fail(`汇宗后结构校验失败：${problems.slice(0, 3).join('；')}`, 500);
  return moved;
}

// ---- 纯函数 ⑤：灵气折损（§6-2-6 / §6-2-7）----

/** 剩余天数 = `ceil(max(0, spirit_expires_at − now) / 86400000)`（无值 / 已过 → 0） */
export function spiritDaysLeft(spiritExpiresAt, now = new Date()) {
  if (!spiritExpiresAt) return 0;
  const ms = Date.parse(spiritExpiresAt);
  if (!Number.isFinite(ms)) return 0;
  return Math.ceil(Math.max(0, ms - new Date(now).getTime()) / DAY_MS);
}

/**
 * 折损口径（逐字照 §6-2-6）：
 *   剩余天数 = ceil(max(0, spirit_expires_at − now) / 86400000)
 *   折损天数 = ceil(剩余天数 × converge_spirit_ratio)   ← §13-16：先取整天数、再乘比例、再向上取整
 */
export function computeSpiritTransfer({ sourceExpiresAt = null, now = new Date(), ratio = DEFAULT_CONVERGE_SPIRIT_RATIO }) {
  const r = Number.isFinite(Number(ratio)) ? Number(ratio) : DEFAULT_CONVERGE_SPIRIT_RATIO;
  const source_days_left = spiritDaysLeft(sourceExpiresAt, now);
  const transferred_days = Math.ceil(source_days_left * r);
  return { ratio: r, source_days_left, transferred_days };
}

/**
 * 灵气折损并入（§6-2-6）：源树记录保留 + `status='expired'`；目标树**已镶嵌玉**时叠加顺延并入
 * （`max(now, 原值) + 折损天数`，绝不覆盖；并入后由惰性结算转 `active`、`buffer_until=null`）。
 * 目标树未镶嵌玉（无 `jiazu_spirit.trees[目标树]` 记录 / 无 jade）→ **不并入、只提示**（skipped_reason）。
 */
export async function applySpiritTransfer({
  sourceTreeId,
  targetTreeId,
  ratio = DEFAULT_CONVERGE_SPIRIT_RATIO,
  now = new Date(),
}) {
  return withSpirit(
    sourceTreeId,
    (entry, ctx) => {
      const transfer = computeSpiritTransfer({ sourceExpiresAt: entry?.spirit_expires_at || null, now, ratio });
      // 源树：记录保留、status 置 'expired'（jade / spirit_expires_at / logs 保留作留痕，§6-2-6）
      if (entry) {
        entry.status = 'expired';
        ctx.dirty = true;
      }
      const tgt = ctx.doc.trees?.[targetTreeId] || null;
      let targetExp = tgt ? tgt.spirit_expires_at || null : null;
      let skippedReason = '';
      if (!entry || !entry.jade) {
        skippedReason = '源树未镶嵌石榴籽玉，无灵气可折损';
      } else if (!tgt || !tgt.jade) {
        skippedReason = '目标树尚未镶嵌石榴籽玉（无凹槽），源树灵气不并入';
      } else if (transfer.transferred_days <= 0) {
        skippedReason = '源树灵气剩余有效期为 0 天（已过缓冲期），无可并入天数';
      }
      if (!skippedReason) {
        const base = chargeBase(tgt.spirit_expires_at, now); // max(now, 原值)；原值 null → now
        tgt.spirit_expires_at = new Date(base + transfer.transferred_days * DAY_MS).toISOString();
        tgt.buffer_until = null;
        settle(tgt, now); // 并入后 = 'active'（惰性结算口径）
        targetExp = tgt.spirit_expires_at;
        ctx.dirty = true;
      }
      return {
        ...transfer,
        // 未并入时 transferred_days = 0（§10-1 用例 18：不并入 = 0 天，理由见 skipped_reason）
        transferred_days: skippedReason ? 0 : transfer.transferred_days,
        target_spirit_expires_at: targetExp,
        skipped_reason: skippedReason,
      };
    },
    now,
  );
}

// ---- 跨树引用体检拒绝文案（§6-1-5 / §6-2-3；扫描本体复用 tree-write.scanExternalRefs）----

function refRefusal(hits, op, status, meta) {
  const scope = op === '立支' ? '上级链' : '子树';
  const shown = hits
    .slice(0, 3)
    .map(
      (r) =>
        `${treeLabelOf(meta, r.tree_id)}「${r.name || r.handle}」${
          LINK_LABEL[r.link_type] ? `（${LINK_LABEL[r.link_type]}）` : ''
        }`,
    )
    .join('、');
  const more = hits.length > 3 ? ` 等共 ${hits.length} 处` : '';
  return fail(
    `该节点及其${scope}在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再${op}；涉及：${shown}${more}`,
    status,
  );
}

/** 体检：迁移集合内任一 handle 被其它树引用 / 被他树 tree-meta 始祖登记 → 抛拒绝错误 */
async function assertNoExternalRefs({ treeId, handles, listIdsFn, meta, op, status }) {
  if (!handles.size) return [];
  const hits = await scanExternalRefs({ treeId, handles, listIdsFn, meta });
  if (hits.length) throw refRefusal(hits, op, status, meta);
  return hits;
}

// ---- 编排 ①：立支（POST /admin/establish-branch）----

/**
 * 立支：把普通家族树里的普通节点 N 立为新家族树的始祖（§6-1）。
 *
 * @param {object} p
 * @param {string} p.treeId 原树 tree_id
 * @param {string} p.personRef N 的全局编号 / handle / 树内旧号
 * @param {string} [p.phone] 发起人（扣费人）
 * @param {number} [p.feeSeeds] 本次立支费（颗；缺省 = lib/economy-fee.js 的 FEE.branch_fee_seeds）
 * @param {Function} [p.charge] 闸门扣费回调（(ctx) => Promise<charged>；缺省 = 不扣费，供纯结构单测）
 * @param {Function} [p.refund] 闸门冲正回调（(charged) => Promise<boolean>）
 * @param {Function} [p.listIdsFn] 树清单（测试注入）
 * @param {object} [p.meta] 已读到的 tree-meta（缺省读）
 * @returns {Promise<{ok:boolean, original_tree_id:string, new_tree_id:string, moved_ancestors:number,
 *   moved_families:number, founder:{handle:string, gramps_id:string, name:string},
 *   fee:{unit:'seed', amount:number, balance_after:number|null}, warnings?:string[]}>}
 *   `warnings` 仅在「上移链中有节点的详情文档缺失」时出现（§8-1；详情随迁 best-effort）
 */
export async function establishBranch({
  treeId,
  personRef = '',
  phone = '',
  feeSeeds = null,
  charge = null,
  refund = null,
  listIdsFn = listTreeIds,
  meta = null,
  now = new Date(),
} = {}) {
  if (!treeId) throw fail('缺少 tree_id');
  const refText = String(personRef || '').trim();
  if (!refText) throw fail('缺少 person_handle');
  const amount =
    Number.isFinite(Number(feeSeeds)) && Number(feeSeeds) > 0 ? Math.floor(Number(feeSeeds)) : DEFAULT_BRANCH_FEE_SEEDS;

  // ---- 结构校验（先于扣费；§6-1-2）----
  const m = meta || (await getMeta());
  const entry = entryOf(m, treeId);
  if (!entry) throw fail('家族树不存在', 404);
  const kind = treeKindOf(entry);
  if (kind === TREE_KIND.MASTER) throw fail('中华世本（总谱）不可立支');
  if (kind === TREE_KIND.CLAN) throw fail('祖谱不可立支');
  const tree0 = await getTree(treeId);
  if (!tree0) throw fail('家族树不存在', 404);

  const hit = await resolveNode(refText, treeId, { listIdsFn });
  if (!hit) throw fail('节点不存在', 404);
  if (hit.tree_id !== treeId) throw fail(`该节点属于家族树 ${hit.tree_id}，请在所属家族树内立支`);
  const personHandle = hit.handle;
  const person = tree0.people[personHandle];
  if (!person) throw fail('节点不存在', 404);
  if (String(person.external_mirror || '') === 'true') {
    throw fail('该节点是外树镜像节点，请到其真身所在家族树操作');
  }
  const founderHandle = resolveFounderHandle(tree0, entry);
  if (founderHandle && founderHandle === personHandle) throw fail('始祖节点本身不可立支');

  // 宗谱归属（meta.clan_tree_id 优先 → 始祖镜像的 external_tree）+ 落点非空
  const clanTreeId = clanAffiliationOf({ meta: m, entry, tree: tree0, founderHandle });
  if (!clanTreeId) throw fail('请先为该家族建立或认祖宗谱');
  const clanEntry = entryOf(m, clanTreeId);
  const clanTree = await getTree(clanTreeId);
  if (!clanTree || treeKindOf(clanEntry) !== TREE_KIND.CLAN) throw fail('请先为该家族建立或认祖宗谱');
  const clanFounderHandle = String(clanEntry?.founder_handle || '');
  if (!clanFounderHandle || !clanTree.people[clanFounderHandle]) {
    throw fail('该祖谱尚未设置认祖落点（founder_handle 为空），请先在祖谱内指定落点后再立支');
  }

  // 上移集合（§6-1-3）
  const plan = planAncestorChainMove({ tree: tree0, personHandle, founderHandle });
  if (!plan.ok) throw fail('该节点不在本树始祖链上（无上级祖先），无法立支');
  // 详情缺失告警（§8-1 `warnings?`）所需的展示信息：结构迁移会**就地**摘掉原树节点
  // （updateTrees 在进程内缓存对象上改），故在写库前先快照姓名 / 编号
  const movedInfo = new Map(
    plan.moved_people.map((h) => [
      h,
      { name: tree0.people[h]?.name || h, gramps_id: String(tree0.people[h]?.gramps_id || '') },
    ]),
  );

  // 跨树引用体检（红线，§6-1-5）→ 400
  await assertNoExternalRefs({
    treeId,
    handles: new Set(plan.moved_people),
    listIdsFn,
    meta: m,
    op: '立支',
    status: 400,
  });

  // ---- 铸号 / 新树标识（扣费前先算出，Tx.ref.tree_id 需要它）----
  const surnameChar = (person.surname || entry.surname_char || tree0.people[founderHandle]?.surname || '氏').slice(0, 1);
  const newTreeId = nextTreeId(m, surnameChar);
  const sourceTitle = entry.display_title || treeId;
  const newTreeTitle = `${sourceTitle} · ${person.name || ''}支`;
  const personIds = await reservePersonIds(3); // 新树始祖镜像 + 两条登记镜像（全站唯一编号）
  const familyIds = await reserveFamilyIds(2); // 宗谱落点家族（可能新建）+ 登记镜像家族
  const allocPersonId = idAllocator(personIds);
  const allocFamilyId = idAllocator(familyIds);
  const mirrorHandle = genHandle();
  const mirror = planBranchFounderMirror({
    person,
    sourceTreeId: treeId,
    sourceTreeTitle: sourceTitle,
    handle: mirrorHandle,
    grampsId: allocPersonId(),
  });
  const registrations = planBranchRegistrations({
    sourceTreeId: treeId,
    sourceTreeTitle: sourceTitle,
    newTreeId,
    newTreeTitle,
    person,
    mirrorHandle,
    handles: [genHandle(), genHandle()],
    grampsIds: [allocPersonId(), allocPersonId()],
  });
  const newTree = {
    _schema: tree0._schema || '1.0',
    tree_id: newTreeId,
    founder_gramps_id: mirror.gramps_id,
    version: 1,
    updated_at: now.toISOString(),
    people: { [mirrorHandle]: mirror },
    families: {},
  };

  // ---- ③ 扣费（结构校验与体检全过后、写库前；不足 409 整单拒绝；§6-1-4 ③）----
  let charged = null;
  if (charge) {
    charged = await charge({
      tree_id: newTreeId,
      person_handle: personHandle,
      person_name: person.name || '',
      branch_fee_seeds: amount,
    });
  }
  const fee = {
    unit: 'seed',
    amount,
    balance_after: charged?.fee ? charged.fee.balance_after : null,
  };

  try {
    // ---- ④ 新树首写（cloud 模式需先建云存储文件并登记 fileID）----
    await createTreeFile(newTree);

    // ---- ⑤ 原树 + 宗谱：单事务（失败全回滚）----
    const applied = await updateTrees([treeId, clanTreeId], (trees) =>
      applyAncestorChainMove({
        src: trees[treeId],
        clan: trees[clanTreeId],
        plan,
        newFounderHandle: personHandle,
        clanFounderHandle,
        registrations,
        allocFamilyId,
      }),
    );

    // ---- ⑥ 详情文档随迁（best-effort；**必须显式改 _id**：先写新键、再删旧键）----
    // 上移链中详情文档缺失的节点 → 记入 warnings（§8-1 `warnings?`；结构真源已迁移、不冲正、不改计数）
    const warnings = [];
    for (const h of plan.moved_people) {
      try {
        const detail = await getDetail(treeId, h);
        if (detail) {
          await saveDetail({
            ...detail,
            _id: `${clanTreeId}:${h}`,
            tree_id: clanTreeId,
            handle: h,
            gramps_id: detail.gramps_id || '',
            name: detail.name || '',
            updated_at: now.toISOString(),
          });
        } else {
          warnings.push(missingDetailWarning(movedInfo.get(h), h));
        }
        await deleteDetail(treeId, h);
      } catch {
        /* 详情随迁 best-effort：结构真源已在树 JSON 内 */
      }
    }
    // 新树始祖镜像的详情（展示副本；best-effort）
    try {
      await saveDetail({
        tree_id: newTreeId,
        handle: mirrorHandle,
        gramps_id: mirror.gramps_id,
        name: mirror.name,
        events: [],
        media: [],
        citations: [],
        notes: [],
        attributes: [],
        updated_at: now.toISOString(),
      });
    } catch {
      /* best-effort */
    }

    // ---- ⑦ 写 tree-meta（原树 founder_* + clan_handle；新树整条登记；saveMeta 走 store 护栏）----
    const m2 = await getMeta();
    const trees = { ...(m2.trees || {}) };
    const srcKey = keyOf(m2, treeId) || keyOf(m, treeId);
    if (!srcKey) throw fail('tree-meta 中找不到原树条目', 500);
    const srcEntry = {
      ...trees[srcKey],
      founder_handle: personHandle,
      founder_gramps_id: String(person.gramps_id || ''),
      founder_name: person.name || '',
      clan_handle: registrations[0].handle, // §13-5：clan_handle = 该树在宗谱的落点
    };
    delete srcEntry.founder_state; // 回到「有始祖」态
    trees[srcKey] = srcEntry;
    trees[newTreeId] = {
      tree_id: newTreeId,
      kind: TREE_KIND.FAMILY,
      path_alias: `/${newTreeId}`,
      surname_char: surnameChar,
      display_title: newTreeTitle,
      genealogy_name: `${surnameChar}氏家谱`,
      archive_url: '',
      hall_name: entry.hall_name || '',
      origin: entry.origin || '',
      description: `由 ${treeId} 立支而来，始祖：${person.name || ''}（原树镜像）`,
      enable_custom_domain: false,
      created_at: now.toISOString(),
      created_by: phone || '',
      founder_handle: mirrorHandle,
      founder_gramps_id: mirror.gramps_id,
      founder_name: person.name || '',
      clan_tree_id: clanTreeId,
      clan_handle: registrations[1].handle,
    };
    await saveMeta({ ...m2, trees });

    const out = {
      ok: true,
      original_tree_id: treeId,
      new_tree_id: newTreeId,
      moved_ancestors: applied.moved_ancestors,
      moved_families: applied.moved_families,
      founder: { handle: personHandle, gramps_id: String(person.gramps_id || ''), name: person.name || '' },
      fee,
    };
    // §8-1 `warnings?`：**仅当非空时**才带该字段（无缺失 → 字段不出现，保持既有字面出参形状不变）
    if (warnings.length) out.warnings = warnings;
    return out;
  } catch (e) {
    // ---- ⑧ 任一步失败 → 回收已建新树文件 → 原路返还同一批次 → 抛原错误 ----
    try {
      await deleteTree(newTreeId);
    } catch {
      /* 回收 best-effort */
    }
    if (refund && charged) {
      try {
        await refund(charged);
      } catch {
        /* 冲正 best-effort：绝不掩盖原始落库错误 */
      }
    }
    throw e;
  }
}

/** 宗谱归属推导：meta.clan_tree_id 优先 → 始祖镜像的 external_tree（须为 kind='clan' 条目） */
export function clanAffiliationOf({ meta, entry, tree, founderHandle = '' }) {
  const explicit = String(entry?.clan_tree_id || '').trim();
  const founder = founderHandle ? tree?.people?.[founderHandle] : null;
  const mirrorClan =
    founder && founder.external_link_type === FOUNDER_LINK_TYPE ? String(founder.external_tree || '') : '';
  for (const id of [explicit, mirrorClan]) {
    if (id && treeKindOf(entryOf(meta, id)) === TREE_KIND.CLAN) return id;
  }
  return '';
}

// ---- 编排 ②：汇宗（POST /admin/converge-clan）----

/**
 * 汇宗：把家族树的始祖改为另一棵普通家族树里的普通节点 X，源树全部真实节点整体迁到 X 之下（§6-2）。
 * 权限由路由保证（`chief_editor`）；**0 片 + 0 籽**（不接闸门），无任何资产副作用、不存在冲正。
 *
 * @param {object} p
 * @param {string} p.treeId 源树 tree_id
 * @param {string} p.targetRef 目标节点（全局编号 / handle）
 * @param {number|string} p.confirmPeople 前端二次确认里展示的「将迁移人数」
 * @param {number} [p.ratio] 本次生效的折损比例（缺省 0.5；路由传后台配置值）
 * @param {Function} [p.listIdsFn]
 * @param {object} [p.meta]
 * @returns {Promise<{ok:boolean, source_tree_id:string, target_tree_id:string, target_handle:string,
 *   moved_people:number, moved_families:number,
 *   spirit:{ratio:number, source_days_left:number, transferred_days:number,
 *     target_spirit_expires_at:string|null, skipped_reason?:string}}>}
 */
export async function convergeClan({
  treeId,
  targetRef = '',
  confirmPeople = null,
  ratio = DEFAULT_CONVERGE_SPIRIT_RATIO,
  listIdsFn = listTreeIds,
  meta = null,
  now = new Date(),
} = {}) {
  if (!treeId) throw fail('缺少 tree_id');
  const refText = String(targetRef || '').trim();
  if (!refText) throw fail('缺少 target_person_id');
  if (confirmPeople === null || confirmPeople === undefined || String(confirmPeople).trim() === '') {
    throw fail('缺少 confirm_people（请先展示将迁移的人数后再确认）');
  }

  // ---- 结构校验（先于任何写入；§6-2-2）----
  const m = meta || (await getMeta());
  const srcEntry = entryOf(m, treeId);
  if (!srcEntry) throw fail('家族树不存在', 404);
  const srcKind = treeKindOf(srcEntry);
  if (srcKind === TREE_KIND.MASTER) throw fail('中华世本（总谱）不可汇宗');
  if (srcKind === TREE_KIND.CLAN) throw fail('祖谱不可汇宗');
  const src0 = await getTree(treeId);
  if (!src0) throw fail('家族树不存在', 404);

  // 源树当前始祖必须是「指向本层之上的镜像」（§6-2-2 **放宽口径**）：只要求
  // `external_link_type='founder'` + `external_mirror='true'` + `external_tree` 非空且 **≠ 本树**；
  // 其 `external_tree` 是祖谱（先认祖）还是**另一棵普通家族树**（立支产物）**均放行** ——
  // 「立支 → 汇宗」互逆闭环要求立支产物的始祖镜像（指回原树的普通节点）也能直接汇宗。
  const srcFounderHandle = currentFounderHandle(src0, srcEntry);
  const srcFounder = srcFounderHandle ? src0.people[srcFounderHandle] : null;
  const srcFounderUpper = String(srcFounder?.external_tree || '');
  if (
    !srcFounder ||
    srcFounder.external_link_type !== FOUNDER_LINK_TYPE ||
    String(srcFounder.external_mirror || '') !== 'true' ||
    !srcFounderUpper ||
    srcFounderUpper === treeId
  ) {
    throw fail('该家族树当前始祖不是上层镜像，无法汇宗');
  }

  // 目标节点解析（全局编号 / handle 均可；自动识别所属树）
  const hit = await resolveNode(refText, treeId, { listIdsFn });
  if (!hit) throw fail(`找不到编号/句柄为「${refText}」的节点`, 404);
  if (hit.tree_id === treeId) throw fail('汇宗目标须是另一棵普通家族树中的普通节点');
  if (treeKindOf(entryOf(m, hit.tree_id)) !== TREE_KIND.FAMILY) {
    throw fail('汇宗目标须是另一棵普通家族树中的普通节点');
  }
  const dst0 = await getTree(hit.tree_id);
  const target = dst0?.people?.[hit.handle];
  if (!target || String(target.external_mirror || '') === 'true' || String(target.external_link_type || '')) {
    throw fail('汇宗目标须是另一棵普通家族树中的普通节点');
  }

  // ---- 迁移集合 + 跨树引用体检（红线 → 409；§6-2-3）----
  const movedHandles = new Set(
    Object.values(src0.people || {})
      .filter((p) => String(p?.external_mirror || '') !== 'true')
      .map((p) => p.handle),
  );
  if (!movedHandles.size) throw fail('该家族树没有可迁移的真实节点，无法汇宗');
  await assertNoExternalRefs({ treeId, handles: movedHandles, listIdsFn, meta: m, op: '汇宗', status: 409 });

  // ---- confirm_people 比对（校验先于写入；§6-2-2 / §13-9）----
  if (Number(confirmPeople) !== movedHandles.size) {
    const e = fail(
      `汇宗范围已变化（当前 ${movedHandles.size} 人，确认时 ${Number(confirmPeople)} 人），请重新确认`,
      409,
    );
    e.code = SCOPE_CHANGED_CODE;
    throw e;
  }

  // ---- ② updateTrees([源树, 目标树]) 单事务（家族编号预铸：落点新建用）----
  const newFamilyIds = await reserveFamilyIds(1);
  const applied = await updateTrees([treeId, hit.tree_id], (trees) =>
    applyConvergeMove({
      src: trees[treeId],
      dst: trees[hit.tree_id],
      targetHandle: hit.handle,
      newFamilyIds,
    }),
  );

  // ---- ③ 详情文档随迁（best-effort；**必须显式改 _id**：先写新键、再删旧键）----
  const dstAfter = applied.moved_people.length ? await getTree(hit.tree_id) : null;
  for (const h of applied.moved_people) {
    try {
      const detail = await getDetail(treeId, h);
      if (detail) {
        await saveDetail({
          ...detail,
          _id: `${hit.tree_id}:${h}`,
          tree_id: hit.tree_id,
          handle: h,
          gramps_id: dstAfter?.people?.[h]?.gramps_id || detail.gramps_id || '',
          name: dstAfter?.people?.[h]?.name || detail.name || '',
          updated_at: now.toISOString(),
        });
      }
      await deleteDetail(treeId, h);
    } catch {
      /* 详情迁移 best-effort：结构真源已在树 JSON 内 */
    }
  }
  // 源树镜像节点的详情随树作废（§5-5 #6）
  for (const h of applied.discarded_mirrors) {
    try {
      await deleteDetail(treeId, h);
    } catch {
      /* best-effort */
    }
  }

  // ---- ④ 删除源树 tree-meta 条目 + 树 JSON（失败 → 500 + 登记「待 reconcile 的空壳源树」）----
  let stageError = null;
  try {
    await deleteTree(treeId);
  } catch (e) {
    stageError = e;
  }
  try {
    const m2 = await getMeta();
    const trees = { ...(m2.trees || {}) };
    const srcKey = keyOf(m2, treeId);
    if (srcKey) delete trees[srcKey];
    await saveMeta({ ...m2, trees });
  } catch (e) {
    stageError = stageError || e;
  }
  if (stageError) {
    await markShellSource(treeId, srcEntry, stageError);
    throw fail(INTERNAL_ERROR_TEXT, 500);
  }

  // ---- ⑤ jiazu_spirit：目标树叠加折损天数；源树记录保留 + status='expired' ----
  let spiritResult;
  try {
    spiritResult = await applySpiritTransfer({ sourceTreeId: treeId, targetTreeId: hit.tree_id, ratio, now });
  } catch (e) {
    await markShellSource(treeId, srcEntry, e);
    throw fail(INTERNAL_ERROR_TEXT, 500);
  }

  const spirit = {
    ratio: spiritResult.ratio,
    source_days_left: spiritResult.source_days_left,
    transferred_days: spiritResult.transferred_days,
    target_spirit_expires_at: spiritResult.target_spirit_expires_at,
  };
  if (spiritResult.skipped_reason) spirit.skipped_reason = spiritResult.skipped_reason;

  return {
    ok: true,
    source_tree_id: treeId,
    target_tree_id: hit.tree_id,
    target_handle: hit.handle,
    moved_people: applied.moved_people.length,
    moved_families: applied.moved_families.length,
    spirit,
  };
}

/**
 * 源树登记为「待 reconcile 的空壳源树」（§6-2-4 ⑥：④/⑤ 阶段失败、结构已迁移不回滚）：
 * 树-meta 条目（若还在）打 `reconcile_state` 标记留痕；条目已被删除时按原条目补回一条带标记的记录。
 * best-effort：本身失败不再抛（只留 console 痕迹），绝不掩盖原始错误。
 */
async function markShellSource(treeId, entrySnapshot, cause) {
  try {
    const m = await getMeta();
    const trees = { ...(m.trees || {}) };
    const key = keyOf(m, treeId) || keyOf(m, entrySnapshot) || treeId;
    const base = trees[key] || entrySnapshot || { tree_id: treeId };
    trees[key] = {
      ...base,
      kind: base.kind || TREE_KIND.FAMILY,
      reconcile_state: SHELL_RECONCILE_STATE,
      reconcile_note: `汇宗后清理失败（${cause?.message || cause}），该树已无真实节点，待 reconcile`,
      reconcile_at: new Date().toISOString(),
    };
    await saveMeta({ ...m, trees });
  } catch {
    console.log(`[branch-clan-ops] 汇宗后源树 ${treeId} 登记 reconcile 失败（原始错误：${cause?.message || cause}）`);
  }
}

// ---- 供路由 / 单测复用的读接口 ----

/** 源树当前始祖的祖谱（汇宗前置校验的读侧口径；找不到 → ''） */
export function clanOfFamilyTree({ tree, entry, meta }) {
  const founderHandle = currentFounderHandle(tree, entry);
  const founder = founderHandle ? tree?.people?.[founderHandle] : null;
  const id = String(founder?.external_tree || '');
  return treeKindOf(entryOf(meta, id)) === TREE_KIND.CLAN ? id : '';
}
