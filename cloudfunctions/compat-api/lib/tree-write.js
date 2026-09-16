/**
 * 树写路径：人物/家族编辑、拆分、晋宗、删除跨树链接
 *
 * 写模型（docs/data-model.md §7）：
 * - 结构字段（姓名/性别/生卒/关系/跨树软关联）→ 树 JSON（version 乐观锁）
 * - 档案字段（events/media/citations/notes/attributes）→ 详情文档
 * - 交叉操作固定顺序 + 幂等；孤儿详情由清理脚本兜底
 */
import crypto from 'node:crypto';
import {
  getTree,
  updateTree,
  updateTrees,
  saveTree,
  createTreeFile,
  getDetail,
  getAllDetails,
  saveDetail,
  deleteDetail,
  getMeta,
  saveMeta,
  listTreeIds,
} from './store.js';
import { founderLockMessage, metaEntryOf, isFounderMirror, isUpperMirror, upperMirrorLockMessage, MIRROR_LOCK_MESSAGE, treeKindOf, resolveFounderHandle, TREE_KIND } from './founder-attach.js';

export const EXTERNAL_KEYS = [
  'external_tree',
  'external_person_handle',
  'external_link_type',
  // 跨树嫁娶（docs/marriage.spec.md）：配对 id / 序号 / 可选日期 / 结束方式与留痕
  'external_marriage_id',
  'external_marriage_no',
  'external_marriage_date',
  'external_marriage_created_by',
  'external_marriage_end_kind',
  'external_marriage_end_date',
  'external_marriage_end_by',
  // 外树镜像节点标记（嫁娶生成的「对方在本树的代表」）
  'external_mirror',
];
/** 源流链属性（写详情文档；时间轴按 external_chain_gen 排序展示） */
export const CHAIN_ATTR_KEYS = ['external_chain_gen', 'external_chain_aggregate', 'external_chain_from'];

function genHandle() {
  return crypto.randomBytes(12).toString('hex');
}

function nameParts(pn = {}) {
  const surname = (pn.surname_list || []).find((s) => s?.primary)?.surname || pn.surname_list?.[0]?.surname || '';
  const given = pn.first_name || '';
  return { surname, given, name: `${surname}${given}` || '未知' };
}

function genderFromNum(g) {
  if (g === 1) return 'M';
  if (g === 2) return 'F';
  return 'U';
}

function genderToNum(g) {
  return { M: 1, F: 2, U: 0 }[g] ?? 0;
}

export function nextGrampsId(tree, prefix) {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let max = -1;
  let width = 0;
  // 人与家族编号段各自独立，但同一棵树里必须整体取最大（家族编号也曾漏扫 → 新建家族拿到 F1 撞旧号）
  for (const group of [tree.people, tree.families]) {
    for (const o of Object.values(group || {})) {
      const m = String(o.gramps_id || '').match(re);
      if (!m) continue;
      const n = parseInt(m[1], 10);
      if (n > max || (n === max && m[1].length > width)) {
        max = n;
        width = m[1].length;
      }
    }
  }
  // 无既有编号 → 从 1 开始；否则沿用既有补零宽度（I0100 → I0101，F0047 → F0048）
  if (max < 0) return `${prefix}1`;
  return `${prefix}${String(max + 1).padStart(width, '0')}`;
}

/** 从 Gramps RawPerson body 提取 attributes（type 字符串或 {string}） */
function attrOf(a) {
  return { key: typeof a?.type === 'string' ? a.type : a?.type?.string || '', value: a?.value ?? '' };
}

/**
 * 应用生卒 + 健在状态（纯函数，可单测）
 * is_living=true → 健在（必无离世时间，历史卒年清空）；false → 已故（离世时间可空 = 卒年不详）；
 * 未显式给 is_living → 按 death_date 推断（老调用方兼容：有卒年即已故）
 */
export function applyLifespan(person, body = {}, opts = {}) {
  // 总谱（中华世本）节点一律已故：字段锁死；显式传 true 直接拒绝
  if (opts.lockedDeceased) {
    if (body.is_living === true) {
      const err = new Error('总谱节点一律为「已故」，在世状态不可修改');
      err.status = 403;
      throw err;
    }
    if (body.birth_date !== undefined) person.birth_date = String(body.birth_date || '').trim();
    if (body.death_date !== undefined) person.death_date = String(body.death_date || '').trim();
    person.is_living = false;
    return person;
  }
  if (body.birth_date !== undefined) {
    person.birth_date = String(body.birth_date || '').trim();
  }
  if (typeof body.is_living === 'boolean') {
    person.is_living = body.is_living;
    if (body.is_living) {
      person.death_date = '';
    } else if (body.death_date !== undefined) {
      person.death_date = String(body.death_date || '').trim();
    }
  } else if (body.death_date !== undefined) {
    person.death_date = String(body.death_date || '').trim();
    if (person.death_date) person.is_living = false;
  }
  return person;
}

/**
 * 应用人物更新（PUT /people/<handle>）
 * body = Gramps RawPerson 形状（primary_name/gender/attribute_list/...）
 * 结构字段 → 树 JSON；非 external 的 attributes → 详情文档（全量替换）
 */
export async function updatePerson(treeId, handle, body, opts = {}) {
  return updateTree(treeId, async (tree) => {
    const person = tree.people[handle];
    if (!person) throw new Error('person not found');

    // 上层镜像只读（docs/founder-attach.spec.md §5 / docs/clan-tree.spec.md §3-7）：
    // - 任一上层树的镜像节点（始祖 founder / 宗谱顶端链 chain）→ 403，需到真身所在层修改
    // - 始祖位置的空白占位态 → 403「请先认祖」（不允许自行填写身份数据）
    if (opts.masterTreeId && treeId !== opts.masterTreeId) {
      const mirrorLock = await upperMirrorLockMessage(person, treeId);
      const entry = opts.founderEntry !== undefined ? opts.founderEntry : await metaEntryOf(treeId);
      const lock = mirrorLock || founderLockMessage(person, tree, opts.masterTreeId, entry);
      if (lock) {
        const err = new Error(lock);
        err.status = 403;
        throw err;
      }
    }

    const { surname, given, name } = nameParts(body.primary_name);
    person.surname = surname;
    person.given = given;
    person.name = name;
    if (body.gender !== undefined && [0, 1, 2].includes(body.gender)) {
      person.gender = genderFromNum(body.gender);
    }

    // 生卒 + 健在状态（编辑表单约定字段：顶层 birth_date / death_date / is_living）
    applyLifespan(person, body, { lockedDeceased: !!opts.masterTreeId && treeId === opts.masterTreeId });

    // 跨树软关联（结构字段）→ 树 JSON；其余属性 → 详情
    const ext = {};
    const others = [];
    for (const a of body.attribute_list || []) {
      const { key, value } = attrOf(a);
      if (!key) continue;
      if (EXTERNAL_KEYS.includes(key)) ext[key] = value;
      else others.push({ key, value, type: key });
    }
    // 只覆盖「显式提供」的 external_* 键（未提供的保持原值）：
    // 避免前端 PUT 未回传时把跨树链接 / 婚姻字段清空
    for (const k of EXTERNAL_KEYS) if (k in ext) person[k] = ext[k];

    // 详情文档（档案字段：attributes 全量替换；events 保持现状）
    const detail = (await getDetail(treeId, handle)) || { tree_id: treeId, handle, events: [], media: [], citations: [], notes: [], attributes: [] };
    detail.attributes = others;
    detail.updated_at = new Date().toISOString();
    await saveDetail(detail);
    return { ok: true, handle };
  });
}

/** 新建人物（POST /people/），body = {primary_name, gender, attribute_list?, inherit_surname_from?} */
export async function createPerson(treeId, body) {
  return updateTree(treeId, async (tree) => {
    const handle = genHandle();
    const parts = nameParts(body.primary_name);
    // 姓：显式给了就用；否则随父姓（inherit_surname_from = 挂接父节点 handle；父不详则空）
    const surname = parts.surname || inheritedSurname(tree, body.inherit_surname_from || '');
    const given = parts.given;
    const name = `${surname}${given}` || '未知';
    // 属性分流：跨树软关联 → 结构字段；其余（号/封号/谥号等）→ 详情文档
    const detailAttributes = [];
    const ext = {};
    for (const a of body.attribute_list || []) {
      const { key, value } = attrOf(a);
      if (!key) continue;
      if (EXTERNAL_KEYS.includes(key)) ext[key] = value;
      else detailAttributes.push({ key, value, type: key });
    }
    const person = {
      handle,
      gramps_id: nextGrampsId(tree, 'I'),
      name,
      surname,
      given,
      gender: genderFromNum(body.gender),
      birth_date: '',
      death_date: '',
      birth_place: '',
      death_place: '',
      parent_family: '',
      spouse_families: [],
      external_tree: ext.external_tree || '',
      external_person_handle: ext.external_person_handle || '',
      external_link_type: ext.external_link_type || '',
    };
    tree.people[handle] = person;
    await saveDetail({
      tree_id: treeId,
      handle,
      gramps_id: person.gramps_id,
      name,
      events: [],
      media: [],
      citations: [],
      notes: [],
      attributes: detailAttributes,
      updated_at: new Date().toISOString(),
    });
    return { handle, name, surname };
  });
}

/**
 * 子节点默认姓氏（随父姓）：优先取挂接节点所在家族中「父亲」的姓；
 * 父不详 → 取挂接节点本人的姓（单亲/母系场景）。
 */
export function inheritedSurname(tree, parentHandle) {
  if (!parentHandle) return '';
  const parent = tree.people[parentHandle];
  if (!parent) return '';
  for (const fh of parent.spouse_families || []) {
    const fam = tree.families[fh];
    const father = fam?.father_handle ? tree.people[fam.father_handle] : null;
    if (father?.surname) return father.surname;
  }
  return parent.surname || '';
}

/**
 * 家族写路径上的镜像只读校验：父/母/子女槽位含上层镜像节点（始祖 founder / 宗谱顶端链 chain）→ 403
 * docs/founder-attach.spec.md §5 · docs/clan-tree.spec.md §3-7
 */
function assertNotFounderMirror(tree, handles, masterTreeId) {
  if (!masterTreeId || tree.tree_id === masterTreeId) return;
  for (const h of handles || []) {
    if (!h) continue;
    const p = tree.people[h];
    if (isFounderMirror(p, masterTreeId) || isUpperMirror(p, tree.tree_id)) {
      const err = new Error(MIRROR_LOCK_MESSAGE);
      err.status = 403;
      throw err;
    }
  }
}

