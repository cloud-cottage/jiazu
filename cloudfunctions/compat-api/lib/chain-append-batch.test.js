/**
 * 总谱批量续编单测 — `POST /admin/chain-append-batch` / `lib/tree-write.js` 的 `appendChainBatch`
 *
 * 需求（用户原文）：在中华世本里为某个节点添加子节点时，增加「批量添加子孙」：
 * 粘贴一段文本 → 前端解析出名字数组 → 后端“按一条线”依次添加子孙节点。
 * 已拍板口径（逐条断言）：
 *   · 写入方式 = 后端单个批量接口 + **单事务**（整批成功或整批不写，不得出现半条链）
 *   · 每批上限 = MAX_BATCH_CHAIN = 10 代（错误文案「一次最多添加 10 代，当前 N 代」）
 *   · **不得新增任何世数 / 深度上限**（本条用第 89 世 → 90–99 世的用例证明：72 只是等级阈值）
 *   · 解析在前端做（入参 = 已解析好的名字数组）；姓一律随父姓继承（不接受 surname 入参）；不做同名去重
 *
 * 覆盖：
 *   ① 真源护栏（开篇 / 收尾）——副本路径生效 + migrate-output/ 逐字节未变 + 真源 meta 无夹具指纹
 *   ② 纯函数 normalizeBatchNames / MAX_BATCH_CHAIN
 *   ③ 正常路 3 代（世数递 1 / 一条线 / 随父姓 / gender 全 M / is_living 全 false / 详情 / 编号唯一递增）
 *   ④ 10 代边界（第 89 世 → 第 90–99 世：证明不存在 72 / 90 世上限）
 *   ⑤ 1 代文案（`已续编第 49 世`）+ 世数 0 的原始节点可续编 + **不接受 surname 入参**
 *   ⑥ 与单节点续编（appendChainNode）**逐字一致**
 *   ⑦ 拒绝矩阵（逐条断言 status + 中文文案 + 树/详情均未写）
 *   ⑧ 原子性（三条真实 IO 失败注入）：详情目录只读（首写失败）/ 树文件只读（N 条详情已写、最终落库失败
 *      → 必须全部回收 + 缓存无幻影）/ 铸号落盘失败（回调内抛错）
 *
 * 数据安全：COMPAT_SOURCE=local + COMPAT_OUT_DIR=/tmp/chain-batch-<唯一>，meta 用 COMPAT_META_FILE 副本；
 * 本文件**不写** `migrate-output/` 与 `config/tree-meta.json`（`lib/store.js` 的 assertWriteAllowed 沙箱护栏
 * 同样保证：命中真源直接抛错）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/chain-append-batch.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');
const REAL_COLS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync('/tmp/chain-batch-');
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;
const TREES_DIR = path.join(TMP, 'trees');
const DETAILS_DIR = path.join(TMP, 'details');
const COLS_DIR = path.join(TMP, 'collections');
for (const d of [TREES_DIR, DETAILS_DIR, COLS_DIR]) fs.mkdirSync(d, { recursive: true });

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));

// ---- 真源基线（只读；文首 / 文末各断言一次）----
// migrate-output/**（无进程外写者）→ 逐字节 + 清单全额断言；
// config/tree-meta.json（运行中的本地服务 + 用户在界面上实时编辑的活文件）→ **不做字节断言**（低频假红），
// 改成确定性口径：沙箱写不进 + 真源里不得出现夹具专属 tree_id。
const REAL_META_RAW = fs.readFileSync(REAL_META, 'utf8');
const REAL_TREES_MD5 = dirBaseline(REAL_TREES);
const REAL_DETAILS_MD5 = dirBaseline(REAL_DETAILS);
const REAL_COLS_MD5 = dirBaseline(REAL_COLS);

function assertRealUntouched(tag) {
  const trees = fs.readdirSync(REAL_TREES);
  assert.deepEqual(trees.slice().sort(), [...REAL_TREES_MD5.keys()].sort(), `[${tag}] 真源 trees 清单变了`);
  for (const f of trees) assert.equal(md5(path.join(REAL_TREES, f)), REAL_TREES_MD5.get(f), `[${tag}] 真源树 ${f} 被改动`);
  const details = fs.readdirSync(REAL_DETAILS);
  assert.deepEqual(details.slice().sort(), [...REAL_DETAILS_MD5.keys()].sort(), `[${tag}] 真源 details 清单变了`);
  for (const f of details) assert.equal(md5(path.join(REAL_DETAILS, f)), REAL_DETAILS_MD5.get(f), `[${tag}] 真源详情 ${f} 被改动`);
  const cols = fs.readdirSync(REAL_COLS);
  assert.deepEqual(cols.slice().sort(), [...REAL_COLS_MD5.keys()].sort(), `[${tag}] 真源 collections 清单变了`);
  for (const f of cols) assert.equal(md5(path.join(REAL_COLS, f)), REAL_COLS_MD5.get(f), `[${tag}] 真源集合 ${f} 被改动`);

  const real = JSON.parse(fs.readFileSync(REAL_META, 'utf8'));
  assert.equal(typeof real.trees, 'object', `[${tag}] 真源 config/tree-meta.json 结构被破坏`);
  for (const id of ['cb_other']) {
    assert.equal(id in real.trees, false, `[${tag}] 夹具树「${id}」出现在真源 tree-meta：本套件写穿了真源（P0）`);
  }
  if (fs.readFileSync(REAL_META, 'utf8') !== REAL_META_RAW) {
    console.log(`[真源护栏 · ${tag}] 真源 tree-meta 被**进程外写者**改动（本套件写不进真源）→ 判为用户/界面并发编辑，跳过字节比对，绝不回写`);
  }
}

// ================= 夹具（全部落在 /tmp 副本） =================

const ZH = 'zhonghua';
const OTHER = 'cb_other';
const ROUTE = '/admin/chain-append-batch';
const SINGLE = '/admin/chain-append';

const P = (handle, gramps_id, surname, given, extra = {}) => ({
  handle,
  gramps_id,
  name: `${surname}${given}`,
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

/** 链节点夹具：zh-fu（gen 48·有配偶家族）/ zh-fu2（48）/ zh-fu3（89）/ zh-root（0）/ zh-agg（聚合）/ zh-off（不在链上） */
const zhonghua = {
  _schema: '1.0',
  tree_id: ZH,
  founder_gramps_id: 'I000052',
  version: 7,
  people: {
    'zh-fu': P('zh-fu', 'I000052', '风', '伏羲', { spouse_families: ['zh-fam-fu'] }),
    'zh-w1': P('zh-w1', 'I000053', '风', '女娲', { gender: 'F', spouse_families: ['zh-fam-fu'] }),
    'zh-fu2': P('zh-fu2', 'I000054', '风', '二号父'),
    'zh-fu3': P('zh-fu3', 'I000055', '风', '九世父'),
    'zh-root': P('zh-root', 'I000104', '风', '华胥', { gender: 'F' }),
    'zh-agg': P('zh-agg', 'I000099', '风', '聚合虚位'),
    'zh-off': P('zh-off', 'I000098', '风', '不在链上'),
    'zh-at1': P('zh-at1', 'I000060', '风', '原子一'),
    'zh-at0': P('zh-at0', 'I000059', '风', '见证父'),
    'zh-at2': P('zh-at2', 'I000061', '风', '原子二'),
    'zh-at3': P('zh-at3', 'I000062', '风', '原子三'),
    'zh-eq1': P('zh-eq1', 'I000063', '姬', '等价一'),
    'zh-eq2': P('zh-eq2', 'I000064', '姬', '等价二'),
  },
  families: {
    'zh-fam-fu': { handle: 'zh-fam-fu', gramps_id: 'F000048', father_handle: 'zh-fu', mother_handle: 'zh-w1', child_handles: [] },
  },
};

