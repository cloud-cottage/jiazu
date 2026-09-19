/**
 * 「家族人数」新口径单测 —— `/tree/rank` 的 `person_count`（`lib/family-population.js`）
 *
 * 契约（用户 2026-09-19 拍板，逐条写死；详见 lib/family-population.js 文件头）：
 *   1. 本姓节点（surname === 本树本姓 S）无论男女一律计入；
 *   2. 外姓嫁入的女性一律计入（含 external_mirror='true' + external_link_type='marriage' 的媳妇镜像）；
 *   3. 「本姓女性嫁出后所生的子女」不计入（结构判据 + external_mirror='true' + link_type='child' 保险判据）；
 *      孩子本身本姓时按规则 1 计入（招赘/入谱孩子不受影响；保险判据同样受此本姓保护）；
 *   4. 其余节点（外姓男性姻亲、无家族关系记录、外部登记占位节点）照旧计入（不扩大排除范围）；
 *   5. S 解析：tree-meta `surname_char` → 始祖（founder_handle → founder_gramps_id → 'I0001'）surname
 *      → 全树非空 surname 众数（并列取字典序最小）→ ''（S 为空则规则 3 不生效，返回全树人数）。
 *
 * 覆盖：
 *   P1 本姓男 + 外姓女 → 子女计入；外姓母亲的非本姓子女也不排除（规则 4）
 *   P2 本姓女 + 外姓男 → 子女剔除（listExcludedMembers 点名该 handle）
 *   P3 同 P2 但孩子本姓 → 计入（规则 1 优先于规则 3）
 *   P4 母亲本姓、父亲槽为空、孩子非本姓 → 剔除
 *   P5 双本姓父母 → 子女（哪怕外姓）计入
 *   P6 嫁入女性（含 marriage 镜像）计入
 *   P7 始祖镜像（external_mirror='true' + link_type='founder'）计入
 *   P8 外姓 child 镜像剔除 —— 且**无任何家族关系**时也剔除（证明保险判据独立生效）
 *   P8b 本姓 child 镜像（surname === S）计入 —— 保险判据受本姓保护，规则 1 优先于规则 3
 *   P8c 对照：同形状外姓 → 剔除（证明差异只来自本姓）
 *   P9 S 解析四级：meta surname_char / 始祖 handle / 始祖 gramps_id / 'I0001' / 众数（含并列取字典序最小）
 *   P10 S 为空 → 规则 3 不生效，返回全树人数（不排除任何节点）
 *   P11 空树 / 无 people → 0
 *   P12 计数域与既有 computeTreeDepth().personCount 一致（people ∪ families 引用）
 *   R1 路由级：GET /tree/rank → person_count 走新口径、mirror_count 字段保留、既有响应形状仍在
 *      （含外姓 child 镜像剔除 / 本姓 child 镜像计入）
 *   R2 路由级：无 surname_char 的树 → S 由始祖 handle 解析，同样生效
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

const { resolveTreeSurname, countFamilyMembers, listExcludedMembers } = await import('./family-population.js');
const { handleRequest } = await import('../index.js');

// ---------------- 夹具工具 ----------------

/** 最小人物节点 */
const person = (handle, surname, extra = {}) => ({
  handle, gramps_id: `I${handle}`, name: `${surname}某`, surname, gender: 'M', ...extra,
});
/** 最小家族 */
const family = (handle, father, mother, children) => ({
  handle, gramps_id: `F${handle}`, father_handle: father || '', mother_handle: mother || '', child_handles: children,
});
const treeOf = (people, families = {}) => ({ tree_id: 'fixture', people, families });

// ---------------- P1–P5：结构判据 ----------------

test('P1 本姓男 + 外姓女 → 子女计入；外姓母亲的非本姓子女也计入（规则 1 / 规则 4）', () => {
  const tree = treeOf(
    {
      h_ji: person('h_ji', '季'), // 本姓男
      h_wang: person('h_wang', '王'), // 外姓嫁入女
      h_c1: person('h_c1', '季'), // 本姓子
      h_c2: person('h_c2', '王'), // 外姓子（母亲本姓 王 ≠ S → 不排除）
    },
    { f1: family('f1', 'h_ji', 'h_wang', ['h_c1', 'h_c2']) },
  );
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(resolveTreeSurname(tree, entry), '季');
  assert.equal(countFamilyMembers(tree, entry), 4);
  assert.deepEqual(listExcludedMembers(tree, entry), []);
});

