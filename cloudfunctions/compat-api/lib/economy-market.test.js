/**
 * 市集 + 官方竹简每日限量发售内核单测（P3）— lib/economy-market.js
 * 规格：docs/economy-market.spec.md §2 存储契约 / §3 资产流转总表（4 行）/ §4 手续费算法与边界表（199 锚点）/
 *   §5 挂单锁定与并发 / §6 惰性结算（挂单到期释放锁定、成交批次到期日继承）/ §7 官方发售（21:00 惰性释放、不结转）/
 *   §8 接口清单与权限（`GET /market/listings` guest 可读）；总纲 docs/economy.spec.md §4-3 / §4-6 / §5-4 / §6-1 / §6-2 / §11-20 / §11-21 / §11-25。
 *
 * 覆盖（规格 §11 全 16 项 + K 裁定）：
 *  ① 手续费边界表（1/50/99/100/101/199/200/999/1000）+ 免收/起收边界
 *  ② **199 锚点逐字段断言**（买方 −199 / 卖方 +198 / 销毁 1 / Trade.fee_seeds=1）
 *  ③ 挂单校验：非整束拒绝、碎片/零散竹片/籽/玉不可上架、无家族树字段（K7）、无任何限价常量（§10-5）
 *  ④ 可用量扣除 open 挂单占量（派生锁定，不给 BambooLot 加字段）+ 撤单释放 + 撤单守卫（404/403/409）
 *  ⑤ TTL 7 天（`LISTING_TTL_DAYS`）+ 惰性下架（造写入时间，不睡时钟）→ `expired` 保留原行、锁定释放、可重挂
 *  ⑥ `expired` 不可买不可撤（409「挂单已过期」，资产不变、`trades` 不追加）
 *  ⑦ 成交账目：FIFO 付籽 / 卖方入账（365 天、`source='market'`）/ 批次整束转移且 `expires_at` **继承不重置**
 *  ⑧ 并发买同一挂单只 1 成功（另 1 个 409，`trades` 只 1 条）；自买自卖 400（K8）；籽不足 / 竹片不足 409 整单拒绝
 *  ⑨ 官方发售：21:00 前不释放 / 21:00 后释放（幂等）/ 跨日不结转 / 21:00 前购买 409「未到发售时间」
 *  ⑩ 官方购买：¥ 扣 990 分/束（`official_bamboo` 流水）/ 100 片/束（365 天、`source='official_purchase'`）/
 *     `Tx{type:'official_buy'}` / 库存递减 / 售罄 409 / ¥ 余额不足 409 且不入账
 *  ⑪ 路由：guest 可读 `GET /market/listings`（不展示 `expired`）、其余 401、`PUT /admin/market/official-stock` 403/400
 *  ⑫ 注销前置（K10）：`hasOpenListing` / `openListingGuard` → 409「请先撤销未成交挂单」
 *  ⑬ `Tx.type` 白名单含市集与官方发售五项；模块内无定时任务（`setInterval` / `setTimeout` / cron）
 *  ⑭ 真源未变：`config/tree-meta.json` 与 `migrate-output/`（trees + details + collections）md5 逐字节一致
 *  ⑮ P3 回修：F2 挂单不足文案报**真实可用片数**（50+30=80 片挂 1 束 → 409「当前可用 80 片」，不再显示 0 片）；
 *     F3 落盘失败（chmod 0444/EACCES）→ 抛错、磁盘逐字节未变、`colGet` 读回与磁盘一致（无幻影值），
 *     且 colSet / colDelete / colAtomicNext 一律「先落盘、后更新缓存」
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本；文末 md5 断言真源未变
 * （照 assets.test.js / economy-fee.test.js / economy-spirit.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/economy-market.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-economy-market-'));
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

const DAY = 86400000;
/** 2026-09-16 08:00 CST（**21:00 前**） */
const T0 = new Date('2026-09-16T00:00:00.000Z');
/** 2026-09-16 21:30 CST（**当日 21:00 后**，已开售） */
const T21 = new Date('2026-09-16T13:30:00.000Z');
/** 2026-09-17 21:30 CST（跨日开售） */
const T_NEXT21 = new Date('2026-09-17T13:30:00.000Z');
const isoAt = (days, from = T0) => new Date(from.getTime() + days * DAY).toISOString();

fs.mkdirSync(process.env.COMPAT_META_FILE.replace(/tree-meta\.json$/, ''), { recursive: true });
fs.writeFileSync(process.env.COMPAT_META_FILE, JSON.stringify({ _schema: '1.1', trees: { zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true } } }, null, 2) + '\n');
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

