/**
 * 调整同胞排行（子女标签排序）回归单测 — 契约 = Zang 裁定 v1（2026-09，C1–C8）
 *
 * 口径（逐条对应裁定）：
 *   C1 排行真源 = `tree.families[<familyHandle>].child_handles[]` 的**数组位次**（不新增任何字段）；
 *      读路径 `profileFamily` 已按数组序输出 `children` → 本文件同时断言「DB 数组序」与「读接口 children 序」一致。
 *   C2 计费 1 片 / 次；`Tx.type` 取总册既有枚举 `edit_fee`（不自造类型）；`ref.tree_id` + `ref.person_handle`
 *      = 被拖动的那个子女节点；`desc` = 「调整排行：<姓名> 第 <位次> 位」。
 *   C3 闸门顺序：鉴权 → 只读预检 → 余额预检 → 扣费 → 落库；扣费在前、落库在后；余额不足 409 沿用既有原文。
 *   C4 no-op（提交序与现状逐位相同，含拖回原位）→ 不扣费、不写库、`noop:true`。
 *   C5 `child_handles` 必须与现有集合**完全等价**（等长 / 同元素 / 无重复），否则 400；family 不存在 → 404。
 *   C6 只读节点（始祖真身 / 上层镜像）→ 403，且 `jiazu_assets` 零变化、树零写入。
 *   C7/C8 一次提交只动**一段** family 的数组（多家族分段，互不影响）。
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（同 lib/noop-edit-integrity.test.js 模式）；
 * 收尾断言真源 `migrate-output/{trees,details,collections}` 与 `config/tree-meta.json` 逐字节 md5 未变。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/sibling-reorder.test.js
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
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-sibling-reorder-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaMd5 = md5(REAL_META);
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

// ---- 副本 tree-meta（zhonghua 条目：只读镜像文案要靠 external_tree 的树种类解析，故必须登记）----

const TREES = {
  zhonghua: { tree_id: 'zhonghua', kind: 'master', display_title: '中华世本' },
  // 每个用例一棵独立树：进程内 treeCache 常驻（无 watch），跨用例复用同一 tree_id 会读到上一用例的内存快照
  sr_main: { tree_id: 'sr_main', kind: 'family', display_title: '甲氏（排行）' },
  sr_seg: { tree_id: 'sr_seg', kind: 'family', display_title: '甲氏（分段）' },
  sr_noop: { tree_id: 'sr_noop', kind: 'family', display_title: '甲氏（no-op）' },
  sr_set: { tree_id: 'sr_set', kind: 'family', display_title: '甲氏（集合校验）' },
  sr_fam: { tree_id: 'sr_fam', kind: 'family', display_title: '甲氏（family 404）' },
  sr_miss: { tree_id: 'sr_miss', kind: 'family', display_title: '甲氏（缺参）' },
  sr_mirror: { tree_id: 'sr_mirror', kind: 'family', display_title: '乙氏（镜像只读）' },
  sr_guest: { tree_id: 'sr_guest', kind: 'family', display_title: '甲氏（游客）' },
  sr_xtree: { tree_id: 'sr_xtree', kind: 'family', display_title: '甲氏（树上下文）' },
  sr_broke: { tree_id: 'sr_broke', kind: 'family', display_title: '丙氏（余额不足）' },
  sr_fail: { tree_id: 'sr_fail', kind: 'family', display_title: '丁氏（落库失败）' },
};
fs.writeFileSync(process.env.COMPAT_META_FILE, JSON.stringify({ _schema: '1.1', trees: TREES }, null, 2) + '\n');

// ---- 用户与资产 ----

const STEWARD = '16600009301'; // tree_steward（夹具树全部可写）
const GUEST = '16600009302'; // guest（403 对照）

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '主理人', role: 'tree_steward' },
    [GUEST]: { _id: GUEST, phone: GUEST, nickname: '游客', role: 'guest' },
  }),
);

const el = await import('./economy-ledger.js');
const eco = await import('./economy-fee.js');
const tw = await import('./tree-write.js');
const fa = await import('./founder-attach.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const DAY = 86400000;
const bambooLot = (qty, expDays, id) => ({
  id: id || el.nextLotId('bl'),
  qty,
  expires_at: new Date(Date.now() + expDays * DAY).toISOString(),
  source: 'admin',
  created_at: new Date().toISOString(),
});
const setAssets = (phone, patch) => el.mutateAssets(phone, (u) => Object.assign(u, patch));
const readAssets = (phone) => el.getAssets(phone);
const bagOf = (u) => JSON.stringify({ fragments: u.fragments, seeds: u.seeds, bamboos: u.bamboos, jades: u.jades });
const txTypes = (u) => (u.txs || []).map((t) => t.type);
const bee = (phone) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: 'user' }, 3600)}` });
const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: query,
    body: body === null ? undefined : JSON.stringify(body),
  });
const bodyOf = (res) => JSON.parse(res.body);
const H = (treeId, phone = STEWARD) => ({ ...bee(phone), 'x-tree-id': treeId });

// ---- 磁盘夹具 ----

const treePath = (id) => path.join(TMP, 'trees', `${id}.json`);
const treeMd5 = (id) => md5(treePath(id));
const readTree = (id) => JSON.parse(fs.readFileSync(treePath(id), 'utf8'));
const assetsMd5 = () => md5(path.join(TMP, 'collections', 'jiazu_assets.json'));
function writeTree(tree) {
  fs.mkdirSync(path.dirname(treePath(tree.tree_id)), { recursive: true });
  fs.writeFileSync(treePath(tree.tree_id), JSON.stringify(tree, null, 2));
}
async function scene({ trees = [], phone = STEWARD, bamboos = 0 } = {}) {
  for (const t of trees) writeTree(t);
  await setAssets(phone, {
    fragments: 0,
    seeds: [],
    bamboos: bamboos ? [bambooLot(bamboos, 100, `bl_${phone}`)] : [],
    jades: [],
    txs: [],
    signin_date: '',
  });
}

const SCHEMA = { _schema: '1.0', version: 1, updated_at: '2020-01-01T00:00:00.000Z' };
const node = (h, gid, name, extra = {}) => ({
  handle: h,
  gramps_id: gid,
  name,
  surname: name.slice(0, 1),
  given: name.slice(1),
  gender: 'M',
  birth_date: '',
  death_date: '',
  birth_place: '',
  death_place: '',
  parent_family: '',
  spouse_families: [],
  ...extra,
});

/**
 * 排行夹具树（覆盖真实形态）：一个节点两段配偶家族（C8 分段）
 *   f1 甲父 ─┬ fam1（母 m1）：子女 c1 甲一 / c2 甲二 / c3 甲三 / c4 甲四
 *            └ fam2（母 m2）：子女 d1 甲五 / d2 甲六
 */
