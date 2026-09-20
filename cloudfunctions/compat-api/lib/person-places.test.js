/**
 * 出生地 / 居住地（结构化，契约 v2）单元测试
 *
 * 覆盖（每条都给独立断言，便于逐条对应）：
 *   C1/C2 形状（`birth_place` 对象两段 / `residence_places` 数组 / 上限常量）
 *   C3    读侧容错（字符串 → `{origin_code:'',note:原串}`；`null`/数字/数组 → 空；非数组 → `[]`；**不抛错**）
 *   C4    新建节点五处初值（`tree-write.createPerson` / 新链节点 / `createTree` / `addSpouseNode` /
 *         `child-write` 两处：本树子女 + 跨树镜像子女与其真身节点）
 *   C5    计费 / no-op 判定（`hasPersonChanges` 显式提供即算内容字段；对象 vs 历史字符串等价；
 *         居住地逐项 + 长度 + 顺序敏感）
 *   C6    始祖锁例外（只提地点字段放行；夹带 `primary_name` → 403；**放行路径不改写姓名**）
 *   C7    读响应形状（`profile.birth.{date,place,place_code,place_note}` + `residence_places[].{place,…}`）
 *   C8′   `POST /admin/set-tree-origin`（成功 + 五类失败：非本树节点 / 无法认定始祖 0 个 / N 个 /
 *         非三代内 / 无码；另附未登录 401、非总编辑 403、未知树 404）
 *   C10   第 10 条居住地 → 400 逐字「居住地最多 9 条」
 *   C11   `createTree` 把发源地码同时写进始祖 `birth_place.origin_code`
 *   R1    未知码 → 400 逐字「出生地行政区划代码无效：<码>」（`birth_place` 与 `residence_places` 每条）
 *   R2    `GET /tree/origin-candidates` 全列（含无码节点 `place_code==''`/`place==''`）；
 *         始祖无法认定 → `founder:null` + `candidates:[]` 且**不报 400**
 *   C1′/C2′ 写路径形状闸门：`residence_places` 显式提供但非数组 / `birth_place` 显式提供但非对象
 *         → 400 逐字（不扣费、不落盘、原值不变）；`null`/未提供仍按既有「无可修改内容」口径
 *   F5    显式 `null` 一律等同未提供：写路径不写、不清空、不计入变更判定（同批改其他字段照收 1 片，
 *         但地点字段原值必须不变）；置空一律由合法空值完成（`{origin_code:'',note:''}` / `[]`）
 *   只读预检  祖谱镜像 / 世本镜像 / chain 镜像夹带锁字段 → 403 且**资产流水零新增**（预检先于扣费）
 *   收尾  真源零写入：`config/tree-meta.json` md5 == c9112e40760839bc8d2132d6300b838b（契约冻结值）
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（同 founder-attach.test.js 模式），
 * 对 `migrate-output/`（trees + details + collections）与 `config/tree-meta.json` 零写入。
 * 运行：node --test cloudfunctions/compat-api/lib/person-places.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-person-places-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));

/** 真源基线（测试结束必须一模一样；tree-meta 另有契约冻结值逐字断言） */
const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);
/** 契约冻结的 tree-meta 指纹（docs/person-places.spec.md 冻结值） */
const FROZEN_META_MD5 = 'c9112e40760839bc8d2132d6300b838b';

// ---- /tmp 副本：tree-meta 夹具（每棵树只由一个用例使用 —— store 有进程内树缓存） ----

const META_TREES = {
  zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, path_alias: '/zhonghua', surname_char: '华', display_title: '中华世本 · 全球华人家谱总谱' },
  mp_cp: { tree_id: 'mp_cp', kind: 'family', display_title: '癸氏（createPerson 初值）' },
  mp_spouse: { tree_id: 'mp_spouse', kind: 'family', display_title: '子氏（addSpouseNode 初值）' },
  mp_local: { tree_id: 'mp_local', kind: 'family', display_title: '丑氏（本树子女初值）' },
  mp_child: { tree_id: 'mp_child', kind: 'family', display_title: '寅氏（跨树家庭发起侧）' },
  mp_remote: { tree_id: 'mp_remote', kind: 'family', display_title: '卯氏（真身树）' },
  mp_plain: { tree_id: 'mp_plain', kind: 'family', display_title: '甲氏（读形状 / 上限 / 未知码）', founder_handle: 'pp1' },
  mp_founder: { tree_id: 'mp_founder', kind: 'family', display_title: '乙氏（镜像始祖锁）', founder_handle: 'fdr' },
  mp_setok: { tree_id: 'mp_setok', kind: 'family', display_title: '丙氏（发源地指定成功）', founder_handle: 'sf' },
  mp_notmine: { tree_id: 'mp_notmine', kind: 'family', display_title: '丁氏（节点归属）', founder_handle: 'nm_f' },
  mp_zero: { tree_id: 'mp_zero', kind: 'family', display_title: '戊氏（0 个非镜像根）' },
  mp_multi: { tree_id: 'mp_multi', kind: 'family', display_title: '己氏（N 个非镜像根）' },
  mp_nocode: { tree_id: 'mp_nocode', kind: 'family', display_title: '庚氏（无码 / 脏码）', founder_handle: 'nc_f' },
  mp_cand: { tree_id: 'mp_cand', kind: 'family', display_title: '壬氏（候选全列）', founder_handle: 'cd_f', origin_code: '370000', origin: '山东省' },
  mp_shape: { tree_id: 'mp_shape', kind: 'family', display_title: '辛氏（地点字段形状闸门）' },
  mp_null: { tree_id: 'mp_null', kind: 'family', display_title: '壬氏（地点字段显式 null）' },
  mp_upperclan: { tree_id: 'mp_upperclan', kind: 'clan', display_title: '季氏祖谱（上层）' },
  mp_lockclan: { tree_id: 'mp_lockclan', kind: 'family', display_title: '癸氏（祖谱镜像锁）', founder_handle: 'lc_f' },
  mp_lockmaster: { tree_id: 'mp_lockmaster', kind: 'family', display_title: '子氏（世本镜像锁）', founder_handle: 'lm_f' },
};
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(process.env.COMPAT_META_FILE, JSON.stringify({ _schema: '1.1', trees: META_TREES }, null, 2) + '\n');

// ---- /tmp 副本：用户（路由权限用） ----

const CHIEF = '16600007101'; // chief_editor
const STEWARD = '16600007102'; // tree_steward（非总编辑对照）
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '本树主理人', role: 'tree_steward' },
  }),
);

const pp = await import('./person-places.js');
const eco = await import('./economy-fee.js');
const el = await import('./economy-ledger.js');
const tw = await import('./tree-write.js');
const fa = await import('./founder-attach.js');
const cw = await import('./child-write.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ---- 磁盘夹具工具 ----

const treePath = (id) => path.join(TMP, 'trees', `${id}.json`);
const detailPath = (treeId, handle) => path.join(TMP, 'details', `${treeId}:${handle}.json`);
const treeMd5 = (id) => md5(treePath(id));
const readTree = (id) => JSON.parse(fs.readFileSync(treePath(id), 'utf8'));
function writeTree(tree) {
  fs.writeFileSync(treePath(tree.tree_id), JSON.stringify(tree, null, 2));
}
function writeDetail(doc) {
  fs.writeFileSync(detailPath(doc.tree_id, doc.handle), JSON.stringify(doc, null, 2));
}

const SCHEMA = { _schema: '1.0', version: 1, updated_at: '2020-01-01T00:00:00.000Z' };
/** 树内节点（默认空出生地 / 空居住地——历史节点形态由调用方显式覆盖） */
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
  residence_places: [],
  death_place: '',
  parent_family: '',
  spouse_families: [],
  ...extra,
});

// ---- 认证 / 路由调用工具 ----

const chiefToken = signJwt({ sub: CHIEF, phone: CHIEF, role: 'chief_editor' }, 3600);
const stewardToken = signJwt({ sub: STEWARD, phone: STEWARD, role: 'tree_steward' }, 3600);

