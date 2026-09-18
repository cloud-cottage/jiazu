/**
 * 添加子女写路径：跨树婚姻家庭的子女归属归一（docs/marriage.spec.md §7-4）
 *
 * 规则「子女归父系真身所在树」：
 * - 父母都在本树 → 老口径：本树建节点（沿用随父姓）+ 挂进本人第一个配偶家族，没有则新建家族。
 * - 家庭里父（或父空缺时的母）是外树镜像节点（external_mirror='true'）→ 子女建到真身所在树、
 *   挂进真身的婚姻家族；本树只留一个镜像子女（external_mirror + link_type='child'）用于显示。
 *
 * 两侧写入统一走 store.updateTrees()：按 tree_id 顺序加锁 + 深拷贝快照 + 中途失败回滚。
 */
import crypto from 'node:crypto';
import { getTree, updateTrees, saveDetail, getDetail, deleteDetail, nextPersonId, nextFamilyId } from './store.js';
import { treeKindOf, metaEntryOf } from './founder-attach.js';
import { nextGrampsId, inheritedSurname, parentSlot } from './tree-write.js';
import { findMarriageSide } from './marriage.js';

/** 镜像子女的跨树链接类型（区别于配偶镜像的 'marriage'） */
export const MIRROR_CHILD_LINK_TYPE = 'child';

/**
 * 已故锁（口径 5）：世本（master）与祖谱（clan）的新建节点一律 `is_living=false`；
 * 普通家族树照旧不写该字段（undefined = 未显式声明）。
 */
async function deceasedLockedTree(treeId, masterTreeId) {
  if (!treeId) return false;
  if (masterTreeId && treeId === masterTreeId) return true;
  return treeKindOf(await metaEntryOf(treeId)) === 'clan';
}

function genHandle() {
  return crypto.randomBytes(12).toString('hex');
}

function normalizeGender(g) {
  return ['M', 'F', 'U'].includes(g) ? g : 'U';
}

/** 新建树内真人节点（与 createPerson / addSpouseNode 同形状） */
function newPerson({ handle, grampsId, name, surname, given, gender, parentFamily, isLiving }) {
  return {
    handle,
    gramps_id: grampsId,
    name,
    surname,
    given,
    gender,
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: parentFamily,
    spouse_families: [],
    external_tree: '',
    external_person_handle: '',
    external_link_type: '',
    // 总谱（中华世本）节点一律已故；其它树不写该字段（沿用既有推断）
    ...(typeof isLiving === 'boolean' ? { is_living: isLiving } : {}),
  };
}

/** 称号等档案属性（新建节点才带） */
function cleanAttributes(attrs) {
  const out = [];
  for (const a of attrs || []) {
    const key = String(a?.key || '').trim();
    const value = String(a?.value ?? '').trim();
    if (key && value) out.push({ key, value, type: key });
  }
  return out;
}

/**
 * 目标家庭里是否存在「需要把子女路由到真身树」的外树镜像父母（纯函数，可单测）。
 *
 * 归属原则：子女归父系 —— 父为真人（含父空缺而母为真人）→ 留本树；
 * 父为镜像 → 进父的真身树（招赘、母为真人同理）。父母双方都是镜像 → 数据异常，拒绝。
 * @returns {object|null} 需要路由到的镜像节点；不需要路由时 null
 */
export function mirrorParentOf(family, people) {
  const isMirror = (p) => p?.external_mirror === 'true';
  const father = family?.father_handle ? people[family.father_handle] || null : null;
  const mother = family?.mother_handle ? people[family.mother_handle] || null : null;
  if (father && !isMirror(father)) return null;
  const owner = father || mother;
  if (!isMirror(owner)) return null;
  if (isMirror(father) && isMirror(mother)) {
    throw new Error('该家庭父母双方均为外树镜像节点，无法确定子女归属，请联系总编辑');
  }
  return owner;
}

/**
 * 在真身所在树里找「承接子女的婚姻家族」：
 * 先按同一段婚姻的 marriage_id 配对（findMarriageSide），
 * 退回「另一半是本树镜像」的家族（旧数据 / 缺 marriage_id 时兜底）。
 */
function findRealFamily(tree, parentHandle, mirror, localTreeId) {
  const parent = tree.people[parentHandle];
  if (!parent) return null;
  const mid = mirror.external_marriage_id || '';
  if (mid) {
    const side = findMarriageSide(tree, parent, mid);
    if (side) return side.family;
  }
  for (const fh of parent.spouse_families || []) {
    const fam = tree.families[fh];
    if (!fam) continue;
    const other = fam.father_handle === parentHandle ? fam.mother_handle : fam.father_handle;
    const otherPerson = other ? tree.people[other] : null;
    if (otherPerson?.external_mirror === 'true' && otherPerson.external_tree === localTreeId) return fam;
  }
  return null;
}

