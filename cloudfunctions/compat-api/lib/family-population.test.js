/**
 * 「家族人数」口径单测 —— `/tree/rank` 的 `person_count`（`lib/family-population.js`）
 *
 * 契约（用户 2026-09-19 **重新拍板：纯血缘图 / 姓文本彻底弃用**；详见 lib/family-population.js 文件头）：
 *   1. 父/母映射只认树内 people 的 handle（引用不到人的槽位等于空）
 *   2. 根 = 无父记录（有母无父也算根 —— 父系链到此为止，母系起始节点不断链）
 *   3. 外来姻亲根 = 占配偶槽、且对方**有父记录**（对方属本树谱系）的根 ⇒ 姑父 / 妹夫 / 女婿类
 *   4. 本族 = （根 − 外来姻亲根）沿「父→子女」向下闭包：P 本族 ⟺ P 的父是本族
 *   5. 婚入妇 = 非本族、性别 ≠ 'M'（含 'F'/'U'）、配偶是本族的配偶槽
 *   6. 人数 = |本族 ∪ 婚入妇|；**镜像按血缘位置判定、不单独过滤**
 *      （真源验收数值：ji_23395_01 87 / gu_39038_01 21 / liu_21016_01 17 / shen_27784_01 10）
 *   7. 分层：仅 kind==='family'（或缺省 ⇒ family）走新口径；`clan`（祖谱）/ `master`（世本）
 *      保持 = 树内 people 数（真源：世本 112、祖谱 2/2/37/4 不变）
 *   8. 姓文本（surname_char / 始祖 surname / 众数）不再参与任何计数；旧签名 `(tree, entry)` 仍可用
 *
 * 覆盖：
 *   U1 四集合逐值（根 / 外来姻亲根 / 本族 / 婚入妇）
 *   U2 外来姻亲根 + 其子女剔除；女儿本人（本族女性）计入
 *   U3 镜像按血缘位置：血位上的 marriage / child 镜像计入，姻亲位上的剔除
 *   U4 有母无父也算根（母系起始节点不断链）
 *   U5 树内婚配由男方算入（本族女所嫁本族男，其子仍本族）
 *   U6 分层 clan / master 保持 people 数；旧签名与第三参数形状均向后兼容
 *   U7 空树 / 无 people → 0，不抛
 *   U8 计数域 = people 键（families 引用的幽灵 handle 不计）；姓文本改动不影响计数
 *   R1 路由级（家族树）：person_count 走纯血缘口径、mirror_count 字段保留、响应形状不变
 *   R2/R3 路由级（祖谱 kind=clan / 世本 is_master）：保持 people 数
 *   R4 路由级：未知树 → 404
 *
 * 数据安全：纯内存夹具；路由级用例把 COMPAT_OUT_DIR / COMPAT_META_FILE 指向 /tmp 副本，
 * 仅写入自己的夹具文件（不读真源、不写真源）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/family-population.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-family-population-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');
for (const d of ['trees', 'details', 'collections']) fs.mkdirSync(path.join(TMP, d), { recursive: true });

const { countFamilyMembers, listExcludedMembers, analyzeFamilyGraph, treeKind, isMirrorNode } = await import(
  './family-population.js'
);
const { handleRequest } = await import('../index.js');

// ---------------- 夹具工具 ----------------

/** 最小人物节点（surname 只是文本，**不得影响计数**） */
const person = (handle, surname, extra = {}) => ({
  handle, gramps_id: `I${handle}`, name: `${surname}某`, surname, gender: 'M', ...extra,
});
/** 最小家族 */
const family = (handle, father, mother, children) => ({
  handle, gramps_id: `F${handle}`, father_handle: father || '', mother_handle: mother || '', child_handles: children,
});
const treeOf = (people, families = {}) => ({ tree_id: 'fixture', people, families });
const mirror = (extra = {}) => ({ external_mirror: 'true', ...extra });

/**
 * 标准夹具（覆盖全部判据）：
 *   h_gf 季男（根）✕ h_gm 王女（根；双方都是根 ⇒ 均本族）
 *     ├ h_f 季男（本族）── h_w 李女（marriage 镜像，配偶有父）⇒ 外来姻亲根 + 婚入妇 ⇒ 计入
 *     │    ├ h_c 季男（本族）
 *     │    └ h_d 季女（本族女性 ⇒ 计入）
 *     │          └ f3：h_dh 张男（外来姻亲根 ⇒ 剔除）✕ h_d ⇒ h_dc 张男（child 镜像，父非本族 ⇒ 剔除）
 *     └ h_sis 季女（本族女性 ⇒ 计入）
 *   f4：h_c ✕ h_u 赵'U'（外来姻亲根，性别未知 ⇒ 婚入妇 ⇒ 计入）
 *   本族 = h_gf,h_gm,h_f,h_c,h_d,h_sis（6）；婚入妇 = h_w,h_u（2）⇒ 计入 8
 *   people = 10 ⇒ 剔除 h_dh,h_dc
 */
