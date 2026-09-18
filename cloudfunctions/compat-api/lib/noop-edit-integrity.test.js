/**
 * no-op 编辑（缺陷 A）+ store 写失败完整性（缺陷 B）+ 详情写序 回归单测
 *
 * 背景（两个已复现的真实缺陷）：
 *   A. **no-op 编辑照扣费**：打开节点编辑弹窗不改任何东西点保存 → 仍扣 1 片并重写树文件
 *      （旧实现 `hasPersonChanges` 只判「字段是否存在」，不判「值是否变了」）。
 *   B. **落库失败留进程内幻影 + 详情半写**：树文件 `chmod 0444` 后提交改名 → 响应 400/500、
 *      余额已冲正、磁盘 md5 未变，**但同进程 `GET /people/<handle>` 已显示新名**；随后对同树
 *      另一次正常写入会把该幻影**永久落盘**。根因：`store.saveTree` 先自增 version/updated_at
 *      再落盘、失败不回滚也不失效缓存；`updateTree` 抛错路径无缓存处理；`updatePerson` 的详情
 *      文档写在树落盘**之前**（树被拒 → 跨文件状态发散）。
 *
 * 覆盖：
 *   ① `personValueDiff` / `isPersonUnchanged`（纯函数）：规范化后相等判定（trim / 空值同一 / gender 归一 /
 *      is_living 归一 / 称号三字段 / external_* 值级保守追加），含义与反例逐条断言
 *   ② 缺陷 A：no-op PUT（GET→原值回填→PUT，与前端 doSave 同构）→ 200 + `unchanged:true` +
 *      `fee.pieces===0` + 余额不变 + **无 txs 流水** + 树 JSON md5/version/updated_at 不变 + 详情字节不变
 *   ③ 缺陷 A 反向对照：只改称号 → 1 片照旧；改姓名 → 1 片照旧（no-op 判定不放水）
 *   ④ 缺陷 B：`updateTree` 落盘失败（真实 IO 失败：树文件 `chmod 0444`）→ 同进程 `getTree` 必须
 *      读回**磁盘真值**（幻影消失）、version 未脏；`saveTree` 直接失败同样不脏；
 *      **幻影不得随另一次正常写入落盘**（夹具 C）
 *   ⑤ 写序：树落盘失败（0444）→ 详情文档字节未变、余额已冲正、响应 `fee_refunded:true`；
 *      树成功但详情目录 `0555`（新详情文档写不进去）→ 200 + `detail_warning`，且树已落盘
 *   ⑥ 真源未变：`config/tree-meta.json` 与 `migrate-output/`（trees + details + collections）逐字节 md5 一致
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（同 economy-fee.test.js 模式）。
 * 运行：node --test cloudfunctions/compat-api/lib/noop-edit-integrity.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-noop-integrity-'));
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

// ---- 副本 tree-meta ----

const TREES = {
  noop_put: { tree_id: 'noop_put', kind: 'family', display_title: '甲氏（no-op 保存）' },
  noop_fee: { tree_id: 'noop_fee', kind: 'family', display_title: '乙氏（有差异照旧计费）' },
  wh_tree: { tree_id: 'wh_tree', kind: 'family', display_title: '丙氏（写失败完整性）' },
  ord_tree: { tree_id: 'ord_tree', kind: 'family', display_title: '丁氏（写序：树失败）' },
  det_tree: { tree_id: 'det_tree', kind: 'family', display_title: '戊氏（写序：详情失败）' },
  chain_np: { tree_id: 'chain_np', kind: 'family', display_title: '己氏（中华世本链节点 no-op）' },
};
fs.writeFileSync(process.env.COMPAT_META_FILE, JSON.stringify({ _schema: '1.1', trees: TREES }, null, 2) + '\n');

// ---- 用户与资产 ----

const STEWARD = '16600009201'; // tree_steward（四棵夹具树都可写）
const CHIEF = '16600009202'; // chief_editor（权限兜底对照）
const GUEST = '16600009203';

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '主理人', role: 'tree_steward' },
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [GUEST]: { _id: GUEST, phone: GUEST, nickname: '游客', role: 'guest' },
  }),
);

const el = await import('./economy-ledger.js');
const eco = await import('./economy-fee.js');
const st = await import('./store.js');
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
const txCount = (u) => (u.txs || []).length;
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
const detailPath = (treeId, handle) => path.join(TMP, 'details', `${treeId}:${handle}.json`);
const treeMd5 = (id) => md5(treePath(id));
const detailMd5 = (treeId, handle) => (fs.existsSync(detailPath(treeId, handle)) ? md5(detailPath(treeId, handle)) : '');
const readTree = (id) => JSON.parse(fs.readFileSync(treePath(id), 'utf8'));
const assetsMd5 = () => md5(path.join(TMP, 'collections', 'jiazu_assets.json'));

function writeTree(tree) {
  fs.mkdirSync(path.dirname(treePath(tree.tree_id)), { recursive: true });
  fs.writeFileSync(treePath(tree.tree_id), JSON.stringify(tree, null, 2));
}
function writeDetail(detail) {
  fs.mkdirSync(path.dirname(detailPath(detail.tree_id, detail.handle)), { recursive: true });
  fs.writeFileSync(detailPath(detail.tree_id, detail.handle), JSON.stringify(detail, null, 2));
}
async function scene({ trees = [], phone = STEWARD, bamboos = 0 } = {}) {
  for (const t of trees) writeTree(t);
  await setAssets(phone, {
    fragments: 0,
    seeds: [],
    bamboos: bamboos ? [bambooLot(bamboos, 100, `bl_${phone}_${Math.random().toString(36).slice(2, 8)}`)] : [],
    jades: [],
    txs: [],
    signin_date: '',
  });
}

const SCHEMA = { _schema: '1.0', version: 1, updated_at: '2020-01-01T00:00:00.000Z' };
const node = (h, gid, name, surname, given, extra = {}) => ({
  handle: h,
  gramps_id: gid,
  name,
  surname,
  given,
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
 * no-op 夹具树（扁平 4 节点，覆盖真实数据形态）：
 *   p1 有称号 + 杂项属性（RIN）、p2 缺 is_living 且无卒年（真源「刘佳玉」形态）、
 *   p3 明确已故有卒年、p4 带跨树登记（external_tree，详情 attributes 里不该有它）
 */
