/**
 * 兰帖物品域单测（P4 第一段）— lib/economy-ledger.js 的兰帖残页 + 兰帖（纯模块，不含路由）
 * 规格：docs/economy.spec.md §15-1–§15-6（物品域扩展）/ §4-1 存储契约 / §4-6 枚举 /
 *   §5-1 碎片自动合成（兰帖同构）/ §5-2 FIFO + 整单拒绝 / §5-4 惰性结算 / §5-7 唯一写入路径；
 *   冻结口径 R-1 / R-2 / R-3 / R-6 / R-7 / R-8 / R-9 / R-10 / R-11 / R-12 / R-13（Zang 裁定 v2，Kevin 已裁 R-6）。
 *
 * 覆盖：
 *  ① 新增常量取值（99 / 100 / 100 / 99）与**既有常量一字未改**（365 / 365 / 9 / 10 / 10）
 *  ② 兰帖残页 99 不合成、99 + 1 → **立即合成 1 枚（100 片）+ 碎片归零**，无「碎片 100 待合成」中间态
 *  ③ 余数分支：+150 → 1 枚 + 余 50；99 + 150 → 2 枚 + 余 49；脏数据 250 → 2 枚 + 余 50（sweep 收口）
 *  ④ 合成流水 `scroll_synth`：`delta` 同时含 `scroll_fragments` 与 `scrolls` 两个键、中文 desc
 *  ⑤ 兰帖永久：`sweep` 在任意远未来**都不剔除**兰帖批次、不写 expire 流水（R-8）
 *  ⑥ 兰帖脏数据收口：qty 非法 / NaN / 负数 / 0 / 空对象 / null → 归 0 就地剔除，不写流水，无 null / NaN
 *  ⑦ 批次构造纪律（R-3）：`expires_at` 缺省 → 抛错；传有期限值 → 抛错；显式 `null` → 永久
 *  ⑧ 分解正对照（R-7）：1 枚 → 返 99 碎片，**不会立即回环成新枚**；多枚分解的超阈值分支正确回环
 *  ⑨ 分解流水 `scroll_decompose`（一条）+ 不足 → 409 整单拒绝（一片不扣 / 不返还 / 无流水）
 *  ⑩ summarize 新增 6 个出参逐字与取值 + **既有出参键集与取值一字未改**（含玉归属双口径）
 *  ⑪ R-1：源码中**不存在** `bamboo_fragments`；`Tx.type` 白名单 19 项既有 + 2 项新增，未知类型仍抛错
 *  ⑫ 唯一写入路径（R-12）：`withAssets` mutator 内写兰帖，回读一致；mutator 抛错 → 一字节不回写
 *  ⑬ 既有籽域回归：`addFragments` 9 / 10 / 10 口径与 sweep 剔除过期籽批次均未受影响
 *  ⑭ 真源未变：`config/tree-meta.json` 与 `migrate-output/`（trees + details + collections）md5 逐字节一致
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本；文末 md5 断言真源未变
 * （照 assets.test.js / economy-spirit.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/scroll-items.test.js
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
const LEDGER_SRC = path.join(HERE, 'economy-ledger.js');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-scroll-items-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realMetaMd5 = md5(REAL_META);
const realMetaRaw = fs.readFileSync(REAL_META, 'utf8');
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

const el = await import('./economy-ledger.js');

const DAY = 86400000;
const T0 = new Date('2026-09-25T00:00:00.000Z');
const isoAt = (days) => new Date(T0.getTime() + days * DAY).toISOString();

/** 空资产记录副本（与 blankUser 同形的独立对象；每用例独占，绝不跨用例复用） */
const newUser = () => ({
  fragments: 0,
  scroll_fragments: 0,
  seeds: [],
  bamboos: [],
  jades: [],
  scrolls: [],
  txs: [],
  signin_date: '',
});

/** 造 1 枚成品兰帖（= 100 片，永久；走模块构造函数，绝不手搓批次） */
const mkScroll = (user, qty = 100, source = 'admin', now = T0) =>
  el.addLot(user, 'scroll', qty, { expires_at: null, source, now });

const txsOf = (user, type) => (user.txs || []).filter((t) => t.type === type);
const hasBadNumber = (v) =>
  typeof v === 'number' && (!Number.isFinite(v) || Number.isNaN(v));

// ==================== ① 常量 ====================

test('常量：兰帖域四项取值（99 / 100 / 100 / 99）与既有常量一字未改', () => {
  assert.equal(el.SCROLL_FRAGMENT_CAP, 99, '兰帖残页上限 = 99');
  assert.equal(el.SCROLL_FRAGMENT_SYNTH_THRESHOLD, 100, '兰帖残页合成阈值 = 100');
  assert.equal(el.SCROLL_PIECES_PER_SCROLL, 100, '每枚成品兰帖 = 100 片');
  assert.equal(el.SCROLL_DECOMPOSE_REFUND, 99, '分解返还 = 99 碎片（留 1 片损耗）');
  assert.equal(el.SOURCE_FRIEND_REWARD, 'friend_reward', '好友奖励来源字面');
  assert.equal(el.SCROLL_SOURCE_SYNTH, 'scroll_synth', '合成批次来源字面');

  // 既有常量（R-9 明令不得改动取值）
  assert.equal(el.SEED_TTL_DAYS, 365);
  assert.equal(el.BAMBOO_TTL_DAYS, 365);
  assert.equal(el.FRAGMENT_CAP, 9);
  assert.equal(el.FRAGMENT_SYNTH_THRESHOLD, 10);
  assert.equal(el.FRAGMENT_PER_SEED, 10);
  assert.equal(el.EXPIRING_DEFAULT_DAYS, 30);
});