const FIX = treeOf(
  {
    h_gf: person('h_gf', '季'),
    h_gm: person('h_gm', '王', { gender: 'F' }),
    h_f: person('h_f', '季'),
    h_w: person('h_w', '李', { gender: 'F', ...mirror({ external_link_type: 'marriage' }) }),
    h_c: person('h_c', '季'),
    h_d: person('h_d', '季', { gender: 'F' }),
    h_dh: person('h_dh', '张'),
    h_dc: person('h_dc', '张', { ...mirror({ external_link_type: 'child' }) }),
    h_sis: person('h_sis', '季', { gender: 'F' }),
    h_u: person('h_u', '赵', { gender: 'U' }),
  },
  {
    f1: family('f1', 'h_gf', 'h_gm', ['h_f', 'h_sis']),
    f2: family('f2', 'h_f', 'h_w', ['h_c', 'h_d']),
    f3: family('f3', 'h_dh', 'h_d', ['h_dc']),
    f4: family('f4', 'h_c', 'h_u', []),
  },
);

// ---------------- U1–U8：纯血缘图（单元） ----------------

test('U1 根 / 外来姻亲根 / 本族 / 婚入妇 四集合逐值', () => {
  const g = analyzeFamilyGraph(FIX);
  assert.deepEqual([...g.roots].sort(), ['h_dh', 'h_gf', 'h_gm', 'h_u', 'h_w'], '根 = 无父记录（含外来姻亲根）');
  assert.deepEqual([...g.inLawRoots].sort(), ['h_dh', 'h_u', 'h_w'], '占配偶槽且对方有父记录 ⇒ 外来姻亲根');
  assert.deepEqual([...g.clan].sort(), ['h_c', 'h_d', 'h_f', 'h_gf', 'h_gm', 'h_sis'], '本族 = 根−姻亲根 沿父→子女闭包');
  assert.deepEqual([...g.marriedIn].sort(), ['h_u', 'h_w'], '婚入妇 = 非本族 + 性别≠M + 配偶本族（镜像照计）');
  assert.equal(g.counted.size, 8);
});

test('U2 外来姻亲根及其子女剔除；本族女性（女儿）本人计入', () => {
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(FIX, entry), 8);
  assert.deepEqual(listExcludedMembers(FIX, entry).sort(), ['h_dc', 'h_dh']);
});

test('U3 镜像按血缘位置：血位上的 marriage / child 镜像计入，姻亲位上的剔除', () => {
  const tree = treeOf(
    {
      h_gg: person('h_gg', '季'), // 根 ⇒ 本族
      h_s: person('h_s', '季'), // h_gg 之子 ⇒ 本族
      h_sw: person('h_sw', '李', { gender: 'F', ...mirror({ external_link_type: 'marriage' }) }), // 媳妇镜像 ⇒ 婚入妇
      h_ckid: person('h_ckid', '季', mirror({ external_link_type: 'child' })), // 本族男之子（child 镜像）⇒ 本族
      h_d: person('h_d', '季', { gender: 'F' }), // 本族女性
      h_dh: person('h_dh', '张', mirror({ external_link_type: 'marriage' })), // 女婿镜像 ⇒ 外来姻亲根 ⇒ 剔除
      h_kid: person('h_kid', '张', mirror({ external_link_type: 'child' })), // 女婿之子（child 镜像）⇒ 父非本族 ⇒ 剔除
    },
    {
      f1: family('f1', 'h_gg', '', ['h_s', 'h_d']),
      f2: family('f2', 'h_s', 'h_sw', ['h_ckid']),
      f3: family('f3', 'h_dh', 'h_d', ['h_kid']),
    },
  );
  assert.equal(countFamilyMembers(tree, null), 5, 'h_gg + h_s + h_sw + h_ckid + h_d；h_dh / h_kid 剔除');
  assert.deepEqual(listExcludedMembers(tree, null).sort(), ['h_dh', 'h_kid']);
});