function reorderTree(id = 'sr_main') {
  return {
    ...SCHEMA,
    tree_id: id,
    founder_gramps_id: 'I0400',
    people: {
      f1: node('f1', 'I0400', '甲父', { spouse_families: ['fam1', 'fam2'] }),
      m1: node('m1', 'I0401', '甲母', { gender: 'F', spouse_families: ['fam1'] }),
      m2: node('m2', 'I0402', '甲继母', { gender: 'F', spouse_families: ['fam2'] }),
      c1: node('c1', 'I0403', '甲一', { parent_family: 'fam1' }),
      c2: node('c2', 'I0404', '甲二', { parent_family: 'fam1' }),
      c3: node('c3', 'I0405', '甲三', { parent_family: 'fam1' }),
      c4: node('c4', 'I0406', '甲四', { parent_family: 'fam1' }),
      d1: node('d1', 'I0407', '甲五', { parent_family: 'fam2' }),
      d2: node('d2', 'I0408', '甲六', { parent_family: 'fam2' }),
    },
    families: {
      fam1: { handle: 'fam1', gramps_id: 'F0400', father_handle: 'f1', mother_handle: 'm1', child_handles: ['c1', 'c2', 'c3', 'c4'] },
      fam2: { handle: 'fam2', gramps_id: 'F0401', father_handle: 'f1', mother_handle: 'm2', child_handles: ['d1', 'd2'] },
    },
  };
}