// ==================== ②③④ 碎片累加 + 自动合成 ====================

test('兰帖残页：99 不合成；99 + 1 → 立即合成 1 枚（100 片）+ 碎片归零（无中间态）', () => {
  const u = newUser();
  assert.equal(el.addScrollFragments(u, 99, T0).synthesized, 0, '99 不合成');
  assert.equal(u.scroll_fragments, 99);
  assert.equal(u.scrolls.length, 0);
  assert.equal(txsOf(u, 'scroll_synth').length, 0, '未合成 → 无流水');

  const r = el.addScrollFragments(u, 1, T0);
  assert.equal(r.synthesized, 1, '99 + 1 立即合成 1 枚');
  assert.equal(r.scroll_fragments, 0, '碎片取余 = 0');
  assert.equal(u.scroll_fragments, 0, '同一份 user 记录内已归零（不存在「碎片 100 待合成」中间态）');
  assert.equal(u.scrolls.length, 1, '同一写入内兰帖已生成');
  assert.equal(el.sumLots(u.scrolls), 100, '1 枚 = 100 片');
  assert.equal(u.scrolls[0].qty, 100);
  assert.equal(u.scrolls[0].expires_at, null, '恒永久');
  assert.equal(u.scrolls[0].source, el.SCROLL_SOURCE_SYNTH);
  assert.ok(/^sc_/.test(u.scrolls[0].id), `兰帖批次 id 前缀：${u.scrolls[0].id}`);
  assert.ok(u.scroll_fragments < el.SCROLL_FRAGMENT_SYNTH_THRESHOLD, '不变量 0 ≤ scroll_fragments < 100');
});

test('兰帖残页余数分支：+150 → 1 枚 + 余 50；99 + 150 → 2 枚 + 余 49', () => {
  const a = newUser();
  const ra = el.addScrollFragments(a, 150, T0);
  assert.equal(ra.synthesized, 1);
  assert.equal(a.scroll_fragments, 50);
  assert.equal(el.sumLots(a.scrolls), 100);
  assert.equal(ra.scroll_lots.length, 1);

  const b = newUser();
  el.addScrollFragments(b, 99, T0);
  const rb = el.addScrollFragments(b, 150, T0); // 99 + 150 = 249
  assert.equal(rb.synthesized, 2, '249 → 合成 2 枚');
  assert.equal(b.scroll_fragments, 49, '余数 49');
  assert.equal(el.sumLots(b.scrolls), 200);
  assert.equal(b.scrolls.length, 2, '每枚一个新批次');

  const c = newUser();
  c.scroll_fragments = 250; // 脏数据越界 → sweep 收口立即合成，不落中间态
  el.sweep(c, T0);
  assert.equal(c.scroll_fragments, 50);
  assert.equal(el.sumLots(c.scrolls), 200);
  assert.equal(txsOf(c, 'scroll_synth').length, 1, '一次 sweep 只写一条合成流水');
});

test('合成流水 scroll_synth：一条，delta 同时含 scroll_fragments 与 scrolls，中文 desc', () => {
  const u = newUser();
  el.addScrollFragments(u, 249, T0);
  const synths = txsOf(u, 'scroll_synth');
  assert.equal(synths.length, 1, '合成与碎片累加同一写入、只写一条流水');
  const t = synths[0];
  assert.deepEqual(Object.keys(t.delta).sort(), ['scroll_fragments', 'scrolls'], 'delta 恰含两个键');
  assert.equal(t.delta.scroll_fragments, -200, '碎片按枚数扣减');
  assert.equal(t.delta.scrolls, 200, '兰帖按片入账');
  assert.equal(t.ts, T0.toISOString());
  assert.ok(/兰帖残页满 100 自动合成 2 枚兰帖/.test(t.desc), `desc 中文说明：${t.desc}`);
  assert.ok(/^tx_/.test(t.id));
});

// ==================== ⑤ 永久性（sweep 不剔除） ====================

