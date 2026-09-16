/**
 * 跨家族树改父（节点整体迁移）测试 — POST /admin/reparent
 * 逻辑见 lib/tree-write.js §跨家族树迁移（moveLineage / reparentAcrossTrees）
 *
 * 口径：
 * - 模态框「父节点编号」填的编号属于**别的家族树** → 该节点及其全部子节点整体迁移到目标家族树，
 *   挂到目标父节点之下（槽位按目标父性别：女 → 母亲位）
 * - 单事务 store.updateTrees([源树, 目标树])，失败双侧回滚（快照）
 * - handle 沿用（24 位随机 handle 全局唯一 → 外部镜像指针不悬空）；gramps_id 按目标树编号段重分配
 * - 连接子孙的家族随迁（编号重分配）；留在源树的配偶：家族随迁、槽位清空
 * - 目标树中指向迁入节点的镜像：真身已在本树 → 删除（有本树婚姻家庭的只清指针）
 * - 拒绝：源/目标是总谱、迁移范围含始祖/镜像、世代上限
 * - 详情文档随迁（文件名 tree_id:handle → 目标树新 key）
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 指向 /tmp 副本；文末 md5 断言真实数据未变。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/reparent-cross.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-reparent-cross-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaMd5 = md5(REAL_META);
const realTreesBaseline = new Map(fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]));
const realDetailsBaseline = new Map(fs.readdirSync(REAL_DETAILS).map((f) => [f, md5(path.join(REAL_DETAILS, f))]));

const metaFixture = {
  _schema: '1.1',
  trees: {
    zhonghua: {
      tree_id: 'zhonghua', kind: 'master', is_master: true, path_alias: '/zhonghua',
      surname_char: '华', display_title: '中华世本 · 全球华人家谱总谱',
    },
    rc_src: { tree_id: 'rc_src', kind: 'family', display_title: '甲氏家族（源树）' },
    rc_dst: { tree_id: 'rc_dst', kind: 'family', display_title: '乙氏家族（目标树）' },
    rc_founder: {
      tree_id: 'rc_founder', kind: 'family', display_title: '丙氏家族（始祖源树）',
      founder_handle: 'rc_founder-son', founder_gramps_id: 'I0102', founder_name: '儿子',
    },
    rc_mirror: { tree_id: 'rc_mirror', kind: 'family', display_title: '丁氏家族（镜像源树）' },
    rc_amb_src: { tree_id: 'rc_amb_src', kind: 'family', display_title: '戊氏家族（重号源树）' },
    rc_amb_a: { tree_id: 'rc_amb_a', kind: 'family', display_title: '己氏家族（重号 A）' },
    rc_amb_b: { tree_id: 'rc_amb_b', kind: 'family', display_title: '庚氏家族（重号 B）' },
    rc_stats_src: { tree_id: 'rc_stats_src', kind: 'family', display_title: '辛氏家族（统计源树）' },
    rc_stats_dst: {
      tree_id: 'rc_stats_dst', kind: 'family', display_title: '壬氏家族（统计目标树）',
      person_count: 0, family_count: 0,
    },
    rc_route_src: { tree_id: 'rc_route_src', kind: 'family', display_title: '癸氏家族（路由源树）' },
    shen_27784_01: { tree_id: 'shen_27784_01', kind: 'family', display_title: '沈氏临沂家族（副本）' },
    ji_23395_01: { tree_id: 'ji_23395_01', kind: 'family', display_title: '季氏费县白露家族（副本）' },
  },
};
fs.writeFileSync(META_FILE, JSON.stringify(metaFixture, null, 2) + '\n');

const tw = await import('./tree-write.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ---- 造数工具 ----

function writeTree(tree) {
  const p = path.join(TMP, 'trees', `${tree.tree_id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tree, null, 2));
}
function readTree(treeId) {
  return JSON.parse(fs.readFileSync(path.join(TMP, 'trees', `${treeId}.json`), 'utf8'));
}
function treeMd5(treeId) {
  return md5(path.join(TMP, 'trees', `${treeId}.json`));
}
function writeDetail(doc) {
  const p = path.join(TMP, 'details', `${doc._id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(doc, null, 2));
}
function readDetail(treeId, handle) {
  const p = path.join(TMP, 'details', `${treeId}:${handle}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/** 源树（三代）：gp─gm → son/kid1/kid2/gk；编号 I0100+ / F0100+ */
