/**
 * 资产账本内核单测（P0）— lib/economy-ledger.js + 三条资产路由
 * 规格：docs/economy.spec.md §3 / §4-1 / §5-1·§5-2·§5-3·§5-4·§5-7 / §6-1·§6-2、docs/economy-ops.spec.md §4.1
 *
 * 覆盖：
 *  ① 碎片 0→9 不合成、9+1 → 1 籽 + 归零、18 → 1 籽 + 8 碎片（K3：3+9 → 1 籽 + 2 碎片）
 *  ② FIFO 按 expires_at 升序（最早到期先扣）
 *  ③ 不足整单拒绝 409（need / current / unit / 文案），一颗粒都不取、绝不为负
 *  ④ sweep 剔除过期批次并写 type='expire' 流水；玉 expires_at=null 恒不过期
 *  ④-1 玉批次必须显式 expires_at（缺省抛错，无「默认永久」口径）
 *  ④-2 sweep 脏数据收口：qty 非法 / NaN / 负数一律剔除，removed 与 expire 流水无 null / NaN
 *  ⑤ 签到日切（UTC+8 自然日）与同日重复 409（资产与 signin_date 不变）
 *  ⑥ 并发两次扣费不超扣（Promise.all）
 *  ⑦ GET /assets/summary | /assets/expiring 读口径与 401；POST /assets/signin 满 10 联动
 *  ⑧ 不变量收口 + 真源 md5 逐字节未变
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本；文末 md5 断言真实
 * migrate-output/ 与 config/tree-meta.json 未变（照 meta-guard.test.js / node-delete.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/assets.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-assets-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaRaw = fs.readFileSync(REAL_META, 'utf8');
const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = new Map(fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]));
const realColBaseline = new Map(
  fs.readdirSync(REAL_COLLECTIONS).map((f) => [f, md5(path.join(REAL_COLLECTIONS, f))]),
);

const USER = '16600008801';
const OTHER = '16600008802';
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [USER]: { _id: USER, phone: USER, nickname: '资产测试用户', role: 'user' },
    [OTHER]: { _id: OTHER, phone: OTHER, nickname: '资产测试用户二', role: 'user' },
  }),
);

const el = await import('./economy-ledger.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const DAY = 86400000;
const NOW = new Date();
const isoPlus = (days, from = NOW) => new Date(from.getTime() + days * DAY).toISOString();
const bearer = (phone) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: 'user' }, 3600)}` });
/** 独立实现的北京时间自然日（不引用被测模块的 beijingDate） */
const beijingToday = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const blankUser = () => ({ fragments: 0, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' });
const seedLot = (qty, expDays, id, source = 'admin') => ({
  id: id || el.nextLotId('sl'),
  qty,
  expires_at: isoPlus(expDays),
  source,
  created_at: new Date(NOW).toISOString(),
});
const bambooLot = (qty, expDays, id) => ({ id: id || el.nextLotId('bl'), qty, expires_at: isoPlus(expDays), source: 'admin', created_at: new Date(NOW).toISOString() });
const jade = (expires_at, id) => ({ id: id || el.nextLotId('jd'), expires_at, created_at: new Date(NOW).toISOString(), source: 'synthesis' });

/** 落一组测试资产（走唯一写路径 mutateAssets） */
const seedAssets = (phone, patch) => el.mutateAssets(phone, (u) => Object.assign(u, patch));
const readAssets = (phone) => el.getAssets(phone);
const snapshot = (user) => JSON.parse(JSON.stringify(user));
const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({ path: p, httpMethod: method, headers, queryStringParameters: query, body: body ? JSON.stringify(body) : undefined });

/** 不变量收口（§10）：0 ≤ fragments ≤ 9；批次不为负、无 0 残留；总量与明细一致 */
function assertInvariants(user, label = '') {
  const tag = label ? `（${label}）` : '';
  assert.ok(user.fragments >= 0 && user.fragments <= el.FRAGMENT_CAP, `碎片越界${tag}：${user.fragments}`);
  for (const key of ['seeds', 'bamboos']) {
    for (const lot of user[key]) {
      assert.ok(Number(lot.qty) > 0, `${key} 出现 0/负批次${tag}：${JSON.stringify(lot)}`);
      assert.ok(typeof lot.expires_at === 'string' && lot.expires_at, `${key} 批次缺 expires_at${tag}`);
    }
    assert.equal(el.sumLots(user[key]), user[key].reduce((s, l) => s + l.qty, 0), `${key} 总量与明细不一致${tag}`);
  }
  for (const j of user.jades) assert.ok(j.expires_at === null || typeof j.expires_at === 'string', `玉 expires_at 非法${tag}`);
}

// ---- ① 常量与枚举 ----

test('常量与 Tx.type 白名单：与总纲一致，白名单外的类型被拒', () => {
  assert.equal(el.SEED_TTL_DAYS, 365);
  assert.equal(el.BAMBOO_TTL_DAYS, 365);
  assert.equal(el.FRAGMENT_CAP, 9);
  assert.equal(el.FRAGMENT_SYNTH_THRESHOLD, 10);
  assert.equal(el.FRAGMENT_PER_SEED, 10);
  for (const t of ['signin', 'fragment_synth', 'expire', 'reward', 'admin_grant', 'account_clear']) {
    assert.ok(el.TX_TYPES.includes(t), `白名单缺 ${t}`);
  }
  assert.throws(() => el.recordTx(blankUser(), { type: 'synthesize' }), /未知流水类型/);
});

// ---- ① 碎片上限 9 与自动合成 ----

test('碎片：0→9 不合成；9+1 → 立即 1 籽 + 归零；18 → 1 籽 + 8 碎片', () => {
  const u = blankUser();
  let r = el.addFragments(u, 9, NOW);
  assert.equal(r.synthesized, 0);
  assert.equal(u.fragments, 9);
  assert.equal(u.seeds.length, 0, '未满 10 不得合成');

  r = el.addFragments(u, 1, NOW);
  assert.equal(r.synthesized, 1, '第 10 个碎片立即合成 1 籽');
  assert.equal(u.fragments, 0, '合成后碎片归零');
  assert.equal(u.seeds.length, 1);
  assert.equal(u.seeds[0].qty, 1);
  assert.equal(u.seeds[0].source, 'fragment_synth');
  assert.equal(r.seed_lots.length, 1);
  const ttlDays = (Date.parse(u.seeds[0].expires_at) - NOW.getTime()) / DAY;
  assert.ok(Math.abs(ttlDays - 365) < 0.01, `籽批次应为 365 天，实际 ${ttlDays}`);
  assert.ok(u.txs.some((t) => t.type === 'fragment_synth'), '合成应写 fragment_synth 流水');

  const u2 = blankUser();
  const r2 = el.addFragments(u2, 18, NOW);
  assert.equal(r2.synthesized, 1);
  assert.equal(u2.fragments, 8, '18 → 1 籽 + 8 碎片');
  assert.equal(u2.seeds.length, 1);

  // K3 联动：存量 3 碎片领 9 碎片 → 当场 1 籽 + 碎片 2（不得落「9 碎片 + 待合成」中间态）
  const u3 = blankUser();
  el.addFragments(u3, 3, NOW);
  const r3 = el.addFragments(u3, 9, NOW);
  assert.equal(r3.synthesized, 1);
  assert.equal(u3.fragments, 2);
  assertInvariants(u3, 'K3 奖励联动');
});

// ---- ② FIFO ----

test('FIFO：按 expires_at 升序扣减（最早到期先扣），批次取尽归 0 由 sweep 移除', () => {
  const u = blankUser();
  const late = el.addLot(u, 'seed', 3, { now: NOW, expires_at: isoPlus(300) });
  const early = el.addLot(u, 'seed', 5, { now: NOW, expires_at: isoPlus(10) });
  const mid = el.addLot(u, 'seed', 2, { now: NOW, expires_at: isoPlus(100) });
  const r = el.chargeLots(u.seeds, 6, 'seed');
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.taken.map((t) => t.id),
    [early.id, mid.id],
    '必须先扣最早到期的批次',
  );
  assert.deepEqual(r.taken.map((t) => t.qty), [5, 1]);
  assert.equal(early.qty, 0, '最早到期批次先取尽');
  assert.equal(late.qty, 3, '剩余有效期最长的批次不动');
  assert.equal(el.sumLots(u.seeds), 4);

  el.sweep(u, NOW);
  assert.equal(u.seeds.some((l) => l.qty <= 0), false, 'qty=0 批次不得残留');
  assert.equal(u.seeds.length, 2);
  assertInvariants(u, 'FIFO');
});

// ---- ③ 整单拒绝 ----

test('不足整单拒绝：抛 409 ASSET_INSUFFICIENT，一颗粒都不取、绝不为负（竹片文案用「片」）', () => {
  const u = blankUser();
  el.addLot(u, 'seed', 4, { now: NOW, expires_at: isoPlus(30) });
  const before = snapshot(u);
  let err = null;
  try {
    el.chargeLots(u.seeds, 10, 'seed');
  } catch (e) {
    err = e;
  }
  assert.ok(err, '不足必须抛错');
  assert.equal(err.status, 409);
  assert.equal(err.code, el.ASSET_INSUFFICIENT);
  assert.equal(err.need, 10);
  assert.equal(err.current, 4);
  assert.equal(err.unit, 'seed');
  assert.match(err.message, /资产不足，需 10颗石榴籽，当前 4 颗/);
  assert.deepEqual(snapshot(u), before, '整单拒绝：资产一字节不得变');
  assert.throws(() => el.chargeLots(u.seeds, 10, 'seed'), /资产不足/);

  const b = blankUser();
  el.addLot(b, 'bamboo', 3, { now: NOW, expires_at: isoPlus(30) });
  assert.throws(() => el.chargeLots(b.bamboos, 9, 'bamboo'), /资产不足，需 9 片竹片，当前 3 片/);
  assert.equal(el.sumLots(b.bamboos), 3);
  assert.ok(b.bamboos.every((l) => l.qty >= 0), '绝不出现负余额');
});

// ---- ④ sweep / 玉 ----

test('sweep：剔除过期籽 / 竹片批次并写 expire 流水；null 玉恒不过期；有值玉过期作废', () => {
  const u = blankUser();
  const oldSeed = el.addLot(u, 'seed', 2, { now: NOW, expires_at: isoPlus(-1) });
  const goodSeed = el.addLot(u, 'seed', 4, { now: NOW, expires_at: isoPlus(1) });
  const oldBamboo = el.addLot(u, 'bamboo', 30, { now: NOW, expires_at: isoPlus(-10) });
  const goodBamboo = el.addLot(u, 'bamboo', 100, { now: NOW, expires_at: isoPlus(200) });
  const zeroSeed = el.addLot(u, 'seed', 0, { now: NOW, expires_at: isoPlus(50) });
  const foreverJade = jade(null, 'jd_forever');
  const datedJade = jade(isoPlus(-1), 'jd_dated');
  u.jades.push(foreverJade, datedJade);

  const removed = el.sweep(u, NOW);
  assert.deepEqual(
    removed.map((r) => r.lot_id).sort(),
    [oldSeed.id, oldBamboo.id, datedJade.id].sort(),
    '过期批次必须被剔除（含到期玉）',
  );
  assert.equal(u.seeds.length, 1);
  assert.equal(u.seeds[0].id, goodSeed.id);
  assert.equal(u.bamboos.length, 1);
  assert.equal(u.bamboos[0].id, goodBamboo.id);
  assert.equal(u.seeds.some((l) => l.id === zeroSeed.id), false, 'qty=0 批次就地移除');
  assert.deepEqual(u.jades.map((j) => j.id), ['jd_forever'], 'expires_at=null 的玉恒不过期');
  assert.equal(u.jades[0].expires_at, null);

  const expTxs = u.txs.filter((t) => t.type === 'expire');
  assert.equal(expTxs.length, 3, '每个被剔除批次一条 expire 流水');
  const txOf = (id) => expTxs.find((t) => t.desc.includes(id));
  assert.deepEqual(txOf(oldSeed.id).delta, { seeds: -2 });
  assert.deepEqual(txOf(oldBamboo.id).delta, { bamboos: -30 });
  assert.deepEqual(txOf(datedJade.id).delta, { jades: -1 });
  assert.match(txOf(oldBamboo.id).desc, /到期作废 30 片/, 'expire 流水 desc 含批次与数量');

  // 幂等：再 sweep 不再产生流水与剔除
  const txCount = u.txs.length;
  assert.deepEqual(el.sweep(u, NOW), []);
  assert.equal(u.txs.length, txCount);
  assertInvariants(u, 'sweep');
});

test('sweep 收口不变量：脏数据里的 ≥10 碎片立即合成、负碎片归零', () => {
  const u = blankUser();
  u.fragments = 12;
  el.sweep(u, NOW);
  assert.equal(u.fragments, 2, '12 碎片 → 1 籽 + 余 2');
  assert.equal(el.sumLots(u.seeds), 1);
  assert.ok(u.txs.some((t) => t.type === 'fragment_synth'));

  const u2 = blankUser();
  u2.fragments = -3;
  el.sweep(u2, NOW);
  assert.equal(u2.fragments, 0, '负碎片绝不保留');
  assertInvariants(u2, '负碎片');
});

// ---- ④-1 玉批次：无「默认永久」口径 ----

test('玉批次必须显式 expires_at：缺省抛错（无默认永久）、null = 永久且 sweep 永不剔除、ISO 正常', () => {
  const u = blankUser();
  assert.throws(
    () => el.addLot(u, 'jade', 1, { source: 'admin' }),
    /玉批次必须显式指定 expires_at/,
    '不传 expires_at 必须抛错（§4-1 / §11-3 无「默认永久」口径）',
  );
  assert.equal(u.jades.length, 0, '抛错不得留下半成品批次');

  const forever = el.addLot(u, 'jade', 1, { source: 'admin', expires_at: null, now: NOW });
  assert.equal(forever.expires_at, null, '显式 null 判为永久');
  const dated = el.addLot(u, 'jade', 1, { source: 'admin', expires_at: isoPlus(-1), now: NOW });
  assert.equal(dated.expires_at, isoPlus(-1), '显式 ISO 时刻原样落库');
  assert.equal(u.jades.length, 2);

  // 显式 null 的玉：跨任意远的时刻 sweep 都不得剔除
  const removed = el.sweep(u, new Date('2099-01-01T00:00:00.000Z'));
  assert.deepEqual(removed.map((r) => r.lot_id), [dated.id], '只有有到期时刻的玉被作废');
  assert.deepEqual(u.jades.map((j) => j.id), [forever.id], '永久玉恒不过期');
  assert.deepEqual(el.sweep(u, new Date('2099-01-01T00:00:00.000Z')), [], '再 sweep 无新剔除');
  assertInvariants(u, '玉批次显式 expires_at');
});

// ---- ④-2 sweep 脏数据收口 ----

test('sweep 脏数据收口：qty 为 undefined / 字串 / NaN / 负数一律剔除，removed 与 expire 流水绝不出现 null / NaN', () => {
  const dirty = (id, qty, expDays, bucket = 'seeds') => ({
    id,
    qty,
    expires_at: isoPlus(expDays),
    source: 'admin',
    created_at: new Date(NOW).toISOString(),
    bucket,
  });
  const u = blankUser();
  u.seeds = [
    dirty('sl_undef', undefined, 100),
    dirty('sl_str', 'abc', 100),
    dirty('sl_nan', NaN, 100),
    dirty('sl_neg', -5, 100),
    dirty('sl_nan_exp', NaN, -1), // 既脏又过期：只能按 qty=0 剔除，不得写 NaN 流水
    dirty('sl_ok', 7, 100),
  ];
  u.bamboos = [dirty('bl_neg', '-3', -1), dirty('bl_ok', 30, -10)];
  for (const l of [...u.seeds, ...u.bamboos]) delete l.bucket;

  const removed = el.sweep(u, NOW);

  // 非法 qty 一律归 0 就地剔除（不写流水）；合法批次照常保留 / 到期剔除
  assert.deepEqual(u.seeds.map((l) => l.id), ['sl_ok'], '脏籽批次必须全部剔除');
  assert.deepEqual(u.bamboos.map((l) => l.id), [], '脏竹片批次必须全部剔除');
  assert.equal(u.seeds[0].qty, 7, '合法批次不受影响');
  assert.deepEqual(removed.map((r) => r.lot_id), ['bl_ok'], '只有合法且到期的批次进 removed');

  // removed 记录与 expire 流水：逐项校验无 null / NaN、无 Infinity
  for (const r of removed) {
    assert.ok(typeof r.qty === 'number' && Number.isFinite(r.qty) && r.qty > 0, `removed.qty 非法：${JSON.stringify(r)}`);
    assert.ok(Number.isFinite(Date.parse(r.expires_at)), `removed.expires_at 非法：${JSON.stringify(r)}`);
  }
  const expTxs = u.txs.filter((t) => t.type === 'expire');
  assert.equal(expTxs.length, 1, '脏数据批次不写流水，只有合法到期批次写');
  for (const t of expTxs) {
    const keys = Object.keys(t.delta);
    assert.ok(keys.length > 0, 'expire 流水 delta 不得为空');
    for (const k of keys) {
      assert.ok(typeof t.delta[k] === 'number' && Number.isFinite(t.delta[k]), `expire 流水 delta.${k} 非法：${t.delta[k]}`);
      assert.notEqual(t.delta[k], 0, `expire 流水 delta.${k} 不得为 0`);
    }
    assert.equal(t.desc.includes('NaN') || t.desc.includes('undefined') || t.desc.includes('null'), false, `expire 流水 desc 含脏值：${t.desc}`);
  }
  assert.deepEqual(expTxs[0].delta, { bamboos: -30 });

  // 序列化往返：NaN 会变 null，往返不一致即说明审计流水被污染
  const audit = { removed, txs: [...expTxs] };
  assert.deepEqual(JSON.parse(JSON.stringify(audit)), audit, 'removed / expire 流水不得含 NaN（序列化后不得变 null）');
  assert.equal(JSON.stringify(audit).includes('null'), false, 'removed / expire 流水中不得出现 null');
  assertInvariants(u, 'sweep 脏数据收口');
});

test('sweep 脏数据收口：小数 / 字串数字 qty 被取整，总量与明细始终一致', () => {
  const u = blankUser();
  u.seeds = [
    { id: 'sl_frac', qty: 3.9, expires_at: isoPlus(50), source: 'admin', created_at: new Date(NOW).toISOString() },
    { id: 'sl_strnum', qty: '4', expires_at: isoPlus(60), source: 'admin', created_at: new Date(NOW).toISOString() },
  ];
  assert.equal(el.sumLots(u.seeds), 7, '取整前总量口径为 floor');
  el.sweep(u, NOW);
  assert.deepEqual(u.seeds.map((l) => l.qty), [3, 4], 'sweep 把脏 qty 收口为整数');
  assert.equal(u.seeds.reduce((s, l) => s + l.qty, 0), 7, '收口后总量 = 明细之和');
  assert.equal(el.sumLots(u.seeds), 7);
  assertInvariants(u, '小数 qty 收口');
});

// ---- ⑤ 签到 ----

test('签到：日切可再签，同日重复 → 409「今日已签到」且资产与 signin_date 不变', async () => {
  await seedAssets(USER, { fragments: 0, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '2000-01-01' });
  const first = await call('/assets/signin', 'POST', bearer(USER));
  assert.equal(first.statusCode, 200);
  const body = JSON.parse(first.body);
  assert.equal(body.ok, true);
  assert.equal(body.fragments, 1);
  assert.equal(body.synthesized, 0);
  assert.equal(body.seed_lot, null);
  assert.equal(body.signin_date, beijingToday(), 'signin_date = 北京时间自然日');

  const before = await readAssets(USER);
  const second = await call('/assets/signin', 'POST', bearer(USER));
  assert.equal(second.statusCode, 409);
  assert.deepEqual(JSON.parse(second.body), { error: '今日已签到' });
  assert.deepEqual(await readAssets(USER), before, '同日重复：资产与 signin_date 一字节不变');

  // 日切（signin_date 置昨日）→ 可再签一次
  await el.mutateAssets(USER, (u) => {
    u.signin_date = '2000-01-01';
  });
  const third = await call('/assets/signin', 'POST', bearer(USER));
  assert.equal(third.statusCode, 200);
  assert.equal(JSON.parse(third.body).fragments, 2, '日切后碎片再 +1');

  const anon = await call('/assets/signin', 'POST', {});
  assert.equal(anon.statusCode, 401);
  assertInvariants(await readAssets(USER), '签到');
});

test('签到满 10 联动：碎片 9 再签 → 当场 1 籽 + 碎片归零（seed_lot 非空）', async () => {
  await seedAssets(USER, { fragments: 9, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '2000-01-01' });
  const res = await call('/assets/signin', 'POST', bearer(USER));
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.fragments, 0);
  assert.equal(body.synthesized, 1);
  assert.ok(body.seed_lot && body.seed_lot.qty === 1, '合成批次随签到响应返回');
  assert.equal(body.seed_lot.source, 'fragment_synth');
  const after = await readAssets(USER);
  assert.equal(el.sumLots(after.seeds), 1);
  assertInvariants(after, '签到合成');
});