test('兰帖永久：sweep 无论 now 推多远都不剔除兰帖批次、不写 expire 流水', () => {
  const u = newUser();
  mkScroll(u, 100);
  mkScroll(u, 37, el.SOURCE_FRIEND_REWARD);
  el.addLot(u, 'seed', 2, { now: T0 }); // 对照：籽会被剔除
  const before = JSON.stringify(u.scrolls);

  const removed = el.sweep(u, new Date('9999-12-31T23:59:59.000Z'));
  assert.equal(u.scrolls.length, 2, '兰帖一律保留');
  assert.equal(JSON.stringify(u.scrolls), before, '兰帖批次内容逐字节未变');
  assert.equal(el.sumLots(u.scrolls), 137);
  assert.equal(removed.filter((r) => r.asset === 'scroll').length, 0, 'removed 不含兰帖');
  assert.equal(txsOf(u, 'expire').length, 1, '只有籽那一条 expire（兰帖无 expire）');
  assert.equal(txsOf(u, 'expire')[0].delta.seeds, -2);

  // 再推一次同一 far-future now：仍无变化（幂等）
  const removed2 = el.sweep(u, new Date('9999-12-31T23:59:59.000Z'));
  assert.equal(removed2.length, 0);
  assert.equal(u.scrolls.length, 2);

  // 兰帖 expires_at 缺失 → 也恒不过期（永久判定不依赖字段值）
  const v = newUser();
  el.addLot(v, 'scroll', 100, { expires_at: null, source: 'admin', now: T0 });
  delete v.scrolls[0].expires_at;
  el.sweep(v, new Date('9999-12-31T23:59:59.000Z'));
  assert.equal(v.scrolls.length, 1, '缺 expires_at 的兰帖批次同样不被剔除');
});

// ==================== ⑥ 脏数据收口 ====================

test('兰帖脏数据收口：qty 非法 / NaN / 负数 / 0 / 空对象 / null 一律归 0 就地剔除，不写流水', () => {
  const u = newUser();
  u.scrolls = [
    { id: 'sc_a', qty: 'abc', expires_at: null },
    { id: 'sc_b', qty: NaN, expires_at: null },
    { id: 'sc_c', qty: -5, expires_at: null },
    { id: 'sc_d', qty: 0, expires_at: null },
    { id: 'sc_e', expires_at: null },
    {},
    null,
    { id: 'sc_ok', qty: 120.9, expires_at: null, source: 'admin' },
  ];
  const removed = el.sweep(u, T0);
  assert.deepEqual(u.scrolls.map((l) => l.id), ['sc_ok'], '只剩合法批次');
  assert.equal(u.scrolls[0].qty, 120, '非法小数向下取整为整数');
  assert.equal(removed.length, 0, '脏数据剔除不写流水、不进 removed');
  assert.equal(txsOf(u, 'expire').length, 0, '无 expire 流水');
  assert.equal(txsOf(u, 'scroll_synth').length, 0);
  for (const t of u.txs) for (const v of Object.values(t.delta)) assert.ok(!hasBadNumber(v), 'delta 无 NaN');

  // removed 记录与 expire 流水的 delta 绝不出现 null / NaN
  const w = newUser();
  el.addLot(w, 'seed', 3, { now: T0 });
  el.addLot(w, 'bamboo', 5, { now: T0 });
  w.scrolls = [{ id: 'sc_bad', qty: null }, { id: 'sc_bad2', qty: undefined }];
  const rem = el.sweep(w, new Date(T0.getTime() + 400 * DAY));
  assert.equal(rem.length, 2, '籽 + 竹片各一条');
  for (const r of rem) {
    assert.ok(Number.isFinite(r.qty) && r.qty > 0, `removed qty 合法：${JSON.stringify(r)}`);
    assert.notEqual(r.qty, null);
  }
  assert.equal(w.scrolls.length, 0, 'null / undefined qty 的兰帖批次剔除');
  for (const t of w.txs) {
    for (const v of Object.values(t.delta)) assert.ok(v !== null && !Number.isNaN(v), '流水 delta 无 null / NaN');
  }
  assert.equal(rem.filter((r) => r.asset === 'scroll').length, 0, '兰帖脏数据不进 removed');
});

// ==================== ⑦ 批次构造纪律（R-3） ====================

test('兰帖批次：expires_at 必须显式传 null —— 缺省抛错、传有期限值抛错（无「默认永久」）', () => {
  const u = newUser();
  assert.throws(() => el.addLot(u, 'scroll', 100, { source: 'admin', now: T0 }), /必须显式指定 expires_at/);
  assert.throws(() => el.addLot(u, 'scroll', 100, { expires_at: undefined, now: T0 }), /必须显式指定 expires_at/);
  assert.throws(() => el.addLot(u, 'scroll', 100, { expires_at: isoAt(365), now: T0 }), /恒为 null/);
  assert.throws(() => el.addLot(u, 'scroll', 100, { expires_at: '', now: T0 }), /恒为 null/);
  assert.equal(u.scrolls.length, 0, '抛错时一字节不落');

  const lot = el.addLot(u, 'scroll', 100, { expires_at: null, source: el.SOURCE_FRIEND_REWARD, now: T0 });
  assert.equal(lot.expires_at, null);
  assert.equal(lot.qty, 100);
  assert.equal(lot.source, 'friend_reward');
  assert.equal(lot.created_at, T0.toISOString());
  assert.equal(u.scrolls.length, 1);

  // 未知资产类型仍抛错（既有行为）
  assert.throws(() => el.addLot(u, 'bamboo_fragments', 1, { now: T0 }), /未知资产类型/);
});

// ==================== ⑧⑨ 分解 ====================