test('P2 本姓女 + 外姓男 → 子女剔除（规则 3 主判据）', () => {
  const tree = treeOf(
    {
      h_ji: person('h_ji', '季', { gender: 'F' }),
      h_li: person('h_li', '李'),
      h_kid: person('h_kid', '李'),
    },
    { f1: family('f1', 'h_li', 'h_ji', ['h_kid']) },
  );
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(tree, entry), 2);
  assert.deepEqual(listExcludedMembers(tree, entry), ['h_kid']);
});

test('P3 同 P2 但孩子本姓 → 计入（招赘/入谱的本姓孩子不受规则 3 影响）', () => {
  const tree = treeOf(
    {
      h_ji: person('h_ji', '季', { gender: 'F' }),
      h_li: person('h_li', '李'),
      h_kid: person('h_kid', '季'),
    },
    { f1: family('f1', 'h_li', 'h_ji', ['h_kid']) },
  );
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(tree, entry), 3);
  assert.deepEqual(listExcludedMembers(tree, entry), []);
});

test('P4 母亲本姓、父亲槽为空、孩子非本姓 → 剔除', () => {
  const tree = treeOf(
    {
      h_ji: person('h_ji', '季', { gender: 'F' }),
      h_kid: person('h_kid', '赵'),
    },
    { f1: family('f1', '', 'h_ji', ['h_kid']) },
  );
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(tree, entry), 1);
  assert.deepEqual(listExcludedMembers(tree, entry), ['h_kid']);
});

test('P5 双本姓父母 → 子女计入（哪怕子女外姓）', () => {
  const tree = treeOf(
    {
      h_ji1: person('h_ji1', '季'),
      h_ji2: person('h_ji2', '季', { gender: 'F' }),
      h_other: person('h_other', '钱'),
    },
    { f1: family('f1', 'h_ji1', 'h_ji2', ['h_other']) },
  );
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(tree, entry), 3);
  assert.deepEqual(listExcludedMembers(tree, entry), []);
});

// ---------------- P6–P8：镜像节点 ----------------

test('P6 嫁入女性（含 marriage 镜像）计入，且不被任何判据命中', () => {
  const tree = treeOf(
    {
      h_ji: person('h_ji', '季'),
      h_wife: person('h_wife', '周', { gender: 'F', external_mirror: 'true', external_link_type: 'marriage' }),
      h_kid: person('h_kid', '季'),
    },
    { f1: family('f1', 'h_ji', 'h_wife', ['h_kid']) },
  );
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(tree, entry), 3);
  assert.deepEqual(listExcludedMembers(tree, entry), []);
});

test("P7 始祖镜像（external_mirror='true' + link_type='founder'）计入", () => {
  const tree = treeOf({
    h_root: person('h_root', '季', { external_mirror: 'true', external_link_type: 'founder' }),
    h_other: person('h_other', '季'),
  });
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(tree, entry), 2);
  assert.deepEqual(listExcludedMembers(tree, entry), []);
});

test("P8 外姓 child 镜像剔除 —— 无任何家族关系时也剔除（保险判据独立生效）", () => {
  const tree = treeOf({
    h_mir: person('h_mir', '外', { external_mirror: 'true', external_link_type: 'child' }),
    h_plain: person('h_plain', '季'),
  });
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.deepEqual(listExcludedMembers(tree, entry), ['h_mir'], '外姓 child 镜像仍被保险判据剔除');
  assert.equal(countFamilyMembers(tree, entry), 1);
  // 保险判据严格字符串口径：'TRUE' / 'child ' / 布尔 false 均不命中
  const loose = treeOf({
    h_a: person('h_a', '季', { external_mirror: 'TRUE', external_link_type: 'child' }),
    h_b: person('h_b', '季', { external_mirror: 'true', external_link_type: 'CHILD' }),
    h_c: person('h_c', '季', { external_mirror: false, external_link_type: 'child' }),
  });
  assert.deepEqual(listExcludedMembers(loose, entry), []);
  assert.equal(countFamilyMembers(loose, entry), 3);
  // S 为空 → 保险判据也不生效（外姓 child 镜像照旧计入）
  assert.deepEqual(listExcludedMembers(tree, { tree_id: 'fixture' }), []);
});