function srcFamily(id) {
  const h = {
    gp: `${id}-gp`, gm: `${id}-gm`, son: `${id}-son`, wife: `${id}-wife`,
    kid1: `${id}-kid1`, kid2: `${id}-kid2`, w2: `${id}-w2`, gk: `${id}-gk`,
  };
  const fam = { gp: `${id}-fam-gp`, son: `${id}-fam-son`, kid2: `${id}-fam-kid2` };
  return {
    id,
    h,
    fam,
    tree: {
      _schema: '1.0',
      tree_id: id,
      version: 3,
      people: {
        [h.gp]: { handle: h.gp, gramps_id: 'I0100', name: '祖父', surname: '甲', given: '祖父', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.gp] },
        [h.gm]: { handle: h.gm, gramps_id: 'I0101', name: '祖母', surname: '甲', given: '祖母', gender: 'F', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.gp] },
        [h.son]: { handle: h.son, gramps_id: 'I0102', name: '儿子', surname: '甲', given: '儿子', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.gp, spouse_families: [fam.son] },
        [h.wife]: { handle: h.wife, gramps_id: 'I0103', name: '媳妇', surname: '丙', given: '媳妇', gender: 'F', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.son] },
        [h.kid1]: { handle: h.kid1, gramps_id: 'I0104', name: '孙子', surname: '甲', given: '孙子', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.son, spouse_families: [] },
        [h.kid2]: { handle: h.kid2, gramps_id: 'I0105', name: '孙次', surname: '甲', given: '孙次', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.son, spouse_families: [fam.kid2] },
        [h.w2]: { handle: h.w2, gramps_id: 'I0106', name: '孙媳', surname: '丁', given: '孙媳', gender: 'F', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.kid2] },
        [h.gk]: { handle: h.gk, gramps_id: 'I0107', name: '曾孙', surname: '甲', given: '曾孙', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.kid2, spouse_families: [] },
      },
      families: {
        [fam.gp]: { handle: fam.gp, gramps_id: 'F0100', father_handle: h.gp, mother_handle: h.gm, child_handles: [h.son] },
        [fam.son]: { handle: fam.son, gramps_id: 'F0101', father_handle: h.son, mother_handle: h.wife, child_handles: [h.kid1, h.kid2] },
        [fam.kid2]: { handle: fam.kid2, gramps_id: 'F0102', father_handle: h.kid2, mother_handle: h.w2, child_handles: [h.gk] },
      },
    },
  };
}

let dstSeq = 0;
/**
 * 目标树：目标父（p）+ 一个无关节点（other）+ 目标父的家族（fam）。
 * 可选挂入「指向源树节点的镜像」：mirrorChild（纯展示副本，无本树家庭）/ mirrorSpouse（有本树婚姻家庭）。
 * 编号段按 base 唯一（跨树解析要保证 gramps_id 不与他树重号）。
 */
function dstTree(id, { base = 9000, parentGender = 'M', mirrorChildOf = '', mirrorSpouseOf = '' } = {}) {
  const h = { p: `${id}-p`, other: `${id}-other`, mirror1: `${id}-mirror-child`, mirror2: `${id}-mirror-spouse` };
  const fam = { p: `${id}-fam`, m2: `${id}-fam-mirror-spouse` };
  const people = {
    [h.p]: { handle: h.p, gramps_id: `I${base}`, name: '目标父', surname: '乙', given: '目标父', gender: parentGender, birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.p] },
    [h.other]: { handle: h.other, gramps_id: `I${base + 1}`, name: '无关节点', surname: '乙', given: '无关', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [] },
  };
  const families = {
    [fam.p]: { handle: fam.p, gramps_id: `F${base}`, father_handle: parentGender === 'F' ? '' : h.p, mother_handle: parentGender === 'F' ? h.p : '', child_handles: [] },
  };
  if (mirrorChildOf) {
    people[h.mirror1] = {
      handle: h.mirror1, gramps_id: `I${base + 2}`, name: '镜像子', surname: '甲', given: '镜像子', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.p, spouse_families: [],
      external_tree: 'SRC', external_person_handle: mirrorChildOf, external_link_type: 'child', external_mirror: 'true',
    };
    families[fam.p].child_handles = [h.mirror1];
  }
  if (mirrorSpouseOf) {
    people[h.mirror2] = {
      handle: h.mirror2, gramps_id: `I${base + 3}`, name: '镜像配偶', surname: '甲', given: '镜像配偶', gender: 'F',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.m2],
      external_tree: 'SRC', external_person_handle: mirrorSpouseOf, external_link_type: 'marriage', external_mirror: 'true',
    };
    families[fam.m2] = { handle: fam.m2, gramps_id: `F${base + 1}`, father_handle: h.other, mother_handle: h.mirror2, child_handles: [] };
  }
  return { id, h, fam, tree: { _schema: '1.0', tree_id: id, version: 2, people, families } };
}