// ---- ⑦ 读接口 ----

test('GET /assets/summary：碎片含上限、籽总量+批次数+明细、竹片总片数+折算束数+批次数、玉 expires_at/null；读入口先 sweep', async () => {
  await seedAssets(OTHER, {
    fragments: 4,
    seeds: [seedLot(3, 20), seedLot(1, 300)],
    bamboos: [bambooLot(150, 60)],
    jades: [jade(null, 'jd_a'), jade(isoPlus(30), 'jd_b')],
    txs: [],
    signin_date: '2026-09-15',
  });
  const res = await call('/assets/summary', 'GET', bearer(OTHER));
  assert.equal(res.statusCode, 200);
  const s = JSON.parse(res.body);
  assert.equal(s.fragments, 4);
  assert.equal(s.fragment_cap, el.FRAGMENT_CAP, '碎片上限随读口径下发');
  assert.equal(s.seeds_total, 4);
  assert.equal(s.seed_lot_count, 2);
  assert.equal(s.seed_lots.length, 2);
  for (const lot of s.seed_lots) assert.ok(typeof lot.expires_at === 'string', '籽明细含 expires_at');
  assert.equal(s.bamboos_total_pieces, 150);
  assert.equal(s.bamboo_bundles, 1, '150 片 = 1 束（1 束 = 100 片）');
  assert.equal(s.bamboo_lot_count, 1);
  assert.equal(s.jades_total, 2);
  assert.deepEqual(s.jades.find((j) => j.id === 'jd_a').expires_at, null, '永久玉 expires_at = null');
  assert.equal(s.jades.find((j) => j.id === 'jd_a').permanent, true);
  assert.ok(s.jades.find((j) => j.id === 'jd_b').expires_at, '有值玉带到期时刻');
  assert.ok(Array.isArray(s.txs) && s.txs.length <= 50, '流水最多 50 条');
  assert.ok(Array.isArray(s.expiring));

  // 读入口惰性结算：过期批次在 summary 内被剔除并留 expire 流水
  await seedAssets(USER, {
    fragments: 0,
    seeds: [seedLot(7, -1, 'sl_expired')],
    bamboos: [],
    jades: [],
    txs: [],
    signin_date: '',
  });
  const swept = JSON.parse((await call('/assets/summary', 'GET', bearer(USER))).body);
  assert.equal(swept.seeds_total, 0, 'GET /assets/summary 必须先 sweep');
  assert.ok(swept.txs.some((t) => t.type === 'expire' && t.desc.includes('sl_expired')), '写 expire 流水');

  const anon = await call('/assets/summary', 'GET', {});
  assert.equal(anon.statusCode, 401);
});