function call(p, method = 'GET', token = '', treeId = '', body = null) {
  return handleRequest({
    path: p,
    httpMethod: method,
    headers: {
      ...(token ? { authorization: ['Bea', 'rer '].join('') + token } : {}),
      ...(treeId ? { 'X-Tree-Id': treeId } : {}),
      'Content-Type': 'application/json',
    },
    body: body === null ? undefined : JSON.stringify(body),
  });
}
const json = (res) => JSON.parse(res.body);
const put = (treeId, handle, body, token = chiefToken) => call(`/people/${handle}`, 'PUT', token, treeId, body);
const getPerson = (treeId, handle, token = chiefToken) => call(`/people/${handle}`, 'GET', token, treeId);
const setOrigin = (body, token = chiefToken) => call('/admin/set-tree-origin', 'POST', token, body?.tree_id || '', body);

/** 一次 PUT 的真实消耗（竹片）：路由要求余额足够，否则 409 */
const DAY = 86400000;
async function fund(phone, n = 5) {
  await el.mutateAssets(phone, (u) =>
    Object.assign(u, {
      fragments: 0,
      seeds: [],
      jades: [],
      txs: [],
      signin_date: '',
      bamboos: [{ id: `bl_${phone}`, qty: n, expires_at: new Date(Date.now() + 100 * DAY).toISOString(), source: 'admin', created_at: new Date().toISOString() }],
    }),
  );
}

// ==================== C1 / C2：形状与常量 ====================

test('C1/C2 形状：birth_place 恒为两段对象、residence_places 恒为数组、上限常量冻结', () => {
  assert.equal(pp.MAX_RESIDENCE_PLACES, 9);
  assert.equal(pp.RESIDENCE_LIMIT_MESSAGE, '居住地最多 9 条');
  assert.deepEqual(pp.PERSON_PLACE_FIELDS, ['birth_place', 'residence_places']);

  // C1 归一后键集恒定（不夹带原始对象上的其它字段）
  const two = pp.normalizeBirthPlace({ origin_code: '370000', note: '鲁地', extra: '丢弃' });
  assert.deepEqual([...Object.keys(two)].sort(), ['note', 'origin_code']);
  assert.deepEqual(two, { origin_code: '370000', note: '鲁地' });
  // C2 数组逐项归一；顺序保持（顺序即展示顺序）
  assert.deepEqual(pp.normalizeResidencePlaces([{ origin_code: '370000', note: '' }, '临淄']), [
    { origin_code: '370000', note: '' },
    { origin_code: '', note: '临淄' },
  ]);
  // 新建节点的初值（C1/C2 的「无内容」形态）
  assert.deepEqual(pp.normalizeBirthPlace(undefined), { origin_code: '', note: '' });
  assert.deepEqual(pp.normalizeResidencePlaces(undefined), []);
  assert.equal(pp.hasPlaceContent({ origin_code: '', note: '' }), false, '空码空备注 = 无内容');
  assert.equal(pp.hasPlaceContent({ origin_code: '370000', note: '' }), true);
  assert.equal(pp.hasPlaceContent('临淄'), true, '历史字符串 = 有内容（备注）');
});

// ==================== C3：读侧容错 ====================

test('C3 读侧容错：历史字符串 → {origin_code:"",note:原串}；null/数字/数组 → 空；非数组 → []；均不抛错', () => {
  // 字符串（历史形态）：原串进 note，码恒空
  assert.deepEqual(pp.normalizeBirthPlace('临淄'), { origin_code: '', note: '临淄' });
  assert.deepEqual(pp.normalizeBirthPlace('  临淄  '), { origin_code: '', note: '临淄' });
  assert.deepEqual(pp.normalizeBirthPlace(''), { origin_code: '', note: '' });
  // null / undefined / 数字 / 布尔 / 数组 → 空对象
  for (const bad of [null, undefined, 0, 123, -1, true, false, [], ['临淄'], NaN]) {
    assert.deepEqual(pp.normalizeBirthPlace(bad), { origin_code: '', note: '' }, `非法输入 ${JSON.stringify(bad)} 应归为空`);
  }
  // 对象缺字段 / 空字段
  assert.deepEqual(pp.normalizeBirthPlace({}), { origin_code: '', note: '' });
  assert.deepEqual(pp.normalizeBirthPlace({ origin_code: null, note: undefined }), { origin_code: '', note: '' });
  assert.deepEqual(pp.normalizeBirthPlace({ origin_code: ' 370000 ', note: ' x ' }), { origin_code: '370000', note: 'x' });
  assert.deepEqual(pp.normalizeBirthPlace({ origin_code: '   ', note: '   ' }), { origin_code: '', note: '' }, '空白串一并与空');
  // 居住地：非数组 → []（含历史字符串 / null / 对象 / 数字）
  for (const bad of [null, undefined, '临淄', {}, 123, true, NaN]) {
    assert.deepEqual(pp.normalizeResidencePlaces(bad), [], `非数组 ${JSON.stringify(bad)} → []`);
  }
  assert.deepEqual(pp.normalizeResidencePlaces([]), []);
  assert.deepEqual(pp.normalizeResidencePlaces([null, 3, ['x']]), [{ origin_code: '', note: '' }, { origin_code: '', note: '' }, { origin_code: '', note: '' }]);
  // 不抛错（逐类输入全过一遍）
  assert.doesNotThrow(() => {
    for (const v of [null, undefined, '', 0, 1, true, [], {}, ['a'], { origin_code: {} }, { origin_code: '999998', note: 3 }]) {
      pp.normalizeBirthPlace(v);
      pp.normalizeResidencePlaces(v);
      pp.placeViewOf(v);
      pp.residenceViewOf(v);
      pp.hasPlaceContent(v);
      pp.sameBirthPlace(v, v);
      pp.sameResidencePlaces(v, v);
      pp.treeOriginPatchOf(v);
      pp.isPlaceFieldsOnly(v);
    }
  });
  // 未知码 / 空码的展示串一律空串（不冒充展示串）
  assert.equal(pp.placeViewOf({ origin_code: '999998', note: '备注' }).place, '');
  assert.equal(pp.placeViewOf({ origin_code: '', note: '备注' }).place, '');
  assert.equal(pp.placeViewOf({ origin_code: '', note: '备注' }).place_note, '备注');
  assert.equal(pp.placeViewOf({ origin_code: '370000' }).place, '山东省');
});

// ==================== C4：新建节点五处初值 ====================

test('C4-1 新建人物（tree-write.createPerson）：birth_place={origin_code:"",note:""}、residence_places=[]', async () => {
  writeTree({ ...SCHEMA, tree_id: 'mp_cp', people: {}, families: {} });
  const r = await tw.createPerson('mp_cp', { primary_name: { first_name: '新', surname_list: [{ surname: '癸' }] }, gender: 1 });
  const person = readTree('mp_cp').people[r.handle];
  assert.ok(person, '新建节点应落盘');
  assert.deepEqual(person.birth_place, { origin_code: '', note: '' });
  assert.deepEqual(person.residence_places, []);
});

test('C4-2 新建源流链节点（appendChainNode → newChainPerson）：两字段初值同为结构化空值', async () => {
  writeTree({
    ...SCHEMA,
    tree_id: 'zhonghua',
    version: 3,
    founder_gramps_id: 'I0001',
    people: { ch_root: node('ch_root', 'I0001', '风伏羲', '风', '伏羲') },
    families: {},
  });
  writeDetail({ ...SCHEMA, tree_id: 'zhonghua', handle: 'ch_root', name: '风伏羲', events: [], attributes: [{ key: 'external_chain_gen', value: '0', type: 'external_chain_gen' }] });
  const r = await tw.appendChainNode({ treeId: 'zhonghua', parentHandle: 'ch_root', mode: 'new', name: '华一', gender: 'M', masterTreeId: 'zhonghua' });
  const person = readTree('zhonghua').people[r.child_handle];
  assert.ok(person, '续编节点应落盘');
  assert.deepEqual(person.birth_place, { origin_code: '', note: '' });
  assert.deepEqual(person.residence_places, []);
});