/** 只读镜像夹具树：子女里放一个上层镜像节点（external_mirror + 指向世本） */
function mirrorTree(id = 'sr_mirror') {
  return {
    ...SCHEMA,
    tree_id: id,
    founder_gramps_id: 'I0500',
    people: {
      f1: node('f1', 'I0500', '乙父', { spouse_families: ['fam1'] }),
      m1: node('m1', 'I0501', '乙母', { gender: 'F', spouse_families: ['fam1'] }),
      mi1: node('mi1', 'I0502', '乙镜像', {
        external_mirror: 'true',
        external_tree: 'zhonghua',
        external_link_type: 'founder',
        parent_family: 'fam1',
      }),
      mc1: node('mc1', 'I0503', '乙子', { parent_family: 'fam1' }),
    },
    families: {
      fam1: { handle: 'fam1', gramps_id: 'F0500', father_handle: 'f1', mother_handle: 'm1', child_handles: ['mi1', 'mc1'] },
    },
  };
}

const reorder = (treeId, familyHandle, personHandle, childHandles, phone = STEWARD) =>
  call('/admin/sibling-reorder', 'POST', H(treeId, phone), {}, {
    tree_id: treeId,
    family_handle: familyHandle,
    person_handle: personHandle,
    child_handles: childHandles,
  });

// ================= ① 纯函数：单价表 / 集合等价判定 =================

test('单价表：sibling_reorder = 1 片 / 次，Tx.type 取既有枚举 edit_fee（不自造类型）', () => {
  assert.equal(eco.FEE.sibling_reorder, 1);
  assert.deepEqual(eco.feeOf('sibling_reorder'), { unit: 'bamboos', pieces: 1, tx_type: 'edit_fee' });
  assert.equal(eco.TX_TYPE_OF_OP.sibling_reorder, 'edit_fee');
  // 与既有「人物内容修改」同枚举（总册 19 项里 edit_fee 已存在，未新增类型）
  assert.equal(eco.feeOf('sibling_reorder').tx_type, eco.feeOf('person_update').tx_type);
  // 与被动移位兄弟数量无关：单价是常量，不接 people_count
  assert.equal(eco.feeOf('sibling_reorder', { people_count: 99, mode: 'subtree' }).pieces, 1);
});

test('集合等价判定（纯函数 sameChildHandleSet）：等长 / 同元素 / 无重复 才算等价', () => {
  const cur = ['c1', 'c2', 'c3'];
  assert.equal(tw.sameChildHandleSet(cur, ['c3', 'c1', 'c2']), true, '纯排列 = 等价');
  assert.equal(tw.sameChildHandleSet(cur, ['c1', 'c2']), false, '少一个 = 不等价');
  assert.equal(tw.sameChildHandleSet(cur, ['c1', 'c2', 'c3', 'c4']), false, '多一个 = 不等价');
  assert.equal(tw.sameChildHandleSet(cur, ['c1', 'c2', 'c9']), false, '换人 = 不等价');
  assert.equal(tw.sameChildHandleSet(cur, ['c1', 'c2', 'c2']), false, '重复 = 不等价');
});

// ================= ② 正常重排（C1 / C2 / C8）=================

