/**
 * 添加子女（跨树婚姻家庭子女归属）单元测试 — docs/marriage.spec.md §7-4
 *
 * 纯函数部分：镜像父母判定（mirrorParentOf）。
 * 写路径部分：COMPAT_OUT_DIR 指向 /tmp 副本目录造树（绝不写 migrate-output 真源），
 * 收尾用 md5 校验真实树文件未被改动。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/child-write.test.js
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-child-write-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;

const { addChildNode, mirrorParentOf, MIRROR_CHILD_LINK_TYPE } = await import('./child-write.js');

// 真实树文件基线（测试结束必须一模一样）
const realBaseline = new Map(
  fs.readdirSync(REAL_TREES).map((f) => [
    f,
    crypto.createHash('md5').update(fs.readFileSync(path.join(REAL_TREES, f))).digest('hex'),
  ]),
);

function writeTree(tree) {
  const p = path.join(TMP, 'trees', `${tree.tree_id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tree, null, 2));
}
function readTree(treeId) {
  return JSON.parse(fs.readFileSync(path.join(TMP, 'trees', `${treeId}.json`), 'utf8'));
}
function readDetail(treeId, handle) {
  const p = path.join(TMP, 'details', `${treeId}:${handle}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/**
 * 造一对跨树婚姻的真身 + 镜像（形状照 shen_27784_01 / ji_23395_01 实测数据）：
 *   loc 树（沈家）：family_loc = 父 季志全(镜像) / 母 沈伟(真人)
 *   far 树（季家）：family_far = 父 季志全(真人) / 母 沈伟(镜像)
 */
function crossTreePair(tag) {
  const loc = `loc_${tag}`;
  const far = `far_${tag}`;
  const mid = `mid_${tag}`;
  const h = { locSelf: 'p_shen', locMirror: 'p_ji_mirror', farSelf: 'p_ji', farMirror: 'p_shen_mirror' };
  const mirrorOf = (handle, otherTree, otherHandle) => ({
    handle,
    gramps_id: 'I500005',
    name: handle === h.locMirror ? '季志全' : '沈伟',
    surname: handle === h.locMirror ? '季' : '沈',
    given: handle === h.locMirror ? '志全' : '伟',
    gender: handle === h.locMirror ? 'M' : 'F',
    birth_date: '',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: '',
    spouse_families: [],
    external_tree: otherTree,
    external_person_handle: otherHandle,
    external_link_type: 'marriage',
    external_marriage_id: mid,
    external_marriage_no: '1',
    external_mirror: 'true',
  });
  const locTree = {
    tree_id: loc,
    version: 4,
    people: {
      [h.locSelf]: {
        handle: h.locSelf,
        gramps_id: 'I0002',
        name: '沈伟',
        surname: '沈',
        given: '伟',
        gender: 'F',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: ['family_loc'],
        external_tree: far,
        external_person_handle: h.farSelf,
        external_link_type: 'marriage',
        external_marriage_id: mid,
      },
      [h.locMirror]: { ...mirrorOf(h.locMirror, far, h.farSelf), spouse_families: ['family_loc'] },
    },
    families: {
      family_loc: {
        handle: 'family_loc',
        gramps_id: 'F0001',
        father_handle: h.locMirror,
        mother_handle: h.locSelf,
        child_handles: [],
      },
    },
  };
  const farTree = {
    tree_id: far,
    version: 7,
    people: {
      [h.farSelf]: {
        handle: h.farSelf,
        gramps_id: 'I0001',
        name: '季志全',
        surname: '季',
        given: '志全',
        gender: 'M',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: ['family_far'],
        external_tree: loc,
        external_person_handle: h.locSelf,
        external_link_type: 'marriage',
        external_marriage_id: mid,
      },
      [h.farMirror]: { ...mirrorOf(h.farMirror, loc, h.locSelf), spouse_families: ['family_far'] },
    },
    families: {
      family_far: {
        handle: 'family_far',
        gramps_id: 'F500020',
        father_handle: h.farSelf,
        mother_handle: h.farMirror,
        child_handles: [],
      },
    },
  };
  writeTree(locTree);
  writeTree(farTree);
  return { loc, far, mid, h };
}