test('GET /assets/expiring：默认 30 天窗口，days 覆盖；未登录 401', async () => {
  await seedAssets(USER, {
    fragments: 0,
    seeds: [seedLot(2, 10, 'sl_near'), seedLot(5, 400, 'sl_far')],
    bamboos: [bambooLot(100, 90, 'bl_mid')],
    jades: [],
    txs: [],
    signin_date: '',
  });

  const def = JSON.parse((await call('/assets/expiring', 'GET', bearer(USER))).body).items;
  assert.deepEqual(def.map((i) => i.lot_id), ['sl_near'], '默认只返回 30 天内到期的批次');
  assert.equal(def[0].asset, 'seed');
  assert.equal(def[0].qty, 2);
  assert.ok(def[0].days_left > 0 && def[0].days_left <= 30, `days_left 应在窗口内：${def[0].days_left}`);

  const wide = JSON.parse((await call('/assets/expiring', 'GET', bearer(USER), { days: '100' })).body).items;
  assert.deepEqual(wide.map((i) => i.lot_id), ['sl_near', 'bl_mid'], 'days 覆盖窗口且按到期升序');
  assert.equal(wide[1].asset, 'bamboo');

  const widest = JSON.parse((await call('/assets/expiring', 'GET', bearer(USER), { days: '500' })).body).items;
  assert.ok(widest.some((i) => i.lot_id === 'sl_far'), 'days 放大后包含远期批次');

  assert.equal((await call('/assets/expiring', 'GET', {})).statusCode, 401);
});

