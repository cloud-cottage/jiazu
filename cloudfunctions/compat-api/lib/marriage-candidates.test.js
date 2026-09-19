/**
 * 跨树嫁娶配偶发现通道 —— `GET /search/marriage-candidates` 单测（docs/marriage.spec.md §9-8）
 *
 * 背景（用户报障已核实的两层根因）：
 *   ① 读路径节点级分层按「发起人对目标树的关系」裁剪（lib/tree-access.js `computeAccess`：
 *      总谱 / chief_editor / 目标树成员才 full，否则 hideTail = 登录 9 世、未登录 18 世，
 *      FLOOR_VISIBLE_DEPTH = 1）→ 非成员在对方树里只剩最古老 1 世，**适婚世代整段消失**
 *      （实测 gu_39038_01 搜「景月」：guest 0 / 季树 member 0 / chief 1）；
 *   ② lib/auth.js `authUser` 在 token 失效时静默返 null → 服务端按 guest 档（藏 18 世）处理，
 *      而前端仍显示已登录，用户看不出原因。
 *   而写侧 /marriage-request（index.js:1121-1128）本就按 handle / 全局编号放开（口径 C：目标树不设门槛）
 *   → 「发现被拦、写许可开着」的不对称。本通道即该不对称的定点修复。
 *
 * 本文件断言（逐条对应派单口径 A+B）：
 *   A1 需登录：无 token / 失效 token / 过期 token / token 有效但用户不存在 → **401**
 *      （**绝不静默降级 guest 档**）；
 *   A2 参数：`tree_id` 必填（缺失 → 400）；`query` trim 后为空 → `200` + 空候选；
 *      `gender` 仅 'F' / 'M' 生效（其它值忽略）；`limit` 默认 20、clamp 1..50；
 *   A3 **不套节点级读裁剪**（不调用 isHiddenPerson）：同一夹具、同一登录非成员身份下，
 *      树内 `GET /search` 返 **0** 条而本通道返 **1** 条 —— 这是证明修复成立的唯一方式；
 *   A4 **字段白名单恰五项**：`handle` / `gramps_id` / `name` / `gender` / `is_living`
 *      （不得夹带生卒 / profile / 家族关系 / external_* 指针 / 真身 handle・编号・树）；
 *   A5 **镜像排除**：`external_mirror === 'true'` 的节点不列入候选（娶入对象应为真身）；
 *   A6 性别口径不变：娶入强制 F、嫁出强制 M；**性别未知（U / 0）一律不列入**；
 *   A7 排序：编号 / handle / 树内旧号精确命中置顶 → 其余保持树内 people 键序；
 *   A8 注册在**树编辑闸门之前**：不带 X-Tree-Id 也能用（闸门按 tree_id 查询参数放行）。
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本；文末 md5 断言真源
 * （config/tree-meta.json + migrate-output/trees + migrate-output/collections）逐字节未变
 * （照 home-sort-search.test.js / node-delete.test.js 模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/marriage-candidates.test.js
 * 变异验证：把 index.js 新路由里的候选扫描改回「套用 isHiddenPerson」后，本文件 A3 必须变红。
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
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-marriage-candidates-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = dirBaseline(REAL_TREES);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

// ---- 沙箱目录 ----
for (const d of ['trees', 'details', 'collections']) fs.mkdirSync(path.join(TMP, d), { recursive: true });
const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2));
const writeTree = (tree) => writeJson(path.join(TMP, 'trees', `${tree.tree_id}.json`), tree);
const writeCol = (col, obj) => writeJson(path.join(TMP, 'collections', `${col}.json`), obj);

// ---- 夹具：目标树（12 世链）+ 另一棵树（锚点树）----
const TREE = 'mc_target';
const OTHER_TREE = 'mc_other';
const CHAIN = 11; // 第 1–11 世为链；第 12 世放「适婚世代」的人
const HIDDEN_TAIL_LOGIN = 9; // lib/tree-access.js LOGIN_HIDE_TAIL（不得改动，仅用于断言前置条件）
const GEN12 = '第12世';
const EXTRA_N = 60; // 第 12 世额外男丁（limit 上限 clamp 用）

const H = {
  g: (i) => `mc_t_g${i}`,
  f1: 'mc_t_f1', // 顾景月（女 · 真身 · 近代世）
  m1: 'mc_t_m1', // 顾景山（男）
  u1: 'mc_t_u1', // 顾未知（性别 U）
  z0: 'mc_t_z0', // 顾零（性别 '0'）
  mir: 'mc_t_mir', // 顾影儿（镜像 external_mirror='true'）
  extra: (i) => `mc_t_e${i}`,
};
const ID = {
  g: (i) => `I0007${String(i).padStart(2, '0')}`,
  f1: 'I000712',
  m1: 'I000713',
  u1: 'I000714',
  z0: 'I000715',
  mir: 'I000716',
  extra: (i) => `I0008${String(i).padStart(2, '0')}`,
};
/** 树内旧号（legacy_gramps_id）夹具：第 5 世 */
const LEGACY_G5 = '0050';