test('分解正对照（R-7）：1 枚 → 返 99 碎片，且不会立即回环成新枚', () => {
  const u = newUser();
  el.addScrollFragments(u, 100, T0); // 1 枚（100 片）+ 碎片 0
  assert.equal(el.sumLots(u.scrolls), 100);

  const r = el.decomposeScroll(u, 1, T0);
  assert.equal(r.decomposed, 1);
  assert.equal(r.pieces, 100);
  assert.equal(r.refunded, 99, '返还 99（留 1 片损耗）');
  assert.equal(r.synthesized, 0, '**不**立即回环成新枚');
  assert.equal(el.sumLots(u.scrolls), 0, '兰帖已扣尽（qty=0 批次留待 sweep）');
  assert.equal(u.scroll_fragments, 99, '碎片态 99，未满 100');
  assert.ok(u.scroll_fragments < el.SCROLL_FRAGMENT_SYNTH_THRESHOLD);
  assert.equal(r.taken.length, 1);
  assert.equal(r.taken[0].qty, 100);

  el.sweep(u, T0);
  assert.equal(u.scrolls.length, 0, 'qty=0 批次由 sweep 移除（§5-2-3）');
  assert.equal(u.scroll_fragments, 99, 'sweep 不改变碎片');
});

test('分解多枚：超阈值的返还按同一写入自动合成（回环仅发生在碎片确实满 100 时）', () => {
  const u = newUser();
  mkScroll(u, 300); // 3 枚
  const r = el.decomposeScroll(u, 2, T0); // 200 片 → 返 198
  assert.equal(r.refunded, 198);
  assert.equal(r.synthesized, 1, '198 满 100 → 现场合成 1 枚');
  assert.equal(u.scroll_fragments, 98);
  assert.equal(el.sumLots(u.scrolls), 200, '剩 100 片 + 新合成 100 片');
  assert.equal(u.scrolls.length, 2);
});

test('分解流水 scroll_decompose：合成 / 分解各写一条对应流水；不足 → 409 整单拒绝', () => {
  const u = newUser();
  el.addScrollFragments(u, 100, T0); // 写 1 条 scroll_synth
  const before = JSON.stringify(u);
  const r = el.decomposeScroll(u, 1, T0);
  assert.equal(r.synthesized, 0);
  const dec = txsOf(u, 'scroll_decompose');
  assert.equal(dec.length, 1, '分解一条流水');
  assert.deepEqual(dec[0].delta, { scroll_fragments: 99, scrolls: -100 });
  assert.equal(dec[0].ts, T0.toISOString());
  assert.ok(/分解 1 枚兰帖（100 片），返还 99 个兰帖残页/.test(dec[0].desc), dec[0].desc);
  assert.equal(txsOf(u, 'scroll_synth').length, 1, '合成流水仍是 1 条（无额外）');

  // 数量不足 → 409 整单拒绝（一片不扣、碎片不变、无流水）
  const v = newUser();
  mkScroll(v, 99);
  el.addScrollFragments(v, 0, T0);
  const snap = JSON.stringify(v.scrolls);
  const fb = JSON.stringify(v.txs);
  let err;
  try {
    el.decomposeScroll(v, 1, T0);
  } catch (e) {
    err = e;
  }
  assert.ok(err, '必须抛错');
  assert.equal(err.status, 409);
  assert.equal(err.code, el.ASSET_INSUFFICIENT);
  assert.equal(err.need, 100);
  assert.equal(err.current, 99);
  assert.equal(err.unit, 'scroll');
  assert.ok(/资产不足，需 100 片兰帖，当前 99 片/.test(err.message), err.message);
  assert.equal(JSON.stringify(v.scrolls), snap, '一片未扣');
  assert.equal(JSON.stringify(v.txs), fb, '无流水');
  assert.equal(v.scroll_fragments, 0, '碎片不变');
  assert.notEqual(JSON.stringify(v), before, '（正对照：成功分解会改状态）');
});

// ==================== ⑩ summarize 读口径 ====================

const LEGACY_KEYS = [
  'fragments',
  'fragment_cap',
  'seeds_total',
  'seed_lot_count',
  'seed_lots',
  'bamboos_total_pieces',
  'bamboo_bundles',
  'bamboo_lot_count',
  'bamboo_lots',
  'jades_total',
  'jades',
  'signin_date',
  'expiring',
  'txs',
];
const NEW_KEYS = [
  'scroll_fragments',
  'scroll_fragment_cap',
  'scrolls_total_pieces',
  'scrolls_item_count',
  'scroll_lot_count',
  'scroll_lots',
];