/** 新建家族（POST /families/），body = {father_handle, mother_handle, child_ref_list} */
export async function createFamily(treeId, body, opts = {}) {
  return updateTree(treeId, async (tree) => {
    const handle = genHandle();
    const father = body.father_handle || '';
    const mother = body.mother_handle || '';
    const children = (body.child_ref_list || []).map((c) => c.ref || c).filter(Boolean);
    // 始祖节点的父/母/配偶结构只读（结构以真身为准）
    assertNotFounderMirror(tree, [father, mother, ...children], opts.masterTreeId);
    tree.families[handle] = {
      handle,
      gramps_id: nextGrampsId(tree, 'F'),
      father_handle: father,
      mother_handle: mother,
      child_handles: children,
    };
    linkFamily(tree, handle, father, mother, children);
    return { handle };
  });
}

/** 更新家族（PUT /families/<handle>） */
export async function updateFamily(treeId, handle, body, opts = {}) {
  return updateTree(treeId, async (tree) => {
    const fam = tree.families[handle];
    if (!fam) throw new Error('family not found');
    const nextFather = body.father_handle || '';
    const nextMother = body.mother_handle || '';
    const nextChildren = (body.child_ref_list || []).map((c) => c.ref || c).filter(Boolean);
    // 始祖节点的父/母/配偶结构只读：新旧槽位都不得含始祖镜像
    assertNotFounderMirror(tree, [fam.father_handle, fam.mother_handle, nextFather, nextMother, ...nextChildren], opts.masterTreeId);
    unlinkFamily(tree, fam);
    fam.father_handle = nextFather;
    fam.mother_handle = nextMother;
    fam.child_handles = nextChildren;
    linkFamily(tree, handle, fam.father_handle, fam.mother_handle, fam.child_handles);
    return { ok: true, handle };
  });
}

/** 同步 person 的关系引用（家族写入后调用） */
function linkFamily(tree, famHandle, father, mother, children) {
  for (const h of [father, mother]) {
    if (h && tree.people[h]) {
      if (!tree.people[h].spouse_families.includes(famHandle)) {
        tree.people[h].spouse_families.push(famHandle);
      }
    }
  }
  for (const c of children) {
    if (c && tree.people[c] && !tree.people[c].parent_family) {
      tree.people[c].parent_family = famHandle;
    }
  }
}

/** 解除家族与 person 的引用（更新家族前调用） */
function unlinkFamily(tree, fam) {
  for (const h of [fam.father_handle, fam.mother_handle]) {
    if (h && tree.people[h]) {
      tree.people[h].spouse_families = tree.people[h].spouse_families.filter((x) => x !== fam.handle);
    }
  }
  for (const c of fam.child_handles || []) {
    if (c && tree.people[c] && tree.people[c].parent_family === fam.handle) {
      tree.people[c].parent_family = '';
    }
  }
}

// ---- 中华世本源流链（zhonghua）续编 ----

/** 详情文档 attributes → { key: value } 映射 */
function attrMap(detail) {
  const map = {};
  for (const a of detail?.attributes || []) map[a.key] = a.value;
  return map;
}

/**
 * 续编世数（纯函数，可单测）：父节点世数 → 子节点世数
 * - 父节点必须在源流链上（有 external_chain_gen）
 * - 聚合虚位节点（external_chain_aggregate，如「伏羲氏诸世」代表 2–44 世）不可续编
 */
export function nextChainGen(parentGen, opts = {}) {
  const gen = Number(parentGen);
  // 世数 0 = 原始节点（如「风华胥」作为总谱根），允许在其下续编第 1 世
  if (!Number.isFinite(gen) || gen < 0) {
    throw new Error('该节点不在中华世本源流链上（无世数），无法续编下一世');
  }
  if (opts.aggregate) {
    throw new Error('聚合虚位节点代表多世（如「伏羲氏诸世」2–44 世），请在其后继节点上续编');
  }
  return gen + 1;
}

/** 读取节点在源流链上的世数信息（onChain=false 表示不在链上；世数 0 = 原始节点，属链上） */
export async function getChainInfo(treeId, handle) {
  const attrs = attrMap(await getDetail(treeId, handle));
  const raw = attrs.external_chain_gen;
  const gen = parseInt(raw || '', 10);
  return {
    gen: Number.isFinite(gen) ? gen : 0,
    onChain: raw !== undefined && raw !== '',
    aggregate: attrs.external_chain_aggregate === 'true',
    from: attrs.external_chain_from || '',
    note: attrs.external_relation_note || '',
  };
}

/** 同世链上节点（排除 excludeHandle）：用于「同世并列分支」提示 */
export async function chainSiblings(treeId, gen, excludeHandle = '') {
  const tree = await getTree(treeId);
  const details = new Map();
  for (const d of await getAllDetails(treeId)) details.set(d.handle, attrMap(d));
  const out = [];
  for (const p of Object.values(tree.people)) {
    if (p.handle === excludeHandle) continue;
    if (parseInt(details.get(p.handle)?.external_chain_gen || '', 10) === gen) {
      out.push({ handle: p.handle, gramps_id: p.gramps_id, name: p.name, gen });
    }
  }
  out.sort((a, b) => String(a.gramps_id).localeCompare(String(b.gramps_id)));
  return out;
}

/**
 * 总谱续编（chief_editor）：把节点续编为父节点的第 N+1 世
 * - mode='new'：新建节点（name/surname/gender）并挂到链上
 * - mode='attach'：把树内已有节点（childHandle）挂接为链上第 N+1 世
 * 世数写详情文档 attributes.external_chain_gen（前端时间轴据此排序展示）；
 * 家族关系：父节点已有配偶家族 → 追加 child_ref（同世并列 = 分支），否则新建家族。
 * @returns {Promise<object>} { ok, child_handle, gen, siblings, branch, message }
 */
export async function appendChainNode({
  treeId,
  parentHandle,
  mode = 'new',
  name = '',
  surname = '',
  gender = 'U',
  childHandle = '',
  note = '',
  extraAttributes = [],
  masterTreeId,
}) {
  if (masterTreeId && treeId !== masterTreeId) throw new Error('续编仅适用于中华世本总谱');
  const tree0 = await getTree(treeId);
  if (!tree0) throw new Error(`树不存在: ${treeId}`);
  const parent = tree0.people[parentHandle];
  if (!parent) throw new Error('父节点不存在于总谱');

  const parentInfo = await getChainInfo(treeId, parentHandle);
  if (!parentInfo.onChain) throw new Error('该节点不在中华世本源流链上（无世数），无法续编下一世');
  const gen = nextChainGen(parentInfo.gen, { aggregate: parentInfo.aggregate });

  let targetHandle = '';
  if (mode === 'attach') {
    targetHandle = childHandle;
    if (!targetHandle) throw new Error('请选择要挂接的已有节点');
    if (targetHandle === parentHandle) throw new Error('不能把节点挂接到自己之下');
    const target = tree0.people[targetHandle];
    if (!target) throw new Error('待挂接节点不存在于总谱');
    const info = await getChainInfo(treeId, targetHandle);
    if (info.onChain) throw new Error(`「${target.name}」已在源流链第 ${info.gen} 世`);
    if (target.parent_family && tree0.families[target.parent_family]) {
      throw new Error(`「${target.name}」已有父母记录，不能再次挂接`);
    }
  } else if (!String(name).trim()) {
    throw new Error('请填写姓名');
  }

  const created = { name: '' };
  const handle = await updateTree(treeId, async (tree) => {
    let h = targetHandle;
    if (mode === 'new') {
      h = genHandle();
      // 姓缺省 → 随父姓（挂接节点所在家族父亲优先）
      const sn = String(surname || '').trim() || inheritedSurname(tree, parentHandle);
      const given = String(name || '').trim();
      tree.people[h] = {
        handle: h,
        gramps_id: nextGrampsId(tree, 'I'),
        name: `${sn}${given}` || '未知',
        surname: sn,
        given,
        gender: ['M', 'F', 'U'].includes(gender) ? gender : 'U',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: [],
        external_tree: '',
        external_person_handle: '',
        external_link_type: '',
        is_living: false, // 总谱节点一律已故（续编仅适用于中华世本总谱）
      };
      created.name = tree.people[h].name;
    }
    const person = tree.people[h];

    // 链属性 → 详情文档（档案真源）；保留原有 relation note
    const detail = (await getDetail(treeId, h)) || {
      tree_id: treeId,
      handle: h,
      gramps_id: person.gramps_id,
      name: person.name,
      events: [],
      media: [],
      citations: [],
      notes: [],
      attributes: [],
    };
    const attributes = (detail.attributes || []).filter((a) => !CHAIN_ATTR_KEYS.includes(a.key));
    attributes.push({ key: 'external_chain_gen', value: String(gen), type: 'external_chain_gen' });
    // 新建节点补链归属标记；挂接节点不动其自身跨树链接（external_tree 结构字段）
    if (mode === 'new') {
      attributes.push({ key: 'external_tree', value: treeId, type: 'external_tree' });
    }
    if (note) attributes.push({ key: 'external_relation_note', value: note, type: 'external_relation_note' });
    // 称号等档案属性（号/封号/谥号）随新建一并写入
    for (const a of extraAttributes || []) {
      const key = String(a?.key || '').trim();
      if (!key || CHAIN_ATTR_KEYS.includes(key)) continue;
      const value = String(a?.value ?? '').trim();
      if (!value) continue;
      attributes.push({ key, value, type: key });
    }
    detail.attributes = attributes;
    detail.gramps_id = person.gramps_id;
    detail.name = person.name;
    detail.updated_at = new Date().toISOString();
    await saveDetail(detail);

    // 家族挂接：父节点已有配偶家族 → 追加 child_ref（同世并列）；否则新建家族
    const famHandles = tree.people[parentHandle].spouse_families || [];
    const fam = famHandles.length ? tree.families[famHandles[0]] : null;
    if (fam) {
      if (!(fam.child_handles || []).includes(h)) {
        fam.child_handles = [...(fam.child_handles || []), h];
      }
      person.parent_family = fam.handle;
    } else {
      const fh = genHandle();
      const parentIsMother = tree.people[parentHandle].gender === 'F';
      tree.families[fh] = {
        handle: fh,
        gramps_id: nextGrampsId(tree, 'F'),
        father_handle: parentIsMother ? '' : parentHandle,
        mother_handle: parentIsMother ? parentHandle : '',
        child_handles: [h],
      };
      tree.people[parentHandle].spouse_families = [fh];
      person.parent_family = fh;
    }
    return h;
  });

  const siblings = await chainSiblings(treeId, gen, handle);
  const childName = created.name || tree0.people[handle]?.name || '';
  return {
    ok: true,
    tree_id: treeId,
    parent_handle: parentHandle,
    child_handle: handle,
    child_name: childName,
    gen,
    mode,
    siblings,
    branch: siblings.length > 0,
    message: `已续编第 ${gen} 世：${childName}`,
  };
}

