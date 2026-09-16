/**
 * 「重置始祖」测试 — POST /admin/reset-founder（逻辑见 lib/founder-attach.js §重置始祖）
 *
 * 语义：清空本树始祖登记（tree-meta 的 founder_handle / founder_gramps_id / founder_name
 * 删除 + founder_state='none'）→ 本树回到「无始祖」态，可在任意节点用「⛩ 认祖」重新指定。
 * 只写 tree-meta：树 JSON / 详情文档一个字节不改（始祖节点本身仍是可编辑的普通节点）。
 *
 * 拒绝：总谱（kind='master'）→ 400；当前始祖为镜像 → 400（须先「解除挂载」）；
 *       tree-meta 无该树 → 404；未登录 → 401。
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本；文末用 md5 断言真实
 * migrate-output/ 与 config/tree-meta.json 逐字节未变（照 meta-guard.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/reset-founder.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-reset-founder-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;

/** 测试用 tree-meta 副本（zhonghua=master / rt_*=family） */
const metaFixture = {
  _schema: '1.1',
  trees: {
    zhonghua: {
      tree_id: 'zhonghua', kind: 'master', is_master: true, path_alias: '/zhonghua',
      surname_char: '华', display_title: '中华世本 · 全球华人家谱总谱',
    },
    // 老的、非镜像的真人始祖（本次要支持的场景：顾清学 I0070）
    rt_plain: {
      tree_id: 'rt_plain', kind: 'family', path_alias: '/rt_plain', surname_char: '顾',
      display_title: '顾氏测试家族', founder_handle: 'f', founder_gramps_id: 'I0070',
      founder_name: '顾清学', hall_name: '顾氏宗祠', enable_custom_domain: false,
    },
    // 已认祖的镜像始祖（须先解除挂载）
    rt_mirror: {
      tree_id: 'rt_mirror', kind: 'family', path_alias: '/rt_mirror', surname_char: '季',
      display_title: '季氏测试家族（镜像）', founder_handle: 'f', founder_gramps_id: 'I0001',
      founder_name: '季始祖公', enable_custom_domain: false,
    },
    // 无始祖态（重置后的状态；再重置应幂等）
    rt_none: { tree_id: 'rt_none', kind: 'family', founder_state: 'none', display_title: '无始祖家族' },
    // 路由层正常重置用例（主理人自助重置）
    rt_route: {
      tree_id: 'rt_route', kind: 'family', display_title: '路由测试家族',
      founder_handle: 'f', founder_gramps_id: 'I0070', founder_name: '顾清学',
    },
  },
};
fs.writeFileSync(META_FILE, JSON.stringify(metaFixture, null, 2) + '\n');

const fa = await import('./founder-attach.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ---- 真实数据基线（测试结束必须一模一样） ----
const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realTreesBaseline = new Map(fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]));
const realMetaBaseline = md5(REAL_META);
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
function readMetaCopy() {
  return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
}
function metaCopyMd5() {
  return md5(META_FILE);
}

// 总谱（真身侧）
writeTree({
  _schema: '1.0',
  tree_id: 'zhonghua',
  founder_gramps_id: 'I0001',
  version: 5,
  people: {
    mRoot: {
      handle: 'mRoot', gramps_id: 'I0001', name: '风伏羲', surname: '风', given: '伏羲', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
    },
    mX: {
      handle: 'mX', gramps_id: 'I0100', name: '季始祖公', surname: '季', given: '始祖公', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: ['mf1'],
    },
  },
  families: { mf1: { handle: 'mf1', gramps_id: 'F0001', father_handle: 'mX', mother_handle: '', child_handles: [] } },
});