/** 每次调用分配互不重号的编号段（跨树解析依赖 gramps_id 唯一） */
function mkDst(tag, opts = {}) {
  dstSeq += 1;
  const t = dstTree(`rc_dst_${tag}`, { base: 9000 + dstSeq * 100, ...opts });
  return t;
}

/** 极简树（只造人） */
function simpleTree(id, people) {
  const obj = {};
  for (const [handle, p] of Object.entries(people)) {
    obj[handle] = {
      handle, gramps_id: p.gramps_id || '', name: p.name || handle, surname: '', given: '', gender: p.gender || 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
      external_tree: p.external_tree || '', external_person_handle: p.external_person_handle || '',
      external_link_type: p.external_link_type || '', ...(p.external_mirror ? { external_mirror: 'true' } : {}),
    };
  }
  return { _schema: '1.0', tree_id: id, version: 1, people: obj, families: {} };
}

// ================= 纯函数 =================

test('moveLineage（纯函数）：handle 沿用 + 目标树编号重分配 + 双侧清理 + 目标树镜像处理', () => {
  const s = srcFamily('rc_src');
  const d = dstTree('rc_dst', { base: 9000, mirrorChildOf: 'rc_src-son', mirrorSpouseOf: 'rc_src-kid1' });
  const numOf = (id) => parseInt(String(id || '').replace(/^\D+/, ''), 10);
  // 基址捕获：编号段按前缀各自独立（人与家族不共享序号），故分别取操作前的同前缀最大编号
  const baseI = Math.max(...Object.values(d.tree.people).map((o) => numOf(o.gramps_id)));
  const baseF = Math.max(...Object.values(d.tree.families).map((o) => numOf(o.gramps_id)));
  const r = tw.moveLineage({
    src: s.tree,
    dst: d.tree,
    rootHandle: s.h.son,
    targetParentHandle: d.h.p,
  });

  assert.equal(r.moved_people_count, 4);
  assert.deepEqual(r.moved_people, [s.h.son, s.h.kid1, s.h.kid2, s.h.gk], 'BFS 顺序：本人 → 逐代');
  assert.equal(r.moved_families_count, 2, '连接子孙的两个家族随迁');

  // handle 沿用 + 编号重分配：从「操作前同前缀最大编号 + 1」起按 BFS 连号（已删镜像的旧号不复用）
  const movedIds = [s.h.son, s.h.kid1, s.h.kid2, s.h.gk].map((h) => numOf(d.tree.people[h].gramps_id));
  assert.deepEqual(
    movedIds,
    [baseI + 1, baseI + 2, baseI + 3, baseI + 4],
    `迁入节点应从 I${baseI + 1} 起连号（I${baseI} 为操作前最大编号）`,
  );
  assert.equal(r.gramps_id_map[s.h.gk], d.tree.people[s.h.gk].gramps_id, '编号映射与树内一致');
  assert.equal(d.tree.people[s.h.son].handle, s.h.son, 'handle 沿用（外部镜像指针不悬空）');

  // 目标父家族：镜像子被删 → 孤立家族（仅一位家长、无子女）清理 → 重建新家族，本节点挂进去
  assert.equal(r.created_family, true);
  assert.equal(d.tree.people[s.h.son].parent_family, r.family_handle);
  assert.deepEqual(d.tree.families[r.family_handle].child_handles, [s.h.son]);
  assert.equal(d.tree.families[r.family_handle].father_handle, d.h.p);

  // 随迁家族：编号重分配（家族段独立于人员段；基址 = 操作前最大 F 编号）
  assert.equal(numOf(d.tree.families[r.family_handle].gramps_id), baseF + 1, '重建的父家族 F{baseF+1}');
  assert.equal(numOf(d.tree.families[s.fam.son].gramps_id), baseF + 2, '随迁家族依次连号');
  assert.equal(numOf(d.tree.families[s.fam.kid2].gramps_id), baseF + 3);
  assert.equal(d.tree.families[s.fam.son].father_handle, s.h.son, '迁入的家长保留');
  assert.equal(d.tree.families[s.fam.son].mother_handle, '', '留在源树的配偶槽位清空');
  assert.deepEqual(d.tree.families[s.fam.son].child_handles, [s.h.kid1, s.h.kid2]);
  assert.equal(d.tree.families[s.fam.kid2].mother_handle, '');

  // 目标树镜像：无本树家庭的 child 镜像 → 删除；有本树婚姻家庭的 → 只清指针
  assert.deepEqual(r.trimmed_mirrors.map((m) => m.action).sort(), ['deleted', 'unlinked']);
  assert.equal(d.tree.people[d.h.mirror1], undefined, '纯展示镜像随真身迁入而删除');
  assert.ok(d.tree.people[d.h.mirror2], '有本树婚姻家庭的镜像保留');
  for (const k of ['external_tree', 'external_person_handle', 'external_link_type', 'external_mirror']) {
    assert.equal(d.tree.people[d.h.mirror2][k], '', `${k} 已清空`);
  }

  // 源树：迁走的人不存在，家族与配偶登记清理干净
  for (const h of [s.h.son, s.h.kid1, s.h.kid2, s.h.gk]) assert.equal(s.tree.people[h], undefined);
  assert.equal(s.tree.families[s.fam.son], undefined);
  assert.equal(s.tree.families[s.fam.kid2], undefined);
  assert.deepEqual(s.tree.families[s.fam.gp].child_handles, [], '本人从祖辈家族摘除');
  assert.deepEqual(s.tree.people[s.h.wife].spouse_families, [], '留源树的配偶登记清空');
  assert.deepEqual(s.tree.people[s.h.w2].spouse_families, []);
  assert.deepEqual(tw.checkTreeIntegrity(s.tree), []);
  assert.deepEqual(tw.checkTreeIntegrity(d.tree), []);
});