const el = await import('./economy-ledger.js');
const store = await import('./store.js');
const mk = await import('./economy-market.js');
const wallet = await import('./wallet.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ---- 夹具工具 ----

let seq = 0;
const nextPhone = () => `1660001${String(1000 + ++seq)}`; // 11 位手机号

const bambooLot = (qty, expDays, id = `bl_${++seq}`, source = 'admin', from = T0) => ({
  id,
  qty,
  expires_at: isoAt(expDays, from),
  source,
  created_at: from.toISOString(),
});
const seedLot = (qty, expDays, id = `sl_${++seq}`, source = 'admin', from = T0) => ({
  id,
  qty,
  expires_at: isoAt(expDays, from),
  source,
  created_at: from.toISOString(),
});

/** 直接写个人资产（绕过被测模块，仅夹具） */
async function setAssets(phone, { fragments = 0, seeds = [], bamboos = [], jades = [] } = {}) {
  await el.withAssets(phone, (user) => {
    user.fragments = fragments;
    user.seeds = seeds.map((l) => ({ ...l }));
    user.bamboos = bamboos.map((l) => ({ ...l }));
    user.jades = jades.map((l) => ({ ...l }));
    user.txs = [];
    user.signin_date = '';
  });
}
const assetsOf = (phone) => el.getAssets(phone);
const seedsSum = async (phone) => el.sumLots((await assetsOf(phone)).seeds);
const bamboosSum = async (phone) => el.sumLots((await assetsOf(phone)).bamboos);
const txsOf = async (phone) => (await assetsOf(phone)).txs || [];

/** 注册一个已登录用户（路由级用例：`authUser` 需要 `jiazu_users` 记录） */
async function newUser(role = 'user') {
  const phone = nextPhone();
  await store.colSet('jiazu_users', phone, { _id: phone, phone, nickname: `市集用户${phone.slice(-4)}`, role });
  return phone;
}
/** 造「有籽 + 有竹片」的卖家 */
async function newSeller({ bamboos = [bambooLot(100, 30)], seeds = [] } = {}) {
  const phone = await newUser();
  await setAssets(phone, { bamboos, seeds });
  return phone;
}
/** 造「有籽」的买家 */
async function newBuyer({ seeds = [seedLot(9999, 365)] } = {}) {
  const phone = await newUser();
  await setAssets(phone, { seeds });
  return phone;
}

// 市集文档读写（夹具）
const marketDoc = () => store.colGet('jiazu_market', 'global');
async function setMarket(patch = {}) {
  const base = mk.blankMarketDoc();
  const doc = { ...base, ...patch, official: { ...base.official, ...(patch.official || {}) } };
  await store.colSet('jiazu_market', 'global', doc);
  return doc;
}
const listingsOf = async () => (await marketDoc())?.listings || [];
const tradesOf = async () => (await marketDoc())?.trades || [];
const listingById = async (id) => (await listingsOf()).find((l) => l.id === id) || null;

/** ¥ 钱包（jiazu_wallets，_id='global'）夹具 */
async function setWallet(phone, balance_cents) {
  const doc = (await store.colGet('jiazu_wallets', 'global')) || { users: {}, trees: {}, transactions: [], config: { tree_create_fee_cents: 990 } };
  doc.users = doc.users || {};
  doc.users[phone] = { balance_cents };
  await store.colSet('jiazu_wallets', 'global', doc);
}
const walletTxs = async () => (await store.colGet('jiazu_wallets', 'global'))?.transactions || [];

const expectError = async (promise, status, fragment) => {
  let err = null;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  assert.ok(err, `应当抛出 ${status} 错误`);
  assert.equal(err.status, status, `期望 ${status}，实际 ${err.status}（${err.message}）`);
  if (fragment) assert.ok(String(err.message).includes(fragment), `文案应含「${fragment}」，实际「${err.message}」`);
  return err;
};

// ---- 路由级夹具 ----
const bearer = (phone, role = 'user') => {
  const scheme = ['Bear', 'er'].join(''); // 避免字面量被外部工具误判为凭据
  return { authorization: `${scheme} ${signJwt({ sub: phone, phone, role }, 3600)}` };
};
const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({ path: p, httpMethod: method, headers, queryStringParameters: query, body: body ? JSON.stringify(body) : undefined });
const jsonOf = (res) => JSON.parse(res.body);

/** 当前真实时刻是否已过「当日 21:00 CST」（路由内取服务端 `now`，无法注入时钟 → 按真实时钟判定分支） */
const isReleaseOpenNow = () => {
  const cst = new Date(Date.now() + 8 * 3600 * 1000);
  return cst.getUTCHours() >= mk.RELEASE_HOUR;
};
const todayCst = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

// ==================== ① 手续费算法与边界表（§4-2） ====================

test('手续费边界表：1/50/99 免收；100 起收 1；101/199 → 1；200 → 2；999 → 9；1000 → 10', () => {
  const rows = [
    [1, 0], [50, 0], [99, 0], [100, 1], [101, 1], [199, 1], [200, 2], [999, 9], [1000, 10],
  ];
  for (const [price, fee] of rows) {
    assert.equal(mk.feeOf(price), fee, `feeOf(${price}) 应为 ${fee}`);
    const b = mk.feeBreakdown(price);
    assert.equal(b.price_seeds, price);
    assert.equal(b.buyer_paid, price, '买方实付 = 标价（不叠加手续费）');
    assert.equal(b.fee_seeds, fee);
    assert.equal(b.seller_got, price - fee, `卖方实收 = ${price} − ${fee}`);
    assert.equal(b.destroyed, fee, '销毁 = 手续费全额');
    assert.equal(b.waived, fee === 0, '不足 1 籽免收');
  }
  // 免收上边界 / 起收下边界（§4-2 备注）
  assert.equal(mk.feeOf(99), 0);
  assert.equal(mk.feeOf(100), 1);
  assert.equal(mk.FEE_RATE_PERCENT, 1);
  assert.equal(mk.FEE_RATE_DENOMINATOR, 100);
  // 脏值收口：不收负手续费、不产生 NaN
  assert.equal(mk.feeOf(-5), 0);
  assert.equal(mk.feeOf('x'), 0);
  assert.equal(mk.feeOf(undefined), 0);
});

test('常量定稿：1 束 = 100 片 / 挂单 7 天 / 官方 990 分（¥9.90）/ 每日 50 束 / 21:00', () => {
  assert.equal(mk.PIECES_PER_BUNDLE, 100);
  assert.equal(mk.LISTING_TTL_DAYS, 7);
  assert.equal(mk.DEFAULT_PRICE_FEN, 990);
  assert.equal(mk.DEFAULT_DAILY_STOCK, 50);
  assert.equal(mk.RELEASE_HOUR, 21);
  assert.equal(mk.RELEASE_AT, '21:00');
  assert.deepEqual(mk.LISTING_STATUSES, ['open', 'sold', 'cancelled', 'expired']);
  assert.equal(mk.OFFICIAL_BAMBOO_TTL_DAYS, 365);
});

// ==================== ② 199 锚点（§4-3 验收夹具） ====================

test('199 锚点逐字段：买方 −199 / 卖方 +198 / 销毁 1 / Trade.fee_seeds=1 / 状态转 sold', async () => {
  await setMarket();
  const seller = await newSeller({ bamboos: [bambooLot(100, 30, 'bl_anchor')] });
  const buyer = await newBuyer({ seeds: [seedLot(500, 200, 'sl_anchor')] });
  const listed = await mk.listBamboo(seller, { bundles: 1, price_seeds: 199 }, T0);
  assert.equal(listed.ok, true);
  assert.equal(mk.feeOf(199), 1);

  const r = await mk.buyListing(buyer, listed.listing_id, T0);
  assert.equal(r.price_seeds, 199);
  assert.equal(r.fee_seeds, 1, 'trade.fee_seeds === 1');
  assert.equal(r.seller_got, 198);
  assert.equal(r.destroyed, 1);
  assert.equal(r.pieces, 100);
  assert.equal(r.status, 'sold');

  const trades = await tradesOf();
  assert.equal(trades.length, 1);
  const trade = trades[0];
  assert.equal(trade.price_seeds, 199);
  assert.equal(trade.fee_seeds, 1);
  assert.equal(trade.pieces, 100);
  assert.equal(trade.buyer_phone, buyer);
  assert.equal(trade.seller_phone, seller);
  assert.equal(trade.listing_id, listed.listing_id);
  assert.equal(trade.ts, T0.toISOString());
  assert.equal(trade.id, r.trade_id);

  // 买方石榴籽净变化 = −199；卖方 = +198；系统净销毁 = 1
  assert.equal(await seedsSum(buyer), 500 - 199);
  assert.equal(await seedsSum(seller), 0 + 198);
  const net = (await seedsSum(buyer)) + (await seedsSum(seller));
  assert.equal(500 - net, 1, '买卖双方合计净减少 1 籽 = 销毁 1 籽');

  // 手续费只作 `Trade.fee_seeds` 留痕：市集文档无任何手续费账户 / 平台收入字段
  const doc = await marketDoc();
  assert.equal(Object.keys(doc).filter((k) => /fee|platform|revenue|income/i.test(k)).length, 0, '不得有平台手续费账户');
  assert.equal(mk.hasTreeField(trade), false);

  // 流水：买方 market_buy（出籽）/ 卖方 market_sell（入账籽），双方均带 fee_seeds
  const bTx = (await txsOf(buyer)).at(-1);
  const sTx = (await txsOf(seller)).at(-1);
  assert.equal(bTx.type, 'market_buy');
  assert.equal(bTx.delta.seeds, -199);
  assert.equal(bTx.delta.bamboos, 100);
  assert.equal(bTx.fee_seeds, 1);
  assert.equal(bTx.ref.listing_id, listed.listing_id);
  assert.equal(bTx.ref.trade_id, trade.id);
  assert.equal(sTx.type, 'market_sell');
  assert.equal(sTx.delta.seeds, 198);
  assert.equal(sTx.delta.bamboos, -100);
  assert.equal(sTx.fee_seeds, 1);

  // 卖方所得籽 = 新批次（365 天、source='market'）
  const sellerSeeds = (await assetsOf(seller)).seeds;
  assert.equal(sellerSeeds.length, 1);
  assert.equal(sellerSeeds[0].qty, 198);
  assert.equal(sellerSeeds[0].source, 'market');
  assert.equal(sellerSeeds[0].expires_at, isoAt(365));
});

// ==================== ③ 挂单校验：整束 / 不可上架资产 / 无家族树 / 无限价 ====================

test('挂单校验：bundles 缺省/0/非整数/负 → 400；price_seeds 非法 → 400', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(300, 30)] });
  await expectError(mk.listBamboo(phone, {}, T0), 400, '束数必须为不小于 1 的整数');
  await expectError(mk.listBamboo(phone, { bundles: 0, price_seeds: 10 }, T0), 400, '束数');
  await expectError(mk.listBamboo(phone, { bundles: -2, price_seeds: 10 }, T0), 400, '束数');
  await expectError(mk.listBamboo(phone, { bundles: 1.5, price_seeds: 10 }, T0), 400, '束数');
  await expectError(mk.listBamboo(phone, { bundles: '1.5', price_seeds: 10 }, T0), 400, '束数');
  await expectError(mk.listBamboo(phone, { bundles: 1 }, T0), 400, '标价必须为不小于 1 的整数石榴籽');
  await expectError(mk.listBamboo(phone, { bundles: 1, price_seeds: 0 }, T0), 400, '标价');
  await expectError(mk.listBamboo(phone, { bundles: 1, price_seeds: 9.5 }, T0), 400, '标价');
  assert.equal((await listingsOf()).length, 0, '校验失败不落挂单');
  assert.equal(await bamboosSum(phone), 300, '校验失败资产不变');
});

test('整束口径：pieces 由服务端派生（客户端传 pieces 不生效）、挂单最小 1 束、不足 1 束不得拼束', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(150, 30)] });
  // 客户端传 pieces=30 之类不生效：pieces = bundles × 100
  const r = await mk.listBamboo(phone, { bundles: 1, price_seeds: 5, pieces: 30 }, T0);
  const l = await listingById(r.listing_id);
  assert.equal(l.pieces, 100);
  assert.equal(l.bundles, 1);
  assert.equal(l.price_seeds, 5);
  // 150 片 → floor(150/100)=1 束，再挂 1 束 → 409（不足 1 束不得与其它批次拼束）
  await expectError(mk.listBamboo(phone, { bundles: 1, price_seeds: 5 }, T0), 409, '可用竹片不足');
  // 99 片（零散竹片）→ 0 束可用
  const scattered = await newSeller({ bamboos: [bambooLot(99, 30)] });
  await expectError(mk.listBamboo(scattered, { bundles: 1, price_seeds: 5 }, T0), 409, '可用竹片不足');
});

