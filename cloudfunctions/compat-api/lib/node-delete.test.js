/**
 * 删除节点测试 — POST /admin/delete-node（逻辑见 lib/tree-write.js §删除节点）
 *
 * 两种口径：
 * - mode='subtree'（默认）：删除该节点及其全部子节点（后代整支）
 * - mode='promote'：仅删除本节点；配偶仍在 → 子女随配偶留原家族；唯一家长 → 子女上提一级
 *   （并入本人父母家族；本人是根 → 子女成为根）
 *
 * 跨家族树引用（Kevin 2026-09-16 硬口径）：待删子树内**任何**节点在其它家族树里存在指向它的
 * 外树指针（始祖挂载 / 世系链 / 跨树婚姻镜像 / 分迁登记 / 镜像节点）→ **一律拒绝删除**（409），
 * 绝不级联删除或修改对方树数据；拒绝时两棵树都不写。检查覆盖整个待删子树，不只根节点。
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本；文末用 md5 断言真实
 * migrate-output/ 与 config/tree-meta.json 逐字节未变（照 meta-guard.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/node-delete.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-node-delete-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaMd5 = md5(REAL_META);
const realTreesBaseline = new Map(fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]));
const realDetailsBaseline = new Map(fs.readdirSync(REAL_DETAILS).map((f) => [f, md5(path.join(REAL_DETAILS, f))]));

/** 测试用 tree-meta 副本（tree_id 与下面各用例造树一一对应） */
const metaFixture = {
  _schema: '1.1',
  trees: {
    zhonghua: {
      tree_id: 'zhonghua', kind: 'master', is_master: true, path_alias: '/zhonghua',
      surname_char: '华', display_title: '中华世本 · 全球华人家谱总谱',
    },
    nd_sub: { tree_id: 'nd_sub', kind: 'family', display_title: '甲氏测试家族（子树删除）' },
    nd_dry: { tree_id: 'nd_dry', kind: 'family', display_title: '乙氏测试家族（dry-run）' },
    nd_promote: { tree_id: 'nd_promote', kind: 'family', display_title: '丙氏测试家族（仅删本节点）' },
    nd_confirm: { tree_id: 'nd_confirm', kind: 'family', display_title: '丁氏测试家族（二次确认）' },
    nd_founder: {
      tree_id: 'nd_founder', kind: 'family', display_title: '戊氏测试家族（始祖）',
      founder_handle: 'nd_founder-son', founder_gramps_id: 'I0102', founder_name: '儿子',
    },
    nd_mirror: { tree_id: 'nd_mirror', kind: 'family', display_title: '己氏测试家族（镜像）' },
    nd_mirror_child: { tree_id: 'nd_mirror_child', kind: 'family', display_title: '庚氏测试家族（后代镜像）' },
    nd_ref_self: { tree_id: 'nd_ref_self', kind: 'family', display_title: '辛氏测试家族（被引用）' },
    nd_ref_other: { tree_id: 'nd_ref_other', kind: 'family', display_title: '壬氏测试家族（引用方）' },
    nd_ref_child: { tree_id: 'nd_ref_child', kind: 'family', display_title: '癸氏测试家族（后代被引用）' },
    nd_ref_child_other: { tree_id: 'nd_ref_child_other', kind: 'family', display_title: '子氏测试家族（引用后代）' },
    nd_ref_meta: { tree_id: 'nd_ref_meta', kind: 'family', display_title: '丑氏测试家族（meta 始祖登记）' },
    nd_ref_meta_upper: {
      tree_id: 'nd_ref_meta_upper', kind: 'family', display_title: '寅氏测试家族（始祖登记方）',
      founder_handle: 'nd_ref_meta-gk', founder_gramps_id: 'I0107', founder_name: '曾孙',
    },
    nd_route: { tree_id: 'nd_route', kind: 'family', display_title: '卯氏测试家族（路由）' },
    shen_27784_01: { tree_id: 'shen_27784_01', kind: 'family', display_title: '沈氏临沂家族（副本）' },
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

/**
 * 三代测试家族树：
 *   gp(祖父) ─ gm(祖母) → fam_gp → son(儿子 I0102) / son2(次子 I0108)
 *   son ─ wife(媳妇) → fam_son → kid1(孙子·叶) / kid2(孙次)
 *   kid2 ─ w2(孙媳) → fam_kid2 → gk(曾孙·叶)
 */
function familyFixture(id) {
  const h = {
    gp: `${id}-gp`, gm: `${id}-gm`, son: `${id}-son`, wife: `${id}-wife`,
    kid1: `${id}-kid1`, kid2: `${id}-kid2`, w2: `${id}-w2`, gk: `${id}-gk`, son2: `${id}-son2`,
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
        [h.gm]: { handle: h.gm, gramps_id: 'I0101', name: '祖母', surname: '乙', given: '祖母', gender: 'F', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.gp] },
        [h.son]: { handle: h.son, gramps_id: 'I0102', name: '儿子', surname: '甲', given: '儿子', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.gp, spouse_families: [fam.son] },
        [h.wife]: { handle: h.wife, gramps_id: 'I0103', name: '媳妇', surname: '丙', given: '媳妇', gender: 'F', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.son] },
        [h.kid1]: { handle: h.kid1, gramps_id: 'I0104', name: '孙子', surname: '甲', given: '孙子', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.son, spouse_families: [] },
        [h.kid2]: { handle: h.kid2, gramps_id: 'I0105', name: '孙次', surname: '甲', given: '孙次', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.son, spouse_families: [fam.kid2] },
        [h.w2]: { handle: h.w2, gramps_id: 'I0106', name: '孙媳', surname: '丁', given: '孙媳', gender: 'F', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [fam.kid2] },
        [h.gk]: { handle: h.gk, gramps_id: 'I0107', name: '曾孙', surname: '甲', given: '曾孙', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.kid2, spouse_families: [] },
        [h.son2]: { handle: h.son2, gramps_id: 'I0108', name: '次子', surname: '甲', given: '次子', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: fam.gp, spouse_families: [] },
      },
      families: {
        [fam.gp]: { handle: fam.gp, gramps_id: 'F0100', father_handle: h.gp, mother_handle: h.gm, child_handles: [h.son, h.son2] },
        [fam.son]: { handle: fam.son, gramps_id: 'F0101', father_handle: h.son, mother_handle: h.wife, child_handles: [h.kid1, h.kid2] },
        [fam.kid2]: { handle: fam.kid2, gramps_id: 'F0102', father_handle: h.kid2, mother_handle: h.w2, child_handles: [h.gk] },
      },
    },
  };
}