test('世代工具：目标父世代 + 子树高度（深度上限预估口径）', () => {
  const s = srcFamily('rc_gen_src');
  const d = dstTree('rc_gen_dst', { base: 8800 });
  assert.equal(tw.generationOf(d.tree, d.h.p), 1);
  assert.equal(tw.subtreeHeight(s.tree, s.h.son), 3, '本人 → 子 → 孙 = 3 代');
  assert.equal(tw.subtreeHeight(s.tree, s.h.kid1), 1);
  // 父为女 → 母亲位
  const dm = dstTree('rc_gen_dst_m', { base: 8700, parentGender: 'F' });
  const created = tw.ensureParentFamily(dm.tree, dm.h.p);
  assert.equal(created.family.mother_handle, dm.h.p);
  assert.equal(created.family.father_handle, '');
});

// ================= 跨树改父：写路径 =================

test('跨树改父（自动识别编号所属树）：两棵树各 +1 版本，节点及全部子孙整体迁移', async () => {
  const s = srcFamily('rc_x1');
  const d = mkDst('x1');
  const base = 9000 + dstSeq * 100;
  writeTree(s.tree);
  writeTree(d.tree);

  const r = await tw.reparentNode({
    treeId: 'rc_x1',
    personHandle: s.h.son,
    newParentRef: String(base), // 编号只在目标树里 → 跨树
    masterTreeId: 'zhonghua',
    maxDepth: 72,
    depthOf: () => 5,
  });
  assert.equal(r.cross_tree, true);
  assert.equal(r.target_tree_id, d.id);
  assert.equal(r.moved_people, 4);
  assert.equal(r.parent_name, '目标父');
  assert.equal(r.parent_gramps_id, `I${base}`);
  assert.equal(r.chain_shift, null);
  assert.match(r.message, /迁移到/);

  const srcAfter = readTree('rc_x1');
  const dstAfter = readTree(d.id);
  assert.equal(srcAfter.version, 4, '源树写一次 +1');
  assert.equal(dstAfter.version, 3, '目标树写一次 +1');
  for (const h of [s.h.son, s.h.kid1, s.h.kid2, s.h.gk]) assert.equal(srcAfter.people[h], undefined);
  assert.ok(srcAfter.people[s.h.wife], '留源树的配偶保留');
  assert.deepEqual(srcAfter.people[s.h.wife].spouse_families, []);
  assert.equal(dstAfter.people[s.h.son].name, '儿子');
  assert.equal(dstAfter.people[s.h.son].parent_family, r.family_handle);
  assert.equal(dstAfter.people[s.h.gk].gramps_id, r.gramps_id_map[s.h.gk]);
  assert.deepEqual(dstAfter.families[s.fam.kid2].child_handles, [s.h.gk]);
  assert.deepEqual(tw.checkTreeIntegrity(srcAfter), []);
  assert.deepEqual(tw.checkTreeIntegrity(dstAfter), []);
});