test('U4 有母无父也算根（母系起始节点不断链）', () => {
  const tree = treeOf(
    { h_m: person('h_m', '华', { gender: 'F' }), h_s: person('h_s', '风') },
    { f1: family('f1', '', 'h_m', ['h_s']) }, // 无父槽：h_s 有母无父 ⇒ 仍是根 ⇒ 本族
  );
  assert.equal(countFamilyMembers(tree, null), 2);
  assert.deepEqual(listExcludedMembers(tree, null), []);
});

test('U5 树内婚配由男方算入：本族女所嫁本族男（有父），其子仍本族', () => {
  const tree = treeOf(
    {
      h_a: person('h_a', '季'), // 根 ⇒ 本族
      h_b: person('h_b', '季', { gender: 'F' }), // h_a 之女 ⇒ 本族女性
      h_x: person('h_x', '季'), // 另一根 ⇒ 本族
      h_c: person('h_c', '季'), // h_x 之子 ⇒ 本族男（有父 ⇒ 不是外来姻亲根）
      h_kid: person('h_kid', '季'),
    },
    {
      f1: family('f1', 'h_a', '', ['h_b']),
      f2: family('f2', 'h_x', '', ['h_c']),
      f3: family('f3', 'h_c', 'h_b', ['h_kid']),
    },
  );
  assert.equal(countFamilyMembers(tree, null), 5, 'h_b 本人本族（父是本族）；h_kid 的父 h_c 本族 ⇒ 计入');
  assert.deepEqual(listExcludedMembers(tree, null), []);
});

test('U6 分层：clan / master 保持 = 树内 people 数；family（缺省）走新口径；旧签名兼容', () => {
  const n = Object.keys(FIX.people).length; // 10
  assert.equal(countFamilyMembers(FIX, { tree_id: 'fixture', kind: 'clan' }, { kind: 'clan' }), n);
  assert.equal(countFamilyMembers(FIX, { tree_id: 'fixture', kind: 'master' }), n);
  assert.equal(countFamilyMembers(FIX, { tree_id: 'fixture', is_master: true }), n);
  assert.equal(countFamilyMembers(FIX, { tree_id: 'fixture', kind: 'family' }), 8);
  assert.equal(countFamilyMembers(FIX, null), 8, '缺省 ⇒ family');
  assert.equal(countFamilyMembers(FIX, { tree_id: 'fixture' }, 'clan'), n, '第三参数可传字符串 kind');
  assert.equal(countFamilyMembers(FIX, { tree_id: 'fixture', kind: 'clan' }, { kind: 'family' }), 8, '第三参数覆盖 entry');
  assert.equal(countFamilyMembers(FIX, { tree_id: 'fixture' }), 8, '旧签名 (tree, entry) 不崩');
  assert.equal(treeKind(null), 'family');
  assert.equal(treeKind({ kind: 'clan' }), 'clan');
  assert.equal(treeKind({ kind: 'master', is_master: true }), 'master');
  assert.deepEqual(listExcludedMembers(FIX, { tree_id: 'fixture', kind: 'clan' }), [], '祖谱不做排除');
});

test('U7 空树 / 无 people / 无 families → 0，不抛', () => {
  assert.equal(countFamilyMembers({ tree_id: 'empty', people: {}, families: {} }, null), 0);
  assert.equal(countFamilyMembers({ tree_id: 'empty' }, { tree_id: 'empty', surname_char: '季' }), 0);
  assert.equal(countFamilyMembers({}, null), 0);
  assert.equal(countFamilyMembers(undefined, undefined), 0);
  assert.deepEqual(listExcludedMembers({ tree_id: 'empty', people: {}, families: {} }, null), []);
});

test('U8 计数域 = people 键（families 引用的幽灵 handle 不是人）；姓文本彻底不参与', () => {
  const tree = treeOf(
    { h_ji: person('h_ji', '季'), h_wife: person('h_wife', '郑', { gender: 'F' }) },
    {
      f1: family('f1', 'h_ji', 'h_wife', ['h_ghost_child']), // 无 people 记录
      f2: family('f2', 'h_ghost_father', '', ['h_ji']), // 无 people 记录
    },
  );
  assert.equal(countFamilyMembers(tree, { tree_id: 'fixture', surname_char: '季' }), 2, 'h_ji + h_wife；幽灵引用不计');
  // 姓文本改动不影响计数（同一血缘图，四种 entry 结果一致）
  const nums = ['季', '王', '', undefined].map((s, i) =>
    countFamilyMembers(tree, i === 3 ? { tree_id: 'fixture' } : { tree_id: 'fixture', surname_char: s }),
  );
  assert.deepEqual(nums, [2, 2, 2, 2]);
  assert.deepEqual(listExcludedMembers(tree, { tree_id: 'fixture', surname_char: '季' }), []);
  // 镜像判定沿用既有严格口径 `String(external_mirror) === 'true'`（'true' 与布尔 true 都命中）
  assert.equal(isMirrorNode({ external_mirror: 'true' }), true);
  assert.equal(isMirrorNode({ external_mirror: true }), true);
  assert.equal(isMirrorNode({ external_mirror: 'TRUE' }), false);
  assert.equal(isMirrorNode({ external_mirror: false }), false);
  assert.equal(isMirrorNode(null), false);
});

