/**
 * 「重置始祖后重新认祖」测试 — 无始祖态（tree-meta.founder_state==='none'）
 *
 * 缺口（本文件回归的对象）：重置始祖后前端会在**任意节点**显示「⛩ 认祖」（person-archive 的
 * founderMissing 分支），但后端认祖入口守卫仍按老口径解析「始祖位置」并硬兜底 'I0001' ——
 * 于是像 **gu_39038_01**（真实数据：22 人、编号 I0035…I0073、始祖 顾清学 I0070、树里根本没有
 * I0001、meta 为 founder_state='none'）这样的树，用户从任意节点发起认祖会被 400 拒绝。
 *
 * 现口径：
 * - 无始祖态（founder_state='none'）→ **该树任意节点**均可发起认祖；认祖成功时在同一次写入里
 *   回写 tree-meta 的 founder_handle / founder_gramps_id / founder_name = 被指定节点，
 *   并删除 founder_state（语义：无始祖时的认祖 = 指定始祖；宗谱同理）。
 * - 已有登记始祖 → 仍只允许始祖节点发起（其他节点 400）。
 * - 不再兜底 'I0001'：未登记始祖的树不得把 I0001 当始祖（与前端 isFounderNode 同口径）。
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本；文末用 md5 断言真实
 * migrate-output/ 与 config/tree-meta.json 逐字节未变（照 reset-founder.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/founder-reattach.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-founder-reattach-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;

/**
 * 测试用 tree-meta 副本。gu_family* 全部复刻真实 gu_39038_01 的形状：
 * **没有 I0001**、始祖是 I0070 顾清学、meta 为 founder_state='none'。
 */
const metaFixture = {
  _schema: '1.1',
  trees: {
    zhonghua: {
      tree_id: 'zhonghua', kind: 'master', is_master: true, path_alias: '/zhonghua',
      surname_char: '华', display_title: '中华世本 · 全球华人家谱总谱',
    },
    // 已有登记始祖的宗谱（负例：非始祖节点不得发起认祖）
    gu_clan: {
      tree_id: 'gu_clan', kind: 'clan', path_alias: '/z/gu_clan', surname: '顾', surname_char: '顾',
      display_title: '顾氏宗谱', founder_handle: 'own_gu', founder_gramps_id: 'I0002',
      founder_name: '顾清学', master_tree_id: 'zhonghua', master_handle: 'mGu', master_name: '顾始祖',
    },
    // 重置后的宗谱（无始祖态）
    gu_clan_r: {
      tree_id: 'gu_clan_r', kind: 'clan', path_alias: '/z/gu_clan_r', surname: '顾', surname_char: '顾',
      display_title: '顾氏宗谱（重置后）', founder_state: 'none',
    },
    // 重置后的普通家族树（无始祖态）
    gu_family: {
      tree_id: 'gu_family', kind: 'family', path_alias: '/gu_family', display_title: '顾氏家族',
      founder_state: 'none',
    },
    // 已有登记始祖的普通家族树
    gu_family_reg: {
      tree_id: 'gu_family_reg', kind: 'family', path_alias: '/gu_family_reg', display_title: '顾氏家族（已登记始祖）',
      founder_handle: 'h70', founder_gramps_id: 'I0070', founder_name: '顾清学',
    },
    // 路由 / 端到端用例：重置后待认祖的家族树
    gu_family_r: {
      tree_id: 'gu_family_r', kind: 'family', path_alias: '/gu_family_r', display_title: '顾氏家族（重置后待认祖）',
      founder_state: 'none',
    },
  },
};
fs.writeFileSync(META_FILE, JSON.stringify(metaFixture, null, 2) + '\n');

const fa = await import('./founder-attach.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ---- 真实数据基线（测试结束必须一模一样） ----
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaBaseline = md5(REAL_META);
const realTreesBaseline = new Map(fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]));
const realDetailsBaseline = new Map(
  fs.existsSync(REAL_DETAILS) ? fs.readdirSync(REAL_DETAILS).map((f) => [f, md5(path.join(REAL_DETAILS, f))]) : [],
);