/** 普通树（无跨树镜像）：夫 沈克强 / 妻 李氏 */
function plainTree(tag, { withFamily = true } = {}) {
  const id = `plain_${tag}`;
  const tree = {
    tree_id: id,
    version: 2,
    people: {
      dad: {
        handle: 'dad',
        gramps_id: 'I0007',
        name: '沈克强',
        surname: '沈',
        given: '克强',
        gender: 'M',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: withFamily ? ['fam_plain'] : [],
      },
      mom: {
        handle: 'mom',
        gramps_id: 'I0008',
        name: '李氏',
        surname: '李',
        given: '氏',
        gender: 'F',
        birth_date: '',
        death_date: '',
        birth_place: '',
        death_place: '',
        parent_family: '',
        spouse_families: withFamily ? ['fam_plain'] : [],
      },
    },
    families: withFamily
      ? {
          fam_plain: {
            handle: 'fam_plain',
            gramps_id: 'F0003',
            father_handle: 'dad',
            mother_handle: 'mom',
            child_handles: [],
          },
        }
      : {},
  };
  writeTree(tree);
  return id;
}

// ---- 纯函数：镜像父母判定 ----

test('镜像父母判定：父为真人（或父空缺而母为真人）→ 留本树，不路由', () => {
  const people = {
    dad: { handle: 'dad', gender: 'M' },
    mom: { handle: 'mom', gender: 'F' },
    momMirror: { handle: 'momMirror', gender: 'F', external_mirror: 'true', external_tree: 'far' },
  };
  assert.equal(mirrorParentOf({ father_handle: 'dad', mother_handle: 'mom' }, people), null);
  assert.equal(mirrorParentOf({ father_handle: 'dad', mother_handle: 'momMirror' }, people), null);
  assert.equal(mirrorParentOf({ father_handle: '', mother_handle: 'mom' }, people), null);
  assert.equal(mirrorParentOf(null, people), null);
});

test('镜像父母判定：父为镜像 → 回父镜像（招赘同理）；双镜像/无父母 → 拒绝或留本树', () => {
  const people = {
    dadMirror: { handle: 'dadMirror', gender: 'M', external_mirror: 'true', external_tree: 'far' },
    mom: { handle: 'mom', gender: 'F' },
    momMirror: { handle: 'momMirror', gender: 'F', external_mirror: 'true', external_tree: 'far' },
  };
  // 父镜像 + 母真人（shen 实测形状：父 季志全(镜像) / 母 沈伟(真人)）→ 走父真身树
  assert.equal(
    mirrorParentOf({ father_handle: 'dadMirror', mother_handle: 'mom' }, people)?.handle,
    'dadMirror',
  );
  // 父空缺 + 母镜像 → 走母真身树
  assert.equal(
    mirrorParentOf({ father_handle: '', mother_handle: 'momMirror' }, people)?.handle,
    'momMirror',
  );
  // 双镜像 → 数据异常，拒绝
  assert.throws(
    () => mirrorParentOf({ father_handle: 'dadMirror', mother_handle: 'momMirror' }, people),
    /均为外树镜像节点/,
  );
  assert.equal(mirrorParentOf({ father_handle: '', mother_handle: '' }, people), null);
});

// ---- 写路径：跨树婚姻家庭的子女归属 ----