writeJson(process.env.COMPAT_META_FILE, {
  _schema: '1.1',
  trees: {
    [TREE]: { tree_id: TREE, kind: 'family', display_title: '顾氏测试宗谱（发现通道）' },
    [OTHER_TREE]: { tree_id: OTHER_TREE, kind: 'family', display_title: '季氏测试本宗（锚点树）' },
  },
});

const people = {};
const families = {};
// 第 1–11 世：单一父子链（顾氏1 → … → 顾氏11）
for (let i = 1; i <= CHAIN; i++) {
  const h = H.g(i);
  people[h] = {
    handle: h,
    gramps_id: ID.g(i),
    name: `顾氏${i}`,
    surname: '顾',
    given: `${i}`,
    gender: i % 2 === 0 ? 'F' : 'M',
    birth_date: '',
    death_date: '',
    is_living: false,
    parent_family: i === 1 ? '' : `mc_fam${i - 1}`,
    spouse_families: [],
    ...(i === 5 ? { legacy_gramps_id: LEGACY_G5 } : {}),
  };
  if (i < CHAIN) {
    families[`mc_fam${i}`] = {
      handle: `mc_fam${i}`,
      gramps_id: `F0007${String(i).padStart(2, '0')}`,
      father_handle: h,
      mother_handle: '',
      child_handles: [H.g(i + 1)],
    };
  }
}
// 第 12 世（近代世）：男女各 1 + 性别未知两种写法 + 1 个镜像 + 60 个男丁
const gen12 = [
  {
    handle: H.f1, gramps_id: ID.f1, name: '顾景月', surname: '顾', given: '景月', gender: 'F',
    birth_date: '1988-09-04', death_date: '', is_living: true,
  },
  {
    handle: H.m1, gramps_id: ID.m1, name: '顾景山', surname: '顾', given: '景山', gender: 'M',
    birth_date: '1985-03-01', death_date: '', is_living: true,
  },
  {
    handle: H.u1, gramps_id: ID.u1, name: '顾未知', surname: '顾', given: '未知', gender: 'U',
    birth_date: '', death_date: '', is_living: true,
  },
  {
    handle: H.z0, gramps_id: ID.z0, name: '顾零', surname: '顾', given: '零', gender: '0',
    birth_date: '', death_date: '', is_living: true,
  },
  {
    handle: H.mir, gramps_id: ID.mir, name: '顾影儿', surname: '顾', given: '影儿', gender: 'F',
    birth_date: '', death_date: '', is_living: true,
    external_mirror: 'true', external_person_handle: 'zh_real_handle', external_tree: 'zh_other_tree',
    external_link_type: 'marriage',
  },
];
for (let i = 1; i <= EXTRA_N; i++) {
  gen12.push({
    handle: H.extra(i), gramps_id: ID.extra(i), name: `顾多${i}`, surname: '顾', given: `多${i}`,
    gender: 'M', birth_date: '', death_date: '', is_living: false,
  });
}
for (const p of gen12) {
  people[p.handle] = { parent_family: 'mc_fam11', spouse_families: [], ...p };
}
families['mc_fam11'] = {
  handle: 'mc_fam11',
  gramps_id: 'F000711',
  father_handle: H.g(CHAIN),
  mother_handle: '',
  child_handles: gen12.map((p) => p.handle),
};
writeTree({ tree_id: TREE, version: 1, updated_at: '2026-09-01T00:00:00.000Z', people, families });

// 锚点树（非成员用户的锚点落在这棵树 → 对 TREE 而言仍是「非成员」）
writeTree({
  tree_id: OTHER_TREE,
  version: 1,
  people: {
    mc_o_1: { handle: 'mc_o_1', gramps_id: 'I000901', name: '季某', surname: '季', given: '某', gender: 'M', is_living: false },
  },
  families: {},
});