// ---- 造数 ----
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
function readMetaCopy() {
  return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
}
function metaCopyMd5() {
  return md5(META_FILE);
}
/** 树内是否出现了 I0001（真实 gu_39038_01 没有；认祖不得凭空造出 I0001 始祖位） */
function hasI0001(tree) {
  return Object.values(tree.people).some((p) => String(p.gramps_id || '') === 'I0001');
}
/** meta 副本里某树条目的 JSON（断言「变了 / 没变」用） */
function entryJsonOf(treeId) {
  return JSON.stringify(readMetaCopy().trees[treeId] || null);
}

const person = (handle, grampsId, name, extra = {}) => ({
  handle, gramps_id: grampsId, name, surname: name.slice(0, 1), given: name.slice(1), gender: 'M',
  birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
  ...extra,
});

/** 中华世本（真身侧） */
writeTree({
  _schema: '1.0',
  tree_id: 'zhonghua',
  founder_gramps_id: 'I0001',
  version: 3,
  people: {
    mRoot: person('mRoot', 'I0001', '风伏羲'),
    mGu: person('mGu', 'I0120', '顾始祖'),
  },
  families: {},
});
writeDetail({ _id: 'zhonghua:mGu', tree_id: 'zhonghua', handle: 'mGu', name: '顾始祖', events: [], attributes: [{ key: 'external_chain_gen', value: '25' }] });

/** 顾氏宗谱（自有段：own_gu 为支系入口） */
writeTree({
  _schema: '1.0',
  tree_id: 'gu_clan',
  kind: 'clan',
  founder_gramps_id: 'I0001',
  version: 2,
  people: {
    own_gu: person('own_gu', 'I0002', '顾清学', { external_tree: '', external_person_handle: '', external_link_type: '' }),
    own_kid: person('own_kid', 'I0003', '顾子'),
  },
  families: {},
});
writeDetail({ _id: 'gu_clan:own_gu', tree_id: 'gu_clan', handle: 'own_gu', name: '顾清学', events: [], attributes: [{ key: 'external_chain_gen', value: '12' }] });

/** 重置后的宗谱（无始祖态：自有段仍在） */
writeTree({
  _schema: '1.0',
  tree_id: 'gu_clan_r',
  kind: 'clan',
  version: 1,
  people: {
    own_qx: person('own_qx', 'I0002', '顾清学', { external_tree: '', external_person_handle: '', external_link_type: '' }),
    own_zi: person('own_zi', 'I0003', '顾子'),
  },
  families: {},
});
writeDetail({ _id: 'gu_clan_r:own_qx', tree_id: 'gu_clan_r', handle: 'own_qx', name: '顾清学', events: [], attributes: [{ key: 'external_chain_gen', value: '12' }] });

/** 真实 gu_39038_01 形状：无 I0001、始祖 I0070 顾清学、meta 无始祖登记 */
writeTree({
  _schema: '1.0',
  tree_id: 'gu_family',
  version: 4,
  people: {
    h70: person('h70', 'I0070', '顾清学', { spouse_families: ['fam70'] }),
    h71: person('h71', 'I0071', '顾子', { parent_family: 'fam70' }),
  },
  families: { fam70: { handle: 'fam70', gramps_id: 'F0040', father_handle: 'h70', mother_handle: '', child_handles: ['h71'] } },
});
writeDetail({ _id: 'gu_family:h70', tree_id: 'gu_family', handle: 'h70', name: '顾清学', events: [], attributes: [{ key: '封号', value: '某某公' }] });
writeDetail({ _id: 'gu_family:h71', tree_id: 'gu_family', handle: 'h71', name: '顾子', events: [] });

/** 已登记始祖的家族树（始祖 h70 / I0070；同样没有 I0001） */
writeTree({
  _schema: '1.0',
  tree_id: 'gu_family_reg',
  version: 2,
  people: { h70: person('h70', 'I0070', '顾清学'), h71: person('h71', 'I0071', '顾子') },
  families: {},
});

/** 路由 / 端到端用例的家族树（重置后待认祖） */
writeTree({
  _schema: '1.0',
  tree_id: 'gu_family_r',
  version: 1,
  people: { h74: person('h74', 'I0074', '顾承祖'), h75: person('h75', 'I0075', '顾小乙') },
  families: {},
});

// ============ 纯函数 ============