/** 极简树（只造人，不造家族）：用于「别的树里指向本树的指针」夹具 */
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

test('断代工具：整支 BFS 顺序 / 子树高度 / 节点世代', () => {
  const { tree, h, fam } = familyFixture('pure');
  assert.deepEqual(tw.lineageOrder(tree, h.son), [h.son, h.kid1, h.kid2, h.gk], 'BFS：本人 → 逐代');
  assert.deepEqual(tw.lineageOrder(tree, h.kid1), [h.kid1]);
  assert.equal(tw.subtreeHeight(tree, h.son), 3);
  assert.equal(tw.subtreeHeight(tree, h.kid1), 1);
  assert.equal(tw.subtreeHeight(tree, '不存在'), 0);
  assert.equal(tw.generationOf(tree, h.gp), 1);
  assert.equal(tw.generationOf(tree, h.son), 2);
  assert.equal(tw.generationOf(tree, h.gk), 4);
  assert.equal(tw.generationOf(tree, h.wife), 1, '外姓配偶无父母家族 → 根世代');
  // 目标父家族复用：祖父已有家族且另一槽位空 → 复用；无家族 → 新建
  const reuse = tw.ensureParentFamily(tree, h.gp);
  assert.equal(reuse.family.handle, fam.gp);
  assert.equal(reuse.created, false);
  const gmFixt = familyFixture('pure2');
  gmFixt.tree.people[gmFixt.h.son2].spouse_families = [];
  const created = tw.ensureParentFamily(gmFixt.tree, gmFixt.h.son2);
  assert.equal(created.created, true);
  assert.equal(created.family.father_handle, gmFixt.h.son2, '男 → 父亲位');
  assert.equal(created.family.gramps_id, 'F0103', '新建家族按既有编号段续号');
});

