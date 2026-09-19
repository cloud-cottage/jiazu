/**
 * `/tree/rank` 的 `mirror_count` 字段守护 —— 保留字段 + 真源契约
 *
 * `mirror_count` 现已降级为**保留字段**：首页卡片已不再展示、前端无消费方。本文件只守护三件事：
 * 字段定义、数据契约、真源未被改动（M7）；不再假设任何展示语义。
 *
 * 口径（用户 2026-09-19 拍板 A 档，逐条写死）：
 *   - `mirror_count` = 该树 `people` 中满足 `String(p.external_mirror) === 'true'` 的节点数（纯计数，**不涉权限裁剪**）；
 *   - `person_count` 口径已于 2026-09-19 二次换为「**纯血缘图**」（彻底弃用姓文本，见
 *     lib/family-population.js 文件头）；本文件只保留其真源**快照值** + 一条不变量断言（随真源增长需同步）；
 *   - 严格字符串口径：`String(...) === 'true'` 之外一律不计（`'TRUE'` / `'1'` / `'false'` / 缺失 不计；
 *     布尔 `true` 因 `String(true) === 'true'` 同样计入）；`external_mirror:'true'` 但缺
 *     `external_person_handle` 的异常数据**仍计入**（判定只看 `external_mirror`）。
 *
 * 覆盖：
 *   M1 真源 gu_39038_01（树 + details 副本）→ 200，`mirror_count` 与真源树文件动态推导一致，`person_count`
 *      快照 21 + 不变量（people 总数 − 显式点名的被排除 handle 数：I000292 / I000293 / I000294），既有出参字段逐字段仍在；
 *   M2 真源 gu 树源文件中 `external_mirror==='true'` 的 handle 集合**动态推导**，且**包含式点名**
 *      I000143 / I000292 / I000293 / I000294 / I000367（不写死总数，真源再漂不再假红）；
 *   M3 无镜像树（含「有 external_person_handle 但非镜像」「external_mirror:'false'」）→ 0；
 *   M4 严格口径 + 缺 handle 异常数据仍计入（夹具 tree）；
 *   M5 权限档位变化（guest / 已登录非成员 / 树成员）`mirror_count` 与 `person_count` 恒定不变 —— 且用 computeAccess
 *      直证这些镜像节点在 guest 档确实被裁掉（证明计数与权限裁剪解耦）；真源 gu 的镜像数同样动态推导；
 *   M6 真源 ji_23395_01 → `mirror_count` 动态一致（包含式点名 I000209 / I000253 / I000291 / I000365）、
 *      `person_count` 快照 61 + 不变量（people 总数 − 排除集：**2026-09-19 清理后 ji 排除集为空** ——
 *      姑父 I000238 / 妹夫 I000240 等 28 个非成员真节点已从真源删除，故不变量右项即真源 people 总数本身）；
 *   M7 真源体检：config/tree-meta.json + migrate-output/{trees,collections} 逐字节未变。
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本（真源只读复制）；真源 md5 文末断言未变。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/mirror-count.test.js
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
const REAL_DETAILS = path.join(REAL_OUT, 'details');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-mirror-count-'));
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
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });

const writeJson = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj, null, 2));
const writeTree = (tree) => writeJson(path.join(TMP, 'trees', `${tree.tree_id}.json`), tree);
const writeCol = (col, docs) => {
  const obj = {};
  for (const d of docs) obj[d._id || `k_${Object.keys(obj).length}`] = d;
  writeJson(path.join(TMP, 'collections', `${col}.json`), obj);
};

// ---- 真源只读副本：gu_39038_01 / ji_23395_01（树文件 + details）----
const REAL_TREES_UNDER_TEST = ['gu_39038_01', 'ji_23395_01'];
for (const tid of REAL_TREES_UNDER_TEST) {
  fs.copyFileSync(path.join(REAL_TREES, `${tid}.json`), path.join(TMP, 'trees', `${tid}.json`));
  for (const f of fs.readdirSync(REAL_DETAILS)) {
    if (f.startsWith(`${tid}:`)) fs.copyFileSync(path.join(REAL_DETAILS, f), path.join(TMP, 'details', f));
  }
}

// ---- 夹具 1：plain_tree（完全无镜像；有 external_person_handle 也不计）----
writeTree({
  tree_id: 'plain_tree',
  version: 1,
  updated_at: '2026-09-05T00:00:00.000Z',
  people: {
    h_p1: { handle: 'h_p1', gramps_id: 'I000801', name: '钱一', surname: '钱', given: '一', gender: 'M' },
    h_p2: { handle: 'h_p2', gramps_id: 'I000802', name: '钱二', surname: '钱', given: '二', gender: 'M', external_person_handle: 'X9' },
    h_p3: { handle: 'h_p3', gramps_id: 'I000803', name: '钱三', surname: '钱', given: '三', gender: 'F', external_mirror: 'false' },
  },
  families: {},
});

// ---- 夹具 2：mir_tree（20 世直链 + 深世镜像节点，用于严格口径 + 权限档位对照）----
// 20 世直链 → guest 可见 20-18=2 世、已登录非成员可见 11 世、成员 full；
// 镜像节点挂在第 10 世之下（第 11 世）→ guest 档确被裁掉，用于证明「计数不涉权限裁剪」。
const mirTree = {
  tree_id: 'mir_tree',
  version: 1,
  updated_at: '2026-09-06T00:00:00.000Z',
  people: {},
  families: {},
};
for (let i = 1; i <= 20; i++) {
  mirTree.people[`h_g${i}`] = {
    handle: `h_g${i}`, gramps_id: `I${700 + i}`, name: `沈${i}`, surname: '沈', given: String(i), gender: 'M',
  };
}
for (let i = 1; i < 20; i++) {
  mirTree.families[`f_${i}`] = { handle: `f_${i}`, father_handle: `h_g${i}`, mother_handle: '', child_handles: [`h_g${i + 1}`] };
}
// 镜像变体（期望计入 = 3：h_m1 缺 external_person_handle 仍计、h_m2 正常计、
// h_m4 为布尔 true —— `String(true) === 'true'` 是规格谓词的天然结果，同样计入）
mirTree.people.h_m1 = { handle: 'h_m1', gramps_id: 'I000811', name: '外树甲', surname: '外', given: '甲', gender: 'M', external_mirror: 'true' };
mirTree.people.h_m2 = { handle: 'h_m2', gramps_id: 'I000812', name: '外树乙', surname: '外', given: '乙', gender: 'M', external_mirror: 'true', external_person_handle: 'EXT_H2' };
mirTree.people.h_m3 = { handle: 'h_m3', gramps_id: 'I000813', name: '外树丙', surname: '外', given: '丙', gender: 'M', external_mirror: 'false', external_person_handle: 'EXT_H3' };
mirTree.people.h_m4 = { handle: 'h_m4', gramps_id: 'I000814', name: '外树丁', surname: '外', given: '丁', gender: 'M', external_mirror: true, external_person_handle: 'EXT_H4' };
mirTree.people.h_m5 = { handle: 'h_m5', gramps_id: 'I000815', name: '外树戊', surname: '外', given: '戊', gender: 'M', external_mirror: 'TRUE' };
mirTree.people.h_m6 = { handle: 'h_m6', gramps_id: 'I000816', name: '外树己', surname: '外', given: '己', gender: 'M', external_person_handle: 'EXT_H6' };
mirTree.people.h_m7 = { handle: 'h_m7', gramps_id: 'I000817', name: '外树庚', surname: '外', given: '庚', gender: 'M', external_mirror: '1' };
for (let k = 1; k <= 7; k++) {
  mirTree.families[`f_m${k}`] = { handle: `f_m${k}`, father_handle: 'h_g10', mother_handle: '', child_handles: [`h_m${k}`] };
}
writeTree(mirTree);

// ---- meta 副本：真源 + 夹具登记（绝不写真源）----
const metaCopy = JSON.parse(fs.readFileSync(REAL_META, 'utf8'));
metaCopy.trees.plain_tree = { tree_id: 'plain_tree', kind: 'clan', display_title: '钱氏小谱' };
metaCopy.trees.mir_tree = { tree_id: 'mir_tree', kind: 'clan', display_title: '沈氏长谱' };
writeJson(process.env.COMPAT_META_FILE, metaCopy);

// ---- 权限档位夹具（M5）：成员锚点在 mir_tree ----
const MEMBER = '13800009001';
const NONMEMBER = '13800009002';
const CURATOR = '13800009003';
writeCol('jiazu_users', [
  { _id: MEMBER, phone: MEMBER, nickname: '沈氏成员', role: 'user' },
  { _id: NONMEMBER, phone: NONMEMBER, nickname: '路人', role: 'user' },
  { _id: CURATOR, phone: CURATOR, nickname: '总编辑', role: 'chief_editor' },
]);
writeCol('jiazu_anchors', [{ _id: MEMBER, phone: MEMBER, tree_id: 'mir_tree', person_handle: 'h_g2' }]);

const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');
const { computeAccess } = await import('./tree-access.js');

const bearer = (phone = MEMBER, role = 'user') => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role }, 3600)}` });
const call = (p, { method = 'GET', headers = {}, query, body } = {}) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: query,
    body: body ? JSON.stringify(body) : undefined,
  });
const json = async (p, opts) => {
  const res = await call(p, opts);
  return { status: res.statusCode, body: JSON.parse(res.body) };
};
const rankOf = async (tid, headers = {}) => json('/tree/rank', { headers: { 'X-Tree-Id': tid, ...headers } });

/** 源文件口径的镜像数（与后端同一谓词，供交叉核对） */
const srcMirrors = (tid) => {
  const tree = JSON.parse(fs.readFileSync(path.join(TMP, 'trees', `${tid}.json`), 'utf8'));
  return Object.values(tree.people).filter((p) => String(p.external_mirror) === 'true');
};

