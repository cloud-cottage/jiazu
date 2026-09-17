/**
 * meta 写入硬护栏回归测试（P0）
 *
 * 事故复盘（本次修复的直接原因）：store.js 的 saveMeta() 在 local 模式写死
 * `REPO/config/tree-meta.json`，完全忽略 COMPAT_META_FILE —— 于是一轮 `npm test`
 * 就把 founder-attach 夹具的 18 个条目（mt_x / mc_x 系列）覆盖进真源，真实 6 棵树条目丢失。
 *
 * 本文件断言：
 *  ① 沙箱（COMPAT_OUT_DIR / COMPAT_META_FILE / node --test）下 meta 读写根一律是副本；
 *  ② 跑完真实写路径（saveMeta + 路由 PUT /tree-meta + 祖谱认祖世本 clan.attachClanToMaster
 *     + 树/详情/集合写入）后，真实 config/tree-meta.json 与 migrate-output/ 的**内容与 md5 逐字节未变**；
 *  ③ 子进程验证「漏配副本」或「把 COMPAT_META_FILE 指向真源」时**直接抛错**（宁可测试红，也不污染真源）；
 *  ④ 静态护栏：唯一允许出现 tree-meta 写路径的模块是 store.js。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/meta-guard.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const LIB = HERE;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-meta-guard-'));

process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaRaw = fs.readFileSync(REAL_META, 'utf8');
const realMetaMd5 = md5(REAL_META);
const realTreesBaseline = new Map(
  fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]),
);
const realCollectionsBaseline = new Map(
  fs.existsSync(path.join(REAL_OUT, 'collections'))
    ? fs
        .readdirSync(path.join(REAL_OUT, 'collections'))
        .map((f) => [f, md5(path.join(REAL_OUT, 'collections', f))])
    : [],
);

const store = await import('./store.js');
const clan = await import('./clan.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const metaFile = path.join(TMP, 'tree-meta.json');
function writeMetaCopy(obj) {
  fs.writeFileSync(metaFile, JSON.stringify(obj, null, 2) + '\n');
}
function readMetaCopy() {
  return JSON.parse(fs.readFileSync(metaFile, 'utf8'));
}
function writeTree(tree) {
  const p = path.join(TMP, 'trees', `${tree.tree_id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tree, null, 2));
}
function writeDetail(doc) {
  const p = path.join(TMP, 'details', `${doc._id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(doc, null, 2));
}

/** 与事故现场同形的夹具（mt_* 家族树 + mc_* 祖谱） */
function accidentFixture() {
  const trees = { zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, display_title: '中华世本' } };
  for (const tag of ['attach', 'once', 'n1', 'n2']) {
    trees[`mt_${tag}`] = { tree_id: `mt_${tag}`, kind: 'family', display_title: `季氏测试家族 ${tag}` };
  }
  trees.mc_clan = { tree_id: 'mc_clan', kind: 'clan', surname: '季', display_title: '季氏祖谱' };
  return { _schema: '1.1', trees };
}

writeMetaCopy(accidentFixture());

// ---- ① 沙箱判定与路径隔离 ----

test('沙箱判定：meta 读写根指向 /tmp 副本，绝不等于真实 config/tree-meta.json', () => {
  assert.equal(store.PATHS.sandbox, true, '设了 COMPAT_OUT_DIR / COMPAT_META_FILE → 必须判为沙箱');
  assert.equal(store.PATHS.sandboxByEnv, true);
  assert.equal(
    path.resolve(store.PATHS.metaFile),
    path.resolve(metaFile),
    '沙箱下 meta 根 = COMPAT_META_FILE',
  );
  assert.notEqual(
    path.resolve(store.PATHS.metaFile),
    path.resolve(store.PATHS.realMetaFile),
    '沙箱下 meta 根不得等于真源',
  );
  assert.equal(path.resolve(store.PATHS.realMetaFile), path.resolve(REAL_META));
  assert.equal(path.resolve(store.PATHS.out), path.resolve(TMP), '数据根也在副本');
});

// ---- ② 真实写路径跑一轮，真源必须逐字节未变 ----