/**
 * 添加子女（treeId 为操作发起树 = 前端当前所在树）
 *
 * - childHandle 存在 → 挂接该树已有节点（选人模式）；不存在 → 新建节点
 * - 跨树场景（家庭里父为镜像）时：新建的子女建到真身树，选人的节点整体搬到真身树
 *   （换新 handle / 按真身树重新分配编号），本树留镜像子女
 * @returns {Promise<object>} { ok, child_handle, child_name, family_handle, mirror_handle, landed_tree_id, cross_tree, message }
 */
export async function addChildNode({
  treeId,
  personHandle,
  childHandle = '',
  name = '',
  surname = '',
  gender = 'M',
  extraAttributes = [],
  maxDepth = 0,
  depthOf = null,
  masterTreeId = '',
}) {
  const tree0 = await getTree(treeId);
  if (!tree0) throw new Error(`树不存在: ${treeId}`);
  const person = tree0.people[personHandle];
  if (!person) throw new Error('节点不存在于该树');

  const famHandle = (person.spouse_families || [])[0] || '';
  const family = famHandle ? tree0.families[famHandle] || null : null;
  const mirror = mirrorParentOf(family, tree0.people);

  const attach = String(childHandle || '').trim();
  if (attach && !tree0.people[attach]) throw new Error('所选节点不存在于该树');
  if (family && attach && (family.child_handles || []).includes(attach)) {
    throw new Error('该子节点已在家族记录中');
  }
  const given = String(name || '').trim();
  const surnameClean = String(surname || '').trim();
  const childGender = normalizeGender(gender);
  const attributes = cleanAttributes(extraAttributes);
  if (!mirror && !attach && !given) throw new Error('请填写子节点姓名');

  // 跨树：先把「真身树 / 真身节点 / 真身家族」解析出来（校验失败不写任何一棵树）
  let remoteTreeId = '';
  let remoteParentHandle = '';
  let remoteFamilyHandle = '';
  if (mirror) {
    remoteTreeId = mirror.external_tree || '';
    remoteParentHandle = mirror.external_person_handle || '';
    if (!remoteTreeId || !remoteParentHandle) {
      throw new Error(`外树镜像节点「${mirror.name}」缺少真身信息，无法写入`);
    }
    const remote0 = await getTree(remoteTreeId);
    if (!remote0) throw new Error(`真身所在家族树不存在: ${remoteTreeId}`);
    if (!remote0.people[remoteParentHandle]) {
      throw new Error(`真身所在家族树 ${remoteTreeId} 中找不到「${mirror.name}」`);
    }
    // 真身树的世代深度上限：发起树的检查（index.js requireWriteUser）覆盖不到真身树，
    // 故由路由传入 depthOf/maxDepth，在写入前对真身树同口径拦截（不写坏任何一棵树）
    if (maxDepth && typeof depthOf === 'function') {
      const total = Number(depthOf(remote0)) || 0;
      if (total >= maxDepth) {
        const err = new Error(`真身家族树 ${remoteTreeId} 已到 ${maxDepth} 世深度上限，新增节点请联系总编辑（扩容或调整深度上限）`);
        err.status = 403;
        throw err;
      }
    }
    const realFam = findRealFamily(remote0, remoteParentHandle, mirror, treeId);
    if (!realFam) throw new Error(`「${mirror.name}」在 ${remoteTreeId} 中没有对应的婚姻家族，无法承接子女`);
    remoteFamilyHandle = realFam.handle;
    if (attach) {
      // 跨树挂接 = 把本树节点整体搬进真身树：只接受未入谱（无父母、无配偶、未被任何家族收录）的节点
      const moved = tree0.people[attach];
      const listed = Object.values(tree0.families).some((f) => (f.child_handles || []).includes(attach));
      if (moved.parent_family || (moved.spouse_families || []).length || listed) {
        throw new Error(`「${moved.name}」已入谱（有父母或配偶记录），跨树家庭下请新建子节点`);
      }
    }
  }

  const created = { name: '' };
  // 事务成功后要删掉的旧详情（跨树挂接时：详情跟随节点搬到真身树）
  let staleDetailHandle = '';
  const ids = mirror ? [treeId, remoteTreeId] : [treeId];

  // 已故锁在事务外先算好（本树 + 跨树真身树各自判定）
  const localLocked = await deceasedLockedTree(treeId, masterTreeId);
  const remoteLocked = mirror ? await deceasedLockedTree(remoteTreeId, masterTreeId) : false;
  const result = await updateTrees(ids, async (trees) => {
    const tree = trees[treeId];
    const parent = tree.people[personHandle];
    if (!Array.isArray(parent.spouse_families)) parent.spouse_families = [];

    // 本树家族：复用本人第一个配偶家族，没有则按本人性别槽新建
    let fam = famHandle ? tree.families[famHandle] || null : null;
    if (!fam) {
      const slot = parentSlot(parent.gender);
      const fh = genHandle();
      tree.families[fh] = {
        handle: fh,
        gramps_id: await nextFamilyId(),
        father_handle: slot === 'father' ? personHandle : '',
        mother_handle: slot === 'mother' ? personHandle : '',
        child_handles: [],
      };
      parent.spouse_families.push(fh);
      fam = tree.families[fh];
    }

    // ---- 本树（父母都在本树）：老口径 ----
    if (!mirror) {
      let childKey = attach;
      if (!childKey) {
        childKey = genHandle();
        const childSurname = surnameClean || inheritedSurname(tree, personHandle);
        const child = newPerson({
          handle: childKey,
          grampsId: await nextPersonId(),
          name: `${childSurname}${given}` || '未知',
          surname: childSurname,
          given,
          gender: childGender,
          parentFamily: fam.handle,
          isLiving: localLocked ? false : undefined,
        });
        tree.people[childKey] = child;
        created.name = child.name;
        await saveDetail({
          tree_id: treeId,
          handle: childKey,
          gramps_id: child.gramps_id,
          name: child.name,
          events: [],
          media: [],
          citations: [],
          notes: [],
          attributes,
          updated_at: new Date().toISOString(),
        });
      }
      fam.child_handles = fam.child_handles || [];
      if (!fam.child_handles.includes(childKey)) fam.child_handles.push(childKey);
      // 与 linkFamily 同语义：已有父母记录的挂接节点不被改写
      if (!tree.people[childKey].parent_family) tree.people[childKey].parent_family = fam.handle;
      return { child_handle: childKey, family_handle: fam.handle, mirror_handle: '', landed_tree_id: treeId };
    }

    // ---- 跨树：子女建到真身树，本树只留镜像子女 ----
    const remote = trees[remoteTreeId];
    const remoteFam = remote.families[remoteFamilyHandle];
    let realKey = '';
    if (attach) {
      const moved = tree.people[attach];
      realKey = genHandle();
      // 编号终身不变（docs/id-system.spec.md §2）：跨树挂接只换 handle/树归属，原编号随迁
      const real = { ...moved, handle: realKey, parent_family: remoteFam.handle };
      for (const k of ['external_tree', 'external_person_handle', 'external_link_type', 'external_mirror']) delete real[k];
      remote.people[realKey] = real;
      delete tree.people[attach];
      staleDetailHandle = attach;
      const detail = await getDetail(treeId, attach);
      if (detail) {
        await saveDetail({
          ...detail,
          _id: `${remoteTreeId}:${realKey}`,
          tree_id: remoteTreeId,
          handle: realKey,
          gramps_id: real.gramps_id,
          name: real.name,
          updated_at: new Date().toISOString(),
        });
      }
      created.name = real.name;
    } else {
      realKey = genHandle();
      // 随父姓：以真身家庭里的父亲（或母亲）为准
      const realParentRef = remoteFam.father_handle || remoteFam.mother_handle;
      const childSurname = surnameClean || inheritedSurname(remote, realParentRef);
      const real = newPerson({
        handle: realKey,
        grampsId: await nextPersonId(),
        name: `${childSurname}${given}` || '未知',
        surname: childSurname,
        given,
        gender: childGender,
        parentFamily: remoteFam.handle,
        isLiving: remoteLocked ? false : undefined,
      });
      remote.people[realKey] = real;
      created.name = real.name;
      await saveDetail({
        tree_id: remoteTreeId,
        handle: realKey,
        gramps_id: real.gramps_id,
        name: real.name,
        events: [],
        media: [],
        citations: [],
        notes: [],
        attributes,
        updated_at: new Date().toISOString(),
      });
    }
    remoteFam.child_handles = [...(remoteFam.child_handles || []), realKey];

    // 本树镜像子女：姓名/性别与真身一致，指向真身树节点
    const realPerson = remote.people[realKey];
    const mirrorKey = genHandle();
    tree.people[mirrorKey] = {
      handle: mirrorKey,
      gramps_id: await nextPersonId(),
      name: realPerson.name,
      surname: realPerson.surname,
      given: realPerson.given,
      gender: realPerson.gender,
      birth_date: '',
      death_date: '',
      birth_place: '',
      death_place: '',
      parent_family: fam.handle,
      spouse_families: [],
      external_tree: remoteTreeId,
      external_person_handle: realKey,
      external_link_type: MIRROR_CHILD_LINK_TYPE,
      external_mirror: 'true',
    };
    fam.child_handles = [...(fam.child_handles || []), mirrorKey];
    return { child_handle: realKey, family_handle: fam.handle, mirror_handle: mirrorKey, landed_tree_id: remoteTreeId };
  });

  // 详情已搬到真身树 → 删掉本树旧详情（best-effort：失败由孤儿详情清理脚本兜底）
  if (staleDetailHandle) {
    try {
      await deleteDetail(treeId, staleDetailHandle);
    } catch {
      /* 忽略：详情已复制到真身树 */
    }
  }

  const childName = created.name || '';
  return {
    ok: true,
    tree_id: treeId,
    person_handle: personHandle,
    child_handle: result.child_handle,
    child_name: childName,
    family_handle: result.family_handle,
    mirror_handle: result.mirror_handle || '',
    landed_tree_id: result.landed_tree_id,
    cross_tree: !!mirror,
    message: mirror
      ? `「${childName}」已建到「${mirror.name}」真身所在家族树（${result.landed_tree_id}），本树保留镜像子女`
      : `已为「${person.name}」添加子节点「${childName}」`,
  };
}