/** 读真源树文件（真源根目录，只读 —— 绝不写） */
const readRealTree = (tid) => JSON.parse(fs.readFileSync(path.join(REAL_TREES, `${tid}.json`), 'utf8'));

/**
 * 真源树文件动态推导的镜像节点清单 —— 期望值不写死总数，真源再漂也不假红。
 * @returns {{handle: string, gramps_id: string}[]}
 */
const realMirrors = (tid) => {
  const tree = readRealTree(tid);
  return Object.entries(tree.people)
    .filter(([, p]) => p && String(p.external_mirror) === 'true')
    .map(([h, p]) => ({ handle: h, gramps_id: p.gramps_id }));
};

/** 真源 people 总数（不变量右项用；真源 trees 的 people 与计数域实测相等） */
const realPeopleCount = (tid) => Object.keys(readRealTree(tid).people).length;

/** 点名 handle（gramps_id）必须真实存在于真源树里（防点名陈旧） */
const assertGidsInRealTree = (tid, gids) => {
  const present = new Set(Object.values(readRealTree(tid).people).map((p) => p && p.gramps_id));
  for (const gid of gids) assert.ok(present.has(gid), `点名的节点 ${gid} 必须仍存在于真源 ${tid}`);
};

/** 真源 gu 的镜像 handle 点名（包含式断言，不约束总数） */
const GU_MIRROR_GIDS = ['I000143', 'I000292', 'I000293', 'I000294', 'I000367'];
/** 真源 ji 的镜像 handle 点名 */
const JI_MIRROR_GIDS = ['I000209', 'I000253', 'I000291', 'I000365'];
/** 真源 gu 被新口径（纯血缘图）排除的 handle 点名：婚入男镜像 I000292 + 其子 child 镜像 I000293 / I000294 */
const GU_EXCLUDED_GIDS = ['I000292', 'I000293', 'I000294'];
/**
 * 真源 ji 被新口径（纯血缘图）排除的 handle 点名：**当前为空**。
 * 2026-09-19 真源清理：原需剔除的姑父 I000238 / 妹夫 I000240 等 28 个非成员真节点已删除，
 * ji 现存 61 人全为血缘图成员、无姻亲/镜像需剔除 → people 总数 61 = person_count 61。
 * 若日后真源再增删姻亲，必须在此重新点名并同步不变量右项与 M6 快照值。
 */