test('C4-3 / C11 createTree：发源地码同时写进始祖 birth_place.origin_code（不变量：树上发源地 = 某节点出生地）', async () => {
  const r = await tw.createTree({ surnameChar: '甲', founderName: '某', originCode: '370000' });
  const tree = readTree(r.tree_id);
  const founder = tree.people[r.founder_handle];
  assert.deepEqual(founder.birth_place, { origin_code: '370000', note: '' }, 'C11：始祖出生地码 = 建树发源地码');
  assert.deepEqual(founder.residence_places, []);
  // tree-meta 侧同码（结构化真源），`origin` 为名称表反查串
  const meta = JSON.parse(fs.readFileSync(process.env.COMPAT_META_FILE, 'utf8'));
  const entry = Object.values(meta.trees).find((t) => t.tree_id === r.tree_id);
  assert.equal(entry.origin_code, '370000');
  assert.equal(entry.origin, '山东省');
  // 未给码 → 两处都空（不臆造）
  const r2 = await tw.createTree({ surnameChar: '乙', founderName: '某' });
  const f2 = readTree(r2.tree_id).people[r2.founder_handle];
  assert.deepEqual(f2.birth_place, { origin_code: '', note: '' });
});

test('C4-4 添加配偶（addSpouseNode）：新建配偶节点两字段初值正确', async () => {
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_spouse',
    people: { sp_self: node('sp_self', 'I0001', '子某', '子', '某') },
    families: {},
  });
  const r = await tw.addSpouseNode({ treeId: 'mp_spouse', personHandle: 'sp_self', mode: 'new', name: '王氏', gender: 'F' });
  const spouse = readTree('mp_spouse').people[r.spouse_handle];
  assert.ok(spouse, '配偶节点应落盘');
  assert.deepEqual(spouse.birth_place, { origin_code: '', note: '' });
  assert.deepEqual(spouse.residence_places, []);
});

test('C4-5 添加子女（child-write）：本树新子女 + 跨树真身子女 + 本树镜像子女三处初值', async () => {
  // ① 本树（父母都在本树）
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_local',
    version: 2,
    people: {
      dad: node('dad', 'I0007', '沈克强', '沈', '克强', { spouse_families: ['fam'] }),
      mom: node('mom', 'I0008', '李氏', '李', '氏', { gender: 'F', spouse_families: ['fam'] }),
    },
    families: { fam: { handle: 'fam', gramps_id: 'F0003', father_handle: 'dad', mother_handle: 'mom', child_handles: [] } },
  });
  const local = await cw.addChildNode({ treeId: 'mp_local', personHandle: 'dad', name: '小二', gender: 'M' });
  const child = readTree('mp_local').people[local.child_handle];
  assert.deepEqual(child.birth_place, { origin_code: '', note: '' });
  assert.deepEqual(child.residence_places, []);

  // ② 跨树家庭（父为镜像）：真身子女落真身树 + 本树留镜像子女 —— 三处节点初值都要正确
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_child',
    version: 4,
    people: {
      loc_self: node('loc_self', 'I0002', '沈伟', '沈', '伟', { gender: 'F', spouse_families: ['family_loc'] }),
      loc_mirror: node('loc_mirror', 'I0003', '季志全', '季', '志全', {
        spouse_families: ['family_loc'],
        external_tree: 'mp_remote',
        external_person_handle: 'far_self',
        external_link_type: 'marriage',
        external_mirror: 'true',
      }),
    },
    families: { family_loc: { handle: 'family_loc', gramps_id: 'F0001', father_handle: 'loc_mirror', mother_handle: 'loc_self', child_handles: [] } },
  });
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_remote',
    version: 7,
    people: {
      far_self: node('far_self', 'I0001', '季志全', '季', '志全', { spouse_families: ['family_far'] }),
      far_mirror: node('far_mirror', 'I0004', '沈伟', '沈', '伟', {
        gender: 'F',
        spouse_families: ['family_far'],
        external_tree: 'mp_child',
        external_person_handle: 'loc_self',
        external_link_type: 'marriage',
        external_mirror: 'true',
      }),
    },
    families: { family_far: { handle: 'family_far', gramps_id: 'F500020', father_handle: 'far_self', mother_handle: 'far_mirror', child_handles: [] } },
  });
  const cross = await cw.addChildNode({ treeId: 'mp_child', personHandle: 'loc_self', name: '清昆', gender: 'M' });
  assert.equal(cross.cross_tree, true);
  assert.equal(cross.landed_tree_id, 'mp_remote');
  const realChild = readTree('mp_remote').people[cross.child_handle];
  assert.ok(realChild, '真身子女应落在真身树');
  assert.deepEqual(realChild.birth_place, { origin_code: '', note: '' });
  assert.deepEqual(realChild.residence_places, []);
  const mirrorChild = readTree('mp_child').people[cross.mirror_handle];
  assert.ok(mirrorChild, '本树应留镜像子女');
  assert.equal(mirrorChild.external_mirror, 'true');
  assert.deepEqual(mirrorChild.birth_place, { origin_code: '', note: '' });
  assert.deepEqual(mirrorChild.residence_places, []);
});

// ==================== C5：计费 / no-op 判定 ====================

test('C5 计费判定：只改出生地 → hasPersonChanges=true 且 isPersonUnchanged=false；对象 vs 历史字符串等价；居住地逐项+长度敏感', () => {
  // 只改出生地（现值是历史字符串）
  const person = {
    name: '甲一',
    surname: '甲',
    given: '一',
    gender: 'M',
    birth_date: '',
    death_date: '',
    birth_place: '临淄',
    residence_places: [{ origin_code: '', note: 'a' }, { origin_code: '370000', note: 'b' }],
    death_place: '',
    is_living: true,
  };
  const onlyPlace = { birth_place: { origin_code: '371325', note: '费县' } };
  assert.equal(eco.hasPersonChanges(onlyPlace), true, '出生地显式提供 = 内容字段（不得判无效请求）');
  assert.equal(eco.isPersonUnchanged(onlyPlace, person), false, '真的改了出生地 → 不是 no-op');
  assert.deepEqual(eco.personValueDiff(onlyPlace, person).fields, ['birth_place']);

  // 显式清空也算内容字段（真实清空 ≠ 无内容）
  assert.equal(eco.hasPersonChanges({ birth_place: '' }), true);
  assert.equal(eco.hasPersonChanges({ residence_places: [] }), true);
  assert.equal(eco.hasPersonChanges({}), false);

  // 对象 vs 历史字符串：规范化后同一内容 → no-op（否则「只改出生地」会被判成无改动/误扣）
  assert.equal(eco.isPersonUnchanged({ birth_place: { origin_code: '', note: '临淄' } }, person), true);
  assert.equal(eco.personValueDiff({ birth_place: { origin_code: '', note: ' 临淄 ' } }, person).changed, false, 'trim 后同口径');
  assert.equal(eco.isPersonUnchanged({ birth_place: { origin_code: '370000', note: '临淄' } }, person), false, '码不同 = 变更');
  assert.equal(eco.isPersonUnchanged({ birth_place: {} }, person), false, '清空历史字符串 = 变更');

  // 居住地：逐项 + 长度 + 顺序
  const sameOrder = { residence_places: [{ origin_code: '', note: 'a' }, { origin_code: '370000', note: 'b' }] };
  assert.equal(eco.isPersonUnchanged(sameOrder, person), true);
  assert.equal(eco.isPersonUnchanged({ residence_places: [{ origin_code: '', note: 'a' }] }, person), false, '少一条 = 变更');
  assert.deepEqual(eco.personValueDiff({ residence_places: [{ origin_code: '', note: 'a' }] }, person).fields, ['residence_places'], '少一条 = 变更');
  assert.equal(eco.isPersonUnchanged({ residence_places: [{ origin_code: '370000', note: 'b' }, { origin_code: '', note: 'a' }] }, person), false, '顺序变 = 变更（顺序即展示顺序）');
  assert.equal(eco.isPersonUnchanged({ residence_places: [{ origin_code: '', note: 'a' }, { origin_code: '370000', note: 'b' }, { origin_code: '', note: 'c' }] }, person), false, '多一条 = 变更');

  // 历史字符串数组 vs 对象数组（存量数据形态）
  const legacy = { ...person, residence_places: ['a', 'b'] };
  assert.equal(eco.isPersonUnchanged({ residence_places: [{ origin_code: '', note: 'a' }, { origin_code: '', note: 'b' }] }, legacy), true);
  assert.equal(eco.isPersonUnchanged({ residence_places: ['a', 'b'] }, { ...person, residence_places: [{ origin_code: '', note: 'a' }, { origin_code: '', note: 'b' }] }), true);

  // 两字段都进了值级比对的字段白名单
  assert.ok(eco.PERSON_VALUE_FIELDS.includes('birth_place'));
  assert.ok(eco.PERSON_VALUE_FIELDS.includes('residence_places'));
});