test('saveMeta 重定向：事故夹具写进副本，真实 meta 内容与 md5 不变', async () => {
  const fixture = accidentFixture();
  fixture.trees.mt_new = { tree_id: 'mt_new', kind: 'family', display_title: '新增夹具' };
  await store.saveMeta(fixture);

  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
  assert.equal(fs.readFileSync(REAL_META, 'utf8'), realMetaRaw, '真实 meta 内容逐字节必须不变');
  assert.ok(
    !fs.readFileSync(REAL_META, 'utf8').includes('mt_new'),
    '测试夹具条目绝不能出现在真源里',
  );

  const copy = readMetaCopy();
  assert.ok(copy.trees.mt_new, '副本应收到写入');
  assert.deepEqual(
    Object.keys(copy.trees).sort(),
    Object.keys(fixture.trees).sort(),
    '副本内容 = 本次写入的 meta',
  );
});

test('路由 PUT /tree-meta（chief_editor）：改的是副本，真源照旧', async () => {
  const CHIEF = '16600000901';
  fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
  fs.writeFileSync(
    path.join(TMP, 'collections', 'jiazu_users.json'),
    JSON.stringify({ [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' } }),
  );
  const token = signJwt({ sub: CHIEF, phone: CHIEF, role: 'chief_editor' }, 3600);
  const res = await handleRequest({
    path: '/tree-meta',
    httpMethod: 'PUT',
    headers: { authorization: `Bearer ${token}`, 'X-Tree-Id': 'zhonghua', 'Content-Type': 'application/json' },
    body: JSON.stringify({ tree_id: 'zhonghua', display_title: '中华世本（护栏测试）' }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(readMetaCopy().trees.zhonghua.display_title, '中华世本（护栏测试）', '副本已更新');
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
});

test('祖谱认祖世本（clan.attachClanToMaster，真实写路径）→ 只写副本，真源与 migrate-output 不变', async () => {
  // 总谱副本：mRoot（原始）/ mX（第 12 世）+ 世系链
  writeTree({
    _schema: '1.0',
    tree_id: 'zhonghua',
    founder_gramps_id: 'I0001',
    version: 7,
    people: {
      mRoot: {
        handle: 'mRoot', gramps_id: 'I0001', name: '风伏羲', surname: '风', given: '伏羲', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: ['mf1'],
      },
      mX: {
        handle: 'mX', gramps_id: 'I0100', name: '季始祖公', surname: '季', given: '始祖公', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'mf1', spouse_families: ['mf2'],
      },
      mChild: {
        handle: 'mChild', gramps_id: 'I0101', name: '季二世', surname: '季', given: '二世', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: 'mf2', spouse_families: [],
      },
    },
    families: {
      mf1: { handle: 'mf1', gramps_id: 'F0001', father_handle: 'mRoot', mother_handle: '', child_handles: ['mX'] },
      mf2: { handle: 'mf2', gramps_id: 'F0002', father_handle: 'mX', mother_handle: '', child_handles: ['mChild'] },
    },
  });
  writeDetail({ _id: 'zhonghua:mRoot', tree_id: 'zhonghua', handle: 'mRoot', name: '风伏羲', events: [], attributes: [{ key: 'external_chain_gen', value: '0', type: 'external_chain_gen' }] });
  writeDetail({ _id: 'zhonghua:mX', tree_id: 'zhonghua', handle: 'mX', name: '季始祖公', events: [], attributes: [{ key: 'external_chain_gen', value: '12', type: 'external_chain_gen' }] });
  const CLAN_ID = 'mc_guard';
  writeTree({
    _schema: '1.0',
    tree_id: CLAN_ID,
    kind: 'clan',
    founder_gramps_id: 'I0001',
    version: 1,
    people: {
      own_ji: {
        handle: 'own_ji', gramps_id: 'I0002', name: '季花', surname: '季', given: '花', gender: 'M',
        birth_date: '', death_date: '', birth_place: '', death_place: '', parent_family: '', spouse_families: [],
        external_tree: '', external_person_handle: '', external_link_type: '',
      },
    },
    families: {},
  });
  const meta = readMetaCopy();
  meta.trees[CLAN_ID] = {
    tree_id: CLAN_ID, kind: 'clan', path_alias: `/z/${CLAN_ID}`, surname: '季', surname_char: '季',
    display_title: '季氏祖谱（护栏测试）', founder_handle: 'own_ji', enable_custom_domain: false,
  };
  await store.saveMeta(meta); // 经 store 写 → 缓存与副本同步（同进程内 attachClanToMaster 读的就是它）

  const r = await clan.attachClanToMaster({
    treeId: CLAN_ID,
    masterTreeId: 'zhonghua',
    masterHandle: 'mX',
    ownRootHandle: 'own_ji',
    requestedBy: '16600000901',
  });
  assert.equal(r.ok, true);
  assert.ok(r.mirror_count >= 1, '祖谱顶端应写入世本镜像段');

  // 副本（meta + 树 + 详情）已更新；真源一步都没动
  assert.equal(readMetaCopy().trees[CLAN_ID].master_handle, 'mX', '副本 meta 记录认祖结果');
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
  for (const [f, h] of realTreesBaseline) {
    assert.equal(md5(path.join(REAL_TREES, f)), h, `真实树 ${f} 被改动了`);
  }
  for (const [f, h] of realCollectionsBaseline) {
    assert.equal(md5(path.join(REAL_OUT, 'collections', f)), h, `真实集合 ${f} 被改动了`);
  }
});

test('树 / 详情 / 集合写入也都落在副本（migrate-output 一个字节不动）', async () => {
  const TREE_ID = 'mt_guard_write';
  writeMetaCopy({ ...readMetaCopy(), trees: { ...readMetaCopy().trees, [TREE_ID]: { tree_id: TREE_ID, kind: 'family' } } });
  await store.createTreeFile({
    _schema: '1.0',
    tree_id: TREE_ID,
    version: 1,
    people: { f: { handle: 'f', gramps_id: 'I0001', name: '护栏', surname: '季', gender: 'M' } },
    families: {},
  });
  await store.saveDetail({ _id: `${TREE_ID}:f`, tree_id: TREE_ID, handle: 'f', name: '护栏', events: [] });
  await store.colSet('jiazu_guard_probe', 'p1', { _id: 'p1', note: '护栏测试集合' });

  assert.ok(fs.existsSync(path.join(TMP, 'trees', `${TREE_ID}.json`)), '树写进副本');
  assert.ok(fs.existsSync(path.join(TMP, 'collections', 'jiazu_guard_probe.json')), '集合写进副本');
  assert.ok(!fs.existsSync(path.join(REAL_TREES, `${TREE_ID}.json`)), '真实 migrate-output 不得出现该树');
  assert.ok(
    !fs.existsSync(path.join(REAL_OUT, 'collections', 'jiazu_guard_probe.json')),
    '真实 migrate-output 不得出现该集合',
  );
});

// ---- ③ 子进程：漏配 / 错配时必须抛错 ----

/** 在子进程里跑一段 ESM 代码（工作目录 = 仓库根，便于解析相对路径） */
function runChild(code, env) {
  const url = `file://${path.join(HERE, 'store.js')}`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', code.replace(/__STORE__/g, url)], {
    cwd: REPO,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
    encoding: 'utf8',
  });
}

const CHILD_TRY_SAVE_META = `
  const s = await import('__STORE__');
  try {
    await s.saveMeta({ trees: { mt_child: { tree_id: 'mt_child', kind: 'family' } } });
    console.log('RESULT=WROTE');
  } catch (e) {
    console.log('RESULT=GUARD:' + e.message);
  }
`;

test('子进程：node --test 下漏配副本 → saveMeta 抛错，真源不变', () => {
  const out = runChild(CHILD_TRY_SAVE_META, { COMPAT_SOURCE: 'local', NODE_TEST_CONTEXT: 'child-v8' });
  assert.match(out, /RESULT=GUARD:.*沙箱模式/, `漏配副本必须抛错，实际输出：${out}`);
  assert.ok(!out.includes('RESULT=WROTE'), '漏配副本时绝不允许写入');
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
});

test('子进程：node --test 下漏配副本 → 写真实 migrate-output 的树同样抛错', () => {
  const out = runChild(
    `
    const s = await import('__STORE__');
    try {
      await s.saveTree({ tree_id: 'zhonghua', version: 1, people: {}, families: {} });
      console.log('RESULT=WROTE');
    } catch (e) {
      console.log('RESULT=GUARD:' + e.message);
    }
  `,
    { COMPAT_SOURCE: 'local', NODE_TEST_CONTEXT: 'child-v8' },
  );
  assert.match(out, /RESULT=GUARD:.*沙箱模式/, `漏配副本必须抛错，实际输出：${out}`);
  assert.equal(md5(path.join(REAL_TREES, 'zhonghua.json')), realTreesBaseline.get('zhonghua.json'));
});

test('子进程：COMPAT_META_FILE 被指向真源 → 硬错误（不写）', () => {
  const out = runChild(CHILD_TRY_SAVE_META, {
    COMPAT_SOURCE: 'local',
    COMPAT_OUT_DIR: TMP,
    COMPAT_META_FILE: REAL_META,
  });
  assert.match(out, /RESULT=GUARD:.*沙箱模式/, `指向真源必须抛错，实际输出：${out}`);
  assert.ok(!out.includes('RESULT=WROTE'));
  assert.equal(fs.readFileSync(REAL_META, 'utf8'), realMetaRaw, '真实 meta 内容逐字节必须不变');
});

test('子进程：正常副本闭环 —— saveMeta 落副本且 getMeta 读回（真源不变）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-meta-guard-child-'));
  const childMeta = path.join(dir, 'tree-meta.json');
  const out = runChild(
    `
    const s = await import('__STORE__');
    await s.saveMeta({ trees: { mc_child: { tree_id: 'mc_child', kind: 'clan' } } });
    const back = await s.getMeta();
    console.log('RESULT=' + JSON.stringify({ file: s.PATHS.metaFile, keys: Object.keys(back.trees) }));
  `,
    { COMPAT_SOURCE: 'local', COMPAT_OUT_DIR: dir, COMPAT_META_FILE: childMeta },
  );
  const payload = JSON.parse(out.trim().split('RESULT=')[1]);
  assert.equal(path.resolve(payload.file), path.resolve(childMeta));
  assert.deepEqual(payload.keys, ['mc_child'], '写完立刻读回，走的是副本');
  assert.ok(fs.existsSync(childMeta), '副本文件已落盘');
  assert.equal(md5(REAL_META), realMetaMd5, '真实 config/tree-meta.json 被改动了');
});

// ---- ④ 静态护栏 ----

test('静态护栏：唯一允许写 tree-meta 的模块是 store.js', () => {
  const files = [
    ...fs.readdirSync(LIB).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js')).map((f) => path.join(LIB, f)),
    path.join(LIB, '..', 'index.js'),
  ];
  const offenders = [];
  for (const p of files) {
    const src = fs.readFileSync(p, 'utf8');
    const mentionsMeta = /tree-meta|REAL_META_FILE|META_FILE/.test(src);
    const writes = /writeFileSync|writeFile\(/.test(src);
    if (mentionsMeta && writes && path.basename(p) !== 'store.js') offenders.push(path.basename(p));
  }
  assert.deepEqual(offenders, [], `这些模块绕过了 store.saveMeta 直接写 meta：${offenders.join(', ')}`);
});

test('静态护栏：凡直接跑路由/写路径的测试文件都必须把数据根指到副本', () => {
  const files = fs.readdirSync(LIB).filter((f) => f.endsWith('.test.js'));
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(LIB, f), 'utf8');
    const drivesWrites = /from '\.\.\/index\.js'|from '\.\/store\.js'|handleRequest\(/.test(src);
    if (!drivesWrites) continue;
    if (!/COMPAT_OUT_DIR|COMPAT_META_FILE/.test(src)) offenders.push(f);
  }
  assert.deepEqual(offenders, [], `这些测试文件未设置 COMPAT_OUT_DIR / COMPAT_META_FILE：${offenders.join(', ')}`);
});

// ---- 收尾：整轮跑完真源必须一模一样 ----

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/ 的 md5 逐字节一致', () => {
  assert.equal(fs.readFileSync(REAL_META, 'utf8'), realMetaRaw, 'config/tree-meta.json 被改动了');
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 的 md5 变了');
  const now = fs.readdirSync(REAL_TREES);
  assert.deepEqual(now.sort(), [...realTreesBaseline.keys()].sort(), '真实树目录文件名/数量变了');
  for (const f of now) {
    assert.equal(md5(path.join(REAL_TREES, f)), realTreesBaseline.get(f), `真实树 ${f} 被改动了`);
  }
  for (const [f, h] of realCollectionsBaseline) {
    assert.equal(md5(path.join(REAL_OUT, 'collections', f)), h, `真实集合 ${f} 被改动了`);
  }
});