const otherTree = {
  _schema: '1.0',
  tree_id: OTHER,
  version: 1,
  people: { 'ot-1': P('ot-1', 'I009000', '王', '一号') },
  families: {},
};

const writeTree = (t) => fs.writeFileSync(path.join(TREES_DIR, `${t.tree_id}.json`), JSON.stringify(t, null, 2));
writeTree(zhonghua);
writeTree(otherTree);

const treePath = (id) => path.join(TREES_DIR, `${id}.json`);
const readTreeDisk = (id) => JSON.parse(fs.readFileSync(treePath(id), 'utf8'));
const treeMd5 = (id) => md5(treePath(id));
const peopleCount = (id) => Object.keys(readTreeDisk(id).people).length;
const familiesCount = (id) => Object.keys(readTreeDisk(id).families).length;

const detailPath = (treeId, handle) => path.join(DETAILS_DIR, `${treeId}:${handle}.json`);
const writeDetailDoc = (d) => fs.writeFileSync(detailPath(d.tree_id, d.handle), JSON.stringify(d, null, 2));
const readDetailDisk = (treeId, handle) => {
  const p = detailPath(treeId, handle);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};
const detailExists = (treeId, handle) => fs.existsSync(detailPath(treeId, handle));
const detailCount = () => fs.readdirSync(DETAILS_DIR).length;
/** 孤儿详情（有详情文档但没有对应节点）= 「半条链」残留的判据 */
const orphanDetails = (treeId) => {
  const tree = readTreeDisk(treeId);
  return fs
    .readdirSync(DETAILS_DIR)
    .filter((f) => f.startsWith(`${treeId}:`) && f.endsWith('.json'))
    .map((f) => f.slice(treeId.length + 1, -'.json'.length))
    .filter((h) => !tree.people[h]);
};