test('summarize：新增 6 个出参逐字与取值正确，既有出参键集与取值一字未改', () => {
  const u = newUser();
  u.fragments = 3;
  u.scroll_fragments = 42;
  u.signin_date = '2026-09-25';
  u.seeds = [
    { id: 'sl_1', qty: 3, expires_at: isoAt(100), source: 'signin', created_at: T0.toISOString() },
    { id: 'sl_2', qty: 2, expires_at: isoAt(200), source: 'admin', created_at: T0.toISOString() },
    { id: 'sl_3', qty: 1, expires_at: isoAt(10), source: 'admin', created_at: T0.toISOString() },
  ];
  u.bamboos = [{ id: 'bl_1', qty: 250, expires_at: isoAt(300), source: 'admin', created_at: T0.toISOString() }];
  u.jades = [
    { id: 'jd_1', expires_at: null, source: 'synthesis', created_at: T0.toISOString() },
    {
      id: 'jd_2',
      expires_at: isoAt(400),
      source: 'admin',
      created_at: T0.toISOString(),
      mounted_tree_id: 'sp_f1',
    },
  ];
  u.scrolls = [
    { id: 'sc_1', qty: 120, expires_at: null, source: 'scroll_synth', created_at: T0.toISOString() },
    { id: 'sc_2', qty: 130, expires_at: null, source: 'admin', created_at: T0.toISOString() },
  ];
  el.recordTx(u, { type: 'reward', delta: { scroll_fragments: 42 }, desc: '好友奖励' }, T0);

  const s = el.summarize(u, T0);

  // 键集：既有 14 键 ∪ 新增 6 键，逐字（既有键名与形状一律未改）
  assert.deepEqual(Object.keys(s).sort(), [...LEGACY_KEYS, ...NEW_KEYS].sort());

  // 新增出参（R-11）
  assert.equal(s.scroll_fragments, 42);
  assert.equal(s.scroll_fragment_cap, 99);
  assert.equal(s.scrolls_total_pieces, 250);
  assert.equal(s.scrolls_item_count, 2, '向下取整整格数：floor(250 / 100)');
  assert.equal(s.scroll_lot_count, 2);
  assert.deepEqual(s.scroll_lots, u.scrolls, '原始批次数组（逐字段原样）');
  assert.ok(s.scroll_lots.length === 2);

  // 既有出参（取值与形状未受牵连）
  assert.equal(s.fragments, 3);
  assert.equal(s.fragment_cap, 9);
  assert.equal(s.seeds_total, 6);
  assert.equal(s.seed_lot_count, 3);
  assert.deepEqual(s.seed_lots, u.seeds);
  assert.equal(s.bamboos_total_pieces, 250);
  assert.equal(s.bamboo_bundles, 2);
  assert.equal(s.bamboo_lot_count, 1);
  assert.deepEqual(s.bamboo_lots, u.bamboos);
  assert.equal(s.jades_total, 1, '用户面：已镶嵌玉不算个人');
  assert.equal(s.jades[0].permanent, true);
  assert.equal(s.jades[0].id, 'jd_1');
  assert.equal(s.signin_date, '2026-09-25');
  assert.equal(s.expiring.length, 1, '30 天内到期只有 sl_3');
  assert.equal(s.expiring[0].asset, 'seed');
  assert.equal(s.expiring[0].days_left, 10);
  assert.equal(s.txs.length, 1);
  assert.equal(s.txs[0].type, 'reward');

  // 管理面（include_mounted）玉口径未变
  const admin = el.summarize(u, T0, { include_mounted: true });
  assert.equal(admin.jades_total, 2);
  assert.equal(admin.jades.find((j) => j.id === 'jd_2').mounted_tree_id, 'sp_f1');
  assert.equal(admin.scrolls_item_count, 2);

  // 余数分支：不足 1 整格
  const v = newUser();
  v.scrolls = [{ id: 'sc_x', qty: 99, expires_at: null, source: 'admin' }];
  const sv = el.summarize(v, T0);
  assert.equal(sv.scrolls_total_pieces, 99);
  assert.equal(sv.scrolls_item_count, 0, '99 片不足 1 整格 → 0');
  assert.equal(sv.scroll_lot_count, 1);

  // 空记录 / 脏数据容错（绝不吐 NaN）
  const empty = el.summarize(newUser(), T0);
  assert.equal(empty.scrolls_item_count, 0);
  assert.equal(empty.scrolls_total_pieces, 0);
  assert.equal(empty.scroll_lot_count, 0);
  assert.deepEqual(empty.scroll_lots, []);
  assert.equal(empty.scroll_fragments, 0);
  assert.equal(el.summarize({}, T0).scroll_fragments, 0, '缺字段的 user 记录容错为 0');
});

// ==================== ⑪ 枚举与 R-1 ====================