// ==================== C6：始祖锁例外 ====================

test('C6 始祖锁例外：只提 birth_place/residence_places 放行；夹带 primary_name → 403；放行路径不改写姓名', async () => {
  await fund(CHIEF);
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_founder',
    version: 3,
    people: {
      fdr: node('fdr', 'I0001', '季始祖公', '季', '始祖公', {
        birth_place: '祖地临淄',
        spouse_families: ['ffam'],
        external_tree: 'zhonghua',
        external_person_handle: 'ch_root',
        external_link_type: 'founder',
        external_mirror: 'true',
      }),
      kid: node('kid', 'I0002', '季子', '季', '子', { parent_family: 'ffam' }),
    },
    families: { ffam: { handle: 'ffam', gramps_id: 'F0001', father_handle: 'fdr', mother_handle: '', child_handles: ['kid'] } },
  });
  const tree = readTree('mp_founder');
  const entry = META_TREES.mp_founder;

  // ① 判据纯函数：显式提供的键必须全在白名单内且非空
  assert.equal(pp.isPlaceFieldsOnly({}), false, '空 body 照旧 403');
  assert.equal(pp.isPlaceFieldsOnly({ birth_place: {} }), true);
  assert.equal(pp.isPlaceFieldsOnly({ birth_place: {}, residence_places: [] }), true);
  assert.equal(pp.isPlaceFieldsOnly({ birth_place: {}, residence_places: [] , primary_name: { first_name: '改' } }), false);
  assert.equal(pp.isPlaceFieldsOnly({ birth_date: '1900' }), false);
  assert.equal(pp.isPlaceFieldsOnly({ birth_place: undefined, residence_places: null }), false, '全为 undefined/null = 等同空 body');
  assert.equal(pp.isPlaceFieldsOnly(null), false);

  // ② 只提地点字段 → assertFounderEditable 放行
  await assert.doesNotReject(() => fa.assertFounderEditable(tree, 'fdr', 'zhonghua', entry, { birth_place: { origin_code: '370000', note: '备注A' }, residence_places: [{ origin_code: '371325', note: '祖居' }] }));
  // 夹带身份字段 → 403（同一请求）
  await assert.rejects(
    () => fa.assertFounderEditable(tree, 'fdr', 'zhonghua', entry, { birth_place: { origin_code: '370000' }, primary_name: { first_name: '改', surname_list: [{ surname: '季' }] } }),
    (e) => e.status === 403 && e.message === fa.MIRROR_LOCK_MESSAGE,
  );

  // ③ 路由层：夹带 primary_name → 403 且一个字节不落
  const before = treeMd5('mp_founder');
  const deny = await put('mp_founder', 'fdr', { birth_place: { origin_code: '370000', note: '备注A' }, primary_name: { first_name: '改名', surname_list: [{ surname: '季' }] } });
  assert.equal(deny.statusCode, 403, `实际 ${deny.statusCode} ${deny.body}`);
  assert.equal(json(deny).error, '始祖节点信息需在中华世本（总谱）中修改');
  assert.equal(treeMd5('mp_founder'), before, '403 时不得写树');

  // ④ 路由层：只提地点字段 → 200，且姓名**不得**被改写（回归历史缺陷：放行路径把始祖姓名抹成「未知」）
  const ok = await put('mp_founder', 'fdr', { birth_place: { origin_code: '370000', note: '备注A' }, residence_places: [{ origin_code: '371325', note: '祖居' }] });
  assert.equal(ok.statusCode, 200, `实际 ${ok.statusCode} ${ok.body}`);
  assert.equal(json(ok).ok, true);
  assert.equal(json(ok).fee.pieces, 1, '真实修改 → 1 片');
  const after = readTree('mp_founder').people.fdr;
  assert.equal(after.name, '季始祖公', '★ 放行路径不得改写姓名');
  assert.equal(after.surname, '季');
  assert.equal(after.given, '始祖公');
  assert.deepEqual(after.birth_place, { origin_code: '370000', note: '备注A' });
  assert.deepEqual(after.residence_places, [{ origin_code: '371325', note: '祖居' }]);
  // 非始祖节点照旧可编辑
  const kidOk = await put('mp_founder', 'kid', { primary_name: { first_name: '子明', surname_list: [{ surname: '季' }] } });
  assert.equal(kidOk.statusCode, 200);
  assert.equal(readTree('mp_founder').people.kid.name, '季子明');
});

// ==================== C7：读响应形状 ====================

test('C7 读响应：profile.birth.{date,place,place_code,place_note}（place=码反查串，空码→空串）与 residence_places[].{place,place_code,place_note}', async () => {
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_plain',
    version: 5,
    people: {
      pp1: node('pp1', 'I0001', '甲一', '甲', '一', {
        birth_place: { origin_code: '370000', note: '备注A' },
        residence_places: [{ origin_code: '371325', note: '祖居' }, { origin_code: '', note: '某地' }],
      }),
      pp2: node('pp2', 'I0002', '甲二', '甲', '二', { birth_place: { origin_code: '', note: '只有备注' } }),
      pp3: node('pp3', 'I0003', '甲三', '甲', '三', { birth_date: '1949', birth_place: '' }),
    },
    families: {},
  });

  const r1 = await getPerson('mp_plain', 'pp1');
  assert.equal(r1.statusCode, 200, r1.body);
  const b1 = json(r1);
  assert.deepEqual(b1.profile.birth, { date: '', place: '山东省', place_code: '370000', place_note: '备注A' });
  assert.deepEqual(b1.residence_places, [
    { place: '山东省临沂市费县', place_code: '371325', place_note: '祖居' },
    { place: '', place_code: '', place_note: '某地' },
  ]);
  // 四键逐字（顺序无关，键集必须完全一致）
  assert.deepEqual([...Object.keys(b1.profile.birth)].sort(), ['date', 'place', 'place_code', 'place_note']);
  assert.deepEqual([...Object.keys(b1.residence_places[0])].sort(), ['place', 'place_code', 'place_note']);

  // 空码：place 空串，备注落 place_note（不冒充展示串）；有出生地内容即输出 profile.birth
  const b2 = json(await getPerson('mp_plain', 'pp2'));
  assert.deepEqual(b2.profile.birth, { date: '', place: '', place_code: '', place_note: '只有备注' });
  assert.deepEqual(b2.residence_places, []);

  // 有生年、无出生地：仍输出 profile.birth（四键齐全）
  const b3 = json(await getPerson('mp_plain', 'pp3'));
  assert.deepEqual(b3.profile.birth, { date: '1949', place: '', place_code: '', place_note: '' });
});

// ==================== C8′：发源地人工指定 ====================