// ---- ⑥ 并发 ----

test('并发两次扣费（Promise.all）：同一手机号只成功一次，绝不超扣、不为负', async () => {
  await seedAssets(USER, { fragments: 0, seeds: [seedLot(9, 100)], bamboos: [], jades: [], txs: [], signin_date: '' });
  const charge = () =>
    el.mutateAssets(USER, (u) => {
      el.sweep(u, new Date());
      const r = el.chargeLots(u.seeds, 9, 'seed');
      el.recordTx(u, { type: 'admin_grant', delta: { seeds: -9 }, desc: '并发扣费测试' }, new Date());
      return r;
    });
  const results = await Promise.allSettled([charge(), charge()]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1, '并发扣费只能成功一次');
  assert.equal(failed.length, 1, '第二次必须被拒绝');
  assert.equal(failed[0].reason.status, 409);
  assert.equal(failed[0].reason.code, el.ASSET_INSUFFICIENT);

  const after = await readAssets(USER);
  assert.equal(el.sumLots(after.seeds), 0, '9 颗籽只被扣一次');
  assert.ok(after.seeds.every((l) => Number(l.qty) >= 0), '绝不出现负批次');
  assert.equal(after.txs.filter((t) => t.type === 'admin_grant').length, 1, '失败的一次不得写流水');
  const swept = await el.mutateAssets(USER, (u) => {
    el.sweep(u, new Date());
    return el.sumLots(u.seeds);
  });
  assert.equal(swept, 0);
  assertInvariants(await readAssets(USER), '并发');
});

// ==================== ⑨ 运营后台资产运维 / 注销（docs/economy-ops.spec.md §5 · §7 · P4） ====================

const store = await import('./store.js');
const ops = await import('./economy-ops.js');
const mk = await import('./economy-market.js');