const JI_EXCLUDED_GIDS = [];

// ================= M1. 真源 gu 树：mirror_count 动态推导 + person_count 快照 =================

test('M1 真源 gu_39038_01：mirror_count 与真源动态一致、person_count 快照 21，既有字段逐字段仍在', async () => {
  const mirrors = realMirrors('gu_39038_01');
  const { status, body } = await rankOf('gu_39038_01');
  assert.equal(status, 200);
  assert.equal(
    body.mirror_count,
    mirrors.length,
    "mirror_count = 真源树文件里 String(p.external_mirror) === 'true' 的 handle 数（动态推导）",
  );
  assert.equal(typeof body.mirror_count, 'number', 'mirror_count 必须是 number');
  assert.equal(body.person_count, 21, 'person_count 真源数据快照（24 − 季清昆 I000292 − 季庭亦 I000293 − 季贺为 I000294），随真源增长需同步');

  // 不变量：person_count === people 总数 − 被排除 handle 数（排除集合用例显式点名，不由实现函数反推）
  assertGidsInRealTree('gu_39038_01', GU_EXCLUDED_GIDS);
  assert.equal(
    body.person_count,
    realPeopleCount('gu_39038_01') - GU_EXCLUDED_GIDS.length,
    'people 总数 − 点名的被排除 handle 数（gu：I000292 / I000293 / I000294）',
  );

  // 既有出参逐字段仍在（一个不许少 / 不许改）
  assert.equal(body.tree_id, 'gu_39038_01');
  assert.equal(typeof body.total_generations, 'number');
  assert.equal(typeof body.rank_key, 'string');
  assert.equal(typeof body.rank_label, 'string');
  assert.equal(typeof body.rank_en, 'string');
  assert.equal(typeof body.rank_desc, 'string');
  assert.equal(typeof body.over_limit, 'boolean');
  assert.equal(body.max_depth, 72);
  assert.equal(typeof body.root_count, 'number');
  assert.equal(typeof body.explicit, 'boolean');
  assert.equal(typeof body.activity, 'number');
  assert.equal(typeof body.updated_at, 'string');
  assert.ok(body.access && typeof body.access === 'object', 'access 元信息仍在');
  assert.equal(typeof body.access.mode, 'string');
  assert.equal(typeof body.access.hide_tail, 'number');
});