test("C8′ POST /admin/set-tree-origin：成功 + 五类失败（非本树节点 / 始祖 0 个 / 始祖 N 个 / 三代外 / 无码）+ 401/403/404", async () => {
  // 三代夹具（始祖 → 二代 → 三代；第四代在范围外）
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_setok',
    version: 2,
    people: {
      sf: node('sf', 'I0001', '丙祖', '丙', '祖', { spouse_families: ['sfam1'], birth_place: { origin_code: '370000', note: '' } }),
      s2: node('s2', 'I0002', '丙二', '丙', '二', { parent_family: 'sfam1', spouse_families: ['sfam2'], birth_place: { origin_code: '110101', note: '京师' } }),
      s3: node('s3', 'I0003', '丙三', '丙', '三', { parent_family: 'sfam2', spouse_families: ['sfam3'], birth_place: { origin_code: '371325', note: '' } }),
      s4: node('s4', 'I0004', '丙四', '丙', '四', { parent_family: 'sfam3', birth_place: { origin_code: '110101', note: '' } }),
    },
    families: {
      sfam1: { handle: 'sfam1', gramps_id: 'F0001', father_handle: 'sf', mother_handle: '', child_handles: ['s2'] },
      sfam2: { handle: 'sfam2', gramps_id: 'F0002', father_handle: 's2', mother_handle: '', child_handles: ['s3'] },
      sfam3: { handle: 'sfam3', gramps_id: 'F0003', father_handle: 's3', mother_handle: '', child_handles: ['s4'] },
    },
  });
  // ① 成功：本树始祖三代内节点，出生地有码 → 写 tree-meta
  const ok = await setOrigin({ tree_id: 'mp_setok', person_handle: 's2' });
  assert.equal(ok.statusCode, 200, `实际 ${ok.statusCode} ${ok.body}`);
  const okBody = json(ok);
  assert.equal(okBody.ok, true);
  assert.equal(okBody.origin_code, '110101');
  assert.equal(okBody.origin, '北京市东城区');
  assert.deepEqual(okBody.source, { handle: 's2', gramps_id: 'I0002', name: '丙二' });
  const metaFile = JSON.parse(fs.readFileSync(process.env.COMPAT_META_FILE, 'utf8'));
  const entry = Object.values(metaFile.trees).find((t) => t.tree_id === 'mp_setok');
  assert.equal(entry.origin_code, '110101', 'tree-meta 已按人工指定改写');
  assert.equal(entry.origin, '北京市东城区');

  // ② 非本树节点（handle 属于别的树）→ 400
  writeTree({ ...SCHEMA, tree_id: 'mp_notmine', people: { nm_f: node('nm_f', 'I0009', '丁祖', '丁', '祖') }, families: {} });
  const notMine = await setOrigin({ tree_id: 'mp_setok', person_handle: 'nm_f' });
  assert.equal(notMine.statusCode, 400);
  assert.equal(json(notMine).error, '该节点不属于本树');

  // ③ 无法认定始祖：0 个非镜像根（唯一根是镜像节点）→ 400
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_zero',
    people: {
      z1: node('z1', 'I0010', '戊镜像', '戊', '镜像', { external_mirror: 'true', external_tree: 'mp_remote', external_person_handle: 'far_self', external_link_type: 'marriage' }),
      z2: node('z2', 'I0011', '戊二', '戊', '二', { parent_family: 'zfam' }),
    },
    families: { zfam: { handle: 'zfam', gramps_id: 'F0009', father_handle: '', mother_handle: '', child_handles: ['z2'] } },
  });
  const zero = await setOrigin({ tree_id: 'mp_zero', person_handle: 'z1' });
  assert.equal(zero.statusCode, 400);
  assert.equal(json(zero).error, '本树无法认定始祖：未登记始祖，且树内没有非镜像根节点');

  // ④ 无法认定始祖：N 个非镜像根 → 400
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_multi',
    people: { m1: node('m1', 'I0012', '己大', '己', '大'), m2: node('m2', 'I0013', '己小', '己', '小') },
    families: {},
  });
  const multi = await setOrigin({ tree_id: 'mp_multi', person_handle: 'm1' });
  assert.equal(multi.statusCode, 400);
  assert.equal(json(multi).error, '本树无法认定始祖：未登记始祖，且非镜像根节点有 2 个');

  // ⑤ 非三代内（第 4 代）→ 400
  const outOfScope = await setOrigin({ tree_id: 'mp_setok', person_handle: 's4' });
  assert.equal(outOfScope.statusCode, 400);
  assert.equal(json(outOfScope).error, '该节点不在本树始祖三代范围内（仅始祖及其下两代可作为发源地）');

  // ⑥ 无码（三代内但出生地无结构化码）→ 400；脏码 → 400（R1 同路由）
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_nocode',
    people: {
      nc_f: node('nc_f', 'I0014', '庚祖', '庚', '祖', { spouse_families: ['ncfam'], birth_place: '' }),
      nc_d: node('nc_d', 'I0015', '庚二', '庚', '二', { parent_family: 'ncfam', birth_place: { origin_code: '999998', note: '脏码' } }),
    },
    families: { ncfam: { handle: 'ncfam', gramps_id: 'F0010', father_handle: 'nc_f', mother_handle: '', child_handles: ['nc_d'] } },
  });
  const noCode = await setOrigin({ tree_id: 'mp_nocode', person_handle: 'nc_f' });
  assert.equal(noCode.statusCode, 400);
  assert.equal(json(noCode).error, '该节点未填写出生地行政区划代码');
  const dirtyCode = await setOrigin({ tree_id: 'mp_nocode', person_handle: 'nc_d' });
  assert.equal(dirtyCode.statusCode, 400);
  assert.equal(json(dirtyCode).error, '出生地行政区划代码无效：999998', 'R1：节点上的脏码不得被镜像进 tree-meta');

  // ⑦ 权限与存在性：未登录 401 / 非总编辑 403 / 未知树 404
  assert.equal((await call('/admin/set-tree-origin', 'POST', '', 'mp_setok', { tree_id: 'mp_setok', person_handle: 's2' })).statusCode, 401);
  assert.equal((await setOrigin({ tree_id: 'mp_setok', person_handle: 's2' }, stewardToken)).statusCode, 403);
  const missing = await setOrigin({ tree_id: 'mp_nowhere', person_handle: 'x' });
  assert.equal(missing.statusCode, 404);
  assert.equal(json(missing).error, '未找到 tree: mp_nowhere');
});

// ==================== C10 / R1：路由层拒绝（校验先于写入与扣费） ====================

test('C10 第 10 条居住地 → 400 逐字「居住地最多 9 条」（校验先于扣费；树一个字节不写）', async () => {
  await fund(CHIEF);
  const before = treeMd5('mp_plain');
  const ten = new Array(10).fill({ origin_code: '', note: 'x' });
  const res = await put('mp_plain', 'pp1', { residence_places: ten });
  assert.equal(res.statusCode, 400, `实际 ${res.statusCode} ${res.body}`);
  assert.equal(json(res).error, '居住地最多 9 条');
  assert.equal(treeMd5('mp_plain'), before, '被拒请求不得写树');
  // 9 条合法（走到写入分支）
  const nine = await put('mp_plain', 'pp1', { residence_places: new Array(9).fill({ origin_code: '', note: 'x' }) });
  assert.equal(nine.statusCode, 200, `9 条应放行（实际 ${nine.statusCode} ${nine.body}）`);
  assert.equal(readTree('mp_plain').people.pp1.residence_places.length, 9);
  // lib 层同一判据与文案
  assert.throws(
    () => pp.assertResidencePlacesLimit(new Array(10).fill({})),
    (e) => e.status === 400 && e.message === '居住地最多 9 条',
  );
  assert.equal(pp.assertResidencePlacesLimit(new Array(9).fill({})), true);
  assert.equal(pp.assertResidencePlacesLimit(undefined), true);
  assert.equal(pp.assertResidencePlacesLimit('x'.repeat(20)), true, '非数组不拦（归一后为 []）');
});