test('P8b 本姓 child 镜像（surname === S）计入 —— 保险判据受本姓保护，规则 1 优先于规则 3', () => {
  // 情形 1：无任何家族关系（只可能被保险判据命中）→ 本姓保护使其计入
  const orphan = treeOf({
    h_mir: person('h_mir', '季', { external_mirror: 'true', external_link_type: 'child' }),
    h_plain: person('h_plain', '季'),
  });
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.deepEqual(listExcludedMembers(orphan, entry), [], '本姓 child 镜像不得被保险判据排除');
  assert.equal(countFamilyMembers(orphan, entry), 2);

  // 情形 2：挂在「外姓母亲 + 本姓父亲」家族下（主判据与保险判据均不命中）
  const inFamily = treeOf(
    {
      h_f: person('h_f', '季'),
      h_m: person('h_m', '王', { gender: 'F', external_mirror: 'true', external_link_type: 'marriage' }),
      h_kid: person('h_kid', '季', { external_mirror: 'true', external_link_type: 'child' }),
    },
    { f1: family('f1', 'h_f', 'h_m', ['h_kid']) },
  );
  assert.deepEqual(listExcludedMembers(inFamily, entry), []);
  assert.equal(countFamilyMembers(inFamily, entry), 3);
});

test('P8c 对照：与 P8b 同形状、只把镜像节点改成外姓 → 立刻被剔除（证明差异只来自本姓）', () => {
  const foreign = treeOf({
    h_mir: person('h_mir', '外', { external_mirror: 'true', external_link_type: 'child' }),
    h_plain: person('h_plain', '季'),
  });
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.deepEqual(listExcludedMembers(foreign, entry), ['h_mir']);
  assert.equal(countFamilyMembers(foreign, entry), 1);
});

// ---------------- P9：S 解析四级 ----------------

test('P9-1 meta surname_char 优先（即使始祖姓与之不同）', () => {
  const tree = treeOf({ h_root: person('h_root', '王'), h_ji: person('h_ji', '季') });
  assert.equal(resolveTreeSurname(tree, { tree_id: 'fixture', surname_char: '季', founder_handle: 'h_root' }), '季');
  assert.equal(resolveTreeSurname(tree, { tree_id: 'fixture', surname_char: '  季  ' }), '季');
});

test('P9-2 无 surname_char → 始祖 handle 的 surname', () => {
  const tree = treeOf({ h_root: person('h_root', '顾'), h_ji: person('h_ji', '季') });
  assert.equal(resolveTreeSurname(tree, { tree_id: 'fixture', founder_handle: 'h_root' }), '顾');
});

test('P9-3 founder_handle 落空 → founder_gramps_id', () => {
  const tree = treeOf({ h_root: person('h_root', '沈', { gramps_id: 'I000209' }), h_ji: person('h_ji', '季') });
  assert.equal(resolveTreeSurname(tree, { tree_id: 'fixture', founder_gramps_id: 'I000209' }), '沈');
  // founder_handle 指向不存在节点时继续下探（不因空指针中断）
  assert.equal(
    resolveTreeSurname(tree, { tree_id: 'fixture', founder_handle: 'h_missing', founder_gramps_id: 'I000209' }),
    '沈',
  );
});