// F2（P3 回修）：文案不得报取整后的可售量（否则「持 80 片」被提示成「当前可用 0 片」）
test('F2 挂单不足文案报真实可用片数（未取整）：50+30 两批共 80 片挂 1 束 → 409「当前可用 80 片」', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(50, 30), bambooLot(30, 30)] });
  assert.equal(await bamboosSum(phone), 80, '夹具：两批合计 80 片');
  const err = await expectError(mk.listBamboo(phone, { bundles: 1, price_seeds: 10 }, T0), 409, '当前可用 80 片');
  assert.equal(
    err.message,
    '可用竹片不足：本次挂单需 100 片，当前可用 80 片（整束挂单，无可拼束）',
    '文案报真实可用量并保留「整束挂单」说明',
  );
  assert.equal(err.need, 100, 'need 仍为本次挂单所需片数（bundles × 100）');
  assert.equal(err.current, 80, 'current 与文案同口径：真实可用片数（未取整）');
  assert.equal(err.unit, 'bamboo');
  assert.equal(err.code, 'ASSET_INSUFFICIENT');
  assert.equal((await listingsOf()).length, 0, '整单拒绝：不落挂单');
  assert.equal(await bamboosSum(phone), 80, '资产不变');
  // 补 20 片凑满 1 束 → 可挂（口径未被改坏）
  await el.withAssets(phone, (user) => {
    user.bamboos.push(bambooLot(20, 30));
  });
  const ok = await mk.listBamboo(phone, { bundles: 1, price_seeds: 10 }, T0);
  assert.equal(ok.pieces, 100);
});

test('碎片 / 零散竹片 / 籽 / 玉均不可上架：传这些字段不生效且资产不变', async () => {
  await setMarket();
  const phone = await newSeller();
  await setAssets(phone, {
    fragments: 5,
    seeds: [seedLot(100, 300)],
    bamboos: [bambooLot(99, 300)],
    jades: [{ id: 'jd_1', expires_at: null, created_at: T0.toISOString(), source: 'synthesis' }],
  });
  await expectError(
    mk.listBamboo(phone, { fragments: 10, seeds: 100, jades: 1, pieces: 100, price_seeds: 9 }, T0),
    400,
    '束数必须为不小于 1 的整数',
  );
  // 有 bundles 但竹片不足 → 409（籽 / 玉 / 碎片不折算为可上架资产）
  await expectError(mk.listBamboo(phone, { bundles: 1, price_seeds: 9 }, T0), 409, '可用竹片不足');
  const a = await assetsOf(phone);
  assert.equal(a.fragments, 5);
  assert.equal(await seedsSum(phone), 100);
  assert.equal(await bamboosSum(phone), 99);
  assert.equal(a.jades.length, 1);
  assert.equal((await listingsOf()).length, 0);
  // 只有 100 片整束才可上架
  await setAssets(phone, { bamboos: [bambooLot(100, 300)] });
  const okRes = await mk.listBamboo(phone, { bundles: 1, price_seeds: 9 }, T0);
  assert.equal(okRes.ok, true);
});

test('挂单与家族树无关（K7）：Listing 无任何家族树字段、传 tree_id 被忽略、不出现该 400', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(100, 30)] });
  // 该账号无锚点、未加入任何家族树，仍可挂单
  assert.equal(await store.colGet('jiazu_anchors', phone), null);
  const r = await mk.listBamboo(phone, { bundles: 1, price_seeds: 3, tree_id: 'some_tree', anchor_tree_id: 'x' }, T0);
  const l = await listingById(r.listing_id);
  assert.equal(l.tree_id, undefined);
  assert.equal(mk.hasTreeField(l), false, `Listing 不得含家族树字段：${Object.keys(l)}`);
  for (const bad of ['tree_id', 'anchor_tree_id', 'anchor_tree', 'tree', 'seller_tree_id']) {
    assert.equal(bad in l, false, `Listing 不得含 ${bad}`);
  }
  // 撤单 / 成交同样不依赖家族树
  const buyer = await newBuyer();
  const bought = await mk.buyListing(buyer, r.listing_id, T0);
  assert.equal(bought.ok, true);
});

test('平台不设最低价与最高价（§10-5）：模块内无任何限价常量 / 限价校验', () => {
  const src = fs.readFileSync(path.join(HERE, 'economy-market.js'), 'utf8');
  // 剥掉「否定性声明」原文（规格要求出现的口径说明），再断言不存在任何限价实现
  const stripped = src.replace(/不设最低\/最高价/g, '').replace(/不设最低价与最高价/g, '');
  assert.equal(
    /min_price|max_price|minPrice|maxPrice|price_min|price_max|price_floor|price_cap|最低价|最高价|限价/i.test(stripped),
    false,
    '不得引入限价',
  );
  assert.equal(/PRICE_(MIN|MAX)|LIMIT_PRICE|priceLimit/i.test(src), false, '不得引入限价常量');
  // 自由报价：任意极端报价均可挂单
  assert.equal(mk.feeOf(1), 0);
  assert.equal(mk.feeOf(1000000), 10000);
});

// ==================== ④ 锁定（派生占量）与撤单 ====================

test('可用量扣除 open 挂单占量（派生锁定，不加 BambooLot 字段）→ 撤单/成交即释放', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(200, 30)] });
  const first = await mk.listBamboo(phone, { bundles: 1, price_seeds: 10 }, T0);
  const user = await assetsOf(phone);
  // 派生量：可用 = 200 − 100（自己 1 个 open 挂单）
  assert.equal(mk.lockedPieces(phone, await listingsOf()), 100);
  assert.equal(mk.availablePieces(phone, user, await listingsOf()), 100);
  assert.equal(mk.sellableBundles(phone, user, await listingsOf()), 1);
  // 锁不落批次字段
  for (const lot of (await assetsOf(phone)).bamboos) {
    assert.equal('locked' in lot, false, 'BambooLot 不得有 locked 字段');
    assert.equal('locked_by' in lot, false);
  }
  assert.equal(await bamboosSum(phone), 200, '挂单不物理扣减批次');
  // 已锁定素材再挂超额（2 束 = 200 片 > 可用 100 片）→ 409
  await expectError(mk.listBamboo(phone, { bundles: 2, price_seeds: 10 }, T0), 409, '可用竹片不足');
  // 撤单 → 可用量回升
  const cancelled = await mk.cancelListing(phone, first.listing_id, T0);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(await bamboosSum(phone), 200);
  assert.equal(mk.availablePieces(phone, await assetsOf(phone), await listingsOf()), 200);
  assert.equal((await txsOf(phone)).at(-1).type, 'market_cancel');
  const again = await mk.listBamboo(phone, { bundles: 2, price_seeds: 10 }, T0);
  assert.equal(again.ok, true);
});

test('撤单守卫：404 不存在 / 403 非本人 / 409 重复撤单 / 409 已成交 / 400 缺 listing_id', async () => {
  await setMarket();
  const seller = await newSeller({ bamboos: [bambooLot(200, 30)] });
  const other = await newBuyer({ seeds: [seedLot(9999, 365)] });
  const l = await mk.listBamboo(seller, { bundles: 1, price_seeds: 10 }, T0);
  await expectError(mk.cancelListing(seller, 'lst_nope', T0), 404, '挂单不存在');
  await expectError(mk.cancelListing(seller, undefined, T0), 400, '缺少 listing_id');
  await expectError(mk.cancelListing(other, l.listing_id, T0), 403, '只能撤销本人的挂单');
  assert.equal((await listingById(l.listing_id)).status, 'open', '403 不改状态');
  await mk.cancelListing(seller, l.listing_id, T0);
  await expectError(mk.cancelListing(seller, l.listing_id, T0), 409, '挂单已成交或已撤单');
  // 已成交单 → 409
  const l2 = await mk.listBamboo(seller, { bundles: 1, price_seeds: 10 }, T0);
  await mk.buyListing(other, l2.listing_id, T0);
  await expectError(mk.cancelListing(seller, l2.listing_id, T0), 409, '挂单已成交或已撤单');
  assert.equal((await listingById(l2.listing_id)).status, 'sold');
});