test('R1 未知码 → 400 逐字「出生地行政区划代码无效：<码>」（birth_place 与 residence_places 每条同判）', async () => {
  await fund(CHIEF);
  const before = treeMd5('mp_plain');
  // birth_place
  const badBirth = await put('mp_plain', 'pp1', { birth_place: { origin_code: '999998', note: 'x' } });
  assert.equal(badBirth.statusCode, 400, `实际 ${badBirth.statusCode} ${badBirth.body}`);
  assert.equal(json(badBirth).error, '出生地行政区划代码无效：999998');
  // 居住地第 2 条（逐条判）
  const badRes = await put('mp_plain', 'pp1', { residence_places: [{ origin_code: '370000', note: '' }, { origin_code: '999998', note: '' }] });
  assert.equal(badRes.statusCode, 400);
  assert.equal(json(badRes).error, '出生地行政区划代码无效：999998');
  // 非 6 位形态
  const badLen = await put('mp_plain', 'pp1', { birth_place: { origin_code: '37', note: '' } });
  assert.equal(badLen.statusCode, 400);
  assert.equal(json(badLen).error, '出生地行政区划代码无效：37');
  assert.equal(treeMd5('mp_plain'), before, '被拒请求不得写树（校验先于扣费 / 写入）');

  // lib 层同一判据：空码与历史字符串一律放行
  assert.equal(pp.unknownOriginCodeMessage('999998'), '出生地行政区划代码无效：999998');
  assert.equal(pp.assertKnownOriginCodes({ birth_place: { origin_code: '370000' }, residence_places: [{ origin_code: '', note: 'x' }, { origin_code: '371325' }] }), true);
  assert.equal(pp.assertKnownOriginCodes({ birth_place: '临淄', residence_places: ['临淄'] }), true, '历史字符串归一后无码 → 放行');
  assert.throws(() => pp.assertKnownOriginCodes({ birth_place: { origin_code: '999998' } }), (e) => e.status === 400 && e.message === '出生地行政区划代码无效：999998');
  assert.throws(
    () => pp.assertKnownOriginCodes({ residence_places: [{ origin_code: '370000' }, { origin_code: '999998', note: '' }] }),
    (e) => e.status === 400 && e.message === '出生地行政区划代码无效：999998',
  );
  assert.throws(() => pp.assertKnownOriginCodes({ birth_place: { origin_code: '37' } }), (e) => e.status === 400);
});

// ==================== R2：候选全列 ====================

test('R2 GET /tree/origin-candidates：全列（含无码节点 place_code==="" / place===""）；始祖无法认定 → founder:null + candidates:[] 且不报 400', async () => {
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_cand',
    version: 3,
    people: {
      cd_f: node('cd_f', 'I0001', '壬祖', '壬', '祖', { spouse_families: ['cfam1'], birth_place: { origin_code: '370000', note: '鲁地' } }),
      // 无出生地字段（历史形态：字段缺失）→ 归一为空 → 仍须出现在候选里
      cd_2: node('cd_2', 'I0002', '壬二', '壬', '二', { parent_family: 'cfam1', spouse_families: ['cfam2'] }),
      cd_3: node('cd_3', 'I0003', '壬三', '壬', '三', { parent_family: 'cfam2', spouse_families: ['cfam3'], birth_place: { origin_code: '110101', note: '京师' } }),
      cd_4: node('cd_4', 'I0004', '壬四', '壬', '四', { parent_family: 'cfam3', birth_place: { origin_code: '110101', note: '' } }),
    },
    families: {
      cfam1: { handle: 'cfam1', gramps_id: 'F0001', father_handle: 'cd_f', mother_handle: '', child_handles: ['cd_2'] },
      cfam2: { handle: 'cfam2', gramps_id: 'F0002', father_handle: 'cd_2', mother_handle: '', child_handles: ['cd_3'] },
      cfam3: { handle: 'cfam3', gramps_id: 'F0003', father_handle: 'cd_3', mother_handle: '', child_handles: ['cd_4'] },
    },
  });
  const res = await call('/tree/origin-candidates', 'GET', chiefToken, 'mp_cand');
  assert.equal(res.statusCode, 200, res.body);
  const body = json(res);
  assert.deepEqual(body.founder, { handle: 'cd_f', gramps_id: 'I0001', name: '壬祖' });
  assert.deepEqual(body.candidates.map((c) => c.handle), ['cd_f', 'cd_2', 'cd_3'], '全列：始祖 + 下 1–2 代（第 4 代不在内）');
  assert.deepEqual(body.candidates.map((c) => c.generation), [1, 2, 3]);
  // 无码节点也在列，且 place_code==='' / place===''
  const noCode = body.candidates.find((c) => c.handle === 'cd_2');
  assert.deepEqual(noCode.birth_place, { place: '', place_code: '', place_note: '' }, '无码节点必须全列（前端据此标「未填写」）');
  assert.deepEqual([...Object.keys(noCode.birth_place)].sort(), ['place', 'place_code', 'place_note']);
  // is_current = 出生地码 == tree-meta 当前 origin_code
  assert.equal(body.current.origin_code, '370000');
  assert.equal(body.candidates.find((c) => c.handle === 'cd_f').is_current, true);
  assert.equal(body.candidates.find((c) => c.handle === 'cd_3').is_current, false);
  assert.deepEqual(body.candidates.map((c) => c.birth_place.place_code), ['370000', '', '110101']);
  assert.deepEqual(body.candidates.map((c) => c.birth_place.place), ['山东省', '', '北京市东城区']);

  // 始祖无法认定（0 个非镜像根）→ founder:null + candidates:[]，**不报 400**
  const zero = await call('/tree/origin-candidates', 'GET', chiefToken, 'mp_zero');
  assert.equal(zero.statusCode, 200, `始祖无法认定不得报 400（实际 ${zero.statusCode} ${zero.body}）`);
  const zbody = json(zero);
  assert.equal(zbody.founder, null);
  assert.deepEqual(zbody.candidates, []);
  assert.equal(zbody.tree_id, 'mp_zero');

  // N 个非镜像根同样是 founder:null（不猜测）
  const multi = await call('/tree/origin-candidates', 'GET', chiefToken, 'mp_multi');
  assert.equal(multi.statusCode, 200);
  assert.equal(json(multi).founder, null);
  assert.deepEqual(json(multi).candidates, []);
});

// ==================== C1′/C2′ 形状闸门 + 只读预检先于扣费（2026-09-20 实测缺陷修复） ====================

/** 竹片总片数（资产断言的读数口径；与 economy-ledger 的 sumLots 同判） */
const assetPieces = (u) => (u.bamboos || []).reduce((s, b) => s + Number(b.qty || 0), 0);