function noopTree(id = 'noop_put') {
  const p = (n) => `${id}-p${n}`;
  const people = {
    [p(1)]: node(p(1), 'I0300', '甲三', '甲', '三', { is_living: true, birth_place: '临淄' }),
    [p(2)]: node(p(2), 'I0301', '刘佳玉', '刘', '佳玉', { birth_place: '安达市' }),
    [p(3)]: node(p(3), 'I0302', '甲古', '甲', '古', { is_living: false, death_date: '1980-05-01' }),
    [p(4)]: node(p(4), 'I0303', '甲姻', '甲', '姻', {
      external_tree: 'zhonghua',
      external_person_handle: 'deadbeefdeadbeef',
      external_link_type: 'marriage',
    }),
  };
  return { ...SCHEMA, tree_id: id, people, families: {}, founder_gramps_id: 'I0300' };
}
/** no-op 夹具树的 4 个 handle（避开把辅助字段写进树 JSON）；每个用例自己取，勿跨用例复用 */
const HANDLES = (id) => [1, 2, 3, 4].map((n) => `${id}-p${n}`);
/** 属性键（Gramps 形状：`type` 可能是字符串或 `{string}`，兼容 `key`）；取不到 → '' */
const attrKeyOf = (a) => (typeof a?.type === 'string' ? a.type : a?.type?.string || (typeof a?.key === 'string' ? a.key : ''));
/** p1 的详情文档（称号三字段 + 杂项属性 RIN：GET 会把它拼进 attribute_list 再原样回传） */
function noopDetail(treeId, handle) {
  return {
    tree_id: treeId,
    handle,
    gramps_id: 'I0300',
    name: '甲三',
    events: [],
    media: [],
    citations: [],
    notes: [],
    attributes: [
      { key: '号', value: '青莲居士', type: '号' },
      { key: '封号', value: '毕公', type: '封号' },
      { key: 'RIN', value: 'R-1', type: 'RIN' },
    ],
    updated_at: '2020-01-01T00:00:00.000Z',
  };
}
/** 缺 is_living 形态的详情（无称号） */
function plainDetail(treeId, handle, gid, name) {
  return {
    tree_id: treeId,
    handle,
    gramps_id: gid,
    name,
    events: [],
    media: [],
    citations: [],
    notes: [],
    attributes: [],
    updated_at: '2020-01-01T00:00:00.000Z',
  };
}

/**
 * 前端 `person-archive.vue` 的 `doSave` 请求体构造（等价复刻）：
 * GET `/people/<handle>?profile=all` → 删 profile → 表单原值回填 → PUT。
 * 「打开弹窗不改任何东西点保存」= 这条路径，故 no-op 用例必须走它（而不是手搓 body）。
 */
function formBodyFrom(raw) {
  const prof = raw.profile || {};
  const pn = raw.primary_name || {};
  const surname = pn.surname_list?.[0]?.surname || '';
  const genderNumMap = { M: 1, F: 2, U: 0 };
  const body = { ...raw };
  delete body.profile;
  body.primary_name = { first_name: pn.first_name || '', surname_list: [{ surname }] };
  body.gender = genderNumMap[raw.gender === 1 ? 'M' : raw.gender === 2 ? 'F' : 'U'];
  body.birth_date = (prof.birth?.date || '').trim();
  body.is_living = raw.is_living !== undefined ? !!raw.is_living : !(prof.death?.date || '');
  body.death_date = body.is_living ? '' : (prof.death?.date || '').trim();
  const attrKey = attrKeyOf;
  const byKey = {};
  for (const a of raw.attribute_list || []) {
    const k = attrKey(a);
    if (k) byKey[k] = a.value;
  }
  const titleKeys = ['号', '封号', '谥号'];
  const kept = (raw.attribute_list || []).filter((a) => !titleKeys.includes(attrKey(a)));
  for (const k of titleKeys) if (byKey[k]) kept.push({ type: k, value: byKey[k] });
  body.attribute_list = kept;
  return body;
}