test('removePeopleFromTree：删人与家族侧引用清理一次到位，存活配偶登记同步清空', () => {
  const { tree, h, fam } = familyFixture('wipe');
  const r = tw.removePeopleFromTree(tree, new Set([h.son, h.kid1, h.kid2, h.gk]));
  assert.deepEqual(r.removed_people.sort(), [h.gk, h.kid1, h.kid2, h.son].sort());
  assert.deepEqual(r.removed_families.sort(), [fam.son, fam.kid2].sort(), '无子女且仅剩单亲的家族一并删除');
  assert.equal(tree.people[h.son], undefined);
  assert.deepEqual(tree.people[h.wife].spouse_families, [], '存活配偶不再指向已删家族');
  assert.deepEqual(tree.people[h.w2].spouse_families, []);
  assert.deepEqual(tree.families[fam.gp].child_handles, [h.son2], '祖辈家族只摘除被删子女');
  assert.equal(
    Object.values(tree.people).some((p) => (p.spouse_families || []).includes(fam.son)),
    false,
  );
  assert.deepEqual(tw.checkTreeIntegrity(tree), [], '删除后无悬空引用');
});

test('promoteChildrenUp：配偶仍在 → 子女随配偶留原家族；唯一家长 → 子女上提一级', () => {
  // ① 配偶仍在：家族保留，只清本节点槽位，子女 parent_family 不动
  const a = familyFixture('promo1');
  const ra = tw.promoteChildrenUp(a.tree, a.h.son);
  assert.deepEqual(ra.promoted, [], '配偶在 → 不触发上提');
  assert.equal(a.tree.people[a.h.son], undefined);
  assert.ok(a.tree.families[a.fam.son], '家族保留');
  assert.equal(a.tree.families[a.fam.son].father_handle, '', '被删节点槽位清空');
  assert.equal(a.tree.families[a.fam.son].mother_handle, a.h.wife);
  assert.deepEqual(a.tree.families[a.fam.son].child_handles, [a.h.kid1, a.h.kid2]);
  assert.equal(a.tree.people[a.h.kid1].parent_family, a.fam.son);
  assert.deepEqual(a.tree.families[a.fam.gp].child_handles, [a.h.son2]);
  assert.deepEqual(tw.checkTreeIntegrity(a.tree), []);

  // ② 唯一家长 + 本人有父母家族：子女并入本人父母家族（上提一级）
  const b = familyFixture('promo2');
  b.tree.families[b.fam.son].mother_handle = '';
  b.tree.people[b.h.wife].spouse_families = [];
  const rb = tw.promoteChildrenUp(b.tree, b.h.son);
  assert.deepEqual(rb.promoted.sort(), [b.h.kid1, b.h.kid2].sort());
  assert.equal(rb.moved_to_family, b.fam.gp);
  assert.equal(b.tree.families[b.fam.son], undefined, '唯一家长的原家族删除');
  assert.deepEqual(b.tree.families[b.fam.gp].child_handles, [b.h.son2, b.h.kid1, b.h.kid2]);
  assert.equal(b.tree.people[b.h.kid1].parent_family, b.fam.gp);
  assert.deepEqual(tw.checkTreeIntegrity(b.tree), []);

  // ③ 本人是根（无父母家族）：子女成为根
  const c = familyFixture('promo3');
  c.tree.families[c.fam.gp].mother_handle = '';
  c.tree.people[c.h.gm].spouse_families = [];
  const rc = tw.promoteChildrenUp(c.tree, c.h.gp);
  assert.deepEqual([...rc.promoted].sort(), [c.h.son2, c.h.son].sort());
  assert.equal(rc.moved_to_family, '');
  assert.equal(c.tree.families[c.fam.gp], undefined);
  assert.equal(c.tree.people[c.h.son].parent_family, '', '子女成为根');
  assert.deepEqual(tw.checkTreeIntegrity(c.tree), [], '根子女的悬空引用已清');
});