// ---- 用户 / 锚点（登录态夹具）----
const P_NO_ANCHOR = '16600000901'; // 登录但**无锚点** → 对 TREE 非成员
const P_OTHER_ANCHOR = '16600000902'; // 登录但锚点在**其它树** → 对 TREE 非成员
const P_GONE = '16600000903'; // token 有效但 jiazu_users 里没有该用户 → 401
writeCol('jiazu_users', {
  [P_NO_ANCHOR]: { _id: P_NO_ANCHOR, phone: P_NO_ANCHOR, nickname: '非成员甲', role: 'user' },
  [P_OTHER_ANCHOR]: { _id: P_OTHER_ANCHOR, phone: P_OTHER_ANCHOR, nickname: '非成员乙', role: 'user' },
});
writeCol('jiazu_anchors', {
  [P_OTHER_ANCHOR]: {
    _id: P_OTHER_ANCHOR,
    tree_id: OTHER_TREE,
    person_handle: 'mc_o_1',
    updated_at: '2026-09-01T00:00:00.000Z',
  },
});

const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');
const { computeAccess, LOGIN_HIDE_TAIL } = await import('./tree-access.js');

const tokenOf = (phone) => signJwt({ sub: phone, phone, role: 'user' }, 3600);
const call = (pathname, { query = {}, headers = {}, method = 'GET' } = {}) =>
  handleRequest({ path: pathname, httpMethod: method, queryStringParameters: query, headers, body: '' });
const bearer = (token) => ({ authorization: `Bearer ${token}` });
const mc = (token, query) =>
  call('/search/marriage-candidates', { query, headers: token ? bearer(token) : {} });

// ---- 前置条件自检：第 12 世对「登录非成员」必须是隐藏的（否则下面的对照无意义）----
test('前置条件：第 12 世女性节点落在登录非成员的 hideTail 之内（分层口径未改）', () => {
  assert.equal(LOGIN_HIDE_TAIL, HIDDEN_TAIL_LOGIN, '登录档 hideTail 必须仍是 9 世');
  const access = computeAccess({
    treeId: TREE,
    isMaster: false,
    role: 'user',
    anchorTreeId: null, // 非成员
    people,
    families,
  });
  assert.equal(access.mode, 'partial');
  assert.equal(access.visibleMaxDepth, 12 - HIDDEN_TAIL_LOGIN, '12 世链 − 9 世 = 可见到第 3 世');
  assert.equal(access.isHiddenPerson(H.f1), true, '顾景月（第 12 世）对非成员必须不可见');
  assert.equal(access.isHiddenPerson(H.g(1)), false, '最古老 1 世…第 3 世仍可见');
});

// ================= A1 鉴权 =================

test('A1 未登录 / 失效 token / 过期 token / 用户不存在 → 401（绝不静默降级 guest 档）', async () => {
  const q = { query: '景月', tree_id: TREE, gender: 'F' };

  const anon = await mc('', q);
  assert.equal(anon.statusCode, 401, '无 token 必须 401（不得 200 []）');
  assert.ok(JSON.parse(anon.body).error, '401 必须带明确文案');

  const bad = await mc('not-a-real-token', q);
  assert.equal(bad.statusCode, 401, '失效 token 必须 401');

  const expiredToken = signJwt({ sub: P_NO_ANCHOR, phone: P_NO_ANCHOR, role: 'user' }, -60); // exp 已过
  const exp = await mc(expiredToken, q);
  assert.equal(exp.statusCode, 401, '过期 token 必须 401');

  const gone = await mc(tokenOf(P_GONE), q);
  assert.equal(gone.statusCode, 401, 'token 有效但用户不存在必须 401');

  // 反证：未登录走树内 /search 是 200 + 空（guest 档分层），而本通道**绝不**走这条路
  const oldGuest = await call('/search', { query: { query: '景月' }, headers: { 'x-tree-id': TREE } });
  assert.equal(oldGuest.statusCode, 200);
  assert.deepEqual(JSON.parse(oldGuest.body), [], '树内 /search 对 guest 仍按分层裁剪（口径不动）');
});

// ================= A2 参数 =================

