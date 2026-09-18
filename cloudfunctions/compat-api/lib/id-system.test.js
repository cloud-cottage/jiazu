/**
 * 全站唯一节点编号（docs/id-system.spec.md）测试
 *
 * 覆盖：
 * - P1 铸号：编号格式 / 计数器播种（max+1）/ 并发不重号 / 落盘集合 jiazu_id_seq / store 暴露的 nextPersonId/nextFamilyId
 * - P1 创建路径：createPerson / createFamily / createTree / addSpouseNode / addChildNode 一律铸全局号
 * - P3 解析器：全局编号（I000052 / 000052）/ handle / 树内旧号（带 tree_id，含详情文档 legacy_gramps_id 回退）
 *   多树重号 → 明确要求指定目标树；scope 限定只在该树找
 * - P2 迁移脚本：/tmp 副本上跑通 → 幂等重放零改动、zhonghua 原号保留、映射表与 legacy_gramps_id、真源拒绝运行
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 指向 /tmp 副本；文末 md5 断言真实数据逐字节未变。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/id-system.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');
const MIGRATE_SCRIPT = path.join(REPO, 'scripts', 'migrate-global-ids.mjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-id-system-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
const META_FILE = path.join(TMP, 'tree-meta.json');
process.env.COMPAT_META_FILE = META_FILE;

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaMd5 = md5(REAL_META);
const realTreesBaseline = new Map(fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]));
const realDetailsBaseline = new Map(fs.readdirSync(REAL_DETAILS).map((f) => [f, md5(path.join(REAL_DETAILS, f))]));

fs.writeFileSync(
  META_FILE,
  JSON.stringify(
    {
      _schema: '1.1',
      trees: {
        zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, display_title: '中华世本' },
      },
    },
    null,
    2,
  ) + '\n',
);

const store = await import('./store.js');
const idSeq = await import('./id-seq.js');
const { resolveNode } = await import('./id-resolve.js');
const tw = await import('./tree-write.js');
const cw = await import('./child-write.js');

const TREE_DEFAULTS = {
  _schema: '1.0',
  version: 1,
  updated_at: new Date().toISOString(),
  people: {},
  families: {},
};

function writeTree(tree) {
  const dir = path.join(TMP, 'trees');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${tree.tree_id}.json`), JSON.stringify(tree, null, 2));
}

function writeDetail(obj) {
  const dir = path.join(TMP, 'details');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${obj._id}.json`), JSON.stringify(obj, null, 2));
}

const person = (handle, grampsId, extra = {}) => ({
  handle,
  gramps_id: grampsId,
  name: `某${handle}`,
  surname: '某',
  given: handle,
  gender: 'M',
  birth_date: '',
  death_date: '',
  birth_place: '',
  death_place: '',
  parent_family: '',
  spouse_families: [],
  external_tree: '',
  external_person_handle: '',
  external_link_type: '',
  ...extra,
});

// ================= P1：铸号 =================

test('铸号格式与解析（纯函数）：I000052 / 000052 / F000012', () => {
  assert.equal(idSeq.formatPersonId(52), 'I000052');
  assert.equal(idSeq.formatPersonId(138), 'I000138');
  assert.equal(idSeq.formatFamilyId(12), 'F000012');
  assert.deepEqual(idSeq.parseGlobalId('I000052'), { kind: 'person', number: 52 });
  assert.deepEqual(idSeq.parseGlobalId('000052'), { kind: 'person', number: 52 });
  assert.deepEqual(idSeq.parseGlobalId('i52'), { kind: 'person', number: 52 });
  assert.deepEqual(idSeq.parseGlobalId('F000012'), { kind: 'family', number: 12 });
  assert.equal(idSeq.parseGlobalId('10400594c54f5203f61bf4fa4b20'), null, 'handle 不是编号');
  assert.equal(idSeq.parseGlobalId('I1234567'), null, '超过 6 位不是编号写法');
  assert.equal(idSeq.numberOfId('I000138'), 138);
});

test('计数器缺失时播种 = max(既有编号)+1（迁移兜底：绝不与存量撞号）', async () => {
  // 沙箱里先放一棵“存量”树：人 I000137 / 家族 F000136
  writeTree({
    ...TREE_DEFAULTS,
    tree_id: 'seed_tree',
    people: { sh: person('sh', 'I000137') },
    families: { sf: { handle: 'sf', gramps_id: 'F000136', father_handle: 'sh', mother_handle: '', child_handles: [] } },
  });
  const first = await idSeq.nextPersonId();
  const firstFam = await idSeq.nextFamilyId();
  assert.equal(first, 'I000138', '播种 = 存量最大编号 + 1');
  assert.equal(firstFam, 'F000137');

  // 落盘到集合文件（本地模式 = migrate-output/collections/jiazu_id_seq.json 的同构副本）
  const raw = JSON.parse(fs.readFileSync(path.join(TMP, 'collections', 'jiazu_id_seq.json'), 'utf8'));
  assert.equal(raw.person.next, 139);
  assert.equal(raw.family.next, 138);
  assert.equal(raw.person._id, 'person');
});

test('并发铸号绝不重号（同一进程写锁串行）', async () => {
  const ids = await Promise.all(Array.from({ length: 50 }, () => store.nextPersonId()));
  assert.equal(new Set(ids).size, 50, '50 次并发铸号必须 50 个不同编号');
  for (const id of ids) assert.match(id, /^I\d{6}$/);
  const nums = ids.map((x) => parseInt(x.slice(1), 10)).sort((a, b) => a - b);
  assert.deepEqual(
    nums,
    Array.from({ length: 50 }, (_, i) => 139 + i),
    '连续分配（无跳号、无重号）',
  );
  assert.equal(await store.nextFamilyId(), 'F000138');
});

// ================= P1：创建路径铸全局号 =================

test('创建路径一律铸全局号：人/家族跨树不重号，格式为 6 位', async () => {
  writeTree({ ...TREE_DEFAULTS, tree_id: 'idp_a', people: { a0: person('a0', 'I000009') } });
  writeTree({ ...TREE_DEFAULTS, tree_id: 'idp_b', people: { b0: person('b0', 'I500059') } });

  const r1 = await tw.createPerson('idp_a', { primary_name: { first_name: '甲', surname_list: [{ surname: '甲', primary: true }] }, gender: 1 });
  const r2 = await tw.createPerson('idp_b', { primary_name: { first_name: '乙', surname_list: [{ surname: '乙', primary: true }] }, gender: 1 });
  const t1 = await store.getTree('idp_a');
  const t2 = await store.getTree('idp_b');
  const id1 = t1.people[r1.handle].gramps_id;
  const id2 = t2.people[r2.handle].gramps_id;
  assert.match(id1, /^I\d{6}$/);
  assert.match(id2, /^I\d{6}$/);
  assert.notEqual(id1, id2, '跨树新节点编号必须全站唯一');
  assert.notEqual(id1, 'I000010', '不再用树内序号自增');

  // 详情文档的展示冗余编号与树内一致
  const d1 = JSON.parse(fs.readFileSync(path.join(TMP, 'details', `idp_a:${r1.handle}.json`), 'utf8'));
  assert.equal(d1.gramps_id, id1);

  // 家族
  const f1 = await tw.createFamily('idp_a', { father_handle: r1.handle, mother_handle: '', child_ref_list: [] });
  const f2 = await tw.createFamily('idp_b', { father_handle: r2.handle, mother_handle: '', child_ref_list: [] });
  const fam1 = (await store.getTree('idp_a')).families[f1.handle].gramps_id;
  const fam2 = (await store.getTree('idp_b')).families[f2.handle].gramps_id;
  assert.match(fam1, /^F\d{6}$/);
  assert.match(fam2, /^F\d{6}$/);
  assert.notEqual(fam1, fam2, '跨树新家族编号必须全站唯一');

  // 添加配偶 + 添加子女（含镜像分支的普通分支）也铸全局号
  const sp = await tw.addSpouseNode({ treeId: 'idp_a', personHandle: r1.handle, mode: 'new', name: '配偶', gender: 'F' });
  assert.match((await store.getTree('idp_a')).people[sp.spouse_handle].gramps_id, /^I\d{6}$/);
  const ch = await cw.addChildNode({ treeId: 'idp_a', personHandle: r1.handle, name: '子', gender: 'M' });
  assert.match((await store.getTree('idp_a')).people[ch.child_handle].gramps_id, /^I\d{6}$/);
});

test('新建家族树：始祖节点铸全局号（不再是 I0001）', async () => {
  const r = await tw.createTree({ surnameChar: '雷', founderName: '震', initiatorPhone: '16600000000' });
  assert.match(r.founder_gramps_id, /^I\d{6}$/);
  assert.notEqual(r.founder_gramps_id, 'I0001');
  const tree = await store.getTree(r.tree_id);
  assert.equal(tree.founder_gramps_id, r.founder_gramps_id);
  assert.equal(tree.people[r.founder_handle].gramps_id, r.founder_gramps_id, '树 JSON 始祖编号与铸号一致（全站唯一）');
});

// ================= P3：统一解析器 =================

test('resolveNode：全局编号（不带树）/ handle / 树内旧号（带 tree_id）都能定位', async () => {
  writeTree({ ...TREE_DEFAULTS, tree_id: 'idr_a', people: { hA: person('hA', 'I000500', { name: '甲父' }) } });
  writeTree({ ...TREE_DEFAULTS, tree_id: 'idr_b', people: { hB: person('hB', 'I9000', { name: '乙父' }) } });
  // 迁移留痕（详情文档 legacy_gramps_id）
  writeDetail({
    _id: 'idr_c:oldC',
    tree_id: 'idr_c',
    handle: 'oldC',
    gramps_id: 'I000700',
    name: '旧号节点',
    legacy_gramps_id: '0052',
    events: [],
    attributes: [],
  });
  writeTree({ ...TREE_DEFAULTS, tree_id: 'idr_c', people: { oldC: person('oldC', 'I000700', { name: '旧号节点' }) } });

  const byGlobal = await resolveNode('I000500');
  assert.deepEqual([byGlobal.tree_id, byGlobal.handle, byGlobal.matched], ['idr_a', 'hA', 'global']);
  const byBareNumber = await resolveNode('000500');
  assert.equal(byBareNumber.handle, 'hA', '省略前缀也可全局定位');

  const byHandle = await resolveNode('hA');
  assert.deepEqual([byHandle.tree_id, byHandle.handle, byHandle.matched], ['idr_a', 'hA', 'handle']);

  // 树内旧号（过渡期）：需带 tree_id
  const byLocal = await resolveNode('I9000', 'idr_b');
  assert.deepEqual([byLocal.tree_id, byLocal.handle, byLocal.matched], ['idr_b', 'hB', 'legacy']);
  // 不带 tree_id 但全站唯一 → 也能定位（旧号仍在的数据）
  const crossLocal = await resolveNode('I9000');
  assert.equal(crossLocal.handle, 'hB');

  // 详情文档里的 legacy_gramps_id 回退（迁移后的树：0052 → I000700）
  const byLegacy = await resolveNode('0052', 'idr_c');
  assert.deepEqual([byLegacy.tree_id, byLegacy.handle, byLegacy.matched], ['idr_c', 'oldC', 'legacy']);

  // 找不到
  assert.equal(await resolveNode('I999999'), null);
  assert.equal(await resolveNode(''), null);
  assert.equal(await resolveNode('nonexistent-handle-x'), null);
  // scope 限定：只在该树找，找不到返回 null（调用方给出「目标树 X 中找不到」文案）
  assert.equal(await resolveNode('000500', '', { targetTreeId: 'idr_b' }), null);
});

test('resolveNode：多树重号（迁移前的旧号）→ 明确要求指定目标家族树，绝不猜', async () => {
  writeTree({ ...TREE_DEFAULTS, tree_id: 'idr_dup_a', people: { d1: person('d1', 'I8888') } });
  writeTree({ ...TREE_DEFAULTS, tree_id: 'idr_dup_b', people: { d2: person('d2', 'I8888') } });
  await assert.rejects(
    () => resolveNode('I8888'),
    (e) => /重号/.test(e.message) && /指定目标家族树/.test(e.message),
  );
  const scoped = await resolveNode('I8888', '', { targetTreeId: 'idr_dup_b' });
  assert.equal(scoped.handle, 'd2', '指定目标树后唯一');
});

test('跨树改父（reparentNode）：编号属于别的树 → 迁移后编号不变，仅换树归属', async () => {
  writeTree({
    ...TREE_DEFAULTS,
    tree_id: 'idm_src',
    people: { s1: person('s1', 'I000810', { name: '源根' }), s2: person('s2', 'I000811', { name: '源子' }) },
    families: { sf: { handle: 'sf', gramps_id: 'F000810', father_handle: 's1', mother_handle: '', child_handles: ['s2'] } },
  });
  writeTree({
    ...TREE_DEFAULTS,
    tree_id: 'idm_dst',
    people: { t1: person('t1', 'I000820', { name: '目标父' }) },
    families: {},
  });
  // 用**全局编号**指定新父（无需指定目标树：解析器自动识别所属树）
  const r = await tw.reparentNode({ treeId: 'idm_src', personHandle: 's2', newParentRef: '000820', masterTreeId: 'zhonghua' });
  assert.equal(r.cross_tree, true);
  assert.equal(r.target_tree_id, 'idm_dst');
  const dst = await store.getTree('idm_dst');
  const src = await store.getTree('idm_src');
  assert.equal(dst.people.s2.gramps_id, 'I000811', '编号终身不变（不按目标树重编）');
  assert.equal(dst.people.s2.parent_family, r.family_handle);
  assert.equal(src.people.s2, undefined);
  assert.deepEqual(r.gramps_id_map, { s2: 'I000811' }, '映射表为恒等映射');
});

// ================= P2：迁移脚本（/tmp 副本） =================

test('迁移脚本：拒绝在真实数据根运行（真源一个字节都不写）', () => {
  let status = 0;
  try {
    execFileSync(process.execPath, [MIGRATE_SCRIPT], { stdio: 'pipe' });
  } catch (e) {
    status = e.status;
  }
  assert.equal(status, 2, '不带 --root 时默认真源 → 必须拒绝（exit 2）');
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
  for (const [f, h] of realTreesBaseline) assert.equal(md5(path.join(REAL_TREES, f)), h, `真实树 ${f} 被改动了`);
});

test('迁移脚本：副本上跑通 → zhonghua 保留原号 / 其余树重编号 + 映射表 + legacy_gramps_id；二次运行零改动', () => {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-id-migrate-'));
  fs.mkdirSync(path.join(copy, 'trees'), { recursive: true });
  fs.mkdirSync(path.join(copy, 'details'), { recursive: true });
  for (const f of fs.readdirSync(REAL_TREES)) fs.copyFileSync(path.join(REAL_TREES, f), path.join(copy, 'trees', f));
  for (const f of fs.readdirSync(REAL_DETAILS)) fs.copyFileSync(path.join(REAL_DETAILS, f), path.join(copy, 'details', f));

  const zhBefore = md5(path.join(copy, 'trees', 'zhonghua.json'));
  const run = () => execFileSync(process.execPath, [MIGRATE_SCRIPT, '--root', copy]).toString();
  const out1 = run();
  assert.match(out1, /重编号：人 \d+ \/ 家族 \d+/);
  assert.match(out1, /唯一性校验：全站人\/家族编号唯一/);

  // zhonghua 原号保留 + 未被写脏
  assert.equal(md5(path.join(copy, 'trees', 'zhonghua.json')), zhBefore, 'zhonghua 树 JSON 一字未改');
  const zh = JSON.parse(fs.readFileSync(path.join(copy, 'trees', 'zhonghua.json'), 'utf8'));
  const zhIds = Object.values(zh.people).map((p) => p.gramps_id);
  // 原号保留：**形状断言，覆盖 zhonghua 全部编号**，与具体节点无关（节点增删不会假红；
  // 比只抽查 I0000/I0052 两个编号更强）。迁移前的老号是 4 位形态，迁移后新建节点铸 6 位全局号 ——
  // 两者之外的任何形态都说明编号被改坏/被重编号；且老 4 位号必须仍然存在。
  const ZH_OLD = /^I\d{4}$/;
  const ZH_NEW = /^I\d{6}$/;
  assert.ok(
    zhIds.length > 0 && zhIds.every((x) => ZH_OLD.test(String(x)) || ZH_NEW.test(String(x))),
    'zhonghua 编号形态只允许老 4 位原号或迁移后 6 位全局号',
  );
  assert.ok(zhIds.some((x) => ZH_OLD.test(String(x))), 'zhonghua 老 4 位原号仍在（未被重编号）');
  const zhFamIds = Object.values(zh.families).map((f) => f.gramps_id);
  assert.ok(
    zhFamIds.length > 0 && zhFamIds.every((x) => /^F\d{4}$/.test(String(x)) || /^F\d{6}$/.test(String(x))),
    'zhonghua 家族编号形态只允许老 4 位原号或迁移后 6 位全局号',
  );
  assert.ok(zhFamIds.some((x) => /^F\d{4}$/.test(String(x))), 'zhonghua 老 4 位家族原号仍在（未被重编号）');
  assert.ok(!Object.values(zh.people).some((p) => p.legacy_gramps_id), 'zhonghua 节点不写 legacy（原号未变）');

  // 计数器初值 = max(zhonghua)+1
  // 口径与 scripts/migrate-global-ids.mjs 的 computeBaseline 一致：取 zhonghua **全部**编号的最大值
  // （含迁移后新建节点铸的 6 位全局号），不能只取 4 位老号，否则起点算错。
  const seq = JSON.parse(fs.readFileSync(path.join(copy, 'collections', 'jiazu_id_seq.json'), 'utf8'));
  const zhMax = Math.max(...zhIds.map((x) => parseInt(String(x).replace(/\D/g, ''), 10)));
  const mapping = JSON.parse(fs.readFileSync(path.join(copy, 'id-migration.json'), 'utf8'));
  // zhonghua 不出现在重编号映射表里（原号一个都没被改）：与具体节点无关的强不变量
  assert.ok(!mapping.zhonghua || Object.keys(mapping.zhonghua).length === 0, 'zhonghua 不进入重编号映射表（原号保留）');
  const firstNew = Math.min(
    ...Object.entries(mapping)
      .flatMap(([, m]) => Object.entries(m))
      .filter(([, next]) => String(next).startsWith('I'))
      .map(([, next]) => parseInt(String(next).replace(/\D/g, ''), 10)),
  );
  assert.equal(firstNew, zhMax + 1, '重编号起点 = max(zhonghua 编号) + 1');
  // 总谱编号域与重编号号段不相交：zhonghua **全部**人的编号都小于重编号起点。
  // 同样是形状/区间断言（覆盖全部节点，节点增删不影响）；若 zhonghua 被一并重编号，此条必红。
  assert.ok(
    zhIds.every((x) => parseInt(String(x).replace(/\D/g, ''), 10) < firstNew),
    'zhonghua 全部编号都落在重编号起点之前（重编号不与总谱撞号）',
  );
  assert.ok(seq.person.next > firstNew, '计数器已推进到已分配号之后');

  // 映射表形状 + 重编号节点带 legacy_gramps_id（树 JSON 与详情文档各一份）
  const treeId = Object.keys(mapping).find((t) => t !== 'zhonghua');
  const [oldId, newId] = Object.entries(mapping[treeId])[0];
  const tree = JSON.parse(fs.readFileSync(path.join(copy, 'trees', `${treeId}.json`), 'utf8'));
  const node = Object.values(tree.people).find((p) => p.gramps_id === newId);
  assert.ok(node, `映射表 ${treeId} ${oldId} → ${newId} 与树内一致`);
  assert.equal(node.legacy_gramps_id, oldId);
  const detail = JSON.parse(fs.readFileSync(path.join(copy, 'details', `${treeId}:${node.handle}.json`), 'utf8'));
  assert.equal(detail.legacy_gramps_id, oldId, '详情文档写入 legacy_gramps_id（只读留痕）');
  assert.equal(detail.gramps_id, newId, '详情展示冗余编号同步');

  // 幂等重放：第二次零改动（逐字节：文件 md5 全等）
  const snap = () => {
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else files.push(`${path.relative(copy, p)}:${md5(p)}`);
      }
    };
    walk(copy);
    return files.sort().join('\n');
  };
  const snap1 = snap();
  const out2 = run();
  assert.match(out2, /总改动：0 处（幂等重放：零改动）/);
  assert.match(out2, /重编号：人 0 \/ 家族 0/);
  assert.equal(snap(), snap1, '二次运行后所有文件 md5 逐字节一致（幂等）');

  fs.rmSync(copy, { recursive: true, force: true });
});

// ---- 收尾：真源保护 ----

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/ 的 md5 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
  const treesNow = fs.readdirSync(REAL_TREES);
  assert.deepEqual(treesNow.sort(), [...realTreesBaseline.keys()].sort(), '真实树目录文件数/文件名未变');
  for (const f of treesNow) assert.equal(md5(path.join(REAL_TREES, f)), realTreesBaseline.get(f), `真实树 ${f} 被改动了`);
  const detailsNow = fs.readdirSync(REAL_DETAILS);
  assert.deepEqual(detailsNow.sort(), [...realDetailsBaseline.keys()].sort());
  for (const f of detailsNow) assert.equal(md5(path.join(REAL_DETAILS, f)), realDetailsBaseline.get(f), `真实详情 ${f} 被改动了`);
  assert.equal(store.PATHS.sandbox, true, '砂箱护栏必须在位');
});