test("P9-4 前三级全落空 → 字面量 'I0001'", () => {
  const tree = treeOf({ h_first: person('h_first', '刘', { gramps_id: 'I0001' }), h_ji: person('h_ji', '季') });
  assert.equal(resolveTreeSurname(tree, { tree_id: 'fixture' }), '刘');
  assert.equal(resolveTreeSurname(tree, null), '刘');
  // meta 条目存在但字段全空 → 同样下探 'I0001'
  assert.equal(resolveTreeSurname(tree, { tree_id: 'fixture', surname_char: '  ', founder_handle: '', founder_gramps_id: '' }), '刘');
});

test('P9-5 全部落空 → 众数；并列取字典序最小（与 key 顺序无关）', () => {
  const tree = treeOf({
    h_1: person('h_1', '李'),
    h_2: person('h_2', '李'),
    h_3: person('h_3', '王'),
    h_4: person('h_4', '王'),
    h_5: person('h_5', '赵'),
  });
  assert.equal(resolveTreeSurname(tree, { tree_id: 'fixture' }), '李'); // 李(U+674E) < 王(U+738B)
  const reordered = treeOf({
    h_5: person('h_5', '赵'),
    h_4: person('h_4', '王'),
    h_3: person('h_3', '王'),
    h_2: person('h_2', '李'),
    h_1: person('h_1', '李'),
  });
  assert.equal(resolveTreeSurname(reordered, null), '李');
  // 唯一众数：季 ×3
  const majority = treeOf({ h_1: person('h_1', '季'), h_2: person('h_2', '季'), h_3: person('h_3', '季'), h_4: person('h_4', '王') });
  assert.equal(resolveTreeSurname(majority, null), '季');
});

// ---------------- P10–P12 ----------------

test('P10 S 为空 → 规则 3 不生效，返回全树人数', () => {
  // 无 surname_char / 无始祖 / 无 I0001 / 无任何非空 surname
  const tree = treeOf(
    {
      h_a: { handle: 'h_a', gramps_id: 'I000020', name: '甲' },
      h_b: { handle: 'h_b', gramps_id: 'I000021', name: '乙' },
      h_c: { handle: 'h_c', gramps_id: 'I000022', name: '丙' },
    },
    { f1: family('f1', 'h_b', 'h_a', ['h_c']) },
  );
  assert.equal(resolveTreeSurname(tree, { tree_id: 'fixture' }), '');
  assert.deepEqual(listExcludedMembers(tree, { tree_id: 'fixture' }), []);
  assert.equal(countFamilyMembers(tree, { tree_id: 'fixture' }), 3);
});

test('P11 空树 / 无 people → 0', () => {
  assert.equal(countFamilyMembers({ tree_id: 'empty', people: {}, families: {} }, null), 0);
  assert.equal(countFamilyMembers({ tree_id: 'empty' }, { tree_id: 'empty', surname_char: '季' }), 0);
  assert.equal(countFamilyMembers({}, null), 0);
  assert.deepEqual(listExcludedMembers({ tree_id: 'empty', people: {}, families: {} }, null), []);
});

test('P12 计数域 = people ∪ families 引用的 handle（与既有 computeTreeDepth().personCount 一致）', () => {
  const tree = treeOf(
    {
      h_ji: person('h_ji', '季'),
      h_wife: person('h_wife', '郑'),
    },
    {
      f1: family('f1', 'h_ji', 'h_wife', ['h_ghost_child']), // h_ghost_child 无 people 记录
      f2: family('f2', 'h_ghost_father', '', ['h_ji']), // h_ghost_father 无 people 记录
    },
  );
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(tree, entry), 4); // h_ji, h_wife, h_ghost_child, h_ghost_father
});

test('P13 主判据只吃母亲本姓的家族：外姓母亲 + 外姓父亲 → 外姓子女仍计入（规则 4 不扩大排除）', () => {
  const tree = treeOf(
    {
      h_li: person('h_li', '李'),
      h_zhou: person('h_zhou', '周'),
      h_kid: person('h_kid', '周'),
      h_ji: person('h_ji', '季'),
    },
    { f1: family('f1', 'h_li', 'h_zhou', ['h_kid']), f2: family('f2', 'h_ji', '', []) },
  );
  const entry = { tree_id: 'fixture', surname_char: '季' };
  assert.equal(countFamilyMembers(tree, entry), 4);
  assert.deepEqual(listExcludedMembers(tree, entry), []);
});