test("M2 真源 gu 树源文件：external_mirror === 'true' 的 handle 集合动态推导，且包含点名的 5 个", () => {
  const m = realMirrors('gu_39038_01');
  assert.ok(m.length > 0, 'gu 树必须存在镜像节点');
  const gids = m.map((p) => p.gramps_id);
  // 包含式点名（不写死总数 —— 真源再漂不再假红）
  for (const gid of GU_MIRROR_GIDS) {
    assert.ok(
      gids.includes(gid),
      `点名镜像 ${gid} 必须命中（I000143 founder / I000292 marriage / I000293 child / I000294 child / I000367 marriage）`,
    );
  }
  assert.equal(new Set(gids).size, gids.length, 'gramps_id 不得重复');
  // 推导结果与真源谓词逐 handle 对齐（证明期望值真来自真源文件）
  const tree = readRealTree('gu_39038_01');
  assert.deepEqual(
    m.map((p) => p.handle).sort(),
    Object.entries(tree.people).filter(([, p]) => String(p.external_mirror) === 'true').map(([h]) => h).sort(),
  );
  // 沙箱副本（路由实读）与真源点名一致
  assert.deepEqual(srcMirrors('gu_39038_01').map((p) => p.gramps_id).sort(), gids.slice().sort());
});

// ================= M3. 无镜像树 → 0 =================

test('M3 无镜像树：plain_tree → mirror_count === 0（external_person_handle / external_mirror:\'false\' 都不计）', async () => {
  const { status, body } = await rankOf('plain_tree');
  assert.equal(status, 200);
  assert.equal(body.mirror_count, 0);
  assert.equal(body.person_count, 3, 'person_count 仍是 3（3 个节点）');
  assert.equal(srcMirrors('plain_tree').length, 0, '源文件口径同样是 0');
});

// ================= M4. 严格口径 + 异常数据仍计入 =================

test('M4 口径：缺 external_person_handle 的镜像仍计入；\'false\' / \'TRUE\' / \'1\' / 缺字段均不计（布尔 true 计入）', async () => {
  const { status, body } = await rankOf('mir_tree');
  assert.equal(status, 200);
  assert.equal(body.mirror_count, 3, 'h_m1（缺 external_person_handle，仍计）+ h_m2（正常镜像）+ h_m4（布尔 true，String(true)===\'true\'）');
  assert.equal(srcMirrors('mir_tree').length, 3, '源文件口径一致');
  assert.equal(body.person_count, 27, '20 世直链 + 7 个镜像/变体节点 = 27（口径不变，仍含镜像）');
});

// ================= M5. 权限档位变化不影响计数 =================