/** 收集 handle 的整棵子树（含配偶家族与子女），用于拆分 */
function collectSubtree(tree, rootHandle) {
  const people = new Set([rootHandle]);
  const families = new Set();
  const queue = [rootHandle];
  while (queue.length) {
    const h = queue.shift();
    for (const fh of tree.people[h]?.spouse_families || []) {
      const fam = tree.families[fh];
      if (!fam || families.has(fh)) continue;
      families.add(fh);
      for (const p of [fam.father_handle, fam.mother_handle]) {
        if (p && !people.has(p)) {
          people.add(p);
          queue.push(p);
        }
      }
      for (const c of fam.child_handles || []) {
        if (c && !people.has(c)) {
          people.add(c);
          queue.push(c);
        }
      }
    }
  }
  return { people, families };
}

/** 简易姓氏 → 拼音（tree-id 前缀，与 frontend tree-id.ts PINYIN_MAP 对齐子集） */
const PINYIN_MAP = {
  季: 'ji', 顾: 'gu', 刘: 'liu', 沈: 'shen', 秦: 'qin', 李: 'li', 王: 'wang', 张: 'zhang',
  陈: 'chen', 杨: 'yang', 赵: 'zhao', 黄: 'huang', 周: 'zhou', 吴: 'wu', 徐: 'xu', 孙: 'sun',
  胡: 'hu', 朱: 'zhu', 高: 'gao', 林: 'lin', 何: 'he', 郭: 'guo', 马: 'ma', 罗: 'luo',
  梁: 'liang', 宋: 'song', 郑: 'zheng', 谢: 'xie', 韩: 'han', 唐: 'tang', 冯: 'feng',
  于: 'yu', 董: 'dong', 萧: 'xiao', 程: 'cheng', 曹: 'cao', 袁: 'yuan', 邓: 'deng',
  许: 'xu', 傅: 'fu', 曾: 'zeng', 彭: 'peng', 吕: 'lv', 苏: 'su', 卢: 'lu',
  蒋: 'jiang', 蔡: 'cai', 贾: 'jia', 丁: 'ding', 魏: 'wei', 薛: 'xue', 叶: 'ye', 阎: 'yan',
  余: 'yu', 潘: 'pan', 杜: 'du', 戴: 'dai', 夏: 'xia', 钟: 'zhong', 汪: 'wang', 田: 'tian',
  任: 'ren', 姜: 'jiang', 范: 'fan', 方: 'fang', 石: 'shi', 姚: 'yao', 谭: 'tan', 廖: 'liao',
  邹: 'zou', 熊: 'xiong', 金: 'jin', 陆: 'lu', 郝: 'hao', 孔: 'kong', 白: 'bai', 崔: 'cui',
  康: 'kang', 毛: 'mao', 邱: 'qiu', 江: 'jiang', 史: 'shi', 侯: 'hou', 邵: 'shao',
  孟: 'meng', 龙: 'long', 万: 'wan', 段: 'duan', 雷: 'lei', 钱: 'qian', 汤: 'tang', 尹: 'yin',
  易: 'yi', 常: 'chang', 武: 'wu', 乔: 'qiao', 贺: 'he', 赖: 'lai', 龚: 'gong', 文: 'wen',
};

/** 姓氏 → 拼音缩写（tree_id 前缀；未收录按 shi 兜底） */
export function surnamePinyin(surnameChar) {
  const char = String(surnameChar || '').trim();
  return PINYIN_MAP[char] || 'shi';
}

/**
 * 新树 tree_id：拼音_十进制码点_两位序号（与 shell-scripts/gen-tree-id.mjs 同规则，序号取该前缀最小未用）
 */
export function nextTreeId(meta, surnameChar) {
  const char = String(surnameChar || '').trim();
  const pinyin = surnamePinyin(char);
  const codePoint = char.codePointAt(0);
  for (let seq = 1; seq < 100; seq++) {
    const candidate = `${pinyin}_${codePoint}_${String(seq).padStart(2, '0')}`;
    if (!Object.values(meta.trees || {}).some((t) => t.tree_id === candidate)) return candidate;
  }
  throw new Error(`姓氏「${char}」下支派序号已用尽（≥99）`);
}

/**
 * 新建家族树（chief_editor）：写树 JSON + 始祖节点 + tree-meta 注册
 * - 树 JSON 首写入走 createTreeFile（cloud 模式需先建云存储文件并登记 fileID，此后 saveTree 才可用）
 * - onBeforeWrite：全部校验通过后、落库前调用（建树费扣款挂这里 → 校验不过不扣款）
 */
export async function createTree({
  surnameChar,
  founderName,
  founderGender = 'M',
  displayTitle = '',
  genealogyName = '',
  hallName = '',
  origin = '',
  description = '',
  initiatorPhone = '',
  onBeforeWrite = null,
}) {
  const char = String(surnameChar || '').trim();
  if (!/^[\u4e00-\u9fa5]$/.test(char)) throw new Error('请填写单个汉字姓氏');
  const given = String(founderName || '').trim();
  if (!given) throw new Error('请填写始祖姓名');
  const gender = ['M', 'F', 'U'].includes(founderGender) ? founderGender : 'M';

  const meta = await getMeta();
  const treeId = nextTreeId(meta, char);
  const handle = genHandle();
  const founderFullName = `${char}${given}`;
  const now = new Date().toISOString();

  if (onBeforeWrite) await onBeforeWrite();

  const tree = {
    _schema: '1.0',
    tree_id: treeId,
    founder_gramps_id: 'I0001',
    version: 1,
    updated_at: now,
    people: {
      [handle]: {
        handle,
        gramps_id: 'I0001',
        name: founderFullName,
        surname: char,
        given,
        gender,
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: [],
        external_tree: '',
        external_person_handle: '',
        external_link_type: '',
      },
    },
    families: {},
  };
  await createTreeFile(tree);
  await saveDetail({
    tree_id: treeId,
    handle,
    gramps_id: 'I0001',
    name: founderFullName,
    events: [],
    media: [],
    citations: [],
    notes: [],
    attributes: [],
    updated_at: now,
  });

  meta.trees[treeId] = {
    tree_id: treeId,
    path_alias: `/${treeId}`,
    surname_char: char,
    display_title: String(displayTitle || '').trim() || `${char}氏家族`,
    genealogy_name: String(genealogyName || '').trim() || `${char}氏家谱`,
    archive_url: '',
    hall_name: String(hallName || '').trim() || `${char}氏宗祠`,
    origin: String(origin || '').trim(),
    description: String(description || '').trim() || `新建家族树，始祖：${founderFullName}`,
    enable_custom_domain: false,
    created_at: now,
    created_by: initiatorPhone || '',
  };
  await saveMeta(meta);

  return {
    ok: true,
    tree_id: treeId,
    founder_handle: handle,
    founder_gramps_id: 'I0001',
    surname_char: char,
    display_title: meta.trees[treeId].display_title,
    message: `已创建「${meta.trees[treeId].display_title}」（${treeId}）`,
  };
}

/**
 * 拆分家族树（chief_editor）：以 ancestor 为始祖新建家族树，原树移除该子树
 * 返回前端 splitTree 契约形状
 */
export async function splitTree({ treeId, ancestorHandle, ancestorName = '', initiatorPhone }) {
  const meta = await getMeta();
  const entry = Object.values(meta.trees).find((t) => t.tree_id === treeId);
  if (!entry) throw new Error(`未找到 tree: ${treeId}`);

  let newTreeId = null;
  let movedPeople = 0;

  await updateTree(treeId, async (tree) => {
    const ancestor = tree.people[ancestorHandle];
    if (!ancestor) throw new Error('祖先节点不存在于该树');

    const { people, families } = collectSubtree(tree, ancestorHandle);
    if (people.size <= 0) throw new Error('无节点可拆分');

    // 新树 tree_id：姓氏拼音 + Unicode 码点 + 未用序号（生成规则与新建家族树共用 nextTreeId）
    const surnameChar = (ancestor.surname || entry.surname_char || '氏').slice(0, 1);
    newTreeId = nextTreeId(meta, surnameChar);

    // 新树 JSON：复制子树（始祖 parent_family 置空 → 成为根）
    const newTree = {
      _schema: tree._schema || '1.0',
      tree_id: newTreeId,
      founder_gramps_id: ancestor.gramps_id,
      version: 1,
      updated_at: new Date().toISOString(),
      people: {},
      families: {},
    };
    for (const h of people) newTree.people[h] = { ...tree.people[h] };
    for (const fh of families) newTree.families[fh] = { ...tree.families[fh] };
    if (newTree.people[ancestorHandle]) {
      newTree.people[ancestorHandle].parent_family = '';
    }
    // 引用完整性：去掉指向树外 person 的悬空引用
    for (const p of Object.values(newTree.people)) {
      if (p.parent_family && !newTree.families[p.parent_family]) p.parent_family = '';
      p.spouse_families = p.spouse_families.filter((fh) => newTree.families[fh]);
    }
    for (const f of Object.values(newTree.families)) {
      if (f.father_handle && !newTree.people[f.father_handle]) f.father_handle = '';
      if (f.mother_handle && !newTree.people[f.mother_handle]) f.mother_handle = '';
      f.child_handles = f.child_handles.filter((c) => newTree.people[c]);
    }

    // 原树移除（person/family/详情）
    for (const h of people) {
      delete tree.people[h];
      await deleteDetail(treeId, h);
    }
    for (const fh of families) delete tree.families[fh];

    movedPeople = people.size;

    // 新树注册 + 保存（新树无版本检查）
    await saveTree(newTree);
    meta.trees[newTreeId] = {
      tree_id: newTreeId,
      path_alias: `/${newTreeId}`,
      surname_char: surnameChar,
      display_title: `${surnameChar}氏家族`,
      genealogy_name: `${surnameChar}氏家谱`,
      archive_url: '',
      hall_name: '',
      origin: '',
      description: `由 ${treeId} 拆分而来，始祖：${ancestor.name || ancestorName}`,
      enable_custom_domain: false,
      created_at: new Date().toISOString(),
    };
    await saveMeta(meta);
    return { ok: true, newTreeId, movedPeople };
  });

  return {
    ok: true,
    newTreeId,
    surname: meta.trees[newTreeId].surname_char,
    movedPeople,
    message: `已拆分 ${movedPeople} 人到新家族树 ${newTreeId}`,
  };
}