test('A2 缺 tree_id → 400；tree_id 走查询参数（注册在树编辑闸门之前，无需 X-Tree-Id）', async () => {
  const token = tokenOf(P_NO_ANCHOR);
  const noTree = await mc(token, { query: '景月' });
  assert.equal(noTree.statusCode, 400, '缺 tree_id 必须 400');
  assert.match(JSON.parse(noTree.body).error, /tree_id/);

  // 不带 X-Tree-Id（也不带任何 header 之外的东西）→ 不得命中「缺少 X-Tree-Id」闸门
  const ok = await mc(token, { query: '景月', tree_id: TREE, gender: 'F' });
  assert.equal(ok.statusCode, 200, '本通道在树编辑闸门之前注册 → 无 X-Tree-Id 也应 200');
  assert.equal(JSON.parse(ok.body).total, 1);

  const ghost = await mc(token, { query: '景月', tree_id: 'nope_tree' });
  assert.equal(ghost.statusCode, 404, '目标树不存在 → 404');
});

test('A2 空 query（缺省 / 空白）→ 200 + 空候选（与树内 /search 一致）', async () => {
  const token = tokenOf(P_NO_ANCHOR);
  for (const q of [undefined, '', '   ']) {
    const r = await mc(token, { query: q, tree_id: TREE });
    assert.equal(r.statusCode, 200);
    const body = JSON.parse(r.body);
    assert.deepEqual(body.candidates, [], `query=${JSON.stringify(q)} 应返空候选`);
    assert.equal(body.total, 0);
  }
});

test('A2 limit：默认 20、clamp 1..50（候选更少时以实际命中数为准）', async () => {
  const token = tokenOf(P_NO_ANCHOR);
  const listOf = async (limit) => {
    const q = { query: '顾', tree_id: TREE };
    if (limit !== undefined) q.limit = limit;
    const r = await mc(token, q);
    assert.equal(r.statusCode, 200);
    return JSON.parse(r.body);
  };
  // 命中数 = 第 1–11 世 11 人 + 顾景月 + 顾景山 + 顾多1..60 = 73（性别未知 / 镜像不计）
  const expected = CHAIN + 2 + EXTRA_N;
  assert.equal((await listOf()).candidates.length, 20, '默认 20');
  assert.equal((await listOf()).total, expected, 'total = 截断前命中总数');
  assert.equal((await listOf(3)).candidates.length, 3);
  assert.equal((await listOf(3)).total, expected);
  assert.equal((await listOf(999)).candidates.length, 50, '上限 clamp 到 50');
  assert.equal((await listOf(0)).candidates.length, 1, '下限 clamp 到 1');
  assert.equal((await listOf(-5)).candidates.length, 1, '负数 clamp 到 1');
  assert.equal((await listOf('abc')).candidates.length, 20, '非数字 → 默认 20');
  assert.equal((await listOf(45)).candidates.length, 45, '范围内按传入值截断');
  assert.equal((await listOf(50)).candidates.length, 50, '正好等于上限 → 不截断');
});

// ================= A3 核心：不套读裁剪 =================

test('A3 核心：登录非成员也能搜到目标树近代世女性节点 —— 树内 /search 返 0、新通道返 1', async () => {
  for (const [label, phone] of [['无锚点', P_NO_ANCHOR], ['锚点在其它树', P_OTHER_ANCHOR]]) {
    const token = tokenOf(phone);
    // ① 树内 /search（对目标树设 X-Tree-Id）：按分层裁剪 → 顾景月在第 12 世 → 0 条
    const old = await call('/search', {
      query: { query: '景月', pagesize: '20' },
      headers: { 'x-tree-id': TREE, ...bearer(token) },
    });
    assert.equal(old.statusCode, 200);
    assert.deepEqual(JSON.parse(old.body), [], `[${label}] 树内 /search 对非成员仍 0 条（分层口径不动）`);

    // ② 新通道：同一查询 → 恰好 1 条 = 顾景月
    const r = await mc(token, { query: '景月', tree_id: TREE, gender: 'F' });
    assert.equal(r.statusCode, 200, `[${label}] 新通道应放行`);
    const body = JSON.parse(r.body);
    assert.equal(body.tree_id, TREE);
    assert.equal(body.total, 1, `[${label}] 应命中 1 条（恰为 hideTail 之内的那个女性节点）`);
    assert.equal(body.candidates.length, 1);
    assert.equal(body.candidates[0].handle, H.f1);
    assert.equal(body.candidates[0].gramps_id, ID.f1);
    assert.equal(body.candidates[0].name, '顾景月');
    assert.equal(body.candidates[0].gender, 'F');
    assert.equal(body.candidates[0].is_living, true);
  }
});