/** 等价前端的「打开档案 → 不改东西 → 保存」：返回 {res, body, raw} */
async function noopSave(treeId, handle, phone = STEWARD) {
  const got = await call(`/people/${handle}`, 'GET', H(treeId, phone));
  assert.equal(got.statusCode, 200, `GET /people/${handle} 应可读（读路径节点级分层不应隐藏本夹具）`);
  const raw = bodyOf(got);
  const res = await call(`/people/${handle}`, 'PUT', H(treeId, phone), {}, formBodyFrom(raw));
  return { res, body: bodyOf(res), raw };
}

// ================= ① 纯函数：值级比对 =================

test('值级比对（纯函数）：规范化后完全相同 → unchanged；任一内容字段变 → changed（含反例）', () => {
  const person = {
    name: '甲三',
    surname: '甲',
    given: '三',
    gender: 'M',
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    is_living: true,
  };
  const detail = { attributes: [{ key: '号', value: '青莲居士' }, { key: 'RIN', value: 'R-1' }] };
  const body = {
    primary_name: { first_name: '三', surname_list: [{ surname: '甲', primary: true }] },
    gender: 1,
    birth_date: '',
    death_date: '',
    is_living: true,
    attribute_list: [
      { type: 'RIN', value: 'R-1' },
      { type: '号', value: '青莲居士' },
    ],
  };

  // ① 完全相同（GET 回填原值）→ unchanged
  assert.deepEqual(eco.personValueDiff(body, person, detail), { changed: false, fields: [] });
  assert.equal(eco.isPersonUnchanged(body, person, detail), true);

  // ② 规范化：字符串 trim / `''` 与缺省同一空值 / gender 数字与 M/F/U 同一口径
  const padded = {
    ...body,
    primary_name: { first_name: ' 三 ', surname_list: [{ surname: ' 甲 ' }] },
    gender: '1',
  };
  assert.equal(eco.isPersonUnchanged(padded, person, detail), true, 'trim + 数字/字符性别归一后仍相同');
  const blank = { ...body, birth_date: undefined, death_date: undefined, attribute_list: [...body.attribute_list, { type: '谥号', value: '   ' }] };
  assert.equal(eco.isPersonUnchanged(blank, person, detail), true, '未提供的字段不参与比对；空串称号 ≡ 未录入');

  // ③ 姓名 / 性别 / 生卒 / 健在：每个字段单独变都要判 changed（反例）
  assert.deepEqual(eco.personValueDiff({ ...body, primary_name: { first_name: '四', surname_list: [{ surname: '甲' }] } }, person, detail).changed, true);
  assert.deepEqual(eco.personValueDiff({ ...body, primary_name: { first_name: '三', surname_list: [{ surname: '乙' }] } }, person, detail).fields, ['name', 'surname']);
  assert.deepEqual(eco.personValueDiff({ ...body, gender: 2 }, person, detail).fields, ['gender']);
  assert.deepEqual(eco.personValueDiff({ ...body, birth_date: '1900' }, person, detail).fields, ['birth_date']);
  assert.deepEqual(eco.personValueDiff({ ...body, birth_place: '临淄' }, person, detail).fields, ['birth_place']);
  assert.deepEqual(eco.personValueDiff({ ...body, is_living: false }, person, detail).fields, ['is_living']);

  // ④ 称号三字段（详情文档 attributes）：任一改 / 增 / 删都要判 changed
  const titled = { ...body, attribute_list: [{ type: 'RIN', value: 'R-1' }, { type: '号', value: '青莲居士' }, { type: '封号', value: '毕公' }] };
  assert.equal(eco.personValueDiff(titled, person, detail).fields.includes('attributes'), true, '新增封号 = 详情文档要变');
  const renamedTitle = { ...body, attribute_list: [{ type: 'RIN', value: 'R-1' }, { type: '号', value: '太白酒仙' }] };
  assert.deepEqual(eco.personValueDiff(renamedTitle, person, detail).fields, ['attributes'], '改号 = 唯一差异');
  const dropped = { ...body, attribute_list: [{ type: 'RIN', value: 'R-1' }] };
  assert.deepEqual(eco.personValueDiff(dropped, person, detail).fields, ['attributes'], '删号（详情 attributes 全量替换语义）');
  // 杂项属性 RIN 未回传 = 会被写入删除 → 必须判 changed（绝不静默吞掉一次真实写入）
  assert.deepEqual(eco.personValueDiff({ ...body, attribute_list: [{ type: '号', value: '青莲居士' }] }, person, detail).fields, ['attributes']);

  // ⑤ is_living 缺省形态（真源「刘佳玉」：树里没有该字段）→ 展示口径已在世，回填 true 不算改
  const bare = { ...person };
  delete bare.is_living;
  assert.equal(eco.isPersonUnchanged({ ...body, is_living: true }, bare, detail), true, '树里缺 is_living + 无卒年 ≡ 在世');
  assert.equal(eco.personValueDiff({ ...body, is_living: false }, bare, detail).fields.includes('is_living'), true, '缺省形态下改成已故 = 有差异');

  // ⑤′ 已故形态：期望值一律向「已定口径」对齐（值级比对只认规范化后的值是否相同）
  //   树侧有卒年 → 隐含已故；回填 **同一卒年**（+ 同一布尔）不算改；卒年值真的不同（1990 ≠ 1990-01-01）
  //   才是内容变更，必须判差异 —— 夹具不能拿「日期写法不同」去要求 unchanged（那是把错期望塞给实现）。
  const deceased = p2Of(bare); // is_living:false + death_date '1990-01-01'
  assert.equal(
    eco.isPersonUnchanged({ ...body, is_living: false, death_date: '1990-01-01' }, deceased, detail),
    true,
    '已故形态下回填同一卒年 + 同一真值布尔 = 不算改',
  );
  const noFlag = { ...bare, death_date: '1990-01-01' }; // 树里缺 is_living 但有卒年（展示层隐含已故）
  assert.equal(
    eco.isPersonUnchanged({ ...body, is_living: false, death_date: '1990-01-01' }, noFlag, detail),
    true,
    '树缺 is_living 但有卒年（隐含已故）→ 回填 false 不算改',
  );
  assert.equal(
    eco.personValueDiff({ ...body, is_living: false, death_date: '1990' }, deceased, detail).fields.includes('death_date'),
    true,
    '卒年值真的不同（1990 vs 1990-01-01）= 有差异',
  );
  assert.equal(
    eco.personValueDiff({ ...body, is_living: true, death_date: '' }, deceased, detail).fields.includes('is_living'),
    true,
    '已故 → 改回在世 = 有差异',
  );

  // ⑥ external_*：契约不走本路由 → 未提供/值相同都不算差异；显式改值才判差异（保守追加）
  const withExt = { ...person, external_tree: 'zhonghua', external_person_handle: 'h1', external_link_type: 'marriage' };
  assert.equal(eco.isPersonUnchanged(body, withExt, detail), true, 'body 未带回 external_* → 不是差异');
  const echoExt = {
    ...body,
    attribute_list: [...body.attribute_list, { type: 'external_tree', value: 'zhonghua' }],
  };
  assert.equal(eco.isPersonUnchanged(echoExt, withExt, detail), true, '原值回传 external_tree → 不是差异');
  const changeExt = {
    ...body,
    attribute_list: [...body.attribute_list, { type: 'external_tree', value: 'ji_23395' }],
  };
  assert.deepEqual(eco.personValueDiff(changeExt, withExt, detail).fields, ['external_tree'], '显式改跨树登记值 = 差异（保守：绝不静默丢写入）');
});
/**
 * 已故 + 有卒年的现值（⑤′ 用）：树侧 is_living 显式为 false，卒年 '1990-01-01'
 */