test('正常重排：数组序落盘 = 提交序，读接口 children 同步生效；扣 1 片 edit_fee 且 ref/desc 完整', async () => {
  await scene({ trees: [reorderTree('sr_main')], phone: STEWARD, bamboos: 5 });
  const t0 = treeMd5('sr_main');
  const v0 = readTree('sr_main').version;
  const bag0 = bagOf(await readAssets(STEWARD));

  // 甲三 第 3 位 → 第 2 位（甲二、甲三 互换）
  const res = await reorder('sr_main', 'fam1', 'c3', ['c1', 'c3', 'c2', 'c4']);
  const b = bodyOf(res);
  assert.equal(res.statusCode, 200, `正常重排应 200（实际 ${res.statusCode} ${res.body}）`);
  assert.equal(b.ok, true);
  assert.equal(b.noop, false);
  assert.equal(b.position, 2, '新位次（1 起）');
  assert.equal(b.previous_position, 3, '原位次（1 起）');
  assert.deepEqual(b.child_handles, ['c1', 'c3', 'c2', 'c4']);
  assert.deepEqual(b.fee, { unit: 'bamboos', pieces: 1, balance: 5, balance_after: 4 }, '1 片 / 次');

  // ① 落盘序 = 提交序（DB 真值）
  assert.notEqual(treeMd5('sr_main'), t0, '树已重写');
  const disk = readTree('sr_main');
  assert.deepEqual(disk.families.fam1.child_handles, ['c1', 'c3', 'c2', 'c4'], 'DB 数组序 = 提交序');
  assert.equal(disk.version, v0 + 1, 'version +1（单次落盘）');
  // C8：另一段 family 一个字节不动
  assert.deepEqual(disk.families.fam2.child_handles, ['d1', 'd2'], '另一段 family 的数组不得被带动');
  // 其它成员引用不变（只重排数组，不改挂靠）
  assert.equal(disk.people.c3.parent_family, 'fam1');
  assert.equal(disk.people.c3.spouse_families.length, 0);

  // ①′ 读路径（前端零改动即生效）：GET /people/<父> → profile.families[].children 顺序 = 新数组序
  const read = await call('/people/f1?profile=all', 'GET', H('sr_main'));
  assert.equal(read.statusCode, 200, `读接口应可读（实际 ${read.statusCode} ${read.body}）`);
  const fams = bodyOf(read).profile.families || [];
  const fam1 = fams.find((f) => f.handle === 'fam1');
  assert.ok(fam1, '读路径应返回 fam1');
  assert.deepEqual(fam1.children.map((c) => c.handle), ['c1', 'c3', 'c2', 'c4'], '读接口 children 序 = 新位次');
  const fam2 = fams.find((f) => f.handle === 'fam2');
  assert.deepEqual(fam2.children.map((c) => c.handle), ['d1', 'd2'], '另一段读序不变');

  // ② 计费：1 片 + Tx.type = edit_fee + ref 指向被拖动的子女 + desc 人类可读
  const after = await readAssets(STEWARD);
  assert.notEqual(bagOf(after), bag0, '资产已扣');
  assert.equal(el.sumLots(after.bamboos), 4);
  assert.deepEqual(txTypes(after), ['edit_fee'], 'Tx.type 必须是既有枚举 edit_fee');
  const tx = (after.txs || [])[0];
  assert.equal(tx.delta.bamboos, -1, '扣 1 片');
  assert.equal(tx.ref.tree_id, 'sr_main');
  assert.equal(tx.ref.person_handle, 'c3', 'ref.person_handle = 被拖动的那个子女节点');
  assert.equal(tx.desc, '调整排行：甲三 第 2 位', 'desc 人类可读（含姓名与位次）');
});

test('多家族分段（C8）：一次提交只动提交那一段，另一段位次与内容均不变', async () => {
  await scene({ trees: [reorderTree('sr_seg')], phone: STEWARD, bamboos: 5 });
  const v0 = readTree('sr_seg').version;
  // 第二段（fam2）自身重排：甲六 提到第 1 位
  const res = await reorder('sr_seg', 'fam2', 'd2', ['d2', 'd1']);
  assert.equal(res.statusCode, 200, `第二段重排应 200（实际 ${res.statusCode} ${res.body}）`);
  const disk = readTree('sr_seg');
  assert.deepEqual(disk.families.fam2.child_handles, ['d2', 'd1'], '本段已重排');
  assert.deepEqual(disk.families.fam1.child_handles, ['c1', 'c2', 'c3', 'c4'], '另一段保持原序');
  assert.equal(disk.version, v0 + 1, '一次提交 = 一次落盘（不跨段合并）');
  const after = await readAssets(STEWARD);
  assert.deepEqual(txTypes(after), ['edit_fee']);
  assert.equal(el.sumLots(after.bamboos), 4, '一次拖动 = 一次计费（1 片）');
});