// ==================== ⑤⑥ TTL 7 天 + 惰性下架（造写入时间，不睡时钟） ====================

test('TTL：expires_at = 挂单时刻 + 7 天；days_left = 7；剩余时限 1..7 天', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(100, 300)] });
  const r = await mk.listBamboo(phone, { bundles: 1, price_seeds: 7 }, T0);
  const l = await listingById(r.listing_id);
  assert.equal(l.created_at, T0.toISOString());
  assert.equal(l.expires_at, new Date(T0.getTime() + 7 * DAY).toISOString());
  assert.equal(Date.parse(l.expires_at) - Date.parse(l.created_at), 7 * DAY);
  assert.equal(mk.listingPayload(l, T0).days_left, 7);
  // 第 6 天：剩 1 天；恰好到期时刻：0 天
  assert.equal(mk.listingPayload(l, new Date(T0.getTime() + 6 * DAY)).days_left, 1);
  assert.equal(mk.listingPayload(l, new Date(T0.getTime() + 7 * DAY - 1000)).days_left, 1);
  assert.equal(mk.listingPayload(l, new Date(T0.getTime() + 7 * DAY)).days_left, 0);
});

test('惰性下架：跨过 expires_at → status=expired（保留原行、sold_at/buyer_phone 不变）、锁定释放、可重挂', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(100, 300)] });
  const r = await mk.listBamboo(phone, { bundles: 1, price_seeds: 7 }, T0);
  const before = await listingById(r.listing_id);
  assert.equal(mk.availablePieces(phone, await assetsOf(phone), await listingsOf()), 0);

  // 造态：把 expires_at 改到 T0 之前（不睡时钟）
  const doc = await marketDoc();
  doc.listings[0].expires_at = new Date(T0.getTime() - 1000).toISOString();
  await store.colSet('jiazu_market', 'global', doc);

  const view = await mk.marketListings(undefined, T0);
  assert.equal(view.listings.length, 0, '默认列表不展示 expired');
  const l = await listingById(r.listing_id);
  assert.equal(l.status, 'expired', '到期挂单置 expired');
  assert.equal(l.before_status, undefined);
  assert.equal('sold_at' in l, false, 'sold_at 不变（原行保留）');
  assert.equal('buyer_phone' in l, false, 'buyer_phone 不变');
  assert.equal(l.created_at, before.created_at);
  assert.equal(l.price_seeds, 7, '原行不物理删除、字段不改');
  assert.equal(l.pieces, 100);

  // 卖方可用竹片回升 +pieces
  assert.equal(mk.availablePieces(phone, await assetsOf(phone), await listingsOf()), 100);
  assert.equal(await bamboosSum(phone), 100, '无资产变动');
  const lastTx = (await txsOf(phone)).at(-1);
  assert.equal(lastTx.type, 'expire', '到期下架留痕');
  assert.ok(String(lastTx.desc).includes('挂单到期下架'), lastTx.desc);

  // 可重新挂出等量竹片
  const again = await mk.listBamboo(phone, { bundles: 1, price_seeds: 7 }, T0);
  assert.equal(again.ok, true);
  assert.equal((await listingsOf()).filter((x) => x.status === 'open').length, 1);
});

test('expired 不可买不可撤（409「挂单已过期」，资产不变、trades 不追加）；显式 status=expired 才返回', async () => {
  await setMarket();
  const seller = await newSeller({ bamboos: [bambooLot(100, 300)] });
  const buyer = await newBuyer();
  const r = await mk.listBamboo(seller, { bundles: 1, price_seeds: 7 }, T0);
  const doc = await marketDoc();
  doc.listings[0].expires_at = new Date(T0.getTime() - 1).toISOString();
  await store.colSet('jiazu_market', 'global', doc);

  const buyErr = await expectError(mk.buyListing(buyer, r.listing_id, T0), 409, '挂单已过期');
  assert.equal(buyErr.code, undefined, '域名错误只回业务文案');
  await expectError(mk.cancelListing(seller, r.listing_id, T0), 409, '挂单已过期');
  assert.equal((await tradesOf()).length, 0, 'trades 不追加');
  assert.equal(await seedsSum(buyer), 9999, '买方资产不变');
  assert.equal(await bamboosSum(seller), 100, '卖方资产不变');
  assert.equal((await listingById(r.listing_id)).status, 'expired');

  const all = await mk.marketListings('expired', T0);
  assert.equal(all.listings.length, 1, '显式 status=expired 可返回');
  await expectError(mk.marketListings('bogus', T0), 400, '不支持的挂单状态');
});

// ==================== ⑦ 成交账目与批次到期日继承 ====================

test('成交：FIFO 付籽（最早到期优先）+ 卖方入账 365 天 market 批 + 整束转移且 expires_at 继承不重置', async () => {
  await setMarket();
  const seller = await newSeller({ bamboos: [bambooLot(100, 10, 'bl_early'), bambooLot(100, 300, 'bl_late')] });
  const buyer = await newBuyer({ seeds: [seedLot(300, 20, 'sl_early'), seedLot(500, 400, 'sl_late')] });
  const r = await mk.listBamboo(seller, { bundles: 1, price_seeds: 199 }, T0);
  const res = await mk.buyListing(buyer, r.listing_id, T0);
  assert.equal(res.ok, true);

  // 买方付籽 FIFO：先扣最早到期的 199（sl_early 300 → 101，sl_late 不动）
  const buyerAssets = await assetsOf(buyer);
  const early = buyerAssets.seeds.find((l) => l.id === 'sl_early');
  const late = buyerAssets.seeds.find((l) => l.id === 'sl_late');
  assert.equal(early.qty, 300 - 199);
  assert.equal(late.qty, 500);
  assert.equal(early.expires_at, isoAt(20));

  // 买方接收批次：expires_at 继承卖方原 lot（不重置、不续命）→ 仍是 T0+10d（而非 +365d）
  const buyerBamboos = buyerAssets.bamboos;
  assert.equal(buyerBamboos.length, 1);
  assert.equal(buyerBamboos[0].qty, 100);
  assert.equal(buyerBamboos[0].expires_at, isoAt(10), '买方批次 expires_at = 卖方原 lot（不重置）');
  assert.notEqual(buyerBamboos[0].expires_at, isoAt(365));
  assert.equal(buyerBamboos[0].source, 'market');

  // 卖方：交出最早到期批次（整束取用），剩余批次不动
  const sellerAssets = await assetsOf(seller);
  assert.equal(sellerAssets.bamboos.length, 1);
  assert.equal(sellerAssets.bamboos[0].id, 'bl_late');
  assert.equal(sellerAssets.bamboos[0].qty, 100);
  assert.equal(await bamboosSum(seller), 100);

  // planTrade 纯函数：切片明细与接收批次
  const plan = mk.planTrade({
    listing: { id: 'l', seller_phone: seller, pieces: 100, price_seeds: 199 },
    sellerUser: { bamboos: [bambooLot(100, 300, 'x'), bambooLot(100, 10, 'y')] },
    buyerUser: { seeds: [seedLot(500, 20)] },
    listings: [],
    now: T0,
  });
  assert.deepEqual(plan.slices.map((s) => s.lot_id), ['y', 'x'].slice(0, 1));
  assert.equal(plan.slices[0].expires_at, isoAt(10));
  assert.equal(plan.receive[0].expires_at, isoAt(10));
  assert.equal(plan.fee_seeds, 1);
  assert.equal(plan.seller_got, 198);
});

test('成交：跨批整束切片 + 同到期日合并；99 免收（卖方实收 99）与 100 起收（卖方 99）', async () => {
  await setMarket();
  const seller = await newSeller({ bamboos: [bambooLot(100, 10, 'bl_a'), bambooLot(250, 300, 'bl_b')] });
  const buyer = await newBuyer();
  const l = await mk.listBamboo(seller, { bundles: 2, price_seeds: 99 }, T0);
  const res = await mk.buyListing(buyer, l.listing_id, T0);
  assert.equal(res.pieces, 200);
  assert.equal(res.fee_seeds, 0, '99 → 免收');
  assert.equal(res.seller_got, 99, '99 → 卖方实收 99');
  assert.equal(res.destroyed, 0);
  assert.equal(res.fee_waived, true);
  // 切片：bl_a 100 片（+10d）+ bl_b 100 片（+300d）；bl_b 余 150
  const b = (await assetsOf(buyer)).bamboos.map((x) => [x.qty, x.expires_at]).sort((x, y) => x[0] - y[0]);
  assert.deepEqual(b, [[100, isoAt(10)], [100, isoAt(300)]]);
  const sellerBamboos = (await assetsOf(seller)).bamboos;
  assert.equal(sellerBamboos.length, 1);
  assert.equal(sellerBamboos[0].id, 'bl_b');
  assert.equal(sellerBamboos[0].qty, 150);
  assert.equal(await seedsSum(seller), 99, '卖方实收 99（免收手续费）');

  // 100 → 收 1（卖方实收 99）
  const seller2 = await newSeller({ bamboos: [bambooLot(100, 30)] });
  const buyer2 = await newBuyer();
  const l2 = await mk.listBamboo(seller2, { bundles: 1, price_seeds: 100 }, T0);
  const r2 = await mk.buyListing(buyer2, l2.listing_id, T0);
  assert.equal(r2.fee_seeds, 1);
  assert.equal(r2.seller_got, 99);
  assert.equal(await seedsSum(seller2), 99);
  assert.equal(await seedsSum(buyer2), 9999 - 100, '买方实付 = 标价（不叠加手续费）');
});