// ---------------- R1–R2：路由级（/tree/rank） ----------------

/** 写夹具树 + meta 副本（只落 /tmp） */
const writeTree = (tree) => fs.writeFileSync(path.join(TMP, 'trees', `${tree.tree_id}.json`), JSON.stringify(tree, null, 2));

const ROUTE_TREE = 'pop_route_tree';
const ROUTE_TREE_NOCHAR = 'pop_route_nochar';

writeTree({
  tree_id: ROUTE_TREE,
  version: 1,
  updated_at: '2026-09-19T00:00:00.000Z',
  people: {
    h_f: person('h_f', '季'),
    h_m: person('h_m', '王', { gender: 'F', external_mirror: 'true', external_link_type: 'marriage' }),
    h_c: person('h_c', '季'),
    h_d: person('h_d', '季', { gender: 'F' }),
    h_u: person('h_u', '李'),
    h_k: person('h_k', '李'),
    h_mir: person('h_mir', '季', { external_mirror: 'true', external_link_type: 'child' }),
    h_omir: person('h_omir', '李', { external_mirror: 'true', external_link_type: 'child' }),
    h_fmir: person('h_fmir', '季', { external_mirror: 'true', external_link_type: 'founder' }),
  },
  families: {
    f1: family('f1', 'h_f', 'h_m', ['h_c']),
    f2: family('f2', 'h_u', 'h_d', ['h_k']),
  },
});

writeTree({
  tree_id: ROUTE_TREE_NOCHAR,
  version: 1,
  updated_at: '2026-09-19T00:00:00.000Z',
  people: {
    h_root: person('h_root', '顾'),
    h_d: person('h_d', '顾', { gender: 'F' }),
    h_u: person('h_u', '李'),
    h_k: person('h_k', '李'),
  },
  families: { f1: family('f1', 'h_u', 'h_d', ['h_k']) },
});

fs.writeFileSync(
  process.env.COMPAT_META_FILE,
  JSON.stringify({
    _schema: '1.0',
    trees: {
      [ROUTE_TREE]: { tree_id: ROUTE_TREE, kind: 'family', display_title: '季氏夹具', surname_char: '季' },
      [ROUTE_TREE_NOCHAR]: { tree_id: ROUTE_TREE_NOCHAR, kind: 'family', display_title: '顾氏夹具', founder_handle: 'h_root' },
    },
  }, null, 2),
);

const rankOf = async (tid) => {
  const res = await handleRequest({ path: '/tree/rank', httpMethod: 'GET', headers: { 'X-Tree-Id': tid } });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

test('R1 GET /tree/rank：person_count 走新口径（9 − 2 = 7），mirror_count 字段保留，形状不变', async () => {
  const { status, body } = await rankOf(ROUTE_TREE);
  assert.equal(status, 200);
  assert.equal(body.person_count, 7, '9 个节点里排除 h_k（本姓女所生外姓子）+ h_omir（外姓 child 镜像）；本姓 child 镜像 h_mir 计入（规则 1 优先）');
  // mirror_count 保留且口径不变（marriage + 本姓 child + 外姓 child + founder 四个镜像节点）
  assert.equal(body.mirror_count, 4);
  assert.equal(typeof body.mirror_count, 'number');
  // 既有出参字段仍在（形状不变，仅 person_count 语义变更）
  assert.equal(body.tree_id, ROUTE_TREE);
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

test('R2 无 surname_char 的树：S 由始祖 handle 解析，规则 3 依旧生效（4 − 1 = 3）', async () => {
  const { status, body } = await rankOf(ROUTE_TREE_NOCHAR);
  assert.equal(status, 200);
  assert.equal(body.person_count, 3, '顾本姓女 + 外姓男 → 外姓子 h_k 排除');
  assert.equal(body.mirror_count, 0);
});

test('R3 未知树 → 404（未登记 meta 条目不崩；缺失 entry 也走空 S 分支）', async () => {
  const { status } = await rankOf('nope_tree');
  assert.equal(status, 404);
});