// ================= ③ no-op（C4）=================

test('no-op：提交序与现状逐位相同 → 200 noop / 0 片 / 无流水 / 树逐字节不变', async () => {
  await scene({ trees: [reorderTree('sr_noop')], phone: STEWARD, bamboos: 5 });
  const t0 = treeMd5('sr_noop');
  const v0 = readTree('sr_noop').version;
  const assets0 = assetsMd5();

  const res = await reorder('sr_noop', 'fam1', 'c3', ['c1', 'c2', 'c3', 'c4']); // 原地释放
  const b = bodyOf(res);
  assert.equal(res.statusCode, 200, `no-op 应 200（实际 ${res.statusCode} ${res.body}）`);
  assert.equal(b.ok, true);
  assert.equal(b.noop, true, '必须标 noop');
  assert.deepEqual(b.fee, { unit: 'bamboos', pieces: 0, balance: 5, balance_after: 5 }, '0 片且余额取实际值');

  assert.equal(treeMd5('sr_noop'), t0, '树 JSON 逐字节未变');
  assert.equal(readTree('sr_noop').version, v0, 'version 不动');
  assert.equal(readTree('sr_noop').updated_at, SCHEMA.updated_at, 'updated_at 不动');
  assert.equal(assetsMd5(), assets0, '资产集合文件逐字节不变（连 sweep 都没落盘）');
  assert.deepEqual(txTypes(await readAssets(STEWARD)), [], 'no-op 不得产生任何流水');
});

// ================= ④ 校验（C5）=================

test('集合不等价：少一个 / 换人 / 重复 / 多一个 → 400 且树与资产零写入', async () => {
  await scene({ trees: [reorderTree('sr_set')], phone: STEWARD, bamboos: 5 });
  const t0 = treeMd5('sr_set');
  const v0 = readTree('sr_set').version;
  const assets0 = assetsMd5();

  const cases = [
    [['c1', 'c2', 'c3'], '少一个成员'],
    [['c1', 'c2', 'c3', 'c9'], '换成不存在的成员'],
    [['c1', 'c2', 'c2', 'c4'], '重复成员'],
    [['c1', 'c2', 'c3', 'c4', 'd1'], '多一个成员（改挂靠有别的路由）'],
  ];
  for (const [list, why] of cases) {
    const res = await reorder('sr_set', 'fam1', 'c2', list);
    assert.equal(res.statusCode, 400, `${why} 应 400（实际 ${res.statusCode} ${res.body}）`);
    assert.equal(bodyOf(res).error, tw.CHILD_SET_MISMATCH_TEXT, `${why} 文案统一取自写路径常量`);
  }

  // 校验先于扣费 / 落库：树、资产、流水全不动
  assert.equal(treeMd5('sr_set'), t0, '树未写');
  assert.equal(readTree('sr_set').version, v0, 'version 未脏');
  assert.equal(assetsMd5(), assets0, '资产集合逐字节不变');
  assert.deepEqual(txTypes(await readAssets(STEWARD)), [], '被拒请求不得产生任何流水');
});