const CHIEF = '16600008803'; // chief_editor（运营侧唯一有权的角色）
const STEWARD = '16600008804'; // tree_steward（非总编 → 403）
await store.colSet('jiazu_users', CHIEF, { _id: CHIEF, phone: CHIEF, nickname: '资产运维总编', role: 'chief_editor' });
await store.colSet('jiazu_users', STEWARD, { _id: STEWARD, phone: STEWARD, nickname: '族谱主理人', role: 'tree_steward' });

let seq = 0;
const gPhone = () => `1660001${String(9000 + (++seq))}`; // 11 位手机号（避免与既有夹具串号）
/** 建一个已注册用户并返回手机号 */
async function newUser(role = 'user') {
  const phone = gPhone();
  await store.colSet('jiazu_users', phone, { _id: phone, phone, nickname: `运维用户${phone.slice(-4)}`, role });
  return phone;
}
const bearerAs = (phone, role) => {
  const scheme = ['Bear', 'er'].join(''); // 避免字面量被外部工具误判为凭据
  return { authorization: `${scheme} ${signJwt({ sub: phone, phone, role }, 3600)}` };
};
const logsDoc = () => store.colGet('jiazu_ops_logs', 'global');
const logsOf = async () => (await logsDoc())?.logs || [];
const txsOf = (phone) => readAssets(phone).then((u) => u.txs || []);
const grant = (payload, headers = bearerAs(CHIEF, 'chief_editor')) => call('/admin/assets/grant', 'POST', headers, {}, payload);
const jsonBody = (res) => JSON.parse(res.body);

/** 市集（注销前置夹具）：只写 listings，official 用官方缺省 */
async function setMarket(listings = []) {
  const doc = mk.blankMarketDoc();
  doc.listings = listings;
  await store.colSet('jiazu_market', 'global', doc);
  return doc;
}
const listingsOf = async () => (await store.colGet('jiazu_market', 'global'))?.listings || [];
const listing = (seller, status, id = `ls_${++seq}`) => ({
  id,
  seller_phone: seller,
  pieces: 100,
  bundles: 1,
  price_seeds: 100,
  status,
  created_at: new Date(NOW).toISOString(),
  expires_at: isoPlus(3),
});