test('checkTreeIntegrity / repairTreeRefs：悬空引用可检出并可修复', () => {
  const { tree, h, fam } = familyFixture('repair');
  delete tree.people[h.kid2]; // 制造悬空：fam_son.child_handles、gk.parent_family
  const problems = tw.checkTreeIntegrity(tree);
  assert.ok(problems.length >= 2, `应检出悬空引用，实际：${JSON.stringify(problems)}`);
  assert.ok(problems.some((p) => p.includes(h.kid2)));
  const report = tw.repairTreeRefs(tree);
  assert.ok(report.child_handles >= 1, '家族子女列表修复计数');
  assert.ok(report.family_parents >= 1, '家族父/母槽悬空修复计数');
  assert.deepEqual(tw.checkTreeIntegrity(tree), []);
  assert.equal(tree.families[fam.kid2].father_handle, '', '被删者占用的家长槽清空');
  assert.equal(tree.people[h.gk].parent_family, fam.kid2, '父母家族仍在 → 子女挂靠不动');
  // 家族整体消失时，孤儿的 parent_family 才置空
  delete tree.families[fam.kid2];
  const again = tw.repairTreeRefs(tree);
  assert.ok(again.parent_family >= 1);
  assert.equal(tree.people[h.gk].parent_family, '', '孤儿的 parent_family 置空');
  assert.deepEqual(tree.families[fam.son].child_handles, [h.kid1]);
});

// ================= 删除：subtree 模式 =================

test('删子树（无跨树引用）：本人及全部后代、连带的空家族、详情一并删除；版本 +1', async () => {
  const f = familyFixture('nd_sub');
  writeTree(f.tree);
  writeDetail({ _id: 'nd_sub:' + f.h.son, tree_id: 'nd_sub', handle: f.h.son, gramps_id: 'I0102', name: '儿子', events: [{ handle: 'e1', type: 'Birth' }], attributes: [], media: [], citations: [], notes: [] });
  writeDetail({ _id: 'nd_sub:' + f.h.gk, tree_id: 'nd_sub', handle: f.h.gk, gramps_id: 'I0107', name: '曾孙', events: [], attributes: [] });

  const r = await tw.deleteNode({ treeId: 'nd_sub', personHandle: f.h.son, masterTreeId: 'zhonghua' });
  assert.equal(r.mode, 'subtree');
  assert.equal(r.people_count, 4, '本人 + 3 个后代');
  assert.equal(r.families_count, 2, '连带删除两个空家族');
  assert.equal(r.external_ref_count, 0);
  assert.equal(r.dry_run, false);
  assert.match(r.message, /已删除/);
  assert.match(r.message, /及其全部后代共 4 人（含 2 个家族记录）/, 'subtree 措辞统一为「全部后代」');
  assert.ok(!/全部子节点/.test(r.message), '不再说「全部子节点」（实际删的是整支后代）');

  const after = readTree('nd_sub');
  for (const h of [f.h.son, f.h.kid1, f.h.kid2, f.h.gk]) assert.equal(after.people[h], undefined, `${h} 应被删除`);
  assert.equal(after.families[f.fam.son], undefined);
  assert.equal(after.families[f.fam.kid2], undefined);
  assert.deepEqual(after.families[f.fam.gp].child_handles, [f.h.son2]);
  assert.ok(after.people[f.h.wife] && after.people[f.h.w2], '留原树的配偶保留');
  assert.deepEqual(after.people[f.h.wife].spouse_families, []);
  assert.equal(after.version, 4, '写一次版本 +1');
  assert.equal(readDetail('nd_sub', f.h.son), null, '详情随人删除');
  assert.equal(readDetail('nd_sub', f.h.gk), null);
});

test('dry-run 只统计不写：人数/家族数/文案齐备，树文件逐字节不变', async () => {
  const f = familyFixture('nd_dry');
  writeTree(f.tree);
  const before = treeMd5('nd_dry');
  const r = await tw.deleteNode({ treeId: 'nd_dry', personHandle: f.h.son, masterTreeId: 'zhonghua', dryRun: true });
  assert.equal(r.dry_run, true);
  assert.equal(r.people_count, 4);
  assert.equal(r.families_count, 2);
  assert.equal(r.people.length, 4);
  assert.deepEqual(r.people.map((p) => p.gramps_id).sort(), ['I0102', 'I0104', 'I0105', 'I0107']);
  assert.match(r.message, /不可恢复/, '二次确认文案写明人数与不可恢复');
  assert.match(r.message, /将删除「[^」]+」及其全部后代共 4 人（含 2 个家族记录），不可恢复/);
  assert.equal(treeMd5('nd_dry'), before, 'dry-run 不得写树');
});

