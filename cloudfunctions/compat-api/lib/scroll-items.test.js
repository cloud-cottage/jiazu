/**
 * 兰帖物品域单测（P4 第一段）— lib/economy-ledger.js 的兰帖残页 + 兰帖（纯模块，不含路由）
 * 规格：docs/economy.spec.md §15-1–§15-6（物品域扩展）/ §4-1 存储契约 / §4-6 枚举 /
 *   §5-1 籽域碎片自动合成（**仅籽域**；兰帖残页 2026-09-26 Kevin 裁定改为**手动**合成）/
 *   §5-2 FIFO + 整单拒绝 / §5-4 惰性结算 / §5-7 唯一写入路径；
 *   冻结口径 R-1 / R-2 / R-3 / R-6 / R-7 / R-8 / R-9 / R-10 / R-11 / R-12 / R-13（Zang 裁定 v2，Kevin 已裁 R-6）。
 *
 * 覆盖：
 *  ① 新增常量取值（999 / 100 / 100 / 99）与**既有常量一字未改**（365 / 365 / 9 / 10 / 10）
 *  ② 兰帖残页**纯累加**：99 / 99 + 1 = 100 **一律不合成**（无批次、无流水、无「满 100 自动」一说）
 *  ③ 手动合成门槛（`synthesizeScroll`）：250 → 合 1 张 → 残页 150；恰好 100 → 合后残页 0；
 *     99 → 409 整单拒绝（**零写入**，逐字节比对）
 *  ④ 合成流水 `scroll_synth`（手动路径专有）：`delta` 同时含 `scroll_fragments` 与 `scrolls` 两个键、中文 desc
 *  ⑤ 兰帖永久：`sweep` 在任意远未来**都不剔除**兰帖批次、不写 expire 流水（R-8）
 *  ⑥ 兰帖脏数据收口：qty 非法 / NaN / 负数 / 0 / 空对象 / null → 归 0 就地剔除，不写流水，无 null / NaN
 *  ⑦ 批次构造纪律（R-3）：`expires_at` 缺省 → 抛错；传有期限值 → 抛错；显式 `null` → 永久
 *  ⑧ 分解正对照（R-7）：1 张 → 返 99 碎片，**不再回环**（残页纯累加）；多张分解同样不回环
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

/** 造 1 张成品兰帖（= 100 片，永久；走模块构造函数，绝不手搓批次） */
const mkScroll = (user, qty = 100, source = 'admin', now = T0) =>
  el.addLot(user, 'scroll', qty, { expires_at: null, source, now });

const txsOf = (user, type) => (user.txs || []).filter((t) => t.type === type);
const hasBadNumber = (v) =>
  typeof v === 'number' && (!Number.isFinite(v) || Number.isNaN(v));

// ==================== ① 常量 ====================