test('family_handle 不存在 → 404；person_handle 不在该家族子女列表 → 400（均不扣费）', async () => {
  await scene({ trees: [reorderTree('sr_fam')], phone: STEWARD, bamboos: 5 });
  const t0 = treeMd5('sr_fam');
  const assets0 = assetsMd5();

  const noFam = await reorder('sr_fam', 'famX', 'c2', ['c1', 'c2', 'c3', 'c4']);
  assert.equal(noFam.statusCode, 404, `family 不存在应 404（实际 ${noFam.statusCode} ${noFam.body}）`);
  assert.equal(bodyOf(noFam).error, tw.FAMILY_NOT_FOUND_TEXT);

  // f1 是本段 family 的家长（不在子女列表里）：集合虽等价，但 person_handle 必须是被拖动的那个子女
  const notChild = await reorder('sr_fam', 'fam1', 'f1', ['c2', 'c1', 'c3', 'c4']);
  assert.equal(notChild.statusCode, 400, `person_handle 不在子女列表应 400（实际 ${notChild.statusCode} ${notChild.body}）`);

  assert.equal(treeMd5('sr_fam'), t0, '两次被拒均未写树');
  assert.equal(assetsMd5(), assets0, '两次被拒均未动资产');
  assert.deepEqual(txTypes(await readAssets(STEWARD)), []);
});

test('缺参：无 family_handle / 无 person_handle / child_handles 非数组 / 既无 tree_id 又无 X-Tree-Id → 400', async () => {
  await scene({ trees: [reorderTree('sr_miss')], phone: STEWARD, bamboos: 5 });
  const assets0 = assetsMd5();
  const post = (payload) => call('/admin/sibling-reorder', 'POST', H('sr_miss'), {}, payload);
  assert.equal((await post({ tree_id: 'sr_miss', person_handle: 'c2', child_handles: ['c1', 'c2'] })).statusCode, 400);
  assert.equal((await post({ tree_id: 'sr_miss', family_handle: 'fam1', child_handles: ['c1', 'c2'] })).statusCode, 400);
  assert.equal((await post({ tree_id: 'sr_miss', family_handle: 'fam1', person_handle: 'c2', child_handles: 'c1,c2' })).statusCode, 400);
  // 树上下文：body.tree_id 与 X-Tree-Id 都缺 → 400「缺少 tree_id」（与 /admin/delete-node 同口径）
  const noTree = await call('/admin/sibling-reorder', 'POST', bee(STEWARD), {}, {
    family_handle: 'fam1',
    person_handle: 'c2',
    child_handles: ['c2', 'c1'],
  });
  assert.equal(noTree.statusCode, 400);
  assert.equal(bodyOf(noTree).error, '缺少 tree_id');
  assert.equal(assetsMd5(), assets0, '缺参请求不得动资产');
});

// ================= ⑤ 只读节点（C6）=================

test('只读镜像节点 → 403，且 jiazu_assets 零变化、树零写入、无流水', async () => {
  await scene({ trees: [mirrorTree('sr_mirror')], phone: STEWARD, bamboos: 5 });
  const t0 = treeMd5('sr_mirror');
  const v0 = readTree('sr_mirror').version;
  const assets0 = assetsMd5();
  const bag0 = bagOf(await readAssets(STEWARD));

  // 镜像节点 mi1 被拖到第 2 位（集合等价，仅位次变）
  const res = await reorder('sr_mirror', 'fam1', 'mi1', ['mc1', 'mi1']);
  const b = bodyOf(res);
  assert.equal(res.statusCode, 403, `只读镜像应 403（实际 ${res.statusCode} ${res.body}）`);
  assert.equal(b.error, fa.MIRROR_LOCK_MESSAGE, '403 文案 = 既有只读提示常量（同一判据函数，不另写一套）');
  assert.equal(b.fee_refunded, undefined, '被拒请求不得出现扣费痕迹');

  assert.equal(assetsMd5(), assets0, '★ 只读预检必须先于扣费：资产集合逐字节不变');
  assert.equal(bagOf(await readAssets(STEWARD)), bag0, '资产批次不变');
  assert.deepEqual(txTypes(await readAssets(STEWARD)), [], '不得产生任何流水（含 fee_refund）');
  assert.equal(treeMd5('sr_mirror'), t0, '树未写');
  assert.equal(readTree('sr_mirror').version, v0, 'version 未脏');
});