test('promote 模式（仅删本节点）：子女随配偶留在原家族，后代不受影响', async () => {
  const f = familyFixture('nd_promote');
  writeTree(f.tree);
  writeDetail({ _id: 'nd_promote:' + f.h.son, tree_id: 'nd_promote', handle: f.h.son, gramps_id: 'I0102', name: '儿子', events: [], attributes: [] });

  // 先 dry_run：0 人上提时文案必须写「子女留在原家族」，不得出现「其 0 个子节点上提一级」
  const dry = await tw.deleteNode({ treeId: 'nd_promote', personHandle: f.h.son, mode: 'promote', masterTreeId: 'zhonghua', dryRun: true });
  assert.equal(dry.promoted_count, 0);
  assert.match(dry.message, /子女留在原家族（配偶健在时只清本人槽位）/, 'dry_run 文案与行为一致');
  assert.ok(!/0 个子节点上提一级/.test(dry.message), '不得输出「其 0 个子节点上提一级」');

  const r = await tw.deleteNode({ treeId: 'nd_promote', personHandle: f.h.son, mode: 'promote', masterTreeId: 'zhonghua' });
  assert.equal(r.mode, 'promote');
  assert.equal(r.people_count, 1);
  assert.equal(r.promoted_count, 0, '配偶仍在 → 子女不触发上提');
  assert.match(r.message, /子女留在原家族（配偶健在时只清本人槽位）/, '成功文案与行为一致');
  assert.ok(!/子节点上提一级/.test(r.message), '0 人上提时不得出现「上提一级」文案');
  const after = readTree('nd_promote');
  assert.equal(after.people[f.h.son], undefined);
  assert.ok(after.people[f.h.kid1] && after.people[f.h.kid2] && after.people[f.h.gk], '子孙全部保留');
  assert.equal(after.families[f.fam.son].father_handle, '');
  assert.equal(after.people[f.h.kid1].parent_family, f.fam.son);
  assert.equal(readDetail('nd_promote', f.h.son), null);
});

test('promote 模式：唯一家长 → 子节点上提一级（并入本人父母家族）', async () => {
  const g = familyFixture('nd_promote3');
  g.tree.families[g.fam.son].mother_handle = '';
  writeTree(g.tree);

  const res = await tw.deleteNode({ treeId: 'nd_promote3', personHandle: g.h.son, mode: 'promote', masterTreeId: 'zhonghua' });
  assert.equal(res.promoted_count, 2);
  assert.deepEqual(res.promoted_children.map((p) => p.name).sort(), ['孙子', '孙次'].sort());
  const after = readTree('nd_promote3');
  assert.equal(after.families[g.fam.son], undefined);
  assert.deepEqual(after.families[g.fam.gp].child_handles, [g.h.son2, g.h.kid1, g.h.kid2]);
  assert.equal(after.people[g.h.kid1].parent_family, g.fam.gp);
  assert.equal(after.people[g.h.kid2].parent_family, g.fam.gp);
  assert.match(res.message, /子节点上提一级：2 人（并入父母的家族）/, '上提文案写明人数与去向');
});

test('二次确认：confirm_count 与实际人数不一致 → 409 且不写树', async () => {
  const f = familyFixture('nd_confirm');
  writeTree(f.tree);
  const before = treeMd5('nd_confirm');
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'nd_confirm', personHandle: f.h.son, masterTreeId: 'zhonghua', confirmCount: 2 }),
    (e) => e.status === 409 && /请重新确认/.test(e.message),
  );
  assert.equal(treeMd5('nd_confirm'), before);
  // 正确人数可过
  const r = await tw.deleteNode({ treeId: 'nd_confirm', personHandle: f.h.son, masterTreeId: 'zhonghua', confirmCount: 4 });
  assert.equal(r.people_count, 4);
});