function p2Of(bare) {
  return { ...bare, is_living: false, death_date: '1990-01-01' };
}

// ================= ② 缺陷 A：no-op 保存 =================

test('缺陷 A：no-op 保存（GET→不改任何东西→PUT）→ 200 unchanged / 0 片 / 无流水 / 树与详情逐字节不变', async () => {
  const tree = noopTree('noop_put');
  const handles = HANDLES('noop_put'); // 本用例自己取句柄（noopTree 不再回传 handles）
  await scene({ trees: [tree], phone: STEWARD, bamboos: 5 });
  writeDetail(noopDetail('noop_put', handles[0]));
  writeDetail(plainDetail('noop_put', handles[2], 'I0302', '甲古'));
  // 预热：真实形态是先 GET（读路径）再 PUT，进程内 treeCache 已被填充
  for (const h of handles) {
    const warm = await call(`/people/${h}`, 'GET', H('noop_put'));
    assert.equal(warm.statusCode, 200, `${h} 读路径应可见`);
  }

  const beforeTree = treeMd5('noop_put');
  const beforeDisk = readTree('noop_put');
  const beforeDetails = new Map(handles.map((h) => [h, detailMd5('noop_put', h)]));
  const beforeBag = bagOf(await readAssets(STEWARD));
  const beforeAssetsMd5 = assetsMd5();

  for (const h of handles) {
    const { res, body } = await noopSave('noop_put', h);
    assert.equal(res.statusCode, 200, `${h} no-op PUT 应 200（实际 ${res.statusCode} ${JSON.stringify(body)}）`);
    assert.equal(body.ok, true);
    assert.equal(body.unchanged, true, `${h} 必须标 unchanged`);
    assert.deepEqual(body.fee, { unit: 'bamboos', pieces: 0, balance: 5, balance_after: 5 }, `${h} 余额取当前实际值且 0 片`);
  }

  // 不写树：md5 / version / updated_at 全不动
  assert.equal(treeMd5('noop_put'), beforeTree, '树 JSON 逐字节未变');
  const afterDisk = readTree('noop_put');
  assert.equal(afterDisk.version, beforeDisk.version, 'version 不动');
  assert.equal(afterDisk.updated_at, beforeDisk.updated_at, 'updated_at 不动');

  // 不写详情
  for (const h of handles) assert.equal(detailMd5('noop_put', h), beforeDetails.get(h), `${h} 详情文档字节未变`);

  // 不扣费、无流水
  const after = await readAssets(STEWARD);
  assert.equal(bagOf(after), beforeBag, '资产批次逐字节不变');
  assert.equal(assetsMd5(), beforeAssetsMd5, '资产集合文件逐字节不变（连 sweep 都没落盘）');
  assert.equal(txCount(after), 0, 'no-op 不得产生任何流水');
});