test('游客（guest）→ 403，且不扣费不写树', async () => {
  await scene({ trees: [reorderTree('sr_guest')], phone: GUEST, bamboos: 5 });
  const t0 = treeMd5('sr_guest');
  const assets0 = assetsMd5();
  const res = await reorder('sr_guest', 'fam1', 'c2', ['c2', 'c1', 'c3', 'c4'], GUEST);
  assert.equal(res.statusCode, 403, `游客应 403（实际 ${res.statusCode} ${res.body}）`);
  assert.equal(bodyOf(res).error, '游客无编辑权限，请注册后编辑');
  assert.equal(assetsMd5(), assets0, '游客被拒不得动资产');
  assert.equal(treeMd5('sr_guest'), t0, '游客被拒不得写树');
});

test('未登录 → 401；无 X-Tree-Id 但有 body.tree_id → 正常受理（沿用 /admin/reparent · /admin/delete-node 同段口径）', async () => {
  await scene({ trees: [reorderTree('sr_xtree')], phone: STEWARD, bamboos: 5 });
  const t0 = treeMd5('sr_xtree');
  const assets0 = assetsMd5();
  const payload = {
    tree_id: 'sr_xtree',
    family_handle: 'fam1',
    person_handle: 'c2',
    child_handles: ['c2', 'c1', 'c3', 'c4'],
  };

  // ① 无 Authorization → 401（鉴权先于一切；不扣费、不写树）
  const anon = await call('/admin/sibling-reorder', 'POST', {}, {}, payload);
  assert.equal(anon.statusCode, 401, `未登录应 401（实际 ${anon.statusCode} ${anon.body}）`);
  assert.equal(bodyOf(anon).error, '请先登录后再进行编辑操作');
  assert.equal(assetsMd5(), assets0, '未登录被拒不得动资产');
  assert.equal(treeMd5('sr_xtree'), t0, '未登录被拒不得写树');

  // ② 已登录 + 无 X-Tree-Id：树上下文取 body.tree_id（与 /admin/reparent、/admin/delete-node 完全同口径）
  const noHeader = await call('/admin/sibling-reorder', 'POST', bee(STEWARD), {}, payload);
  assert.equal(noHeader.statusCode, 200, `无 X-Tree-Id 时按 body.tree_id 受理（实际 ${noHeader.statusCode} ${noHeader.body}）`);
  assert.equal(bodyOf(noHeader).fee.pieces, 1);
  assert.notEqual(treeMd5('sr_xtree'), t0, '树已重排');
  assert.deepEqual(readTree('sr_xtree').families.fam1.child_handles, ['c2', 'c1', 'c3', 'c4']);
});

// ================= ⑥ 余额不足（C3）=================

test('余额不足 → 409 整单拒绝：树零写入 / 无流水 / 文案沿用既有 409 原文', async () => {
  await scene({ trees: [reorderTree('sr_broke')], phone: STEWARD, bamboos: 0 });
  const t0 = treeMd5('sr_broke');
  const v0 = readTree('sr_broke').version;
  const assets0 = assetsMd5();

  const res = await reorder('sr_broke', 'fam1', 'c2', ['c2', 'c1', 'c3', 'c4']);
  const b = bodyOf(res);
  assert.equal(res.statusCode, 409, `余额不足应 409（实际 ${res.statusCode} ${res.body}）`);
  assert.equal(b.code, 'ASSET_INSUFFICIENT');
  assert.equal(b.need, 1);
  assert.equal(b.current, 0);
  assert.equal(b.unit, 'bamboos');
  assert.equal(b.error, '资产不足，需 1 片竹片，当前 0 片', '沿用既有 409 原文（逐字）');
  assert.ok(Array.isArray(b.how_to_get) && b.how_to_get.length > 0, '带竹片来源清单');

  assert.equal(treeMd5('sr_broke'), t0, '★ 扣费失败 → 树一个字节都不写');
  assert.equal(readTree('sr_broke').version, v0, 'version 未脏');
  assert.equal(assetsMd5(), assets0, '资产集合逐字节不变（连零头都不动）');
  assert.deepEqual(txTypes(await readAssets(STEWARD)), [], '不得留下任何流水 / 冲正记录');
});