test('无始祖态判定与认祖入口守卫：founder_state=none → 任意节点可发起；有登记 → 仅始祖节点（不兜底 I0001）', () => {
  // 无始祖态判定
  assert.equal(fa.isFounderMissing({ founder_state: 'none' }), true);
  assert.equal(fa.isFounderMissing({ founder_state: '' }), false);
  assert.equal(fa.isFounderMissing({}), false);
  assert.equal(fa.isFounderMissing(null), false);
  assert.equal(fa.FOUNDER_STATE_NONE, 'none');

  const noneEntry = { tree_id: 'gu_family', kind: 'family', founder_state: 'none' };
  const noneTree = readTree('gu_family');
  // 任意节点（含非 I0001、非始祖的 I0071）都可发起
  assert.equal(fa.canInitiateAttach({ tree: noneTree, person: noneTree.people.h70, entry: noneEntry }), true);
  assert.equal(fa.canInitiateAttach({ tree: noneTree, person: noneTree.people.h71, entry: noneEntry }), true);
  assert.equal(fa.canInitiateAttach({ tree: noneTree, person: null, entry: noneEntry }), false, '节点不存在 → 不放行');

  // 已有登记始祖的家族树：仅始祖节点
  const regEntry = { tree_id: 'gu_family_reg', kind: 'family', founder_handle: 'h70' };
  const regTree = readTree('gu_family_reg');
  assert.equal(fa.canInitiateAttach({ tree: regTree, person: regTree.people.h70, entry: regEntry }), true);
  assert.equal(fa.canInitiateAttach({ tree: regTree, person: regTree.people.h71, entry: regEntry }), false);

  // 未登记始祖的树：不得把 I0001 当始祖（真实 gu_39038_01 里根本没有 I0001）
  const orphan = { tree_id: 't_orphan', people: { a: { handle: 'a', gramps_id: 'I0001' } } };
  assert.equal(fa.canInitiateAttach({ tree: orphan, person: orphan.people.a, entry: { tree_id: 't_orphan' } }), false);
  // 宗谱顶端的上层镜像仍可发起认祖（重认）
  const mirror = { handle: 'mir_mGu', gramps_id: 'I0001', external_mirror: 'true', external_tree: 'zhonghua', external_link_type: 'founder' };
  assert.equal(fa.canInitiateAttach({ tree: { tree_id: 'c', people: { mir_mGu: mirror } }, person: mirror, entry: { tree_id: 'c', kind: 'clan' }, treeId: 'c' }), true);
});

test('planFounderRegister：回写始祖三字段 + 删除 founder_state，其他元数据原样保留且不改原对象', () => {
  const entry = { tree_id: 'gu_family', kind: 'family', display_title: '顾氏家族', hall_name: '顾氏宗祠', founder_state: 'none' };
  const next = fa.planFounderRegister(entry, { handle: 'h70', gramps_id: 'I0070', name: '顾清学' });
  assert.deepEqual(Object.keys(next).sort(), ['display_title', 'founder_gramps_id', 'founder_handle', 'founder_name', 'hall_name', 'kind', 'tree_id']);
  assert.equal(next.founder_handle, 'h70');
  assert.equal(next.founder_gramps_id, 'I0070');
  assert.equal(next.founder_name, '顾清学');
  assert.equal('founder_state' in next, false, '回到「有始祖」态');
  assert.equal(next.hall_name, '顾氏宗祠');
  assert.equal(entry.founder_state, 'none', '纯函数不得改原对象');
  // 缺字段的节点：回写空串（不抛错）
  const blank = fa.planFounderRegister({ tree_id: 't' }, { handle: 'h' });
  assert.deepEqual([blank.founder_handle, blank.founder_gramps_id, blank.founder_name], ['h', '', '']);
});

// ============ 写路径 ============