/**
 * 晋宗（chief_editor）：nodeHandle 以上祖先链并入 zhonghua（external_chain_gen 续编），原树移除
 */
export async function promoteTree({ treeId, nodeHandle, attachHandle, masterTreeId }) {
  if (treeId === masterTreeId) throw new Error('总谱本身不可晋宗');
  const master = await getTree(masterTreeId);
  const attach = master.people[attachHandle];
  if (!attach) throw new Error('挂接节点不存在于中华世本');

  // 挂接世代号：挂接点 external_chain_gen 或 zhonghua 最大世数
  let attachGen = 0;
  const attachDetail = await getDetail(masterTreeId, attachHandle);
  for (const a of attachDetail?.attributes || []) {
    if (a.key === 'external_chain_gen') attachGen = parseInt(a.value, 10) || 0;
  }
  if (!attachGen) {
    for (const p of Object.values(master.people)) {
      const d = await getDetail(masterTreeId, p.handle);
      const g = d?.attributes?.find((a) => a.key === 'external_chain_gen');
      if (g) attachGen = Math.max(attachGen, parseInt(g.value, 10) || 0);
    }
  }

  let movedPeople = 0;
  let movedFamilies = 0;
  let chainGens = '';
  let masterNode = null;

  // 原树：收集祖先链（node → 始祖）
  const chain = []; // 从 node 向上
  await updateTree(treeId, async (tree) => {
    let cur = nodeHandle;
    const chainPeople = [];
    const chainFamilies = [];
    while (true) {
      const person = tree.people[cur];
      if (!person) throw new Error(`节点不存在: ${cur}`);
      chainPeople.push(person.handle);
      const pf = person.parent_family;
      if (!pf || !tree.families[pf]) break;
      chainFamilies.push(pf);
      const fam = tree.families[pf];
      const parent = fam.father_handle || fam.mother_handle;
      if (!parent) break;
      cur = parent;
    }
    if (chainPeople.length <= 1) {
      throw new Error('节点已是原树始祖（无祖先可并入）');
    }
    // 链顺序：始祖 → ... → node
    const ascChain = [...chainPeople].reverse();
    chainGens = `${attachGen + 1}-${attachGen + ascChain.length}`;

    // zhonghua 建链：每代建 person（external_chain_gen 从 attachGen+1 续编）+ family 挂接
    let parentHandle = attachHandle;
    let gen = attachGen;
    for (const h of ascChain) {
      gen++;
      const p = tree.people[h];
      const mh = genHandle();
      master.people[mh] = {
        handle: mh,
        gramps_id: `I${gen}`,
        name: p.name,
        surname: p.surname,
        given: p.given,
        gender: p.gender,
        birth_date: p.birth_date,
        death_date: p.death_date,
        birth_place: p.birth_place,
        death_place: p.death_place,
        parent_family: '',
        spouse_families: [],
        external_tree: '',
        external_person_handle: '',
        external_link_type: '',
      };
      await saveDetail({
        tree_id: masterTreeId,
        handle: mh,
        gramps_id: `I${gen}`,
        name: p.name,
        events: [],
        media: [],
        citations: [],
        notes: [],
        attributes: [
          { key: 'external_chain_gen', value: String(gen), type: 'external_chain_gen' },
          { key: 'external_chain_from', value: treeId, type: 'external_chain_from' },
        ],
        updated_at: new Date().toISOString(),
      });
      // 家族：父(parentHandle) - 子(mh)
      const fh = genHandle();
      master.families[fh] = {
        handle: fh,
        gramps_id: `F${gen}`,
        father_handle: parentHandle,
        mother_handle: '',
        child_handles: [mh],
      };
      if (master.people[parentHandle]) master.people[parentHandle].spouse_families.push(fh);
      parentHandle = mh;
      if (h === nodeHandle) masterNode = { handle: mh, name: p.name };
    }

    // 原树移除链上节点 + 家族
    for (const h of chainPeople) {
      delete tree.people[h];
      await deleteDetail(treeId, h);
    }
    for (const fh of chainFamilies) delete tree.families[fh];
    movedPeople = chainPeople.length;
    movedFamilies = chainFamilies.length;

    await saveTree(master);
    return { ok: true };
  });

  return {
    ok: true,
    treeId,
    nodeHandle,
    nodeName: masterNode?.name || '',
    movedPeople,
    movedFamilies,
    attach: { handle: attachHandle, name: attach.name, gen: attachGen },
    chainGens,
    masterNode: masterNode || { handle: attachHandle, name: attach.name },
    message: `已将 ${movedPeople} 人并入中华世本（第 ${attachGen + 1} 世起）`,
  };
}

// ---- 添加配偶（同树） ----

/**
 * 配偶槽位分配（纯函数，可单测）→ { selfSlot, spouseSlot }：'father' | 'mother'
 * 规则：本人性别优先（F→mother / M→father）；本人未知则按配偶性别反推；都未知 → 本人 father 兜底（确定性）。
 */
export function spouseSlots(selfGender, spouseGender) {
  const norm = (g) => (g === 'F' ? 'F' : g === 'M' ? 'M' : 'U');
  const self = norm(selfGender);
  const spouse = norm(spouseGender);
  let selfSlot;
  if (self === 'F') selfSlot = 'mother';
  else if (self === 'M') selfSlot = 'father';
  else if (spouse === 'F') selfSlot = 'father';
  else if (spouse === 'M') selfSlot = 'mother';
  else selfSlot = 'father';
  return { selfSlot, spouseSlot: selfSlot === 'father' ? 'mother' : 'father' };
}

/**
 * 添加配偶（同树；总谱/普通树通用）
 * - 已有家族且对方槽位为空 → 直接补位（如总谱链节点「风伏羲」的家族 mother 空缺）
 * - 已有家族但两槽已满 → 新建家族（再婚/多配偶）
 * - 无家族 → 新建家族
 * mode='new' 新建配偶节点（姓名/性别/称号随建）；mode='attach' 把树内已有节点设为配偶。
 */