test('缺陷 A 反向对照：只改称号 → 1 片照旧；改姓名 → 1 片照旧（no-op 判定不放水）', async () => {
  const tree = noopTree('noop_fee');
  const handles = HANDLES('noop_fee'); // 本用例自己取句柄
  await scene({ trees: [tree], phone: STEWARD, bamboos: 5 });
  writeDetail(noopDetail('noop_fee', handles[0]));
  writeDetail(plainDetail('noop_fee', handles[2], 'I0302', '甲古'));

  // ① 只改称号（封号 毕公 → 周公）：树 JSON 与详情都要写，扣 1 片
  const h1 = handles[0];
  const first = await noopSave('noop_fee', h1);
  const t1 = treeMd5('noop_fee');
  const v1 = readTree('noop_fee').version;
  const d1 = detailMd5('noop_fee', h1);
  // 请求体按前端 doSave 同构构造（noopSave 的 raw = GET 出参），再只把封号改掉
  const warm1 = formBodyFrom(first.raw);
  const titled = {
    ...warm1,
    attribute_list: warm1.attribute_list
      .filter((a) => attrKeyOf(a) !== '封号')
      .concat([{ type: '封号', value: '周公' }]),
  };
  const titledRes = await call(`/people/${h1}`, 'PUT', H('noop_fee'), {}, titled);
  assert.equal(titledRes.statusCode, 200);
  const titledBody = bodyOf(titledRes);
  assert.deepEqual(titledBody.fee, { unit: 'bamboos', pieces: 1, balance: 5, balance_after: 4 }, '只改称号 = 1 片');
  assert.notEqual(treeMd5('noop_fee'), t1, '树已重写');
  assert.equal(readTree('noop_fee').version, v1 + 1, 'version +1');
  assert.notEqual(detailMd5('noop_fee', h1), d1, '详情已重写');
  assert.ok(
    JSON.parse(fs.readFileSync(detailPath('noop_fee', h1), 'utf8')).attributes.some((a) => a.key === '封号' && a.value === '周公'),
    '详情里的封号已更新',
  );
  const afterTitle = await readAssets(STEWARD);
  assert.deepEqual(txTypes(afterTitle), ['edit_fee'], '1 片 edit_fee 流水');
  assert.equal(el.sumLots(afterTitle.bamboos), 4);

  // ② 改姓名：同样 1 片
  const h2 = handles[1];
  const second = await noopSave('noop_fee', h2);
  const renamed = { ...formBodyFrom(second.raw), primary_name: { first_name: '佳玉子', surname_list: [{ surname: '刘' }] } };
  const t2 = treeMd5('noop_fee');
  const renamedRes = await call(`/people/${h2}`, 'PUT', H('noop_fee'), {}, renamed);
  assert.equal(renamedRes.statusCode, 200);
  assert.equal(bodyOf(renamedRes).fee.pieces, 1, '改姓名 = 1 片');
  assert.notEqual(treeMd5('noop_fee'), t2);
  assert.equal(readTree('noop_fee').people[h2].name, '刘佳玉子', '姓名已写入树 JSON');

  // ③ 改完再原值重放一次（现在 body 已等于现值）→ 应回 200 unchanged / 0 片（同一次会话内的连续 no-op）
  const replay = await noopSave('noop_fee', h2);
  assert.equal(replay.res.statusCode, 200);
  assert.equal(replay.body.unchanged, true, '改完立即原值重放 = no-op');
  assert.equal(replay.body.fee.pieces, 0);
  assert.equal(el.sumLots((await readAssets(STEWARD)).bamboos), 3, 'no-op 不多扣');
});

// ================= ③ 缺陷 B：写失败不留幻影 =================