test('C1′/C2′ 形状闸门：residence_places 非数组 / birth_place 非对象 → 400，不扣费、不落盘、原值不变', async () => {
  await fund(CHIEF);
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_shape',
    version: 1,
    people: { sp1: node('sp1', 'I0001', '辛一', '辛', '一') },
    families: {},
  });
  // ① 先落一组合法值（作为「原值」）
  const seed = await put('mp_shape', 'sp1', {
    birth_place: { origin_code: '230305', note: '备注甲' },
    residence_places: [{ origin_code: '371300', note: '居住地一条' }, { origin_code: '', note: '无码一条' }],
  });
  assert.equal(seed.statusCode, 200, `合法形状应放行（实际 ${seed.statusCode} ${seed.body}）`);
  const treeBefore = treeMd5('mp_shape');
  const assetsBefore = await el.getAssets(CHIEF);

  // ② residence_places 显式提供但非数组（字符串 / 对象 / 数字 / 布尔）→ 400 逐字
  for (const bad of ['not-an-array', { origin_code: '', note: '' }, 12, true, 0]) {
    const res = await put('mp_shape', 'sp1', { residence_places: bad });
    assert.equal(res.statusCode, 400, `residence_places=${JSON.stringify(bad)} 实际 ${res.statusCode} ${res.body}`);
    assert.equal(json(res).error, '居住地格式无效，应为数组');
  }
  // ③ birth_place 显式提供但非对象（字符串 / 数字 / 数组 / 布尔）→ 400 逐字
  for (const bad of ['临淄', 12, ['临淄'], true]) {
    const res = await put('mp_shape', 'sp1', { birth_place: bad });
    assert.equal(res.statusCode, 400, `birth_place=${JSON.stringify(bad)} 实际 ${res.statusCode} ${res.body}`);
    assert.equal(json(res).error, '出生地格式无效，应为对象');
  }
  // ④ 零副作用：树一个字节不写、余额不变、资产流水零新增（此前实测：200 + 扣 1 片 + 静默清空）
  assert.equal(treeMd5('mp_shape'), treeBefore, '被拒请求不得写树');
  const assetsAfter = await el.getAssets(CHIEF);
  assert.equal(assetsAfter.txs.length, assetsBefore.txs.length, '被拒请求不得产生任何资产流水');
  assert.equal(assetPieces(assetsAfter), assetPieces(assetsBefore), '被拒请求不得扣费');
  // ⑤ 原值不变（树内 + 读响应）
  const p = readTree('mp_shape').people.sp1;
  assert.deepEqual(p.residence_places, [{ origin_code: '371300', note: '居住地一条' }, { origin_code: '', note: '无码一条' }]);
  assert.deepEqual(p.birth_place, { origin_code: '230305', note: '备注甲' });
  const view = json(await getPerson('mp_shape', 'sp1'));
  assert.deepEqual(view.residence_places, [
    { place: '山东省临沂市', place_code: '371300', place_note: '居住地一条' },
    { place: '', place_code: '', place_note: '无码一条' },
  ]);
  assert.deepEqual(view.profile.birth, { date: '', place: '黑龙江省鸡西市梨树区', place_code: '230305', place_note: '备注甲' });

  // ⑥ 判据纯函数 + 写路径同一判据（未提供 / null 一律放行；合法形状放行）
  assert.equal(pp.RESIDENCE_SHAPE_MESSAGE, '居住地格式无效，应为数组');
  assert.equal(pp.BIRTH_PLACE_SHAPE_MESSAGE, '出生地格式无效，应为对象');
  assert.equal(pp.assertPlaceFieldShapes({}), true);
  assert.equal(pp.assertPlaceFieldShapes({ birth_place: null, residence_places: null }), true, 'null = 未提供');
  assert.equal(pp.assertPlaceFieldShapes({ birth_place: undefined, residence_places: undefined }), true);
  assert.equal(pp.assertPlaceFieldShapes({ birth_place: { origin_code: '', note: '' }, residence_places: [] }), true);
  assert.throws(() => pp.assertPlaceFieldShapes({ residence_places: 'x' }), (e) => e.status === 400 && e.message === '居住地格式无效，应为数组');
  assert.throws(() => pp.assertPlaceFieldShapes({ birth_place: 'x' }), (e) => e.status === 400 && e.message === '出生地格式无效，应为对象');
  await assert.rejects(
    () => tw.updatePerson('mp_shape', 'sp1', { residence_places: 'x' }, {}),
    (e) => e.status === 400 && e.message === '居住地格式无效，应为数组',
    '写路径（lib 层直调）同判据',
  );
  await assert.rejects(
    () => tw.updatePerson('mp_shape', 'sp1', { birth_place: 12 }, {}),
    (e) => e.status === 400 && e.message === '出生地格式无效，应为对象',
  );

  // ⑦ null 仍按既有口径（等同未提供 → 「无可修改内容」400，不是形状错），且不写树
  for (const body of [{ residence_places: null }, { birth_place: null }]) {
    const res = await put('mp_shape', 'sp1', body);
    assert.equal(res.statusCode, 400);
    assert.equal(json(res).error, '请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）');
  }
  assert.equal(treeMd5('mp_shape'), treeBefore, 'null 口径不得改写树');
});

test('F5 显式 null 一律等同未提供：单独提交 → 400 原值保留零扣费；同批改其他字段 → 200 扣 1 片但地点字段原值不变；合法空值仍可清空', async () => {
  await fund(CHIEF);
  const SEED_BIRTH = { origin_code: '371325', note: '费县老宅' };
  const SEED_RES = [{ origin_code: '370000', note: '济南' }, { origin_code: '', note: '无码一条' }];
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_null',
    version: 2,
    people: {
      nl1: node('nl1', 'I0001', '壬一', '壬', '一', { birth_place: SEED_BIRTH, residence_places: SEED_RES }),
      nl2: node('nl2', 'I0002', '壬二', '壬', '二', { birth_place: SEED_BIRTH, residence_places: SEED_RES }),
    },
    families: {},
  });

  // ---- ① 单独提交显式 null → 400「无可修改内容」（null = 未提供），原值不变、零扣费、txs 零新增 ----
  for (const body of [{ birth_place: null }, { residence_places: null }]) {
    const label = Object.keys(body)[0];
    const treeBefore = treeMd5('mp_null');
    const before = await el.getAssets(CHIEF);
    const res = await put('mp_null', 'nl1', body);
    assert.equal(res.statusCode, 400, `${label}:null 实际 ${res.statusCode} ${res.body}`);
    assert.equal(json(res).error, '请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号 / 出生地 / 居住地）', label);
    assert.equal(treeMd5('mp_null'), treeBefore, `${label}:null 被拒请求不得写树`);
    const after = await el.getAssets(CHIEF);
    assert.equal(after.txs.length, before.txs.length, `${label}:null 不得产生任何资产流水`);
    assert.equal(assetPieces(after), assetPieces(before), `${label}:null 不得扣费`);
    const p = readTree('mp_null').people.nl1;
    assert.deepEqual(p.birth_place, SEED_BIRTH, `${label}:null 原出生地不变`);
    assert.deepEqual(p.residence_places, SEED_RES, `${label}:null 原居住地不变`);
  }

  // ---- ② 同批带 primary_name 改动 + 两个 null → 200 扣 1 片，地点字段**原值不变**（核心断言） ----
  const beforeMix = await el.getAssets(CHIEF);
  const mixed = await put('mp_null', 'nl1', {
    primary_name: { first_name: '一明', surname_list: [{ surname: '壬' }] },
    birth_place: null,
    residence_places: null,
  });
  assert.equal(mixed.statusCode, 200, `实际 ${mixed.statusCode} ${mixed.body}`);
  assert.equal(json(mixed).fee.pieces, 1, '真实改名 → 照收 1 片（null 不影响计费）');
  const mixedPerson = readTree('mp_null').people.nl1;
  assert.equal(mixedPerson.name, '壬一明', '同批改名应落盘');
  assert.deepEqual(mixedPerson.birth_place, SEED_BIRTH, '★ null 不得静默清空出生地（原 {origin_code:"371325",note:"费县老宅"}）');
  assert.deepEqual(mixedPerson.residence_places, SEED_RES, '★ null 不得静默清空居住地（原 2 条）');
  const afterMix = await el.getAssets(CHIEF);
  assert.equal(afterMix.txs.length, beforeMix.txs.length + 1, '恰好一条流水');
  assert.equal(afterMix.txs[afterMix.txs.length - 1].type, 'edit_fee');
  assert.equal(assetPieces(afterMix), assetPieces(beforeMix) - 1, '恰好扣 1 片');
  // 读响应同样保留原值（不得出现空 place_code / 空数组）
  const view = json(await getPerson('mp_null', 'nl1'));
  assert.equal(view.profile.birth.place_code, '371325');
  assert.equal(view.profile.birth.place_note, '费县老宅');
  assert.deepEqual(view.residence_places, [
    { place: '山东省', place_code: '370000', place_note: '济南' },
    { place: '', place_code: '', place_note: '无码一条' },
  ]);

  // ---- lib 层同口径（三处判定一致：null = 未提供） ----
  const cur = readTree('mp_null').people.nl1;
  assert.equal(eco.hasPersonChanges({ birth_place: null, residence_places: null }), false, 'hasPersonChanges：null 不算内容字段');
  assert.equal(eco.personValueDiff({ birth_place: null, residence_places: null }, cur).changed, false, 'personValueDiff：null 不判变更');
  assert.deepEqual(eco.personValueDiff({ birth_place: null, residence_places: null, primary_name: { first_name: '一明', surname_list: [{ surname: '壬' }] } }, cur).fields, [], 'null 不参与比对（姓名字段此处与现值相同）');
  for (const k of ['birth_place', 'residence_places']) assert.ok(eco.PERSON_VALUE_FIELDS.includes(k));
  // 写路径同一判据（lib 层直调）：null 不得改写地点字段（lib 层会照常提交一次树写入 → 比字段，不比文件字节）
  const curSnapshot = JSON.parse(JSON.stringify(cur));
  await tw.updatePerson('mp_null', 'nl1', { birth_place: null, residence_places: null }, {});
  const curAfter = readTree('mp_null').people.nl1;
  assert.deepEqual(curAfter.birth_place, curSnapshot.birth_place, 'lib 层：null 不改写出生地');
  assert.deepEqual(curAfter.residence_places, curSnapshot.residence_places, 'lib 层：null 不改写居住地');
  assert.equal(curAfter.name, curSnapshot.name);
  assert.deepEqual(curAfter, curSnapshot, 'lib 层：null 请求不改任何字段');

  // ---- ③ 合法空值仍能正常清空（修复不得堵死清空路径） ----
  const cleared = await put('mp_null', 'nl2', { birth_place: { origin_code: '', note: '' }, residence_places: [] });
  assert.equal(cleared.statusCode, 200, `合法空值应放行（实际 ${cleared.statusCode} ${cleared.body}）`);
  assert.equal(json(cleared).fee.pieces, 1, '真实清空 = 变更 → 1 片');
  const p2 = readTree('mp_null').people.nl2;
  assert.deepEqual(p2.birth_place, { origin_code: '', note: '' }, '★ 合法空值仍可清空出生地');
  assert.deepEqual(p2.residence_places, [], '★ 合法空值仍可清空居住地');
  const view2 = json(await getPerson('mp_null', 'nl2'));
  assert.deepEqual(view2.residence_places, []);
  assert.equal('birth' in view2.profile, false, '清空后无生年无出生地 → 不输出 profile.birth（读侧既有口径）');
});