// ================= A4 字段白名单 =================

test('A4 出参字段白名单：候选对象键集恰为五项（不得夹带生卒 / profile / external_*）', async () => {
  const token = tokenOf(P_NO_ANCHOR);
  const r = await mc(token, { query: '顾', tree_id: TREE, limit: 5 });
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  const WANT = ['gender', 'gramps_id', 'handle', 'is_living', 'name'];
  assert.ok(body.candidates.length > 0);
  for (const c of body.candidates) {
    assert.deepEqual(Object.keys(c).sort(), WANT, '候选键集必须恰为五项（多一个都算红）');
    assert.equal(typeof c.handle, 'string');
    assert.equal(typeof c.gramps_id, 'string');
    assert.equal(typeof c.name, 'string');
    assert.equal(typeof c.gender, 'string');
    assert.equal(typeof c.is_living, 'boolean');
  }
  // 白名单外的一切都不得出现在响应体里（生卒 / 详情指针 / 真身信息 / 家族关系）
  for (const forbidden of [
    'birth_date', 'death_date', 'birth_place', 'death_place', 'profile', 'surname', 'given',
    'parent_family', 'spouse_families', 'external_', 'legacy_gramps_id', 'attributes', 'families',
  ]) {
    assert.ok(!r.body.includes(forbidden), `响应体不得出现「${forbidden}」`);
  }
  // 镜像的真身指针（external_person_handle / external_tree）也绝不能被顶出来
  const mirOnly = await mc(token, { query: '影儿', tree_id: TREE });
  assert.deepEqual(JSON.parse(mirOnly.body).candidates, [], '镜像节点单独查询也不得出现');
});

// ================= A5 镜像排除 =================

test('A5 镜像排除：external_mirror==="true" 的节点不列入候选（娶入对象应为真身）', async () => {
  const token = tokenOf(P_NO_ANCHOR);
  // 该树里只有镜像名含「影儿」
  const onlyMirror = JSON.parse((await mc(token, { query: '影儿', tree_id: TREE })).body);
  assert.equal(onlyMirror.total, 0, '镜像不得作为候选');

  // 同名查询（顾）里，镜像 handle 也不得出现
  const broad = JSON.parse((await mc(token, { query: '顾', tree_id: TREE, limit: 50 })).body);
  assert.ok(!broad.candidates.some((c) => c.handle === H.mir), '宽查询里镜像同样被排除');
  assert.ok(broad.candidates.some((c) => c.handle === H.f1), '真身仍在候选里');

  // 镜像 handle 精确命中（编号 / handle 写法）→ 同样不列入（本通道候选集排除镜像）
  const byHandle = JSON.parse((await mc(token, { query: H.mir, tree_id: TREE, gender: 'F' })).body);
  assert.equal(byHandle.total, 0, '按 handle 精确命中的镜像也不列入（写路径的强填兜底本轮不做拦截）');
});

// ================= A6 性别口径 =================

test('A6 性别口径不变：gender=F 只返回女性；M 只返回男性；其它值忽略；U / 0 一律不列入', async () => {
  const token = tokenOf(P_NO_ANCHOR);
  const f = JSON.parse((await mc(token, { query: '顾', tree_id: TREE, gender: 'F', limit: 50 })).body);
  assert.ok(f.candidates.length > 0);
  assert.ok(f.candidates.every((c) => c.gender === 'F'), 'gender=F 只返回女性');
  assert.deepEqual(f.candidates.map((c) => c.handle).sort(), [H.f1, ...Array.from({ length: 5 }, (_, i) => H.g(i * 2 + 2))].sort(),
    '女性恰为第 2 / 4 / 6 / 8 / 10 世 + 顾景月');

  const m = JSON.parse((await mc(token, { query: '顾', tree_id: TREE, gender: 'M', limit: 50 })).body);
  assert.ok(m.candidates.every((c) => c.gender === 'M'), 'gender=M 只返回男性');
  assert.ok(!m.candidates.some((c) => c.handle === H.f1));

  // 性别未知（U / '0'）两种写法都不得列入 —— 有无 gender 参数都不行
  for (const q of [
    { query: '未知', tree_id: TREE, gender: 'F' },
    { query: '未知', tree_id: TREE },
    { query: '顾', tree_id: TREE, limit: 50 },
    { query: ID.u1, tree_id: TREE, gender: 'F' },
  ]) {
    const r = JSON.parse((await mc(token, q)).body);
    assert.ok(!r.candidates.some((c) => c.handle === H.u1 || c.handle === H.z0),
      `性别未知不得列入（query=${JSON.stringify(q)}）`);
  }
  assert.equal(JSON.parse((await mc(token, { query: '顾零', tree_id: TREE, gender: 'F' })).body).total, 0);
  assert.equal(JSON.parse((await mc(token, { query: '未知', tree_id: TREE })).body).total, 0);

  // gender 只认 'F' / 'M'：其它值（含小写 / 空 / 数字）一律忽略 → 不做性别定向过滤
  const ignored = JSON.parse((await mc(token, { query: '顾', tree_id: TREE, gender: 'f', limit: 50 })).body);
  assert.ok(ignored.candidates.some((c) => c.gender === 'M'), "小写 'f' 被忽略 → 男女都在");
  assert.ok(ignored.candidates.some((c) => c.gender === 'F'));
});