// ================= 删除：拒绝口径 =================

test('拒绝：总谱（中华世本）节点不可删除（tree_id 命中与 meta kind=master 两条路径）', async () => {
  writeTree({
    _schema: '1.0', tree_id: 'zhonghua', version: 2, founder_gramps_id: 'I0001',
    people: { mRoot: { handle: 'mRoot', gramps_id: 'I0001', name: '风伏羲', surname: '风', given: '伏羲', gender: 'M', birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [] } },
    families: {},
  });
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'zhonghua', personHandle: 'mRoot', masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && /总谱/.test(e.message),
  );
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'zhonghua', personHandle: 'mRoot', masterTreeId: '' }),
    (e) => e.status === 403 && /总谱/.test(e.message),
    'meta kind=master 同样拒绝',
  );
});

test('拒绝：删除范围包含本树始祖节点 → 403（请先重置始祖）', async () => {
  const f = familyFixture('nd_founder');
  writeTree(f.tree);
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'nd_founder', personHandle: f.h.son, masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && /始祖/.test(e.message),
  );
  const after = readTree('nd_founder');
  assert.ok(after.people[f.h.son], '拒绝时不写树');
});

test('拒绝：镜像节点本身不可删；删除范围内含镜像节点也不可删', async () => {
  // ① 本身是跨树婚姻镜像
  writeTree(simpleTree('nd_mirror', {
    'nd_mirror-ji': { gramps_id: 'I0001', name: '季志全', gender: 'M', external_tree: 'nd_ref_other', external_person_handle: 'real-1', external_link_type: 'marriage', external_mirror: true },
  }));
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'nd_mirror', personHandle: 'nd_mirror-ji', masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && /镜像/.test(e.message),
  );

  // ② 后代是其它树真身的镜像 → 整支也不可删
  const f = familyFixture('nd_mirror_child');
  f.tree.people[f.h.gk].external_mirror = 'true';
  f.tree.people[f.h.gk].external_tree = 'nd_ref_other';
  f.tree.people[f.h.gk].external_person_handle = 'real-2';
  f.tree.people[f.h.gk].external_link_type = 'child';
  writeTree(f.tree);
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'nd_mirror_child', personHandle: f.h.son, masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && /镜像/.test(e.message),
  );
  assert.ok(readTree('nd_mirror_child').people[f.h.gk], '拒绝时两棵树都不写');
});

test('①② 跨树引用：自身被外树引用 / 子树内后代被外树引用 → 409 拒绝，双方树文件逐字节不变', async () => {
  // ① 自身被引用（跨树婚姻镜像）
  const a = familyFixture('nd_ref_self');
  writeTree(a.tree);
  writeTree(simpleTree('nd_ref_other', {
    'nd_ref_other-mirror': { gramps_id: 'I500005', name: '甲儿子镜像', gender: 'M', external_tree: 'nd_ref_self', external_person_handle: a.h.son, external_link_type: 'marriage', external_mirror: true },
  }));
  const selfBefore = treeMd5('nd_ref_self');
  const otherBefore = treeMd5('nd_ref_other');
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'nd_ref_self', personHandle: a.h.son, masterTreeId: 'zhonghua' }),
    (e) =>
      e.status === 409 &&
      /其它家族树中存在关联/.test(e.message) &&
      /解除关系后再删除/.test(e.message) &&
      e.message.includes('壬氏测试家族（引用方）') &&
      e.message.includes('甲儿子镜像'),
  );
  assert.equal(treeMd5('nd_ref_self'), selfBefore, '源树不得被写');
  assert.equal(treeMd5('nd_ref_other'), otherBefore, '对方树绝不级联修改');

  // ② 子树内某个后代被引用（根节点自己没被引用）→ 整支拒绝
  const b = familyFixture('nd_ref_child');
  writeTree(b.tree);
  writeTree(simpleTree('nd_ref_child_other', {
    'nd_ref_child_other-mirror': { gramps_id: 'I500006', name: '甲曾孙镜像', gender: 'M', external_tree: 'nd_ref_child', external_person_handle: b.h.gk, external_link_type: 'child', external_mirror: true },
  }));
  const childBefore = treeMd5('nd_ref_child');
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'nd_ref_child', personHandle: b.h.son, masterTreeId: 'zhonghua' }),
    (e) => e.status === 409 && /甲曾孙镜像/.test(e.message),
  );
  assert.equal(treeMd5('nd_ref_child'), childBefore);
  // ③ 无跨树引用（叶子孙子不在任何外树指针里）→ 正常删除
  const ok = await tw.deleteNode({ treeId: 'nd_ref_child', personHandle: b.h.kid1, masterTreeId: 'zhonghua' });
  assert.equal(ok.people_count, 1);
  assert.equal(readTree('nd_ref_child').people[b.h.kid1], undefined);
});

