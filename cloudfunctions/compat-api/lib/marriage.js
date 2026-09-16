/**
 * 跨树嫁娶（嫁出 / 娶入 / 绝婚 / 合离）— 纯逻辑层
 *
 * 设计见 docs/marriage.spec.md。本模块**只操作传入的树对象**（不碰 IO / 不读文件），
 * 因此全部可单测；落库由 store.updateTrees() 负责（跨树事务 + 失败回滚）。
 *
 * 核心原则：families 是唯一的婚姻结构事实；external_* 只是跨树指针。
 * 一段婚姻 = 两侧各一个家族（本人槽位 + 对方镜像）+ 两侧互指的指针字段（同一个 marriage_id）。
 */
import crypto from 'node:crypto';
import { nextGrampsId, spouseSlots } from './tree-write.js';

/** 婚姻相关的结构层字段（与 tree-write.EXTERNAL_KEYS 合并使用） */
export const MARRIAGE_KEYS = [
  'external_marriage_id',
  'external_marriage_no',
  'external_marriage_date',
  'external_marriage_created_by',
  'external_marriage_end_kind',
  'external_marriage_end_date',
  'external_marriage_end_by',
];

export const MIRROR_LINK_TYPE = 'marriage';

/** 生成配对 id（一段婚姻两侧同值） */
export function genMarriageId() {
  return crypto.randomBytes(12).toString('hex');
}

function genHandle() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * 婚姻日期规范化（选填）：允许 `1957` 或 `1957-12-04`（`/`、`.` 分隔亦可）；
 * 空 → ''（不写该字段）；非法 → 抛错（路由转 400）。
 */
export function normalizeMarriageDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/^\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[/\-.](\d{1,2})(?:[/\-.](\d{1,2}))?$/);
  if (!m) throw new Error('日期格式需为 1957 或 1957-12-04');
  const mm = m[2].padStart(2, '0');
  return m[3] ? `${m[1]}-${mm}-${String(m[3]).padStart(2, '0')}` : `${m[1]}-${mm}`;
}

/**
 * 婚姻序号：本人已有 N 段（含已结束）→ 新一段为 N+1。
 * 计数取自本人记录的 external_marriage_no（每次成婚都会写为当时序号），无需额外计数器。
 */
export function nextMarriageNo(person) {
  const n = Number(person?.external_marriage_no);
  return (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0) + 1;
}

/** 序号标签：1 → 初嫁/初娶；≥2 → 再嫁（第 N 次）/再娶（第 N 次） */
export function marriageLabel(no, direction) {
  const n = Number(no) > 0 ? Math.floor(Number(no)) : 1;
  const verb = direction === 'in' ? '娶' : '嫁';
  return n === 1 ? `初${verb}` : `再${verb}（第 ${n} 次）`;
}

/** 结束动作守卫：只接受「绝婚」/「合离」 */
export function normalizeEndKind(kind) {
  const k = String(kind || '').trim();
  if (k === '绝婚' || k === '合离') return k;
  throw new Error('结束方式需为「绝婚」或「合离」');
}

/** 性别槽位对（复用 tree-write.spouseSlots，保证与「添加配偶」同一套规则） */
export function slotsFor(selfGender, otherGender) {
  return spouseSlots(selfGender, otherGender);
}

/** 在树内找本人与某段婚姻对应的家族（镜像在对方槽位） */
export function findMarriageSide(tree, person, marriageId) {
  if (!person || !marriageId) return null;
  for (const fh of person.spouse_families || []) {
    const fam = tree.families[fh];
    if (!fam) continue;
    const selfIsFather = fam.father_handle === person.handle;
    const selfIsMother = fam.mother_handle === person.handle;
    if (!selfIsFather && !selfIsMother) continue;
    const mirrorHandle = selfIsFather ? fam.mother_handle : fam.father_handle;
    const mirror = mirrorHandle ? tree.people[mirrorHandle] : null;
    if (mirror && mirror.external_marriage_id === marriageId) {
      return { family: fam, mirrorHandle, mirror, slotOfMirror: selfIsFather ? 'mother_handle' : 'father_handle' };
    }
  }
  return null;
}

/** 找/建「本人在自己槽位、对方槽位空着」的家族；没有则新建（与 add-spouse 同策略） */
function ensureFamily(tree, person, selfSlot, otherHandle) {
  const selfKey = selfSlot === 'father' ? 'father_handle' : 'mother_handle';
  const otherKey = selfSlot === 'father' ? 'mother_handle' : 'father_handle';
  if (!Array.isArray(person.spouse_families)) person.spouse_families = [];
  const fams = person.spouse_families.map((h) => tree.families[h]).filter(Boolean);
  let fam = fams.find((f) => f[selfKey] === person.handle && !f[otherKey]) || null;
  if (!fam) {
    fam = { handle: genHandle(), gramps_id: nextGrampsId(tree, 'F'), father_handle: '', mother_handle: '', child_handles: [] };
    tree.families[fam.handle] = fam;
    person.spouse_families.push(fam.handle);
  }
  fam[selfKey] = person.handle;
  fam[otherKey] = otherHandle;
  return fam;
}