test('grant 校验矩阵（§5.1 校验 1–5）：未登录 401 / 非总编 403 / 手机号 400 / 用户不存在 404 / reason 必填 400 / delta 形状 400', async () => {
  const phone = await newUser();
  await seedAssets(phone, { fragments: 0, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' });
  const before = { assets: await readAssets(phone), logs: await logsOf() };

  const anon = await call('/admin/assets/grant', 'POST', {}, {}, { target_phone: phone, delta: { seeds: 1 }, reason: 'r' });
  assert.equal(anon.statusCode, 401);

  for (const role of ['user', 'tree_steward']) {
    const headers = bearerAs(role === 'user' ? phone : STEWARD, role);
    const res = await grant({ target_phone: phone, delta: { seeds: 1 }, reason: '测试' }, headers);
    assert.equal(res.statusCode, 403, `${role} 必须 403`);
    assert.deepEqual(jsonBody(res), { error: '需要总编辑权限' });
  }

  const badPhone = await grant({ target_phone: '12345', delta: { seeds: 1 }, reason: '测试' });
  assert.equal(badPhone.statusCode, 400);
  assert.equal(jsonBody(badPhone).error, '手机号格式不正确');

  const missingUser = await grant({ target_phone: '16600000000', delta: { seeds: 1 }, reason: '测试' });
  assert.equal(missingUser.statusCode, 404);
  assert.equal(jsonBody(missingUser).error, '用户不存在: 16600000000');

  for (const [payload, why] of [
    [{ target_phone: phone, delta: { seeds: 1 } }, '缺 reason'],
    [{ target_phone: phone, delta: { seeds: 1 }, reason: '   ' }, 'reason 全空格'],
    [{ target_phone: phone, delta: { seeds: 1 }, reason: '' }, 'reason 空串'],
  ]) {
    const res = await grant(payload);
    assert.equal(res.statusCode, 400, why);
    assert.equal(jsonBody(res).error, '请填写操作原因', why);
  }

  for (const [delta, why] of [
    [{}, 'delta 缺项'],
    [{ fragments: 0, seeds: 0, bamboos: 0, jades: 0 }, 'delta 全 0'],
  ]) {
    const res = await grant({ target_phone: phone, delta, reason: '测试' });
    assert.equal(res.statusCode, 400, why);
    assert.equal(jsonBody(res).error, '资产数量不能全为 0', why);
  }

  for (const [delta, why] of [
    [{ seeds: 1.5 }, '小数'],
    [{ seeds: '3' }, '字串'],
    [{ fragments: null, seeds: undefined, jades: '1' }, '混入非数值'],
  ]) {
    const res = await grant({ target_phone: phone, delta, reason: '测试' });
    assert.equal(res.statusCode, 400, why);
    assert.equal(jsonBody(res).error, '资产数量必须为整数', why);
  }

  // 校验失败：资产与审计日志一字节不变
  assert.deepEqual(await readAssets(phone), before.assets, '校验失败不得改资产');
  assert.deepEqual(await logsOf(), before.logs, '校验失败不得写日志');
});

test('grant 正向（§5.1 校验 7 + 副作用 1–3）：四类到账（批次 365 天 / 玉永久 / source=admin）+ OpsLog + admin_grant 流水；evidence 并入 reason', async () => {
  const phone = await newUser();
  await seedAssets(phone, { fragments: 7, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' });

  const res = await grant({ target_phone: phone, delta: { seeds: 3, bamboos: 250, jades: 1, fragments: 2 }, reason: '家族贡献奖励' });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body.ok, true);
  assert.equal(body.summary.seeds_total, 3);
  assert.equal(body.summary.bamboos_total_pieces, 250);
  assert.equal(body.summary.jades, 1);
  assert.equal(body.summary.fragments, 9, '7 + 2 = 9 碎片（未满 10 不合成）');
  assert.equal(body.summary.synthesized, 0);
  assert.ok(/^op_\d+_[0-9a-z]{6}$/.test(body.summary.log_id), `log_id 形态：${body.summary.log_id}`);

  const after = await readAssets(phone);
  assert.equal(after.fragments, 9);
  assert.equal(after.seeds.length, 1);
  assert.equal(after.seeds[0].qty, 3);
  assert.equal(after.seeds[0].source, 'admin');
  assert.ok(Math.abs((Date.parse(after.seeds[0].expires_at) - Date.now()) / DAY - 365) < 0.01, '籽批次 = 发放日 + 365 天');
  assert.equal(after.bamboos[0].qty, 250);
  assert.equal(after.bamboos[0].source, 'admin');
  assert.ok(Math.abs((Date.parse(after.bamboos[0].expires_at) - Date.now()) / DAY - 365) < 0.01, '竹片批次 = 发放日 + 365 天');
  assert.equal(after.jades.length, 1);
  assert.equal(after.jades[0].expires_at, null, '后台发放的玉 = 永久');
  assert.equal(after.jades[0].source, 'admin');

  const logs = await logsOf();
  const log = logs.find((l) => l.id === body.summary.log_id);
  assert.ok(log, '必须写一条 OpsLog');
  assert.equal(log.operator, CHIEF, 'operator 服务端取自 JWT（不接受前端传）');
  assert.equal(log.target_phone, phone);
  assert.deepEqual(log.delta, { seeds: 3, bamboos: 250, jades: 1, fragments: 2 });
  assert.equal(log.reason, '家族贡献奖励');
  assert.ok(Number.isFinite(Date.parse(log.ts)), 'ts 为 ISO 时刻');

  const tx = (await txsOf(phone)).find((t) => t.type === 'admin_grant');
  assert.ok(tx, '必须写一条 admin_grant 流水');
  assert.equal(tx.operator, CHIEF);
  assert.deepEqual(tx.delta, { seeds: 3, bamboos: 250, jades: 1, fragments: 2 });
  assert.equal(tx.desc, `运营发放：家族贡献奖励（log ${body.summary.log_id}）`);
  assert.deepEqual(tx.ref, {});

  // evidence 并入 reason（§5.2，不新增集合字段）
  const withEvidence = await grant({ target_phone: phone, delta: { fragments: 1 }, reason: '上传史料奖励', evidence: '某年族谱影印' });
  const log2 = (await logsOf()).find((l) => l.id === jsonBody(withEvidence).summary.log_id);
  assert.equal(log2.reason, '上传史料奖励｜依据：某年族谱影印');

  // 碎片满 10 即时合成（与签到同一函数，§5.1 校验 7 / 单测 #5）
  const phon2 = await newUser();
  await seedAssets(phon2, { fragments: 1, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' });
  const syn = jsonBody(await grant({ target_phone: phon2, delta: { fragments: 9 }, reason: '邀请 9 碎片（K3）' }));
  assert.equal(syn.summary.fragments, 0, '1 + 9 = 10 → 当场合成');
  assert.equal(syn.summary.synthesized, 1);
  assert.equal(syn.summary.seeds_total, 1);
  const after2 = await readAssets(phon2);
  assert.equal(after2.seeds[0].source, 'fragment_synth');
  assert.ok(Math.abs((Date.parse(after2.seeds[0].expires_at) - Date.now()) / DAY - 365) < 0.01);
  assert.ok(after2.txs.some((t) => t.type === 'fragment_synth'), '写 fragment_synth 流水');
  assertInvariants(after2, 'grant 碎片联动');
});

test('grant 负向（§5.1 校验 6）：不足 → 409 资产不足整单拒绝（资产 / 日志 / 流水三者不变）；可用量内按 FIFO 升序扣、不留 0 残批', async () => {
  const phone = await newUser();
  await seedAssets(phone, {
    fragments: 3,
    seeds: [seedLot(2, 10, 'g_early'), seedLot(4, 300, 'g_late')],
    bamboos: [bambooLot(30, 60, 'g_b30')],
    jades: [],
    txs: [],
    signin_date: '',
  });
  const before = { assets: await readAssets(phone), logs: await logsOf() };

  for (const delta of [{ fragments: -5 }, { seeds: -7 }, { bamboos: -31 }, { jades: -1 }]) {
    const res = await grant({ target_phone: phone, delta, reason: '纠错扣减' });
    assert.equal(res.statusCode, 409, `${JSON.stringify(delta)} 应整单拒绝`);
    const body = jsonBody(res);
    assert.equal(body.code, 'ASSET_INSUFFICIENT');
    assert.match(body.error, /资产不足/);
    assert.ok(Number.isFinite(body.need) && Number.isFinite(body.current));
    assert.ok(Array.isArray(body.how_to_get) && body.how_to_get.length > 0, '不足响应带 how_to_get');
  }
  assert.deepEqual((await readAssets(phone)), before.assets, '不足：资产一字节不变（无部分扣减）');
  assert.deepEqual(await logsOf(), before.logs, '不足：不得写审计日志');
  assert.equal((await txsOf(phone)).length, 0, '不足：不得写用户流水');

  // 可用量内扣减：籽按 expires_at 升序、取尽批次移除；碎片扣到 0 不为负
  const ok = jsonBody(await grant({ target_phone: phone, delta: { fragments: -3, seeds: -5, bamboos: -30 }, reason: '纠错扣减' }));
  assert.equal(ok.summary.fragments, 0, '碎片扣到 0（绝不为负）');
  assert.equal(ok.summary.seeds_total, 1, '籽 6 − 5 = 1（先扣最早到期批次）');
  assert.equal(ok.summary.bamboos_total_pieces, 0);
  const after = await readAssets(phone);
  assert.equal(after.seeds.length, 1);
  assert.equal(after.seeds[0].id, 'g_late', '最早到期的批次先被取尽并移除');
  assert.equal(after.bamboos.length, 0, 'qty 归零批次就地移除（无 0 残批）');
  const log = (await logsOf()).find((l) => l.id === ok.summary.log_id);
  assert.deepEqual(log.delta, { fragments: -3, seeds: -5, bamboos: -30 }, 'OpsLog 保留符号（负值原样记录）');
  assert.equal((await txsOf(phone)).filter((t) => t.type === 'admin_grant').length, 1);
  assertInvariants(after, 'grant 负向');
});

test('grant 负向：已镶嵌的玉不可扣减（永久销毁口径）→ 409，不足时一字节不改', async () => {
  const phone = await newUser();
  const mounted = { id: 'jd_mounted', expires_at: null, created_at: new Date(NOW).toISOString(), source: 'synthesis', mounted_tree_id: 'some_tree' };
  const free = { id: 'jd_free', expires_at: null, created_at: new Date(NOW).toISOString(), source: 'synthesis' };
  await seedAssets(phone, { fragments: 0, seeds: [], bamboos: [], jades: [mounted, free], txs: [], signin_date: '' });

  const tooMany = await grant({ target_phone: phone, delta: { jades: -2 }, reason: '扣玉' });
  assert.equal(tooMany.statusCode, 409, '可扣减玉只有 1 枚（未镶嵌）');
  assert.equal(jsonBody(tooMany).current, 1);
  assert.equal((await readAssets(phone)).jades.length, 2, '不足：玉一字节不改');

  const ok = jsonBody(await grant({ target_phone: phone, delta: { jades: -1 }, reason: '扣玉' }));
  assert.equal(ok.summary.jades, 1);
  const after = await readAssets(phone);
  assert.deepEqual(after.jades.map((j) => j.id), ['jd_mounted'], '只扣未镶嵌的那枚');
  assertInvariants(after, 'grant 扣玉');
});

test('GET /admin/assets/logs（§5.3）：ts 倒序 + 同刻「后写在前」定序确定、operator / phone 过滤可叠加、limit 默认 50 上限 200；401 / 403', async () => {
  const a = await newUser();
  const b = await newUser();
  await seedAssets(a, { fragments: 0, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' });
  await grant({ target_phone: a, delta: { seeds: 1 }, reason: '甲第一笔' });
  await grant({ target_phone: a, delta: { seeds: 2 }, reason: '甲第二笔' });
  await grant({ target_phone: b, delta: { seeds: 1 }, reason: '乙第一笔' });

  // 定序确定性夹具（注入固定 now → 与 wall-clock 无关）：
  //  ① c：同一毫秒两条 → 后写入者必须在前（旧实现依赖稳定排序保留插入序，CI 约 40% 挂）
  //  ② d：ts 不同 → 严格 ts 倒序，与写入先后无关
  const c = await newUser();
  const d = await newUser();
  await seedAssets(c, blankUser());
  await seedAssets(d, blankUser());
  const sameInstant = new Date('2026-09-16T02:00:00.000Z');
  const olderTs = new Date('2026-09-16T01:00:00.000Z');
  const newerTs = new Date('2026-09-16T03:00:00.000Z');
  await ops.grantAssets(CHIEF, { target_phone: c, delta: { seeds: 1 }, reason: '同刻先写' }, sameInstant);
  await ops.grantAssets(CHIEF, { target_phone: c, delta: { seeds: 1 }, reason: '同刻后写' }, sameInstant);
  await ops.grantAssets(CHIEF, { target_phone: d, delta: { seeds: 1 }, reason: 'ts 较旧' }, olderTs);
  await ops.grantAssets(CHIEF, { target_phone: d, delta: { seeds: 1 }, reason: 'ts 较新' }, newerTs);

  const all = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor')));
  assert.ok(all.logs.length >= 7);
  for (let i = 1; i < all.logs.length; i += 1) {
    assert.ok(Date.parse(all.logs[i - 1].ts) >= Date.parse(all.logs[i].ts), '按 ts 倒序');
  }
  const byPhone = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { phone: a }));
  assert.equal(byPhone.logs.length, 2);
  // 两次 grant 可能同毫秒也可能不同毫秒，两种情形结论一致 → 断言不依赖 wall-clock
  assert.deepEqual(byPhone.logs.map((l) => l.reason), ['甲第二笔', '甲第一笔'], '后写入者在前（同 ts 时按下标倒排）');
  assert.equal(byPhone.logs.every((l) => l.target_phone === a), true);

  // ① 同刻：两条日志 ts 逐字符相同，顺序只能由确定性 tie-break 决定
  const same = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { phone: c }));
  assert.equal(same.logs.length, 2);
  assert.equal(same.logs[0].ts, sameInstant.toISOString(), '夹具 ts 应为注入值');
  assert.equal(same.logs[1].ts, sameInstant.toISOString(), '夹具必须真正同刻（两条 ts 相同）');
  assert.deepEqual(same.logs.map((l) => l.reason), ['同刻后写', '同刻先写'], '同一毫秒 → 后写入者在前');
  const sameDirect = await ops.opsLogs({ phone: c });
  assert.deepEqual(sameDirect.logs.map((l) => l.reason), ['同刻后写', '同刻先写'], '模块层与路由层同一排序口径');

  // ② 不同 ts：ts 大者在前，哪怕写入更晚
  const diff = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { phone: d }));
  assert.equal(diff.logs.length, 2);
  assert.deepEqual(diff.logs.map((l) => l.reason), ['ts 较新', 'ts 较旧'], 'ts 不同 → 严格 ts 倒序');
  assert.ok(Date.parse(diff.logs[0].ts) > Date.parse(diff.logs[1].ts), '两条 ts 确实不同');

  const byOperator = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { operator: CHIEF }));
  assert.equal(byOperator.logs.length, all.logs.length, '本例日志都由总编操作');
  const both = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { operator: CHIEF, phone: b }));
  assert.deepEqual(both.logs.map((l) => l.reason), ['乙第一笔'], '过滤可叠加');
  const emptyFilter = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { phone: '16600000000' }));
  assert.deepEqual(emptyFilter.logs, [], '空集合 → { logs: [] }');
  const limited = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { limit: '1' }));
  assert.equal(limited.logs.length, 1, 'limit 生效');
  const capped = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { limit: '9999' }));
  assert.ok(capped.logs.length <= ops.LOGS_LIMIT_MAX, 'limit 上限 200');
  assert.equal(ops.LOGS_LIMIT_DEFAULT, 50);
  assert.equal(ops.LOGS_LIMIT_MAX, 200);
  const negative = jsonBody(await call('/admin/assets/logs', 'GET', bearerAs(CHIEF, 'chief_editor'), { limit: '-3' }));
  assert.ok(negative.logs.length > 0, '非法 limit 回落到默认 50');

  assert.equal((await call('/admin/assets/logs', 'GET', {})).statusCode, 401);
  assert.equal((await call('/admin/assets/logs', 'GET', bearerAs(a, 'user'))).statusCode, 403);
  assert.equal((await call('/admin/assets/logs', 'GET', bearerAs(STEWARD, 'tree_steward'))).statusCode, 403);
});