export async function addSpouseNode({
  treeId,
  personHandle,
  mode = 'new',
  name = '',
  surname = '',
  gender = 'U',
  childHandle = '',
  extraAttributes = [],
}) {
  const tree0 = await getTree(treeId);
  if (!tree0) throw new Error(`树不存在: ${treeId}`);
  const person = tree0.people[personHandle];
  if (!person) throw new Error('节点不存在于该树');

  const { selfSlot, spouseSlot } = spouseSlots(person.gender, gender);

  let targetHandle = '';
  if (mode === 'attach') {
    targetHandle = childHandle;
    if (!targetHandle) throw new Error('请选择要设为配偶的已有节点');
    if (targetHandle === personHandle) throw new Error('不能把自己设为配偶');
    const target = tree0.people[targetHandle];
    if (!target) throw new Error('该节点不存在于该树');
    const dup = (person.spouse_families || []).some((fh) => {
      const fam = tree0.families[fh];
      return fam && (fam.father_handle === targetHandle || fam.mother_handle === targetHandle);
    });
    if (dup) throw new Error(`「${target.name}」已是本人的配偶`);
  } else if (!String(name).trim()) {
    throw new Error('请填写配偶姓名');
  }

  const created = { name: '' };
  const result = await updateTree(treeId, async (tree) => {
    let spouseHandle = targetHandle;
    if (mode === 'new') {
      spouseHandle = genHandle();
      const sn = String(surname || '').trim();
      const given = String(name || '').trim();
      tree.people[spouseHandle] = {
        handle: spouseHandle,
        gramps_id: nextGrampsId(tree, 'I'),
        name: `${sn}${given}` || '未知',
        surname: sn,
        given,
        gender: ['M', 'F', 'U'].includes(gender) ? gender : 'U',
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
      created.name = tree.people[spouseHandle].name;
      // 称号等档案属性（新建才带）
      const attrs = [];
      for (const a of extraAttributes || []) {
        const key = String(a?.key || '').trim();
        const value = String(a?.value ?? '').trim();
        if (key && value) attrs.push({ key, value, type: key });
      }
      await saveDetail({
        tree_id: treeId,
        handle: spouseHandle,
        gramps_id: tree.people[spouseHandle].gramps_id,
        name: tree.people[spouseHandle].name,
        events: [],
        media: [],
        citations: [],
        notes: [],
        attributes: attrs,
        updated_at: new Date().toISOString(),
      });
    }

    // 已有家族且对方槽位为空 → 补位；否则新建家族
    const reusable = (tree.people[personHandle].spouse_families || []).find((fh) => {
      const fam = tree.families[fh];
      return fam && !fam[`${spouseSlot}_handle`];
    });
    let famHandle = reusable;
    const reusedExistingFamily = !!reusable;
    if (famHandle) {
      const fam = tree.families[famHandle];
      fam[`${spouseSlot}_handle`] = spouseHandle;
      linkFamily(tree, famHandle, fam.father_handle, fam.mother_handle, fam.child_handles || []);
    } else {
      famHandle = genHandle();
      tree.families[famHandle] = {
        handle: famHandle,
        gramps_id: nextGrampsId(tree, 'F'),
        father_handle: selfSlot === 'father' ? personHandle : spouseHandle,
        mother_handle: selfSlot === 'mother' ? personHandle : spouseHandle,
        child_handles: [],
      };
      linkFamily(tree, famHandle, tree.families[famHandle].father_handle, tree.families[famHandle].mother_handle, []);
    }
    return { spouseHandle, famHandle, reusedExistingFamily };
  });

  const spouseName = created.name || tree0.people[result.spouseHandle]?.name || '';
  return {
    ok: true,
    tree_id: treeId,
    person_handle: personHandle,
    spouse_handle: result.spouseHandle,
    spouse_name: spouseName,
    family_handle: result.famHandle,
    mode,
    filled_existing_family: result.reusedExistingFamily,
    message: `已为「${person.name}」添加配偶「${spouseName}」`,
  };
}

/** 删除分迁链接（admin）：清空 external_* 三项 */
/**
 * 重新指定父节点（管理员）：在档案编辑里填「新父节点编号」→ 直接把 person 改挂到该节点家族下。
 *
 * 约定：
 * - 编号写法：I0101 / 0101 / 24 位 handle 均可（resolvePersonRef）
 * - 新父节点槽位由性别决定：女 → 母亲位，男/未知 → 父亲位（parentSlot）
 * - 家族复用：该父节点已有「本人在对应槽位、另一半空着」的家族 → 直接挂进去；
 *   否则用该父节点任意家族（另一半由既存配偶担任）；都没有 → 新建家族
 * - 原父母家族：摘除本人后若「无子且无家长」→ 一并删除（避免留下空家族挡住后续加父）
 * - 总谱源流链：本人与新父都在链上时，本人「及链上下代」的世数按 delta 平移（保持世数一致）
 * - 成环保护：新父节点不能是本人的后代
 * @returns {Promise<object>} { ok, person_*, parent_*, family_handle, created_family, removed_family, chain_shift }
 */
export async function reparentNode({
  treeId,
  personHandle,
  newParentRef,
  masterTreeId = '',
  targetTreeId = '',
  maxDepth = 0,
  depthOf = null,
  listIdsFn = listTreeIds,
}) {
  const tree0 = await getTree(treeId);
  const person = tree0.people[personHandle];
  if (!person) throw new Error('节点不存在');

  const refText = String(newParentRef || '').trim();
  const parentHandle = resolvePersonRef(tree0, refText);
  if (!parentHandle) {
    // 本树找不到 → 该编号属于别的家族树：跨树改父 = 节点及其全部后代整体迁到目标树
    const hit = await resolveCrossTreeParent({ sourceTreeId: treeId, ref: refText, targetTreeId, listIdsFn });
    if (hit) {
      return reparentAcrossTrees({
        treeId,
        personHandle,
        targetTreeId: hit.tree_id,
        targetHandle: hit.handle,
        masterTreeId,
        maxDepth,
        depthOf,
      });
    }
    throw new Error(`找不到编号为「${refText}」的节点`);
  }
  if (parentHandle === personHandle) throw new Error('不能把节点设为自己的父节点');
  const parent = tree0.people[parentHandle];
  if (descendantsOf(tree0, personHandle).has(parentHandle)) {
    throw new Error(`「${parent.name}」是「${person.name}」的后代，不能作为其父节点（会形成环）`);
  }
  const oldFam = person.parent_family ? tree0.families[person.parent_family] : null;
  if (oldFam && (oldFam.father_handle === parentHandle || oldFam.mother_handle === parentHandle)) {
    throw new Error(`「${person.name}」的父母已经是「${parent.name}」，无需改动`);
  }

  // 世数平移量（仅当双方都在源流链上；聚合虚位节点不代表单世 → 不平移）
  const [personInfo, parentInfo] = await Promise.all([
    getChainInfo(treeId, personHandle),
    getChainInfo(treeId, parentHandle),
  ]);
  let delta = 0;
  if (personInfo.onChain && parentInfo.onChain && !parentInfo.aggregate) {
    delta = parentInfo.gen + 1 - personInfo.gen;
  }
  // 受影响集合（本人 + 链上下代）在改动前算好：改父不改动本人的下代结构
  const affected = new Set([personHandle, ...descendantsOf(tree0, personHandle)]);

  const moved = await updateTree(treeId, async (tree) => {
    const p = tree.people[personHandle];
    let removedFamily = false;

    // 1) 从原父母家族摘除
    if (p.parent_family && tree.families[p.parent_family]) {
      const of = tree.families[p.parent_family];
      of.child_handles = (of.child_handles || []).filter((h) => h !== personHandle);
      if (!of.father_handle && !of.mother_handle && of.child_handles.length === 0) {
        delete tree.families[of.handle];
        removedFamily = true;
      }
    }
    p.parent_family = '';

    // 2) 找 / 建新父节点的家族
    const { family: target, created: createdFamily } = ensureParentFamily(tree, parentHandle);
    if (!target.child_handles.includes(personHandle)) target.child_handles.push(personHandle);
    p.parent_family = target.handle;

    return {
      family_handle: target.handle,
      created_family: createdFamily,
      removed_family: removedFamily,
    };
  });

  // 3) 源流链世数平移（本人 + 链上下代；只动带 external_chain_gen 的节点）
  let chainShift = null;
  if (delta) {
    const all = await getAllDetails(treeId);
    const gens = new Map();
    for (const d of all) {
      const g = attrMap(d).external_chain_gen;
      if (g !== undefined && g !== '') gens.set(d.handle, parseInt(g, 10));
    }
    let count = 0;
    for (const h of affected) {
      if (!gens.has(h)) continue;
      const detail = await getDetail(treeId, h);
      if (!detail) continue;
      const next = Math.max(0, gens.get(h) + delta);
      const attrs = (detail.attributes || []).filter((a) => a.key !== 'external_chain_gen');
      attrs.push({ key: 'external_chain_gen', value: String(next), type: 'external_chain_gen' });
      detail.attributes = attrs;
      detail.updated_at = new Date().toISOString();
      await saveDetail(detail);
      count += 1;
    }
    chainShift = { delta, affected: count };
  }

  return {
    ok: true,
    cross_tree: false,
    person_handle: personHandle,
    person_name: person.name,
    parent_handle: parentHandle,
    parent_name: parent.name,
    parent_gramps_id: parent.gramps_id,
    family_handle: moved.family_handle,
    created_family: moved.created_family,
    removed_family: moved.removed_family,
    chain_shift: chainShift,
  };
}

/**
 * 解析「人物编号 / 句柄」引用 → handle。三种写法都接受：I0101 / 0101 / 24 位 handle。
 * @returns {string|null} 找不到返回 null
 */
export function resolvePersonRef(tree, ref) {
  const s = String(ref || '').trim();
  if (!s) return null;
  if (tree.people[s]) return s;
  const want = s.toUpperCase().replace(/^I(?=\d)/, '');
  for (const p of Object.values(tree.people)) {
    const id = String(p.gramps_id || '').toUpperCase();
    if (id.replace(/^I(?=\d)/, '') === want) return p.handle;
  }
  return null;
}

/** 父槽位：女 → 母亲位，男/未知 → 父亲位 */
export function parentSlot(gender) {
  return gender === 'F' ? 'mother' : 'father';
}

/**
 * 某节点的全部后代（沿本人作为父/母的家族 child_handles 向下）。
 * 用于改父时的成环校验：新父节点不能是本人的后代。
 */
export function descendantsOf(tree, handle) {
  const out = new Set();
  const stack = [handle];
  while (stack.length) {
    const h = stack.pop();
    for (const fh of tree.people[h]?.spouse_families || []) {
      for (const c of tree.families[fh]?.child_handles || []) {
        if (c && c !== handle && !out.has(c)) {
          out.add(c);
          stack.push(c);
        }
      }
    }
  }
  return out;
}

export async function removeBranchLink(treeId, personHandle) {

  return updateTree(treeId, async (tree) => {
    const person = tree.people[personHandle];
    if (!person) throw new Error('person not found');
    for (const k of EXTERNAL_KEYS) person[k] = '';
    return { ok: true };
  });
}

// ================= 节点详情模态框：删除节点 / 跨家族树改父 =================
//
// 两项能力的共同约定（详见报告）：
// - 校验先行：全部校验（权限、总谱/始祖/镜像、外树引用、深度）在写任何一棵树之前完成；
// - 删除的跨树引用口径（Kevin 2026-09-16 硬口径）：待删子树内任何节点在其它家族树里
//   存在指向它的外树指针（始祖挂载 / 世系链 / 跨树婚姻镜像 / 分迁登记 / 镜像节点）→
//   **一律拒绝删除**，绝不级联删除或修改对方树数据（拒绝时两棵树都不写）；
// - 跨树改父：目标父节点属于别的家族树 → 把该节点及其全部后代整体迁入目标树（单事务）。

/** 删除模式：subtree = 连同全部后代（整支）；promote = 仅本节点，子女上提一级 */
export const DELETE_MODE_SUBTREE = 'subtree';
export const DELETE_MODE_PROMOTE = 'promote';

/**
 * 删除范围/上提文案（与 promoteChildrenUp 的实际行为逐字对齐，供 dry_run 与成功返回共用；
 * 前端不再自行拼文案，直接展示这里的 message）。
 * - 0 人上提（家族另一位家长仍在）→ 子女留在原家族，只清本人槽位
 * - N 人上提 → 子节点上提一级：N 人（并入父母的家族 / 成为根节点）
 */
const PROMOTE_KEEP_TEXT = '子女留在原家族（配偶健在时只清本人槽位）';
function promoteScopeText(promotedCount, toFamily) {
  return `子节点上提一级：${promotedCount} 人${toFamily ? '（并入父母的家族）' : '（成为根节点）'}`;
}
/** subtree 模式范围措辞：实际删的是整支后代，统一说「全部后代」而不是「全部子节点」 */
const DELETE_SCOPE_SUBTREE = '及其全部后代';

/** 统一错误构造（带 HTTP 状态；路由直接透传） */
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/** 外树链接类型中文名（拒绝文案用） */
const LINK_LABEL = {
  founder: '始祖挂载',
  chain: '宗谱世系链',
  marriage: '跨树婚姻镜像',
  child: '跨树子女镜像',
  branch: '分迁登记',
};

/** tree-meta 条目 → 可读树名（拒绝文案定位用） */
function treeLabelOf(meta, treeId) {
  const entry = Object.values(meta?.trees || {}).find((t) => t?.tree_id === treeId);
  return entry?.display_title ? `${entry.display_title}（${treeId}）` : treeId;
}

/** tree-meta 条目 → 可读树名（异步：读 meta；读不到退化为 tree_id） */
async function treeLabelFor(treeId) {
  try {
    return treeLabelOf(await getMeta(), treeId);
  } catch {
    return treeId;
  }
}

/**
 * 目标父节点的家族（纯函数）：复用「本人在对应槽位、另一半空着」的家族 →
 * 同槽位家族 → 都没有则新建（编号取 nextGrampsId(tree,'F')）。
 * 口径与 reparentNode 一致（本函数即其抽出）。
 */
export function ensureParentFamily(tree, parentHandle) {
  const par = tree.people[parentHandle];
  if (!par) throw fail('父节点不存在');
  const slot = parentSlot(par.gender);
  const slotKey = slot === 'father' ? 'father_handle' : 'mother_handle';
  const otherKey = slot === 'father' ? 'mother_handle' : 'father_handle';
  if (!Array.isArray(par.spouse_families)) par.spouse_families = [];
  const fams = par.spouse_families.map((h) => tree.families[h]).filter(Boolean);
  let target = fams.find((f) => f[slotKey] === parentHandle && !f[otherKey]) || null;
  if (!target) target = fams.find((f) => f[slotKey] === parentHandle) || null;
  if (target) return { family: target, created: false };
  const fh = genHandle();
  tree.families[fh] = {
    handle: fh,
    gramps_id: nextGrampsId(tree, 'F'),
    father_handle: slot === 'father' ? parentHandle : '',
    mother_handle: slot === 'mother' ? parentHandle : '',
    child_handles: [],
  };
  par.spouse_families.push(fh);
  return { family: tree.families[fh], created: true };
}

/**
 * 以 root 为根的整支后代（BFS 顺序：root 在前，逐代展开）。
 * 用于编号重分配与清单展示；环/脏数据由 seen 集合兜底。
 */
export function lineageOrder(tree, rootHandle) {
  const out = [];
  const seen = new Set([rootHandle]);
  const queue = [rootHandle];
  while (queue.length) {
    const h = queue.shift();
    out.push(h);
    for (const fh of tree.people[h]?.spouse_families || []) {
      for (const c of tree.families[fh]?.child_handles || []) {
        if (c && c !== h && !seen.has(c) && tree.people[c]) {
          seen.add(c);
          queue.push(c);
        }
      }
    }
  }
  return out;
}

/** 子树高度（1 = 叶子；用于跨树迁移的世代上限预估） */
export function subtreeHeight(tree, rootHandle) {
  if (!tree.people[rootHandle]) return 0;
  let max = 1;
  const seen = new Set([rootHandle]);
  const queue = [[rootHandle, 1]];
  while (queue.length) {
    const [h, d] = queue.shift();
    if (d > max) max = d;
    for (const fh of tree.people[h]?.spouse_families || []) {
      for (const c of tree.families[fh]?.child_handles || []) {
        if (!c || c === h || seen.has(c) || !tree.people[c]) continue;
        seen.add(c);
        queue.push([c, d + 1]);
      }
    }
  }
  return max;
}

/** 节点在树内的世代（1 = 根；沿 parent_family 向上；环/缺家长 → 停止） */
export function generationOf(tree, handle) {
  let depth = 1;
  let cur = handle;
  const seen = new Set([handle]);
  while (true) {
    const fam = tree.families[tree.people[cur]?.parent_family || ''];
    if (!fam) break;
    const up = [fam.father_handle, fam.mother_handle].filter((h) => h && h !== cur && tree.people[h]).find((h) => !seen.has(h));
    if (!up) break;
    seen.add(up);
    cur = up;
    depth += 1;
  }
  return depth;
}

/** 家族是否已无实际内容（无家长；或仅剩单亲且无子女）→ 可随删除一并清理 */
function familyIsDead(fam) {
  const parents = [fam.father_handle, fam.mother_handle].filter(Boolean);
  const kids = (fam.child_handles || []).filter(Boolean);
  if (parents.length === 0 && kids.length === 0) return true;
  if (kids.length === 0 && parents.length <= 1) return true;
  return false;
}

/**
 * 引用完整性修复（纯函数）：删人/删家族后清掉悬空引用。
 * 返回修复报告（各字段 = 修复条数），供测试与审计使用。
 */
export function repairTreeRefs(tree) {
  const report = { spouse_families: 0, parent_family: 0, family_parents: 0, child_handles: 0 };
  for (const p of Object.values(tree.people || {})) {
    const before = p.spouse_families || [];
    const kept = before.filter((fh) => tree.families[fh]);
    if (kept.length !== before.length) {
      p.spouse_families = kept;
      report.spouse_families += before.length - kept.length;
    }
    if (p.parent_family && !tree.families[p.parent_family]) {
      p.parent_family = '';
      report.parent_family += 1;
    }
  }
  for (const f of Object.values(tree.families || {})) {
    if (f.father_handle && !tree.people[f.father_handle]) {
      f.father_handle = '';
      report.family_parents += 1;
    }
    if (f.mother_handle && !tree.people[f.mother_handle]) {
      f.mother_handle = '';
      report.family_parents += 1;
    }
    const before = f.child_handles || [];
    const kept = before.filter((c) => tree.people[c]);
    if (kept.length !== before.length) {
      f.child_handles = kept;
      report.child_handles += before.length - kept.length;
    }
  }
  return report;
}

/** 结构引用完整性检查（纯函数）→ 悬空引用问题清单（空数组 = 干净） */
export function checkTreeIntegrity(tree) {
  const problems = [];
  for (const p of Object.values(tree.people || {})) {
    for (const fh of p.spouse_families || []) {
      if (!tree.families[fh]) problems.push(`节点 ${p.handle} 的 spouse_families → ${fh} 不存在`);
    }
    if (p.parent_family && !tree.families[p.parent_family]) {
      problems.push(`节点 ${p.handle} 的 parent_family → ${p.parent_family} 不存在`);
    }
  }
  for (const f of Object.values(tree.families || {})) {
    if (f.father_handle && !tree.people[f.father_handle]) problems.push(`家族 ${f.handle} 的父 → ${f.father_handle} 不存在`);
    if (f.mother_handle && !tree.people[f.mother_handle]) problems.push(`家族 ${f.handle} 的母 → ${f.mother_handle} 不存在`);
    for (const c of f.child_handles || []) {
      if (!tree.people[c]) problems.push(`家族 ${f.handle} 的子女 → ${c} 不存在`);
    }
  }
  return problems;
}

/**
 * 从树里摘除节点集合（纯函数，删子树用）：
 * ① 删人；② 清家族侧父/母槽与 child_handles；③ 无内容家族（familyIsDead）一并删除；
 * ④ repairTreeRefs 清悬空引用（存活配偶的 spouse_families、孤儿的 parent_family）。
 * @returns {{removed_people: string[], removed_families: string[]}}
 */
export function removePeopleFromTree(tree, handles) {
  const gone = handles instanceof Set ? handles : new Set(handles || []);
  const removedPeople = [];
  for (const h of gone) {
    if (tree.people[h]) {
      delete tree.people[h];
      removedPeople.push(h);
    }
  }
  const dead = new Set();
  for (const fam of Object.values(tree.families || {})) {
    const touches = [fam.father_handle, fam.mother_handle, ...(fam.child_handles || [])].some((x) => x && gone.has(x));
    if (!touches) continue;
    if (gone.has(fam.father_handle)) fam.father_handle = '';
    if (gone.has(fam.mother_handle)) fam.mother_handle = '';
    fam.child_handles = (fam.child_handles || []).filter((c) => !gone.has(c) && tree.people[c]);
    if (familyIsDead(fam)) dead.add(fam.handle);
  }
  for (const fh of dead) delete tree.families[fh];
  repairTreeRefs(tree);
  return { removed_people: removedPeople, removed_families: [...dead] };
}

/**
 * 仅删本节点时的子女上提（纯函数）：
 * - 家族里另一位家长仍在 → 家族保留、只清空本节点槽位，子女不动（随父/母继续在本家族）；
 * - 本节点是该家族唯一家长 → 子女整体上提一级：本人有父母家族 → 并入其 child_handles
 *   （parent_family 改指该家族）；本人是根 → 子女成为根（parent_family=''）。原家族删除。
 * @returns {{promoted: string[], moved_to_family: string}}
 */
export function promoteChildrenUp(tree, nodeHandle) {
  const node = tree.people[nodeHandle];
  if (!node) return { promoted: [], moved_to_family: '' };
  const targetFam = node.parent_family && tree.families[node.parent_family] ? tree.families[node.parent_family] : null;
  const promoted = [];
  const dead = new Set();
  for (const fh of node.spouse_families || []) {
    const fam = tree.families[fh];
    if (!fam || (targetFam && fam.handle === targetFam.handle)) continue;
    const other = fam.father_handle === nodeHandle ? fam.mother_handle : fam.father_handle;
    if (fam.father_handle === nodeHandle) fam.father_handle = '';
    if (fam.mother_handle === nodeHandle) fam.mother_handle = '';
    if (other && tree.people[other]) {
      // 配偶仍在 → 家族保留（子女留在原家族）
      if (familyIsDead(fam)) dead.add(fam.handle);
      continue;
    }
    const kids = (fam.child_handles || []).filter((c) => c && c !== nodeHandle && tree.people[c]);
    for (const k of kids) {
      promoted.push(k);
      const kid = tree.people[k];
      if (targetFam) {
        if (!targetFam.child_handles.includes(k)) targetFam.child_handles.push(k);
        if (!kid.parent_family || kid.parent_family === fam.handle) kid.parent_family = targetFam.handle;
      } else if (!kid.parent_family || kid.parent_family === fam.handle) {
        kid.parent_family = '';
      }
    }
    fam.child_handles = (fam.child_handles || []).filter((c) => !kids.includes(c));
    dead.add(fam.handle); // 唯一家长 → 家族随本人删除（子女已上提）
  }
  for (const fh of dead) delete tree.families[fh];
  if (targetFam) targetFam.child_handles = (targetFam.child_handles || []).filter((c) => c !== nodeHandle);
  delete tree.people[nodeHandle];
  repairTreeRefs(tree);
  return { promoted, moved_to_family: targetFam ? targetFam.handle : '' };
}

/**
 * 外树引用扫描（只读）：其它家族树里是否有指向 handles 集合的外树指针
 * （external_person_handle 命中；含镜像节点与 tree-meta 的始祖登记兜底）。
 * @returns {Promise<Array<{tree_id,handle,name,link_type,mirror}>>}
 */
async function scanExternalRefs({ treeId, handles, listIdsFn = listTreeIds, meta = null }) {
  const hits = new Map();
  const ids = (await listIdsFn()).filter((id) => id && id !== treeId);
  for (const id of ids) {
    let tree = null;
    try {
      tree = await getTree(id);
    } catch {
      tree = null;
    }
    for (const [h, p] of Object.entries(tree?.people || {})) {
      const target = String(p?.external_person_handle || '');
      if (!target || !handles.has(target)) continue;
      hits.set(`${id}:${h}`, {
        tree_id: id,
        handle: h,
        name: p.name || '',
        link_type: String(p.external_link_type || ''),
        mirror: String(p.external_mirror || '') === 'true',
      });
    }
  }
  // tree-meta 侧的始祖登记（若镜像节点被手工清掉，反指针仍在 meta 里）
  for (const e of Object.values(meta?.trees || {})) {
    if (!e?.tree_id || e.tree_id === treeId) continue;
    if (e.founder_handle && handles.has(e.founder_handle)) {
      hits.set(`${e.tree_id}:founder-meta`, {
        tree_id: e.tree_id,
        handle: e.founder_handle,
        name: e.founder_name || '',
        link_type: 'founder',
        mirror: true,
      });
    }
  }
  return [...hits.values()];
}

/** 待删树 + 外树引用 → 拒绝文案（带涉及树名与节点名，便于定位）；状态 409 */
async function externalRefRefusal(hits) {
  let meta = null;
  try {
    meta = await getMeta();
  } catch {
    meta = null;
  }
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
    `该节点及其子树在其它家族树中存在关联（始祖挂载/镜像/跨树婚姻），请先到对应家族树解除关系后再删除；涉及：${shown}${more}`,
    409,
  );
}