test('无始祖家族树（gu_39038_01 形状）从任意节点认祖成功：树内挂镜像 + 同次写入回写 meta 始祖三字段', async () => {
  const treeBefore = treeFileMd5('gu_family');
  const masterBefore = treeFileMd5('zhonghua');
  const clanBefore = treeFileMd5('gu_clan');
  const metaBefore = metaCopyMd5();

  const r = await fa.attachFounder({
    treeId: 'gu_family',
    founderHandle: 'h70',
    masterTreeId: 'gu_clan',
    masterHandle: 'own_gu',
    requestedBy: '16600000021',
  });
  assert.equal(r.ok, true);
  assert.equal(r.target_kind, 'clan');
  assert.equal(r.relation_note, '顾清学（宗谱 · 第 12 世）');
  assert.equal(r.founder_registered, true, '无始祖态的认祖 = 指定始祖 → 本次应回写 meta');

  // ① tree-meta：该节点被登记为始祖，founder_state 删除
  const entry = readMetaCopy().trees.gu_family;
  assert.equal(entry.founder_handle, 'h70');
  assert.equal(entry.founder_gramps_id, 'I0070');
  assert.equal(entry.founder_name, '顾清学');
  assert.equal('founder_state' in entry, false, '认祖成功后回到「有始祖」态');
  assert.equal(entry.display_title, '顾氏家族', '其他元数据不受影响');
  assert.equal(entry.kind, 'family');
  assert.notEqual(metaCopyMd5(), metaBefore, 'meta 副本应发生登记变化');

  // ② 树 JSON：被指定节点成为始祖镜像；没有凭空造出 I0001
  const after = readTree('gu_family');
  assert.equal(after.people.h70.external_tree, 'gu_clan');
  assert.equal(after.people.h70.external_person_handle, 'own_gu');
  assert.equal(after.people.h70.external_link_type, 'founder');
  assert.equal(after.people.h70.external_mirror, 'true');
  assert.equal(after.people.h70.name, '顾清学', '姓名以真身为准（展示副本）');
  assert.equal(after.people.h70.gramps_id, 'I0070', '被指定节点原位不动（不是 I0001）');
  assert.equal(hasI0001(after), false, '树内不得凭空出现 I0001');
  assert.equal(after.tree_id, 'gu_family');
  assert.notEqual(treeFileMd5('gu_family'), treeBefore);

  // ③ 上层两棵树不得被改写
  assert.equal(treeFileMd5('zhonghua'), masterBefore, '总谱树 JSON 不得被改写');
  assert.equal(treeFileMd5('gu_clan'), clanBefore, '认祖目标的宗谱树 JSON 不得被改写');

  // ④ 始祖详情（称号等）随认祖清空（真身为准）
  const d = readDetailDoc('gu_family', 'h70');
  assert.deepEqual(d.attributes, []);
  assert.equal(d.name, '顾清学');

  // ⑤ 登记后：该树不再是「无始祖」态，且一树一挂载生效
  const regEntry = readMetaCopy().trees.gu_family;
  assert.equal(fa.isFounderMissing(regEntry), false);
  assert.equal(fa.canInitiateAttach({ tree: after, person: after.people.h70, entry: regEntry }), true);
  assert.equal(fa.canInitiateAttach({ tree: after, person: after.people.h71, entry: regEntry }), false, '登记后只有始祖节点可再发起');
  await assert.rejects(
    () => fa.attachFounder({ treeId: 'gu_family', founderHandle: 'h71', masterTreeId: 'gu_clan', masterHandle: 'own_gu' }),
    (e) => e.status === 400 && /仅本家族树的始祖节点可发起认祖/.test(e.message),
    '登记后非始祖节点连入口守卫都过不去',
  );
  await assert.rejects(
    () => fa.attachFounder({ treeId: 'gu_family', founderHandle: 'h70', masterTreeId: 'gu_clan', masterHandle: 'own_gu' }),
    (e) => e.status === 400 && /已认祖，请先解除挂载/.test(e.message),
    '始祖节点再认祖 → 一树一挂载拒绝',
  );
});

test('已有登记始祖的树：非始祖节点认祖仍 400，且不写任何数据；始祖节点照旧可认祖', async () => {
  const metaBefore = metaCopyMd5();
  const treeBefore = treeFileMd5('gu_family_reg');
  await assert.rejects(
    () => fa.attachFounder({ treeId: 'gu_family_reg', founderHandle: 'h71', masterTreeId: 'gu_clan', masterHandle: 'own_gu' }),
    (e) => e.status === 400 && /仅本家族树的始祖节点可发起认祖/.test(e.message),
  );
  assert.equal(metaCopyMd5(), metaBefore, '拒绝时 meta 不得被写');
  assert.equal(treeFileMd5('gu_family_reg'), treeBefore, '拒绝时树 JSON 不得被写');

  // 始祖节点发起 → 正常挂载，且**不得**产生额外的始祖登记（founder_registered=false）
  const r = await fa.attachFounder({
    treeId: 'gu_family_reg',
    founderHandle: 'h70',
    masterTreeId: 'gu_clan',
    masterHandle: 'own_gu',
  });
  assert.equal(r.ok, true);
  assert.equal(r.founder_registered, false, '已有始祖登记的树不需要回写');
  const entry = readMetaCopy().trees.gu_family_reg;
  assert.equal(entry.founder_handle, 'h70');
  assert.equal(entry.founder_gramps_id, 'I0070');
  assert.equal(entry.founder_state, undefined);
  assert.equal(readTree('gu_family_reg').people.h71.external_link_type, undefined, '非始祖节点不得被写成镜像');
});