test('Tx.type：新增 scroll_synth / scroll_decompose，既有 19 项一项不落、未知类型仍抛错', () => {
  const legacy = [
    'signin',
    'fragment_synth',
    'expire',
    'reward',
    'admin_grant',
    'account_clear',
    'edit_fee',
    'delete_fee',
    'move_fee',
    'tree_create',
    'fee_refund',
    'jade_synth',
    'jade_decompose',
    'jade_mount',
    'spirit_charge',
    'market_list',
    'market_cancel',
    'market_sell',
    'market_buy',
    'official_buy',
  ];
  for (const t of legacy) assert.ok(el.TX_TYPES.includes(t), `既有取值保留：${t}`);
  assert.ok(el.TX_TYPES.includes('scroll_synth'));
  assert.ok(el.TX_TYPES.includes('scroll_decompose'));
  assert.equal(new Set(el.TX_TYPES).size, el.TX_TYPES.length, '无重名');
  const appended = ['scroll_synth', 'scroll_decompose', 'scroll_consume'];
  for (const t of appended) assert.ok(el.TX_TYPES.includes(t), `本批新增枚举必须入白名单：${t}`);
  assert.deepEqual(
    el.TX_TYPES.filter((t) => !legacy.includes(t)).sort(),
    [...appended].sort(),
    '白名单差集恰为本批 3 项追加：scroll_synth / scroll_decompose / scroll_consume',
  );
  assert.equal(el.TX_TYPES.length, legacy.length + 3, '只在既有白名单上追加 3 项');

  const u = newUser();
  assert.throws(() => el.recordTx(u, { type: 'scroll_synth_typo' }, T0), /未知流水类型/);
  assert.throws(() => el.recordTx(u, { type: 'friend_reward' }, T0), /未知流水类型/, 'R-10：本单不放开 friend_reward');
  el.recordTx(u, { type: 'scroll_synth', delta: { scroll_fragments: -100, scrolls: 100 } }, T0);
  assert.equal(u.txs.length, 1);
});

test('R-1：源码中不存在 bamboo_fragments；空记录含 scroll_fragments 与 scrolls', async () => {
  const src = fs.readFileSync(LEDGER_SRC, 'utf8');
  assert.ok(!/bamboo_fragments/.test(src), '不得出现 bamboo_fragments 字段名（R-1）');

  const blank = await el.getAssets('19900000000');
  assert.equal(blank.scroll_fragments, 0, '空记录含标量 scroll_fragments');
  assert.deepEqual(blank.scrolls, [], '空记录含批次数组 scrolls');
  assert.equal(blank.bamboo_fragments, undefined, '无 bamboo_fragments 悬空字段');
  assert.deepEqual(Object.keys(blank).sort(), [
    'bamboos',
    'fragments',
    'jades',
    'scroll_fragments',
    'scrolls',
    'seeds',
    'signin_date',
    'txs',
  ]);
});

// ==================== ⑫ 唯一写入路径（R-12） ====================

test('withAssets：兰帖写入只经 mutator，回读一致；mutator 抛错 → 一字节不回写', async () => {
  const PHONE = '16600009501';
  const wrote = await el.withAssets(PHONE, (u) => {
    el.addScrollFragments(u, 249, T0);
    return el.summarize(u, T0);
  });
  assert.equal(wrote.scroll_fragments, 49);
  assert.equal(wrote.scrolls_total_pieces, 200);

  const back = await el.getAssets(PHONE);
  assert.equal(back.scroll_fragments, 49, '回读一致');
  assert.equal(el.sumLots(back.scrolls), 200);
  assert.equal(back.scrolls.length, 2);
  assert.equal(back.scrolls[0].expires_at, null);
  assert.equal(back.scrolls[0].source, 'scroll_synth');
  assert.equal(txsOf(back, 'scroll_synth').length, 1);

  // 落盘位置 = /tmp 副本（绝不在真源里创建）
  assert.ok(fs.existsSync(path.join(TMP, 'collections', 'jiazu_assets.json')), '副本集合文件已写入');
  assert.ok(!fs.existsSync(path.join(REAL_OUT, 'collections', '__scroll_items_probe.json')));

  // 409 整单拒绝：mutator 抛错 → colSet 不执行
  const snapshot = JSON.stringify(back);
  await assert.rejects(
    () => el.withAssets(PHONE, (u) => el.decomposeScroll(u, 99, T0)),
    (e) => e.status === 409 && e.code === el.ASSET_INSUFFICIENT,
  );
  const after = await el.getAssets(PHONE);
  assert.equal(JSON.stringify(after), snapshot, '抛错后资产逐字节未变（整单拒绝）');

  // 成功分解同样经 mutator 落库（另起一个干净账号：碎片 0 → 分解返 99 后仍为碎片态）
  const PHONE2 = '16600009502';
  await el.withAssets(PHONE2, (u) => el.addScrollFragments(u, 100, T0)); // 1 枚（100 片）+ 碎片 0
  const dec = await el.withAssets(PHONE2, (u) => el.decomposeScroll(u, 1, T0));
  assert.equal(dec.refunded, 99);
  assert.equal(dec.synthesized, 0, '干净基线：返 99 不触发回环');
  const back2 = await el.getAssets(PHONE2);
  assert.equal(back2.scroll_fragments, 99);
  assert.equal(el.sumLots(back2.scrolls), 0);
  assert.equal(txsOf(back2, 'scroll_decompose').length, 1);

  // 已有碎片时返还 99 会按同一写入自动合成（49 + 99 = 148 → 1 枚 + 余 48）
  const dec2 = await el.withAssets(PHONE, (u) => el.decomposeScroll(u, 1, T0));
  assert.equal(dec2.refunded, 99);
  assert.equal(dec2.synthesized, 1);
  const back3 = await el.getAssets(PHONE);
  assert.equal(back3.scroll_fragments, 48, '49 + 99 - 100 = 48');
  assert.equal(el.sumLots(back3.scrolls), 200, '原 2 枚扣 1 枚 + 现场合成 1 枚');
  assert.equal(txsOf(back3, 'scroll_decompose').length, 1, 'PHONE 只成功分解 1 次（409 那次一字节未写）');
  assert.equal(txsOf(back3, 'scroll_synth').length, 2, '首次累加 1 条 + 本次返还触发 1 条');
});

