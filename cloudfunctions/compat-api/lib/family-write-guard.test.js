/**
 * 家族树写路径守卫单测 — 口径（用户 2026-09-19 拍板）：
 *   ① 只对 `kind === 'family'` 的家族树生效（世本 / 祖谱不套用 —— 世本有「母系起始节点」，套上会断链）
 *   ② 新增子节点挂在**父**下：父不是本族成员（按 lib/family-population.js 的本族集）且非本树镜像 → 400
 *   ③ 新增子节点挂在**母**下（父槽为空）：母是本族且已婚配 → 400，除非显式 `maternal_succession: true`
 *   ④ `maternal_succession` 落库 = 详情文档属性（key `maternal_succession` / value `'true'`），新建即写
 *
 * 本文件**不写** `migrate-output/`；COMPAT_OUT_DIR / COMPAT_META_FILE 全部指向 /tmp 副本，
 * 收尾用 md5 断言真实树文件逐字节未变（`lib/store.js` 的 assertWriteAllowed 同样兜底）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/family-write-guard.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { assertChildWriteAllowed, hasSpouseInTree, MATERNAL_SUCCESSION_KEY } from './family-write-guard.js';
import { analyzeFamilyGraph } from './family-population.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_TREES = path.join(REPO, 'migrate-output', 'trees');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-family-guard-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

// 真实树文件基线（测试结束必须逐字节一致）
const realBaseline = new Map(
  fs.readdirSync(REAL_TREES).map((f) => [
    f,
    crypto.createHash('md5').update(fs.readFileSync(path.join(REAL_TREES, f))).digest('hex'),
  ]),
);

const TREES_DIR = path.join(TMP, 'trees');
const DETAILS_DIR = path.join(TMP, 'details');
const COLS_DIR = path.join(TMP, 'collections');
for (const d of [TREES_DIR, DETAILS_DIR, COLS_DIR]) fs.mkdirSync(d, { recursive: true });

// ================= 夹具（全部落 /tmp 副本） =================
const FAM = 'guard_fam';
const CLAN = 'guard_clan';
const MASTER = 'guard_master';

let gid = 9000;
function P(handle, name, gender, extra = {}) {
  return {
    handle,
    gramps_id: `I${gid++}`,
    name,
    surname: name.slice(0, 1),
    given: name.slice(1),
    gender,
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: '',
    spouse_families: [],
    ...extra,
  };
}

/**
 * 世代图：
 *   g1 纪元（始祖·本族根）
 *     └ f1 元甫（本族）── 妻 w1 陈氏（婚入妇·非本族）
 *          ├ d1 元珍（本族女·婚出，夫 il1 外孟 = 外来姻亲根）
 *          │    └ il2 外叔（非本族：挂在非本族父下，无配偶家族）
 *          ├ d2 元瑶（本族女·未婚配）
 *          ├ s1 元朗（本族男）
 *          └ d4 元琅（本族女·已婚配；第一个家庭 f_d4a 父槽为空，配偶在另一个家庭 f_d4b）
 *               └（配偶 il4 外季 · 外来姻亲根）
 */
function guardTree(treeId) {
  return {
    _schema: '1.0',
    tree_id: treeId,
    version: 3,
    people: {
      g1: P('g1', '纪元', 'M', { spouse_families: ['f_g'] }),
      f1: P('f1', '元甫', 'M', { parent_family: 'f_g', spouse_families: ['f_f1'] }),
      w1: P('w1', '陈氏', 'F', { spouse_families: ['f_f1'] }),
      d1: P('d1', '元珍', 'F', { parent_family: 'f_f1', spouse_families: ['f_d1'] }),
      d2: P('d2', '元瑶', 'F', { parent_family: 'f_f1' }),
      s1: P('s1', '元朗', 'M', { parent_family: 'f_f1' }),
      d4: P('d4', '元琅', 'F', { parent_family: 'f_f1', spouse_families: ['f_d4a', 'f_d4b'] }),
      il1: P('il1', '外孟', 'M', { spouse_families: ['f_d1'] }),
      il2: P('il2', '外叔', 'M', { parent_family: 'f_d1' }),
      il4: P('il4', '外季', 'M', { spouse_families: ['f_d4b'] }),
    },
    families: {
      f_g: { handle: 'f_g', gramps_id: 'F09001', father_handle: 'g1', mother_handle: '', child_handles: ['f1'] },
      f_f1: {
        handle: 'f_f1',
        gramps_id: 'F09002',
        father_handle: 'f1',
        mother_handle: 'w1',
        child_handles: ['d1', 'd2', 's1', 'd4'],
      },
      f_d1: { handle: 'f_d1', gramps_id: 'F09003', father_handle: 'il1', mother_handle: 'd1', child_handles: ['il2'] },
      f_d4a: { handle: 'f_d4a', gramps_id: 'F09004', father_handle: '', mother_handle: 'd4', child_handles: [] },
      f_d4b: { handle: 'f_d4b', gramps_id: 'F09005', father_handle: 'il4', mother_handle: 'd4', child_handles: [] },
    },
  };
}