// ============ 路由层 / 端到端 ============

const STEWARD = '16600000021';
const CHIEF = '16600000022';
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '顾氏主理人', role: 'tree_steward' },
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
  }),
);
const stewardToken = signJwt({ sub: STEWARD, phone: STEWARD, role: 'tree_steward' }, 3600);
const chiefToken = signJwt({ sub: CHIEF, phone: CHIEF, role: 'chief_editor' }, 3600);

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
const json = (res) => JSON.parse(res.body);

test('路由 /admin/founder-request：无始祖树任意节点 200；有始祖树非始祖节点仍 400', async () => {
  // 未登录 → 401
  assert.equal(
    (await post('/admin/founder-request', { tree_id: 'gu_family_r', person_handle: 'h74', target_tree_id: 'gu_clan', target_handle: 'own_gu' }, '', 'gu_family_r')).statusCode,
    401,
  );
  // 已登记始祖的树上，非始祖节点 → 400（老口径保留）
  const notFounder = await post('/admin/founder-request', { tree_id: 'gu_family_reg', person_handle: 'h71', target_tree_id: 'gu_clan', target_handle: 'own_gu' }, stewardToken, 'gu_family_reg');
  assert.equal(notFounder.statusCode, 400);
  assert.match(json(notFounder).error, /始祖节点可发起认祖/);
  // 已登记始祖的宗谱上，非始祖节点 → 400
  const clanNotFounder = await post('/admin/founder-request', { tree_id: 'gu_clan', person_handle: 'own_kid', target_tree_id: 'zhonghua', target_handle: 'mGu' }, stewardToken, 'gu_clan');
  assert.equal(clanNotFounder.statusCode, 400);
  assert.match(json(clanNotFounder).error, /始祖节点可发起认祖/);

  // 无始祖态（重置后）的家族树：从任意节点（I0074 顾承祖，非 I0001）发起 → 200 pending
  const ok = await post('/admin/founder-request', { tree_id: 'gu_family_r', person_handle: 'h74', target_tree_id: 'gu_clan', target_handle: 'own_gu', note: '重置后重新认祖' }, stewardToken, 'gu_family_r');
  assert.equal(ok.statusCode, 200, `无始祖树任意节点认祖必须放行：${ok.body}`);
  const body = json(ok);
  assert.equal(body.status, 'pending');
  assert.equal(body.target_kind, 'clan');
  assert.ok(body.request_id);
  // 同树重复提交 → 400
  assert.equal(
    (await post('/admin/founder-request', { tree_id: 'gu_family_r', person_handle: 'h75', target_tree_id: 'gu_clan', target_handle: 'own_gu' }, stewardToken, 'gu_family_r')).statusCode,
    400,
  );

  // 审批通过 → 挂载建立 + 回写始祖三字段（端到端：gu_39038_01 场景）
  const decided = await post('/admin/decide-founder', { request_id: body.request_id, approve: true }, chiefToken, 'gu_clan');
  assert.equal(decided.statusCode, 200, `审批应通过：${decided.body}`);
  const result = json(decided).result;
  assert.equal(result.founder_registered, true);
  const entry = readMetaCopy().trees.gu_family_r;
  assert.equal(entry.founder_handle, 'h74');
  assert.equal(entry.founder_gramps_id, 'I0074');
  assert.equal(entry.founder_name, '顾清学', '回写取认祖后的始祖节点（镜像展示副本以真身为准）');
  assert.equal('founder_state' in entry, false);
  assert.equal(fa.isFounderMissing(entry), false);
  const tree = readTree('gu_family_r');
  assert.equal(tree.people.h74.external_link_type, 'founder');
  assert.equal(tree.people.h74.external_tree, 'gu_clan');
  assert.equal(hasI0001(tree), false, '树内不得凭空出现 I0001');
  // 读侧推导：该树现在可由宗谱 own_gu 节点反查出来
  const attached = await fa.listAttachedTrees({ masterTreeId: 'gu_clan', meta: readMetaCopy() });
  const hit = attached.find((a) => a.tree_id === 'gu_family_r');
  assert.ok(hit, `该树应出现在 own_gu 的挂载树清单里：${JSON.stringify(attached)}`);
  assert.equal(hit.founder_handle, 'h74');
  assert.equal(hit.master_handle, 'own_gu');
});