/**
 * 删除节点（节点详情模态框）
 *
 * 模式：
 * - mode='subtree'（默认）：删除该节点及其全部后代（整支）
 * - mode='promote'：仅删除本节点；子女上提一级（配偶仍在则子女留在原家族随配偶；唯一家长则并入本人父母家族，
 *   本人是根则子女成为根）
 *
 * 拒绝口径（校验先行，全部在写入前）：
 * - 总谱（treeId === masterTreeId 或 meta kind='master'）→ 403
 * - 删除范围包含本树始祖节点 → 403（请先「重置始祖」）
 * - 被删节点本身是镜像节点（external_mirror='true' / 始祖镜像）→ 403
 * - 删除范围内含镜像节点（后代是别处真身的镜像）→ 403（外树数据不级联改动）
 * - 删除范围内任何节点被其它家族树引用（external_person_handle 指向它）→ 409，**拒绝删除**
 *
 * dry_run=true 只做校验 + 统计（不写任何树），供前端二次确认文案使用；
 * confirm_count 与本次实际删除人数不一致 → 400（防确认期间数据被他人改动）。
 *
 * @returns {Promise<object>} 删除报告（people/people_count/families_count/promoted_children/…）
 */
export async function deleteNode({
  treeId,
  personHandle,
  mode = DELETE_MODE_SUBTREE,
  masterTreeId = '',
  confirmCount = null,
  dryRun = false,
  listIdsFn = listTreeIds,
  meta = null,
} = {}) {
  if (!treeId || !personHandle) throw fail('缺少 tree_id 或 person_handle');
  const tree0 = await getTree(treeId);
  if (!tree0) throw fail(`树不存在: ${treeId}`);
  const modeNorm = mode === DELETE_MODE_PROMOTE ? DELETE_MODE_PROMOTE : DELETE_MODE_SUBTREE;

  const m = meta || (await metaEntryOf(treeId));
  if (treeId === masterTreeId || treeKindOf(m) === TREE_KIND.MASTER) {
    throw fail('中华世本（总谱）节点不可删除：总谱是全体家族树的认祖真源，调整请联系总编辑', 403);
  }
  const person = tree0.people[personHandle];
  if (!person) throw fail('节点不存在');
  if (String(person.external_mirror || '') === 'true' || isFounderMirror(person, masterTreeId)) {
    throw fail(
      `该节点是外树镜像节点（${LINK_LABEL[person.external_link_type] || '跨树关联'}），删除请到其真身所在家族树操作`,
      403,
    );
  }

  // 删除集合：subtree = 整支后代；promote = 仅本节点
  const lineage = lineageOrder(tree0, personHandle);
  const deleted = new Set(modeNorm === DELETE_MODE_SUBTREE ? lineage : [personHandle]);

  const founderHandle = resolveFounderHandle(tree0, m);
  if (founderHandle && deleted.has(founderHandle)) {
    throw fail('删除范围包含本树始祖节点：请先「重置始祖」再删除', 403);
  }
  if (modeNorm === DELETE_MODE_SUBTREE) {
    for (const h of deleted) {
      if (h === personHandle) continue;
      const p = tree0.people[h];
      if (p && (String(p.external_mirror || '') === 'true' || isFounderMirror(p, masterTreeId))) {
        throw fail(`删除范围内含外树镜像节点「${p.name || h}」（其真身在别的家族树），请先处理该镜像`, 403);
      }
    }
  }

  // 跨树引用：整个待删子树都要查；命中 → 拒绝（绝不级联改对方树）
  let metaAll = null;
  try {
    metaAll = await getMeta();
  } catch {
    metaAll = null;
  }
  const refs = await scanExternalRefs({ treeId, handles: deleted, listIdsFn, meta: metaAll });
  if (refs.length) throw await externalRefRefusal(refs);

  // 预演（只算不写）：给出人数、家族数、上提子女清单
  const preview = JSON.parse(JSON.stringify(tree0));
  const plan =
    modeNorm === DELETE_MODE_PROMOTE
      ? promoteChildrenUp(preview, personHandle)
      : { promoted: [], moved_to_family: '', ...removePeopleFromTree(preview, deleted) };
  const peopleList = lineage
    .filter((h) => deleted.has(h))
    .map((h) => ({ handle: h, name: tree0.people[h]?.name || '', gramps_id: tree0.people[h]?.gramps_id || '' }));
  const familiesCount =
    Object.keys(tree0.families || {}).length - Object.keys(preview.families || {}).length;
  const promotedList = (plan.promoted || []).map((h) => ({
    handle: h,
    name: tree0.people[h]?.name || '',
    gramps_id: tree0.people[h]?.gramps_id || '',
  }));
  const nameOf = (h) => tree0.people[h]?.name || h;
  const report = {
    ok: true,
    dry_run: !!dryRun,
    tree_id: treeId,
    mode: modeNorm,
    person_handle: personHandle,
    person_name: person.name || '',
    people: peopleList,
    people_count: deleted.size,
    families_count: familiesCount,
    promoted_children: promotedList,
    promoted_count: promotedList.length,
    promoted_to_family: plan.moved_to_family || '',
    external_refs: refs,
    external_ref_count: refs.length,
  };

  if (dryRun) {
    return {
      ...report,
      message:
        modeNorm === DELETE_MODE_PROMOTE
          ? `将删除「${report.person_name}」1 人；${
              promotedList.length > 0
                ? promoteScopeText(promotedList.length, report.promoted_to_family)
                : PROMOTE_KEEP_TEXT
            }，不可恢复`
          : `将删除「${report.person_name}」${DELETE_SCOPE_SUBTREE}共 ${deleted.size} 人（含 ${familiesCount} 个家族记录），不可恢复`,
    };
  }

  if (confirmCount !== null && confirmCount !== undefined && Number(confirmCount) !== deleted.size) {
    throw fail(`删除范围已变化（当前 ${deleted.size} 人，确认时 ${Number(confirmCount)} 人），请重新确认`, 409);
  }

  const applied = await updateTrees([treeId], (trees) => {
    const tree = trees[treeId];
    const res =
      modeNorm === DELETE_MODE_PROMOTE
        ? { ...promoteChildrenUp(tree, personHandle), removed_families: [] }
        : removePeopleFromTree(tree, deleted);
    const problems = checkTreeIntegrity(tree);
    if (problems.length) throw fail(`删除后结构校验失败：${problems.slice(0, 3).join('；')}`, 500);
    return res;
  });

  // 详情文档随删（树 JSON 已落库；详情删除 best-effort，孤儿详情由清理脚本兜底）
  const detailRemoved = [];
  for (const h of deleted) {
    try {
      await deleteDetail(treeId, h);
      detailRemoved.push(h);
    } catch {
      /* 忽略 */
    }
  }

  return {
    ...report,
    deleted_people: [...deleted].map(nameOf),
    removed_families: applied.removed_families || [],
    detail_removed: detailRemoved.length,
    message:
      modeNorm === DELETE_MODE_PROMOTE
        ? `已删除「${report.person_name}」；${
            promotedList.length > 0
              ? promoteScopeText(promotedList.length, report.promoted_to_family)
              : PROMOTE_KEEP_TEXT
          }`
        : `已删除「${report.person_name}」${DELETE_SCOPE_SUBTREE}共 ${deleted.size} 人（含 ${familiesCount} 个家族记录）`,
  };
}