/** 世本夹具：含「母系起始节点」华胥（无父、以母为家长）→ 守卫必须不套用（否则断链） */
function masterTree(treeId) {
  const tree = guardTree(treeId);
  tree.tree_id = treeId;
  tree.people.huaxu = P('huaxu', '华胥', 'F', { spouse_families: ['f_hx'] });
  tree.people.fuxi = P('fuxi', '风伏羲', 'M', { parent_family: 'f_hx' });
  tree.families.f_hx = { handle: 'f_hx', gramps_id: 'F09006', father_handle: '', mother_handle: 'huaxu', child_handles: ['fuxi'] };
  return tree;
}

fs.writeFileSync(
  process.env.COMPAT_META_FILE,
  JSON.stringify(
    {
      _schema: '1.1',
      trees: {
        [FAM]: { tree_id: FAM, kind: 'family', path_alias: '/g/fam', display_title: '守卫测试家族', founder_handle: 'g1' },
        [CLAN]: {
          tree_id: CLAN,
          kind: 'clan',
          path_alias: '/g/clan',
          display_title: '守卫测试祖谱',
          master_tree_id: MASTER,
          master_handle: 'f1',
        },
        [MASTER]: {
          tree_id: MASTER,
          kind: 'master',
          is_master: true,
          path_alias: '/zhonghua',
          display_title: '守卫测试世本',
        },
      },
    },
    null,
    2,
  ) + '\n',
);

const writeTree = (t) => fs.writeFileSync(path.join(TREES_DIR, `${t.tree_id}.json`), JSON.stringify(t, null, 2));
writeTree(guardTree(FAM));
writeTree(guardTree(CLAN));
writeTree(masterTree(MASTER));