const chainDetail = (handle, gen, extra = []) => ({
  _id: `${ZH}:${handle}`,
  tree_id: ZH,
  handle,
  gramps_id: zhonghua.people[handle].gramps_id,
  name: zhonghua.people[handle].name,
  events: [],
  media: [],
  citations: [],
  notes: [],
  attributes: [{ key: 'external_chain_gen', value: String(gen), type: 'external_chain_gen' }, ...extra],
});
for (const [h, gen] of [
  ['zh-fu', 48],
  ['zh-w1', 48],
  ['zh-fu2', 48],
  ['zh-fu3', 89],
  ['zh-root', 0],
  ['zh-at1', 48],
  ['zh-at0', 48],
  ['zh-at2', 48],
  ['zh-at3', 48],
  ['zh-eq1', 48],
  ['zh-eq2', 48],
]) {
  writeDetailDoc(chainDetail(h, gen));
}
// 聚合虚位节点（代表多世）→ 续编必须拒绝；zh-off 刻意**不给详情** → 不在链上
writeDetailDoc(chainDetail('zh-agg', 2, [{ key: 'external_chain_aggregate', value: 'true', type: 'external_chain_aggregate' }]));

// ---- tree-meta 副本（夹具）----
fs.writeFileSync(
  META_FILE,
  JSON.stringify(
    {
      _schema: '1.1',
      trees: {
        [ZH]: {
          tree_id: ZH,
          kind: 'master',
          is_master: true,
          path_alias: '/zhonghua',
          surname_char: '华',
          display_title: '中华世本 · 全球华人家谱总谱',
        },
        [OTHER]: {
          tree_id: OTHER,
          kind: 'family',
          path_alias: '/cb_other',
          surname_char: '王',
          display_title: '王氏测试家族（链批量）',
          founder_handle: 'ot-1',
        },
      },
    },
    null,
    2,
  ) + '\n',
);

// ---- 用户 + 铸号计数器（本地集合文件形状 = { <_id>: <doc> }）----
const CHIEF = '16600000901';
const STEWARD = '16600000902';
const GUEST = '16600000903';
fs.writeFileSync(
  path.join(COLS_DIR, 'jiazu_users.json'),
  JSON.stringify({
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '主理人', role: 'tree_steward' },
    [GUEST]: { _id: GUEST, phone: GUEST, nickname: '游客', role: 'guest' },
  }),
);
const SEQ_FILE = path.join(COLS_DIR, 'jiazu_id_seq.json');
fs.writeFileSync(SEQ_FILE, JSON.stringify({ person: { _id: 'person', next: 500 }, family: { _id: 'family', next: 300 } }));