test('拒绝：被其它树 tree-meta 登记为始祖真身（无反指针兜底）→ 409', async () => {
  const f = familyFixture('nd_ref_meta');
  writeTree(f.tree);
  const before = treeMd5('nd_ref_meta');
  await assert.rejects(
    () => tw.deleteNode({ treeId: 'nd_ref_meta', personHandle: f.h.son, masterTreeId: 'zhonghua' }),
    (e) => e.status === 409 && e.message.includes('寅氏测试家族（始祖登记方）'),
  );
  assert.equal(treeMd5('nd_ref_meta'), before);
});

// ================= 删除：路由层 =================

test('路由 POST /admin/delete-node：鉴权/权限/成功删除/dry-run/跨树引用 409', async () => {
  fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
  const phone = '16600000200';
  fs.writeFileSync(
    path.join(TMP, 'collections', 'jiazu_users.json'),
    JSON.stringify({
      [phone]: { _id: phone, phone, nickname: '主理人', role: 'tree_steward' },
      '16600000201': { _id: '16600000201', phone: '16600000201', nickname: '游客', role: 'guest' },
    }),
  );
  const f = familyFixture('nd_route');
  writeTree(f.tree);
  // P1 竹片闸门：路由扣费前账上须有竹片（本用例删 4 人 = 12 片，预置 100 片）
  const { mutateAssets } = await import('./economy-ledger.js');
  await mutateAssets(phone, (u) => {
    u.bamboos = [
      {
        id: 'bl_nd_route',
        qty: 100,
        expires_at: new Date(Date.now() + 100 * 86400000).toISOString(),
        source: 'admin',
        created_at: new Date().toISOString(),
      },
    ];
  });
  const token = signJwt({ sub: phone, phone, role: 'tree_steward' }, 3600);
  const call = (body, headers) =>
    handleRequest({ path: '/admin/delete-node', httpMethod: 'POST', headers: headers || {}, body: JSON.stringify(body) });

  // 未登录 → 401
  const anon = await call({ tree_id: 'nd_route', person_handle: f.h.son });
  assert.equal(anon.statusCode, 401);

  // 游客 → 403
  const guestToken = signJwt({ sub: '16600000201', phone: '16600000201', role: 'guest' }, 3600);
  const guest = await call({ tree_id: 'nd_route', person_handle: f.h.son }, { authorization: `Bearer ${guestToken}` });
  assert.equal(guest.statusCode, 403);

  // dry-run → 200，只统计
  const dry = await call(
    { tree_id: 'nd_route', person_handle: f.h.son, dry_run: true },
    { authorization: `Bearer ${token}` },
  );
  assert.equal(dry.statusCode, 200);
  const dryBody = JSON.parse(dry.body);
  assert.equal(dryBody.dry_run, true);
  assert.equal(dryBody.people_count, 4);
  assert.equal(dryBody.fee.pieces, 12, 'P1：dry_run 免费但须带 fee（3 片 × 4 人）供前端拼确认文案');
  assert.equal(dryBody.fee.unit, 'bamboos');
  assert.ok(readTree('nd_route').people[f.h.son], 'dry-run 不写');

  // 正式删除（confirm_count 匹配）→ 200
  const ok = await call(
    { tree_id: 'nd_route', person_handle: f.h.son, mode: 'subtree', confirm_count: 4 },
    { authorization: `Bearer ${token}` },
  );
  assert.equal(ok.statusCode, 200);
  const body = JSON.parse(ok.body);
  assert.equal(body.people_count, 4);
  assert.equal(body.fee.pieces, 12, 'P1：正式提交扣 3 片 × 4 人 = 12 片');
  assert.equal(body.fee.balance_after, 88, 'P1：fee.balance_after = 扣后余量');
  assert.equal(readTree('nd_route').people[f.h.son], undefined);

  // 跨树引用 → 409（带上涉及树与节点名）
  const g = familyFixture('nd_ref_self');
  writeTree(g.tree);
  const res = await call(
    { tree_id: 'nd_ref_self', person_handle: g.h.son },
    { authorization: `Bearer ${token}` },
  );
  assert.equal(res.statusCode, 409);
  assert.match(JSON.parse(res.body).error, /其它家族树中存在关联/);
});