// ================= A7 匹配与排序 =================

test('A7 匹配：编号 / handle / 树内旧号精确命中置顶；姓名去空格大小写不敏感 contains', async () => {
  const token = tokenOf(P_NO_ANCHOR);

  // 全局编号（顾景山 I000713 → 数字形态 000713）
  const byId = JSON.parse((await mc(token, { query: '000713', tree_id: TREE, gender: 'M' })).body);
  assert.equal(byId.total, 1);
  assert.equal(byId.candidates[0].handle, H.m1, '全局编号命中');

  // 树内旧号（第 5 世 legacy_gramps_id = 0050）→ 经 resolveNode 限定目标树解析
  const byLegacy = JSON.parse((await mc(token, { query: LEGACY_G5, tree_id: TREE })).body);
  assert.equal(byLegacy.total, 1);
  assert.equal(byLegacy.candidates[0].handle, H.g(5), '树内旧号命中');

  // handle 精确命中
  const byHandle = JSON.parse((await mc(token, { query: H.f1, tree_id: TREE, gender: 'F' })).body);
  assert.equal(byHandle.total, 1);
  assert.equal(byHandle.candidates[0].handle, H.f1);

  // 置顶：query=顾景月 的编号 → 即便该节点在 people 键序里靠后，也必须排第一
  const pinned = JSON.parse((await mc(token, { query: ID.m1, tree_id: TREE, limit: 5 })).body);
  assert.equal(pinned.candidates[0].handle, H.m1, '编号精确命中置顶');

  // 姓名匹配：去空格 + 大小写不敏感 + contains（'顾 景 月' 去空格后命中）
  const spaced = JSON.parse((await mc(token, { query: '顾 景 月', tree_id: TREE, gender: 'F' })).body);
  assert.equal(spaced.total, 1);
  assert.equal(spaced.candidates[0].handle, H.f1);

  // 排序：非置顶命中保持树内 people 键序（顾氏1 → 顾氏2 → …）
  const seq = JSON.parse((await mc(token, { query: '顾氏', tree_id: TREE, limit: 50 })).body);
  assert.deepEqual(
    seq.candidates.slice(0, 3).map((c) => c.handle),
    [H.g(1), H.g(2), H.g(3)],
    '其余候选保持树内 people 键序',
  );
});

// ================= 真源体检 =================

test('E1 真源未被改动：config/tree-meta.json + migrate-output/trees + collections 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 真源 md5 不得变化');
  const trees = dirBaseline(REAL_TREES);
  const cols = dirBaseline(REAL_COLLECTIONS);
  assert.deepEqual([...trees.keys()].sort(), [...realTreeBaseline.keys()].sort(), 'trees 目录文件清单不得变化');
  assert.deepEqual([...cols.keys()].sort(), [...realColBaseline.keys()].sort(), 'collections 目录文件清单不得变化');
  for (const [f, h] of realTreeBaseline) assert.equal(trees.get(f), h, `trees/${f} 不得变化`);
  for (const [f, h] of realColBaseline) assert.equal(cols.get(f), h, `collections/${f} 不得变化`);
  assert.ok(TMP.startsWith(os.tmpdir()), '沙箱目录必须在 /tmp 下');
});