// ================= ⑦ 落库失败 → 冲正（C3 闸门第⑥步）=================

test('落库失败（树文件 0444）→ 500 + fee_refunded + 资产逐字节冲正 + 磁盘树未变、无幻影', async () => {
  await scene({ trees: [reorderTree('sr_fail')], phone: STEWARD, bamboos: 5 });
  const h0 = 'f1';
  assert.equal((await call(`/people/${h0}`, 'GET', H('sr_fail'))).statusCode, 200, '预热进程内缓存');
  const t0 = treeMd5('sr_fail');
  const v0 = readTree('sr_fail').version;
  const bag0 = bagOf(await readAssets(STEWARD));

  fs.chmodSync(treePath('sr_fail'), 0o444); // 真实 IO 失败（EACCES）
  const res = await reorder('sr_fail', 'fam1', 'c4', ['c4', 'c1', 'c2', 'c3']);
  fs.chmodSync(treePath('sr_fail'), 0o644);
  const b = bodyOf(res);

  assert.equal(res.statusCode, 500, `系统级落库失败应 500（实际 ${res.statusCode} ${res.body}）`);
  assert.equal(b.error, eco.INTERNAL_ERROR_TEXT, '系统级失败 → 通用文案（不泄漏本机路径）');
  assert.ok(!/trees\//.test(JSON.stringify(b)), '不得回显本机路径 / 底层异常文本');
  assert.equal(b.fee_refunded, true, '扣费已冲正标记');
  assert.equal(treeMd5('sr_fail'), t0, '磁盘树未变');
  assert.equal(readTree('sr_fail').version, v0, 'version 未脏');
  assert.equal(bagOf(await readAssets(STEWARD)), bag0, '★ 已扣的 1 片原路返还同一批次（资产逐字节复原）');
  assert.deepEqual(txTypes(await readAssets(STEWARD)), ['edit_fee', 'fee_refund'], '扣费 + 冲正各一条');
  // 幻影不得留在进程内缓存
  const reread = await call('/people/f1?profile=all', 'GET', H('sr_fail'));
  const fam1 = (bodyOf(reread).profile.families || []).find((f) => f.handle === 'fam1');
  assert.deepEqual(fam1.children.map((c) => c.handle), ['c1', 'c2', 'c3', 'c4'], '同进程读回磁盘真值（无幻影序）');
});

// ================= ⑧ 真源未变 =================

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/（trees + details + collections）逐字节未变', () => {
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 被改');
  const nowTree = dirBaseline(REAL_TREES);
  const nowDetail = dirBaseline(REAL_DETAILS);
  const nowCol = dirBaseline(REAL_COLLECTIONS);
  assert.deepEqual([...nowTree.keys()].sort(), [...realTreeBaseline.keys()].sort(), 'migrate-output/trees 文件集合变了');
  assert.deepEqual([...nowDetail.keys()].sort(), [...realDetailBaseline.keys()].sort(), 'migrate-output/details 文件集合变了');
  assert.deepEqual([...nowCol.keys()].sort(), [...realColBaseline.keys()].sort(), 'migrate-output/collections 文件集合变了');
  for (const [f, h] of realTreeBaseline) assert.equal(nowTree.get(f), h, `migrate-output/trees/${f} 被改`);
  for (const [f, h] of realDetailBaseline) assert.equal(nowDetail.get(f), h, `migrate-output/details/${f} 被改`);
  for (const [f, h] of realColBaseline) assert.equal(nowCol.get(f), h, `migrate-output/collections/${f} 被改`);
});