test('路由：宗谱无始祖（重置后）任意节点认祖世本 → 通过后回写宗谱 meta 的始祖三字段', async () => {
  const metaBefore = entryJsonOf('gu_clan_r');

  // 重置后的宗谱：既有自有段（own_qx）又无始祖登记 → 从自有段入口发起认祖世本
  // （始祖唯一性按「世本节点 × 姓」：gu_clan 已认 mGu，这里认 mRoot）
  const req = await post('/admin/founder-request', { tree_id: 'gu_clan_r', person_handle: 'own_qx', target_tree_id: 'zhonghua', target_handle: 'mRoot' }, stewardToken, 'gu_clan_r');
  assert.equal(req.statusCode, 200, `无始祖宗谱任意节点认祖世本必须放行：${req.body}`);
  const rid = json(req).request_id;

  const decided = await post('/admin/decide-founder', { request_id: rid, approve: true }, chiefToken, 'zhonghua');
  assert.equal(decided.statusCode, 200, `审批应通过：${decided.body}`);
  assert.equal(json(decided).result.founder_registered, true);

  // meta：三字段回写 + founder_state 删除 + 上层指针
  const entry = readMetaCopy().trees.gu_clan_r;
  assert.equal(entry.founder_handle, 'own_qx');
  assert.equal(entry.founder_gramps_id, 'I0002');
  assert.equal(entry.founder_name, '顾清学');
  assert.equal('founder_state' in entry, false, '宗谱认祖成功后回到「有始祖」态');
  assert.equal(entry.master_tree_id, 'zhonghua');
  assert.equal(entry.master_handle, 'mRoot');
  assert.equal(entry.kind, 'clan');
  assert.notEqual(entryJsonOf('gu_clan_r'), metaBefore);

  // 树：顶端镜像段建立（mir_mRoot = founder），自有段保留并挂到链路下端点
  const tree = readTree('gu_clan_r');
  assert.equal(tree.people.mir_mRoot.external_link_type, 'founder');
  assert.equal(tree.people.mir_mRoot.external_tree, 'zhonghua');
  assert.equal(tree.people.mir_mRoot.external_person_handle, 'mRoot');
  assert.ok(tree.people.own_qx, '自有段必须保留');
  assert.equal(tree.people.own_qx.parent_family, 'cfam_own_gu_clan_r');

  // 宗谱×世本读侧推导：该宗谱可由 mRoot 反查
  const attached = await fa.listAttachedTrees({ masterTreeId: 'zhonghua', meta: readMetaCopy() });
  const hit = attached.find((a) => a.tree_id === 'gu_clan_r');
  assert.ok(hit, `宗谱应出现在 mRoot 的挂载清单里：${JSON.stringify(attached)}`);
  assert.equal(hit.master_handle, 'mRoot');
  // 读侧清单里的 founder_name 取「始祖镜像节点」的姓名（以真身为准），而非 meta 的 founder_name
  assert.equal(hit.founder_name, '风伏羲');
  assert.equal(hit.founder_gramps_id, 'I0001');
});

// ============ 真实数据保护 ============

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/ 的 md5 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaBaseline, 'config/tree-meta.json 被改动了');
  const nowTrees = fs.readdirSync(REAL_TREES);
  assert.deepEqual(nowTrees.sort(), [...realTreesBaseline.keys()].sort(), '真实树目录文件名/数量变了');
  for (const f of nowTrees) {
    assert.equal(md5(path.join(REAL_TREES, f)), realTreesBaseline.get(f), `真实树 ${f} 被改动了`);
  }
  const nowDetails = fs.existsSync(REAL_DETAILS) ? fs.readdirSync(REAL_DETAILS) : [];
  assert.deepEqual(nowDetails.sort(), [...realDetailsBaseline.keys()].sort(), '真实详情目录文件名/数量变了');
  for (const f of nowDetails) {
    assert.equal(md5(path.join(REAL_DETAILS, f)), realDetailsBaseline.get(f), `真实详情 ${f} 被改动了`);
  }
});