test('常量：兰帖域四项取值（999 / 100 / 100 / 99）与既有常量一字未改', () => {
  assert.equal(el.SCROLL_FRAGMENT_CAP, 999, '兰帖残页**单格容纳上限** = 999（展示层口径，非拒绝阈值）');
  assert.equal(el.SCROLL_FRAGMENT_SYNTH_THRESHOLD, 100, '兰帖残页**手动合成门槛** = 100（不再是自动触发阈值）');
  assert.equal(el.SCROLL_PIECES_PER_SCROLL, 100, '每张成品兰帖 = 100 片');
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

// ==================== ②③④ 碎片纯累加 + 手动合成 ====================

test('兰帖残页纯累加：99 / 99 + 1 = 100 片**一律不自动合成**（无批次、无流水）', () => {
  const u = newUser();
  assert.equal(el.addScrollFragments(u, 99, T0).synthesized, 0, '99 不合成');
  assert.equal(u.scroll_fragments, 99);
  assert.equal(u.scrolls.length, 0);
  assert.equal(txsOf(u, 'scroll_synth').length, 0, '未合成 → 无流水');

  const r = el.addScrollFragments(u, 1, T0);
  assert.equal(r.synthesized, 0, '2026-09-26 裁定：满 100 也不自动合成');
  assert.deepEqual(r.scroll_lots, [], '`scroll_lots` 恒空（兼容保留键）');
  assert.equal(r.scroll_fragments, 100, '残页原样累加到 100 片');
  assert.equal(u.scroll_fragments, 100, '同一份 user 记录内即为 100 片（无任何中间态）');
  assert.equal(u.scrolls.length, 0, '不产生任何成品兰帖批次');
  assert.equal(el.sumLots(u.scrolls), 0);
  assert.equal(txsOf(u, 'scroll_synth').length, 0, '不得写任何合成流水');
  assert.equal(u.txs.length, 0, '整条链路零流水');
});

test('兰帖残页余数分支：+150 → 150 片（0 张）；99 + 150 → 249 片（0 张）；脏数据 250 经 sweep 也不合成', () => {
  const a = newUser();
  const ra = el.addScrollFragments(a, 150, T0);
  assert.equal(ra.synthesized, 0, '150 片不合成');
  assert.equal(a.scroll_fragments, 150);
  assert.equal(el.sumLots(a.scrolls), 0);
  assert.deepEqual(ra.scroll_lots, []);

  const b = newUser();
  el.addScrollFragments(b, 99, T0);
  const rb = el.addScrollFragments(b, 150, T0); // 99 + 150 = 249
  assert.equal(rb.synthesized, 0, '249 片不合成');
  assert.equal(b.scroll_fragments, 249);
  assert.equal(el.sumLots(b.scrolls), 0);
  assert.equal(b.scrolls.length, 0, '不产生任何批次（与「每张一个新批次」只在手动合成时成立）');

  const c = newUser();
  c.scroll_fragments = 250; // 脏数据（旧口径下会被 sweep 顺带合成，本口径下不再）
  el.sweep(c, T0);
  assert.equal(c.scroll_fragments, 250, 'sweep 只做非负整数收口，不自动合成、不截断');
  assert.equal(c.scrolls.length, 0);
  assert.equal(txsOf(c, 'scroll_synth').length, 0, 'sweep 不得写合成流水');
});

test('手动合成流水 scroll_synth：一条，delta 逐字 {scroll_fragments:-200, scrolls:200}，desc 逐字', () => {
  const u = newUser();
  el.addScrollFragments(u, 350, T0);
  const r = el.synthesizeScroll(u, 2, T0);
  assert.equal(r.synthesized, 2, '一次 2 张');
  assert.equal(r.pieces, 200, '消耗 2 × 100 = 200 片');
  assert.equal(r.scroll_fragments, 150, '350 − 200 = 150（余数原样保留）');
  assert.equal(r.scroll_lots.length, 2, '每张一个新批次');
  const synths = txsOf(u, 'scroll_synth');
  assert.equal(synths.length, 1, '一条流水（不是每张一条）');
  const t = synths[0];
  assert.deepEqual(Object.keys(t.delta).sort(), ['scroll_fragments', 'scrolls'], 'delta 恰含两个键');
  assert.deepEqual(t.delta, { scroll_fragments: -200, scrolls: 200 }, 'delta 逐字（片）');
  assert.equal(t.ts, T0.toISOString());
  assert.equal(t.desc, '手动合成 2 张兰帖（消耗 200 片兰帖残页）', `desc 逐字：${t.desc}`);
  assert.ok(/^tx_/.test(t.id));
  for (const lot of r.scroll_lots) {
    assert.equal(lot.qty, 100, '单张 = 100 片');
    assert.equal(lot.expires_at, null, '恒永久（显式 null）');
    assert.equal(lot.source, el.SCROLL_SOURCE_SYNTH);
  }
});

test('手动合成门槛边界：99 ⇒ 409 零写入；恰好 100 ⇒ 合后残页 0；250 ⇒ 合 1 张后残页 150', () => {
  // ① 99 片 ⇒ 409 整单拒绝（零写入：整份记录逐字节比对）
  const a = newUser();
  el.addScrollFragments(a, 99, T0);
  const snap = JSON.stringify(a);
  let err;
  try {
    el.synthesizeScroll(a, 1, T0);
  } catch (e) {
    err = e;
  }
  assert.ok(err, '99 片不足 1 张必须抛错');
  assert.equal(err.status, 409);
  assert.equal(err.code, el.ASSET_INSUFFICIENT);
  assert.equal(err.need, 100, 'need = 需求**片**数（1 张 = 100 片）');
  assert.equal(err.current, 99, 'current = 当前**片**数');
  assert.equal(err.unit, 'scroll_fragments', '机器可读 unit = 复数键（与前端 SHORTAGE_UNIT_BY_KEY 同字面）');
  assert.equal(err.message, '资产不足，需 100 片兰帖残页，当前 99 片', '文案逐字（量词按兰帖残页，不得退化成石榴籽）');
  assert.equal(JSON.stringify(a), snap, '零写入：整份记录（标量 / 批次 / 流水）逐字节未变');

  // ② 恰好 100 片 ⇒ 合 1 张、残页归 0
  const b = newUser();
  el.addScrollFragments(b, 100, T0);
  const r1 = el.synthesizeScroll(b, 1, T0);
  assert.equal(r1.synthesized, 1);
  assert.equal(r1.pieces, 100);
  assert.equal(r1.scroll_fragments, 0, '恰好 100 ⇒ 合后残页 0（边界用法）');
  assert.equal(b.scroll_fragments, 0);
  assert.equal(el.sumLots(b.scrolls), 100);
  assert.equal(b.scrolls.length, 1);

  // ③ 250 片 ⇒ 手动合 1 张 ⇒ 残页 150 / 兰帖 +100 / 流水逐字
  const c = newUser();
  el.addScrollFragments(c, 250, T0);
  const beforePieces = el.sumLots(c.scrolls);
  const r2 = el.synthesizeScroll(c, 1, T0);
  assert.equal(r2.synthesized, 1);
  assert.equal(c.scroll_fragments, 150, '250 − 100 = 150');
  assert.equal(el.sumLots(c.scrolls), beforePieces + 100, '成品兰帖 +100 片');
  assert.equal(c.scrolls.length, 1);
  const t2 = txsOf(c, 'scroll_synth')[0];
  assert.deepEqual(t2.delta, { scroll_fragments: -100, scrolls: 100 }, 'delta 逐字（-100 / +100）');
  assert.equal(t2.desc, '手动合成 1 张兰帖（消耗 100 片兰帖残页）', 'desc 逐字');

  // ④ count 收口后 ≤ 0（0 / 负数 / NaN / 非法字符串 / null）⇒ 409 零写入
  //    （路由层另有 400 INVALID_COUNT 前置：非正整数一律先拦；此处验账本层收口后绝不落任何写入）
  const d = newUser();
  d.scroll_fragments = 500; // 残页够合 5 张 ⇒ 只有「收口后为 0」才会 409（可证非误判）
  const dSnap = JSON.stringify(d);
  for (const bad of [0, -1, -100, NaN, 'abc', null]) {
    assert.throws(
      () => el.synthesizeScroll(d, bad, T0),
      (e) => e.status === 409 && e.code === el.ASSET_INSUFFICIENT,
      `count=${String(bad)} 必须 409 整单拒绝`,
    );
    assert.equal(JSON.stringify(d), dSnap, `count=${String(bad)} 零写入`);
  }

  // ⑤ count 缺省 = 1（与路由层同口径）：显式传 undefined 走默认参数 ⇒ 合 1 张，不是错误
  const e1 = newUser();
  el.addScrollFragments(e1, 100, T0);
  const rDef = el.synthesizeScroll(e1, undefined, T0);
  assert.equal(rDef.synthesized, 1, 'count 缺省 ⇒ 恰好 1 张');
  assert.equal(e1.scroll_fragments, 0);

  // ⑥ 非整数 1.5 直调账本 ⇒ 收口向下取整为 1 张（路由层 400 INVALID_COUNT 已前置拦，仅直调可达；
  //    此为 `toNonNegInt` 收口口径的既有实现，本单不改口径，故按实现断言）
  const f1 = newUser();
  el.addScrollFragments(f1, 250, T0);
  const rFloor = el.synthesizeScroll(f1, 1.5, T0);
  assert.equal(rFloor.synthesized, 1, 'toNonNegInt(1.5) = 1（向下取整）');
  assert.equal(rFloor.pieces, 100);
  assert.equal(f1.scroll_fragments, 150, '250 − 100 = 150');
});

test('存量兼容（存量不迁移）：历史 source=\'scroll_synth\' 批次仍可被 chargeLots 按片扣减', () => {
  const u = newUser();
  // 手搓一条「历史自动合成」形态的批次（恒永久 + source='scroll_synth'），不重跑合成
  const legacy = el.addLot(u, 'scroll', 300, { expires_at: null, source: el.SCROLL_SOURCE_SYNTH, now: T0 });
  assert.equal(legacy.source, 'scroll_synth');
  const charged = el.chargeLots(u.scrolls, 100, 'scroll');
  assert.equal(charged.ok, true);
  assert.deepEqual(charged.taken, [{ id: legacy.id, qty: 100, expires_at: null }], '存量批次照常参与 FIFO 扣减');
  assert.equal(el.sumLots(u.scrolls), 200, '扣减就地生效（本模块口径：qty=0 留待 sweep）');
  assert.equal(u.scroll_fragments, 0, '扣减不产生残页');
  // 存量批次与新手动合成批次同形同源字面（下游按 source 判定者不受影响）
  const freshUser = newUser();
  el.addScrollFragments(freshUser, 100, T0); // 手动合成前置：恰好 100 片残页
  const fresh = el.synthesizeScroll(freshUser, 1, T0);
  assert.equal(u.scrolls.find((l) => l.id === legacy.id).source, fresh.scroll_lots[0].source);
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

test('分解正对照（R-7）：1 张 → 返 99 片残页，且**不回环**（残页纯累加）', () => {
  const u = newUser();
  mkScroll(u, 100); // 前置 1 张（100 片）；本口径下残页累加不再产出批次 ⇒ 批次用构造器造
  assert.equal(el.sumLots(u.scrolls), 100);
  assert.equal(u.scroll_fragments, 0, '前置：残页为 0');

  const r = el.decomposeScroll(u, 1, T0);
  assert.equal(r.decomposed, 1);
  assert.equal(r.pieces, 100);
  assert.equal(r.refunded, 99, '返还 99（留 1 片损耗）');
  assert.equal(r.synthesized, 0, '**不**回环成新张（兼容保留键恒 0）');
  assert.equal(el.sumLots(u.scrolls), 0, '兰帖已扣尽（qty=0 批次留待 sweep）');
  assert.equal(u.scroll_fragments, 99, '残页态 99（不足 100，须用户手动合成）');
  assert.equal(r.taken.length, 1);
  assert.equal(r.taken[0].qty, 100);

  el.sweep(u, T0);
  assert.equal(u.scrolls.length, 0, 'qty=0 批次由 sweep 移除（§5-2-3）');
  assert.equal(u.scroll_fragments, 99, 'sweep 不改变残页（也不自动合成）');
});

test('分解多张：返全额留在残页标量（198 片不回环），只剩未分解的成品兰帖', () => {
  const u = newUser();
  mkScroll(u, 300); // 3 张
  const r = el.decomposeScroll(u, 2, T0); // 200 片 → 返 198
  assert.equal(r.refunded, 198);
  assert.equal(r.synthesized, 0, '198 片不再自动合成（2026-09-26 裁定取消自动合成）');
  assert.equal(u.scroll_fragments, 198, '返还全额留在残页标量');
  assert.equal(el.sumLots(u.scrolls), 100, '只剩未分解的 1 张');
  assert.equal(u.scrolls.length, 1, '不新增任何批次');
  assert.equal(txsOf(u, 'scroll_synth').length, 0, '分解路径零合成流水');
});

test('分解流水 scroll_decompose：分解写一条对应流水；不足 → 409 整单拒绝', () => {
  const u = newUser();
  mkScroll(u, 100); // 1 张（残页另置 0）
  const before = JSON.stringify(u);
  const r = el.decomposeScroll(u, 1, T0);
  assert.equal(r.synthesized, 0);
  const dec = txsOf(u, 'scroll_decompose');
  assert.equal(dec.length, 1, '分解一条流水');
  assert.deepEqual(dec[0].delta, { scroll_fragments: 99, scrolls: -100 });
  assert.equal(dec[0].ts, T0.toISOString());
  assert.ok(/分解 1 张兰帖（100 片），返还 99 片兰帖残页/.test(dec[0].desc), dec[0].desc);
  assert.equal(txsOf(u, 'scroll_synth').length, 0, '分解路径不得写合成流水（合成只由手动路径产生）');
  assert.notEqual(JSON.stringify(u), before, '（正对照：成功分解会改状态）');

  // 数量不足 → 409 整单拒绝（一片不扣、碎片不变、无流水）
  const v = newUser();
  mkScroll(v, 99);
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
  assert.equal(s.scroll_fragment_cap, 999, '兰帖残页**单格容纳上限** = 999（展示层口径，非拒绝阈值）');
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
  assert.equal(wrote.scroll_fragments, 249, '残页纯累加（2026-09-26 裁定：不再顺带合成）');
  assert.equal(wrote.scrolls_total_pieces, 0, '累加不产生任何成品兰帖');

  const back = await el.getAssets(PHONE);
  assert.equal(back.scroll_fragments, 249, '回读一致');
  assert.equal(el.sumLots(back.scrolls), 0);
  assert.equal(back.scrolls.length, 0, '无成品兰帖批次（合成只由手动路径产生）');
  assert.equal(txsOf(back, 'scroll_synth').length, 0, '纯累加不写任何合成流水');

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

  // 手动合成（249 片 ⇒ 合 1 张）同样只经 mutator 落库：残页 149 + 1 个批次 + 1 条合成流水
  const syn = await el.withAssets(PHONE, (u) => el.synthesizeScroll(u, 1, T0));
  assert.equal(syn.synthesized, 1);
  assert.equal(syn.pieces, 100);
  const backSyn = await el.getAssets(PHONE);
  assert.equal(backSyn.scroll_fragments, 149, '249 − 100 = 149（余数原样保留）');
  assert.equal(el.sumLots(backSyn.scrolls), 100);
  assert.equal(backSyn.scrolls.length, 1);
  assert.equal(backSyn.scrolls[0].expires_at, null, '合成批次恒永久（显式 null）');
  assert.equal(backSyn.scrolls[0].source, 'scroll_synth');
  assert.equal(txsOf(backSyn, 'scroll_synth').length, 1, '手动合成写 1 条流水（唯一合成出口）');

  // 残页不足的手动合成同样整单拒绝（99 张 = 9900 片 ≫ 149 片）→ 一字节不回写
  const snapSyn = JSON.stringify(backSyn);
  await assert.rejects(
    () => el.withAssets(PHONE, (u) => el.synthesizeScroll(u, 99, T0)),
    (e) => e.status === 409 && e.code === el.ASSET_INSUFFICIENT && e.unit === 'scroll_fragments',
  );
  assert.equal(JSON.stringify(await el.getAssets(PHONE)), snapSyn, '残页不足：整份记录（标量 / 批次 / 流水）逐字节未变');

  // 成功分解同样经 mutator 落库（另起一个干净账号：先造 1 张成品兰帖 → 分解返 99 片，不复合成）
  const PHONE2 = '16600009502';
  await el.withAssets(PHONE2, (u) => el.addLot(u, 'scroll', 100, { expires_at: null, source: 'admin', now: T0 })); // 1 张（100 片）
  const dec = await el.withAssets(PHONE2, (u) => el.decomposeScroll(u, 1, T0));
  assert.equal(dec.refunded, 99);
  assert.equal(dec.synthesized, 0, '返 99 不触发任何合成（自动合成已取消）');
  const back2 = await el.getAssets(PHONE2);
  assert.equal(back2.scroll_fragments, 99, '返还 99 片原样留在残页标量');
  assert.equal(el.sumLots(back2.scrolls), 0);
  assert.equal(txsOf(back2, 'scroll_decompose').length, 1);
  assert.equal(txsOf(back2, 'scroll_synth').length, 0, '分解路径零合成流水（不回环）');

  // 已有残页时返还 99 片**同样不合成**（149 + 99 = 248，绝不回环）
  const dec2 = await el.withAssets(PHONE, (u) => el.decomposeScroll(u, 1, T0));
  assert.equal(dec2.refunded, 99);
  assert.equal(dec2.synthesized, 0, '返还不再触发任何自动合成');
  const back3 = await el.getAssets(PHONE);
  assert.equal(back3.scroll_fragments, 248, '149 + 99 = 248（纯累加，不再 −100 合成）');
  assert.equal(el.sumLots(back3.scrolls), 0, '唯一 1 张已扣尽');
  assert.equal(txsOf(back3, 'scroll_decompose').length, 1, 'PHONE 只成功分解 1 次（409 那次一字节未写）');
  assert.equal(txsOf(back3, 'scroll_synth').length, 1, '合成流水仍只有手动合成那 1 条');
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
  assert.equal(txsOf(x, 'scroll_synth').length, 0, '残页纯累加：不写合成流水（合成只由手动路径产生）');
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

  // 手动合成 `synthesizeScroll`：count 非有限 / 非法（收口后为 0）⇒ 409 整单拒绝、**零写入**
  // （循环界 = 收口后的 `n`，Infinity 绝不会变成无界循环或凭它造出批次）
  const q = newUser();
  q.scroll_fragments = 500; // 够合 5 张 ⇒ 只有「收口后为 0」才会 409，可排除误判
  const qSnap = JSON.stringify(q);
  for (const bad of [jsonInf(), -Infinity, NaN]) {
    let qErr;
    try {
      el.synthesizeScroll(q, bad, T0);
    } catch (e) {
      qErr = e;
    }
    assert.ok(qErr, `synthesizeScroll(count=${String(bad)}) 必须抛错（收口为 0 ⇒ 不足）`);
    assert.equal(qErr.status, 409);
    assert.equal(qErr.code, el.ASSET_INSUFFICIENT);
    assert.ok(Number.isFinite(qErr.need) && Number.isFinite(qErr.current), 'need / current 必须有限（绝不透出 Infinity）');
    assert.equal(JSON.stringify(q), qSnap, `count=${String(bad)} 零写入`);
  }
  assert.equal(el.synthesizeScroll(q, 1, T0).synthesized, 1, '同一条记录随后仍可正常手动合成 1 张（零写入 ≠ 弄坏状态）');
  assert.equal(q.scroll_fragments, 400);

  // 残页字段自身为 Infinity ⇒ 收口为 0 ⇒ 1 张也不足（409），且不得产出任何批次
  const qInf = newUser();
  qInf.scroll_fragments = jsonInf();
  let qInfErr;
  try {
    el.synthesizeScroll(qInf, 1, T0);
  } catch (e) {
    qInfErr = e;
  }
  assert.ok(qInfErr, '残页 Infinity ⇒ 收口 0 ⇒ 409');
  assert.equal(qInfErr.status, 409);
  assert.equal(qInfErr.need, 100);
  assert.equal(qInfErr.current, 0, 'current 收口为 0（绝不吐 Infinity）');
  assert.equal(qInf.scrolls.length, 0, '不得凭 Infinity 产出任何兰帖批次');
  assert.equal(el.sumLots(qInf.scrolls), 0);
  assert.equal(txsOf(qInf, 'scroll_synth').length, 0, '无合成流水');
  // 409 零写入 ⇒ 脏值仍原样留在标量字段里（这正是「一字节不写」的直接证据），等下一次 sweep 惰性收口
  assert.equal(qInf.scroll_fragments, jsonInf(), '零写入：脏值未被顺手改写');
  el.sweep(qInf, T0);
  assert.equal(qInf.scroll_fragments, 0, 'sweep 非负整数收口：非有限值归 0');

  // 批次脏数据：qty 非有限时的手动合成同样不产出脏批次（前置残页必须是有限值）
  const qBad = newUser();
  qBad.scroll_fragments = jsonInf();
  qBad.scrolls = [{ id: 'sc_qinf', qty: jsonInf(), expires_at: null }];
  el.sweep(qBad, T0);
  assert.equal(qBad.scroll_fragments, 0);
  assert.equal(qBad.scrolls.length, 0);
  assert.ok(Number.isFinite(el.sumLots(qBad.scrolls)));

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
  for (const uu of [u, v, w, x, y, z, q, qInf, badLot, seedLot]) {
    assert.ok(Number.isFinite(uu.fragments) && Number.isFinite(uu.scroll_fragments), '标量字段有限');
    for (const t of uu.txs || []) {
      for (const d of Object.values(t.delta || {})) {
        assert.ok(!hasBadNumber(d), `流水 delta 无 NaN/Inf：${JSON.stringify(t.delta)}`);
      }
    }
  }
});

test('D-1②：一次极大增量（1e6）在有界时间内完成且结果自洽（张数 / 拼片数对得上）', () => {
  const t0 = Date.now();

  // 兰帖域：1e6 片残页先**纯累加**（零批次 / 零流水）→ 再**手动**合 10000 张
  // （每张一个新批次 + 一条合成流水；形状 / 字段名未变，循环界 = 收口后的 n）
  const u = newUser();
  const acc = el.addScrollFragments(u, 1e6, T0);
  assert.equal(acc.synthesized, 0, '纯累加不合成');
  assert.deepEqual(acc.scroll_lots, []);
  assert.equal(u.scroll_fragments, 1e6, '1e6 片原样留在残页标量');
  assert.equal(u.scrolls.length, 0);
  assert.equal(txsOf(u, 'scroll_synth').length, 0, '累加不写流水');

  const r = el.synthesizeScroll(u, 10000, T0);
  assert.equal(r.synthesized, 10000, '1e6 片 → 10000 枚');
  assert.equal(r.pieces, 1e6, '消耗 10000 × 100 = 1e6 片');
  assert.equal(r.scroll_lots.length, 10000);
  assert.equal(u.scroll_fragments, 0, '余数 0');
  assert.equal(el.sumLots(u.scrolls), 1e6, '片数对得上（张数 × 100）');
  assert.equal(u.scrolls.length, 10000, '每张一个新 lot（批次形状未变）');
  assert.equal(u.scrolls[0].qty, 100, '单张 qty 口径未变');
  assert.equal(u.scrolls[0].expires_at, null);
  assert.equal(u.scrolls[0].source, el.SCROLL_SOURCE_SYNTH);
  const synths = txsOf(u, 'scroll_synth');
  assert.equal(synths.length, 1, '一条合成流水（口径未变）');
  assert.deepEqual(synths[0].delta, { scroll_fragments: -1e6, scrolls: 1e6 }, 'delta 按片逐字');

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
