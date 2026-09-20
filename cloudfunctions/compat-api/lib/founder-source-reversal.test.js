/**
 * 「始祖真源反转」（变体 A · 裁定书 v1 2026-09-20）专项回归测试
 *
 * 覆盖（逐节对应裁定书条款）：
 *   R2    家族树始祖 = 真身、本树可写；认祖登记（指向宗谱）不覆盖本树身份字段
 *   R2b   未登记始祖位可自填姓名/生卒；孤儿镜像（镜像标记在、真身不可达）→ 403 逐字
 *   R3    双向只读：指向下层家族树 / 上层祖谱 / 世本 / 世系链的镜像一律 403，文案逐字；
 *         外部树真身节点 → 200（对照）
 *   C6+B5 镜像只提 birth_place / residence_places → 放行，且详情 `attributes` 保持原值不变
 *         （B5：`attributes` 只在显式提供 `attribute_list` 时才全量替换）；同一请求夹带身份字段 → 403
 *   R4    一树一登记（重复 → 400）；宗谱登记镜像在本层只读；detach 后登记镜像被移除
 *   B3    R1 硬守卫：lib 层直调 `attachFounder` 指向世本 → 400 且世本「人数 + md5」不变
 *   B4    方向判据：世本镜像段 / 登记镜像 / 自有段三者并存时不互相污染；`clearClanTopMirror` 不误删登记镜像
 *   R6    世数下钻：沿 `external_*` 链下钻到真身节点读 `attributes.external_chain_gen`；
 *         链断 / 环 → `gen === null` 且不抛
 *   加强  被拒请求零资产流水（不得出现成对 `edit_fee -1` + `fee_refund +1`）+ 正对照；
 *         `isClanRegistration` 两个消费方的方向口径
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本（同 founder-attach.test.js 模式），
 * 收尾断言 `migrate-output/trees/*.json` 与 `config/tree-meta.json` 的 md5 未变（真源零写入）。
 * 运行：node --test cloudfunctions/compat-api/lib/founder-source-reversal.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-founder-reversal-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

// 真源基线（收尾逐文件复核；真源任何一字节变化都算本文件违规写入）
const realTreeBaseline = new Map(
  fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]),
);
const realMetaBaseline = md5(REAL_META);

// ---- tree-meta 夹具（每棵树只由一个用例使用 —— store 有进程内树缓存）----

const FAMILY = (id, title, extra = {}) => ({
  tree_id: id, kind: 'family', path_alias: `/mt/${id}`, surname_char: '季', display_title: title,
  founder_handle: 'f', enable_custom_domain: false, ...extra,
});
const CLAN = (id, title, extra = {}) => ({
  tree_id: id, kind: 'clan', path_alias: `/z/${id}`, surname: '季', surname_char: '季',
  display_title: title, genealogy_name: title, founder_handle: 'own_ji',
  master_tree_id: 'zhonghua', master_handle: 'mX', master_name: '季始祖公', enable_custom_domain: false, ...extra,
});

const TREES = {
  zhonghua: {
    tree_id: 'zhonghua', kind: 'master', is_master: true, path_alias: '/zhonghua', surname_char: '华',
    display_title: '中华世本 · 全球华人家谱总谱', genealogy_name: '中华世本', origin: '中华', enable_custom_domain: true,
  },
  // R2 / R2b
  mt_a_plain: FAMILY('mt_a_plain', '季氏测试家族 a-plain'),
  mt_a_reg: FAMILY('mt_a_reg', '季氏测试家族 a-reg'),
  mc_a_reg: CLAN('mc_a_reg', '季氏祖谱 a-reg'),
  mt_b_noreg: FAMILY('mt_b_noreg', '季氏测试家族 b-noreg', { founder_handle: '' }),
  mt_b_orphan: FAMILY('mt_b_orphan', '季氏测试家族 b-orphan'),
  // R3
  mc_c1: CLAN('mc_c1', '季氏祖谱 c1'),
  mt_c1: FAMILY('mt_c1', '季氏测试家族 c1'),
  mt_c2: FAMILY('mt_c2', '季氏测试家族 c2'),
  mt_c3: FAMILY('mt_c3', '季氏测试家族 c3'),
  // R4
  mc_e1: CLAN('mc_e1', '季氏祖谱 e1'),
  mt_e1: FAMILY('mt_e1', '季氏测试家族 e1'),
  mc_e2: CLAN('mc_e2', '季氏祖谱 e2'),
  mt_e2: FAMILY('mt_e2', '季氏测试家族 e2'),
  // B3（R1 硬守卫）
  mt_b3: FAMILY('mt_b3', '季氏测试家族 b3'),
  mc_b3: CLAN('mc_b3', '季氏祖谱 b3'),
  // B4
  mc_b4: CLAN('mc_b4', '季氏祖谱 b4'),
  mt_b4: FAMILY('mt_b4', '季氏测试家族 b4'),
  mc_b4b: CLAN('mc_b4b', '季氏祖谱 b4b', { founder_handle: '', master_tree_id: '', master_handle: '', master_name: '' }),
  mt_b4b: FAMILY('mt_b4b', '季氏测试家族 b4b'),
  // R6
  mc_r6: CLAN('mc_r6', '季氏祖谱 r6'),
  mt_r6: FAMILY('mt_r6', '季氏测试家族 r6'),
  // J
  mc_j2: CLAN('mc_j2', '季氏祖谱 j2', { founder_handle: '' }),
  mt_j1: FAMILY('mt_j1', '季氏测试家族 j1'),
  mc_j3: CLAN('mc_j3', '季氏祖谱 j3', { founder_handle: '' }),
};
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(META_FILE, JSON.stringify({ _schema: '1.1', trees: TREES }, null, 2));
/** 同一夹具的**内存形态**（`entryOf` 等读侧函数的入参形状 = `{ trees: {...} }`） */
const META_FIX = { _schema: '1.1', trees: TREES };