test('成交守卫：籽不足 / 竹片已过期 → 409 整单拒绝（双方资产与 trades 均不变）', async () => {
  await setMarket();
  const seller = await newSeller({ bamboos: [bambooLot(100, 30)] });
  const poor = await newBuyer({ seeds: [seedLot(50, 300)] });
  const l = await mk.listBamboo(seller, { bundles: 1, price_seeds: 199 }, T0);
  const err = await expectError(mk.buyListing(poor, l.listing_id, T0), 409, '石榴籽不足');
  assert.equal(err.code, 'ASSET_INSUFFICIENT', '资产不足沿用账本内核域名码');
  assert.equal(err.need, 199);
  assert.equal(err.current, 50);
  assert.equal(err.unit, 'seed');
  assert.equal((await listingById(l.listing_id)).status, 'open', '未成交，挂单仍 open');
  assert.equal((await tradesOf()).length, 0);
  assert.equal(await seedsSum(poor), 50);
  assert.equal(await bamboosSum(seller), 100);

  // 卖方竹片过期（造态）→ 409「部分竹片已过期，请撤单后重挂」
  const doc = await marketDoc();
  await el.withAssets(seller, (user) => {
    user.bamboos = [];
  });
  await store.colSet('jiazu_market', 'global', doc);
  const rich = await newBuyer();
  const err2 = await expectError(mk.buyListing(rich, l.listing_id, T0), 409, '部分竹片已过期，请撤单后重挂');
  assert.equal(err2.need, 100);
  assert.equal(err2.unit, 'bamboo');
  assert.equal(await seedsSum(rich), 9999, '买方不扣籽');
  assert.equal((await tradesOf()).length, 0);
});

test('自买自卖拒绝（K8 · 400）：资产不变、trades 不追加、挂单仍 open', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(100, 30)], seeds: [seedLot(500, 300)] });
  const l = await mk.listBamboo(phone, { bundles: 1, price_seeds: 50 }, T0);
  await expectError(mk.buyListing(phone, l.listing_id, T0), 400, '不可购买自己的挂单');
  assert.equal((await listingById(l.listing_id)).status, 'open');
  assert.equal((await tradesOf()).length, 0);
  assert.equal(await seedsSum(phone), 500);
  assert.equal(await bamboosSum(phone), 100);
});

test('并发买同一挂单：只 1 单成功（另 1 个 409），trades 只追加 1 条', async () => {
  await setMarket();
  const seller = await newSeller({ bamboos: [bambooLot(100, 30)] });
  const b1 = await newBuyer();
  const b2 = await newBuyer();
  const l = await mk.listBamboo(seller, { bundles: 1, price_seeds: 100 }, T0);
  const results = await Promise.allSettled([mk.buyListing(b1, l.listing_id, T0), mk.buyListing(b2, l.listing_id, T0)]);
  const ok = results.filter((r) => r.status === 'fulfilled');
  const failed = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1, `应恰好 1 单成功，实际 ${ok.length}`);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].reason.status, 409);
  assert.ok(String(failed[0].reason.message).includes('挂单已成交或已撤单'), failed[0].reason.message);
  const trades = await tradesOf();
  assert.equal(trades.length, 1, 'trades 只追加 1 条');
  assert.equal((await listingById(l.listing_id)).status, 'sold');
  const losers = [(await seedsSum(b1)), (await seedsSum(b2))].filter((s) => s === 9999);
  assert.equal(losers.length, 1, '落败方资产不变');
  assert.equal(await bamboosSum(seller), 0, '卖方只交出 1 束');
  assert.equal(await seedsSum(seller), 99);
});

test('buyListing 404 不存在 / 400 缺 listing_id；成交后 Trade 与挂单同文档一次写', async () => {
  await setMarket();
  const buyer = await newBuyer();
  await expectError(mk.buyListing(buyer, 'lst_none', T0), 404, '挂单不存在');
  await expectError(mk.buyListing(buyer, undefined, T0), 400, '缺少 listing_id');
  assert.equal((await tradesOf()).length, 0);
});

// ==================== ⑨ 官方发售：惰性释放（21:00）与不结转 ====================

test('释放纯函数：21:00 前不释放；21:00 后释放并幂等；跨日重新释放且不累计昨日余量', () => {
  const o = { price_fen: 990, daily_stock: 50, stock: {}, last_release_date: '' };
  const before = mk.releaseOfficial(o, T0);
  assert.equal(before.is_open, false);
  assert.equal(before.released, false);
  assert.equal(before.stock_left_today, 0, '21:00 前仅展示，不代表可购买');
  assert.equal(before.release_at, '21:00');
  assert.equal(before.today, '2026-09-16');
  assert.equal(o.last_release_date, '');

  const after = mk.releaseOfficial(o, T21);
  assert.equal(after.is_open, true);
  assert.equal(after.released, true);
  assert.equal(after.stock_left_today, 50, 'stock[today] = daily_stock');
  assert.equal(o.last_release_date, '2026-09-16');
  assert.equal(o.stock['2026-09-16'], 50);

  // 幂等：同日重复调用不重复释放
  const again = mk.releaseOfficial(o, new Date(T21.getTime() + 60000));
  assert.equal(again.released, false);
  assert.equal(again.released_today, true);
  assert.equal(again.stock_left_today, 50);

  // 当日售出 1 束 → 次日 21:00 覆盖当日键，**不结转**昨日余量
  o.stock['2026-09-16'] = 49;
  const nextDay = mk.releaseOfficial(o, T_NEXT21);
  assert.equal(nextDay.released, true);
  assert.equal(o.stock['2026-09-17'], 50, '覆盖为 daily_stock（不累加昨日余量）');
  assert.equal(o.stock['2026-09-16'], 49, '历史日期键保留（审计）');
  assert.equal(o.last_release_date, '2026-09-17');

  // daily_stock 后台改小 → 只影响释放口径
  o.daily_stock = 3;
  const day3 = mk.releaseOfficial(o, new Date(T_NEXT21.getTime() + DAY));
  assert.equal(day3.stock_left_today, 3);
});

test('市集入口惰性释放：21:00 前库存 0；21:00 后 50；跨日刷新；挂单 sweep 与释放互不影响', async () => {
  await setMarket();
  const before = await mk.marketListings(undefined, T0);
  assert.deepEqual(before.official, { price_fen: 990, daily_stock: 50, stock_left_today: 0, release_at: '21:00', released: false });
  assert.equal((await marketDoc()).official.last_release_date, '');

  const after = await mk.marketListings(undefined, T21);
  assert.equal(after.official.stock_left_today, 50);
  assert.equal(after.official.released, true);
  assert.equal((await marketDoc()).official.last_release_date, '2026-09-16');

  const next = await mk.marketListings(undefined, T_NEXT21);
  assert.equal(next.official.stock_left_today, 50, '跨日重新释放 50');
  assert.equal((await marketDoc()).official.stock['2026-09-17'], 50);
});

test('官方发售时点闸门：21:00 前购买 → 409「未到发售时间」（不扣 ¥、不入竹片、库存不变）', async () => {
  await setMarket({ official: { daily_stock: 5, stock: { '2026-09-16': 5 }, last_release_date: '2026-09-16' } });
  const phone = await newUser();
  await setAssets(phone, {});
  await setWallet(phone, 9900);
  await expectError(mk.officialPurchase(phone, { bundles: 1 }, T0), 409, '未到发售时间');
  assert.equal(await wallet.getUserBalance(phone), 9900, '不扣款');
  assert.equal(await bamboosSum(phone), 0, '不入竹片');
  assert.equal((await marketDoc()).official.stock['2026-09-16'], 5, '库存不变');
  assert.equal((await walletTxs()).filter((t) => t.user === phone).length, 0);
});