test('M5 权限档位（guest / 已登录非成员 / 树成员）下 mirror_count 与 person_count 恒定不变', async () => {
  const guest = await rankOf('mir_tree');
  const logged = await rankOf('mir_tree', bearer(NONMEMBER, 'user')); // 无锚点 → 非成员
  const member = await rankOf('mir_tree', bearer(MEMBER, 'user')); // 锚点即本树 → 成员
  const curator = await rankOf('mir_tree', bearer(CURATOR, 'chief_editor'));

  const counts = [guest, logged, member, curator].map((r) => [r.body.mirror_count, r.body.person_count]);
  assert.deepEqual(counts, [[3, 27], [3, 27], [3, 27], [3, 27]], '四档下计数逐值一致');

  // 证明档位确实不同（否则上一条断言毫无信息量）：guest 可见 2 世、已登录可见 11 世、成员 full
  assert.equal(guest.body.access.mode, 'partial');
  assert.equal(guest.body.access.hide_tail, 18);
  assert.equal(guest.body.access.visible_max_depth, 2);
  assert.equal(logged.body.access.hide_tail, 9);
  assert.equal(logged.body.access.visible_max_depth, 11);
  assert.equal(member.body.access.mode, 'full');
  assert.equal(member.body.access.member, true);

  // 直证：这些镜像节点在 guest 档确被裁掉（第 11 世 > 可见 2 世）——计数与之解耦
  const access = computeAccess({ treeId: 'mir_tree', isMaster: false, role: null, anchorTreeId: null, people: mirTree.people, families: mirTree.families });
  assert.equal(access.isHiddenPerson('h_m1'), true, 'guest 档下镜像节点确被裁剪');
  assert.equal(access.isHiddenPerson('h_m2'), true, 'guest 档下镜像节点确被裁剪');
  assert.equal(guest.body.mirror_count, 3, '被裁剪也不影响 mirror_count（纯计数）');

  // 真源 gu 树同理：guest 档（floor，仅 1 世）下 mirror_count 仍与真源动态推导一致
  const guGuest = await rankOf('gu_39038_01');
  assert.equal(guGuest.body.access.mode, 'floor');
  assert.equal(guGuest.body.mirror_count, realMirrors('gu_39038_01').length, '权限档位不改变 mirror_count');
});

// ================= M6. 真源 ji 树 =================

test('M6 真源 ji_23395_01：mirror_count 动态一致、person_count 快照 61 + 不变量', async () => {
  const mirrors = realMirrors('ji_23395_01');
  const { status, body } = await rankOf('ji_23395_01');
  assert.equal(status, 200);
  assert.equal(body.mirror_count, mirrors.length, 'mirror_count 由真源树文件动态推导');
  assert.equal(srcMirrors('ji_23395_01').length, mirrors.length, '源文件口径一致');
  const gids = mirrors.map((p) => p.gramps_id);
  for (const gid of JI_MIRROR_GIDS) {
    assert.ok(gids.includes(gid), `点名镜像 ${gid} 必须命中（I000209 founder / I000253 marriage / I000291 marriage / I000365 marriage）`);
  }
  assert.equal(
    body.person_count,
    61,
    'person_count 真源数据快照（2026-09-19 清理 28 个非成员真节点后 ji = 61，排除集为空），随真源增长需同步',
  );
  // 不变量：person_count === people 总数 − 被排除 handle 数（排除集合用例显式点名）
  // ji 当前排除集为空（2026-09-19 清理后：姑父 I000238 / 妹夫 I000240 等非成员真节点已删）
  // → 右项即真源 people 总数本身；因快照(61) 与 realPeopleCount(61) 来自两处独立读源，
  // 本断言仍是对「真源人数口径」的交叉核对，非同源恒真。
  assertGidsInRealTree('ji_23395_01', JI_EXCLUDED_GIDS);
  assert.equal(
    body.person_count,
    realPeopleCount('ji_23395_01') - JI_EXCLUDED_GIDS.length,
    'people 总数 − 点名的被排除 handle 数（ji：排除集现为空 —— 2026-09-19 清理后无姻亲/镜像需剔除）',
  );
});

// ================= M7. 真源体检 =================

test('M7 真源未被改动：config/tree-meta.json + migrate-output/trees + collections 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 真源 md5 不得变化');
  const trees = dirBaseline(REAL_TREES);
  const cols = dirBaseline(REAL_COLLECTIONS);
  assert.deepEqual([...trees.keys()].sort(), [...realTreeBaseline.keys()].sort(), 'trees 目录文件清单不得变化');
  assert.deepEqual([...cols.keys()].sort(), [...realColBaseline.keys()].sort(), 'collections 目录文件清单不得变化');
  for (const [f, h] of realTreeBaseline) assert.equal(trees.get(f), h, `trees/${f} 不得变化`);
  for (const [f, h] of realColBaseline) assert.equal(cols.get(f), h, `collections/${f} 不得变化`);
  assert.ok(TMP.startsWith(os.tmpdir()), '沙箱目录必须在 /tmp 下');
});