/**
 * 跨树改父的目标解析（只读）：在别的家族树里按编号/handle 找父节点。
 * - 显式给了 targetTreeId → 只在该树找；找不到 → 明确报错
 * - 未给 → 在所有树里找；命中多棵树 → 报错要求指定（避免误迁）
 * @returns {Promise<{tree_id:string, handle:string}|null>} 完全找不到返回 null
 */
export async function resolveCrossTreeParent({ sourceTreeId, ref, targetTreeId = '', listIdsFn = listTreeIds }) {
  const refText = String(ref || '').trim();
  if (!refText) return null;
  const ids = (await listIdsFn()).filter((id) => id && id !== sourceTreeId);
  const candidates = [];
  for (const id of ids) {
    if (targetTreeId && id !== targetTreeId) continue;
    let tree = null;
    try {
      tree = await getTree(id);
    } catch {
      tree = null;
    }
    if (!tree?.people) continue;
    const h = resolvePersonRef(tree, refText);
    if (h) candidates.push({ tree_id: id, handle: h, name: tree.people[h]?.name || '' });
  }
  if (!candidates.length) {
    if (targetTreeId) throw fail(`目标家族树 ${targetTreeId} 中找不到编号为「${refText}」的节点`);
    return null;
  }
  if (candidates.length > 1) {
    const which = candidates.map((c) => `${c.tree_id}（${c.name}）`).join('、');
    throw fail(`编号「${refText}」在多个家族树中重号：${which}；请指定目标家族树后再操作`);
  }
  return candidates[0];
}

/**
 * 跨家族树迁移（纯函数）：把 src 中 rootHandle 及其全部后代整体迁到 dst，
 * 挂到 dst 的 targetParentHandle 之下（槽位按目标父性别）。
 *
 * 口径：
 * - handle 沿用（24 位随机 handle 全局唯一：外部镜像指针 external_person_handle 不悬空）
 * - gramps_id 按目标树现有编号段重分配（BFS 顺序：本人 → 逐代），家族编号同理
 * - 连接子孙的家族随迁（编号重分配）；留在源树的配偶：家族随迁、其槽位清空
 * - 无子女的配偶家族（仅婚姻记录）不随迁，源树侧按空家族清理
 * - 目标树中指向迁入节点的镜像节点：真身已在本树 → 删除（有本树婚姻家庭的只清指针）
 * @returns {object} 迁移报告
 */