// ---- 用户（路由写权）----
const CHIEF = '16600009101';
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({ [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' } }),
);

const fa = await import('./founder-attach.js');
const clanLib = await import('./clan.js');
const tw = await import('./tree-write.js');
const el = await import('./economy-ledger.js');
const pp = await import('./person-places.js');
const store = await import('./store.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ---- 造数工具 ----

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
function readDetailAttr(treeId, handle) {
  const p = detailPath(treeId, handle);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).attributes : null;
}

const SCHEMA = { _schema: '1.0' };
const node = (handle, gramps_id, name, surname, given, extra = {}) => ({
  handle, gramps_id, name, surname, given, gender: 'M',
  birth_date: '', death_date: '', birth_place: '', death_place: '',
  parent_family: '', spouse_families: [],
  external_tree: '', external_person_handle: '', external_link_type: '', external_mirror: '',
  ...extra,
});

/** 普通家族树副本：始祖 f（I0001）+ 子 kid */
function familyTree(treeId, founderExtra = {}) {
  return {
    ...SCHEMA,
    tree_id: treeId,
    founder_gramps_id: 'I0001',
    version: 2,
    people: {
      f: node('f', 'I0001', '季某', '季', '某', founderExtra),
      kid: node('kid', 'I0002', '季子', '季', '子', { parent_family: 'fam' }),
    },
    families: { fam: { handle: 'fam', gramps_id: 'F0001', father_handle: 'f', mother_handle: '', child_handles: ['kid'] } },
  };
}

/** 祖谱副本：自有段入口 own_ji + 可选的顶端世本镜像段 / 登记镜像 */
function clanTree(treeId, ownName = '季花') {
  return {
    ...SCHEMA,
    tree_id: treeId,
    kind: 'clan',
    founder_gramps_id: 'I0001',
    version: 1,
    people: { own_ji: node('own_ji', 'I0002', ownName, ownName.slice(0, 1), ownName.slice(1)) },
    families: {},
  };
}

/** 在祖谱上挂顶端世本镜像段（depth=0 只留 founder 镜像 mir_mX） */
function addTopMirror(tree) {
  clanLib.applyClanTopMirror({
    tree,
    masterTree: readTree('zhonghua'),
    masterTreeId: 'zhonghua',
    masterHandle: 'mX',
    depth: 0,
    ownRootHandle: 'own_ji',
  });
  return tree;
}

/** 在祖谱上挂一条指向家族树始祖真身的登记镜像（R4） */
function addRegistration(clan, { handle, familyTreeId, familyTreeTitle, familyFounder, grampsId = 'I0900', prev = '' }) {
  fa.applyClanRegistration({
    clan,
    registration: fa.planClanRegistrationMirror({
      familyFounder, familyTreeId, familyTreeTitle, handle, grampsId, prevClanFounderHandle: prev,
    }),
  });
  return clan;
}

const MIRROR_MX = `${clanLib.CLAN_MIRROR_PREFIX}mX`;

// ---- 总谱副本（mRoot / mX 第 12 世 / mChild）：全测试只读 ----
writeTree({
  ...SCHEMA,
  tree_id: 'zhonghua',
  founder_gramps_id: 'I0001',
  version: 7,
  people: {
    mRoot: node('mRoot', 'I0001', '风伏羲', '风', '伏羲'),
    mX: node('mX', 'I0100', '季始祖公', '季', '始祖公', { spouse_families: ['mf1'] }),
    mChild: node('mChild', 'I0101', '季二世', '季', '二世', { parent_family: 'mf1', spouse_families: ['mf2'] }),
  },
  families: {
    mf1: { handle: 'mf1', gramps_id: 'F0001', father_handle: 'mX', mother_handle: '', child_handles: ['mChild'] },
  },
});
writeDetail({ _id: 'zhonghua:mX', tree_id: 'zhonghua', handle: 'mX', name: '季始祖公', events: [], attributes: [{ key: 'external_chain_gen', value: '12', type: 'external_chain_gen' }] });
writeDetail({ _id: 'zhonghua:mChild', tree_id: 'zhonghua', handle: 'mChild', name: '季二世', events: [], attributes: [{ key: 'external_chain_gen', value: '', type: 'external_chain_gen' }] });

// ---- 认证 / 路由调用工具 ----
const chiefToken = signJwt({ sub: CHIEF, phone: CHIEF, role: 'chief_editor' }, 3600);

function call(p, method = 'GET', treeId = '', body = null) {
  return handleRequest({
    path: p,
    httpMethod: method,
    headers: { authorization: ['Bea', 'rer '].join('') + chiefToken, 'X-Tree-Id': treeId, 'Content-Type': 'application/json' },
    body: body === null ? undefined : JSON.stringify(body),
  });
}
const json = (res) => JSON.parse(res.body);
const put = (treeId, handle, body) => call(`/people/${handle}`, 'PUT', treeId, body);

const DAY = 86400000;
/** 给总编辑足量竹片（PUT 需要余额，否则 409） */
async function fund(phone = CHIEF, n = 30) {
  await el.mutateAssets(phone, (u) =>
    Object.assign(u, {
      fragments: 0, seeds: [], jades: [], txs: [], signin_date: '',
      bamboos: [{ id: `bl_${phone}`, qty: n, expires_at: new Date(Date.now() + 100 * DAY).toISOString(), source: 'admin', created_at: new Date().toISOString() }],
    }),
  );
}
const assetPieces = (u) => (u.bamboos || []).reduce((s, b) => s + Number(b.qty || 0), 0);

/** 一次被拒 PUT 的零副作用断言（树 md5 / 流水条数 / 竹片数三不动） */
async function assertDeniedNoSideEffect(treeId, handle, body, msg) {
  const before = await el.getAssets(CHIEF);
  const treeBefore = treeMd5(treeId);
  const res = await put(treeId, handle, body);
  assert.equal(res.statusCode, 403, `实际 ${res.statusCode} ${res.body}`);
  assert.equal(json(res).error, msg, '文案必须逐字');
  assert.equal('fee_refunded' in json(res), false, '预检必须拦在扣费之前 → 不得出现 fee_refunded');
  assert.equal(treeMd5(treeId), treeBefore, '403 不得写树');
  const after = await el.getAssets(CHIEF);
  assert.equal(after.txs.length, before.txs.length, '被拒请求不得产生任何资产流水（此前实测成对 edit_fee -1 + fee_refund +1）');
  assert.equal(assetPieces(after), assetPieces(before), '被拒请求不得扣费');
  return res;
}

await fund();

// ==================== A. R2：家族树始祖 = 真身，本树可写 ====================

test('R2 家族树始祖真身：未认祖的始祖位可写；登记后（指针指向宗谱、无镜像标记）仍可编辑且身份字段不被覆盖', async () => {
  // 夹具：① 完全未认祖 ② 已认祖（external_tree=宗谱 + link_type=founder，但**无** external_mirror）
  writeTree(familyTree('mt_a_plain'));
  writeTree(familyTree('mt_a_reg', {
    external_tree: 'mc_a_reg', external_person_handle: 'own_ji', external_link_type: 'founder', external_mirror: '',
  }));
  writeTree(clanTree('mc_a_reg'));

  // ① 未认祖：判据放行 + 路由 200
  const t1 = readTree('mt_a_plain');
  assert.equal(fa.founderLockMessage(t1.people.f, t1, 'zhonghua', TREES.mt_a_plain), '');
  assert.equal(await fa.personEditLockMessage(t1.people.f, t1, 'zhonghua', TREES.mt_a_plain), '');
  const r1 = await put('mt_a_plain', 'f', { primary_name: { first_name: '某昌', surname_list: [{ surname: '季' }] }, birth_date: '1902', death_date: '1970' });
  assert.equal(r1.statusCode, 200, `实际 ${r1.statusCode} ${r1.body}`);
  assert.equal(json(r1).fee.pieces, 1, '真身编辑照收 1 片（正对照）');
  const a1 = readTree('mt_a_plain').people.f;
  assert.equal(a1.name, '季某昌');
  assert.equal(a1.birth_date, '1902');
  assert.equal(a1.death_date, '1970');

  // ② 已登记（指向宗谱）：**不是**镜像 → 可编辑
  const t2 = readTree('mt_a_reg');
  assert.equal(fa.hasFounderRegistrationPointer(t2.people.f), true, 'R2：登记指针 = link_type=founder + 有 external_tree + 无镜像标记');
  assert.equal(fa.isReadonlyMirror(t2.people.f, 'mt_a_reg'), false, 'R2：登记指针不得被判成镜像');
  assert.equal(fa.isOrphanMirror(t2.people.f), false);
  assert.equal(fa.founderLockMessage(t2.people.f, t2, 'zhonghua', TREES.mt_a_reg), '');
  assert.equal(await fa.personEditLockMessage(t2.people.f, t2, 'zhonghua', TREES.mt_a_reg), '');
  const r2 = await put('mt_a_reg', 'f', { primary_name: { first_name: '某隆', surname_list: [{ surname: '季' }] }, birth_date: '1901', death_date: '1980' });
  assert.equal(r2.statusCode, 200, `实际 ${r2.statusCode} ${r2.body}`);
  const a2 = readTree('mt_a_reg').people.f;
  assert.equal(a2.name, '季某隆', 'R2：本树始祖身份字段不被上层（宗谱）数据覆盖');
  assert.equal(a2.surname, '季');
  assert.equal(a2.given, '某隆');
  assert.equal(a2.birth_date, '1901');
  assert.equal(a2.gramps_id, 'I0001', '始祖位置不变');
  assert.equal(a2.external_tree, 'mc_a_reg', '登记指针不受编辑影响');
  assert.equal(a2.external_person_handle, 'own_ji');
  assert.equal(a2.external_link_type, 'founder');
  assert.equal(a2.external_mirror, '', 'R2：真身恒不写镜像标记（写了就被 R3 锁死）');
});

// ==================== B. R2b：未登记始祖位可自填 / 孤儿镜像只读 ====================

test('R2b 未登记始祖位可自填姓名生卒；孤儿镜像（镜像标记在、真身不可达）→ 403 且文案逐字', async () => {
  // ① 未登记（meta 无 founder_handle）+ 只填姓名生卒 → 成功
  writeTree({
    ...familyTree('mt_b_noreg'),
    founder_gramps_id: 'I0001',
    people: {
      f: node('f', 'I0001', '', '', ''),
      kid: node('kid', 'I0002', '季子', '季', '子', { parent_family: 'fam' }),
    },
  });
  const t1 = readTree('mt_b_noreg');
  assert.equal(fa.founderLockMessage(t1.people.f, t1, 'zhonghua', TREES.mt_b_noreg), '', 'R2b：取消「空白占位锁」');
  assert.equal(await fa.personEditLockMessage(t1.people.f, t1, 'zhonghua', TREES.mt_b_noreg), '');
  const ok = await put('mt_b_noreg', 'f', { primary_name: { first_name: '新立', surname_list: [{ surname: '季' }] }, birth_date: '1888', death_date: '1950' });
  assert.equal(ok.statusCode, 200, `实际 ${ok.statusCode} ${ok.body}`);
  const b1 = readTree('mt_b_noreg').people.f;
  assert.equal(b1.name, '季新立');
  assert.equal(b1.birth_date, '1888');
  assert.equal(b1.death_date, '1950');

  // ② 孤儿镜像（external_mirror='true' + external_tree 空）→ 只读，文案 = PLACEHOLDER_LOCK_MESSAGE
  writeTree({
    ...familyTree('mt_b_orphan', { external_mirror: 'true', external_link_type: 'founder' }),
    founder_gramps_id: 'I0001',
  });
  const t2 = readTree('mt_b_orphan');
  const orph = t2.people.f;
  assert.equal(fa.isOrphanMirror(orph), true);
  assert.equal(fa.isReadonlyMirror(orph, 'mt_b_orphan'), false, '真身不可达 → 走孤儿分支而非镜像分支');
  assert.equal(fa.founderLockMessage(orph, t2, 'zhonghua', TREES.mt_b_orphan), fa.PLACEHOLDER_LOCK_MESSAGE);
  assert.equal(await fa.personEditLockMessage(orph, t2, 'zhonghua', TREES.mt_b_orphan), fa.PLACEHOLDER_LOCK_MESSAGE);
  assert.equal(
    fa.PLACEHOLDER_LOCK_MESSAGE,
    '该节点为孤儿镜像（真身不可达）：请先解除登记后在本树重建始祖信息',
    'ORPHAN_MIRROR_LOCK_MESSAGE 逐字',
  );
  await assertDeniedNoSideEffect('mt_b_orphan', 'f', { primary_name: { first_name: '改名', surname_list: [{ surname: '季' }] } }, fa.PLACEHOLDER_LOCK_MESSAGE);
  // 孤儿镜像的写路径同判据（lib 层直调）
  await assert.rejects(
    () => tw.updatePerson('mt_b_orphan', 'f', { primary_name: { first_name: '改名', surname_list: [{ surname: '季' }] } }, { masterTreeId: 'zhonghua', founderEntry: TREES.mt_b_orphan }),
    (e) => e.status === 403 && e.message === fa.PLACEHOLDER_LOCK_MESSAGE,
  );
});

// ==================== C. R3 双向只读（逐字文案）+ C6 例外 ====================

test('R3 双向只读：指向下层家族树 / 上层祖谱 / 世本 / 世系链的镜像一律 403 逐字；外部树真身 → 200', async () => {
  // 夹具：① 宗谱内的登记镜像（向下 → mt_c1）② 家族树内指向上层祖谱的镜像（向上 → mc_c1）
  //       ③ 家族树内指向世本的镜像 ④ chain 镜像 ⑤ 真身（mt_c1 始祖）
  writeTree(familyTree('mt_c1'));
  writeTree(addRegistration(addTopMirror(clanTree('mc_c1')), {
    handle: 'reg_c1', familyTreeId: 'mt_c1', familyTreeTitle: TREES.mt_c1.display_title,
    familyFounder: readTree('mt_c1').people.f, prev: 'own_ji',
  }));
  writeTree(familyTree('mt_c2', {
    external_tree: 'mc_c1', external_person_handle: 'own_ji', external_link_type: 'founder', external_mirror: 'true',
  }));
  const c3 = familyTree('mt_c3', {
    external_tree: 'zhonghua', external_person_handle: 'mX', external_link_type: 'founder', external_mirror: 'true',
  });
  c3.people.chain1 = node('chain1', 'I0003', '季二世', '季', '二世', {
    external_tree: 'zhonghua', external_person_handle: 'mChild', external_link_type: 'chain', external_mirror: 'true',
  });
  writeTree(c3);
  writeDetail({ _id: 'mc_c1:reg_c1', tree_id: 'mc_c1', handle: 'reg_c1', name: '季某', events: [], attributes: [{ key: 'external_chain_gen', value: '9', type: 'external_chain_gen' }, { key: 'title', value: '封号甲', type: 'title' }] });

  const clan = readTree('mc_c1');
  const famTit = TREES.mt_c1.display_title;
  const famMsg = `该节点为 ${famTit} 始祖的镜像，需在 ${famTit} 中修改`;

  // 文案常量逐字（唯一真源）
  assert.equal(fa.MIRROR_LOCK_MESSAGE, '始祖节点信息需在中华世本（总谱）中修改');
  assert.equal(fa.CLAN_FOUNDER_LOCK_MESSAGE, '始祖节点信息需在本姓祖谱中修改');
  assert.equal(fa.CHAIN_MIRROR_LOCK_MESSAGE, '该节点为上层（中华世本）镜像，需到总谱修改');
  assert.equal(fa.familyMirrorLockMessage(TREES.mt_c1, 'mt_c1'), famMsg, 'R3 新方向文案口径（含树标题）');

  // 判据层（纯函数 + 同一函数）逐条对照
  assert.equal(await fa.personEditLockMessage(clan.people.reg_c1, clan, 'zhonghua', TREES.mc_c1), famMsg);
  assert.equal(await fa.personEditLockMessage(readTree('mt_c2').people.f, readTree('mt_c2'), 'zhonghua', TREES.mt_c2), fa.CLAN_FOUNDER_LOCK_MESSAGE);
  assert.equal(await fa.personEditLockMessage(readTree('mt_c3').people.f, readTree('mt_c3'), 'zhonghua', TREES.mt_c3), fa.MIRROR_LOCK_MESSAGE);
  assert.equal(await fa.personEditLockMessage(readTree('mt_c3').people.chain1, readTree('mt_c3'), 'zhonghua', TREES.mt_c3), fa.CHAIN_MIRROR_LOCK_MESSAGE);
  assert.equal(await fa.personEditLockMessage(clan.people.own_ji, clan, 'zhonghua', TREES.mc_c1), '', '宗谱自有段节点可编辑');

  // 路由层：四类镜像夹带身份字段 → 403 逐字 + 零资产流水（加强项 I）
  const body = { birth_place: { origin_code: '', note: '祖地甲' }, primary_name: { first_name: '改名', surname_list: [{ surname: '季' }] } };
  await assertDeniedNoSideEffect('mc_c1', 'reg_c1', body, famMsg);
  await assertDeniedNoSideEffect('mt_c2', 'f', body, fa.CLAN_FOUNDER_LOCK_MESSAGE);
  await assertDeniedNoSideEffect('mt_c3', 'f', body, fa.MIRROR_LOCK_MESSAGE);
  await assertDeniedNoSideEffect('mt_c3', 'chain1', body, fa.CHAIN_MIRROR_LOCK_MESSAGE);

  // ⑤ 对照：镜像镜子所指的**真身**（mt_c1 始祖）→ 200 且真身恒可编辑
  const before = await el.getAssets(CHIEF);
  const ok = await put('mt_c1', 'f', { primary_name: { first_name: '某真身', surname_list: [{ surname: '季' }] } });
  assert.equal(ok.statusCode, 200, `真身节点应可写（实际 ${ok.statusCode} ${ok.body}）`);
  assert.equal(json(ok).fee.pieces, 1);
  const after = await el.getAssets(CHIEF);
  assert.equal(after.txs.length, before.txs.length + 1, '正对照：真身编辑恰好 1 条流水');
  assert.equal(after.txs[after.txs.length - 1].type, 'edit_fee');
  assert.equal(assetPieces(after), assetPieces(before) - 1, '正对照：恰好扣 1 片');
  assert.equal(readTree('mt_c1').people.f.name, '季某真身');
  // 真身改了，宗谱内的登记镜像仍是只读副本（同一份数据不得有两个可写副本）
  assert.equal(await fa.personEditLockMessage(readTree('mc_c1').people.reg_c1, readTree('mc_c1'), 'zhonghua', TREES.mc_c1), famMsg);
});

// ==================== D. C6 例外 + B5 回归 ====================

test('C6 例外：镜像只提地点字段放行，且详情 attributes 保持原值（B5）；夹带 name / attribute_list → 403', async () => {
  const attrsBefore = readDetailAttr('mc_c1', 'reg_c1');
  assert.deepEqual(attrsBefore, [{ key: 'external_chain_gen', value: '9', type: 'external_chain_gen' }, { key: 'title', value: '封号甲', type: 'title' }]);

  // ① 判据：只含地点字段 → 放行；夹带 name / attribute_list → 404 口径判据为 false
  assert.equal(pp.isPlaceFieldsOnly({ birth_place: { origin_code: '', note: '祖地乙' } }), true);
  assert.equal(pp.isPlaceFieldsOnly({ birth_place: { origin_code: '', note: '祖地乙' }, name: '改名' }), false);
  assert.equal(pp.isPlaceFieldsOnly({ birth_place: { origin_code: '', note: '祖地乙' }, attribute_list: [{ key: 'title', value: '封号乙' }] }), false);
  assert.equal(pp.isPlaceFieldsOnly({ residence_places: [] }), true);

  // ② 路由层：只提 birth_place → 200 + 扣 1 片
  const treeBefore = treeMd5('mc_c1');
  const ok = await put('mc_c1', 'reg_c1', { birth_place: { origin_code: '', note: '祖地乙' } });
  assert.equal(ok.statusCode, 200, `C6 例外应放行（实际 ${ok.statusCode} ${ok.body}）`);
  assert.equal(json(ok).fee.pieces, 1);
  assert.notEqual(treeMd5('mc_c1'), treeBefore, '真实修改 → 树已落盘');

  // ③ B5：未提供 attribute_list → 详情 attributes **一个字节不变**（此前会被静默清成 []）
  assert.deepEqual(readDetailAttr('mc_c1', 'reg_c1'), attrsBefore, '★ B5：`attributes` 只在显式提供 `attribute_list` 时才全量替换');
  const reg = readTree('mc_c1').people.reg_c1;
  assert.deepEqual(reg.birth_place, { origin_code: '', note: '祖地乙' });
  assert.equal(reg.name, '季某', 'C6 插曲：放行路径不得把姓名抹成「未知」');
  assert.equal(reg.external_tree, 'mt_c1', '登记镜像指针不因地点编辑而变');
  assert.equal(reg.external_mirror, 'true');

  // ④ 同一请求夹带 name / attribute_list → 403 逐字 + 详情零改动
  await assertDeniedNoSideEffect('mc_c1', 'reg_c1', { birth_place: { origin_code: '', note: '祖地丙' }, name: '改名' }, fa.familyMirrorLockMessage(TREES.mt_c1, 'mt_c1'));
  const attrsMid = readDetailAttr('mc_c1', 'reg_c1');
  await assertDeniedNoSideEffect('mc_c1', 'reg_c1', { birth_place: { origin_code: '', note: '祖地丁' }, attribute_list: [{ type: 'title', value: '封号乙' }] }, fa.familyMirrorLockMessage(TREES.mt_c1, 'mt_c1'));
  assert.deepEqual(readDetailAttr('mc_c1', 'reg_c1'), attrsMid, '403 时详情 attributes 不得被改写');
  assert.equal(readTree('mc_c1').people.reg_c1.name, '季某');
  assert.deepEqual(readTree('mc_c1').people.reg_c1.birth_place, { origin_code: '', note: '祖地乙' }, '403 时树内原值不变');

  // ⑤ B5 的另一半口径（真身节点）：未提供 attribute_list → 保持原值；显式提供 → 全量替换
  writeDetail({ _id: 'mt_c1:f', tree_id: 'mt_c1', handle: 'f', name: '季某真身', events: [], attributes: [{ key: 'title', value: '封号甲', type: 'title' }, { key: 'external_chain_gen', value: '12', type: 'external_chain_gen' }] });
  await tw.updatePerson('mt_c1', 'f', { birth_place: { origin_code: '', note: '祖地己' } }, { masterTreeId: 'zhonghua' });
  assert.deepEqual(readDetailAttr('mt_c1', 'f'), [{ key: 'title', value: '封号甲', type: 'title' }, { key: 'external_chain_gen', value: '12', type: 'external_chain_gen' }], '未提供 attribute_list → attributes 原样保留');
  await tw.updatePerson('mt_c1', 'f', { attribute_list: [{ type: 'title', value: '封号乙' }] }, { masterTreeId: 'zhonghua' });
  assert.deepEqual(readDetailAttr('mt_c1', 'f'), [{ key: 'title', value: '封号乙', type: 'title' }], '显式提供 attribute_list → 全量替换');
});

// ==================== E. R4 一树一登记 / 登记镜像生命周期 ====================

test('R4 一树一登记：宗谱内已有登记再登记 → 400；登记镜像本层只读；detach 后登记镜像被移除', async () => {
  // ① 基数判据逐字
  const e1Clan = addRegistration(clanTree('mc_e1'), {
    handle: 'reg_e1', familyTreeId: 'mt_e1', familyTreeTitle: TREES.mt_e1.display_title,
    familyFounder: { handle: 'f', name: '季某', surname: '季', given: '某', gender: 'M', birth_date: '' }, prev: 'own_ji',
  });
  writeTree(e1Clan);
  writeTree(familyTree('mt_e1'));
  assert.throws(
    () => fa.assertOneRegistrationPerFamilyTree(e1Clan, 'mt_e1', 'mc_e1'),
    (e) => e.status === 400 && e.message === '该家族树在本宗谱内已有始祖登记，请先解除登记（或解除挂载）后再操作',
  );
  assert.equal(fa.clanRegistrationOf(e1Clan, 'mt_e1', 'mc_e1').handle, 'reg_e1');
  assert.equal(fa.assertOneRegistrationPerFamilyTree(e1Clan, 'mt_other', 'mc_e1'), undefined, '未登记过的家族树放行');

  // ② 路由层：直调 attachFounder（同家族树重复登记）→ 400 且两棵树 md5 都不动
  const mtBefore = treeMd5('mt_e1');
  const mcBefore = treeMd5('mc_e1');
  await assert.rejects(
    () => fa.attachFounder({ treeId: 'mt_e1', founderHandle: 'f', masterTreeId: 'mc_e1', masterHandle: 'own_ji', requestedBy: CHIEF }),
    (e) => e.status === 400 && /该家族树在本宗谱内已有始祖登记/.test(e.message),
  );
  assert.equal(treeMd5('mt_e1'), mtBefore, '400 不得写家族树');
  assert.equal(treeMd5('mc_e1'), mcBefore, '400 不得写宗谱');

  // ③ 正常登记 → 登记镜像本层只读 → detach 后登记镜像被移除
  writeTree(clanTree('mc_e2'));
  writeTree(familyTree('mt_e2'));
  const r = await fa.attachFounder({ treeId: 'mt_e2', founderHandle: 'f', masterTreeId: 'mc_e2', masterHandle: 'own_ji', requestedBy: CHIEF });
  assert.equal(r.ok, true);
  assert.equal(r.founder_true_body, true);
  const famMsg = fa.familyMirrorLockMessage(TREES.mt_e2, 'mt_e2');
  await assertDeniedNoSideEffect('mc_e2', r.clan_registration_handle, { primary_name: { first_name: '改名', surname_list: [{ surname: '季' }] } }, famMsg);
  const clanAfterAttach = readTree('mc_e2');
  assert.equal(clanAfterAttach.people[r.clan_registration_handle].external_tree, 'mt_e2');
  assert.equal(clanAfterAttach.people[r.clan_registration_handle].external_person_handle, 'f');
  assert.equal(clanAfterAttach.people[r.clan_registration_handle].external_mirror, 'true');

  const det = await fa.detachFounder({ treeId: 'mt_e2', founderHandle: 'f' });
  assert.equal(det.ok, true);
  assert.equal(det.clan_registration_removed, true);
  assert.equal(det.founder_data_kept, true, 'R2：解除登记保留真身数据');
  assert.equal(det.placeholder, false, 'R2：不再回到「空白占位」');
  const clanAfterDetach = readTree('mc_e2');
  assert.equal(clanAfterDetach.people[r.clan_registration_handle], undefined, 'R4：登记镜像已移除');
  assert.equal(fa.clanRegistrationOf(clanAfterDetach, 'mt_e2', 'mc_e2'), null);
  const f = readTree('mt_e2').people.f;
  assert.equal(f.external_tree, '', '指针已清');
  assert.equal(f.external_link_type, '');
  assert.equal(f.external_mirror, '');
  assert.equal(f.gramps_id, 'I0001', '始祖位置不变');
  assert.equal(f.birth_date, '', '真身生卒原样（未变过）');
  assert.equal(f.name, '季某', 'R2：真身姓名保留（未被清成空白占位）');
  assert.equal(await fa.personEditLockMessage(f, readTree('mt_e2'), 'zhonghua', TREES.mt_e2), '', '解除登记后本树始祖可写');
});

// ==================== F. B3 回归：R1 硬守卫（lib 层直调不得写入世本）====================

test('B3（R1 硬守卫）直调 attachFounder 指向世本 → 400，且世本人数与树 md5 不变', async () => {
  writeTree(clanTree('mc_b3', '季花'));
  writeTree(familyTree('mt_b3'));

  const masterBefore = readTree('zhonghua');
  const masterMd5Before = treeMd5('zhonghua');
  const masterCountBefore = Object.keys(masterBefore.people).length;

  // ① 普通家族树 → 世本：被 target 合法性挡下（400）
  await assert.rejects(
    () => fa.attachFounder({ treeId: 'mt_b3', founderHandle: 'f', masterTreeId: 'zhonghua', masterHandle: 'mX', requestedBy: CHIEF }),
    (e) => e.status === 400 && e.message === '普通家族树不得直挂中华世本，请先建立/认祖到本姓祖谱',
  );
  // ② 祖谱 → 世本：target 合法性允许（clan→master），必须由 R1 硬守卫挡下（修前会把登记镜像插进世本）
  await assert.rejects(
    () => fa.attachFounder({ treeId: 'mc_b3', founderHandle: 'own_ji', masterTreeId: 'zhonghua', masterHandle: 'mX', requestedBy: CHIEF }),
    (e) => e.status === 400 && /须走 attachClanToMaster/.test(e.message),
  );

  // ③ R1 核心不变量：世本树一个节点不增、一个字节不变
  const masterAfter = readTree('zhonghua');
  assert.equal(Object.keys(masterAfter.people).length, masterCountBefore, '★ 世本 people 数量不变');
  assert.equal(treeMd5('zhonghua'), masterMd5Before, '★ 世本树 md5 不变');
  assert.equal(masterAfter.people.mRoot === undefined, false);
  // 发起侧也不得留下半截写入（校验先于任何写）
  assert.equal(readTree('mt_b3').people.f.external_tree, '', '被拒的家族树不得留下登记指针');
  assert.equal(readTree('mc_b3').people.own_ji.external_tree, '', '被拒的祖谱不得留下登记指针');
  assert.equal(readTree('mc_b3').version, 1, '版本号不增（未提交任何事务）');
});

// ==================== G. B4 回归：方向判据不互相污染 ====================

test('B4 世本镜像段 / 登记镜像 / 自有段并存：clanMirrorNodes 只含世本镜像，master_* 不被登记镜像污染', async () => {
  writeTree(familyTree('mt_b4'));
  const b4 = readTree('zhonghua');
  const clan = addRegistration(addTopMirror(clanTree('mc_b4')), {
    handle: 'reg_b4', familyTreeId: 'mt_b4', familyTreeTitle: TREES.mt_b4.display_title,
    familyFounder: readTree('mt_b4').people.f, prev: 'own_ji',
  });
  writeTree(clan);

  // ① clanMirrorNodes：顶端世本镜像段（按本祖谱的 master_tree_id 判定）
  assert.deepEqual(clanLib.clanMirrorNodes(clan, 'zhonghua').map((p) => p.handle), [MIRROR_MX], '登记镜像不得算进顶端镜像段');
  // 判据二（兜底句柄口径，upperTreeId 缺省）：登记镜像是随机 hex，不满足 mir_<handle>
  assert.deepEqual(clanLib.clanMirrorNodes(clan).map((p) => p.handle), [MIRROR_MX]);
  assert.equal(clanLib.isClanTopMirrorNode(clan.people.reg_b4, 'mc_b4', ''), false);
  assert.equal(clanLib.isClanTopMirrorNode(clan.people.reg_b4, 'mc_b4', 'zhonghua'), false);
  assert.equal(clanLib.isClanTopMirrorNode(clan.people[MIRROR_MX], 'mc_b4', 'zhonghua'), true);
  // 统计口径：登记镜像不计入本宗人数，也不计入顶端镜像数
  assert.deepEqual(clanLib.clanStats(clan, 'zhonghua'), { own_count: 1, mirror_count: 1, total: 2 });
  assert.deepEqual(clanLib.clanOwnNodes(clan).map((p) => p.handle), ['own_ji']);

  // ② clanInfo：mirrors / master_* / attached_to_master 不被登记镜像污染
  const info = await clanLib.clanInfo({ treeId: 'mc_b4' });
  assert.deepEqual(info.mirrors.map((m) => m.handle), [MIRROR_MX]);
  assert.equal(info.mirror_count, 1);
  assert.equal(info.attached_to_master, true);
  assert.equal(info.master_tree_id, 'zhonghua');
  assert.equal(info.master_handle, 'mX');
  assert.equal(info.master_name, '季始祖公');
  assert.equal(info.founder_handle, 'own_ji');
  assert.equal(info.notice, '');
  assert.equal(info.mirrors.some((m) => m.handle === 'reg_b4'), false, '★ 登记镜像不得出现在 mirrors');
  // 支系入口列表：只收指向**普通家族树**的登记镜像（方向过滤的另一个消费方）
  assert.deepEqual(clanLib.clanBranchRegistrations(clan, 'mc_b4', META_FIX).map((x) => x.tree_id), ['mt_b4']);

  // ③ clearClanTopMirror 只清顶端镜像段，不误删登记镜像 / 自有段
  const copy = readTree('mc_b4');
  const removed = clanLib.clearClanTopMirror(copy, 'zhonghua');
  assert.deepEqual(removed.removed_handles, [MIRROR_MX]);
  assert.equal(copy.people[MIRROR_MX], undefined);
  assert.equal(copy.people.reg_b4 === undefined, false, '★ 登记镜像不得被误删');
  assert.equal(copy.people.reg_b4.external_tree, 'mt_b4');
  assert.equal(copy.people.own_ji === undefined, false, '自有段入口保留');
  // 兜底口径（upperTreeId 缺省）同样不误删登记镜像
  const copy2 = readTree('mc_b4');
  clanLib.clearClanTopMirror(copy2);
  assert.equal(copy2.people.reg_b4 === undefined, false);

  // ④ 只有登记镜像（meta 无 master_tree_id）→ attached_to_master === false，master_* 全空
  const b4b = addRegistration(clanTree('mc_b4b'), {
    handle: 'reg_b4b', familyTreeId: 'mt_b4b', familyTreeTitle: TREES.mt_b4b.display_title,
    familyFounder: { handle: 'f', name: '季某', surname: '季', given: '某', gender: 'M', birth_date: '' },
  });
  writeTree(b4b);
  const infoB = await clanLib.clanInfo({ treeId: 'mc_b4b' });
  assert.equal(infoB.attached_to_master, false, '★ 只有登记镜像时不得误报「已挂世本」');
  assert.equal(infoB.master_tree_id, '');
  assert.equal(infoB.master_handle, '');
  assert.equal(infoB.master_name, '');
  assert.deepEqual(infoB.mirrors, []);
  assert.equal(infoB.mirror_count, 0);
  assert.deepEqual(infoB.own.map((p) => p.handle), ['own_ji'], '登记镜像也不计入本宗人数');
  assert.notEqual(infoB.notice, '', '未挂世本 → 保留提示文案');
  const copyB = readTree('mc_b4b');
  assert.deepEqual(clanLib.clearClanTopMirror(copyB, '').removed_handles, []);
  assert.equal(copyB.people.reg_b4b === undefined, false);
  assert.equal(b4.people.mX.name, '季始祖公', '夹具自检：总谱副本未被改动');
});

// ==================== H. R6 世数下钻 ====================

test('R6 世数下钻：沿 external_* 链取链底真身的 attributes.external_chain_gen；链断 / 环 → null 且不抛', async () => {
  // 夹具：世本 mX（世数 12）+ 宗谱 mc_r6（顶端镜像 mir_mX → 世本；登记镜像 reg_r6 → mt_r6 真身）
  //       + 家族树 mt_r6（真身 f 世数 21）；家族树内再造一条「镜像的镜像」链：家族树 → 宗谱 → 世本
  const clan = addRegistration(addTopMirror(clanTree('mc_r6')), {
    handle: 'reg_r6', familyTreeId: 'mt_r6', familyTreeTitle: TREES.mt_r6.display_title,
    familyFounder: { handle: 'f', name: '季某', surname: '季', given: '某', gender: 'M', birth_date: '' }, prev: 'own_ji',
  });
  writeTree(clan);
  const fam = familyTree('mt_r6');
  fam.people.mir_mir = node('mir_mir', 'I0003', '季某', '季', '某', {
    external_tree: 'mc_r6', external_person_handle: MIRROR_MX, external_link_type: 'founder', external_mirror: 'true',
  });
  fam.people.broken = node('broken', 'I0004', '断链', '季', '断链', {
    external_tree: 'mc_r6', external_person_handle: 'ghost', external_link_type: 'founder', external_mirror: 'true',
  });
  fam.people.noptr = node('noptr', 'I0005', '无指针', '季', '无指针', { external_link_type: 'founder', external_mirror: 'true' });
  fam.people.loop_a = node('loop_a', 'I0006', '环A', '季', '环A', {
    external_tree: 'mc_r6', external_person_handle: 'loop_b', external_link_type: 'founder', external_mirror: 'true',
  });
  writeTree(fam);
  const clan2 = readTree('mc_r6');
  clan2.people.loop_b = node('loop_b', 'I0007', '环B', '季', '环B', {
    external_tree: 'mt_r6', external_person_handle: 'loop_a', external_link_type: 'founder', external_mirror: 'true',
  });
  writeTree(clan2);
  writeDetail({ _id: 'mt_r6:f', tree_id: 'mt_r6', handle: 'f', name: '季某', events: [], attributes: [{ key: 'external_chain_gen', value: '21', type: 'external_chain_gen' }] });

  // ① 链底真身（家族树始祖）自带世数 → 原地命中
  const g0 = await fa.resolveChainGen({ treeId: 'mt_r6', handle: 'f' });
  assert.deepEqual(g0, { gen: 21, source: 'attribute', tree_id: 'mt_r6', handle: 'f', hops: 0 });

  // ② 宗谱登记镜像（向下 → 家族树真身）→ 下钻 1 跳，取真身属性
  const g1 = await fa.resolveChainGen({ treeId: 'mc_r6', handle: 'reg_r6' });
  assert.equal(g1.gen, 21, '★ 从链底真身（家族树）的 detail.attributes.external_chain_gen 取值');
  assert.equal(g1.tree_id, 'mt_r6');
  assert.equal(g1.handle, 'f');
  assert.equal(g1.source, 'attribute');
  assert.equal(g1.hops, 1);

  // ③ 宗谱顶端世本镜像（向上 → 世本真身）→ 下钻 1 跳
  const g2 = await fa.resolveChainGen({ treeId: 'mc_r6', handle: MIRROR_MX });
  assert.equal(g2.gen, 12);
  assert.equal(g2.tree_id, 'zhonghua');
  assert.equal(g2.handle, 'mX');
  assert.equal(g2.hops, 1);

  // ④ 多层下钻（家族树 → 宗谱 → 世本，hops=2），链底真身的属性为准
  const g3 = await fa.resolveChainGen({ treeId: 'mt_r6', handle: 'mir_mir' });
  assert.equal(g3.gen, 12);
  assert.equal(g3.tree_id, 'zhonghua');
  assert.equal(g3.handle, 'mX');
  assert.equal(g3.hops, 2);

  // ⑤ 链断：目标节点不存在 / 无 external_person_handle / 起点非镜像 → gen null 且不抛
  const g4 = await fa.resolveChainGen({ treeId: 'mt_r6', handle: 'broken' });
  assert.equal(g4.gen, null);
  assert.equal(g4.source, 'none');
  assert.deepEqual(g4.tree_id, 'mt_r6');
  assert.equal((await fa.resolveChainGen({ treeId: 'mt_r6', handle: 'noptr' })).gen, null);
  assert.equal((await fa.resolveChainGen({ treeId: 'mc_r6', handle: 'own_ji' })).gen, null, '自有段节点不下钻');
  assert.equal((await fa.resolveChainGen({ treeId: 'mt_r6', handle: 'ghost' })).gen, null, '不存在的起点');

  // ⑥ 环 → gen null 且不抛（visited 命中即返回 none）
  const g5 = await fa.resolveChainGen({ treeId: 'mt_r6', handle: 'loop_a' });
  assert.equal(g5.gen, null);
  assert.equal(g5.hops, 0);

  // ⑦ 属性值为非数字 → null（绝不猜一个世数）；读侧备注口径随下钻结果
  assert.equal(fa.chainGenOf({ attributes: [{ key: 'external_chain_gen', value: 'abc' }] }), null);
  assert.equal(fa.chainGenOf({ attributes: [{ key: 'external_chain_gen', value: '' }] }), null);
  assert.equal(fa.chainGenOf({ attributes: [{ key: 'external_chain_gen', value: '12' }] }), 12);
  assert.equal(fa.chainGenOf({ attributes: [] }), null);
  assert.equal(fa.founderRelationNote('季始祖公', g1.gen), '季始祖公（中华世本 · 第 21 世）');
  assert.equal(fa.founderRelationNote('季始祖公', g4.gen), '季始祖公（中华世本）', '链断 → 备注省略世数');
});

// ==================== J. isClanRegistration 两个消费方的方向口径 ====================

test('J 方向无关的 isClanRegistration：clanRegistrations 收向下登记镜像；registerClanFounderIfVacant 只认 family', async () => {
  const j2 = addRegistration(addTopMirror(clanTree('mc_j2')), {
    handle: 'reg_j2', familyTreeId: 'mt_j1', familyTreeTitle: TREES.mt_j1.display_title,
    familyFounder: { handle: 'f', name: '季某', surname: '季', given: '某', gender: 'M', birth_date: '' },
  });
  writeTree(j2);
  writeTree(familyTree('mt_j1'));
  writeTree(addTopMirror(clanTree('mc_j3')));

  // ① 判据方向无关：向下的登记镜像与向上的世本镜像**都**是只读镜像
  assert.equal(fa.isClanRegistration(j2.people.reg_j2, 'mc_j2'), true, '向下（指向家族树）也判只读');
  assert.equal(fa.isClanRegistration(j2.people[MIRROR_MX], 'mc_j2'), true, '向上（指向世本）判只读');
  assert.equal(fa.isClanRegistration(j2.people.own_ji, 'mc_j2'), false, '自有段真身不判只读');
  assert.equal(fa.isClanRegistration(j2.people.reg_j2, 'mt_j1'), false, '真身所在树内该指针不是镜像');
  assert.equal(fa.isClanRegistration({ ...j2.people.reg_j2, external_mirror: '' }, 'mc_j2'), false, '无镜像标记的真身登记指针不锁');
  assert.equal(fa.isClanRegistration(null, 'mc_j2'), false);

  // ② 消费方一：clanRegistrations = 自有段全部外指镜像（含两方向），只排除指向自身
  assert.deepEqual(fa.clanRegistrations(j2, 'mc_j2').map((p) => p.handle).sort(), ['reg_j2', 'mir_mX'].sort());
  assert.equal(fa.clanRegistrations(j2, 'mc_j2').filter((p) => p.external_tree === 'mc_j2').length, 0, '自指针不算外指镜像');
  // 精确取某一棵家族树的登记镜像
  assert.equal(fa.clanRegistrationOf(j2, 'mt_j1', 'mc_j2').handle, 'reg_j2');
  assert.equal(fa.clanRegistrationOf(j2, 'mt_other', 'mc_j2'), null);

  // ③ 消费方二：只有世本镜像段（meta.founder_handle 空）→ 不得被选成宗谱始祖登记
  assert.equal(await fa.registerClanFounderIfVacant('mc_j3'), false, '★ 世本镜像段不得当登记镜像');
  assert.equal(TREES.mc_j3.founder_handle, '', '夹具自检：mc_j3 无始祖登记');

  // ④ 有登记镜像 → 写入宗谱始祖登记（取 gramps_id 最小的一条）
  assert.equal(await fa.registerClanFounderIfVacant('mc_j2'), true);
  const metaAfter = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  assert.equal(metaAfter.trees.mc_j2.founder_handle, 'reg_j2');
  assert.equal(metaAfter.trees.mc_j2.founder_gramps_id, 'I0900');
  assert.equal(metaAfter.trees.mc_j2.founder_name, '季某');
  // 已有登记（前任）时保留，不再改写
  assert.equal(await fa.registerClanFounderIfVacant('mc_j2'), false, '已有宗谱始祖登记 → 保留');
});

// ==================== K. 收尾：真源零写入 ====================

test('真源零写入：migrate-output/trees/*.json 与 config/tree-meta.json 的 md5 全部未变', () => {
  const files = fs.readdirSync(REAL_TREES);
  assert.equal(files.length, realTreeBaseline.size, '真源树文件数量不变（无新增 / 删除）');
  for (const f of files) {
    assert.equal(md5(path.join(REAL_TREES, f)), realTreeBaseline.get(f), `真源树被改动：${f}`);
  }
  assert.equal(md5(REAL_META), realMetaBaseline, '真源 tree-meta.json 被改动');
  // 沙箱自检：本文件所有写入都在 /tmp 副本内
  assert.equal(store.PATHS.out, TMP);
  assert.equal(store.PATHS.metaFile, META_FILE);
  assert.equal(String(store.PATHS.out).startsWith(os.tmpdir()), true);
});