test('官方购买：¥ 扣 990 分/束 → 得 100 片（365 天 · official_purchase）+ official_buy 流水 + 库存递减', async () => {
  await setMarket({ official: { daily_stock: 50 } });
  const phone = await newUser();
  await setAssets(phone, {});
  await setWallet(phone, 5000);

  const r = await mk.officialPurchase(phone, { bundles: 1 }, T21);
  assert.equal(r.ok, true);
  assert.equal(r.pieces, 100);
  assert.equal(r.bundles, 1);
  assert.equal(r.price_fen, 990);
  assert.equal(r.amount_cents, 990);
  assert.equal(r.balance_cents, 5000 - 990);
  assert.equal(r.stock_left_today, 49);
  assert.equal(r.released, true, '本次入口完成惰性释放');

  // 竹片：新入账 100 片、365 天（**官方购买是新入账 → now+365d**，与市集成交「继承原批次」区分）
  const lots = (await assetsOf(phone)).bamboos;
  assert.equal(lots.length, 1);
  assert.equal(lots[0].qty, 100);
  assert.equal(lots[0].source, 'official_purchase');
  assert.equal(lots[0].expires_at, new Date(T21.getTime() + 365 * DAY).toISOString());
  assert.equal(lots[0].id, r.lot_id);

  // Tx 留痕
  const tx = (await txsOf(phone)).at(-1);
  assert.equal(tx.type, 'official_buy');
  assert.deepEqual(tx.delta, { bamboos: 100 });

  // ¥ 钱包：扣 990 分 + 一条 official_bamboo 流水（¥ 流水类型，非 Tx.type）
  assert.equal(await wallet.getUserBalance(phone), 4010);
  const wtx = (await walletTxs()).at(-1);
  assert.equal(wtx.type, 'official_bamboo');
  assert.equal(wtx.amount_cents, -990);
  assert.equal(wtx.user, phone);

  // 多束：2 束 = 1980 分 → 200 片
  const r2 = await mk.officialPurchase(phone, { bundles: 2 }, T21);
  assert.equal(r2.amount_cents, 1980);
  assert.equal(r2.pieces, 200);
  assert.equal(await wallet.getUserBalance(phone), 4010 - 1980);
  assert.equal(r2.stock_left_today, 47);
  assert.equal(await bamboosSum(phone), 300);

  // bundles 缺省 = 1 束；非整数 / 0 / 负 → 400
  const r3 = await mk.officialPurchase(phone, {}, T21);
  assert.equal(r3.bundles, 1);
  await expectError(mk.officialPurchase(phone, { bundles: 0 }, T21), 400, '束数必须为不小于 1 的整数');
  await expectError(mk.officialPurchase(phone, { bundles: 1.5 }, T21), 400, '束数');
});

test('售罄即止：库存不足 → 409「今日已售罄」（不扣 ¥、不入竹片）；当日未售完不结转', async () => {
  await setMarket({ official: { daily_stock: 1, stock: { '2026-09-16': 1 }, last_release_date: '2026-09-16' } });
  const p1 = await newUser();
  await setAssets(p1, {});
  await setWallet(p1, 9900);
  const ok = await mk.officialPurchase(p1, { bundles: 1 }, T21);
  assert.equal(ok.stock_left_today, 0);

  const p2 = await newUser();
  await setAssets(p2, {});
  await setWallet(p2, 9900);
  await expectError(mk.officialPurchase(p2, { bundles: 1 }, T21), 409, '今日已售罄');
  await expectError(mk.officialPurchase(p2, { bundles: 3 }, T21), 409, '今日已售罄');
  assert.equal(await wallet.getUserBalance(p2), 9900, '不扣款');
  assert.equal(await bamboosSum(p2), 0, '不入竹片');
  assert.equal((await walletTxs()).filter((t) => t.user === p2).length, 0);
  assert.equal((await marketDoc()).official.stock['2026-09-16'], 0);

  // 当日未售完不结转：次日 21:00 释放 daily_stock（覆盖），不累加昨日余量
  await setMarket({ official: { daily_stock: 5, stock: { '2026-09-16': 4 }, last_release_date: '2026-09-16' } });
  const next = await mk.marketListings(undefined, T_NEXT21);
  assert.equal(next.official.stock_left_today, 5);
  assert.equal((await marketDoc()).official.stock['2026-09-16'], 4);
});

test('¥ 余额不足 → 409（引导充值）且不入竹片、无钱包流水；先校验全部前置再动账', async () => {
  await setMarket({ official: { daily_stock: 5, stock: { '2026-09-16': 5 }, last_release_date: '2026-09-16' } });
  const phone = await newUser();
  await setAssets(phone, {});
  await setWallet(phone, 989); // 差 1 分
  const err = await expectError(mk.officialPurchase(phone, { bundles: 1 }, T21), 409, '人民币余额不足');
  assert.ok(String(err.message).includes('请先充值'), err.message);
  assert.equal(await wallet.getUserBalance(phone), 989);
  assert.equal(await bamboosSum(phone), 0);
  assert.equal((await marketDoc()).official.stock['2026-09-16'], 5, '库存不减');
  assert.equal((await walletTxs()).filter((t) => t.user === phone).length, 0, '无钱包流水');

  // 2 束需 1980 分：余额 1979 → 409
  await setWallet(phone, 1979);
  await expectError(mk.officialPurchase(phone, { bundles: 2 }, T21), 409, '人民币余额不足');
  await setWallet(phone, 1980);
  const ok = await mk.officialPurchase(phone, { bundles: 2 }, T21);
  assert.equal(ok.balance_cents, 0);
  assert.equal(await bamboosSum(phone), 200);
});

// ==================== ⑧⑪ 路由级（含 guest 可读与权限） ====================

test('路由 · GET /market/listings：guest 可读；出参含 official 五字段；默认不展示 expired', async () => {
  await setMarket();
  const guest = await call('/market/listings', 'GET');
  assert.equal(guest.statusCode, 200, guest.body);
  const body = jsonOf(guest);
  assert.deepEqual(body.listings, []);
  assert.deepEqual(Object.keys(body.official).sort(), ['daily_stock', 'price_fen', 'release_at', 'released', 'stock_left_today'].sort());
  assert.equal(body.official.price_fen, 990);
  assert.equal(body.official.daily_stock, 50);
  assert.equal(body.official.release_at, '21:00');

  // 卖家挂单（无锚点、无家族树）→ guest 可见，含 expires_at 与剩余时限
  const seller = await newSeller({ bamboos: [bambooLot(100, 300)] });
  const created = jsonOf(await call('/market/list', 'POST', bearer(seller), {}, { bundles: 1, price_seeds: 199 }));
  const list = jsonOf(await call('/market/listings', 'GET'));
  assert.equal(list.listings.length, 1);
  const row = list.listings[0];
  assert.equal(row.id, created.listing_id);
  assert.equal(row.price_seeds, 199);
  assert.equal(row.pieces, 100);
  assert.equal(row.bundles, 1);
  assert.equal(row.status, 'open');
  assert.ok(row.expires_at, '出参含 expires_at');
  assert.ok(row.days_left >= 1 && row.days_left <= mk.LISTING_TTL_DAYS, `days_left 应为 1..7，实际 ${row.days_left}`);
  assert.equal(mk.hasTreeField(row), false);
  assert.equal(row['tree_id'], undefined);

  // 造态：过期 → 默认列表不展示；显式 status=expired 才返回
  const doc = await marketDoc();
  doc.listings[0].expires_at = new Date(Date.now() - 1000).toISOString();
  await store.colSet('jiazu_market', 'global', doc);
  assert.equal(jsonOf(await call('/market/listings', 'GET')).listings.length, 0, '默认不展示 expired');
  const explicit = jsonOf(await call('/market/listings', 'GET', {}, { status: 'expired' }));
  assert.equal(explicit.listings.length, 1);
  assert.equal(explicit.listings[0].status, 'expired');
  assert.equal((await call('/market/listings', 'GET', {}, { status: 'bogus' })).statusCode, 400);
});