// ---------------- R1–R4：路由级（/tree/rank） ----------------

/** 写夹具树（只落 /tmp） */
const writeTree = (tree) => fs.writeFileSync(path.join(TMP, 'trees', `${tree.tree_id}.json`), JSON.stringify(tree, null, 2));

const ROUTE_FAMILY = 'pop_route_family';
const ROUTE_CLAN = 'pop_route_clan';
const ROUTE_MASTER = 'pop_route_master';

// 同一份血缘图（10 人 / 剔除 2）；只有 tree-meta 的 kind 不同 ⇒ 验证分层
for (const tid of [ROUTE_FAMILY, ROUTE_CLAN, ROUTE_MASTER]) {
  writeTree({ tree_id: tid, version: 1, updated_at: '2026-09-19T00:00:00.000Z', people: FIX.people, families: FIX.families });
}

fs.writeFileSync(
  process.env.COMPAT_META_FILE,
  JSON.stringify({
    _schema: '1.0',
    trees: {
      [ROUTE_FAMILY]: { tree_id: ROUTE_FAMILY, kind: 'family', display_title: '季氏夹具', surname_char: '季' },
      [ROUTE_CLAN]: { tree_id: ROUTE_CLAN, kind: 'clan', display_title: '季氏祖谱', surname_char: '季' },
      [ROUTE_MASTER]: { tree_id: ROUTE_MASTER, kind: 'master', is_master: true, display_title: '世本', surname_char: '华' },
    },
  }, null, 2),
);

const rankOf = async (tid) => {
  const res = await handleRequest({ path: '/tree/rank', httpMethod: 'GET', headers: { 'X-Tree-Id': tid } });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

test('R1 GET /tree/rank（家族树）：person_count 走纯血缘口径 8，mirror_count 字段保留，形状不变', async () => {
  const { status, body } = await rankOf(ROUTE_FAMILY);
  assert.equal(status, 200);
  assert.equal(body.person_count, 8, '10 个节点 − 女婿 h_dh − 其子 h_dc；婚入妇镜像 h_w 按血位计入');
  assert.equal(body.mirror_count, 2, 'h_w（marriage 镜像）+ h_dc（child 镜像）');
  assert.equal(typeof body.mirror_count, 'number');
  // 既有出参字段仍在（形状不变，仅 person_count 口径变更）
  assert.equal(body.tree_id, ROUTE_FAMILY);
  assert.equal(typeof body.total_generations, 'number');
  assert.equal(typeof body.rank_key, 'string');
  assert.equal(typeof body.rank_label, 'string');
  assert.equal(typeof body.over_limit, 'boolean');
  assert.equal(typeof body.max_depth, 'number');
  assert.equal(typeof body.root_count, 'number');
  assert.equal(typeof body.explicit, 'boolean');
  assert.equal(typeof body.activity, 'number');
  assert.equal(typeof body.updated_at, 'string');
  assert.equal(typeof body.access, 'object');
});

test('R2 GET /tree/rank（祖谱 kind=clan）：保持 = 树内 people 数（不做血缘剔除）', async () => {
  const { status, body } = await rankOf(ROUTE_CLAN);
  assert.equal(status, 200);
  assert.equal(body.person_count, 10, '同一血缘图，祖谱口径 = people 数（既有行为不变）');
});

test('R3 GET /tree/rank（世本 is_master）：保持 = 树内 people 数', async () => {
  const { status, body } = await rankOf(ROUTE_MASTER);
  assert.equal(status, 200);
  assert.equal(body.person_count, 10, '世本口径 = people 数（既有行为不变）');
});

test('R4 未知树 → 404（未登记 meta 条目不崩）', async () => {
  const { status } = await rankOf('nope_tree');
  assert.equal(status, 404);
});