test('缺陷 B：updateTree 落盘失败（树文件 0444）→ 同进程读回磁盘真值、version 未脏、幻影不得落盘', async () => {
  const tree = noopTree('wh_tree');
  const handles = HANDLES('wh_tree'); // 本用例自己取句柄
  await scene({ trees: [tree], phone: STEWARD, bamboos: 5 });
  writeDetail(plainDetail('wh_tree', handles[1], 'I0301', '刘佳玉'));
  const h1 = handles[0];
  const h2 = handles[1];
  const diskBefore = treeMd5('wh_tree');
  const v0 = readTree('wh_tree').version;

  // 预热缓存（读取后缓存常驻）
  assert.equal((await call(`/people/${h1}`, 'GET', H('wh_tree'))).statusCode, 200);
  const warmBody = formBodyFrom(bodyOf(await call(`/people/${h1}`, 'GET', H('wh_tree'))));

  // 制造真实 IO 失败：树文件 0444（EACCES）
  fs.chmodSync(treePath('wh_tree'), 0o444);
  const failRes = await call(`/people/${h1}`, 'PUT', H('wh_tree'), {}, { ...warmBody, primary_name: { first_name: '幻影名', surname_list: [{ surname: '甲' }] } });
  fs.chmodSync(treePath('wh_tree'), 0o644);

  // 系统级失败 → 500（不再是把 500 报成 HTTP 400），且不回显本机路径 / 底层异常文本；余额已冲正
  assert.equal(failRes.statusCode, 500, `EACCES 落库失败应按系统错误出 500（实际 ${failRes.statusCode}）`);
  const failBody = bodyOf(failRes);
  assert.equal(failBody.error, eco.INTERNAL_ERROR_TEXT);
  assert.equal(failBody.status, 500);
  assert.equal(failBody.fee_refunded, true, '冲正标记仍在');
  assert.ok(!/trees\//.test(JSON.stringify(failBody)), '不得回显本机路径');
  assert.equal(el.sumLots((await readAssets(STEWARD)).bamboos), 5, '扣费已原路返还');
  assert.deepEqual(txTypes(await readAssets(STEWARD)), ['edit_fee', 'fee_refund']);
  assert.equal(treeMd5('wh_tree'), diskBefore, '磁盘树未变');

  // ★ 幻影必须消失：同进程 getTree 读回磁盘真值，且 version 未脏
  const rereadStore = await st.getTree('wh_tree');
  assert.equal(rereadStore.people[h1].name, '甲三', '同进程 store.getTree 必须读回磁盘真值（不留幻影）');
  assert.equal(rereadStore.version, v0, 'version 未脏');
  assert.equal(rereadStore.updated_at, readTree('wh_tree').updated_at, 'updated_at 未脏');
  const rereadApi = await call(`/people/${h1}`, 'GET', H('wh_tree'));
  assert.equal(rereadApi.statusCode, 200);
  assert.equal(bodyOf(rereadApi).primary_name.first_name, '三', '同进程读接口不得显示幻影名');
  assert.equal(bodyOf(rereadApi).gramps_id, 'I0300');

  // ★ 夹具 C：幻影不得随另一次正常写入落盘
  const h2Warm = formBodyFrom(bodyOf(await call(`/people/${h2}`, 'GET', H('wh_tree'))));
  fs.chmodSync(treePath('wh_tree'), 0o644); // 恢复可写（上一段已恢复，这里显式再确认）
  const okRes = await call(`/people/${h2}`, 'PUT', H('wh_tree'), {}, { ...h2Warm, primary_name: { first_name: '佳玉改', surname_list: [{ surname: '刘' }] } });
  assert.equal(okRes.statusCode, 200, `恢复可写后的正常写入应成功（实际 ${okRes.statusCode} ${okRes.body}）`);
  const disk = readTree('wh_tree');
  assert.equal(disk.people[h1].name, '甲三', '第 1 个节点的幻影名不得被这次正常写入带到磁盘');
  assert.equal(disk.people[h2].name, '刘佳玉改', '本次写入的目标节点已落盘');
  assert.equal(disk.version, v0 + 1, '只自增一次（失败那次不计）');
});

test('缺陷 B：saveTree 直接失败 → version / updated_at 原地回滚 + 缓存失效（磁盘才是真值）', async () => {
  const h1 = 'wh_tree-p1';
  const t = await st.getTree('wh_tree'); // 取缓存里的同一份对象引用
  const v0 = t.version;
  const u0 = t.updated_at;
  t.people[h1].name = '幻影名2';
  fs.chmodSync(treePath('wh_tree'), 0o444);
  await assert.rejects(() => st.saveTree(t, t.version), (e) => e && e.code === 'EACCES');
  fs.chmodSync(treePath('wh_tree'), 0o644);
  assert.equal(t.version, v0, 'version 已回滚到自增前的值');
  assert.equal(t.updated_at, u0, 'updated_at 已回滚（不留「时间戳已变、内容没写」的脏值）');
  const again = await st.getTree('wh_tree');
  assert.equal(again.people[h1].name, '甲三', '缓存失效 → 读回磁盘真值');
  assert.equal(again.version, v0);
  assert.equal(readTree('wh_tree').people[h1].name, '甲三');
});

// ================= ④ 写序：树落盘成功之后才写详情 =================

test('写序：树落盘失败（0444）→ 详情文档字节未变、余额已冲正、响应 fee_refunded', async () => {
  const tree = noopTree('ord_tree');
  await scene({ trees: [tree], phone: STEWARD, bamboos: 5 });
  const h1 = HANDLES('ord_tree')[0];
  writeDetail(noopDetail('ord_tree', h1));
  const d0 = detailMd5('ord_tree', h1);
  const t0 = treeMd5('ord_tree');
  const bag0 = bagOf(await readAssets(STEWARD));

  const warm = formBodyFrom(bodyOf(await call(`/people/${h1}`, 'GET', H('ord_tree'))));
  // 同时改姓名 + 称号（两者都会被写：姓名进树 JSON、称号进详情文档）
  const body = {
    ...warm,
    primary_name: { first_name: '三改', surname_list: [{ surname: '甲' }] },
    attribute_list: warm.attribute_list.map((a) => ((typeof a.type === 'string' ? a.type : a.type?.string) === '号' ? { type: '号', value: '改了号' } : a)),
  };
  fs.chmodSync(treePath('ord_tree'), 0o444);
  const res = await call(`/people/${h1}`, 'PUT', H('ord_tree'), {}, body);
  fs.chmodSync(treePath('ord_tree'), 0o644);

  assert.equal(res.statusCode, 500, '系统级落库失败 → 500');
  const b = bodyOf(res);
  assert.equal(b.fee_refunded, true);
  assert.equal(detailMd5('ord_tree', h1), d0, '★ 树被拒 → 详情文档必须一个字节都没写（写序）');
  assert.equal(treeMd5('ord_tree'), t0, '树未写');
  assert.equal(bagOf(await readAssets(STEWARD)), bag0, '资产已逐字节冲正');
  assert.equal(bodyOf(await call(`/people/${h1}`, 'GET', H('ord_tree'))).primary_name.first_name, '三', '读回磁盘真值');
});

test('写序：树成功但详情写失败（详情目录 0555）→ 200 + detail_warning，树已落盘、扣费生效', async () => {
  const tree = noopTree('det_tree');
  await scene({ trees: [tree], phone: STEWARD, bamboos: 5 });
  const h2 = HANDLES('det_tree')[1]; // 该节点**没有**详情文档 → 写它需要目录写权限（0555 下必然 EACCES）
  assert.equal(fs.existsSync(detailPath('det_tree', h2)), false, '前置：该节点无详情文档');
  const t0 = treeMd5('det_tree');
  const v0 = readTree('det_tree').version;

  const warm = formBodyFrom(bodyOf(await call(`/people/${h2}`, 'GET', H('det_tree'))));
  const detailsDir = path.join(TMP, 'details');
  fs.chmodSync(detailsDir, 0o555);
  let res;
  try {
    res = await call(`/people/${h2}`, 'PUT', H('det_tree'), {}, {
      ...warm,
      primary_name: { first_name: '佳玉新', surname_list: [{ surname: '刘' }] },
      attribute_list: [...warm.attribute_list, { type: '号', value: '新号' }],
    });
  } finally {
    fs.chmodSync(detailsDir, 0o755);
  }

  assert.equal(res.statusCode, 200, '树已落盘 = 已提交 → 不得撕成失败（实际 ' + res.statusCode + ' ' + res.body + '）');
  const b = bodyOf(res);
  assert.equal(b.ok, true);
  assert.equal(b.fee.pieces, 1, '本次是真实修改：照常扣费');
  assert.equal(b.detail_warning, '称号/档案信息未保存，请重试', '详情写失败必须回警示');
  assert.equal(b.fee_refunded, undefined, '不退费（树已提交，退费等于送一次免费更改）');
  assert.notEqual(treeMd5('det_tree'), t0, '树已落盘');
  assert.equal(readTree('det_tree').version, v0 + 1);
  assert.equal(readTree('det_tree').people[h2].name, '刘佳玉新');
  assert.equal(fs.existsSync(detailPath('det_tree', h2)), false, '详情文档确实没写进去（夹具成立）');
  assert.deepEqual(txTypes(await readAssets(STEWARD)), ['edit_fee'], '只扣不退');
});

// ================= ④ 链节点（external_* 只在详情 attributes）=================

/**
 * 中华世本**链节点**形态（真源复现，见 `docs/economy-fee.spec.md` / 缺陷 A 残留）：树节点上
 * `external_tree` / `external_person_handle` / `external_link_type` 全是空串，真值只写在**详情文档
 * attributes** 里（连 `external_chain_gen` 一起）；GET 读路径会把它们合并进 `attribute_list` 回传。
 */
function chainNodeTree(id = 'chain_np') {
  const h = `${id}-c1`;
  return {
    ...SCHEMA,
    tree_id: id,
    founder_gramps_id: 'I0900',
    families: {},
    people: {
      [h]: node(h, 'I0900', '风甲', '风', '甲', {
        external_tree: '',
        external_person_handle: '',
        external_link_type: '',
        external_mirror: '',
      }),
    },
  };
}
const CHAIN_HANDLE = (id) => `${id}-c1`;
/** 链节点详情：external_* / external_chain_gen 只在详情 attributes（树节点上为空串） */
function chainNodeDetail(treeId, handle) {
  return {
    tree_id: treeId,
    handle,
    gramps_id: 'I0900',
    name: '风甲',
    events: [],
    media: [],
    citations: [],
    notes: [],
    attributes: [
      { key: 'external_tree', value: 'zhonghua', type: 'external_tree' },
      { key: 'external_chain_gen', value: '5', type: 'external_chain_gen' },
      { key: 'external_person_handle', value: 'c2ba3a9487ae538dc6b95f93', type: 'external_person_handle' },
      { key: 'external_link_type', value: 'chain', type: 'external_link_type' },
    ],
    updated_at: '2020-01-01T00:00:00.000Z',
  };
}

test('缺陷 A（链节点）：external_* 只在详情 attributes → 原样保存必须 no-op（200 unchanged / 0 片 / 无流水 / 树与详情不变）', async () => {
  const h = CHAIN_HANDLE('chain_np');
  await scene({ trees: [chainNodeTree('chain_np')], phone: STEWARD, bamboos: 5 });
  writeDetail(chainNodeDetail('chain_np', h));

  // 真实形态：先 GET（读路径合并详情 attributes）再原样 PUT
  const warm = await call(`/people/${h}`, 'GET', H('chain_np'));
  assert.equal(warm.statusCode, 200, '链节点读路径应可见');
  const raw = bodyOf(warm);
  const byKey = {};
  for (const a of raw.attribute_list || []) byKey[attrKeyOf(a)] = a.value;
  assert.equal(byKey.external_tree, 'zhonghua', '前置：读路径必须把详情里的 external_tree 合并进 attribute_list');
  assert.equal(byKey.external_chain_gen, '5', '前置：读路径必须把详情里的 external_chain_gen 合并进 attribute_list');

  const t0 = treeMd5('chain_np');
  const v0 = readTree('chain_np').version;
  const d0 = detailMd5('chain_np', h);

  const res = await call(`/people/${h}`, 'PUT', H('chain_np'), {}, formBodyFrom(raw));
  const b = bodyOf(res);
  assert.equal(res.statusCode, 200, `链节点原样 PUT 应 200（实际 ${res.statusCode} ${res.body}）`);
  assert.equal(b.unchanged, true, '链节点原样保存 = no-op（不得因 external_* 只在详情里而判变更）');
  assert.deepEqual(b.fee, { unit: 'bamboos', pieces: 0, balance: 5, balance_after: 5 }, '0 片且余额取实际值');
  assert.equal(treeMd5('chain_np'), t0, '树 JSON 逐字节未变');
  assert.equal(readTree('chain_np').version, v0, 'version 不动');
  assert.equal(readTree('chain_np').updated_at, SCHEMA.updated_at, 'updated_at 不动');
  assert.equal(detailMd5('chain_np', h), d0, '详情文档字节未变');
  const after = await readAssets(STEWARD);
  assert.equal(txCount(after), 0, '链节点 no-op 不得产生任何流水');
});

test('缺陷 A（链节点）：窄 body（仅 primary_name / name）→ 未提供的键不得判变更，不因 external_* 误扣 1 片', async () => {
  const h = CHAIN_HANDLE('chain_np');
  await scene({ trees: [chainNodeTree('chain_np')], phone: STEWARD, bamboos: 5 });
  writeDetail(chainNodeDetail('chain_np', h));
  await call(`/people/${h}`, 'GET', H('chain_np')); // 预热进程内缓存（真实形态先读后写）

  const person = readTree('chain_np').people[h];
  const detail = chainNodeDetail('chain_np', h);
  // 窄请求体：只有姓名，其余键（attribute_list / 性别 / 生卒 / 健在）一律**未提供**
  const narrow = { primary_name: { first_name: '甲', surname_list: [{ surname: '风' }] }, name: '风甲' };
  const pure = eco.personValueDiff(narrow, person, detail);
  assert.deepEqual(pure.fields.filter((f) => /^external/.test(f)), [], '不得因详情里的 external_* 判差异');
  assert.deepEqual(pure, { changed: false, fields: [] }, '窄 body + 链节点现值 = no-op（未提供 ≠ 变更）');

  const t0 = treeMd5('chain_np');
  const res = await call(`/people/${h}`, 'PUT', H('chain_np'), {}, narrow);
  const b = bodyOf(res);
  assert.equal(res.statusCode, 200, `窄 body PUT 应 200（实际 ${res.statusCode} ${res.body}）`);
  assert.equal(b.unchanged, true, '窄 body 与原值相同 → no-op');
  assert.equal(b.fee.pieces, 0, 'external_* 不得导致误扣 1 片');
  assert.equal(treeMd5('chain_np'), t0, '树未写');
  assert.equal(txCount(await readAssets(STEWARD)), 0, '无流水');
});

// ================= ⑤ 真源未变 =================

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