/** 老的真人始祖（非镜像）：顾清学 I0070 + 其子 */
writeTree({
  _schema: '1.0',
  tree_id: 'rt_plain',
  founder_gramps_id: 'I0001',
  version: 4,
  people: {
    f: {
      handle: 'f', gramps_id: 'I0070', name: '顾清学', surname: '顾', given: '清学', gender: 'M',
      birth_date: '1899', death_date: '1970', birth_place: '', death_place: '', parent_family: '', spouse_families: ['fam'],
    },
    kid: {
      handle: 'kid', gramps_id: 'I0071', name: '顾子', surname: '顾', given: '子', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'fam', spouse_families: [],
    },
  },
  families: { fam: { handle: 'fam', gramps_id: 'F0001', father_handle: 'f', mother_handle: '', child_handles: ['kid'] } },
});
writeDetail({ _id: 'rt_plain:f', tree_id: 'rt_plain', handle: 'f', name: '顾清学', events: [], attributes: [{ key: '封号', value: '某某公' }] });
writeDetail({ _id: 'rt_plain:kid', tree_id: 'rt_plain', handle: 'kid', name: '顾子', events: [] });

/** 已认祖（镜像始祖） */
writeTree({
  _schema: '1.0',
  tree_id: 'rt_mirror',
  founder_gramps_id: 'I0001',
  version: 2,
  people: {
    f: {
      handle: 'f', gramps_id: 'I0001', name: '季始祖公', surname: '季', given: '始祖公', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
      external_tree: 'zhonghua', external_person_handle: 'mX', external_link_type: 'founder',
      external_mirror: 'true', external_relation_note: '季始祖公（中华世本 · 第 12 世）',
    },
  },
  families: {},
});

/** 无始祖态树（meta.founder_state='none'，无登记字段） */
writeTree({
  _schema: '1.0',
  tree_id: 'rt_none',
  version: 1,
  people: {
    a: {
      handle: 'a', gramps_id: 'I0001', name: '顾某', surname: '顾', given: '某', gender: 'M',
      birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
    },
  },
  families: {},
});

// ============ 纯函数 ============

test('planFounderReset：删除始祖登记三字段 + founder_state=none，其他元数据原样保留', () => {
  const entry = { tree_id: 'rt_plain', kind: 'family', founder_handle: 'f', founder_gramps_id: 'I0070', founder_name: '顾清学', hall_name: '顾氏宗祠' };
  const next = fa.planFounderReset(entry);
  assert.deepEqual(Object.keys(next).sort(), ['founder_state', 'hall_name', 'kind', 'tree_id']);
  assert.equal(next.founder_state, 'none');
  assert.equal(next.hall_name, '顾氏宗祠', '非始祖字段不得被顺手清掉');
  assert.equal('founder_handle' in next, false);
  assert.equal('founder_gramps_id' in next, false);
  assert.equal('founder_name' in next, false);
  assert.equal(entry.founder_handle, 'f', '纯函数不得改原对象');
  assert.equal(fa.FOUNDER_STATE_NONE, 'none');
});

test('currentFounderHandle / assertFounderResettable：镜像优先识别；总谱与镜像一律拒', () => {
  const plainTree = readTree('rt_plain');
  const mirrorTree = readTree('rt_mirror');
  // 老的真人始祖：按 meta.founder_handle 解析
  assert.equal(fa.currentFounderHandle(plainTree, { founder_handle: 'f' }), 'f');
  // 已挂载的镜像优先（即使 meta.founder_handle 指别处，重置要针对「当前生效的始祖」）
  assert.equal(fa.currentFounderHandle(mirrorTree, { founder_handle: 'someone_else' }), 'f');
  // 无 meta 信息 + 树内无登记 → ''（不兜底 I0001）；树缺失 → ''
  assert.equal(
    fa.currentFounderHandle({ people: { a: { handle: 'a', gramps_id: 'I0001' } } }, null),
    '',
    '未登记始祖的树不得把 I0001 当始祖',
  );
  // 树 JSON 自己登记了始祖位 → 仍按树内登记解析
  assert.equal(
    fa.currentFounderHandle({ people: { a: { handle: 'a', gramps_id: 'I0001' } }, founder_gramps_id: 'I0001' }, null),
    'a',
  );
  assert.equal(fa.currentFounderHandle(null, null), '');

  // 总谱 → 400
  assert.throws(
    () => fa.assertFounderResettable({ entry: { tree_id: 'zhonghua', kind: 'master' }, tree: readTree('zhonghua') }),
    (e) => e.status === 400 && /总谱不可重置始祖/.test(e.message),
  );
  // 镜像始祖 → 400 + 指定文案
  assert.throws(
    () => fa.assertFounderResettable({ entry: { tree_id: 'rt_mirror', kind: 'family', founder_handle: 'f' }, tree: mirrorTree }),
    (e) => e.status === 400 && e.message === fa.FOUNDER_RESET_MIRROR_MESSAGE,
  );
  assert.equal(fa.FOUNDER_RESET_MIRROR_MESSAGE, '该始祖为镜像节点，请先「解除挂载」再重置');
  // external_mirror=true 但 link_type 非 founder（异常数据）也应拒
  assert.throws(
    () => fa.assertFounderResettable({
      entry: { kind: 'family', founder_handle: 'f' },
      tree: { people: { f: { handle: 'f', gramps_id: 'I0001', external_mirror: 'true', external_link_type: 'chain' } } },
    }),
    (e) => e.status === 400,
  );
  // 真人始祖 → 放行并回报 previous 三字段
  assert.deepEqual(
    fa.assertFounderResettable({ entry: { kind: 'family', founder_handle: 'f' }, tree: plainTree }),
    { founder_handle: 'f', founder_gramps_id: 'I0070', founder_name: '顾清学' },
  );
});