// ==================== ⑬ 既有籽域回归 ====================

test('回归：籽域碎片 9 / 10 / 10 口径与 sweep 剔除过期籽批次均未受影响', () => {
  const u = newUser();
  el.addFragments(u, 9, T0);
  assert.equal(u.fragments, 9);
  assert.equal(u.seeds.length, 0);
  const r = el.addFragments(u, 1, T0);
  assert.equal(r.synthesized, 1);
  assert.equal(u.fragments, 0, '既有口径：满 10 → 1 籽 + 碎片归零');
  assert.equal(u.seeds[0].source, 'fragment_synth');
  assert.equal(u.seeds[0].qty, 1);
  assert.equal(u.seeds[0].expires_at, isoAt(el.SEED_TTL_DAYS));

  const v = newUser();
  el.addFragments(v, 18, T0);
  assert.equal(v.fragments, 8, '18 → 1 籽 + 8 碎片（9 上限不变量）');
  assert.deepEqual(txsOf(v, 'fragment_synth')[0].delta, { fragments: -10, seeds: 1 });

  const w = newUser();
  el.addLot(w, 'seed', 2, { now: T0 });
  el.addLot(w, 'bamboo', 4, { now: T0 });
  const rem = el.sweep(w, new Date(T0.getTime() + 366 * DAY));
  assert.deepEqual(rem.map((x) => x.asset).sort(), ['bamboo', 'seed']);
  assert.equal(w.seeds.length, 0);
  assert.equal(w.bamboos.length, 0);
  assert.equal(txsOf(w, 'expire').length, 2);

  // 兰帖域写入不产生籽域副作用
  const x = newUser();
  el.addScrollFragments(x, 100, T0);
  assert.equal(x.fragments, 0);
  assert.equal(x.seeds.length, 0);
  assert.equal(txsOf(x, 'fragment_synth').length, 0);
  assert.equal(txsOf(x, 'scroll_synth').length, 1);
});

// ==================== ⑭ 真源 ====================

test('真源未变：config/tree-meta.json 与 migrate-output/（trees + details + collections）md5 一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5);
  assert.equal(fs.readFileSync(REAL_META, 'utf8'), realMetaRaw);
  for (const [name, base] of [
    ['trees', realTreeBaseline],
    ['details', realDetailBaseline],
    ['collections', realColBaseline],
  ]) {
    const now = dirBaseline(path.join(REAL_OUT, name));
    assert.deepEqual([...now.keys()].sort(), [...base.keys()].sort(), `migrate-output/${name} 文件集合未变`);
    for (const [f, h] of now) assert.equal(h, base.get(f), `migrate-output/${name}/${f} 未被改写`);
  }
});

// ==================== ⑮ 非有限值收口 + 有界合成（D-1 回归 · 质检 Neng 实测） ====================
//
// D-1 现象：`Math.max(0, Math.floor(Number(x) || 0))` 对 **Infinity** 原样放行（`Number(x) || 0` 拦不住
// Infinity：JSON 文本 `1e999` 经 `JSON.parse` 即得 Infinity），紧接着 `while (v >= 阈值)` 永不为假
// ⇒ 无界循环直至堆耗尽（实测 rc=-6 / SIGABRT）。判据 C：非法 / 非有限值一律归 0 就地剔除。

/** 真·外部口径模拟：JSON 文本 `1e999` 经 `JSON.parse` 溢出为 `Infinity`（不是手写 Infinity） */
const jsonInf = () => JSON.parse('{"v": 1e999}').v;