test('跨树改父：详情文档随迁（目标树新 key + 新编号，源树旧 key 删除）', async () => {
  const s = srcFamily('rc_x2');
  const d = mkDst('x2');
  writeTree(s.tree);
  writeTree(d.tree);
  writeDetail({
    _id: `rc_x2:${s.h.son}`, tree_id: 'rc_x2', handle: s.h.son, gramps_id: 'I0102', name: '儿子',
    events: [{ handle: 'e9', type: 'Birth', date: '1900' }], attributes: [{ key: '号', value: '某', type: '号' }],
    media: [], citations: [], notes: [],
  });

  const r = await tw.reparentNode({
    treeId: 'rc_x2',
    personHandle: s.h.son,
    newParentRef: `I${9000 + dstSeq * 100}`,
    masterTreeId: 'zhonghua',
  });
  assert.equal(r.cross_tree, true);
  const movedId = r.gramps_id_map[s.h.son];
  const detail = readDetail(d.id, s.h.son);
  assert.ok(detail, '详情已落到目标树 key');
  assert.equal(detail.tree_id, d.id);
  assert.equal(detail.gramps_id, movedId);
  assert.equal(detail.events[0].handle, 'e9', '事件等档案字段随迁');
  assert.equal(detail.attributes[0].key, '号');
  assert.equal(readDetail('rc_x2', s.h.son), null, '源树旧详情已删除');
});

test('跨树改父：指定目标树但编号不存在 → 明确报错；多树重号 → 要求指定目标树', async () => {
  const s = srcFamily('rc_x3');
  const d = mkDst('x3');
  writeTree(s.tree);
  writeTree(d.tree);
  const srcBefore = treeMd5('rc_x3');
  const dstBefore = treeMd5(d.id);

  await assert.rejects(
    () => tw.reparentNode({ treeId: 'rc_x3', personHandle: s.h.son, newParentRef: 'I999999', targetTreeId: d.id, masterTreeId: 'zhonghua' }),
    /目标家族树 .* 中找不到编号/,
  );
  assert.equal(treeMd5('rc_x3'), srcBefore, '校验先行：不写源树');
  assert.equal(treeMd5(d.id), dstBefore, '校验先行：不写目标树');

  // 重号：两棵别的树都有 I8000
  const a = srcFamily('rc_amb_src');
  writeTree(a.tree);
  writeTree(simpleTree('rc_amb_a', { 'rc_amb_a-1': { gramps_id: 'I8000', name: '甲父' } }));
  writeTree(simpleTree('rc_amb_b', { 'rc_amb_b-1': { gramps_id: 'I8000', name: '乙父' } }));
  await assert.rejects(
    () => tw.reparentNode({ treeId: 'rc_amb_src', personHandle: a.h.son, newParentRef: 'I8000', masterTreeId: 'zhonghua' }),
    (e) => /重号/.test(e.message) && /指定目标家族树/.test(e.message),
  );
  // 指定目标树后即可唯一定位
  const ok = await tw.reparentNode({
    treeId: 'rc_amb_src',
    personHandle: a.h.son,
    newParentRef: 'I8000',
    targetTreeId: 'rc_amb_a',
    masterTreeId: 'zhonghua',
  });
  assert.equal(ok.cross_tree, true);
  assert.equal(ok.target_tree_id, 'rc_amb_a');
  assert.ok(readTree('rc_amb_a').people[a.h.son]);
});

test('同树改父不受影响（回归）：cross_tree=false，不碰别的树', async () => {
  const s = srcFamily('rc_same');
  writeTree(s.tree);
  const other = mkDst('same');
  writeTree(other.tree);
  const otherBefore = treeMd5(other.id);
  const r = await tw.reparentNode({
    treeId: 'rc_same',
    personHandle: s.h.kid1,
    newParentRef: 'I0108', // 同树编号（不存在的次子）→ 找不到 → 报错
    masterTreeId: 'zhonghua',
  }).catch((e) => e);
  assert.ok(r instanceof Error, '同树找不到该编号且别的树也没有 → 报错');
  // 同树真改父：kid1 改挂到祖父家族（gp 已有家族 → 复用）
  const ok = await tw.reparentNode({ treeId: 'rc_same', personHandle: s.h.kid1, newParentRef: s.h.gm, masterTreeId: 'zhonghua' });
  assert.equal(ok.cross_tree, false);
  assert.equal(ok.parent_handle, s.h.gm);
  assert.equal(ok.family_handle, s.fam.gp);
  assert.equal(readTree('rc_same').people[s.h.kid1].parent_family, s.fam.gp);
  assert.equal(treeMd5(other.id), otherBefore, '同树改父不写别的树');
});