/**
 * 婚姻结束后的家族清理：**无子女**的家族直接删除（它只是这段婚姻的记录）；
 * 有子女则保留（子女的 parent_family 指向它，必须留）；真身在槽位保持不变。
 */
function dropFamilyIfChildless(tree, fam) {
  if (!fam) return false;
  if ((fam.child_handles || []).length > 0) return false;
  delete tree.families[fam.handle];
  for (const p of Object.values(tree.people)) {
    if (Array.isArray(p.spouse_families)) p.spouse_families = p.spouse_families.filter((h) => h !== fam.handle);
  }
  return true;
}

/** 构造对方树里的「镜像节点」（代表真身 srcPerson，属于 fromTreeId） */
export function buildMirror(tree, srcPerson, fromTreeId, marriageId, noOfSrc) {
  return {
    handle: genHandle(),
    gramps_id: nextGrampsId(tree, 'I'),
    name: srcPerson.name || '',
    surname: srcPerson.surname || '',
    given: srcPerson.given || '',
    gender: srcPerson.gender || 'U',
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: '',
    spouse_families: [],
    external_tree: fromTreeId,
    external_person_handle: srcPerson.handle,
    external_link_type: MIRROR_LINK_TYPE,
    external_marriage_id: marriageId,
    external_marriage_no: String(noOfSrc || 1),
    // 显式标记「外树镜像节点」：UI 识别 / 人数统计单列 / GEDCOM 不导出为真人
    external_mirror: 'true',
  };
}

/**
 * 建立一段跨树婚姻（双向写入；只改传入的两个树对象）
 *
 * @param {object} p
 * @param {object} p.treeA 发起方所在树（本人 A 为真身）
 * @param {object} p.treeB 对方所在树
 * @param {string} p.handleA 本人 handle（真身，留在 treeA）
 * @param {string} p.handleB 配偶 handle（真身，留在 treeB）
 * @param {'out'|'in'} p.direction out=嫁出（A 为女）/ in=娶入（A 为男）
 * @param {string} [p.marriageDate] 成婚年份/日期（选填）
 * @param {string} [p.createdBy] 发起人 phone（留痕）
 * @param {string} [p.marriageId] 指定配对 id（申请审批时由申请单带入）
 * @returns {{marriage_id, no_a, no_b, family_a, family_b, mirror_a, mirror_b, date, label_a, label_b}}
 */
export function applyMarriage({ treeA, treeB, handleA, handleB, direction, marriageDate = '', createdBy = '', marriageId = '' }) {
  const A = treeA.people?.[handleA];
  const B = treeB.people?.[handleB];
  if (!A) throw new Error('发起方节点不存在');
  if (!B) throw new Error('对方节点不存在');
  if (direction !== 'out' && direction !== 'in') throw new Error('方向需为 out（嫁出）或 in（娶入）');
  if (A.gender === 'F' && direction === 'out' && B.gender === 'F') throw new Error('双方均为女性，无法建立婚姻');
  if (A.gender === 'M' && direction === 'in' && B.gender === 'M') throw new Error('双方均为男性，无法建立婚姻');
  if (A.gender === 'U') throw new Error('发起方性别未知，请先在档案中设置性别');
  if (direction === 'out' && A.gender !== 'F') throw new Error(`「${A.name}」不是女性，嫁出请用对方节点发起，或改选「娶入」`);
  if (direction === 'in' && A.gender !== 'M') throw new Error(`「${A.name}」不是男性，娶入请用对方节点发起，或改选「嫁出」`);
  if (A.external_marriage_id && B.external_marriage_id === A.external_marriage_id) {
    throw new Error(`「${A.name}」与「${B.name}」已建立婚姻关系`);
  }
  const date = normalizeMarriageDate(marriageDate);
  const mid = marriageId || genHandle();
  const noA = nextMarriageNo(A);
  const noB = nextMarriageNo(B);

  // A 侧：镜像（代表 B）+ 家族
  const mirrorB = buildMirror(treeA, B, treeB.tree_id, mid, noB);
  treeA.people[mirrorB.handle] = mirrorB;
  const slotsA = slotsFor(A.gender, B.gender);
  const famA = ensureFamily(treeA, A, slotsA.selfSlot, mirrorB.handle);
  mirrorB.spouse_families = [famA.handle];

  // B 侧：镜像（代表 A）+ 家族
  const mirrorA = buildMirror(treeB, A, treeA.tree_id, mid, noA);
  treeB.people[mirrorA.handle] = mirrorA;
  const slotsB = slotsFor(B.gender, A.gender);
  const famB = ensureFamily(treeB, B, slotsB.selfSlot, mirrorA.handle);
  mirrorA.spouse_families = [famB.handle];

  // 两侧指针字段（含序号、可选日期、留痕）
  const pointers = (other, otherTreeId, no, label) => ({
    external_tree: otherTreeId,
    external_person_handle: other.handle,
    external_link_type: MIRROR_LINK_TYPE,
    external_marriage_id: mid,
    external_marriage_no: String(no),
    external_marriage_date: date,
    external_marriage_created_by: createdBy,
    external_marriage_end_kind: '',
    external_marriage_end_date: '',
    external_marriage_end_by: '',
  });
  Object.assign(A, pointers(B, treeB.tree_id, noA, ''));
  Object.assign(B, pointers(A, treeA.tree_id, noB, ''));

  return {
    marriage_id: mid,
    date,
    no_a: noA,
    no_b: noB,
    family_a: famA.handle,
    family_b: famB.handle,
    mirror_a: mirrorA.handle,
    mirror_b: mirrorB.handle,
    label_a: marriageLabel(noA, direction),
    label_b: marriageLabel(noB, direction === 'out' ? 'in' : 'out'),
  };
}