// ============ 写路径 ============

test('resetFounder：只写 tree-meta 副本（三字段删除 + founder_state=none），树 JSON 与详情逐字节不变', async () => {
  const treeBefore = treeFileMd5('rt_plain');
  const detailBefore = md5(path.join(TMP, 'details', 'rt_plain:f.json'));

  const r = await fa.resetFounder({ treeId: 'rt_plain' });
  assert.equal(r.ok, true);
  assert.equal(r.tree_id, 'rt_plain');
  assert.equal(r.founder_state, 'none');
  assert.deepEqual(r.previous, { founder_handle: 'f', founder_gramps_id: 'I0070', founder_name: '顾清学' });
  assert.match(r.message, /暂无始祖/);

  const entry = readMetaCopy().trees.rt_plain;
  assert.equal(entry.founder_state, 'none');
  assert.equal('founder_handle' in entry, false);
  assert.equal('founder_gramps_id' in entry, false);
  assert.equal('founder_name' in entry, false);
  assert.equal(entry.hall_name, '顾氏宗祠', '其他元数据不受影响');
  assert.equal(entry.display_title, '顾氏测试家族');

  assert.equal(treeFileMd5('rt_plain'), treeBefore, '树 JSON 不得被改写（始祖节点仍是普通可编辑节点）');
  assert.equal(md5(path.join(TMP, 'details', 'rt_plain:f.json')), detailBefore, '详情文档不得被改写');
  assert.equal(readTree('rt_plain').people.f.name, '顾清学', '节点身份数据保留');

  // 幂等：无始祖态的树再重置 → 仍 200，meta 内容不再变化
  const again = await fa.resetFounder({ treeId: 'rt_none' });
  assert.equal(again.ok, true);
  assert.deepEqual(
    again.previous,
    { founder_handle: '', founder_gramps_id: '', founder_name: '' },
    '未登记始祖（founder_state=none）的树不得按 I0001 兜底解析出「始祖」',
  );
  const md5AfterFirst = metaCopyMd5();
  const third = await fa.resetFounder({ treeId: 'rt_none' });
  assert.equal(third.ok, true);
  assert.equal(metaCopyMd5(), md5AfterFirst, '幂等：再重置不产生新变化');
});