test('跨树家庭加子女：子女建到父真身树、本树只留镜像子女，两侧同事务落盘', async () => {
  const { loc, far, h } = crossTreePair('new');
  const r = await addChildNode({
    treeId: loc,
    personHandle: h.locSelf, // 在真身母亲「沈伟」名下加子女
    name: '清昆',
    gender: 'M',
  });

  assert.equal(r.cross_tree, true);
  assert.equal(r.landed_tree_id, far);
  assert.match(r.message, /真身所在家族树/);

  const farAfter = readTree(far);
  const locAfter = readTree(loc);
  const child = farAfter.people[r.child_handle];
  assert.ok(child, '真身子女必须落在父真身树');
  assert.equal(child.name, '季清昆'); // 随父姓（取真身家庭之父的姓）
  assert.equal(child.surname, '季');
  assert.equal(child.gender, 'M');
  assert.equal(child.parent_family, 'family_far');
  assert.equal(child.external_mirror, undefined);
  assert.ok(farAfter.families.family_far.child_handles.includes(r.child_handle), '真身家庭的子女列表应含新子女');

  const mirror = locAfter.people[r.mirror_handle];
  assert.ok(mirror, '本树必须留镜像子女');
  assert.equal(mirror.name, '季清昆');
  assert.equal(mirror.external_mirror, 'true');
  assert.equal(mirror.external_link_type, MIRROR_CHILD_LINK_TYPE);
  assert.equal(mirror.external_tree, far);
  assert.equal(mirror.external_person_handle, r.child_handle);
  assert.equal(mirror.parent_family, 'family_loc');
  assert.deepEqual(locAfter.families.family_loc.child_handles, [r.mirror_handle]);
  // 本树家族的父母槽位不动（镜像父仍在父位）
  assert.equal(locAfter.families.family_loc.father_handle, h.locMirror);

  // 详情文档：写在真身树名下，本树不留详情
  assert.equal(readDetail(far, r.child_handle)?.tree_id, far);
  assert.equal(readDetail(far, r.child_handle)?.name, '季清昆');
  assert.equal(readDetail(loc, r.mirror_handle), null);

  // 两侧版本各 +1（一次事务写两棵树）
  assert.equal(locAfter.version, 5);
  assert.equal(farAfter.version, 8);
});

test('父为真人、母为镜像（娶入侧）：子女仍留本树，不产生镜像', async () => {
  const { loc, far, h } = crossTreePair('local');
  const r = await addChildNode({ treeId: far, personHandle: h.farSelf, name: '清晓', gender: 'F' });

  assert.equal(r.cross_tree, false);
  assert.equal(r.mirror_handle, '');
  assert.equal(r.landed_tree_id, far);
  const farAfter = readTree(far);
  assert.equal(farAfter.people[r.child_handle].name, '季清晓');
  assert.deepEqual(farAfter.families.family_far.child_handles, [r.child_handle]);
  assert.equal(readTree(loc).families.family_loc.child_handles.length, 0, '本树（母镜像侧）不该被改动');
  assert.equal(readTree(loc).version, 4);
});