test('只读预检先于扣费：祖谱镜像 / 世本镜像 / chain 镜像夹带锁字段 → 403 且资产流水零新增', async () => {
  await fund(CHIEF);
  // 夹具：上层祖谱 + 三种只读分支的镜像节点（祖谱镜像 / 祖谱顶端链镜像 / 世本镜像）
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_upperclan',
    version: 1,
    people: { own: node('own', 'I0001', '季花', '季', '花') },
    families: {},
  });
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_lockclan',
    version: 2,
    people: {
      lc_f: node('lc_f', 'I0001', '季花', '季', '花', {
        external_tree: 'mp_upperclan',
        external_person_handle: 'own',
        external_link_type: 'founder',
        external_mirror: 'true',
      }),
      lc_ch: node('lc_ch', 'I0002', '季行父', '季', '行父', {
        external_tree: 'mp_upperclan',
        external_person_handle: 'own',
        external_link_type: 'chain',
        external_mirror: 'true',
      }),
      lc_kid: node('lc_kid', 'I0003', '季子', '季', '子'),
    },
    families: {},
  });
  writeTree({
    ...SCHEMA,
    tree_id: 'mp_lockmaster',
    version: 2,
    people: {
      lm_f: node('lm_f', 'I0001', '季始祖公', '季', '始祖公', {
        external_tree: 'zhonghua',
        external_person_handle: 'ch_root',
        external_link_type: 'founder',
        external_mirror: 'true',
      }),
    },
    families: {},
  });

  // 逐字文案（供登记：两支 403 文案不同，均保留）
  assert.equal(fa.MIRROR_LOCK_MESSAGE, '始祖节点信息需在中华世本（总谱）中修改');
  assert.equal(fa.CLAN_FOUNDER_LOCK_MESSAGE, '始祖节点信息需在本姓祖谱中修改');
  assert.equal(fa.CHAIN_MIRROR_LOCK_MESSAGE, '该节点为上层（中华世本）镜像，需到总谱修改');

  const body = { birth_place: {}, primary_name: { first_name: '改', surname_list: [{ surname: '季' }] } };
  const cases = [
    ['mp_lockclan', 'lc_f', '始祖节点信息需在本姓祖谱中修改', '祖谱镜像（上层 = 祖谱）'],
    ['mp_lockclan', 'lc_ch', '该节点为上层（中华世本）镜像，需到总谱修改', 'chain 镜像（祖谱顶端链）'],
    ['mp_lockmaster', 'lm_f', '始祖节点信息需在中华世本（总谱）中修改', '世本镜像（上层 = 中华世本）'],
  ];
  for (const [tid, handle, msg, label] of cases) {
    const treeBefore = treeMd5(tid);
    const before = await el.getAssets(CHIEF);
    const res = await put(tid, handle, body);
    assert.equal(res.statusCode, 403, `${label} 实际 ${res.statusCode} ${res.body}`);
    assert.equal(json(res).error, msg, label);
    assert.equal('fee_refunded' in json(res), false, `${label}：预检拦在扣费之前 → 不得出现 fee_refunded`);
    assert.equal(treeMd5(tid), treeBefore, `${label}：403 不得写树`);
    const after = await el.getAssets(CHIEF);
    assert.equal(after.txs.length, before.txs.length, `${label}：资产流水零新增（此前实测成对 edit_fee -1 + fee_refund +1）`);
    assert.equal(assetPieces(after), assetPieces(before), `${label}：余额不变`);
  }

  // 判据 = 同一函数（路由预检与写路径共用）→ lib 层直调同判
  const clanTree = readTree('mp_lockclan');
  assert.equal(await fa.personEditLockMessage(clanTree.people.lc_f, clanTree, 'zhonghua', META_TREES.mp_lockclan), '始祖节点信息需在本姓祖谱中修改');
  assert.equal(await fa.personEditLockMessage(clanTree.people.lc_ch, clanTree, 'zhonghua', META_TREES.mp_lockclan), '该节点为上层（中华世本）镜像，需到总谱修改');
  assert.equal(await fa.personEditLockMessage(clanTree.people.lc_kid, clanTree, 'zhonghua', META_TREES.mp_lockclan), '', '本树自有节点可编辑');
  await assert.rejects(
    () => tw.updatePerson('mp_lockclan', 'lc_f', body, { masterTreeId: 'zhonghua' }),
    (e) => e.status === 403 && e.message === fa.CLAN_FOUNDER_LOCK_MESSAGE,
  );

  // C6 例外未被误伤：只提地点字段 → 200 + 扣 1 片
  const ok = await put('mp_lockclan', 'lc_f', { birth_place: { origin_code: '371325', note: '祖居' } });
  assert.equal(ok.statusCode, 200, `祖谱镜像只提地点字段应放行（实际 ${ok.statusCode} ${ok.body}）`);
  assert.equal(json(ok).fee.pieces, 1);
  assert.deepEqual(readTree('mp_lockclan').people.lc_f.birth_place, { origin_code: '371325', note: '祖居' });
});

// ==================== 真源零写入 ====================

test('真源零写入：config/tree-meta.json md5 == c9112e40760839bc8d2132d6300b838b，且 migrate-output 逐字节未变', () => {
  assert.equal(md5(REAL_META), FROZEN_META_MD5, 'config/tree-meta.json 指纹被改动');
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 在本文件运行期间被改动');
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