// ---- 模块（env 就位后再动态 import）----
const store = await import('./store.js');
const tw = await import('./tree-write.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const tokenOf = (phone, role) => signJwt({ sub: phone, phone, role }, 3600);
const CHIEF_TOKEN = tokenOf(CHIEF, 'chief_editor');
const call = (p, body, token) =>
  handleRequest({
    path: p,
    httpMethod: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
const bodyOf = (res) => JSON.parse(res.body);
const batch = (parentHandle, names, token = CHIEF_TOKEN) => call(ROUTE, { tree_id: ZH, parent_handle: parentHandle, names }, token);

// 每条用例的父节点互不共用（node:test 顶层用例串行执行，但夹具独立更好复核）
const at = (tree, handle) => tree.people[handle];

// ================= ① 真源护栏（开篇） =================

test('真源护栏（开篇）：副本路径生效（本套件写不进真源）+ migrate-output/ 逐字节未变', () => {
  assert.equal(store.PATHS.out, TMP, 'COMPAT_OUT_DIR 副本未生效');
  assert.equal(store.PATHS.metaFile, META_FILE, 'COMPAT_META_FILE 副本未生效');
  assert.equal(store.PATHS.sandbox, true, '沙箱写保护应生效');
  assert.ok(TMP.startsWith('/tmp/chain-batch-'), '数据根必须在 /tmp/chain-batch-* 副本内');
  assertRealUntouched('开篇');
});

// ================= ② 纯函数 =================

test('MAX_BATCH_CHAIN = 10（导出常量）+ normalizeBatchNames 逐条校验文案', () => {
  assert.equal(tw.MAX_BATCH_CHAIN, 10);
  assert.deepEqual(tw.normalizeBatchNames([' 甲 ', '乙']), ['甲', '乙'], 'trim 后原样返回');
  assert.equal(tw.normalizeBatchNames(Array(10).fill('甲')).length, 10, '10 代正是边界');
  assert.equal(tw.normalizeBatchNames(['甲'.repeat(20)])[0].length, 20, '20 字正是边界');

  assert.throws(() => tw.normalizeBatchNames([]), /请提供要添加的名字/);
  assert.throws(() => tw.normalizeBatchNames(undefined), /请提供要添加的名字/);
  assert.throws(() => tw.normalizeBatchNames('甲乙丙'), /请提供要添加的名字/);
  assert.throws(() => tw.normalizeBatchNames(Array(11).fill('甲')), /一次最多添加 10 代，当前 11 代/);
  assert.throws(() => tw.normalizeBatchNames(['甲', '  ', '丙']), /第 2 个名字为空/);
  assert.throws(() => tw.normalizeBatchNames(['甲'.repeat(21)]), /第 1 个名字过长（最多 20 字）/);
  assert.throws(() => tw.normalizeBatchNames(['甲', '乙', '丙'.repeat(21)]), /第 3 个名字过长（最多 20 字）/);
});

// ================= ③ 正常路 3 代 =================

test('正常路 3 代：世数递 1 / 一条线 / 随父姓 / 全 M / 全已故 / 详情 / 编号全局唯一递增', async () => {
  const before = { people: peopleCount(ZH), families: familiesCount(ZH), details: detailCount() };
  const res = await batch('zh-fu', ['高', '昌', '旦']);
  assert.equal(res.statusCode, 200, res.body);
  const body = bodyOf(res);

  // —— 出参契约（字面形状，多一个字段都要先拍板）——
  assert.deepEqual(Object.keys(body).sort(), ['added', 'count', 'end_gen', 'message', 'ok', 'start_gen']);
  assert.equal(body.ok, true);
  assert.equal(body.start_gen, 49, '父节点第 48 世 → 首个子节点第 49 世');
  assert.equal(body.end_gen, 51);
  assert.equal(body.count, 3);
  assert.equal(body.message, '已续编第 49–51 世，共 3 代');
  assert.equal(body.added.length, 3);
  assert.deepEqual(
    body.added.map((a) => [a.name, a.gen]),
    [['风高', 49], ['风昌', 50], ['风旦', 51]],
    '名字 = 姓 + 名，世数逐个递 1',
  );
  assert.deepEqual(body.added.map((a) => a.gramps_id), ['I000500', 'I000501', 'I000502'], '铸号器逐个取号');
  for (const a of body.added) assert.match(a.handle, /^[0-9a-f]{24}$/);

  // —— 树 JSON：3 个新节点，字段与单节点续编 mode='new' 逐字一致 ——
  const tree = readTreeDisk(ZH);
  assert.equal(peopleCount(ZH), before.people + 3);
  for (const [k, a] of body.added.entries()) {
    const p = at(tree, a.handle);
    assert.ok(p, `第 ${k + 1} 个节点已落盘`);
    assert.equal(p.name, a.name);
    assert.equal(p.surname, '风', '姓一律随父姓继承');
    assert.equal(p.given, ['高', '昌', '旦'][k]);
    assert.equal(p.gender, 'M', '新建默认男（既有口径）');
    assert.equal(p.is_living, false, '总谱节点锁定已故');
    assert.equal(p.birth_date, '');
    assert.equal(p.death_date, '');
    assert.equal(p.birth_place, '');
    assert.equal(p.death_place, '');
    assert.equal(p.external_tree, '', '结构字段 external_tree 不写（链归属走详情 attributes）');
    assert.equal(p.external_person_handle, '');
    assert.equal(p.external_link_type, '');
  }

  // —— 一条线单传：第 k 个的父 = 第 k-1 个 ——
  const [h1, h2, h3] = body.added.map((a) => a.handle);
  assert.equal(at(tree, h1).parent_family, 'zh-fam-fu', 'k=1：父已有配偶家族 → 追加 child_ref');
  assert.deepEqual(tree.families['zh-fam-fu'].child_handles, [h1], '追加到父既有家族，且**只有**第 1 个（不是并列）');
  const fam1 = tree.families[at(tree, h2).parent_family];
  assert.equal(fam1.father_handle, h1, 'k=2 的父家族之父 = 第 1 个新节点');
  assert.deepEqual(fam1.child_handles, [h2]);
  assert.deepEqual(at(tree, h1).spouse_families, [fam1.handle]);
  const fam2 = tree.families[at(tree, h3).parent_family];
  assert.equal(fam2.father_handle, h2, 'k=3 的父家族之父 = 第 2 个新节点');
  assert.deepEqual(fam2.child_handles, [h3]);
  assert.deepEqual(at(tree, h2).spouse_families, [fam2.handle]);
  assert.deepEqual(at(tree, h3).spouse_families, [], '链尾无配偶家族');
  assert.equal(familiesCount(ZH), before.families + 2, '3 个节点只新建 2 个家族（k=1 复用父家族）');

  // —— 详情文档：external_chain_gen / external_tree ——
  for (const [k, a] of body.added.entries()) {
    const d = readDetailDisk(ZH, a.handle);
    assert.ok(d, `第 ${k + 1} 个节点必须有详情文档`);
    assert.equal(d.tree_id, ZH);
    assert.equal(d.handle, a.handle);
    assert.equal(d.gramps_id, a.gramps_id);
    assert.equal(d.name, a.name);
    assert.deepEqual(d.attributes, [
      { key: 'external_chain_gen', value: String(49 + k), type: 'external_chain_gen' },
      { key: 'external_tree', value: ZH, type: 'external_tree' },
    ]);
    assert.match(d.updated_at, /^\d{4}-\d{2}-\d{2}T/);
  }
  assert.equal(detailCount(), before.details + 3, '不多不少 3 条详情');
  assert.deepEqual(orphanDetails(ZH), [], '无孤儿详情');

  // —— 编号全局唯一 + 递增（含其它树）——
  const seen = new Map();
  for (const f of fs.readdirSync(TREES_DIR).filter((x) => x.endsWith('.json'))) {
    const t = JSON.parse(fs.readFileSync(path.join(TREES_DIR, f), 'utf8'));
    for (const p of Object.values(t.people || {})) {
      const id = String(p.gramps_id || '');
      if (id) seen.set(id, (seen.get(id) || 0) + 1);
    }
  }
  for (const a of body.added) assert.equal(seen.get(a.gramps_id), 1, `${a.gramps_id} 必须全站唯一`);
  const nums = body.added.map((a) => parseInt(a.gramps_id.slice(1), 10));
  assert.deepEqual(nums, [...nums].sort((x, y) => x - y), '编号递增');
  assert.equal(new Set(nums).size, 3);
});

// ================= ④ 10 代边界 + 无世数上限 =================

test('10 代边界（第 89 世 → 第 90–99 世）：一次性写满 10 代；不存在 72 / 90 世上限', async () => {
  const names = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const before = { people: peopleCount(ZH), details: detailCount(), families: familiesCount(ZH) };
  const res = await batch('zh-fu3', names);
  assert.equal(res.statusCode, 200, res.body);
  const body = bodyOf(res);
  assert.equal(body.count, 10);
  assert.equal(body.start_gen, 90, '父节点第 89 世 → 第 90 世（超过 72 的「世乘级」阈值，仍必须放行）');
  assert.equal(body.end_gen, 99);
  assert.equal(body.message, '已续编第 90–99 世，共 10 代');
  assert.deepEqual(body.added.map((a) => a.gen), [90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
  assert.deepEqual(body.added.map((a) => a.name), names.map((n) => `风${n}`));
  assert.equal(peopleCount(ZH), before.people + 10);
  assert.equal(detailCount(), before.details + 10);
  assert.equal(
    familiesCount(ZH),
    before.families + 10,
    '每个新节点各建 1 个家族（父无配偶家族 → 新建；与单节点续编同一规则）',
  );
  // 每条新家族的 father 槽位 = 上一个节点（一条线单传）
  const tree10 = readTreeDisk(ZH);
  const chain = body.added.map((a) => a.handle);
  for (let k = 1; k < chain.length; k++) {
    const fam = tree10.families[tree10.people[chain[k]].parent_family];
    assert.equal(fam.father_handle, chain[k - 1], `第 ${k + 1} 个节点的父家族之父 = 第 ${k} 个节点`);
    assert.deepEqual(fam.child_handles, [chain[k]]);
  }
  // 详情世数逐节点递增
  assert.deepEqual(
    body.added.map((a) => readDetailDisk(ZH, a.handle).attributes[0].value),
    names.map((_, i) => String(90 + i)),
  );
  assert.deepEqual(orphanDetails(ZH), []);
});

// ================= ⑤ 1 代文案 + 原始节点（世数 0）+ 不接受 surname =================

test('1 代：文案「已续编第 49 世」；世数 0 的原始节点可续编第 1 世；**surname 入参一律被忽略**', async () => {
  const r1 = await batch('zh-fu2', ['甲']);
  assert.equal(r1.statusCode, 200, r1.body);
  const b1 = bodyOf(r1);
  assert.equal(b1.count, 1);
  assert.equal(b1.start_gen, 49);
  assert.equal(b1.end_gen, 49);
  assert.equal(b1.message, '已续编第 49 世', '单代文案不带区间与「共 N 代」');
  assert.equal(readTreeDisk(ZH).people[b1.added[0].handle].name, '风甲');

  const r2 = await batch('zh-root', ['初']);
  assert.equal(r2.statusCode, 200, r2.body);
  const b2 = bodyOf(r2);
  assert.equal(b2.start_gen, 1, '世数 0（原始节点）属「在链上」→ 可续编第 1 世');
  assert.equal(b2.message, '已续编第 1 世');
  assert.equal(readTreeDisk(ZH).people[b2.added[0].handle].name, '风初');

  // 路由不得接受 / 读取任何 surname 入参：显式传 surname='赵' 也必须随父姓
  const res = await call(ROUTE, { tree_id: ZH, parent_handle: 'zh-at1', names: ['改姓探针'], surname: '赵' }, CHIEF_TOKEN);
  assert.equal(res.statusCode, 200, res.body);
  const h = bodyOf(res).added[0].handle;
  const p = readTreeDisk(ZH).people[h];
  assert.equal(p.surname, '风', 'surname 入参必须被忽略（姓一律随父姓继承）');
  assert.equal(p.name, '风改姓探针');
  assert.equal(Object.values(readTreeDisk(ZH).people).some((x) => x.surname === '赵'), false, '全树不得出现改姓节点');
});

// ================= ⑥ 与单节点续编逐字一致 =================

test('与单节点续编 appendChainNode 逐字一致（同一父形态 → 字段 / 家族 / 详情全等）', async () => {
  // 批量接口的新建性别固定 'M'（派单口径）；单节点接口的 gender 由调用方给 → 对照时同样传 'M'
  const single = await call(SINGLE, { tree_id: ZH, parent_handle: 'zh-eq1', mode: 'new', name: '高', gender: 'M' }, CHIEF_TOKEN);
  assert.equal(single.statusCode, 200, single.body);
  const singleHandle = bodyOf(single).child_handle;

  const multi = await batch('zh-eq2', ['高']);
  assert.equal(multi.statusCode, 200, multi.body);
  const multiHandle = bodyOf(multi).added[0].handle;

  const tree = readTreeDisk(ZH);
  const strip = (p) => {
    const c = { ...p };
    delete c.handle;
    delete c.gramps_id;
    delete c.parent_family;
    delete c.spouse_families;
    return c;
  };
  assert.deepEqual(strip(at(tree, multiHandle)), strip(at(tree, singleHandle)), '人员字段逐字一致');

  const fSingle = tree.families[at(tree, singleHandle).parent_family];
  const fMulti = tree.families[at(tree, multiHandle).parent_family];
  assert.equal(fSingle.father_handle, 'zh-eq1');
  assert.equal(fMulti.father_handle, 'zh-eq2', '新家族之父 = 各自的父节点');
  assert.equal(fSingle.mother_handle, fMulti.mother_handle);
  assert.deepEqual(fSingle.child_handles.length, fMulti.child_handles.length);

  const dStrip = (d) => {
    const c = { ...d };
    delete c._id;
    delete c.handle;
    delete c.gramps_id;
    delete c.updated_at;
    return c;
  };
  assert.deepEqual(
    dStrip(readDetailDisk(ZH, multiHandle)),
    dStrip(readDetailDisk(ZH, singleHandle)),
    '详情文档（attributes / 各容器）逐字一致',
  );
  assert.equal(dStrip(readDetailDisk(ZH, multiHandle)).attributes[1].value, ZH);
});

// ================= ⑦ 拒绝矩阵 =================

test('拒绝矩阵：鉴权 / 目标 / 入参逐条 → 400·403·401 + 中文文案，且树与详情一字未写', async () => {
  const cases = [
    ['未登录', null, { tree_id: ZH, parent_handle: 'zh-fu', names: ['甲'] }, 401, /未登录或登录已过期/],
    ['游客 403', tokenOf(GUEST, 'guest'), { tree_id: ZH, parent_handle: 'zh-fu', names: ['甲'] }, 403, /需要总编辑权限/],
    ['主理人 403', tokenOf(STEWARD, 'tree_steward'), { tree_id: ZH, parent_handle: 'zh-fu', names: ['甲'] }, 403, /需要总编辑权限/],
    ['非总谱 tree_id', CHIEF_TOKEN, { tree_id: OTHER, parent_handle: 'ot-1', names: ['甲'] }, 400, /续编仅适用于中华世本总谱/],
    ['tree_id 缺失', CHIEF_TOKEN, { parent_handle: 'zh-fu', names: ['甲'] }, 400, /续编仅适用于中华世本总谱/],
    ['父不存在', CHIEF_TOKEN, { tree_id: ZH, parent_handle: 'zh-no-such', names: ['甲'] }, 400, /父节点不存在于总谱/],
    [
      '父不在链上',
      CHIEF_TOKEN,
      { tree_id: ZH, parent_handle: 'zh-off', names: ['甲'] },
      400,
      /该节点不在中华世本源流链上（无世数），无法续编下一世/,
    ],
    ['聚合虚位父', CHIEF_TOKEN, { tree_id: ZH, parent_handle: 'zh-agg', names: ['甲'] }, 400, /聚合虚位节点代表多世/],
    ['names=[]', CHIEF_TOKEN, { tree_id: ZH, parent_handle: 'zh-fu', names: [] }, 400, /请提供要添加的名字/],
    ['names 非数组', CHIEF_TOKEN, { tree_id: ZH, parent_handle: 'zh-fu', names: '甲乙丙' }, 400, /请提供要添加的名字/],
    ['names=11 条', CHIEF_TOKEN, { tree_id: ZH, parent_handle: 'zh-fu', names: Array(11).fill('甲') }, 400, /一次最多添加 10 代，当前 11 代/],
    ['含空名', CHIEF_TOKEN, { tree_id: ZH, parent_handle: 'zh-fu', names: ['甲', '  ', '丙'] }, 400, /第 2 个名字为空/],
    ['单个名字 21 字', CHIEF_TOKEN, { tree_id: ZH, parent_handle: 'zh-fu', names: ['甲'.repeat(21)] }, 400, /第 1 个名字过长（最多 20 字）/],
  ];
  for (const [name, token, body, status, re] of cases) {
    const before = { md5: treeMd5(ZH), people: peopleCount(ZH), details: detailCount() };
    const res = await call(ROUTE, body, token);
    assert.equal(res.statusCode, status, `${name}: 期望 ${status}，实际 ${res.statusCode} / ${res.body}`);
    assert.match(bodyOf(res).error, re, `${name}: 文案`);
    assert.equal(treeMd5(ZH), before.md5, `${name}: 树 JSON 逐字节未变（整批不写）`);
    assert.equal(peopleCount(ZH), before.people, `${name}: 人数未变`);
    assert.equal(detailCount(), before.details, `${name}: 无残留详情`);
  }
});

// ================= ⑧ 原子性（单事务见证 + 真实 IO 失败注入） =================

test('原子性 ⓪ 单事务写入见证：10 代整批只落盘一次（version 只 +1，不是 +10）', async () => {
  const before = { version: readTreeDisk(ZH).version, keys: Object.keys(readTreeDisk(ZH).people), people: peopleCount(ZH) };
  const res = await batch('zh-at0', ['见一', '见二', '见三', '见四', '见五', '见六', '见七', '见八', '见九', '见十']);
  assert.equal(res.statusCode, 200, res.body);
  const after = readTreeDisk(ZH);
  assert.equal(peopleCount(ZH), before.people + 10);
  assert.equal(
    after.version,
    before.version + 1,
    '10 个新节点 + 10 条详情 + 10 个家族挂接必须在**同一次** updateTree 内完成（version 只 +1；'
      + '「循环内多次 updateTree」会 +10 —— 那正是本用例要挡住的半条链写法）',
  );
  const added10 = bodyOf(res).added.map((a) => a.handle);
  assert.equal(added10.length, 10);
  for (const h of added10) {
    assert.ok(after.people[h], `${h} 已落盘`);
    assert.equal(before.keys.includes(h), false, '新节点一律使用全新 handle');
  }
});

test('原子性 ① 详情目录只读（首写真实 EACCES）→ 整批不写、缓存无幻影', async () => {
  const before = { md5: treeMd5(ZH), people: peopleCount(ZH), details: detailCount(), families: familiesCount(ZH) };
  let res;
  try {
    fs.chmodSync(DETAILS_DIR, 0o555); // 真实 EACCES：详情第 1 条就写不进去
    res = await batch('zh-at1', ['原子一', '原子二', '原子三', '原子四', '原子五']);
  } finally {
    fs.chmodSync(DETAILS_DIR, 0o755);
  }
  assert.equal(res.statusCode, 500, `系统级落库失败一律 500：${res.body}`);
  assert.equal(bodyOf(res).error, '服务内部错误', '只回通用文案（不回显 EACCES / 本机路径）');
  for (const leak of ['EACCES', 'permission denied', TMP, '/private/']) {
    assert.equal(res.body.includes(leak), false, `不得泄露「${leak}」：${res.body}`);
  }
  assert.equal(treeMd5(ZH), before.md5, '树 JSON 逐字节未变（回调抛错 → 不落盘）');
  assert.equal(peopleCount(ZH), before.people, '人数未变');
  assert.equal(familiesCount(ZH), before.families, '家族未变');
  assert.equal(detailCount(), before.details, '无残留详情文档');
  assert.deepEqual(orphanDetails(ZH), [], '无孤儿详情');

  // 进程内缓存不得留下盘上不存在的幻影节点（updateTree 的树对象是缓存对象引用）
  const cached = await store.getTree(ZH);
  const disk = readTreeDisk(ZH);
  assert.deepEqual(Object.keys(cached.people).sort(), Object.keys(disk.people).sort(), '缓存 people === 磁盘');
  assert.deepEqual(Object.keys(cached.families).sort(), Object.keys(disk.families).sort(), '缓存 families === 磁盘');
  assert.equal(cached.version, disk.version, '缓存 version === 磁盘（saveTree 未落盘不得留改前值）');
});

test('原子性 ② 树文件只读（N 条详情已写出后最终落库失败）→ 详情全部回收 + 缓存还原 + 树字节未变', async () => {
  const before = { md5: treeMd5(ZH), people: peopleCount(ZH), details: detailCount(), families: familiesCount(ZH) };
  let res;
  try {
    fs.chmodSync(treePath(ZH), 0o444); // 真实 EACCES：走完全部 IO（铸号 / 详情 / 家族）后才在 saveTree 失败
    res = await batch('zh-at2', ['回收一', '回收二', '回收三', '回收四']);
  } finally {
    fs.chmodSync(treePath(ZH), 0o644);
  }
  assert.equal(res.statusCode, 500, res.body);
  assert.equal(bodyOf(res).error, '服务内部错误');
  assert.equal(treeMd5(ZH), before.md5, '树 JSON 逐字节未变（含 version/updated_at 未动）');
  assert.equal(peopleCount(ZH), before.people);
  assert.equal(familiesCount(ZH), before.families);
  assert.equal(detailCount(), before.details, '本批已写出的 4 条详情必须全部回收（不留半条链）');
  assert.deepEqual(orphanDetails(ZH), [], '无孤儿详情');
  const cached = await store.getTree(ZH);
  const disk = readTreeDisk(ZH);
  assert.deepEqual(Object.keys(cached.people).sort(), Object.keys(disk.people).sort());
  assert.deepEqual(Object.keys(cached.families).sort(), Object.keys(disk.families).sort());
  assert.deepEqual(at(cached, 'zh-at2').spouse_families, [], '回滚后的缓存里父节点不得残留新家族');
  assert.equal(cached.version, disk.version);

  // 失败后系统仍自洽：同一父节点可以立刻正常续编（说明还原的是真实前态）
  const ok = await batch('zh-at2', ['重试一']);
  assert.equal(ok.statusCode, 200, ok.body);
  const tree = readTreeDisk(ZH);
  const h = bodyOf(ok).added[0].handle;
  assert.deepEqual(at(tree, 'zh-at2').spouse_families, [at(tree, h).parent_family], '只新建 1 个家族（无重复挂接）');
  assert.equal(tree.families[at(tree, h).parent_family].child_handles.length, 1);
});

test('原子性 ③ 铸号计数器落盘失败（回调内抛错）→ 整批不写、无残留详情', async () => {
  const before = { md5: treeMd5(ZH), people: peopleCount(ZH), details: detailCount() };
  let res;
  try {
    fs.chmodSync(SEQ_FILE, 0o444); // 真实 EACCES：回调内 nextPersonId 落盘失败
    res = await batch('zh-at3', ['铸号一', '铸号二']);
  } finally {
    fs.chmodSync(SEQ_FILE, 0o644);
  }
  assert.equal(res.statusCode, 500, res.body);
  assert.equal(bodyOf(res).error, '服务内部错误');
  assert.equal(treeMd5(ZH), before.md5);
  assert.equal(peopleCount(ZH), before.people);
  assert.equal(detailCount(), before.details);
  assert.deepEqual(orphanDetails(ZH), []);
  const cached = await store.getTree(ZH);
  assert.deepEqual(Object.keys(cached.people).sort(), Object.keys(readTreeDisk(ZH).people).sort(), '缓存无幻影节点');
});

// ================= ⑨ 真源护栏（收尾） =================

test('真源护栏（收尾）：migrate-output/ 逐字节未变 + 真源 tree-meta 无夹具指纹', () => {
  assertRealUntouched('收尾');
  assert.equal(store.PATHS.out, TMP, '全套用例跑完仍指向副本');
});