const treePath = (id) => path.join(TREES_DIR, `${id}.json`);
const readTree = (id) => JSON.parse(fs.readFileSync(treePath(id), 'utf8'));
const treeMd5 = (id) => crypto.createHash('md5').update(fs.readFileSync(treePath(id))).digest('hex');
const readDetail = (treeId, handle) => {
  const p = path.join(DETAILS_DIR, `${treeId}:${handle}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
};

const { addChildNode } = await import('./child-write.js');

// ================= ① 夹具口径自检：本族 / 婚入妇 / 外来姻亲根 =================

test('夹具口径自检：本族集不含婚入妇与外来姻亲（判据全部来自 lib/family-population.js）', () => {
  const tree = guardTree(FAM);
  const g = analyzeFamilyGraph(tree);
  assert.deepEqual([...g.clan].sort(), ['d1', 'd2', 'd4', 'f1', 'g1', 's1'], '本族 = 始祖血系');
  assert.deepEqual([...g.inLawRoots].sort(), ['il1', 'il4', 'w1'], '外来姻亲根 = 外来配偶槽');
  assert.ok(g.marriedIn.has('w1'), '婚入妇 w1 计入人数但不在本族集');
  assert.equal(hasSpouseInTree(tree, 'd4'), true, 'd4 已婚配（f_d4b 有真人配偶）');
  assert.equal(hasSpouseInTree(tree, 'd2'), false, 'd2 未婚配');
  assert.equal(hasSpouseInTree(tree, 'f1'), true, 'f1 与婚入妇同家族 = 已婚配');
});

// ================= ② 规则 1：只对 kind==='family' 生效 =================

test('规则 1：祖谱 / 世本（含母系起始节点）不套用守卫 —— 父非本族、已婚配女性添子女一律不拦', () => {
  for (const kind of ['clan', 'master']) {
    const tree = guardTree(`${kind}_x`);
    assert.doesNotThrow(
      () => assertChildWriteAllowed({ tree, kind, personHandle: 'il1' }),
      `${kind}: 父非本族也不拦（世本/祖谱有自己的口径）`,
    );
    assert.doesNotThrow(
      () => assertChildWriteAllowed({ tree, kind, personHandle: 'd4' }),
      `${kind}: 已婚配本族女性不拦（不引入新限制）`,
    );
    const mt = masterTree(`${kind}_m`);
    assert.doesNotThrow(
      () => assertChildWriteAllowed({ tree: mt, kind, personHandle: 'huaxu' }),
      `${kind}: 母系起始节点（华胥）不得被拦 —— 否则世本断链`,
    );
  }
  // 家族树（control）：同样输入必须拦 → 证明上面的「不拦」来自 kind 分层，不是判据失效
  const fam = guardTree('family_ctl');
  assert.throws(() => assertChildWriteAllowed({ tree: fam, kind: 'family', personHandle: 'il1' }), /不是本族成员/);
  assert.throws(() => assertChildWriteAllowed({ tree: fam, kind: 'family', personHandle: 'd4' }), /承母嗣/);
});

// ================= ③ 规则 2：父非本族拒 =================

test('规则 2：父槽坐外姓姻亲（含挂在非本族父下的男性）→ 拒；父为本族 / 父为婚入妇的丈夫 / 本人是婚入妇 → 放行', () => {
  const tree = guardTree(FAM);
  const call = (h, maternalSuccession = false) =>
    assertChildWriteAllowed({ tree, kind: 'family', personHandle: h, maternalSuccession });

  // 外来姻亲根 il1（女婿）为父 → 拒
  assert.throws(() => call('il1'), /「外孟」不是本族成员（外姓姻亲）：本树只允许本族成员的子女入谱/);
  // il2：非本族（挂在非本族父下）、无配偶家族 → 以本人为父同判
  assert.throws(() => call('il2'), /「外叔」不是本族成员/);
  // 本族男性、未婚配本族女性 → 放行
  assert.doesNotThrow(() => call('s1'), '本族男性为父 → 放行');
  assert.doesNotThrow(() => call('d2'), '未婚配本族女性为母 → 放行');
  // 婚入妇 w1：父槽是本族 f1 → 放行（子女随本族父亲入谱）
  assert.doesNotThrow(() => call('w1'), '婚入妇名下添子女（父为本族）→ 放行');
  // 本族女性 d1 婚出（家庭父槽 = 外姓 il1）→ 仍按「父非本族」拒
  assert.throws(() => call('d1'), /「外孟」不是本族成员/);
  // 镜像父不在此规则内（既有「跳真身树」逻辑负责）→ 纯函数层面对镜像父放行
  const mirrorTree = guardTree('mirror_ctl');
  mirrorTree.people.il1.external_mirror = 'true';
  assert.doesNotThrow(
    () => assertChildWriteAllowed({ tree: mirrorTree, kind: 'family', personHandle: 'il1' }),
    '镜像父由既有跨树逻辑接管，守卫不抢',
  );
});

// ================= ④ 规则 3：本族已婚女性的子女需「承母嗣」 =================

test('规则 3：本族已婚配女性名下添子女（父槽为空）→ 无标记拒 / 有标记放行', () => {
  const tree = guardTree(FAM);
  assert.throws(
    () => assertChildWriteAllowed({ tree, kind: 'family', personHandle: 'd4' }),
    /「元琅」已婚配：本族女性婚配后的后代默认不进本树；如确属「承母嗣」特例，请勾选「承母嗣」后重试/,
  );
  assert.doesNotThrow(() => assertChildWriteAllowed({ tree, kind: 'family', personHandle: 'd4', maternalSuccession: true }));
  // 单亲母亲（自己第一个家庭父槽为空、树内无配偶）→ 不受本规则影响，可连续添子女
  const single = guardTree('single_ctl');
  single.people.d2.spouse_families = ['f_d2'];
  single.families.f_d2 = { handle: 'f_d2', gramps_id: 'F09007', father_handle: '', mother_handle: 'd2', child_handles: ['kd2'] };
  single.people.kd2 = P('kd2', '元儿', 'M', { parent_family: 'f_d2' });
  assert.equal(hasSpouseInTree(single, 'd2'), false, '父不详家族不算婚配');
  assert.doesNotThrow(() => assertChildWriteAllowed({ tree: single, kind: 'family', personHandle: 'd2' }), '单亲母亲不受限');
});

// ================= ⑤ 写路径：三条规则 + 属性落库 =================

test('写路径：父非本族 → 拒绝且家族树逐字节未变（不写任何一条记录）', async () => {
  const before = treeMd5(FAM);
  await assert.rejects(
    () => addChildNode({ treeId: FAM, personHandle: 'il1', name: '孟儿', gender: 'M' }),
    /不是本族成员（外姓姻亲）/,
  );
  assert.equal(treeMd5(FAM), before, '拒绝后目标树逐字节未变');
  assert.equal(readTree(FAM).families.f_d1.child_handles.length, 1, '家族子女列表未变');
});

test('写路径：本族已婚配女性 → 无「承母嗣」拒绝；带「承母嗣」写入 + 详情文档属性 maternal_succession=true', async () => {
  const before = treeMd5(FAM);
  await assert.rejects(
    () => addChildNode({ treeId: FAM, personHandle: 'd4', name: '琅儿', gender: 'M' }),
    /请勾选「承母嗣」后重试/,
  );
  assert.equal(treeMd5(FAM), before, '拒绝后目标树逐字节未变');

  const r = await addChildNode({
    treeId: FAM,
    personHandle: 'd4',
    name: '琅儿',
    gender: 'M',
    maternalSuccession: true,
  });
  assert.equal(r.cross_tree, false);
  const after = readTree(FAM);
  assert.ok(after.families[r.family_handle].child_handles.includes(r.child_handle), '子女挂在女士名下家族');
  assert.equal(after.families[r.family_handle].handle, 'f_d4a', '用本人第一个配偶家族（父槽为空）');
  const detail = readDetail(FAM, r.child_handle);
  assert.ok(detail, '新建节点必须有详情文档');
  assert.deepEqual(
    detail.attributes.filter((a) => a.key === MATERNAL_SUCCESSION_KEY),
    [{ key: 'maternal_succession', value: 'true', type: 'maternal_succession' }],
    '承母嗣标记 = 详情文档属性（与称号属性同一通道）',
  );
});

test('写路径：不勾选时不得出现 maternal_succession 属性（不误写标记）', async () => {
  const r = await addChildNode({ treeId: FAM, personHandle: 's1', name: '朗儿', gender: 'M' });
  const detail = readDetail(FAM, r.child_handle);
  assert.deepEqual(detail.attributes, [], '普通新建节点不带承母嗣标记');
});

test('写路径：祖谱 / 世本不套用守卫（含母系起始节点添子女），且不写 is_living 之外的口径字段', async () => {
  // 祖谱：父为非本族男性也放行（规则 1）
  const rc = await addChildNode({ treeId: CLAN, personHandle: 'il1', name: '孟儿', gender: 'M', masterTreeId: MASTER });
  assert.equal(rc.cross_tree, false);
  assert.equal(readTree(CLAN).people[rc.child_handle].is_living, false, '祖谱新节点锁死已故（口径不变）');
  assert.equal(readDetail(CLAN, rc.child_handle).attributes.length, 0, '未勾选 → 无承母嗣标记');

  // 世本：母系起始节点（华胥）添子女不得被拦
  const rm = await addChildNode({ treeId: MASTER, personHandle: 'huaxu', name: '附宝', gender: 'F', masterTreeId: MASTER });
  assert.equal(rm.cross_tree, false);
  assert.ok(readTree(MASTER).families[rm.family_handle].child_handles.includes(rm.child_handle), '母系起始节点子女入谱');
});

// ================= ⑥ 路由层：POST /admin/add-child =================

test('路由 POST /admin/add-child：maternal_succession 贯通请求体 → 200 + 详情属性；缺标记 → 400 业务文案', async () => {
  const { handleRequest } = await import('../index.js');
  const { signJwt } = await import('./auth.js');
  const phone = '16600000971';
  fs.mkdirSync(COLS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(COLS_DIR, 'jiazu_users.json'),
    JSON.stringify({ [phone]: { _id: phone, phone, nickname: '守卫测试', role: 'tree_steward' } }),
  );
  const token = signJwt({ sub: phone, phone, role: 'tree_steward' }, 3600);
  const post = (body) =>
    handleRequest({
      path: '/admin/add-child',
      httpMethod: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  // 无标记 → 400（业务裸异常），文案如实回传（前端 toast / panelError 直接展示）
  const before = treeMd5(FAM);
  const denied = await post({ tree_id: FAM, person_handle: 'd4', name: '琅儿', gender: 'M' });
  assert.equal(denied.statusCode, 400);
  assert.match(JSON.parse(denied.body).error, /承母嗣/, '400 文案含承母嗣指引');
  assert.equal(treeMd5(FAM), before, '400 时目标树逐字节未变');

  // 有标记 → 200 + 详情文档属性
  const ok = await post({ tree_id: FAM, person_handle: 'd4', name: '琅儿', gender: 'M', maternal_succession: true });
  assert.equal(ok.statusCode, 200, ok.body);
  const body = JSON.parse(ok.body);
  const detail = readDetail(FAM, body.child_handle);
  assert.equal(
    detail.attributes.find((a) => a.key === MATERNAL_SUCCESSION_KEY)?.value,
    'true',
    '路由层 maternal_succession=true → 详情属性 maternal_succession=true',
  );
});

// ================= ⑦ 真源护栏 =================

test('测试全程未写 migrate-output 真实数据（md5 一致）', () => {
  const now = fs.readdirSync(REAL_TREES);
  assert.deepEqual(now.sort(), [...realBaseline.keys()].sort(), '真实树目录文件数/文件名未变');
  for (const f of now) {
    const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(REAL_TREES, f))).digest('hex');
    assert.equal(md5, realBaseline.get(f), `${f} 被改动了`);
  }
});