export function moveLineage({ src, dst, rootHandle, targetParentHandle }) {
  const root = src.people[rootHandle];
  if (!root) throw fail('节点不存在于源家族树');
  if (!dst.people[targetParentHandle]) throw fail('目标父节点不存在于目标家族树');
  const order = lineageOrder(src, rootHandle);
  const moving = new Set(order);

  // 随迁家族：有子女、且父或母在迁移集合内（其子女必然全在迁移集合内 —— 后代传递）
  const familyHandles = [];
  const srcFamilyIds = new Set(Object.keys(src.families || {}));
  for (const fam of Object.values(src.families || {})) {
    if (!(fam.child_handles || []).length) continue;
    if (!moving.has(fam.father_handle) && !moving.has(fam.mother_handle)) continue;
    familyHandles.push(fam.handle);
  }

  // 0) 目标树镜像清理（先做：清理可能连带删掉目标父的孤立家族，随后 ensureParentFamily 会重建）
  const trimmed = [];
  for (const [h, p] of Object.entries(dst.people)) {
    if (moving.has(h)) continue;
    const target = String(p.external_person_handle || '');
    if (!target || !moving.has(target)) continue;
    if ((p.spouse_families || []).length === 0) {
      removePeopleFromTree(dst, new Set([h]));
      trimmed.push({ tree_id: dst.tree_id, handle: h, name: p.name || '', action: 'deleted' });
    } else {
      for (const k of EXTERNAL_KEYS) p[k] = '';
      trimmed.push({ tree_id: dst.tree_id, handle: h, name: p.name || '', action: 'unlinked' });
    }
  }

  // 1) 目标父的家族（复用「对应槽位空着」的家族 → 同槽位家族 → 新建）
  const { family: targetFamily, created: createdFamily } = ensureParentFamily(dst, targetParentHandle);

  // 2) 迁入人物（沿用 handle；重分配 gramps_id）
  const grampsIdMap = {};
  for (const h of order) {
    const p = { ...src.people[h] };
    delete src.people[h];
    dst.people[h] = p;
    p.gramps_id = nextGrampsId(dst, 'I');
    grampsIdMap[h] = p.gramps_id;
  }

  // 3) 迁入家族（重分配编号；留在源树的配偶槽位清空）
  const familyIdMap = {};
  for (const fh of familyHandles) {
    const f = { ...src.families[fh] };
    delete src.families[fh];
    f.gramps_id = nextGrampsId(dst, 'F');
    if (f.father_handle && !moving.has(f.father_handle)) f.father_handle = '';
    if (f.mother_handle && !moving.has(f.mother_handle)) f.mother_handle = '';
    f.child_handles = (f.child_handles || []).filter((c) => dst.people[c]);
    dst.families[fh] = f;
    familyIdMap[fh] = f.gramps_id;
  }

  // 4) 根节点挂到目标父的家族下
  if (!targetFamily.child_handles.includes(rootHandle)) targetFamily.child_handles.push(rootHandle);
  dst.people[rootHandle].parent_family = targetFamily.handle;

  // 5) 源树残留清理：本人原父母家族摘除 + 留在源树的配偶家族/配偶登记
  if (root.parent_family && srcFamilyIds.has(root.parent_family) && src.families[root.parent_family]) {
    src.families[root.parent_family].child_handles = (src.families[root.parent_family].child_handles || []).filter(
      (c) => c !== rootHandle,
    );
  }
  removePeopleFromTree(src, moving); // 幂等：清源树侧的家族槽位/悬空引用
  repairTreeRefs(dst);

  return {
    moved_people: order,
    moved_people_count: order.length,
    moved_families: familyHandles,
    moved_families_count: familyHandles.length,
    gramps_id_map: grampsIdMap,
    family_id_map: familyIdMap,
    trimmed_mirrors: trimmed,
    family_handle: targetFamily.handle,
    created_family: createdFamily,
    root_gramps_id: grampsIdMap[rootHandle] || '',
  };
}

/**
 * 跨树改父（事务写路径）：校验先行 → store.updateTrees([源树, 目标树]) 单事务
 * → 失败双侧回滚（updateTrees 快照回滚）→ 事务成功后详情文档随迁。
 *
 * 权限：路由侧要求发起人对**源树**有写权（目标树按现有跨树写入口径不额外要求，见报告）。
 * 校验：目标树存在且非总谱；源树非总谱；不得把节点挂到自己的后代（同树已拦，跨树结构上
 * 不可能成环，仍按 handle 显式校验）；世代上限复用 maxDepth/depthOf 口径（含迁入后预估）。
 */
export async function reparentAcrossTrees({
  treeId,
  personHandle,
  targetTreeId,
  targetHandle,
  masterTreeId = '',
  maxDepth = 0,
  depthOf = null,
} = {}) {
  if (!targetTreeId) throw fail('缺少目标家族树');
  if (treeId === targetTreeId) throw fail('目标家族树与当前家族树相同：同树改父请直接填新父节点编号');
  if (treeId === masterTreeId) throw fail('中华世本（总谱）节点不可迁出：请在本树内改挂父节点', 403);
  if (targetTreeId === masterTreeId) throw fail('不可把节点迁入中华世本（总谱）：总谱由晋宗/续编维护', 403);

  const src0 = await getTree(treeId);
  if (!src0) throw fail(`树不存在: ${treeId}`);
  const dst0 = await getTree(targetTreeId);
  if (!dst0) throw fail(`目标家族树不存在: ${targetTreeId}`);
  const person = src0.people[personHandle];
  if (!person) throw fail('节点不存在于当前家族树');
  const targetParent = dst0.people[targetHandle];
  if (!targetParent) throw fail('目标父节点不存在于目标家族树');
  if (String(person.external_mirror || '') === 'true' || isFounderMirror(person, masterTreeId)) {
    throw fail(
      `该节点是外树镜像节点（${LINK_LABEL[person.external_link_type] || '跨树关联'}），不可跨树迁移，请到真身所在家族树操作`,
      403,
    );
  }

  const order = lineageOrder(src0, personHandle);
  const moving = new Set(order);
  const srcMeta = await metaEntryOf(treeId);
  const founderHandle = resolveFounderHandle(src0, srcMeta);
  if (founderHandle && moving.has(founderHandle)) {
    throw fail('迁移范围包含本树始祖节点：请先「重置始祖」再迁移', 403);
  }
  for (const h of moving) {
    const p = src0.people[h];
    if (p && (String(p.external_mirror || '') === 'true' || isFounderMirror(p, masterTreeId))) {
      throw fail(`迁移范围内含外树镜像节点「${p.name || h}」，请先在其真身所在家族树处理`, 403);
    }
  }

  // 世代上限（复用 child-write 的 maxDepth/depthOf 口径 + 迁入后预估）
  if (maxDepth && typeof depthOf === 'function') {
    const base = Number(depthOf(dst0)) || 0;
    const projected = Math.max(base, generationOf(dst0, targetHandle) - 1 + subtreeHeight(src0, personHandle));
    if (projected > maxDepth) {
      throw fail(
        `目标家族树已达 ${maxDepth} 世深度上限（迁入后约 ${projected} 世），请联系总编辑（晋宗或扩容）`,
        403,
      );
    }
  }

  const moved = await updateTrees([treeId, targetTreeId], (trees) => {
    const res = moveLineage({
      src: trees[treeId],
      dst: trees[targetTreeId],
      rootHandle: personHandle,
      targetParentHandle: targetHandle,
    });
    const problems = [
      ...checkTreeIntegrity(trees[treeId]).map((p) => `${treeId}: ${p}`),
      ...checkTreeIntegrity(trees[targetTreeId]).map((p) => `${targetTreeId}: ${p}`),
    ];
    if (problems.length) throw fail(`跨树迁移后结构校验失败：${problems.slice(0, 3).join('；')}`, 500);
    return res;
  });

  // 详情文档随迁（文件名含 tree_id → 目标树新 key；旧 key 删除）
  const dstAfter = await getTree(targetTreeId);
  for (const h of moved.moved_people) {
    try {
      const detail = await getDetail(treeId, h);
      if (detail) {
        await saveDetail({
          ...detail,
          _id: `${targetTreeId}:${h}`,
          tree_id: targetTreeId,
          handle: h,
          gramps_id: moved.gramps_id_map[h] || detail.gramps_id || '',
          name: dstAfter?.people?.[h]?.name || detail.name || '',
          updated_at: new Date().toISOString(),
        });
      }
      await deleteDetail(treeId, h);
    } catch {
      /* 详情迁移 best-effort：结构真源已在树 JSON 内 */
    }
  }
  for (const t of moved.trimmed_mirrors) {
    if (t.action !== 'deleted') continue;
    try {
      await deleteDetail(t.tree_id, t.handle);
    } catch {
      /* best-effort */
    }
  }

  // 双侧 tree-meta 统计刷新（仅当条目本身带统计字段；无统计字段的条目不动）
  const statsRefreshed = await refreshTreeMetaStats([treeId, targetTreeId]);

  return {
    ok: true,
    cross_tree: true,
    person_handle: personHandle,
    person_name: person.name || '',
    parent_handle: targetHandle,
    parent_name: targetParent.name || '',
    parent_gramps_id: targetParent.gramps_id || '',
    target_tree_id: targetTreeId,
    family_handle: moved.family_handle,
    created_family: moved.created_family,
    removed_family: false,
    moved_people: moved.moved_people_count,
    moved_families: moved.moved_families_count,
    gramps_id_map: moved.gramps_id_map,
    new_gramps_id: moved.root_gramps_id,
    trimmed_mirrors: moved.trimmed_mirrors,
    meta_stats_refreshed: statsRefreshed,
    chain_shift: null,
    message: `已将「${person.name}」及其后代共 ${moved.moved_people_count} 人迁移到 ${await treeLabelFor(
      targetTreeId,
    )}，挂到「${targetParent.name}」之下`,
  };
}

/** tree-meta 已知统计字段（条目带哪个就刷新哪个；一个都没有 → 不写 meta） */
const META_STAT_KEYS = ['person_count', 'people_count', 'node_count', 'family_count'];

/**
 * tree-meta 统计刷新（best-effort）：仅当条目本身带统计字段时按树 JSON 重算。
 * 目的：跨树迁移后双侧人数/家族数保持真实；tree-meta 里没有统计字段的实现一律不写
 * （不新增字段、不改真源结构 —— 真实 config/tree-meta.json 保持逐字节不变）。
 * @returns {Promise<boolean>} 是否写了 meta
 */
export async function refreshTreeMetaStats(treeIds) {
  const ids = [...new Set((treeIds || []).filter(Boolean))];
  if (!ids.length) return false;
  const m = await getMeta();
  const trees = { ...(m?.trees || {}) };
  let changed = false;
  for (const id of ids) {
    const key = Object.keys(trees).find((k) => trees[k]?.tree_id === id);
    if (!key) continue;
    const entry = trees[key];
    if (!META_STAT_KEYS.some((k) => k in entry)) continue;
    const tree = await getTree(id);
    if (!tree) continue;
    const patch = {};
    if ('person_count' in entry) patch.person_count = Object.keys(tree.people || {}).length;
    if ('people_count' in entry) patch.people_count = Object.keys(tree.people || {}).length;
    if ('node_count' in entry) patch.node_count = Object.keys(tree.people || {}).length;
    if ('family_count' in entry) patch.family_count = Object.keys(tree.families || {}).length;
    trees[key] = { ...entry, ...patch };
    changed = true;
  }
  if (changed) await saveMeta({ ...m, trees });
  return changed;
}