// ================= 真实数据副本 =================

test('真实数据副本：shen 树删「沈云琴」子树 → 副本 2 人 2 家族与详情一并删除，真实数据零改动', async () => {
  for (const f of fs.readdirSync(REAL_TREES)) {
    if (f === 'shen_27784_01.json') {
      fs.copyFileSync(path.join(REAL_TREES, f), path.join(TMP, 'trees', f));
    }
  }
  for (const f of fs.readdirSync(REAL_DETAILS)) {
    if (f.startsWith('shen_27784_01:')) {
      fs.copyFileSync(path.join(REAL_DETAILS, f), path.join(TMP, 'details', f));
    }
  }
  const YQ = '103f95b876413b7835fdaa325fc5'; // 沈云琴 I0009
  const QS = '103f95b876f8707f0386a907eb0b'; // 纪青森 I0011
  const FAM_YQ = '103f95b876443dfbb3877d6712b'; // F0004：母 沈云琴 → 子 纪青森
  const FAM_QS = '103f95b876fe2713641471ed4f05'; // F0015：父 纪青森（无子女）
  const before = JSON.parse(fs.readFileSync(path.join(TMP, 'trees', 'shen_27784_01.json'), 'utf8'));
  assert.ok(before.people[YQ] && before.people[QS]);

  const r = await tw.deleteNode({ treeId: 'shen_27784_01', personHandle: YQ, masterTreeId: 'zhonghua' });
  assert.equal(r.people_count, 2, '沈云琴 + 纪青森');
  assert.equal(r.families_count, 2, 'F0004（无家长无子女）与 F0015（父被删、无子女）');
  const after = readTree('shen_27784_01');
  assert.equal(after.people[YQ], undefined);
  assert.equal(after.people[QS], undefined);
  assert.equal(after.families[FAM_YQ], undefined);
  assert.equal(after.families[FAM_QS], undefined);
  assert.equal(after.people['103f95b87734468f47e53dde8c70'].name, '沈廷如', '其余节点不受影响');
  assert.equal(readDetail('shen_27784_01', YQ), null, '详情随人删除（副本内）');
  assert.ok(fs.existsSync(path.join(REAL_DETAILS, `shen_27784_01:${YQ}.json`)), '真实详情文档仍在');

  // 真实数据逐字节未变
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
  for (const [f, h] of realTreesBaseline) assert.equal(md5(path.join(REAL_TREES, f)), h, `真实树 ${f} 被改动了`);
  for (const [f, h] of realDetailsBaseline) assert.equal(md5(path.join(REAL_DETAILS, f)), h, `真实详情 ${f} 被改动了`);
});

// ---- 收尾：整轮跑完真源必须一模一样 ----

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/ 的 md5 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
  const treesNow = fs.readdirSync(REAL_TREES);
  assert.deepEqual(treesNow.sort(), [...realTreesBaseline.keys()].sort(), '真实树目录文件名/数量变了');
  for (const f of treesNow) assert.equal(md5(path.join(REAL_TREES, f)), realTreesBaseline.get(f), `真实树 ${f} 被改动了`);
  const detailsNow = fs.readdirSync(REAL_DETAILS);
  assert.deepEqual(detailsNow.sort(), [...realDetailsBaseline.keys()].sort(), '真实详情目录变了');
  for (const f of detailsNow) assert.equal(md5(path.join(REAL_DETAILS, f)), realDetailsBaseline.get(f), `真实详情 ${f} 被改动了`);
});