/**
 * 结束一段婚姻（绝婚 / 合离通用）：删两侧镜像 + 清槽位 + 清有效指针，
 * 保留 `external_marriage_end_kind/_end_date/_end_by` 作为历史（档案展示用）。
 */
export function applyMarriageEnd({ treeA, treeB, handleA, handleB, marriageId, kind, endDate = '', createdBy = '' }) {
  const k = normalizeEndKind(kind);
  const end = normalizeMarriageDate(endDate);
  const A = treeA.people?.[handleA];
  const B = treeB.people?.[handleB];
  if (!A || !B) throw new Error('婚姻一方节点不存在');
  if (!marriageId) throw new Error('缺少 marriage_id');
  if (A.external_marriage_id !== marriageId || B.external_marriage_id !== marriageId) {
    throw new Error('该段婚姻已结束或不存在');
  }
  const sideA = findMarriageSide(treeA, A, marriageId);
  const sideB = findMarriageSide(treeB, B, marriageId);
  let removedFamilyA = false;
  let removedFamilyB = false;
  if (sideA) {
    delete treeA.people[sideA.mirrorHandle];
    sideA.family[sideA.slotOfMirror] = '';
    removedFamilyA = dropFamilyIfChildless(treeA, sideA.family);
  }
  if (sideB) {
    delete treeB.people[sideB.mirrorHandle];
    sideB.family[sideB.slotOfMirror] = '';
    removedFamilyB = dropFamilyIfChildless(treeB, sideB.family);
  }
  const endInfo = {
    external_marriage_id: '',
    external_link_type: '',
    external_marriage_end_kind: k,
    external_marriage_end_date: end,
    external_marriage_end_by: k === '绝婚' ? 'husband_side' : 'mutual',
  };
  Object.assign(A, endInfo, createdBy ? { external_marriage_created_by: A.external_marriage_created_by || createdBy } : {});
  Object.assign(B, endInfo, createdBy ? { external_marriage_created_by: B.external_marriage_created_by || createdBy } : {});
  return {
    marriage_id: marriageId,
    kind: k,
    end_date: end,
    removed_mirror_a: !!sideA,
    removed_mirror_b: !!sideB,
    removed_family_a: removedFamilyA,
    removed_family_b: removedFamilyB,
  };
}

/**
 * 旧数据（本功能之前建立的出嫁软链接：只有 4 个 external_* 字段、没有 marriage_id / 镜像）：
 * 结束时不删任何镜像，只清链接并写结束信息。
 */
export function applyLegacyMarriageEnd({ tree, person, otherTree, otherPerson, kind, endDate = '', createdBy = '' }) {
  const k = normalizeEndKind(kind);
  const end = normalizeMarriageDate(endDate);
  const endInfo = {
    external_link_type: '',
    external_marriage_id: '',
    external_marriage_end_kind: k,
    external_marriage_end_date: end,
    external_marriage_end_by: k === '绝婚' ? 'husband_side' : 'mutual',
  };
  Object.assign(person, endInfo);
  if (otherPerson) Object.assign(otherPerson, endInfo);
  return { kind: k, end_date: end, legacy: true, cleared_other: !!otherPerson };
}

/** 从本人记录推断这段关系的「对方」（用于绝婚/合离解析与申请单）*/
export function counterpartOf(person) {
  if (!person?.external_person_handle) return null;
  return { tree_id: person.external_tree || '', handle: person.external_person_handle };
}