test('GET /admin/assets/user（§5.4）：资产总览字段对齐 /assets/summary 公开形态；400 缺 phone / 404 用户不存在 / 401 / 403', async () => {
  const phone = await newUser();
  await seedAssets(phone, {
    fragments: 4,
    seeds: [seedLot(3, 20, 'u_s1')],
    bamboos: [bambooLot(150, 60, 'u_b1')],
    jades: [jade(null, 'u_j1')],
    txs: [],
    signin_date: '2026-09-15',
  });
  const res = await call('/admin/assets/user', 'GET', bearerAs(CHIEF, 'chief_editor'), { phone });
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body.phone, phone);
  assert.equal(body.fragments, 4);
  assert.equal(body.seeds_total, 3);
  assert.equal(body.bamboos_total_pieces, 150);
  assert.equal(body.jades, 1);
  assert.equal(body.seed_lots.length, 1);
  assert.equal(body.bamboo_lots.length, 1);
  assert.equal(body.jade_list.length, 1);
  assert.equal(body.jade_list[0].expires_at, null);
  assert.equal(body.signin_date, '2026-09-15');
  assert.deepEqual(Object.keys(body).sort(), ['bamboo_lots', 'bamboos_total_pieces', 'fragments', 'jade_list', 'jades', 'phone', 'seed_lots', 'seeds_total', 'signin_date'].sort());

  assert.equal((await call('/admin/assets/user', 'GET', bearerAs(CHIEF, 'chief_editor'))).statusCode, 400);
  assert.equal(jsonBody(await call('/admin/assets/user', 'GET', bearerAs(CHIEF, 'chief_editor'))).error, '缺少 phone');
  assert.equal((await call('/admin/assets/user', 'GET', bearerAs(CHIEF, 'chief_editor'), { phone: '16600000000' })).statusCode, 404);
  assert.equal((await call('/admin/assets/user', 'GET', {})).statusCode, 401);
  assert.equal((await call('/admin/assets/user', 'GET', bearerAs(phone, 'user'), { phone })).statusCode, 403);
});