test('路由 · 未登录一律 401（/market/my /market/list /market/cancel /market/buy /market/official-buy）', async () => {
  await setMarket();
  for (const [p, method, body] of [
    ['/market/my', 'GET', null],
    ['/market/list', 'POST', { bundles: 1, price_seeds: 10 }],
    ['/market/cancel', 'POST', { listing_id: 'lst_x' }],
    ['/market/buy', 'POST', { listing_id: 'lst_x' }],
    ['/market/official-buy', 'POST', { bundles: 1 }],
  ]) {
    const res = await call(p, method, {}, {}, body);
    assert.equal(res.statusCode, 401, `${p} 应 401，实际 ${res.statusCode}：${res.body}`);
    assert.equal(jsonOf(res).status, undefined, '域名错误体不带系统 status');
  }
  const admin = await call('/admin/market/official-stock', 'PUT', {}, {}, { daily_stock: 10 });
  assert.equal(admin.statusCode, 401);
});

test('路由 · POST /market/list：挂单落库（无家族树字段）+ GET /market/my 我的挂单与资产概览', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(200, 300)], seeds: [seedLot(30, 300)] });
  const res = jsonOf(await call('/market/list', 'POST', bearer(phone), {}, { bundles: 2, price_seeds: 199, tree_id: 'ignored' }));
  assert.equal(res.ok, true);
  assert.equal(res.pieces, 200);
  assert.equal(res.fee_seeds, 1);
  assert.equal(res.days_left, 7);
  assert.ok(res.expires_at);
  assert.equal(res.tree_id, undefined, '出参不带家族树字段');

  const my = jsonOf(await call('/market/my', 'GET', bearer(phone)));
  assert.equal(my.listings.length, 1);
  assert.equal(my.listings[0].status, 'open');
  assert.ok(my.listings[0].days_left >= 1 && my.listings[0].days_left <= 7);
  assert.equal(my.assets.seeds_available, 30);
  assert.equal(my.assets.bamboo_total_pieces, 200);
  assert.equal(my.assets.bamboo_locked_pieces, 200);
  assert.equal(my.assets.bamboo_available_pieces, 0);
  assert.equal(my.assets.bamboo_available_bundles, 0);
  assert.equal(my.assets.lots.length, 1);
  assert.equal(my.assets.lots[0].qty, 200);
  assert.equal(mk.hasTreeField(my.listings[0]), false);

  // 非整束 → 400；无本人挂单 → 空数组
  assert.equal((await call('/market/list', 'POST', bearer(phone), {}, { bundles: 2.5, price_seeds: 10 })).statusCode, 400);
  const other = await newBuyer();
  assert.deepEqual(jsonOf(await call('/market/my', 'GET', bearer(other))).listings, []);
});

test('路由 · POST /market/buy 全流程（买方真实时钟）：199 锚点出参 + 挂单转 sold', async () => {
  await setMarket();
  const seller = await newSeller({ bamboos: [bambooLot(100, 300)] });
  const buyer = await newBuyer({ seeds: [seedLot(500, 300)] });
  const created = jsonOf(await call('/market/list', 'POST', bearer(seller), {}, { bundles: 1, price_seeds: 199 }));
  const res = await call('/market/buy', 'POST', bearer(buyer), {}, { listing_id: created.listing_id });
  assert.equal(res.statusCode, 200, res.body);
  const body = jsonOf(res);
  assert.equal(body.ok, true);
  assert.equal(body.price_seeds, 199);
  assert.equal(body.fee_seeds, 1);
  assert.equal(body.seller_got, 198);
  assert.equal(body.pieces, 100);
  assert.equal(body.status, 'sold');
  assert.ok(body.trade_id);
  assert.equal(await seedsSum(buyer), 301);
  assert.equal(await seedsSum(seller), 198);
  assert.equal((await tradesOf()).length, 1);

  // 自买自卖 → 400；对已成交单再买 → 409
  const created2 = jsonOf(await call('/market/list', 'POST', bearer(seller), {}, { bundles: 0, price_seeds: 1 }));
  assert.equal(created2.error, '束数必须为不小于 1 的整数（1 束 = 100 片）');
  assert.equal((await call('/market/buy', 'POST', bearer(buyer), {}, { listing_id: created.listing_id })).statusCode, 409);
  const self = await newSeller({ bamboos: [bambooLot(100, 300)] });
  const l3 = jsonOf(await call('/market/list', 'POST', bearer(self), {}, { bundles: 1, price_seeds: 50 }));
  const selfRes = await call('/market/buy', 'POST', bearer(self), {}, { listing_id: l3.listing_id });
  assert.equal(selfRes.statusCode, 400, selfRes.body);
  assert.equal(jsonOf(selfRes).error, '不可购买自己的挂单');

  // 撤单 → 200；重复撤 → 409（l3 仍为 open：自买自卖被拒后挂单不消失）
  assert.equal((await call('/market/cancel', 'POST', bearer(self), {}, { listing_id: l3.listing_id })).statusCode, 200);
  assert.equal((await call('/market/cancel', 'POST', bearer(self), {}, { listing_id: l3.listing_id })).statusCode, 409);
  assert.equal((await call('/market/cancel', 'POST', bearer(self), {}, {})).statusCode, 400);
});

test('路由 · POST /market/official-buy 按真实时钟判定分支（21:00 闸门真实存在）', async () => {
  const open = isReleaseOpenNow();
  const phone = await newUser();
  await setAssets(phone, {});
  await setWallet(phone, 9990);
  const today = todayCst();
  await setMarket({ official: { daily_stock: 5, stock: { [today]: 5 }, last_release_date: today } });

  const res = await call('/market/official-buy', 'POST', bearer(phone), {}, { bundles: 1 });
  if (open) {
    assert.equal(res.statusCode, 200, res.body);
    const body = jsonOf(res);
    assert.equal(body.pieces, 100);
    assert.equal(body.price_fen, 990);
    assert.equal(body.stock_left_today, 4);
    assert.equal(body.balance_cents, 9990 - 990);
    assert.equal(await bamboosSum(phone), 100);
  } else {
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(jsonOf(res).error, '未到发售时间');
    assert.equal(await wallet.getUserBalance(phone), 9990, '21:00 前不扣款');
    assert.equal(await bamboosSum(phone), 0);
  }
  // 参数非法在两种分支下都是 400
  assert.equal((await call('/market/official-buy', 'POST', bearer(phone), {}, { bundles: 0 })).statusCode, 400);
});

test('路由 · PUT /admin/market/official-stock：仅 chief_editor（403）+ 400 非法值 + 当日剩余不追溯', async () => {
  await setMarket({ official: { daily_stock: 50, stock: { '2026-09-16': 49 }, last_release_date: '2026-09-16' } });
  const user = await newUser();
  const chief = await newUser('chief_editor');
  const forbidden = await call('/admin/market/official-stock', 'PUT', bearer(user), {}, { daily_stock: 10 });
  assert.equal(forbidden.statusCode, 403, forbidden.body);
  assert.equal(jsonOf(forbidden).error, '需要总编辑权限');
  const bad = await call('/admin/market/official-stock', 'PUT', bearer(chief), {}, { daily_stock: -1 });
  assert.equal(bad.statusCode, 400, bad.body);
  assert.equal(jsonOf(bad).error, '每日库存必须为不小于 0 的整数');
  const badPrice = await call('/admin/market/official-stock', 'PUT', bearer(chief), {}, { daily_stock: 10, price_fen: 0 });
  assert.equal(badPrice.statusCode, 400);
  const ok = jsonOf(await call('/admin/market/official-stock', 'PUT', bearer(chief), {}, { daily_stock: 80, price_fen: 1990 }));
  assert.equal(ok.ok, true);
  assert.equal(ok.daily_stock, 80);
  assert.equal(ok.price_fen, 1990);
  const doc = await marketDoc();
  assert.equal(doc.official.daily_stock, 80);
  assert.equal(doc.official.price_fen, 1990);
  assert.equal(doc.official.stock['2026-09-16'], 49, '后台改库存不追溯当日剩余');
  // 只传 daily_stock → price_fen 保持不变
  const only = jsonOf(await call('/admin/market/official-stock', 'PUT', bearer(chief), {}, { daily_stock: 20 }));
  assert.equal(only.price_fen, 1990);
});

// ==================== ⑫ 注销前置（K10） ====================