test('resetFounder 拒绝：总谱 400 / 镜像始祖 400 / 无该树 404（拒绝时 meta 一个字节不改）', async () => {
  const before = metaCopyMd5();
  await assert.rejects(() => fa.resetFounder({ treeId: 'zhonghua' }), (e) => e.status === 400 && /总谱不可重置始祖/.test(e.message));
  await assert.rejects(
    () => fa.resetFounder({ treeId: 'rt_mirror' }),
    (e) => e.status === 400 && e.message === '该始祖为镜像节点，请先「解除挂载」再重置',
  );
  await assert.rejects(() => fa.resetFounder({ treeId: 'rt_missing' }), (e) => e.status === 404 && /未找到 tree/.test(e.message));
  await assert.rejects(() => fa.resetFounder({}), (e) => e.status === 400 && /缺少 tree_id/.test(e.message));
  assert.equal(metaCopyMd5(), before, '拒绝时不得落任何写入');
  assert.equal(readMetaCopy().trees.rt_mirror.founder_handle, 'f', '镜像树的登记必须原样保留');
  assert.equal(readMetaCopy().trees.zhonghua.founder_state, undefined);
});

// ============ 路由层 ============

const STEWARD = '16600000011';
const CHIEF = '16600000012';
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '本树主理人', role: 'tree_steward' },
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

test('路由 POST /admin/reset-founder：未登录 401 / 无编辑权 403 / 总谱 400 / 缺树 404', async () => {
  // 未登录 → 401
  assert.equal((await post('/admin/reset-founder', { tree_id: 'rt_plain', person_handle: 'f' }, '', 'rt_plain')).statusCode, 401);
  // 缺 X-Tree-Id → 400
  assert.equal((await post('/admin/reset-founder', { person_handle: 'f' }, stewardToken, '')).statusCode, 400);
  // 树不存在 → 404
  assert.equal((await post('/admin/reset-founder', { tree_id: 'rt_missing' }, stewardToken, 'rt_missing')).statusCode, 404);
  // 非 chief 写总谱 → 403（总谱仅 chief_editor）
  assert.equal((await post('/admin/reset-founder', { tree_id: 'zhonghua' }, stewardToken, 'zhonghua')).statusCode, 403);
  // chief 写总谱 → 400（总谱不可重置）
  const master = await post('/admin/reset-founder', { tree_id: 'zhonghua' }, chiefToken, 'zhonghua');
  assert.equal(master.statusCode, 400);
  assert.match(json(master).error, /总谱不可重置始祖/);
  // 镜像始祖 → 400 + 指定文案
  const mirror = await post('/admin/reset-founder', { tree_id: 'rt_mirror', person_handle: 'f' }, stewardToken, 'rt_mirror');
  assert.equal(mirror.statusCode, 400);
  assert.equal(json(mirror).error, '该始祖为镜像节点，请先「解除挂载」再重置');
  // meta 无该树条目 → 404（树 JSON 也不存在）
  assert.equal((await post('/admin/reset-founder', { tree_id: 'rt_ghost' }, stewardToken, 'rt_ghost')).statusCode, 404);
});

test('路由 POST /admin/reset-founder：本树主理人重置成功（返回 previous + founder_state=none）', async () => {
  writeTree({
    _schema: '1.0',
    tree_id: 'rt_route',
    founder_gramps_id: 'I0001',
    version: 1,
    people: {
      f: {
        handle: 'f', gramps_id: 'I0070', name: '顾清学', surname: '顾', given: '清学', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
      },
    },
    families: {},
  });
  const treeBefore = treeFileMd5('rt_route');

  const res = await post('/admin/reset-founder', { tree_id: 'rt_route', person_handle: 'f' }, stewardToken, 'rt_route');
  assert.equal(res.statusCode, 200);
  const body = json(res);
  assert.equal(body.ok, true);
  assert.equal(body.tree_id, 'rt_route');
  assert.equal(body.founder_state, 'none');
  assert.deepEqual(body.previous, { founder_handle: 'f', founder_gramps_id: 'I0070', founder_name: '顾清学' });
  assert.match(body.message, /可在任意节点用「⛩ 认祖」重新指定/);

  const entry = readMetaCopy().trees.rt_route;
  assert.equal(entry.founder_state, 'none');
  assert.equal('founder_handle' in entry, false);
  assert.equal(treeFileMd5('rt_route'), treeBefore, '重置只写 meta，树 JSON 不变');
  // 重置后可正常「认祖」（无始祖态的树：不再被一树一挂载挡住）
  assert.doesNotThrow(() => fa.assertOneAttachPerTree(readTree('rt_route').people.f));
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
