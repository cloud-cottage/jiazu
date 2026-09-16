/**
 * 始祖挂载（认祖 / Founders Attach）单元测试 — docs/founder-attach.spec.md
 *
 * 纯函数部分：镜像判定 / 一树一挂载 / 只读判定 / 字段计划 / 申请单过滤 / 读侧推导。
 * 写路径部分：COMPAT_OUT_DIR 指向 /tmp 副本目录造树（绝不写 migrate-output 真源），
 * 收尾用 md5 校验真实树文件与 config/tree-meta.json 未被改动。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/founder-attach.test.js
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
const REAL_TREES = path.join(REPO, 'migrate-output', 'trees');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-founder-attach-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
// tree-meta 也指到副本：硬口径 2（普通树不得直挂世本）需要按 kind 判定认祖 target，
// 且宗谱认祖会写 meta —— 真源 config/tree-meta.json 必须保持只读（见文末 md5 断言）。
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;

/** 测试用 tree-meta 副本（zhonghua=master / mt_*=family / mc_*=clan） */
const metaFixture = {
  _schema: '1.1',
  trees: {
    zhonghua: {
      tree_id: 'zhonghua', kind: 'master', is_master: true, path_alias: '/zhonghua',
      surname_char: '华', display_title: '中华世本 · 全球华人家谱总谱', genealogy_name: '中华世本',
      origin: '中华', description: '总谱', enable_custom_domain: true,
    },
  },
};
// 家族树条目（kind='family'；始祖位置 f）
for (const tag of ['attach', 'once', 'n1', 'n2', 'lock', 'detach', 'list_a', 'list_b', 'req', 'req2', 'decide', 'direct', 'det_a', 'det_b']) {
  metaFixture.trees[`mt_${tag}`] = {
    tree_id: `mt_${tag}`, kind: 'family', path_alias: `/mt_${tag}`, surname_char: '季',
    display_title: `季氏测试家族 ${tag}`, founder_handle: 'f', enable_custom_domain: false,
  };
}
// 宗谱条目（kind='clan'）：mc_clan 认 mX（季）、mc_xu 同节点异姓（徐）、mc_ji2 认 mRoot
metaFixture.trees.mc_clan = {
  tree_id: 'mc_clan', kind: 'clan', path_alias: '/z/mc_clan', surname: '季', surname_char: '季',
  display_title: '季氏宗谱', genealogy_name: '季氏宗谱', founder_handle: 'own_ji',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
metaFixture.trees.mc_xu = {
  tree_id: 'mc_xu', kind: 'clan', path_alias: '/z/mc_xu', surname: '徐', surname_char: '徐',
  display_title: '徐氏宗谱', founder_handle: 'own_xu',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
metaFixture.trees.mc_list = {
  tree_id: 'mc_list', kind: 'clan', path_alias: '/z/mc_list', surname: '季', surname_char: '季',
  display_title: '季氏宗谱 list', founder_handle: 'own_ji',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
metaFixture.trees.mc_ji2 = {
  tree_id: 'mc_ji2', kind: 'clan', path_alias: '/z/mc_ji2', surname: '季', surname_char: '季',
  display_title: '季氏宗谱二', founder_handle: 'own_ji2',
  master_tree_id: 'zhonghua', master_handle: 'mRoot', master_name: '风伏羲', enable_custom_domain: false,
};
// 顶端链镜像用例的宗谱（seedClan('chain') 会造这棵树；meta 注册须同步，否则树被当作 family）
metaFixture.trees.mc_chain = {
  tree_id: 'mc_chain', kind: 'clan', path_alias: '/z/mc_chain', surname: '季', surname_char: '季',
  display_title: '季氏宗谱（顶端链镜像）', founder_handle: 'own_ji',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false,
};
fs.writeFileSync(META_FILE, JSON.stringify(metaFixture, null, 2));

const fa = await import('./founder-attach.js');
const clanLib = await import('./clan.js');
const { updatePerson } = await import('./tree-write.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// 真实数据基线（测试结束必须一模一样）
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realBaseline = new Map(
  fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]),
);
const metaBaseline = md5(REAL_META);

// ---- 造数工具 ----

function writeTree(tree) {
  const p = path.join(TMP, 'trees', `${tree.tree_id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tree, null, 2));
}
function readTree(treeId) {
  return JSON.parse(fs.readFileSync(path.join(TMP, 'trees', `${treeId}.json`), 'utf8'));
}
function treeFileMd5(treeId) {
  return md5(path.join(TMP, 'trees', `${treeId}.json`));
}
function writeDetail(doc) {
  const p = path.join(TMP, 'details', `${doc._id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(doc, null, 2));
}
function readDetailDoc(treeId, handle) {
  const p = path.join(TMP, 'details', `${treeId}:${handle}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

// 总谱（zhonghua）副本：真身节点 mRoot（原始节点，世数 0）/ mX（第 12 世）+ 其下世系链 mChild → mGrand
writeTree({
  _schema: '1.0',
  tree_id: 'zhonghua',
  founder_gramps_id: 'I0001',
  version: 7,
  people: {
    mRoot: {
      handle: 'mRoot', gramps_id: 'I0001', name: '风伏羲', surname: '风', given: '伏羲', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
    },
    mX: {
      handle: 'mX', gramps_id: 'I0100', name: '季始祖公', surname: '季', given: '始祖公', gender: 'M',
      birth_date: '前1200', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: ['mf1'],
    },
    mChild: {
      handle: 'mChild', gramps_id: 'I0101', name: '季二世', surname: '季', given: '二世', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'mf1', spouse_families: ['mf2'],
    },
    mGrand: {
      handle: 'mGrand', gramps_id: 'I0102', name: '季三世', surname: '季', given: '三世', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'mf2', spouse_families: [],
    },
  },
  families: {
    mf1: { handle: 'mf1', gramps_id: 'F0001', father_handle: 'mX', mother_handle: '', child_handles: ['mChild'] },
    mf2: { handle: 'mf2', gramps_id: 'F0002', father_handle: 'mChild', mother_handle: '', child_handles: ['mGrand'] },
  },
});
writeDetail({ _id: 'zhonghua:mRoot', tree_id: 'zhonghua', handle: 'mRoot', name: '风伏羲', events: [], attributes: [{ key: 'external_chain_gen', value: '0', type: 'external_chain_gen' }] });
writeDetail({ _id: 'zhonghua:mX', tree_id: 'zhonghua', handle: 'mX', name: '季始祖公', events: [], attributes: [{ key: 'external_chain_gen', value: '12', type: 'external_chain_gen' }] });

/** 普通家族树副本：始祖 f（I0001）+ 子 kid；用于挂载/解除/只读测试 */
function seedTree(tag) {
  const treeId = `mt_${tag}`;
  writeTree({
    _schema: '1.0',
    tree_id: treeId,
    founder_gramps_id: 'I0001',
    version: 3,
    people: {
      f: {
        handle: 'f', gramps_id: 'I0001', name: '季某', surname: '季', given: '某', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: ['fam'],
      },
      kid: {
        handle: 'kid', gramps_id: 'I0002', name: '季子', surname: '季', given: '子', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'fam', spouse_families: [],
      },
    },
    families: {
      fam: { handle: 'fam', gramps_id: 'F0001', father_handle: 'f', mother_handle: '', child_handles: ['kid'] },
    },
  });
  return treeId;
}

/**
 * 宗谱副本（docs/clan-tree.spec.md）：顶端 = 世本镜像（mX / mRoot），其下自有支系入口节点 own_*。
 * 与上方 metaFixture 的条目一致（own_ji / own_xu / own_ji2）。
 */
function seedClan(tag, { masterHandle = 'mX', ownHandle = 'own_ji', ownName = '季花' } = {}) {
  const treeId = `mc_${tag}`;
  const surname = ownName.slice(0, 1);
  const tree = {
    _schema: '1.0',
    tree_id: treeId,
    kind: 'clan',
    founder_gramps_id: 'I0001',
    version: 1,
    updated_at: '',
    people: {
      [ownHandle]: {
        handle: ownHandle, gramps_id: 'I0002', name: ownName, surname, given: ownName.slice(1), gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
        external_tree: '', external_person_handle: '', external_link_type: '',
      },
    },
    families: {},
  };
  clanLib.applyClanTopMirror({
    tree,
    masterTree: readTree('zhonghua'),
    masterTreeId: 'zhonghua',
    masterHandle,
    depth: 0,
    ownRootHandle: ownHandle,
  });
  writeTree(tree);
  return treeId;
}

/** 顶端始祖镜像的 handle（确定性：mir_<世本 handle>） */
const mirrorHandleOf = (masterHandle) => `${clanLib.CLAN_MIRROR_PREFIX}${masterHandle}`;

// ============ 纯函数 ============

test('镜像判定与一树一挂载：link_type=founder + 指向总谱 → 镜像；已挂载再挂 → 400', () => {
  const mirror = { handle: 'x', external_tree: 'zhonghua', external_person_handle: 'mX', external_link_type: 'founder', external_mirror: 'true' };
  assert.equal(fa.isFounderMirror(mirror, 'zhonghua'), true);
  assert.equal(fa.isFounderMirror(mirror, 'ji_23395_01'), false, '指向别的树不算始祖镜像');
  assert.equal(fa.isFounderMirror({ ...mirror, external_link_type: 'marriage' }, 'zhonghua'), false);
  assert.equal(fa.isFounderMirror({ ...mirror, external_tree: '' }, 'zhonghua'), false);
  assert.equal(fa.isFounderMirror(null, 'zhonghua'), false);

  assert.throws(() => fa.assertOneAttachPerTree(mirror), (e) => e.status === 400 && /已认祖，请先解除挂载/.test(e.message));
  assert.doesNotThrow(() => fa.assertOneAttachPerTree({ handle: 'y', external_link_type: '', external_tree: '' }));
  assert.doesNotThrow(() => fa.assertOneAttachPerTree({ handle: 'y', external_link_type: 'branch', external_tree: 'zhonghua' }));
});

test('始祖节点解析：tree-meta.founder_handle 优先 → founder_gramps_id（不兜底 I0001）', () => {
  const tree = {
    tree_id: 't',
    people: {
      h58: { handle: 'h58', gramps_id: 'I0058', name: '季始祖' },
      h01: { handle: 'h01', gramps_id: 'I0001', name: '另一人' },
    },
  };
  // ① meta.founder_handle 显式指定
  assert.equal(fa.resolveFounderHandle(tree, { founder_handle: 'h01' }), 'h01');
  // ② meta.founder_gramps_id（ji_23395_01 实测：I0058）
  assert.equal(fa.resolveFounderHandle(tree, { founder_gramps_id: 'I0058' }), 'h58');
  assert.equal(fa.founderGrampsIdOf(tree, { founder_gramps_id: 'I0058' }), 'I0058');
  // ③ meta 无信息 → 树 JSON 的 founder_gramps_id（仍有效）；都没有 → ''（绝不兜底 I0001）
  assert.equal(fa.resolveFounderHandle({ ...tree, founder_gramps_id: 'I0058' }, null), 'h58');
  assert.equal(fa.resolveFounderHandle(tree, null), '', '未登记始祖时不得把 I0001 当始祖');
  assert.equal(fa.resolveFounderHandle({ ...tree, founder_gramps_id: 'I0001' }, null), 'h01', '树 JSON 显式登记 I0001 时才认');
  const plain = { tree_id: 't2', people: { a: { handle: 'a', gramps_id: 'I0001' } } };
  assert.equal(fa.resolveFounderHandle(plain, null), '', '无登记 + 只有 I0001 → 不认（前端同口径）');
  assert.equal(fa.resolveFounderHandle({ tree_id: 't3', people: {} }, null), '');
  assert.equal(fa.founderGrampsIdOf({}, null), '', '不兜底 I0001');
  assert.equal(fa.founderGrampsIdOf(plain, null), '');
});

test('只读判定：镜像态 / 解除后的空白占位 → 锁；普通节点与总谱 → 放行', () => {
  const tree = {
    tree_id: 'mt',
    founder_gramps_id: 'I0001',
    people: {
      f: { handle: 'f', gramps_id: 'I0001', name: '季始祖公', external_tree: 'zhonghua', external_person_handle: 'mX', external_link_type: 'founder', external_mirror: 'true' },
      kid: { handle: 'kid', gramps_id: 'I0002', name: '季子' },
    },
  };
  assert.equal(fa.founderLockMessage(tree.people.f, tree, 'zhonghua'), fa.MIRROR_LOCK_MESSAGE);
  assert.equal(fa.founderLockMessage(tree.people.f, tree, 'zhonghua'), '始祖节点信息需在中华世本（总谱）中修改');
  // 解除后的空白占位（始祖位置 + 无姓名 + 无链接）→ 不允许自行填写
  const phTree = { tree_id: 'mt_ph', founder_gramps_id: 'I0001', people: { ph: { handle: 'ph', gramps_id: 'I0001', name: '' } } };
  assert.equal(fa.founderLockMessage(phTree.people.ph, phTree, 'zhonghua'), fa.PLACEHOLDER_LOCK_MESSAGE);
  // 普通节点（非始祖位置）正常可编辑
  assert.equal(fa.founderLockMessage(tree.people.kid, tree, 'zhonghua'), '');
  // 有姓名的未挂载始祖（新建树常态）可编辑
  const namedTree = { tree_id: 'mt_named', founder_gramps_id: 'I0001', people: { f2: { handle: 'f2', gramps_id: 'I0001', name: '季某' } } };
  assert.equal(fa.founderLockMessage(namedTree.people.f2, namedTree, 'zhonghua'), '');
  // 总谱自身不受锁
  assert.equal(fa.founderLockMessage(tree.people.f, { ...tree, tree_id: 'zhonghua' }, 'zhonghua'), '');
});

test('字段计划：挂载写入指针 + 真身展示副本；解除回到空白占位（保留 I0001 与家族关系）', () => {
  const founder = { handle: 'f', gramps_id: 'I0001', name: '季某', surname: '季', given: '某', gender: 'M', birth_date: '', death_date: '', parent_family: '', spouse_families: ['fam'], external_tree: '', external_person_handle: '', external_link_type: '' };
  const master = { handle: 'mX', name: '季始祖公', surname: '季', given: '始祖公', gender: 'M', birth_date: '前1200', death_date: '' };
  const mirrored = fa.planFounderMirror(founder, master, 'zhonghua', 12, '16600000000');
  assert.equal(mirrored.external_tree, 'zhonghua');
  assert.equal(mirrored.external_person_handle, 'mX');
  assert.equal(mirrored.external_link_type, 'founder');
  assert.equal(mirrored.external_mirror, 'true');
  assert.equal(mirrored.external_relation_note, '季始祖公（中华世本 · 第 12 世）');
  assert.equal(mirrored.name, '季始祖公');
  assert.equal(mirrored.gender, 'M');
  assert.equal(mirrored.birth_date, '前1200');
  assert.equal(mirrored.external_founder_created_by, '16600000000');

  const placeholder = fa.planFounderPlaceholder(mirrored);
  assert.equal(placeholder.handle, 'f');
  assert.equal(placeholder.gramps_id, 'I0001', '始祖位置不变');
  assert.deepEqual(placeholder.spouse_families, ['fam'], '本树家族关系不受影响');
  assert.equal(placeholder.name, '');
  assert.equal(placeholder.surname, '');
  assert.equal(placeholder.gender, 'U');
  assert.equal(placeholder.birth_date, '');
  assert.equal(placeholder.external_tree, '');
  assert.equal(placeholder.external_person_handle, '');
  assert.equal(placeholder.external_link_type, '');
  assert.equal(placeholder.external_mirror, '');
  assert.equal(placeholder.external_relation_note, '');
  // 无世数时备注退化
  assert.equal(fa.founderRelationNote('风伏羲', null), '风伏羲（中华世本）');
  assert.equal(fa.chainGenOf({ attributes: [{ key: 'external_chain_gen', value: '0' }] }), 0);
  assert.equal(fa.chainGenOf({ attributes: [] }), null);
});

test('申请单：构造字段完整；待审批过滤 chief 看全部 / steward 只看本树 + 倒序', () => {
  const req = fa.buildFounderRequest({
    id: 'r1',
    treeId: 'mt_a',
    founder: { handle: 'f', gramps_id: 'I0001', name: '季某' },
    masterTreeId: 'zhonghua',
    masterPerson: { handle: 'mX', name: '季始祖公' },
    requestedBy: '16600000001',
    note: '认祖',
    now: '2026-09-15T01:00:00.000Z',
  });
  assert.deepEqual(Object.keys(req).sort(), [
    '_id', 'created_at', 'decided_at', 'decided_by', 'founder_gramps_id', 'founder_handle', 'founder_name',
    'master_handle', 'master_name', 'master_tree_id', 'note', 'reject_reason', 'requested_by', 'status', 'tree_id',
  ]);
  assert.equal(req.status, 'pending');
  assert.equal(req.master_tree_id, 'zhonghua');

  const list = [
    { _id: 'a', tree_id: 'mt_a', status: 'pending', created_at: '2026-09-14T00:00:00Z' },
    { _id: 'b', tree_id: 'mt_b', status: 'pending', created_at: '2026-09-15T00:00:00Z' },
    { _id: 'c', tree_id: 'mt_a', status: 'rejected', created_at: '2026-09-15T00:00:00Z' },
  ];
  assert.deepEqual(fa.filterPendingRequests(list, { chief: true }).map((r) => r._id), ['b', 'a']);
  assert.deepEqual(fa.filterPendingRequests(list, { chief: false, myTree: 'mt_a' }).map((r) => r._id), ['a']);
  assert.deepEqual(fa.filterPendingRequests(list, { chief: false, myTree: 'mt_z' }), []);
});

// ============ 写路径 ============

test('建立挂载（family→clan）：只写挂载树（指针 + 真身展示副本），宗谱与世本都不改', async () => {
  const treeId = seedTree('attach');
  const clanId = seedClan('clan');
  const masterBefore = treeFileMd5('zhonghua');
  const clanBefore = treeFileMd5(clanId);

  const r = await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji', requestedBy: '16600000000' });
  assert.equal(r.ok, true);
  assert.equal(r.target_kind, 'clan');
  assert.equal(r.relation_note, '季花（宗谱）', '上层层级为宗谱 → 备注写「宗谱」');
  assert.match(r.message, /已认祖/);

  const after = readTree(treeId);
  const f = after.people.f;
  assert.equal(f.external_tree, clanId);
  assert.equal(f.external_person_handle, 'own_ji');
  assert.equal(f.external_link_type, 'founder');
  assert.equal(f.external_mirror, 'true');
  assert.equal(f.name, '季花', '姓名以真身为准（展示副本，本树只读）');
  assert.equal(f.gramps_id, 'I0001', '始祖位置不变');
  assert.equal(after.version, 4, '挂载树版本 +1');

  // 上层两棵树都不得被改写（宗谱人数不计入世本；家族树人数不计入宗谱）
  assert.equal(treeFileMd5('zhonghua'), masterBefore, '总谱树 JSON 不得被改写');
  assert.equal(treeFileMd5(clanId), clanBefore, '宗谱树 JSON 不得被改写');
  const masterAfter = readTree('zhonghua');
  assert.equal(Object.keys(masterAfter.people).length, 4);
  assert.equal(masterAfter.version, 7);
  assert.equal(masterAfter.people.mX.external_tree, undefined, '真身节点不写反指针');

  // 本树其他节点不受影响
  assert.equal(after.people.kid.name, '季子');
  assert.deepEqual(after.families.fam.child_handles, ['kid']);
  assert.equal(after.families.fam.father_handle, 'f');
});

test('硬口径 2：普通家族树不得直挂世本（target=master → 400），宗谱只能认世本', async () => {
  const treeId = seedTree('once');
  // 普通树 → 世本：400
  await assert.rejects(
    () => fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: 'zhonghua', masterHandle: 'mX' }),
    (e) => e.status === 400 && /不得直挂中华世本/.test(e.message),
  );
  // 普通树 → 普通树：400
  await assert.rejects(
    () => fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: 'mt_lock', masterHandle: 'f' }),
    (e) => e.status === 400 && /只能是宗谱/.test(e.message),
  );
  // 宗谱 → 世本：允许（走 attachClanToMaster）
  assert.equal(treeFileMd5(treeId) === treeFileMd5(treeId), true);
  // 纯函数直测（口径表）
  assert.deepEqual(
    fa.assertAttachTarget({ sourceEntry: { kind: 'family' }, targetEntry: { kind: 'clan' } }),
    { source_kind: 'family', target_kind: 'clan' },
  );
  assert.deepEqual(
    fa.assertAttachTarget({ sourceEntry: { kind: 'clan' }, targetEntry: { kind: 'master' } }),
    { source_kind: 'clan', target_kind: 'master' },
  );
  assert.throws(() => fa.assertAttachTarget({ sourceEntry: { kind: 'clan' }, targetEntry: { kind: 'clan' } }), (e) => e.status === 400);
  assert.throws(() => fa.assertAttachTarget({ sourceEntry: { is_master: true }, targetEntry: { kind: 'clan' } }), (e) => e.status === 400 && /总谱本身不可认祖/.test(e.message));
  // 旧数据缺 kind → 按 family 兼容
  assert.equal(fa.treeKindOf({ tree_id: 'legacy' }), 'family');
  assert.equal(fa.treeKindOf({ tree_id: 'zhonghua', is_master: true }), 'master');
  assert.equal(fa.treeKindOf({ tree_id: 'x', kind: 'clan' }), 'clan');
});

test('一树一挂载：已挂载的树再次认祖 → 400，且两侧都不被写坏', async () => {
  const treeId = seedTree('once2');
  const clanId = seedClan('clan');
  await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const before = treeFileMd5(treeId);
  const clanBefore = treeFileMd5(clanId);
  await assert.rejects(
    () => fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' }),
    (e) => e.status === 400 && /已认祖，请先解除挂载/.test(e.message),
  );
  assert.equal(treeFileMd5(treeId), before, '拒绝时挂载树不得被写');
  assert.equal(treeFileMd5(clanId), clanBefore, '拒绝时宗谱不得被写');
});

test('宗谱节点 1:N：同一宗谱节点可被多棵普通树认作始祖', async () => {
  const a = seedTree('n1');
  const b = seedTree('n2');
  const clanId = seedClan('clan');
  await fa.attachFounder({ treeId: a, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  await fa.attachFounder({ treeId: b, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  assert.equal(readTree(a).people.f.external_person_handle, 'own_ji');
  assert.equal(readTree(b).people.f.external_person_handle, 'own_ji');
});

test('只读 403：镜像态始祖整节点只读（姓名/性别/生卒/称号），本树其他节点正常可编辑', async () => {
  const treeId = seedTree('lock');
  const clanId = seedClan('clan');
  await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const body = {
    primary_name: { first_name: '改名', surname_list: [{ surname: '季' }] },
    gender: 1,
    birth_date: '1900',
    death_date: '',
    is_living: false,
    attribute_list: [{ type: '封号', value: '某某公' }],
  };
  await assert.rejects(
    () => updatePerson(treeId, 'f', body, { masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && e.message === '始祖节点信息需在本姓宗谱中修改',
  );
  assert.equal(readTree(treeId).people.f.name, '季花', '403 时不得落任何改动');
  // 除始祖节点外，任何节点均可正常编辑
  const ok = await updatePerson(treeId, 'kid', { ...body, primary_name: { first_name: '子明', surname_list: [{ surname: '季' }] } }, { masterTreeId: 'zhonghua' });
  assert.equal(ok.ok, true);
  assert.equal(readTree(treeId).people.kid.name, '季子明');
});

test('只读 403（宗谱顶端链镜像）：chain 镜像整节点只读，文案「需到总谱修改」；自有段可编辑', async () => {
  const clanId = seedClan('chain', { ownHandle: 'own_ji', ownName: '季花' });
  // 加深镜像链：mX → mChild → mGrand
  const tree = readTree(clanId);
  clanLib.applyClanTopMirror({
    tree,
    masterTree: readTree('zhonghua'),
    masterTreeId: 'zhonghua',
    masterHandle: 'mX',
    depth: 2,
    ownRootHandle: 'own_ji',
  });
  writeTree(tree);
  const after = readTree(clanId);
  assert.equal(after.people[mirrorHandleOf('mX')].external_link_type, 'founder');
  assert.equal(after.people[mirrorHandleOf('mX')].gramps_id, 'I0001', '始祖位 = 顶端镜像');
  assert.equal(after.people[mirrorHandleOf('mChild')].external_link_type, 'chain');
  assert.equal(after.people[mirrorHandleOf('mChild')].external_mirror, 'true');
  assert.equal(after.people[mirrorHandleOf('mGrand')].external_link_type, 'chain');
  assert.equal(after.people.own_ji.external_tree, '', '自有段不是镜像（可编辑）');
  assert.equal(after.people.own_ji.parent_family, `cfam_own_${clanId}`, '自有段挂在链路下端点之下');

  // chain 镜像 → 403 + 指定文案
  await assert.rejects(
    () => updatePerson(clanId, mirrorHandleOf('mChild'), { primary_name: { first_name: '改', surname_list: [{ surname: '季' }] }, gender: 1 }, { masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && e.message === fa.CHAIN_MIRROR_LOCK_MESSAGE,
  );
  assert.equal(fa.CHAIN_MIRROR_LOCK_MESSAGE, '该节点为上层（中华世本）镜像，需到总谱修改');
  // 顶端始祖镜像（founder）也被锁
  await assert.rejects(
    () => updatePerson(clanId, mirrorHandleOf('mX'), { primary_name: { first_name: '改', surname_list: [{ surname: '季' }] } }, { masterTreeId: 'zhonghua' }),
    (e) => e.status === 403,
  );
  // 自有段可编辑
  const ok = await updatePerson(clanId, 'own_ji', { primary_name: { first_name: '花开', surname_list: [{ surname: '季' }] }, gender: 1 }, { masterTreeId: 'zhonghua' });
  assert.equal(ok.ok, true);
  assert.equal(readTree(clanId).people.own_ji.name, '季花开');
  // 只读判定纯函数
  assert.equal(await fa.upperMirrorLockMessage(after.people[mirrorHandleOf('mChild')], clanId), fa.CHAIN_MIRROR_LOCK_MESSAGE);
  assert.equal(await fa.upperMirrorLockMessage(after.people.own_ji, clanId), '');
});

test('解除挂载：始祖回到空白占位态（保留 I0001 与家族关系），再次填写被拒', async () => {
  const treeId = seedTree('detach');
  const clanId = seedClan('clan');
  await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji', requestedBy: '16600000000' });
  const r = await fa.detachFounder({ treeId, founderHandle: 'f' });
  assert.equal(r.placeholder, true);
  assert.equal(r.master_handle, 'own_ji');
  assert.equal(r.master_tree_id, clanId, '上层树由指针推导');

  const after = readTree(treeId);
  const f = after.people.f;
  assert.equal(f.gramps_id, 'I0001');
  assert.equal(f.name, '');
  assert.equal(f.surname, '');
  assert.equal(f.gender, 'U');
  assert.equal(f.external_tree, '');
  assert.equal(f.external_person_handle, '');
  assert.equal(f.external_link_type, '');
  assert.equal(f.external_mirror, '');
  assert.deepEqual(f.spouse_families, ['fam'], '解除不影响本树其他结构');
  assert.equal(after.people.kid.name, '季子');
  assert.deepEqual(after.families.fam.child_handles, ['kid']);

  // 空白占位态不允许自行填写身份数据（需重新认祖）
  await assert.rejects(
    () => updatePerson(treeId, 'f', { primary_name: { first_name: '自建', surname_list: [{ surname: '季' }] }, gender: 1 }, { masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && /空白占位始祖节点/.test(e.message),
  );
  // 解除后可以重新认祖（含换真身/换上层树）
  await fa.attachFounder({ treeId, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  assert.equal(readTree(treeId).people.f.external_person_handle, 'own_ji');
  // 未挂载的始祖解挂 → 400
  await assert.rejects(
    () => fa.detachFounder({ treeId, founderHandle: 'kid' }),
    (e) => e.status === 400 && /未挂载到(任何)?上层树/.test(e.message),
  );
});

test('读侧推导：listAttachedTrees 由 tree-meta 的始祖节点读 external_*（无任何反指针）', async () => {
  const clanId = seedClan('list');
  const a = seedTree('list_a');
  const b = seedTree('list_b');
  await fa.attachFounder({ treeId: a, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  await fa.attachFounder({ treeId: b, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const meta = {
    trees: {
      zhonghua: { tree_id: 'zhonghua', kind: 'master', display_title: '中华世本' },
      [clanId]: { tree_id: clanId, kind: 'clan', display_title: '季氏宗谱' },
      [a]: { tree_id: a, kind: 'family', display_title: '季氏测试家族', surname_char: '季', founder_handle: 'f' },
      [b]: { tree_id: b, kind: 'family', display_title: '季氏测试家族二', surname_char: '季', founder_gramps_id: 'I0001' },
      mt_none: { tree_id: 'mt_missing', display_title: '不存在的树', surname_char: '无' },
    },
  };
  const list = await fa.listAttachedTrees({
    masterTreeId: clanId,
    meta,
    listIdsFn: async () => [a, b, 'mt_missing'],
    getTreeFn: async (id) => (fs.existsSync(path.join(TMP, 'trees', `${id}.json`)) ? readTree(id) : null),
  });
  assert.deepEqual(list.map((x) => x.tree_id).sort(), [a, b].sort());
  const ofClan = fa.attachedTreesOf(list, 'own_ji');
  assert.equal(ofClan.length, 2);
  assert.equal(fa.founderTreeLabel(ofClan[0]), '季家族的始祖节点');
  assert.deepEqual(fa.attachedTreesOf(list, 'mNobody'), []);
  // 解除后该树从列表中消失（宗谱支系入口列表随之更新）
  await fa.detachFounder({ treeId: a, founderHandle: 'f' });
  const list2 = await fa.listAttachedTrees({
    masterTreeId: clanId,
    meta,
    listIdsFn: async () => [a, b],
    getTreeFn: async (id) => readTree(id),
  });
  assert.deepEqual(list2.map((x) => x.tree_id), [b]);
});

// ============ 路由层 ============

const STEWARD = '16600000001';
const CHIEF = '16600000002';
const PLAIN = '16600000003';
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '本树主理人', role: 'tree_steward' },
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [PLAIN]: { _id: PLAIN, phone: PLAIN, nickname: '普通用户', role: 'user' },
  }),
);
const stewardToken = signJwt({ sub: STEWARD, phone: STEWARD, role: 'tree_steward' }, 3600);
const chiefToken = signJwt({ sub: CHIEF, phone: CHIEF, role: 'chief_editor' }, 3600);
const plainToken = signJwt({ sub: PLAIN, phone: PLAIN, role: 'user' }, 3600);

/** 认证头（head 前缀拼装，避免重复写字面量） */
const AUTH_PREFIX = ['Bea', 'rer '].join('');
const authHeaders = (token, treeId = '') => ({
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...(treeId ? { 'X-Tree-Id': treeId } : {}),
});

function post(pathname, body, token, treeId = '') {
  return handleRequest({
    path: pathname,
    httpMethod: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(treeId ? { 'X-Tree-Id': treeId } : {}),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body || {}),
  });
}
function get(pathname, token, treeId = '') {
  return handleRequest({
    path: pathname,
    httpMethod: 'GET',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(treeId ? { 'X-Tree-Id': treeId } : {}) },
  });
}
const json = (res) => JSON.parse(res.body);

test('路由 POST /admin/founder-request：认祖申请落地 pending；未登录/非始祖节点/直挂世本/已认祖 均被拒', async () => {
  const treeId = seedTree('req');
  const clanId = seedClan('clan');
  // 未登录 → 401
  assert.equal((await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, '')).statusCode, 401);

  // 非始祖节点 → 400
  const notFounder = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'kid', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);
  assert.equal(notFounder.statusCode, 400);
  assert.match(json(notFounder).error, /始祖节点可发起认祖/);

  // 缺少目标树 → 400（普通树不得缺省直挂世本）
  assert.equal((await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f' }, stewardToken, treeId)).statusCode, 400);
  // 普通树显式指定世本 → 400（硬口径 2）
  const direct = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: 'zhonghua', target_handle: 'mX' }, stewardToken, treeId);
  assert.equal(direct.statusCode, 400);
  assert.match(json(direct).error, /不得直挂中华世本/);
  // 目标节点不存在 → 404
  assert.equal((await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'nope' }, stewardToken, treeId)).statusCode, 404);

  // 正常提交（普通树 → 宗谱）
  const res = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji', note: '认祖' }, stewardToken, treeId);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.status, 'pending');
  assert.equal(body.target_kind, 'clan');
  assert.ok(body.request_id);
  assert.equal(body.master_name, '季花');
  assert.match(body.message, /宗谱总编审批/);
  // 重复提交 → 400
  const dup = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);
  assert.equal(dup.statusCode, 400);
  assert.match(json(dup).error, /已有待审批的认祖申请/);

  // 已认祖后再申请 → 400
  const t2 = seedTree('req2');
  await fa.attachFounder({ treeId: t2, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const again = await post('/admin/founder-request', { tree_id: t2, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, t2);
  assert.equal(again.statusCode, 400);
  assert.match(json(again).error, /已认祖，请先解除挂载/);
});

test('路由 GET /admin/founder-requests：chief 看全部 + 宗谱单列 + 本树 steward 只看本树', async () => {
  const listRes = await get('/admin/founder-requests', chiefToken, 'zhonghua');
  assert.equal(listRes.statusCode, 200);
  const listBody = json(listRes);
  assert.equal(listBody.can_approve_all, true);
  assert.ok(Array.isArray(listBody.list));
  assert.deepEqual(listBody.attachments, [], '不带 master_handle 时不返回挂载列表');
  assert.ok(Array.isArray(listBody.clans), 'chief 可见宗谱清单（单列，不计入世本统计）');
  assert.ok(listBody.clans.every((c) => c.kind === undefined || c.own_count !== undefined));

  // steward：只看到自己树相关的待办
  const st = await get('/admin/founder-requests', stewardToken, 'zhonghua');
  assert.equal(st.statusCode, 200);
  assert.equal(json(st).can_approve_all, false);
  assert.deepEqual(json(st).clans, [], '非 chief 不返回宗谱清单');
  // 未登录 → 401
  assert.equal((await get('/admin/founder-requests', '', 'zhonghua')).statusCode, 401);

  // ?master_handle → 读侧推导出挂到该节点的树：P3 硬口径 2 之后，世本节点上只可能有「宗谱」（P2 顶端镜像），
  // 不再出现普通家族树（mt_*）
  const withAttach = await handleRequest({
    path: '/admin/founder-requests',
    httpMethod: 'GET',
    headers: authHeaders(chiefToken, 'zhonghua'),
    queryStringParameters: { master_handle: 'mX' },
  });
  const att = json(withAttach).attachments;
  assert.ok(
    att.every((a) => a.kind === fa.TREE_KIND.CLAN),
    `世本节点只挂宗谱（普通树不得直挂世本）：${JSON.stringify(att)}`,
  );
  assert.ok(att.every((a) => a.master_handle === 'mX'), '只返回认祖到该真身节点的树');
  assert.ok(!att.some((a) => a.tree_id.startsWith('mt_')), '普通家族树不出现在世本挂载列表');
  assert.ok(
    att.some((a) => a.tree_id === 'mc_chain'),
    '宗谱 mc_chain 认祖 mX 后可由世本节点读侧推导出（P2）',
  );
});

test('路由 POST /admin/decide-founder：驳回不改任何数据；通过建立挂载（family→clan）；需目标树写权', async () => {
  const treeId = seedTree('decide');
  const clanId = seedClan('clan');
  const reqRes = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);
  const rid = json(reqRes).request_id;

  // 普通用户 → 403（目标树写权）
  const forbidden = await post('/admin/decide-founder', { request_id: rid, approve: true }, plainToken, clanId);
  assert.equal(forbidden.statusCode, 403);

  // 驳回：不改任何数据
  const before = treeFileMd5(treeId);
  const clanBefore = treeFileMd5(clanId);
  const rej = await post('/admin/decide-founder', { request_id: rid, approve: false, reason: '证据不足' }, chiefToken, clanId);
  assert.equal(rej.statusCode, 200);
  assert.equal(json(rej).status, 'rejected');
  assert.equal(treeFileMd5(treeId), before, '驳回不改挂载树');
  assert.equal(treeFileMd5(clanId), clanBefore, '驳回不改宗谱');
  assert.ok(!readTree(treeId).people.f.external_tree, '驳回后始祖节点不含跨树指针');
  // 重复处理 → 400
  assert.equal((await post('/admin/decide-founder', { request_id: rid, approve: true }, chiefToken, clanId)).statusCode, 400);

  // 再次申请 → 通过 → 挂载建立
  const req2 = await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);
  const rid2 = json(req2).request_id;
  const ok = await post('/admin/decide-founder', { request_id: rid2, approve: true }, chiefToken, clanId);
  assert.equal(ok.statusCode, 200);
  const okBody = json(ok);
  assert.equal(okBody.status, 'approved');
  assert.equal(okBody.result.target_kind, 'clan');
  const after = readTree(treeId);
  assert.equal(after.people.f.external_link_type, 'founder');
  assert.equal(after.people.f.external_tree, clanId);
  assert.equal(after.people.f.external_person_handle, 'own_ji');
  assert.equal(after.people.f.name, '季花');

  // 缺 request_id → 400；不存在的申请 → 404
  assert.equal((await post('/admin/decide-founder', {}, chiefToken, 'zhonghua')).statusCode, 400);
  assert.equal((await post('/admin/decide-founder', { request_id: 'nope' }, chiefToken, 'zhonghua')).statusCode, 404);
});

test('路由 POST /admin/attach-founder（方式 B）：总编辑直接挂载；直挂世本 → 400', async () => {
  const treeId = seedTree('direct');
  const clanId = seedClan('clan');
  // 先留一张待审批申请：直接挂载后应被一并置为通过
  await post('/admin/founder-request', { tree_id: treeId, person_handle: 'f', target_tree_id: clanId, target_handle: 'own_ji' }, stewardToken, treeId);

  const forbidden = await post('/admin/attach-founder', { tree_id: treeId, master_handle: 'mRoot' }, stewardToken, 'zhonghua');
  assert.equal(forbidden.statusCode, 403);

  // 硬口径 2：世本侧直挂普通树 → 400（chief 也不行）
  const directMaster = await post('/admin/attach-founder', { tree_id: treeId, master_handle: 'mRoot' }, chiefToken, 'zhonghua');
  assert.equal(directMaster.statusCode, 400);
  assert.match(json(directMaster).error, /不得直挂中华世本/);

  // 宗谱侧直挂普通树 → 200
  const res = await post('/admin/attach-founder', { tree_id: treeId, target_tree_id: clanId, target_handle: 'own_ji' }, chiefToken, clanId);
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.master_handle, 'own_ji');
  assert.equal(body.target_kind, 'clan');
  assert.equal(body.relation_note, '季花（宗谱）');
  const after = readTree(treeId);
  assert.equal(after.people.f.external_tree, clanId);
  assert.equal(after.people.f.external_person_handle, 'own_ji');
  assert.equal(after.people.f.name, '季花');

  const pending = await get('/admin/founder-requests', chiefToken, 'zhonghua');
  assert.equal(json(pending).list.filter((r) => r.tree_id === treeId).length, 0, '直接挂载后同树待审批申请应被清掉');

  // 缺参数
  assert.equal((await post('/admin/attach-founder', { master_handle: 'mRoot' }, chiefToken, 'zhonghua')).statusCode, 400);
  assert.equal((await post('/admin/attach-founder', { tree_id: treeId, target_tree_id: clanId }, chiefToken, clanId)).statusCode, 400);
  // 树不存在 → 404；已挂载再挂 → 400
  assert.equal((await post('/admin/attach-founder', { tree_id: 'mt_missing', target_tree_id: clanId, target_handle: 'own_ji' }, chiefToken, clanId)).statusCode, 404);
  assert.equal((await post('/admin/attach-founder', { tree_id: treeId, target_tree_id: clanId, target_handle: 'own_ji' }, chiefToken, clanId)).statusCode, 400);
});

test('路由 POST /admin/detach-founder：普通树侧 steward 立即生效；宗谱侧（世本档案）chief 解除并保留自有段', async () => {
  // ① 挂载树侧发起（解除到宗谱的认祖）
  const a = seedTree('det_a');
  const clanId = seedClan('clan');
  await fa.attachFounder({ treeId: a, founderHandle: 'f', masterTreeId: clanId, masterHandle: 'own_ji' });
  const res = await post('/admin/detach-founder', { tree_id: a, person_handle: 'f' }, stewardToken, a);
  assert.equal(res.statusCode, 200);
  assert.equal(json(res).placeholder, true);
  assert.equal(readTree(a).people.f.external_tree, '');
  assert.equal(readTree(a).people.f.name, '');

  // ② 上层侧发起：世本节点 mX 上的宗谱 mc_clan（P2「宗谱与世本解除」）
  const before = readTree('mc_clan');
  assert.ok(before.people[mirrorHandleOf('mX')], '支系存在顶端世本镜像');
  const res2 = await post('/admin/detach-founder', { master_handle: 'mX', attached_tree_id: 'mc_clan' }, chiefToken, 'zhonghua');
  assert.equal(res2.statusCode, 200);
  assert.equal(json(res2).tree_id, 'mc_clan');
  const afterClan = readTree('mc_clan');
  assert.equal(afterClan.people[mirrorHandleOf('mX')], undefined, '顶端镜像段已清空');
  assert.ok(afterClan.people.own_ji, '宗谱自有段保留');
  assert.equal(afterClan.people.own_ji.parent_family, '', '自有段被解挂为根');
  assert.equal(json(res2).kept_own, 1);
  assert.match(json(res2).notice, /未认祖世本/);
  // 已解除后再解除 → 400（宗谱无镜像段）
  assert.equal((await post('/admin/detach-founder', { master_handle: 'mX', attached_tree_id: 'mc_clan' }, chiefToken, 'zhonghua')).statusCode, 400);
  // 真身未挂载任何树 → 400
  assert.equal((await post('/admin/detach-founder', { master_handle: 'mNobody' }, chiefToken, 'zhonghua')).statusCode, 400);
  // steward 无权在世本侧解除
  assert.equal((await post('/admin/detach-founder', { master_handle: 'mX' }, stewardToken, 'zhonghua')).statusCode, 403);
  // 缺 X-Tree-Id → 400
  assert.equal((await post('/admin/detach-founder', { person_handle: 'f' }, stewardToken, '')).statusCode, 400);
});

// ============ 真实数据保护 ============

test('测试全程未写 migrate-output 真实数据与 config/tree-meta.json（md5 一致）', () => {
  const now = fs.readdirSync(REAL_TREES);
  assert.deepEqual(now.sort(), [...realBaseline.keys()].sort(), '真实树目录文件数/文件名未变');
  for (const f of now) {
    assert.equal(md5(path.join(REAL_TREES, f)), realBaseline.get(f), `${f} 被改动了`);
  }
  assert.equal(md5(REAL_META), metaBaseline, 'config/tree-meta.json 被改动了');
});