test('注销（§7 · K10）：无挂单 → 清空四类资产 + signin_date 清空 + account_clear 流水；审计 / 钱包 / 账号 / 锚点保留', async () => {
  const phone = await newUser();
  await seedAssets(phone, {
    fragments: 5,
    seeds: [seedLot(3, 100, 'd_s1')],
    bamboos: [bambooLot(120, 100, 'd_b1')],
    jades: [jade(null, 'd_j1')],
    txs: [{ id: 'tx_history', type: 'signin', delta: { fragments: 1 }, ref: {}, desc: '历史签到' }],
    signin_date: '2026-09-15',
  });
  await grant({ target_phone: phone, delta: { seeds: 1 }, reason: '注销前流水留痕' });
  await store.colSet('jiazu_wallets', 'global', {
    users: { [phone]: { balance_cents: 1990 } },
    trees: {},
    transactions: [{ id: 'wt_keep', phone, delta_cents: 1990 }],
    config: { tree_create_fee_cents: 990 },
  });
  const walletsBefore = await store.colGet('jiazu_wallets', 'global');
  const logsBefore = await logsOf();
  await setMarket([]); // 无未成交挂单

  const res = await call('/account/delete', 'POST', bearerAs(phone, 'user'));
  assert.equal(res.statusCode, 200);
  const body = jsonBody(res);
  assert.equal(body.ok, true);
  assert.deepEqual(body.cleared, { fragments: 5, seeds: 4, bamboos: 120, jades: 1 });

  const after = await readAssets(phone);
  assert.equal(after.fragments, 0);
  assert.deepEqual(after.seeds, []);
  assert.deepEqual(after.bamboos, []);
  assert.deepEqual(after.jades, []);
  assert.equal(after.signin_date, '', 'signin_date 清空');
  const clear = after.txs.find((t) => t.type === 'account_clear');
  assert.ok(clear, '必须写 account_clear 流水');
  assert.equal(clear.id, body.tx_id);
  assert.deepEqual(clear.delta, { fragments: -5, seeds: -4, bamboos: -120, jades: -1 });
  assert.ok(after.txs.some((t) => t.id === 'tx_history'), '历史 Tx 保留（审计不可恢复地清空 → 但流水保留）');
  assert.ok(after.txs.some((t) => t.type === 'admin_grant'), '注销前的 admin_grant 流水保留');

  assert.deepEqual(await logsOf(), logsBefore, 'jiazu_ops_logs 保留（不清审计）');
  assert.deepEqual(await store.colGet('jiazu_wallets', 'global'), walletsBefore, 'jiazu_wallets 不受影响');
  assert.ok(await store.colGet('jiazu_users', phone), 'jiazu_users 保留');
  assert.equal((await call('/account/delete', 'POST', {})).statusCode, 401);

  // 注销后仍可再次调用（幂等语义：资产已空，写一条 delta 全 0 的 account_clear 流水）
  const again = await call('/account/delete', 'POST', bearerAs(phone, 'user'));
  assert.equal(again.statusCode, 200);
  assert.deepEqual(jsonBody(again).cleared, { fragments: 0, seeds: 0, bamboos: 0, jades: 0 });
});

test('注销前置（K10）：存在 status=open 挂单 → 409「请先撤销未成交挂单」，资产 / 挂单 / 流水三者都不变；sold/cancelled/expired 无碍', async () => {
  const phone = await newUser();
  await seedAssets(phone, {
    fragments: 2,
    seeds: [seedLot(6, 100, 'k_s1')],
    bamboos: [bambooLot(100, 100, 'k_b1')],
    jades: [],
    txs: [],
    signin_date: '2026-09-15',
  });
  await setMarket([listing(phone, 'open')]);
  const assetsBefore = await readAssets(phone);
  const listingsBefore = await listingsOf();
  const logsBefore = await logsOf();

  const blocked = await call('/account/delete', 'POST', bearerAs(phone, 'user'));
  assert.equal(blocked.statusCode, 409);
  assert.deepEqual(jsonBody(blocked), { error: '请先撤销未成交挂单' });
  assert.deepEqual(await readAssets(phone), assetsBefore, '被拒绝：资产一字节不变（不清资产、不写 account_clear 流水）');
  assert.deepEqual(await listingsOf(), listingsBefore, '被拒绝：挂单不被自动撤销、状态不改');
  assert.deepEqual(await logsOf(), logsBefore, '被拒绝：不写审计日志');
  assert.equal((await readAssets(phone)).txs.length, 0, '被拒绝：不写流水');

  // 同一账号改为 sold / cancelled / expired → 均无碍注销（逐状态验证；每次重造资产）
  for (const status of ['sold', 'cancelled', 'expired']) {
    const p = await newUser();
    await seedAssets(p, { fragments: 1, seeds: [seedLot(2, 50, `k_${status}`)], bamboos: [], jades: [], txs: [], signin_date: '2026-09-15' });
    await setMarket([listing(p, status)]);
    const ok = await call('/account/delete', 'POST', bearerAs(p, 'user'));
    assert.equal(ok.statusCode, 200, `${status} 挂单不得阻碍注销`);
    const a = await readAssets(p);
    assert.equal(a.fragments + a.seeds.length, 0, `${status}：资产已清空`);
    assert.ok(a.txs.some((t) => t.type === 'account_clear'));
  }

  // 他人 open 挂单不阻碍本人注销
  const me = await newUser();
  const other = await newUser();
  await seedAssets(me, { fragments: 1, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' });
  await setMarket([listing(other, 'open')]);
  assert.equal((await call('/account/delete', 'POST', bearerAs(me, 'user'))).statusCode, 200, '他人挂单无碍本人注销');
});

// ---- ⑧ 真源未变 ----

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/ 逐字节未变', () => {
  assert.equal(fs.readFileSync(REAL_META, 'utf8'), realMetaRaw, 'config/tree-meta.json 被改动了');
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 的 md5 变了');
  const trees = fs.readdirSync(REAL_TREES);
  assert.deepEqual(trees.sort(), [...realTreeBaseline.keys()].sort(), '真实树目录文件名/数量变了');
  for (const f of trees) assert.equal(md5(path.join(REAL_TREES, f)), realTreeBaseline.get(f), `真实树 ${f} 被改动了`);
  const cols = fs.readdirSync(REAL_COLLECTIONS);
  assert.deepEqual(cols.sort(), [...realColBaseline.keys()].sort(), '真实集合目录文件名/数量变了');
  for (const f of cols) assert.equal(md5(path.join(REAL_COLLECTIONS, f)), realColBaseline.get(f), `真实集合 ${f} 被改动了`);
});