test('跨树改父：世代上限（复用 maxDepth/depthOf 口径）→ 403 且两棵树都不写', async () => {
  const s = srcFamily('rc_depth_src');
  const d = mkDst('depth');
  writeTree(s.tree);
  writeTree(d.tree);
  const srcBefore = treeMd5('rc_depth_src');
  const dstBefore = treeMd5(d.id);
  await assert.rejects(
    () =>
      tw.reparentNode({
        treeId: 'rc_depth_src',
        personHandle: s.h.son,
        newParentRef: `I${9000 + dstSeq * 100}`,
        masterTreeId: 'zhonghua',
        maxDepth: 3,
        depthOf: () => 4, // 目标树基础深度已到 4 > 上限 3
      }),
    (e) => e.status === 403 && /世深度上限/.test(e.message),
  );
  assert.equal(treeMd5('rc_depth_src'), srcBefore);
  assert.equal(treeMd5(d.id), dstBefore);
});

test('跨树改父：拒绝总谱（源/目标）、始祖节点、镜像节点', async () => {
  writeTree({
    _schema: '1.0', tree_id: 'zhonghua', version: 2, founder_gramps_id: 'I0001',
    people: { mRoot: { handle: 'mRoot', gramps_id: 'I0001', name: '风伏羲', surname: '风', given: '伏羲', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [] } },
    families: {},
  });
  const d = mkDst('guard');
  writeTree(d.tree);
  const dBase = 9000 + dstSeq * 100; // 该目标树的真实编号基址（编号段随 mkDst 递增）
  const dBefore = treeMd5(d.id);
  // 源树必须真实存在（否则 reparentNode 一开始就读不到节点，验不到跨树守卫）
  const gs = srcFamily('rc_src');
  writeTree(gs.tree);
  const gsBefore = treeMd5('rc_src');

  // 目标 = 总谱
  await assert.rejects(
    () => tw.reparentNode({ treeId: 'rc_src', personHandle: 'rc_src-son', newParentRef: 'mRoot', targetTreeId: 'zhonghua', masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && /不可把节点迁入中华世本/.test(e.message),
  );
  // 源 = 总谱
  await assert.rejects(
    () => tw.reparentNode({ treeId: 'zhonghua', personHandle: 'mRoot', newParentRef: `I${dBase}`, targetTreeId: d.id, masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && /总谱/.test(e.message),
  );
  // 来源树不存在目标节点（防止误配 targetTreeId 时静默改错树）
  await assert.rejects(
    () => tw.reparentNode({ treeId: 'rc_src', personHandle: 'rc_src-son', newParentRef: 'I9000', targetTreeId: 'rc_dst_不存在', masterTreeId: 'zhonghua' }),
    (e) => /不存在/.test(e.message),
  );
  assert.equal(treeMd5('rc_src'), gsBefore, '拒绝时源树一字未写');
  assert.equal(treeMd5(d.id), dBefore, '拒绝时目标树一字未写');
});

test('跨树改父：迁移范围含始祖节点 / 含镜像节点 → 403 且两棵树不动', async () => {
  // 始祖：本树始祖在迁移范围内
  const f = srcFamily('rc_founder');
  const d1 = mkDst('founder');
  writeTree(f.tree);
  writeTree(d1.tree);
  const fBefore = treeMd5('rc_founder');
  const d1Before = treeMd5(d1.id);
  await assert.rejects(
    () =>
      tw.reparentNode({
        treeId: 'rc_founder',
        personHandle: f.h.son,
        newParentRef: `I${9000 + dstSeq * 100}`,
        masterTreeId: 'zhonghua',
      }),
    (e) => e.status === 403 && /始祖/.test(e.message),
  );
  assert.equal(treeMd5('rc_founder'), fBefore);
  assert.equal(treeMd5(d1.id), d1Before, '拒绝时目标树一字未写');

  // 镜像：要被迁移的节点本身是外树镜像
  writeTree({
    _schema: '1.0', tree_id: 'rc_mirror', version: 1,
    people: {
      'rc_mirror-real': { handle: 'rc_mirror-real', gramps_id: 'I0200', name: '本树真人', surname: '甲', given: '真人', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [] },
      'rc_mirror-m': { handle: 'rc_mirror-m', gramps_id: 'I0201', name: '外树镜像', surname: '乙', given: '镜像', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [], external_tree: 'rc_dst_guard', external_person_handle: 'x', external_link_type: 'marriage', external_mirror: 'true' },
    },
    families: {},
  });
  const d2 = mkDst('mirror');
  writeTree(d2.tree);
  await assert.rejects(
    () => tw.reparentNode({ treeId: 'rc_mirror', personHandle: 'rc_mirror-m', newParentRef: `I${9000 + dstSeq * 100}`, targetTreeId: d2.id, masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && /镜像/.test(e.message),
  );
});

// ================= 跨树改父：tree-meta 统计刷新 =================

test('跨树改父：tree-meta 统计字段（若存在）双侧刷新；无统计字段的条目不动；真源不变', async () => {
  const s = srcFamily('rc_stats_src');
  const d = mkDst('stats');
  d.id = 'rc_stats_dst';
  d.tree.tree_id = 'rc_stats_dst';
  // 目标树 meta 条目带统计字段（person_count/family_count）→ 迁移后应重算
  writeTree(s.tree);
  writeTree(d.tree);
  const r = await tw.reparentNode({
    treeId: 'rc_stats_src',
    personHandle: s.h.son,
    newParentRef: `I${9000 + dstSeq * 100}`,
    targetTreeId: 'rc_stats_dst',
    masterTreeId: 'zhonghua',
  });
  assert.equal(r.cross_tree, true);
  assert.equal(r.meta_stats_refreshed, true);

  const metaCopy = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  const dstEntry = metaCopy.trees.rc_stats_dst;
  const dstTreeNow = readTree('rc_stats_dst');
  assert.equal(dstEntry.person_count, Object.keys(dstTreeNow.people).length, '目标树人数刷新');
  assert.equal(dstEntry.family_count, Object.keys(dstTreeNow.families).length, '目标树家族数刷新');
  assert.equal(metaCopy.trees.rc_src.person_count, undefined, '无统计字段的条目绝不新增字段');
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');

  // 无统计字段时：不写 meta（幂等，避免污染真源结构）
  const again = await tw.refreshTreeMetaStats(['rc_src', 'rc_dst']);
  assert.equal(again, false);
});

// ================= 跨树改父：路由层 =================

test('路由 POST /admin/reparent（跨树）：200 + 双树落库；未登录 401', async () => {
  fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
  const phone = '16600000300';
  fs.writeFileSync(
    path.join(TMP, 'collections', 'jiazu_users.json'),
    JSON.stringify({ [phone]: { _id: phone, phone, nickname: '主理人', role: 'tree_steward' } }),
  );
  const s = srcFamily('rc_route_src');
  const d = mkDst('route');
  writeTree(s.tree);
  writeTree(d.tree);
  const token = signJwt({ sub: phone, phone, role: 'tree_steward' }, 3600);
  const refId = `I${9000 + dstSeq * 100}`;

  const anon = await handleRequest({
    path: '/admin/reparent', httpMethod: 'POST', headers: {},
    body: JSON.stringify({ tree_id: 'rc_route_src', person_handle: s.h.son, new_parent_id: refId, new_parent_tree_id: d.id }),
  });
  assert.equal(anon.statusCode, 401);

  const res = await handleRequest({
    path: '/admin/reparent', httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ tree_id: 'rc_route_src', person_handle: s.h.son, new_parent_id: refId, new_parent_tree_id: d.id }),
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.cross_tree, true);
  assert.equal(body.target_tree_id, d.id);
  assert.equal(body.moved_people, 4);
  assert.equal(readTree('rc_route_src').people[s.h.son], undefined);
  assert.ok(readTree(d.id).people[s.h.son], '目标树已落库');
  assert.equal(readTree('rc_route_src').version, 4);
  assert.equal(readTree(d.id).version, 3);

  // 同树改父：返回 cross_tree=false（回归）
  const same = await handleRequest({
    path: '/admin/reparent', httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ tree_id: 'rc_route_src', person_handle: s.h.wife, new_parent_id: s.h.gp }),
  });
  assert.equal(same.statusCode, 200);
  assert.equal(JSON.parse(same.body).cross_tree, false);
});

// ================= 真实数据副本 =================

test('真实数据副本：shen → ji 迁移「沈云琴」整支（含详情），真实 shen/ji 与详情零改动', async () => {
  for (const t of ['shen_27784_01', 'ji_23395_01']) {
    fs.copyFileSync(path.join(REAL_TREES, `${t}.json`), path.join(TMP, 'trees', `${t}.json`));
  }
  for (const f of fs.readdirSync(REAL_DETAILS)) {
    if (f.startsWith('shen_27784_01:') || f.startsWith('ji_23395_01:')) {
      fs.copyFileSync(path.join(REAL_DETAILS, f), path.join(TMP, 'details', f));
    }
  }
  const YQ = '103f95b876413b7835fdaa325fc5'; // 沈云琴 I0009（母）
  const QS = '103f95b876f8707f0386a907eb0b'; // 纪青森 I0011（子）
  const FAM_YQ = '103f95b876443dfbb3877d6712b'; // F0004：母 沈云琴 → 子 纪青森
  const FAM_QS = '103f95b876fe2713641471ed4f05'; // F0015：父 纪青森（无子女）
  const jiBefore = readTree('ji_23395_01');
  const jiTarget = Object.values(jiBefore.people).find((p) => p.gramps_id === 'I0001'); // 季志全（男，已有家族 F500020）
  const jiFam = '1305f76328532de23346f02b'; // F500020

  const r = await tw.reparentNode({
    treeId: 'shen_27784_01',
    personHandle: YQ,
    newParentRef: jiTarget.handle,
    targetTreeId: 'ji_23395_01',
    masterTreeId: 'zhonghua',
    maxDepth: 72,
    depthOf: () => 5, // 深度上限口径占位（真实 maxDepth=72 ≫ 5，不当人数用）
  });
  assert.equal(r.cross_tree, true);
  assert.equal(r.target_tree_id, 'ji_23395_01');
  assert.equal(r.moved_people, 2, '沈云琴 + 纪青森');
  assert.equal(r.moved_families, 1, 'F0004 随迁');
  assert.equal(r.parent_handle, jiTarget.handle);
  assert.equal(r.created_family, false, '复用季志全已有的家族 F500020');

  const shenAfter = readTree('shen_27784_01');
  const jiAfter = readTree('ji_23395_01');
  assert.equal(shenAfter.people[YQ], undefined);
  assert.equal(shenAfter.people[QS], undefined);
  assert.equal(shenAfter.families[FAM_YQ], undefined);
  assert.equal(shenAfter.families[FAM_QS], undefined, '纪青森留下的无子女家族一并清理');
  assert.ok(shenAfter.people['103f95b87734468f47e53dde8c70'], '其余节点不受影响');

  assert.equal(jiAfter.people[YQ].gramps_id, 'I500060', '按目标树编号段重分配（原 I0009）');
  assert.equal(jiAfter.people[QS].gramps_id, 'I500061');
  assert.equal(jiAfter.people[YQ].parent_family, jiFam, '挂到目标父「季志全」的家族下');
  assert.ok(jiAfter.families[jiFam].child_handles.includes(YQ));
  assert.equal(jiAfter.families[FAM_YQ].gramps_id, 'F500021', '随迁家族编号重分配');
  assert.equal(jiAfter.families[FAM_YQ].mother_handle, YQ);
  assert.deepEqual(jiAfter.families[FAM_YQ].child_handles, [QS]);
  assert.deepEqual(tw.checkTreeIntegrity(jiAfter), []);
  assert.deepEqual(tw.checkTreeIntegrity(shenAfter), []);

  // 详情随迁
  const d1 = readDetail('ji_23395_01', YQ);
  assert.ok(d1 && d1.tree_id === 'ji_23395_01' && d1.gramps_id === 'I500060', '沈云琴详情迁到 ji');
  assert.ok(readDetail('ji_23395_01', QS), '纪青森详情迁到 ji');
  assert.equal(readDetail('shen_27784_01', YQ), null, 'shen 侧旧详情删除');

  // 真实数据零改动
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
  for (const [f, h] of realTreesBaseline) assert.equal(md5(path.join(REAL_TREES, f)), h, `真实树 ${f} 被改动了`);
  for (const [f, h] of realDetailsBaseline) assert.equal(md5(path.join(REAL_DETAILS, f)), h, `真实详情 ${f} 被改动了`);
});

// ---- 收尾 ----

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/ 的 md5 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
  const treesNow = fs.readdirSync(REAL_TREES);
  assert.deepEqual(treesNow.sort(), [...realTreesBaseline.keys()].sort());
  for (const f of treesNow) assert.equal(md5(path.join(REAL_TREES, f)), realTreesBaseline.get(f), `真实树 ${f} 被改动了`);
  const detailsNow = fs.readdirSync(REAL_DETAILS);
  assert.deepEqual(detailsNow.sort(), [...realDetailsBaseline.keys()].sort());
  for (const f of detailsNow) assert.equal(md5(path.join(REAL_DETAILS, f)), realDetailsBaseline.get(f), `真实详情 ${f} 被改动了`);
});