test('跨树家庭下挂接已有节点：节点整体搬到真身树（换 handle、**编号不变**），详情随迁', async () => {
  const { loc, far, h } = crossTreePair('attach');
  // 本树先有一个「未入谱」的节点（面板选人模式）
  const locBefore = readTree(loc);
  locBefore.people.orphan = {
    handle: 'orphan',
    gramps_id: 'I0010',
    name: '沈清昆',
    surname: '沈',
    given: '清昆',
    gender: 'M',
    birth_date: '1990',
    death_date: '',
    birth_place: '',
    death_place: '',
    parent_family: '',
    spouse_families: [],
  };
  writeTree(locBefore);
  const p = path.join(TMP, 'details', `${loc}:orphan.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ _id: `${loc}:orphan`, tree_id: loc, handle: 'orphan', name: '沈清昆', events: [{ handle: 'e1', type: 'Birth' }], attributes: [], media: [], citations: [], notes: [] }, null, 2));

  const r = await addChildNode({ treeId: loc, personHandle: h.locSelf, childHandle: 'orphan', gender: 'M' });

  assert.equal(r.cross_tree, true);
  assert.notEqual(r.child_handle, 'orphan');
  const farAfter = readTree(far);
  const locAfter = readTree(loc);
  assert.equal(locAfter.people.orphan, undefined, '节点本体不得留在本树');
  assert.equal(farAfter.people[r.child_handle].name, '沈清昆');
  // 编号终身不变（docs/id-system.spec.md §2）：只换 handle 与树归属，原编号随迁
  assert.equal(farAfter.people[r.child_handle].gramps_id, 'I0010');
  assert.equal(farAfter.people[r.child_handle].parent_family, 'family_far');
  assert.deepEqual(farAfter.families.family_far.child_handles, [r.child_handle]);
  // 详情随迁到真身树，本树旧详情删除
  assert.equal(readDetail(far, r.child_handle)?.events?.[0]?.handle, 'e1');
  assert.equal(readDetail(loc, 'orphan'), null);
  assert.equal(locAfter.people[r.mirror_handle].external_person_handle, r.child_handle);
});

test('跨树家庭的拒绝分支：已入谱节点 / 双镜像父母 / 对方无婚姻家族 都不写坏任何一棵树', async () => {
  // ① 已入谱（有 parent_family）的节点不能跨树挂接
  const g1 = crossTreePair('guard_a');
  const withAttached = readTree(g1.loc);
  withAttached.people.attached = {
    handle: 'attached', gramps_id: 'I0011', name: '沈某', surname: '沈', given: '某', gender: 'M',
    birth_date: '', death_date: '', birth_place: '', death_place: '',
    parent_family: 'family_loc', spouse_families: [],
  };
  writeTree(withAttached);
  await assert.rejects(
    () => addChildNode({ treeId: g1.loc, personHandle: g1.h.locSelf, childHandle: 'attached', gender: 'M' }),
    /已入谱/,
  );
  assert.equal(readTree(g1.far).families.family_far.child_handles.length, 0, '拒绝时真身树不得被写');

  // ② 父母双方都是镜像 → 拒绝
  const g2 = crossTreePair('guard_b');
  const dual = readTree(g2.loc);
  dual.people.momMirror = { ...dual.people[g2.h.locSelf], handle: 'momMirror', gender: 'F', external_mirror: 'true' };
  dual.families.family_loc.mother_handle = 'momMirror';
  writeTree(dual);
  await assert.rejects(
    () => addChildNode({ treeId: g2.loc, personHandle: 'momMirror', name: '某某', gender: 'M' }),
    /均为外树镜像节点/,
  );

  // ③ 对方（真身树）里没有对应婚姻家族 → 拒绝，且两棵树都保持原样
  const g3 = crossTreePair('guard_c');
  const far3 = readTree(g3.far);
  far3.people[g3.h.farSelf].spouse_families = [];
  far3.people[g3.h.farMirror].spouse_families = [];
  delete far3.families.family_far;
  writeTree(far3);
  const locBefore3 = fs.readFileSync(path.join(TMP, 'trees', `${g3.loc}.json`), 'utf8');
  await assert.rejects(
    () => addChildNode({ treeId: g3.loc, personHandle: g3.h.locSelf, name: '某某', gender: 'M' }),
    /没有对应的婚姻家族/,
  );
  assert.equal(fs.readFileSync(path.join(TMP, 'trees', `${g3.loc}.json`), 'utf8'), locBefore3, '本树不得被写');
});

test('跨树家庭缺真身信息 / 对方树不存在 → 明确拒绝', async () => {
  const { loc, h } = crossTreePair('broken');
  const tree = readTree(loc);
  tree.people[h.locMirror].external_person_handle = '';
  writeTree(tree);
  await assert.rejects(
    () => addChildNode({ treeId: loc, personHandle: h.locSelf, name: '某某', gender: 'M' }),
    /缺少真身信息/,
  );
});

// ---- 写路径：普通家庭（老口径） ----

test('普通家庭：复用第一个配偶家族追加子女（随父姓），不新建家族', async () => {
  const id = plainTree('withfam');
  const r = await addChildNode({ treeId: id, personHandle: 'mom', name: '小明', gender: 'M' });
  assert.equal(r.cross_tree, false);
  assert.equal(r.mirror_handle, '');
  assert.equal(r.family_handle, 'fam_plain');
  const after = readTree(id);
  assert.deepEqual(after.families.fam_plain.child_handles, [r.child_handle]);
  assert.equal(after.people[r.child_handle].name, '沈小明'); // 随父姓（家族之父 沈克强）
  assert.equal(after.people[r.child_handle].parent_family, 'fam_plain');
  assert.equal(after.people['mom'].spouse_families.length, 1);
});

test('普通家庭：本人没有配偶家族 → 按本人性别槽新建家族', async () => {
  const id = plainTree('nofam', { withFamily: false });
  const r = await addChildNode({ treeId: id, personHandle: 'mom', name: '小红', gender: 'F' });
  const after = readTree(id);
  const fam = after.families[r.family_handle];
  assert.equal(fam.mother_handle, 'mom');
  assert.equal(fam.father_handle, '');
  assert.deepEqual(fam.child_handles, [r.child_handle]);
  assert.deepEqual(after.people['mom'].spouse_families, [r.family_handle]);
  assert.equal(after.people[r.child_handle].name, '李小红'); // 父不详 → 随本人姓
  assert.equal(readDetail(id, r.child_handle)?.tree_id, id);
  // 未填姓名 → 拒绝
  await assert.rejects(() => addChildNode({ treeId: id, personHandle: 'mom', gender: 'M' }), /请填写子节点姓名/);
});

// ---- 路由层：POST /admin/add-child ----

test('路由 POST /admin/add-child：鉴权通过 → 跨树结果落两棵树，返回体含 landed_tree_id', async () => {
  const { handleRequest } = await import('../index.js');
  const { signJwt } = await import('./auth.js');
  const phone = '16600000000';
  fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
  fs.writeFileSync(
    path.join(TMP, 'collections', 'jiazu_users.json'),
    JSON.stringify({ [phone]: { _id: phone, phone, nickname: '测试', role: 'tree_steward' } }),
  );
  const token = signJwt({ sub: phone, phone, role: 'tree_steward' }, 3600);

  const g = crossTreePair('route');
  const res = await handleRequest({
    path: '/admin/add-child',
    httpMethod: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ tree_id: g.loc, person_handle: g.h.locSelf, name: '清昆', gender: 'M' }),
  });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.cross_tree, true);
  assert.equal(body.landed_tree_id, g.far);
  assert.equal(readTree(g.far).people[body.child_handle].name, '季清昆');
  assert.equal(readTree(g.loc).people[body.mirror_handle].external_person_handle, body.child_handle);

  // 未登录 → 401（写权限拦截生效）
  const anon = await handleRequest({
    path: '/admin/add-child',
    httpMethod: 'POST',
    headers: {},
    body: JSON.stringify({ tree_id: g.loc, person_handle: g.h.locSelf, name: '清昆' }),
  });
  assert.equal(anon.statusCode, 401);
});

// ---- 真实数据副本（shen/ji）复现 §7-4 纠偏场景 ----

test('真实数据副本：shen 侧「父 季志全(镜像)/母 沈伟」下加子女 → 落到 ji 真身家族，shen 只留镜像', async () => {
  const pair = ['shen_27784_01', 'ji_23395_01'];
  for (const t of pair) {
    fs.copyFileSync(path.join(REAL_TREES, `${t}.json`), path.join(TMP, 'trees', `${t}.json`));
  }
  const jiBefore = readTree('ji_23395_01');
  const shenBefore = readTree('shen_27784_01');

  // 定位一律走「姓名 + handle 指针」，不写死 gramps_id：
  // 编号会随「全站唯一编号」迁移整站变化（I500059 → I000254 之类），handle 与姓名才是不变量。
  const mother = Object.values(shenBefore.people).find((p) => p.name === '沈伟' && !p.external_mirror);
  assert.ok(mother, 'shen 副本应有真身「沈伟」（母）');
  const shenFamBefore = shenBefore.families[mother.spouse_families[0]];
  assert.ok(shenFamBefore, '「沈伟」应已有配偶家族');
  const fatherMirror = shenBefore.people[shenFamBefore.father_handle];
  assert.equal(fatherMirror.external_mirror, 'true', 'shen 侧的父亲应是镜像');
  // 镜像父的 external 指针 → ji 的真身「季志全」；子女应落到 ji 中以他为父的家庭
  const jiFather = jiBefore.people[fatherMirror.external_person_handle];
  assert.ok(jiFather, '镜像父的 external_person_handle 应在 ji 副本里命中真身');
  assert.equal(jiFather.name, '季志全');
  const jiFamHandle = Object.keys(jiBefore.families).find(
    (h) => jiBefore.families[h].father_handle === jiFather.handle,
  );
  assert.ok(jiFamHandle, 'ji 副本应有以「季志全」为父的家庭（真身家族）');
  // 存量节点快照：加子女不得改动它（含编号）
  const legacyChild = Object.values(jiBefore.people).find((p) => p.name === '季清昆');
  assert.ok(legacyChild, 'ji 副本应已存在存量节点「季清昆」');

  const r = await addChildNode({
    treeId: 'shen_27784_01',
    personHandle: mother.handle, // 沈伟（shen 侧真身）
    name: '清昆',
    gender: 'M',
  });
  assert.equal(r.cross_tree, true);
  assert.equal(r.landed_tree_id, 'ji_23395_01');

  const jiAfter = readTree('ji_23395_01');
  const shenAfter = readTree('shen_27784_01');
  assert.deepEqual(
    jiAfter.families[jiFamHandle].child_handles,
    [...jiBefore.families[jiFamHandle].child_handles, r.child_handle],
    '子女挂进 ji 的真实家庭（父 季志全 / 母 沈伟 镜像）',
  );
  assert.equal(jiAfter.people[r.child_handle].name, '季清昆');
  assert.equal(jiAfter.people[r.child_handle].surname, '季');

  const shenFam = shenAfter.families[shenFamBefore.handle];
  assert.ok(shenFam.child_handles.includes(r.mirror_handle), 'shen 侧新增的子女必须是镜像');
  assert.equal(
    Object.values(shenAfter.people).filter((x) => x.name === '季清昆' && !x.external_mirror).length,
    0,
    'shen 侧不得落真人子女',
  );
  assert.equal(shenAfter.people[r.mirror_handle].external_mirror, 'true');
  assert.equal(shenAfter.people[r.mirror_handle].external_tree, 'ji_23395_01');
  assert.equal(shenAfter.people[r.mirror_handle].external_person_handle, r.child_handle);
  assert.equal(shenFam.father_handle, fatherMirror.handle, 'shen 侧镜像父仍在父位');
  // 存量节点（ji 里已有的 季清昆）不受影响：整条记录逐字段一致（编号随之原样不变）
  assert.deepEqual(jiAfter.people[legacyChild.handle], legacyChild, '存量节点不允许被改动');
  assert.equal(jiAfter.people[legacyChild.handle].gramps_id, legacyChild.gramps_id, '存量节点编号不变');
  assert.equal(jiAfter.people[legacyChild.handle].parent_family, jiFamHandle, '存量节点仍挂在原家族');
  assert.notEqual(r.child_handle, legacyChild.handle, '新子女是另一个节点');
});

test('测试全程未写 migrate-output 真实数据（md5 一致）', () => {
  const now = fs.readdirSync(REAL_TREES);
  assert.deepEqual(now.sort(), [...realBaseline.keys()].sort(), '真实树目录文件数/文件名未变');
  for (const f of now) {
    const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(REAL_TREES, f))).digest('hex');
    assert.equal(md5, realBaseline.get(f), `${f} 被改动了`);
  }
});

// ---- 2026-09-15 追加：默认性别「男」+ 真身树深度上限 ----

/** 造一对互为镜像的跨树婚姻树（本树 a_*：父为镜像；真身树 b_*：父为真人） */
function mirrorPair(tag) {
  const a = `${tag}_a`;
  const b = `${tag}_b`;
  const mh = `${tag}_mirror_father`;
  const wh = `${tag}_mother`;
  const rh = `${tag}_real_father`;
  const mw = `${tag}_mirror_mother`;
  writeTree({
    tree_id: a,
    version: 1,
    updated_at: new Date().toISOString(),
    people: {
      [mh]: { handle: mh, gramps_id: 'I0001', name: '季志全', surname: '季', given: '志全', gender: 'M', parent_family: '', spouse_families: [`${tag}_F1`], external_tree: b, external_person_handle: rh, external_link_type: 'marriage', external_mirror: 'true', is_living: true },
      [wh]: { handle: wh, gramps_id: 'I0002', name: '沈伟', surname: '沈', given: '伟', gender: 'F', parent_family: '', spouse_families: [`${tag}_F1`], external_tree: '', external_person_handle: '', external_link_type: '', is_living: true },
    },
    families: {
      [`${tag}_F1`]: { handle: `${tag}_F1`, gramps_id: 'F0001', father_handle: mh, mother_handle: wh, child_handles: [] },
    },
  });
  writeTree({
    tree_id: b,
    version: 1,
    updated_at: new Date().toISOString(),
    people: {
      [rh]: { handle: rh, gramps_id: 'I0001', name: '季志全', surname: '季', given: '志全', gender: 'M', parent_family: '', spouse_families: [`${tag}_G1`], external_tree: a, external_person_handle: mh, external_link_type: 'marriage', is_living: true },
      [mw]: { handle: mw, gramps_id: 'I500059', name: '沈伟', surname: '沈', given: '伟', gender: 'F', parent_family: '', spouse_families: [`${tag}_G1`], external_tree: a, external_person_handle: wh, external_link_type: 'marriage', external_mirror: 'true', is_living: true },
    },
    families: {
      [`${tag}_G1`]: { handle: `${tag}_G1`, gramps_id: 'F500020', father_handle: rh, mother_handle: mw, child_handles: [] },
    },
  });
  return { a, b, mh, wh, rh, mw, famA: `${tag}_F1`, famB: `${tag}_G1` };
}

test('新建子节点不传 gender → 默认「男」（本树普通家庭）', async () => {
  const tag = 'gend';
  const treeId = `${tag}_t`;
  const ph = `${tag}_p`;
  writeTree({
    tree_id: treeId, version: 1, updated_at: new Date().toISOString(),
    people: { [ph]: { handle: ph, gramps_id: 'I0001', name: '季甲', surname: '季', given: '甲', gender: 'M', parent_family: '', spouse_families: [`${tag}_F1`], is_living: true } },
    families: { [`${tag}_F1`]: { handle: `${tag}_F1`, gramps_id: 'F0001', father_handle: ph, mother_handle: '', child_handles: [] } },
  });
  const r = await addChildNode({ treeId, personHandle: ph, name: '乙' });
  const t = readTree(treeId);
  const kid = Object.values(t.people).find((p) => p.name === '季乙');
  assert.ok(kid, '应创建子节点');
  assert.equal(kid.gender, 'M', '默认性别应为 M（男）');
  assert.equal(r.child_handle, kid.handle);
});

test('跨树家庭新建子节点不传 gender → 真身树里的子女默认「男」', async () => {
  const t = mirrorPair('genx');
  await addChildNode({ treeId: t.a, personHandle: t.mh, name: '清昆' });
  const rb = readTree(t.b);
  const kid = Object.values(rb.people).find((p) => p.name === '季清昆' && !p.external_mirror);
  assert.ok(kid, '真身树应新建子女');
  assert.equal(kid.gender, 'M');
});

test('真身树已达深度上限 → 403 且两棵树都不写', async () => {
  const t = mirrorPair('depth');
  const beforeB = JSON.stringify(readTree(t.b));
  const beforeA = JSON.stringify(readTree(t.a));
  await assert.rejects(
    () => addChildNode({ treeId: t.a, personHandle: t.mh, name: '清昆', maxDepth: 72, depthOf: () => 72 }),
    (e) => e.status === 403 && /世深度上限/.test(e.message),
  );
  assert.equal(JSON.stringify(readTree(t.b)), beforeB, '真身树不应被写入');
  assert.equal(JSON.stringify(readTree(t.a)), beforeA, '本树不应被写入');
});

test('真身树未达上限 → 正常写入（depthOf 返回 71 < 72）', async () => {
  const t = mirrorPair('under');
  const r = await addChildNode({ treeId: t.a, personHandle: t.mh, name: '清昆', maxDepth: 72, depthOf: () => 71 });
  assert.equal(r.cross_tree, true);
  assert.equal(r.landed_tree_id, t.b);
  const rb = readTree(t.b);
  assert.ok(Object.values(rb.people).some((p) => p.name === '季清昆'), '真身树应落节点');
});