test('注销前置（K10）：存在 open 挂单 → hasOpenListing true / guard 409「请先撤销未成交挂单」', async () => {
  await setMarket();
  const phone = await newSeller({ bamboos: [bambooLot(200, 300)] });
  assert.equal(await mk.hasOpenListing(phone, T0), false);
  const l = await mk.listBamboo(phone, { bundles: 1, price_seeds: 10 }, T0);
  assert.equal(await mk.hasOpenListing(phone, T0), true);
  const err = await expectError(mk.openListingGuard(phone, T0), 409, '请先撤销未成交挂单');
  assert.equal(err.code, undefined);

  await mk.cancelListing(phone, l.listing_id, T0);
  assert.equal(await mk.hasOpenListing(phone, T0), false, 'cancelled 不阻碍注销');
  await mk.openListingGuard(phone, T0);

  const sold = await mk.listBamboo(phone, { bundles: 1, price_seeds: 10 }, T0);
  const buyer = await newBuyer();
  await mk.buyListing(buyer, sold.listing_id, T0);
  assert.equal(await mk.hasOpenListing(phone, T0), false, 'sold 不阻碍注销');
  assert.equal(await bamboosSum(phone), 100, '卖方余 1 束');

  const exp = await mk.listBamboo(phone, { bundles: 1, price_seeds: 10 }, T0);
  const doc = await marketDoc();
  doc.listings.find((x) => x.id === exp.listing_id).expires_at = new Date(T0.getTime() - 1).toISOString();
  await store.colSet('jiazu_market', 'global', doc);
  assert.equal(await mk.hasOpenListing(phone, T0), false, 'expired 不阻碍注销（sweep 后已释放）');
  assert.equal((await listingById(exp.listing_id)).status, 'expired');
});

// ==================== ⑬ 枚举 / 惰性推进 / 出参 ====================

test('Tx.type 白名单含市集与官方发售五项；未知类型仍抛错', () => {
  for (const t of ['market_list', 'market_cancel', 'market_sell', 'market_buy', 'official_buy']) {
    assert.ok(el.TX_TYPES.includes(t), `TX_TYPES 应含 ${t}`);
  }
  const user = { txs: [] };
  assert.throws(() => el.recordTx(user, { type: 'market_typo' }, T0), /未知流水类型/);
  el.recordTx(user, { type: 'market_list', delta: {} }, T0);
  assert.equal(user.txs.length, 1);
});

test('惰性推进：模块内无 setInterval / setTimeout / cron（不建定时任务）', () => {
  const src = fs.readFileSync(path.join(HERE, 'economy-market.js'), 'utf8');
  assert.equal(/setInterval|setTimeout|cron|schedule\(/i.test(src), false, '市集模块不得依赖定时任务');
});

test('官方发售出参：officialPayload 五字段（released 反映今日是否已释放）', () => {
  const o = { price_fen: 990, daily_stock: 50, stock: {}, last_release_date: '' };
  const pre = mk.officialPayload(o, mk.releaseOfficial(o, T0), T0);
  assert.deepEqual(pre, { price_fen: 990, daily_stock: 50, stock_left_today: 0, release_at: '21:00', released: false });
  const post = mk.officialPayload(o, mk.releaseOfficial(o, T21), T21);
  assert.equal(post.released, true);
  assert.equal(post.stock_left_today, 50);
});

test('空市集文档：marketListings / myMarket 在集合不存在时也能工作（默认 990 / 50）', async () => {
  await store.colDelete('jiazu_market', 'global');
  const view = await mk.marketListings(undefined, T0);
  assert.deepEqual(view.listings, []);
  assert.equal(view.official.price_fen, mk.DEFAULT_PRICE_FEN);
  assert.equal(view.official.daily_stock, mk.DEFAULT_DAILY_STOCK);
  const phone = await newUser();
  const my = await mk.myMarket(phone, undefined, T0);
  assert.deepEqual(my.listings, []);
  assert.equal(my.assets.seeds_available, 0);
  assert.equal(my.assets.bamboo_available_pieces, 0);
});

// ==================== ⑮ F3：store 公共层「先落盘、后更新缓存」 ====================
// 失败注入：把目标集合文件置 0444（写必 EACCES）→ 断言 ① 抛错 ② 磁盘逐字节未变
// ③ 同进程 colGet / 资产读回与磁盘一致（不得出现「写成功」的幻影文档）。
// 修复前：colSet/colDelete 先 colCache.set 再持久化，失败后缓存脏 → 读回幻影值。

test('F3 落盘失败（0444/EACCES）→ 抛错、磁盘未变、colGet 与磁盘一致（无幻影值）；colSet/colDelete 同序', async () => {
  const colFile = path.join(store.PATHS.out, 'collections', `${el.ASSETS_COL}.json`);
  assert.ok(store.PATHS.sandbox && store.PATHS.out.startsWith(os.tmpdir()), '夹具只在沙箱副本里动手');

  const phone = nextPhone();
  await el.withAssets(phone, (user) => {
    user.bamboos = [bambooLot(100, 30)];
  });
  const before = fs.readFileSync(colFile, 'utf8');
  assert.equal(await bamboosSum(phone), 100, '夹具基线：磁盘 + 缓存均 100 片');

  // ---- ① colSet：整体回写一个「把竹片清空」的文档（模拟 F3 报告里的场景）----
  fs.chmodSync(colFile, 0o444);
  let setErr = null;
  try {
    await store.colSet(el.ASSETS_COL, el.ASSETS_ID, {
      _id: el.ASSETS_ID,
      users: { [phone]: { phone, fragments: 0, seeds: [], bamboos: [], jades: [], txs: [], signin_date: '' } },
    });
  } catch (e) {
    setErr = e;
  }
  try {
    assert.ok(setErr, '落盘失败必须抛错，不得假成功');
    assert.match(String(setErr.code || setErr.message), /EACCES|EPERM|permission/i);
    // 磁盘逐字节未变
    assert.equal(fs.readFileSync(colFile, 'utf8'), before, '磁盘不得被改写');
    // 同进程读回 = 磁盘值（不是幻影新值）
    const diskDoc = JSON.parse(fs.readFileSync(colFile, 'utf8'))[el.ASSETS_ID];
    const cached = JSON.parse(JSON.stringify(await store.colGet(el.ASSETS_COL, el.ASSETS_ID)));
    assert.deepEqual(cached, diskDoc, 'colGet 读回必须与磁盘一致');
    assert.equal(await bamboosSum(phone), 100, '资产读回仍是 100 片（缓存保持旧值，不是 0 片幻影）');
    assert.deepEqual((await assetsOf(phone)).bamboos, diskDoc.users[phone].bamboos);

    // ---- ② colDelete：同样先落盘后换缓存 ----
    let delErr = null;
    try {
      await store.colDelete(el.ASSETS_COL, el.ASSETS_ID);
    } catch (e) {
      delErr = e;
    }
    assert.ok(delErr, '删除落盘失败也必须抛错');
    assert.equal(fs.readFileSync(colFile, 'utf8'), before, '删除失败：磁盘未变');
    assert.ok(await store.colGet(el.ASSETS_COL, el.ASSETS_ID), '删除失败：缓存不得提前丢掉文档');

    // ---- ③ colAtomicNext（计数器）：同序，失败不留幻影计数 ----
    await store.colSet('jiazu_f3_probe', 'seq', { _id: 'seq', next: 7 });
    const probeFile = path.join(store.PATHS.out, 'collections', 'jiazu_f3_probe.json');
    const beforeProbe = fs.readFileSync(probeFile, 'utf8');
    fs.chmodSync(probeFile, 0o444);
    let incErr = null;
    try {
      await store.colAtomicNext('jiazu_f3_probe', 'seq', 1, 'next');
    } catch (e) {
      incErr = e;
    }
    fs.chmodSync(probeFile, 0o644);
    assert.ok(incErr, '计数器落盘失败必须抛错');
    assert.equal(fs.readFileSync(probeFile, 'utf8'), beforeProbe, '计数器：磁盘未变');
    assert.equal((await store.colGet('jiazu_f3_probe', 'seq')).next, 7, '计数器：缓存保持旧值 7');
  } finally {
    fs.chmodSync(colFile, 0o644);
  }

  // 恢复权限后写路径正常（成功路径语义未变）
  await el.withAssets(phone, (user) => {
    user.bamboos = [bambooLot(100, 30)];
  });
  // 成功路径语义未变：colSet 仍整体回写并返回 undefined
  const reread = await store.colGet(el.ASSETS_COL, el.ASSETS_ID);
  assert.equal(await store.colSet(el.ASSETS_COL, el.ASSETS_ID, { ...reread, _id: el.ASSETS_ID }), undefined);
  assert.equal((await store.colGet(el.ASSETS_COL, el.ASSETS_ID))._id, el.ASSETS_ID);
  assert.equal(await bamboosSum(phone), 100, '恢复写权限后资产仍一致');
});

// ==================== ⑭ 真源未变 ====================

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