test('D-1①：Infinity / -Infinity / NaN 注入碎片字段 → 一律归 0、不挂死、结果无 NaN', () => {
  assert.equal(jsonInf(), Infinity, '前置：JSON.parse 的 1e999 即 Infinity');

  // 兰帖残页：sweep 收口路径（红：while (Infinity >= 100) 恒真 ⇒ 无界循环直至堆耗尽）
  const u = newUser();
  u.scroll_fragments = jsonInf();
  const removed = el.sweep(u, T0);
  assert.equal(u.scroll_fragments, 0, '非有限值归 0（判据 C）');
  assert.equal(u.scrolls.length, 0, '不得凭 Infinity 合成任何兰帖批次');
  assert.equal(el.sumLots(u.scrolls), 0);
  assert.equal(txsOf(u, 'scroll_synth').length, 0, '无合成流水');
  assert.deepEqual(removed, [], '不产生 removed 记录');

  // 籽碎片：同一 while 形态的姊妹分支
  const v = newUser();
  v.fragments = jsonInf();
  el.sweep(v, T0);
  assert.equal(v.fragments, 0);
  assert.equal(v.seeds.length, 0, '不得凭 Infinity 合成任何籽批次');

  // 直连纯函数（不经 sweep）：入参 Infinity 与「字段自身已是 Infinity」两条都要收口
  const w = newUser();
  w.scroll_fragments = jsonInf();
  assert.equal(el.addScrollFragments(w, 0, T0).synthesized, 0);
  assert.equal(w.scroll_fragments, 0);
  assert.equal(w.scrolls.length, 0);

  const x = newUser();
  assert.equal(el.addScrollFragments(x, jsonInf(), T0).synthesized, 0, '入参 Infinity 当 0');
  assert.equal(x.scroll_fragments, 0);

  const y = newUser();
  y.fragments = jsonInf();
  assert.equal(el.addFragments(y, 0, T0).synthesized, 0);
  assert.equal(y.fragments, 0);
  assert.equal(y.seeds.length, 0);

  const z = newUser();
  assert.equal(el.addFragments(z, jsonInf(), T0).synthesized, 0);
  assert.equal(z.fragments, 0);

  // -Infinity / NaN 同口径（判据 C：非有限一律归 0）
  for (const bad of [-Infinity, NaN, jsonInf()]) {
    const a = newUser();
    a.scroll_fragments = bad;
    el.sweep(a, T0);
    const b = newUser();
    b.fragments = bad;
    el.sweep(b, T0);
    assert.equal(a.scroll_fragments, 0, `scroll_fragments 收口 ${bad}`);
    assert.equal(b.fragments, 0, `fragments 收口 ${bad}`);
    assert.equal(a.scrolls.length, 0);
    assert.equal(b.seeds.length, 0);
  }

  // 读口径投影（summarize）绝不吐 Infinity / NaN
  const s = el.summarize({ ...newUser(), fragments: jsonInf(), scroll_fragments: jsonInf() }, T0);
  assert.equal(s.fragments, 0);
  assert.equal(s.scroll_fragments, 0);
  for (const k of ['fragments', 'scroll_fragments', 'scrolls_total_pieces', 'scrolls_item_count']) {
    assert.ok(Number.isFinite(s[k]), `summarize.${k} 必须有限：${s[k]}`);
  }

  // 批次脏数据：qty = Infinity 不得被当合法数量（sweep / sumLots / 到期投影）
  const badLot = newUser();
  badLot.scrolls = [{ id: 'sc_inf', qty: jsonInf(), expires_at: null, source: 'admin' }];
  el.sweep(badLot, T0);
  assert.equal(badLot.scrolls.length, 0, 'qty=Infinity 的兰帖批次就地剔除');
  assert.equal(el.sumLots([{ qty: jsonInf() }]), 0, 'sumLots 对 Infinity 归 0');

  const seedLot = newUser();
  seedLot.seeds = [{ id: 'sl_inf', qty: jsonInf(), expires_at: isoAt(300) }];
  const s2 = el.summarize(seedLot, T0);
  assert.equal(s2.seeds_total, 0, 'Infinity 不入总账');
  assert.ok(Number.isFinite(s2.seeds_total));

  // 全链路产物不得出现任何 NaN / ±Infinity
  for (const uu of [u, v, w, x, y, z, badLot, seedLot]) {
    assert.ok(Number.isFinite(uu.fragments) && Number.isFinite(uu.scroll_fragments), '标量字段有限');
    for (const t of uu.txs || []) {
      for (const d of Object.values(t.delta || {})) {
        assert.ok(!hasBadNumber(d), `流水 delta 无 NaN/Inf：${JSON.stringify(t.delta)}`);
      }
    }
  }
});

test('D-1②：一次极大增量（1e6）在有界时间内完成且结果自洽（枚数 / 拼片数对得上）', () => {
  const t0 = Date.now();

  // 兰帖域：1e6 片 → 10000 枚，每枚一个新批次 + 一条合成流水（形状 / 字段名未变）
  const u = newUser();
  const r = el.addScrollFragments(u, 1e6, T0);
  assert.equal(r.synthesized, 10000, '1e6 片 → 10000 枚');
  assert.equal(r.scroll_lots.length, 10000);
  assert.equal(u.scroll_fragments, 0, '余数 0');
  assert.equal(el.sumLots(u.scrolls), 1e6, '片数对得上（枚数 × 100）');
  assert.equal(u.scrolls.length, 10000, '每枚一个新 lot（批次形状未变）');
  assert.equal(u.scrolls[0].qty, 100, '单枚 qty 口径未变');
  assert.equal(u.scrolls[0].expires_at, null);
  assert.equal(u.scrolls[0].source, el.SCROLL_SOURCE_SYNTH);
  const synths = txsOf(u, 'scroll_synth');
  assert.equal(synths.length, 1, '一条合成流水（口径未变）');

  // 籽域姊妹路径
  const v = newUser();
  const r2 = el.addFragments(v, 1e6, T0);
  assert.equal(r2.synthesized, 100000, '1e6 碎片 → 100000 籽');
  assert.equal(v.fragments, 0);
  assert.equal(el.sumLots(v.seeds), 100000);
  assert.equal(txsOf(v, 'fragment_synth').length, 1);

  const ms = Date.now() - t0;
  assert.ok(ms < 30000, `有界时间（非「每次重读自己」的无界循环）：实测 ${ms}ms`);
});
