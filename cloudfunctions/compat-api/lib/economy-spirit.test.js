/**
 * 时流子域内核单测（P2 第一段）— lib/economy-spirit.js（纯模块，不含路由）
 * 规格：docs/spirit-domain.spec.md §3-1 存储契约 / §3-3 常量 / §4 四态状态机（7 条迁移）/
 *   §5-1 合成三态 / §5-2 分解 / §5-3 镶嵌（凹槽唯一 · 不可逆）/ §6-2 五档表 / §6-3 叠加顺延 /
 *   §6-4 活动开关 / §7 读口径（logs 成员可见）；总册 docs/economy.spec.md §4-2 / §4-6 / §5-2 / §5-9。
 *
 * 覆盖：
 *  ① 五档表常量与 `plans` 出参（实价 1/29/109/149/299、天数 1/30/90/180/365、赠送 0/0/0/2/8 束）
 *  ② 活动开关（`SPIRIT_GIFT_ACTIVITY` 缺省 = 关闭 → `quarterly` 0 片；设 `quarterly` → 100 片）
 *  ③ 合成三态：全 ≥360 天 → 永久 / 恰好 360 天 → 永久（边界）/ 有不足 → 取最早到期**原值**
 *  ④ 合成 FIFO 跨批拆批（剩余 qty 与 `expires_at` 不变、无 qty=0 残留批）+ 流水 `jade_synth`
 *  ⑤ 合成不足 999 → 409 整单拒绝（一籽不扣、无玉、无流水）
 *  ⑥ 分解：永久玉 → 999 籽单一新批（365 天 / `jade_decompose`）；有期限玉同样 365 天；流水
 *  ⑦ 分解守卫：玉不存在 404 / 已镶嵌 409（镶嵌不可逆）/ 缺 jade_id 400
 *  ⑧ 镶嵌：建立初态（`status='inactive'`、`spirit_expires_at=null`、`logs=[]`）+ 个人侧留痕 + `jade_mount`
 *  ⑨ 镶嵌守卫：同树二次 409 / 同玉异树 409 / 总谱 400 / 树不存在 404 / 缺参 400 / 非本人玉 404
 *  ⑩ 蓄能五档逐档（扣籽数 / 天数 / 竹片 / 流水 / SpiritLog 五字段 / 状态转 active）
 *  ⑪ 蓄能叠加不覆盖（active 期连续两档 = 原值累加；绝不回退）
 *  ⑫ 蓄能缓冲期 / 失效后灌注（`buffer` / `expired` → active，`max(now, 原值) + days`，清空 `buffer_until`）
 *  ⑬ 蓄能不足 → 409 整单拒绝（籽 / 灵气 / logs / 竹片 / 流水五种副作用全不发生）；未镶嵌 409；plan 非法 400
 *  ⑭ 状态机四态与 30 天缓冲边界（恰好到期 / 恰好越过 `buffer_until`）+ 幂等（重复 settle 无变化）
 *  ⑮ 读口径：成员可见 logs（倒序）/ 登录非成员与 guest 仅摘要 / 400 与 404 / 未镶嵌摘要
 *  ⑯ 惰性推进：模块内无 `setInterval` / `setTimeout` / cron（不依赖定时任务）
 *  ⑰ 真源未变：`config/tree-meta.json` 与 `migrate-output/`（trees + details + collections）md5 逐字节一致
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本；文末 md5 断言真源未变
 * （照 assets.test.js / economy-fee.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/economy-spirit.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-economy-spirit-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');
delete process.env.SPIRIT_GIFT_ACTIVITY; // 默认关闭（§6-4）

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realMetaMd5 = md5(REAL_META);
const realMetaRaw = fs.readFileSync(REAL_META, 'utf8');
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

const DAY = 86400000;
const T0 = new Date('2026-09-16T00:00:00.000Z');
const isoAt = (days, from = T0) => new Date(from.getTime() + days * DAY).toISOString();

// ---- 沙箱 tree-meta 副本 ----
// 每用例独占一棵树（**不得跨用例复用**：凹槽唯一 + 永久占用）→ 预登记足量家族树
const FAMILY_TREES = Array.from({ length: 200 }, (_, i) => `sp_f${i}`);
const META_TREES = {
  zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, display_title: '中华世本总谱' },
  sp_clan: { tree_id: 'sp_clan', kind: 'clan', display_title: '祖谱（可镶玉）' },
};
for (const t of FAMILY_TREES) META_TREES[t] = { tree_id: t, kind: 'family', display_title: `测试家族 ${t}` };
fs.writeFileSync(process.env.COMPAT_META_FILE, JSON.stringify({ _schema: '1.1', trees: META_TREES }, null, 2) + '\n');

// ---- 用户 / 锚点 ----
const MEMBER = '16600007001'; // 锚点 = sp_f0（成员）
const OTHER = '16600007002'; // 登录非成员（无锚点）
const CHIEF = '16600007003'; // chief_editor（全局角色视为成员）
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [MEMBER]: { _id: MEMBER, phone: MEMBER, nickname: '家族成员', role: 'user' },
    [OTHER]: { _id: OTHER, phone: OTHER, nickname: '登录非成员', role: 'user' },
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
  }),
);
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_anchors.json'),
  JSON.stringify({ [MEMBER]: { _id: MEMBER, tree_id: 'sp_f0', person_handle: 'h_member', updated_at: T0.toISOString() } }),
);

const el = await import('./economy-ledger.js');
const store = await import('./store.js');
const sp = await import('./economy-spirit.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ---- 夹具工具 ----
let phoneSeq = 0;
const nextPhone = () => `1660000${String(1000 + ++phoneSeq)}`; // 11 位手机号
let treeSeq = 0;
/** 每个用例一棵独占树（sp_f0 保留给 MEMBER 的锚点树） */
const nextTree = () => FAMILY_TREES[++treeSeq];

const seedLot = (qty, expDays, id, source = 'admin') => ({
  id,
  qty,
  expires_at: isoAt(expDays),
  source,
  created_at: T0.toISOString(),
});
const jadeOf = (id, expDays = null) => ({
  id,
  expires_at: expDays === null ? null : isoAt(expDays),
  created_at: T0.toISOString(),
  source: 'synthesis',
});

/** 直接写个人资产（绕过被测模块，仅夹具） */
async function setAssets(phone, { seeds = [], bamboos = [], jades = [] } = {}) {
  await el.withAssets(phone, (user) => {
    user.seeds = seeds.map((l) => ({ ...l }));
    user.bamboos = bamboos.map((l) => ({ ...l }));
    user.jades = jades.map((l) => ({ ...l }));
    user.txs = [];
  });
}
const assetsOf = (phone) => el.getAssets(phone);
const seedSum = async (phone) => el.sumLots((await assetsOf(phone)).seeds);

/** 读集合 jiazu_spirit 的某树记录（原始真源） */
async function entryOf(treeId) {
  const doc = await store.colGet('jiazu_spirit', 'global');
  return doc?.trees?.[treeId] || null;
}
async function setEntry(treeId, entry) {
  const doc = (await store.colGet('jiazu_spirit', 'global')) || { _id: 'global', trees: {} };
  doc.trees = doc.trees || {};
  doc.trees[treeId] = entry;
  await store.colSet('jiazu_spirit', 'global', doc);
}

/** 造「已镶永久玉的树 + 新账号」，返回 { treeId, phone, jade_id } */
async function mountedTree(treeId = nextTree(), seedLots = []) {
  const phone = nextPhone();
  const jadeId = `jd_${phone}`;
  await setAssets(phone, { jades: [jadeOf(jadeId, null)], seeds: seedLots });
  const res = await sp.mountJade(phone, treeId, jadeId, T0);
  assert.equal(res.ok, true);
  return { treeId, phone, jade_id: jadeId };
}

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

// ---- 路由级夹具（路由内取服务端 `now` → 断言用真实时间，**不睡时钟**） ----
const bearer = (phone, role = 'user') => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role }, 3600)}` });
const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({ path: p, httpMethod: method, headers, queryStringParameters: query, body: body ? JSON.stringify(body) : undefined });
const jsonOf = (res) => JSON.parse(res.body);
const nowIso = () => new Date().toISOString();
const isoFromNow = (days) => new Date(Date.now() + days * DAY).toISOString();

/** 沙箱注册一个已登录用户（路由级用例：`authUser` 需要 `jiazu_users` 记录） */
async function newUser(role = 'user') {
  const phone = nextPhone();
  await store.colSet('jiazu_users', phone, { _id: phone, phone, nickname: `路由用户${phone.slice(-4)}`, role });
  return phone;
}

// ==================== ① 五档表与出参 ====================

test('五档表：实价 1/29/109/149/299 籽，天数 1/30/90/180/365，折扣列仅展示', () => {
  assert.deepEqual(
    sp.SPIRIT_PLANS.map((p) => p.plan),
    ['daily', 'monthly', 'quarterly', 'half_year', 'yearly'],
  );
  assert.deepEqual(sp.SPIRIT_PLANS.map((p) => p.seeds), [1, 29, 109, 149, 299]);
  assert.deepEqual(sp.SPIRIT_PLANS.map((p) => p.days), [1, 30, 90, 180, 365]);
  assert.deepEqual(sp.SPIRIT_PLANS.map((p) => p.discount), ['100%', '97%', '91%', '83%', '82%']);
  assert.deepEqual(sp.SPIRIT_PLANS.map((p) => p.activity_min_discount), [null, null, '83%', '72%', '60%']);
  assert.equal(sp.JADE_SYNTH_SEEDS, 999);
  assert.equal(sp.PERMANENT_THRESHOLD_DAYS, 360);
  assert.equal(sp.SEED_TTL_DAYS, 365);
  assert.equal(sp.BUFFER_DAYS, 30);
  assert.equal(sp.BAMBOO_PER_BUNDLE, 100);
  assert.equal(sp.planOf('daily').seeds, 1);
  assert.equal(sp.planOf('bogus'), null);
  assert.equal(sp.planOf(undefined), null);
});

test('档位赠送：常态 0/0/0/2/8 束；活动开关缺省关闭（quarterly = 0 片）', () => {
  const off = sp.plansPayload({});
  assert.deepEqual(off.map((p) => p.gift_bundles), [0, 0, 0, 2, 8]);
  assert.deepEqual(off.map((p) => p.gift_pieces), [0, 0, 0, 200, 800]);
  assert.deepEqual(off.map((p) => p.activity), [false, false, false, false, false]);
  assert.equal(sp.giftPiecesOf('quarterly', {}), 0);
  assert.equal(sp.giftPiecesOf('daily', {}), 0);
  assert.equal(sp.giftPiecesOf('half_year', {}), 200);
  assert.equal(sp.giftPiecesOf('yearly', {}), 800);
  assert.equal(sp.giftPiecesOf('bogus', {}), 0);
  assert.deepEqual(sp.activityPayload({}), { gift_enabled_plans: [] });
});

test('活动开关：`SPIRIT_GIFT_ACTIVITY=quarterly` → 1 束 = 100 片、`activity: true`', () => {
  const env = { [sp.SPIRIT_GIFT_ACTIVITY_ENV]: 'quarterly' };
  const on = sp.plansPayload(env);
  assert.equal(on[2].gift_bundles, 1);
  assert.equal(on[2].gift_pieces, 100);
  assert.equal(on[2].activity, true);
  assert.equal(on[3].gift_bundles, 2, '常态化赠送不受开关影响');
  assert.equal(sp.giftPiecesOf('quarterly', env), 100);
  assert.deepEqual(sp.activityPayload({ [sp.SPIRIT_GIFT_ACTIVITY_ENV]: 'quarterly, tmp' }).gift_enabled_plans, ['quarterly', 'tmp']);
  // 缺省未设（process.env 无该变量）→ 关闭
  assert.deepEqual(sp.giftEnabledPlans(), []);
});

// ==================== ③④⑤ 合成 ====================

test('合成 · 全部参与籽剩余 ≥ 360 天 → 玉永久（expires_at = null）', async () => {
  const phone = nextPhone();
  await setAssets(phone, { seeds: [seedLot(999, 365, 'sl_full')] });
  const before = await assetsOf(phone);

  const res = await sp.synthesizeJade(phone, T0);
  assert.equal(res.ok, true);
  assert.equal(res.seeds_deducted, 999);
  assert.equal(res.permanent, true);
  assert.equal(res.expires_at, null);
  assert.deepEqual(res.seeds_used, [{ lot_id: 'sl_full', qty: 999, expires_at: before.seeds[0].expires_at }]);

  const after = await assetsOf(phone);
  assert.equal(el.sumLots(after.seeds), 0);
  assert.equal(after.seeds.length, 0, '扣尽批次不得留 qty=0 残留批');
  assert.equal(after.jades.length, 1);
  assert.equal(after.jades[0].id, res.jade_id);
  assert.equal(after.jades[0].expires_at, null);
  assert.equal(after.jades[0].source, 'synthesis');
  assert.equal(after.jades[0].mounted_tree_id, undefined, '未镶嵌不带 mounted_tree_id');
  const tx = after.txs.filter((t) => t.type === 'jade_synth');
  assert.equal(tx.length, 1);
  assert.deepEqual(tx[0].delta, { seeds: -999, jades: 1 });
  assert.equal(tx[0].desc, '合成石榴籽玉');
});

test('合成 · 恰好 360 天 → 永久（边界含等号）', async () => {
  const phone = nextPhone();
  await setAssets(phone, { seeds: [seedLot(999, 360, 'sl_edge')] });
  const res = await sp.synthesizeJade(phone, T0);
  assert.equal(res.permanent, true);
  assert.equal(res.expires_at, null);
});

test('合成 · 存在 < 360 天的批 → 玉 expires_at = 所用籽中最早到期者的**原值**', async () => {
  const phone = nextPhone();
  await setAssets(phone, { seeds: [seedLot(600, 400, 'sl_later'), seedLot(500, 100, 'sl_earlier')] });
  const res = await sp.synthesizeJade(phone, T0);
  assert.equal(res.permanent, false);
  assert.equal(res.expires_at, isoAt(100), '取最早到期批的原值，不按天取整');
  // FIFO：最早到期先扣（跨批拆批）
  assert.deepEqual(res.seeds_used, [
    { lot_id: 'sl_earlier', qty: 500, expires_at: isoAt(100) },
    { lot_id: 'sl_later', qty: 499, expires_at: isoAt(400) },
  ]);
  const after = await assetsOf(phone);
  assert.equal(after.seeds.length, 1);
  assert.equal(after.seeds[0].id, 'sl_later');
  assert.equal(after.seeds[0].qty, 101, '拆批后剩余量正确');
  assert.equal(after.seeds[0].expires_at, isoAt(400), '拆批不改写 expires_at');
  assert.equal(after.jades[0].expires_at, isoAt(100));
});

test('合成 · 不足 999 → 409 整单拒绝（一籽不扣、不产玉、无流水）', async () => {
  const phone = nextPhone();
  await setAssets(phone, { seeds: [seedLot(500, 200, 'sl_a'), seedLot(498, 300, 'sl_b')] });
  const before = await assetsOf(phone);
  const err = await expectError(sp.synthesizeJade(phone, T0), 409, '当前可用 998 颗');
  assert.equal(err.code, 'ASSET_INSUFFICIENT');
  assert.equal(err.need, 999);
  assert.equal(err.current, 998);
  const after = await assetsOf(phone);
  assert.deepEqual(after, before, '409 后资产一字节不变');
  assert.equal(after.jades.length, 0);
  assert.equal(after.txs.length, 0);
  assert.match(err.message, /石榴籽不足：合成石榴籽玉需 999 颗完整石榴籽/);
});

// ==================== ⑥⑦ 分解 ====================

test('分解 · 永久玉 → 999 籽单一新批（365 天 / source=jade_decompose）+ 流水', async () => {
  const phone = nextPhone();
  await setAssets(phone, { jades: [jadeOf('jd_perm', null)] });
  const res = await sp.decomposeJade(phone, 'jd_perm', T0);
  assert.equal(res.seeds_returned, 999);
  assert.equal(res.jade_id, 'jd_perm');
  assert.equal(res.seed_expires_at, isoAt(365), '永久玉分解同样产 365 天籽（无永久籽）');
  const after = await assetsOf(phone);
  assert.equal(after.jades.length, 0);
  assert.equal(after.seeds.length, 1);
  assert.equal(after.seeds[0].id, res.seed_lot_id);
  assert.equal(after.seeds[0].qty, 999);
  assert.equal(after.seeds[0].source, 'jade_decompose');
  assert.equal(after.seeds[0].expires_at, isoAt(365));
  const tx = after.txs.filter((t) => t.type === 'jade_decompose');
  assert.equal(tx.length, 1);
  assert.deepEqual(tx[0].delta, { jades: -1, seeds: 999 });
});

test('分解 · 有期限玉同样返 365 天籽（不继承玉的 expires_at）', async () => {
  const phone = nextPhone();
  await setAssets(phone, { jades: [jadeOf('jd_short', 40)] });
  const res = await sp.decomposeJade(phone, 'jd_short', T0);
  assert.equal(res.seed_expires_at, isoAt(365));
  assert.notEqual(res.seed_expires_at, isoAt(40));
});

test('分解守卫 · 玉不存在 404 / 已镶嵌 409（镶嵌不可逆，无反向路由）', async () => {
  const { treeId, phone, jade_id } = await mountedTree();
  const before = await assetsOf(phone);
  await expectError(sp.decomposeJade(phone, 'jd_ghost', T0), 404, '未找到该石榴籽玉');
  await expectError(sp.decomposeJade(phone, jade_id, T0), 409, '已镶嵌的石榴籽玉不可分解');
  await expectError(sp.decomposeJade('16600009999', jade_id, T0), 404);
  await expectError(sp.decomposeJade(phone, '', T0), 400, '缺少 jade_id');
  const after = await assetsOf(phone);
  assert.deepEqual(after, before, '守卫拦截后资产不变');
  const entry = await entryOf(treeId);
  assert.equal(entry.jade.jade_id, jade_id, '凹槽占用不受分解接口影响');
});

// ==================== ⑧⑨ 镶嵌 ====================

test('镶嵌 · 建立初态（inactive / 不赠初始灵气）+ 个人侧去向留痕 + jade_mount 流水', async () => {
  const treeId = nextTree();
  const phone = nextPhone();
  await setAssets(phone, { jades: [jadeOf('jd_m1', 200)] });
  const res = await sp.mountJade(phone, treeId, 'jd_m1', T0);
  assert.deepEqual(res, {
    ok: true,
    tree_id: treeId,
    jade_id: 'jd_m1',
    mounted_at: T0.toISOString(),
    jade_expires_at: isoAt(200),
    status: 'inactive',
    spirit_expires_at: null,
  });
  const entry = await entryOf(treeId);
  assert.deepEqual(entry, {
    jade: { jade_id: 'jd_m1', mounted_at: T0.toISOString(), expires_at: isoAt(200) },
    spirit_expires_at: null,
    buffer_until: null,
    status: 'inactive',
    logs: [],
  });
  assert.equal(sp.settle(entry, T0), false, 'inactive 且已 settle → 无变化');
  const user = await assetsOf(phone);
  assert.equal(user.jades.length, 1, '镶嵌后个人侧记录保留（非物理删除）');
  assert.equal(user.jades[0].mounted_tree_id, treeId, '去向留痕');
  const tx = user.txs.filter((t) => t.type === 'jade_mount');
  assert.equal(tx.length, 1);
  assert.deepEqual(tx[0].delta, { jades: 0 });
  assert.deepEqual(tx[0].ref, { tree_id: treeId, jade_id: 'jd_m1' });
});

test('镶嵌 · 永久玉镶嵌后 expires_at 落 null（仅供展示，不驱动灵气）', async () => {
  const treeId = nextTree();
  const phone = nextPhone();
  await setAssets(phone, { jades: [jadeOf('jd_m2', null)] });
  await sp.mountJade(phone, treeId, 'jd_m2', T0);
  const entry = await entryOf(treeId);
  assert.equal(entry.jade.expires_at, null);
  assert.equal(entry.spirit_expires_at, null);
  assert.equal(entry.status, 'inactive');
});

test('镶嵌 · 同树二次镶嵌 → 409「凹槽已镶嵌石榴籽玉」，无副作用', async () => {
  const { treeId, phone } = await mountedTree();
  const other = nextPhone();
  await setAssets(other, { jades: [jadeOf('jd_second', null)] });
  const beforeEntry = await entryOf(treeId);
  const before = await assetsOf(other);
  await expectError(sp.mountJade(other, treeId, 'jd_second', T0), 409, '该家族树凹槽已镶嵌石榴籽玉');
  assert.deepEqual(await entryOf(treeId), beforeEntry, '凹槽保持首次镶嵌结果');
  assert.deepEqual(await assetsOf(other), before, '第二枚玉未被消耗');
  assert.ok(phone, '首次镶嵌方账号存在');
});

test('镶嵌 · 同一 jade_id 换树 → 409「该石榴籽玉已镶嵌，不可重复使用」', async () => {
  const t1 = nextTree();
  const t2 = nextTree();
  const phone = nextPhone();
  await setAssets(phone, { jades: [jadeOf('jd_dup', null)] });
  await sp.mountJade(phone, t1, 'jd_dup', T0);
  await expectError(sp.mountJade(phone, t2, 'jd_dup', T0), 409, '该石榴籽玉已镶嵌，不可重复使用');
  assert.equal(await entryOf(t2), null, '第二棵树不建立记录');
});

test('镶嵌守卫 · 总谱 400 / 树不存在 404 / 缺参 400 / 非本人玉 404', async () => {
  const phone = nextPhone();
  await setAssets(phone, { jades: [jadeOf('jd_g', null)] });
  await expectError(sp.mountJade(phone, 'zhonghua', 'jd_g', T0), 400, '中华世本无时流子域凹槽');
  await expectError(sp.mountJade(phone, 'no_such_tree', 'jd_g', T0), 404, '家族树不存在');
  await expectError(sp.mountJade(phone, '', 'jd_g', T0), 400, '缺少 tree_id');
  await expectError(sp.mountJade(phone, nextTree(), '', T0), 400, '缺少 jade_id');
  await expectError(sp.mountJade(phone, nextTree(), 'jd_not_mine', T0), 404, '未找到该石榴籽玉');
  // 祖谱 kind='clan' 可镶（K2）
  const clanPhone = nextPhone();
  await setAssets(clanPhone, { jades: [jadeOf('jd_clan', null)] });
  const res = await sp.mountJade(clanPhone, 'sp_clan', 'jd_clan', T0);
  assert.equal(res.status, 'inactive');
});

// ==================== ⑩⑪⑫⑬ 蓄能 ====================

test('蓄能 · 五档逐档：扣籽 / 天数 / 赠送 / 状态 / SpiritLog / 流水', async () => {
  const cases = [
    { plan: 'daily', seeds: 1, days: 1, gift: 0 },
    { plan: 'monthly', seeds: 29, days: 30, gift: 0 },
    { plan: 'quarterly', seeds: 109, days: 90, gift: 0 },
    { plan: 'half_year', seeds: 149, days: 180, gift: 200 },
    { plan: 'yearly', seeds: 299, days: 365, gift: 800 },
  ];
  for (const c of cases) {
    const { treeId, phone } = await mountedTree(nextTree(), [seedLot(500, 400, `sl_${c.plan}`)]);
    const res = await sp.chargeSpirit(phone, treeId, c.plan, T0, { env: {} });
    assert.equal(res.seeds_deducted, c.seeds, `${c.plan} 实价`);
    assert.equal(res.days, c.days, `${c.plan} 天数`);
    assert.equal(res.gift_bamboos, c.gift, `${c.plan} 赠送片数`);
    assert.equal(res.gift_bundles, Math.floor(c.gift / 100));
    assert.equal(res.status, 'active');
    assert.equal(res.spirit_expires_at, isoAt(c.days), `${c.plan} 首次灌注 = now + days`);
    assert.equal(res.spirit_expires_at_before, null);
    assert.equal(res.buffer_until_preview, isoAt(c.days + 30));
    assert.equal(res.seeds_balance_after, 500 - c.seeds);

    const entry = await entryOf(treeId);
    assert.equal(entry.status, 'active');
    assert.equal(entry.buffer_until, null);
    assert.equal(entry.logs.length, 1);
    const log = entry.logs[0];
    assert.equal(log.plan, c.plan);
    assert.equal(log.phone, phone);
    assert.equal(log.seeds, c.seeds);
    assert.equal(log.days, c.days);
    assert.equal(log.gift_bamboos, c.gift);
    assert.equal(log.spirit_expires_at_after, isoAt(c.days));
    assert.equal(log.ts, T0.toISOString());
    assert.match(log.id, /^spl_\d{13}_[a-z0-9]{6}$/);

    const user = await assetsOf(phone);
    if (c.gift > 0) {
      assert.equal(el.sumLots(user.bamboos), c.gift, '竹片以「片」计');
      assert.equal(user.bamboos[0].qty, c.gift);
      assert.equal(user.bamboos[0].source, 'spirit_gift');
      assert.equal(user.bamboos[0].expires_at, isoAt(365), '赠送竹片 365 天');
    } else {
      assert.equal(user.bamboos.length, 0, `${c.plan} 无赠送`);
    }
    const tx = user.txs.filter((t) => t.type === 'spirit_charge');
    assert.equal(tx.length, 1);
    assert.equal(tx[0].delta.seeds, -c.seeds);
    assert.deepEqual(tx[0].ref, { tree_id: treeId, plan: c.plan });
    if (c.gift > 0) assert.equal(tx[0].delta.bamboos, c.gift);
  }
});

test('蓄能 · 活动开关：quarterly 关闭 → 0 片；开启（process.env）→ 100 片', async () => {
  const a = await mountedTree(nextTree(), [seedLot(500, 400, 'sl_q_off')]);
  const off = await sp.chargeSpirit(a.phone, a.treeId, 'quarterly', T0, { env: {} });
  assert.equal(off.gift_bamboos, 0);
  assert.equal(off.gift_lot_id, null);
  assert.equal((await assetsOf(a.phone)).bamboos.length, 0);

  process.env.SPIRIT_GIFT_ACTIVITY = 'quarterly';
  try {
    const b = await mountedTree(nextTree(), [seedLot(500, 400, 'sl_q_on')]);
    const on = await sp.chargeSpirit(b.phone, b.treeId, 'quarterly', T0); // 缺省读 process.env
    assert.equal(on.gift_bamboos, 100);
    assert.ok(on.gift_lot_id);
    const user = await assetsOf(b.phone);
    assert.equal(user.bamboos[0].qty, 100);
    assert.equal(user.bamboos[0].source, 'spirit_gift');
    assert.equal((await entryOf(b.treeId)).logs[0].gift_bamboos, 100);
    // 日常档不受活动影响
    const c = await mountedTree(nextTree(), [seedLot(500, 400, 'sl_d_on')]);
    const daily = await sp.chargeSpirit(c.phone, c.treeId, 'daily', T0);
    assert.equal(daily.gift_bamboos, 0);
  } finally {
    delete process.env.SPIRIT_GIFT_ACTIVITY;
  }
});

test('蓄能 · 叠加不顺延覆盖：连续两档在**原到期值**上累加', async () => {
  const { treeId, phone } = await mountedTree(nextTree(), [seedLot(500, 400, 'sl_stack')]);
  const first = await sp.chargeSpirit(phone, treeId, 'monthly', T0);
  assert.equal(first.spirit_expires_at, isoAt(30));
  const second = await sp.chargeSpirit(phone, treeId, 'yearly', isoAt(10));
  assert.equal(second.spirit_expires_at_before, isoAt(30));
  assert.equal(second.spirit_expires_at, isoAt(30 + 365), '在原值上 +365 天（绝不覆盖为 now+365）');
  assert.ok(Date.parse(second.spirit_expires_at) > Date.parse(isoAt(10 + 365)), '恒 ≥ now + days');
  const third = await sp.chargeSpirit(phone, treeId, 'daily', isoAt(1));
  assert.equal(third.spirit_expires_at, isoAt(30 + 365 + 1));
  const entry = await entryOf(treeId);
  assert.equal(entry.logs.length, 3);
  assert.equal(entry.status, 'active');
  assert.deepEqual(entry.logs.map((l) => l.spirit_expires_at_after), [isoAt(30), isoAt(395), isoAt(396)]);
  assert.equal(el.sumLots((await assetsOf(phone)).seeds), 500 - 29 - 299 - 1);
});

test('蓄能 · 缓冲期灌注 → active、max(now, 原值)+days、buffer_until 清空', async () => {
  const { treeId, phone } = await mountedTree(nextTree(), [seedLot(500, 400, 'sl_buf')]);
  await sp.chargeSpirit(phone, treeId, 'daily', T0); // exp = T0 + 1 天
  // 手工把时间推到缓冲期中点（exp 已过 10 天）——惰性推进口径由 settle 负责
  const entry0 = await entryOf(treeId);
  entry0.spirit_expires_at = isoAt(-10);
  entry0.status = 'active'; // 故意置旧态，验证 settle 先行推进
  await setEntry(treeId, entry0);

  const T_buf = T0; // now 已过 exp（exp = T0 - 10 天）
  const seen = await sp.readSpiritEntry(treeId, T_buf);
  assert.equal(seen.status, 'buffer');
  assert.equal(seen.spirit_expires_at, isoAt(-10));

  const res = await sp.chargeSpirit(phone, treeId, 'monthly', T_buf);
  assert.equal(res.status, 'active');
  assert.equal(res.spirit_expires_at_before, isoAt(-10));
  assert.equal(res.spirit_expires_at, isoAt(30), '基期 = max(now, 原值) = now');
  const entry = await entryOf(treeId);
  assert.equal(entry.buffer_until, null);
  assert.equal(entry.status, 'active');
});

test('蓄能 · 失效后灌注 → active、now + days、buffer_until 清空', async () => {
  const { treeId, phone } = await mountedTree(nextTree(), [seedLot(500, 400, 'sl_exp')]);
  await sp.chargeSpirit(phone, treeId, 'daily', T0);
  const entry0 = await entryOf(treeId);
  entry0.spirit_expires_at = isoAt(-40); // 已越过 buffer_until（exp + 30 天）
  await setEntry(treeId, entry0);
  const seen = await sp.readSpiritEntry(treeId, T0);
  assert.equal(seen.status, 'expired');
  assert.equal(seen.buffer_until, isoAt(-40 + 30), 'expired 保留已过去的 buffer_until（供追溯）');

  const res = await sp.chargeSpirit(phone, treeId, 'daily', T0);
  assert.equal(res.spirit_expires_at, isoAt(1));
  assert.equal(res.status, 'active');
  const entry = await entryOf(treeId);
  assert.equal(entry.buffer_until, null);
  assert.equal(entry.logs.length, 2, 'logs 只追加');
});

test('蓄能 · 不足 → 409 整单拒绝（五种副作用全不发生）', async () => {
  const { treeId, phone } = await mountedTree(nextTree(), [seedLot(100, 400, 'sl_poor')]);
  await sp.chargeSpirit(phone, treeId, 'daily', T0);
  const beforeUser = await assetsOf(phone);
  const beforeEntry = await entryOf(treeId);

  const err = await expectError(sp.chargeSpirit(phone, treeId, 'yearly', T0), 409, '当前可用 99 颗');
  assert.equal(err.code, 'ASSET_INSUFFICIENT');
  assert.equal(err.need, 299);
  assert.equal(err.current, 99);
  assert.match(err.message, /石榴籽不足：本次需 299 颗/);

  assert.deepEqual(await assetsOf(phone), beforeUser, '籽 / 竹片 / 流水全不变');
  assert.deepEqual(await entryOf(treeId), beforeEntry, '灵气到期与 logs 不变');
});

test('蓄能守卫 · 未镶嵌 409 / plan 非法 400 / 树不存在 404 / 缺 tree_id 400', async () => {
  const emptyTree = nextTree();
  const phone = nextPhone();
  await setAssets(phone, { seeds: [seedLot(500, 400, 'sl_guard')] });
  await expectError(sp.chargeSpirit(phone, emptyTree, 'daily', T0), 409, '该家族树尚未镶嵌石榴籽玉，无法灌注玉露灵泽');

  const { treeId } = await mountedTree();
  await expectError(sp.chargeSpirit(phone, treeId, 'weekly', T0), 400, '不支持的蓄能档位');
  await expectError(sp.chargeSpirit(phone, treeId, undefined, T0), 400, '不支持的蓄能档位');
  await expectError(sp.chargeSpirit(phone, 'no_such_tree', 'daily', T0), 404, '家族树不存在');
  await expectError(sp.chargeSpirit(phone, '', 'daily', T0), 400, '缺少 tree_id');
  assert.equal((await assetsOf(phone)).txs.length, 0, '全部守卫拦截均不产生流水');
  assert.equal(await entryOf(emptyTree), null, '未镶嵌的树不建立记录');
});

test('蓄能 · 任何已登录用户（非本树成员）可灌注，SpiritLog.phone 记灌注者（K1）', async () => {
  const { treeId } = await mountedTree(nextTree(), []);
  const outsider = nextPhone();
  await setAssets(outsider, { seeds: [seedLot(10, 400, 'sl_out')] });
  const res = await sp.chargeSpirit(outsider, treeId, 'daily', T0);
  assert.equal(res.ok, true);
  const entry = await entryOf(treeId);
  assert.equal(entry.logs[0].phone, outsider);
});

// ==================== ⑭ 状态机 ⑯ 惰性推进 ====================

test('状态机 · 纯函数四态与 30 天缓冲边界（恰好到期 / 恰好越过 buffer_until）', () => {
  const mk = (exp, status = 'inactive', buffer_until = null) => ({
    jade: { jade_id: 'jd_s', mounted_at: T0.toISOString(), expires_at: null },
    spirit_expires_at: exp,
    buffer_until,
    status,
    logs: [],
  });

  // 未镶嵌 / 无 jade → 不进四态
  assert.equal(sp.settle(null, T0), false);
  assert.equal(sp.settle({ status: 'active' }, T0), false);
  const noJade = { spirit_expires_at: isoAt(10), status: 'active', logs: [] };
  assert.equal(sp.settle(noJade, T0), false);
  assert.equal(noJade.status, 'active', '无 jade 的记录不被改写');

  // inactive（从未灌注）
  const e1 = mk(null, 'active', isoAt(5));
  assert.equal(sp.settle(e1, T0), true);
  assert.equal(e1.status, 'inactive');
  assert.equal(e1.buffer_until, null);
  assert.equal(sp.settle(e1, T0), false, '幂等：重复 settle 无变化');

  // active（now < exp）
  const e2 = mk(isoAt(10), 'inactive', null);
  assert.equal(sp.settle(e2, T0), true);
  assert.equal(e2.status, 'active');
  assert.equal(e2.buffer_until, null);
  assert.equal(sp.settle(e2, T0), false);

  // 恰好到期（now === exp）→ buffer
  const e3 = mk(isoAt(0), 'active', null);
  assert.equal(sp.settle(e3, T0), true);
  assert.equal(e3.status, 'buffer');
  assert.equal(e3.buffer_until, isoAt(30), 'buffer_until = exp + 30 天');
  assert.equal(sp.settle(e3, T0), false);

  // 缓冲期内（exp + 29 天）→ buffer，边界不变
  const e4 = mk(isoAt(0), 'buffer', isoAt(30));
  assert.equal(sp.settle(e4, isoAt(29)), false, '仍在缓冲期且字段已对 → 无变化');
  assert.equal(e4.status, 'buffer');

  // 恰好越过 buffer_until（now === exp + 30 天）→ expired，buffer_until 保留
  const e5 = mk(isoAt(0), 'buffer', isoAt(30));
  assert.equal(sp.settle(e5, isoAt(30)), true);
  assert.equal(e5.status, 'expired');
  assert.equal(e5.buffer_until, isoAt(30), 'expired 保留已过去的 buffer_until');

  // expired → 再灌注由 chargeSpirit 回 active（此处只验状态字段不被 settle 改动）
  assert.equal(sp.settle(e5, isoAt(100)), false);

  // 脏值收口：非法日期 → inactive
  const e6 = mk('not-a-date', 'active', isoAt(5));
  assert.equal(sp.settle(e6, T0), true);
  assert.equal(e6.status, 'inactive');
  assert.equal(e6.buffer_until, null);
});

test('状态机 · 叠加基期纯函数 chargeBase / chargeNextExpiry', () => {
  assert.equal(sp.chargeBase(isoAt(10), T0), Date.parse(isoAt(10)), '原值未来 → 原值');
  assert.equal(sp.chargeBase(isoAt(-10), T0), T0.getTime(), '原值已过 → now');
  assert.equal(sp.chargeBase(null, T0), T0.getTime());
  assert.equal(sp.chargeNextExpiry(isoAt(10), 30, T0), isoAt(40));
  assert.equal(sp.chargeNextExpiry(isoAt(-10), 30, T0), isoAt(30));
  assert.equal(sp.chargeNextExpiry(null, 365, T0), isoAt(365));
});

test('惰性推进 · 模块内无 setInterval / setTimeout / cron（不依赖定时任务）', () => {
  const src = fs.readFileSync(path.join(HERE, 'economy-spirit.js'), 'utf8');
  assert.equal(/setInterval\s*\(/.test(src), false, '不得用 setInterval 驱动状态推进');
  assert.equal(/setTimeout\s*\(/.test(src), false, '不得用 setTimeout 驱动状态推进');
  assert.equal(/node-cron|cron\.schedule|scheduleJob/.test(src), false, '不得注册定时任务');
  assert.equal(/colSet\(/.test(src), true);
  assert.match(src, /status = 'expired'/);
});

test('惰性推进 · settleAllTrees 一次推进全部树（供资产 / 签到等入口复用）', async () => {
  const t1 = nextTree();
  const t2 = nextTree();
  await setEntry(t1, {
    jade: { jade_id: 'jd_s1', mounted_at: T0.toISOString(), expires_at: null },
    spirit_expires_at: isoAt(-40),
    buffer_until: null,
    status: 'active',
    logs: [],
  });
  await setEntry(t2, {
    jade: { jade_id: 'jd_s2', mounted_at: T0.toISOString(), expires_at: null },
    spirit_expires_at: isoAt(5),
    buffer_until: isoAt(35),
    status: 'buffer',
    logs: [],
  });
  const changed = await sp.settleAllTrees(T0);
  assert.ok(changed.includes(t1));
  assert.ok(changed.includes(t2));
  assert.equal((await entryOf(t1)).status, 'expired');
  assert.equal((await entryOf(t2)).status, 'active');
  assert.equal((await entryOf(t2)).buffer_until, null);
  assert.deepEqual(await sp.settleAllTrees(T0), [], '再次调用无变化 → 不写回');
});

// ==================== ⑮ 读口径 ====================

test('读口径 · 成员可见 logs（倒序 + logs_total）；返回 plans（单一真源）', async () => {
  const treeId = 'sp_f0'; // MEMBER 的锚点树
  const phone = MEMBER;
  await setAssets(phone, { seeds: [seedLot(500, 400, 'sl_member')], jades: [jadeOf('jd_member', null)] });
  await sp.mountJade(phone, treeId, 'jd_member', T0);
  await sp.chargeSpirit(phone, treeId, 'daily', T0);
  await sp.chargeSpirit(phone, treeId, 'monthly', isoAt(1));

  const info = await sp.spiritInfo(treeId, { phone: MEMBER, role: 'user' }, isoAt(2));
  assert.equal(info.tree_id, treeId);
  assert.equal(info.kind, 'family');
  assert.equal(info.mounted, true);
  assert.equal(info.status, 'active');
  assert.equal(info.spirit_expires_at, isoAt(31));
  assert.equal(info.buffer_until, null);
  assert.equal(info.buffer_until_preview, isoAt(61));
  assert.equal(info.days_left, 29);
  assert.equal(info.buffer_days_left, 0);
  assert.deepEqual(info.jade, { jade_id: 'jd_member', mounted_at: T0.toISOString(), expires_at: null });
  assert.equal(info.logs_visible, true);
  assert.equal(info.logs_notice, '');
  assert.equal(info.logs_total, 2);
  assert.equal(info.logs.length, 2);
  assert.deepEqual(
    info.logs.map((l) => l.plan),
    ['monthly', 'daily'],
    'logs 按 ts 倒序',
  );
  assert.equal(info.logs[0].spirit_expires_at_after, isoAt(31));
  assert.equal(info.can_charge, true);
  assert.equal(info.state_text.primary, '灵气充盈 · 剩余 29 天');
  assert.deepEqual(info.plans.map((p) => p.seeds), [1, 29, 109, 149, 299]);
  assert.deepEqual(info.plans.map((p) => p.days), [1, 30, 90, 180, 365]);
  assert.deepEqual(info.plans.map((p) => p.gift_pieces), [0, 0, 0, 200, 800]);
  assert.deepEqual(info.activity, { gift_enabled_plans: [] });
});

test('读口径 · 登录非成员仅摘要（logs = [] + logs_notice，不因 K1 放开写权而可见）', async () => {
  const { treeId, phone } = await mountedTree(nextTree(), [seedLot(10, 400, 'sl_nm')]);
  await sp.chargeSpirit(MEMBER, treeId, 'daily', T0);
  const info = await sp.spiritInfo(treeId, { phone: OTHER, role: 'user' }, T0);
  assert.equal(info.mounted, true);
  assert.equal(info.status, 'active');
  assert.equal(info.logs_visible, false);
  assert.deepEqual(info.logs, []);
  assert.equal(info.logs_total, 1, 'logs_total 仍给全量条数');
  assert.equal(info.logs_notice, '灵泽蓄能流水仅家族成员可查看');
  assert.equal(info.can_charge, true, 'K1：已登录即可灌注');
  assert.equal(info.jade.jade_id, `jd_${phone}`, '非成员仍可读凹槽门面信息');
});

test('读口径 · chief_editor（全局角色）视为成员；guest 仅摘要 + 登录提示', async () => {
  const { treeId } = await mountedTree(nextTree(), []);
  await sp.chargeSpirit(MEMBER, treeId, 'daily', T0);
  const chief = await sp.spiritInfo(treeId, { phone: CHIEF, role: 'chief_editor' }, T0);
  assert.equal(chief.logs_visible, true);
  assert.equal(chief.logs.length, 1);
  const guest = await sp.spiritInfo(treeId, null, T0);
  assert.equal(guest.logs_visible, false);
  assert.deepEqual(guest.logs, []);
  assert.equal(guest.logs_notice, '请先登录后查看灵泽蓄能流水');
  assert.equal(guest.can_charge, false, 'guest 不可灌注');
  assert.equal(guest.mounted, true, 'guest 可读摘要（家族门面信息）');
  assert.ok(guest.spirit_expires_at);
});

test('读口径 · 未镶嵌的树：mounted=false / status=null / 未镶嵌文案 / 无 jade', async () => {
  const treeId = nextTree();
  const info = await sp.spiritInfo(treeId, null, T0);
  assert.equal(info.mounted, false);
  assert.equal(info.status, null);
  assert.equal(info.spirit_expires_at, null);
  assert.equal(info.buffer_until, null);
  assert.equal(info.buffer_until_preview, null);
  assert.equal(info.jade, null);
  assert.deepEqual(info.logs, []);
  assert.equal(info.days_left, 0);
  assert.deepEqual(info.state_text, { primary: '未开启时流子域', secondary: '镶嵌石榴籽玉，解锁本家族专属空间' });
  assert.equal(await entryOf(treeId), null, '读路径不得建立记录');
});

test('读口径 · 400 缺 tree_id / 404 树不存在 / 摘要读法 spiritSummary', async () => {
  await expectError(sp.spiritInfo('', null, T0), 400, '缺少 tree_id');
  await expectError(sp.spiritInfo('no_such_tree', null, T0), 404, '家族树不存在');
  const { treeId } = await mountedTree(nextTree(), []);
  const sum = await sp.spiritSummary(treeId, T0);
  assert.equal(sum.mounted, true);
  assert.equal(sum.status, 'inactive');
  await expectError(sp.spiritSummary('no_such_tree', T0), 404);
});

test('读口径 · settle 先于出参（过期后读即 buffer / expired）', async () => {
  const treeId = nextTree();
  const phone = nextPhone();
  await setAssets(phone, { jades: [jadeOf('jd_read', null)], seeds: [seedLot(50, 400, 'sl_read')] });
  await sp.mountJade(phone, treeId, 'jd_read', T0);
  await sp.chargeSpirit(phone, treeId, 'daily', T0); // exp = T0 + 1 天

  const buffered = await sp.spiritInfo(treeId, null, isoAt(2));
  assert.equal(buffered.status, 'buffer');
  assert.equal(buffered.buffer_until, isoAt(31));
  assert.equal(buffered.buffer_days_left, 29);
  assert.equal((await entryOf(treeId)).status, 'buffer', '读路径写回推进结果（惰性结算）');

  const expired = await sp.spiritInfo(treeId, null, isoAt(40));
  assert.equal(expired.status, 'expired');
  assert.equal(expired.buffer_until, isoAt(31));
  assert.equal(expired.state_text.primary, '时流子域已停用');
});

// ==================== 注入者反查（口径 v6：GET /spirit 出参 injector） ====================

test('读口径 · 注入者反查（`injector`）：三态 + 昵称兜底 + 手机号不下发', async () => {
  // ① 未镶嵌 → injector = null（不反查、不猜）
  assert.equal((await sp.spiritInfo(nextTree(), null, T0)).injector, null, '未镶嵌树 injector = null');

  // ② 正常态：注入者有本树锚点 → nickname + person_handle
  const treeA = nextTree();
  const injectorA = await newUser();
  await store.colSet('jiazu_users', injectorA, { _id: injectorA, phone: injectorA, nickname: '注入者甲', role: 'user' });
  await setAssets(injectorA, { jades: [jadeOf('jd_inj_a', null)] });
  await sp.mountJade(injectorA, treeA, 'jd_inj_a', T0);
  await store.colSet('jiazu_anchors', injectorA, {
    _id: injectorA, tree_id: treeA, person_handle: 'h_inj_a', updated_at: T0.toISOString(),
  });
  const ok = await sp.spiritInfo(treeA, null, T0);
  assert.deepEqual(ok.injector, { nickname: '注入者甲', person_handle: 'h_inj_a' });
  assert.equal(ok.jade.jade_id, 'jd_inj_a', '已镶玉信息保留（注入者是新增字段，不动既有出参）');
  assert.ok(!JSON.stringify(ok).includes(injectorA), '出参不得出现注入者手机号');
  assert.ok(!JSON.stringify(ok).includes('1660'), '出参任何位置都不得出现手机号片段');

  // ③ 有昵称但**无锚点** → person_handle = null（前端示「注入者无本树节点」）
  const treeB = nextTree();
  const injectorB = await newUser(); // newUser 已写昵称；**不建锚点**
  await setAssets(injectorB, { jades: [jadeOf('jd_inj_b', null)] });
  await sp.mountJade(injectorB, treeB, 'jd_inj_b', T0);
  assert.equal(await store.colGet('jiazu_anchors', injectorB), null, '夹具前提：该注入者无锚点');
  const noAnchor = (await sp.spiritInfo(treeB, null, T0)).injector;
  assert.equal(noAnchor.person_handle, null, '无锚点 → person_handle = null');
  assert.ok(noAnchor.nickname, '无锚点态昵称仍有值');
  assert.ok(!JSON.stringify(noAnchor).includes(injectorB), '无锚点态也不得泄露手机号');

  // ④ 锚点存在但**跨树**（anchor.tree_id !== tree_id）→ 同样 person_handle = null（不得错挂别树节点）
  const treeC = nextTree();
  const injectorC = await newUser();
  await setAssets(injectorC, { jades: [jadeOf('jd_inj_c', null)] });
  await sp.mountJade(injectorC, treeC, 'jd_inj_c', T0);
  await store.colSet('jiazu_anchors', injectorC, {
    _id: injectorC, tree_id: 'sp_f0', person_handle: 'h_other_tree', updated_at: T0.toISOString(),
  });
  const crossTree = (await sp.spiritInfo(treeC, null, T0)).injector;
  assert.equal(crossTree.person_handle, null, '锚点跨树 → person_handle = null');
  assert.ok(crossTree.nickname);

  // ⑤ 反查不到（凹槽有记录、资产侧无对应 `mounted_tree_id`）→ injector = null
  const treeD = nextTree();
  await setEntry(treeD, {
    jade: { jade_id: 'jd_ghost', mounted_at: T0.toISOString(), expires_at: null },
    spirit_expires_at: null, buffer_until: null, status: 'inactive', logs: [],
  });
  const ghost = await sp.spiritInfo(treeD, null, T0);
  assert.equal(ghost.mounted, true, '夹具前提：凹槽有记录');
  assert.equal(ghost.injector, null, '反查不到 → injector = null');
  assert.equal(ghost.jade.expires_at, null, '槽位 jade 原样回传（到期语义本轮不动）');

  // ⑥ 昵称缺失 → 脱敏手机号兜底，且仍不含完整手机号
  const treeE = nextTree();
  const nameless = await newUser();
  await store.colSet('jiazu_users', nameless, { _id: nameless, phone: nameless, nickname: '', role: 'user' });
  await setAssets(nameless, { jades: [jadeOf('jd_inj_e', null)] });
  await sp.mountJade(nameless, treeE, 'jd_inj_e', T0);
  const masked = (await sp.spiritInfo(treeE, null, T0)).injector;
  assert.equal(masked.nickname, `${nameless.slice(0, 3)}****${nameless.slice(-4)}`, '昵称缺失 → 脱敏手机号兜底');
  assert.ok(!JSON.stringify(masked).includes(nameless), '脱敏后不得含完整手机号');

  // ⑦ 零迁移 / 零改写：注入者反查全程只读（槽位与玉记录都不被改动）
  assert.equal((await entryOf(treeA)).jade.expires_at, null, '槽位 expires_at 原样保留');
  assert.equal((await entryOf(treeA)).jade.mounted_at, T0.toISOString(), '槽位 mounted_at 原样保留');
  assert.equal((await assetsOf(injectorA)).jades[0].mounted_tree_id, treeA, '玉记录去向留痕原样保留');
});

// ==================== 路由级：五条路由（index.js 接线 · P2 第二段） ====================
// 规格：docs/spirit-domain.spec.md §6-1 / §6-2 / §6-6（错误码）/ §7（GET /spirit 读口径）/ §12-1（鉴权口径）

test('路由 · 四条写路由未登录一律 401（无 Bearer / 无效 Bearer）；GET /spirit 未登录返回 200 摘要（§7-2）', async () => {
  const treeId = nextTree();
  const bad = { authorization: 'Bearer not-a-jwt' };
  const cases = [
    ['/spirit/mount-jade', { tree_id: treeId, jade_id: 'jd_x' }],
    ['/spirit/charge', { tree_id: treeId, plan: 'daily' }],
    ['/assets/synthesize-jade', {}],
    ['/assets/decompose-jade', { jade_id: 'jd_x' }],
  ];
  for (const [p, body] of cases) {
    const anon = await call(p, 'POST', {}, {}, body);
    assert.equal(anon.statusCode, 401, `${p} 未登录应 401，实际 ${anon.statusCode}：${anon.body}`);
    const b = jsonOf(anon);
    assert.ok(b.error, `${p} 401 应带 error 文案`);
    assert.equal(b.code, undefined, `${p} 401 不得带域名码`);
    assert.equal((await call(p, 'POST', bad, {}, body)).statusCode, 401, `${p} 无效 Bearer 应 401`);
  }
  // GET /spirit：guest 读**摘要**（K1 定稿：401 只出现在写路由，§7-2）
  const guest = await call('/spirit', 'GET', {}, { tree_id: treeId });
  assert.equal(guest.statusCode, 200, guest.body);
  const g = jsonOf(guest);
  assert.equal(g.tree_id, treeId);
  assert.equal(g.mounted, false);
  assert.equal(g.status, null);
  assert.deepEqual(g.logs, []);
  assert.equal(g.logs_visible, false);
  assert.equal(g.logs_notice, '请先登录后查看灵泽蓄能流水');
  assert.equal(g.can_charge, false);
  assert.equal(g.plans.length, 5);
  assert.equal(await entryOf(treeId), null, '读路径不得建立记录');
});

test('路由 · K1 权限放开：非本树成员的普通登录用户镶嵌 200 + 灌注 200（无 403 档）', async () => {
  const treeId = nextTree();
  await setAssets(OTHER, { jades: [jadeOf('jd_k1', null)], seeds: [seedLot(50, 400, 'sl_k1')] });
  const otherAnchor = await store.colGet('jiazu_anchors', OTHER);
  // 夹具前提（本文件 seed）：只有 MEMBER 有锚点（sp_f0）；OTHER = **无锚点的普通登录用户**
  assert.equal(otherAnchor, null, '夹具前提：OTHER 无 jiazu_anchors 记录（登录非成员）');
  assert.notEqual(treeId, 'sp_f0', '夹具前提：用例独占树 ≠ MEMBER 的锚点树');

  const mount = await call('/spirit/mount-jade', 'POST', bearer(OTHER), {}, { tree_id: treeId, jade_id: 'jd_k1' });
  assert.equal(mount.statusCode, 200, `非成员镶嵌应 200（不得 403），实际 ${mount.statusCode}：${mount.body}`);
  const m = jsonOf(mount);
  assert.equal(m.tree_id, treeId);
  assert.equal(m.status, 'inactive');
  assert.equal(m.spirit_expires_at, null);

  const charge = await call('/spirit/charge', 'POST', bearer(OTHER), {}, { tree_id: treeId, plan: 'daily' });
  assert.equal(charge.statusCode, 200, `非成员灌注应 200（不得 403），实际 ${charge.statusCode}：${charge.body}`);
  const c = jsonOf(charge);
  assert.equal(c.seeds_deducted, 1);
  assert.equal(c.days, 1);
  assert.equal(c.status, 'active');
  assert.ok(String(c.log_id).startsWith('spl_'), `SpiritLog.id 应为 spl_ 前缀：${c.log_id}`);
  assert.ok(Date.parse(c.spirit_expires_at) > Date.now() + 0.9 * DAY, '灵气到期应顺延至 now + 1 天');
  assert.equal((await assetsOf(OTHER)).seeds.length, 1);
  assert.equal((await assetsOf(OTHER)).seeds[0].qty, 49, `灌注者本人籽被扣（50 → 49）：${JSON.stringify((await assetsOf(OTHER)).seeds)}`);

  // 非成员仍看不到流程（K1 只放开写权，不改 §7-2 读数）
  const seenRes = await call('/spirit', 'GET', bearer(OTHER), { tree_id: treeId });
  assert.equal(seenRes.statusCode, 200, `登录非成员读应 200 摘要，实际 ${seenRes.statusCode}：${seenRes.body}`);
  const seen = jsonOf(seenRes);
  assert.equal(seen.logs_visible, false);
  assert.deepEqual(seen.logs, []);
  assert.equal(seen.logs_notice, '灵泽蓄能流水仅家族成员可查看');
  assert.equal(seen.can_charge, true);
  assert.equal(seen.logs_total, 1);
  // 成员（chief_editor 全局角色视为成员）可见全量流水
  const chief = jsonOf(await call('/spirit', 'GET', bearer(CHIEF, 'chief_editor'), { tree_id: treeId }));
  assert.equal(chief.logs_visible, true);
  assert.equal(chief.logs.length, 1);
  assert.equal(chief.logs[0].phone, OTHER, '流水记灌注者手机号');
  assert.equal(chief.logs[0].plan, 'daily');
  assert.equal(chief.logs[0].seeds, 1);
  assert.equal(chief.logs[0].days, 1);
  assert.equal(chief.logs[0].gift_bamboos, 0);
});

test('路由 · 灌注籽不足 → 409 整单拒绝（code=ASSET_INSUFFICIENT + need/current），灵气与流水不变', async () => {
  const treeId = nextTree();
  const phone = await newUser();
  await setAssets(phone, { jades: [jadeOf('jd_poor', null)], seeds: [seedLot(5, 400, 'sl_poor')] });
  assert.equal((await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: treeId, jade_id: 'jd_poor' })).statusCode, 200);

  const res = await call('/spirit/charge', 'POST', bearer(phone), {}, { tree_id: treeId, plan: 'monthly' });
  assert.equal(res.statusCode, 409, res.body);
  const b = jsonOf(res);
  assert.equal(b.code, 'ASSET_INSUFFICIENT');
  assert.equal(b.need, 29);
  assert.equal(b.current, 5);
  assert.equal(b.unit, 'seeds');
  assert.ok(String(b.error).includes('石榴籽不足'));
  const entry = await entryOf(treeId);
  assert.equal(entry.status, 'inactive', '整单拒绝：灵气状态不变');
  assert.equal(entry.spirit_expires_at, null);
  assert.deepEqual(entry.logs, []);
  assert.equal((await assetsOf(phone)).seeds[0].qty, 5, '整单拒绝：籽一颗不扣');
});

test('路由 · 镶嵌守卫：总谱 400 / 二次镶嵌 409 / 跨树同玉 409 / 玉不存在 404 / 缺参 400', async () => {
  const treeId = nextTree();
  const phone = await newUser();
  await setAssets(phone, { jades: [jadeOf('jd_a', null), jadeOf('jd_b', null)] });

  const master = await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: 'zhonghua', jade_id: 'jd_a' });
  assert.equal(master.statusCode, 400, master.body);
  assert.equal(jsonOf(master).error, '中华世本无时流子域凹槽');

  assert.equal((await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: treeId, jade_id: 'jd_a' })).statusCode, 200);

  const again = await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: treeId, jade_id: 'jd_b' });
  assert.equal(again.statusCode, 409, again.body);
  assert.equal(jsonOf(again).error, '该家族树凹槽已镶嵌石榴籽玉');

  const cross = await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: nextTree(), jade_id: 'jd_a' });
  assert.equal(cross.statusCode, 409, cross.body);
  assert.equal(jsonOf(cross).error, '该石榴籽玉已镶嵌，不可重复使用');

  const gone = await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: nextTree(), jade_id: 'jd_ghost' });
  assert.equal(gone.statusCode, 404, gone.body);
  assert.equal(jsonOf(gone).error, '未找到该石榴籽玉');

  const noTree = await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { jade_id: 'jd_b' });
  assert.equal(noTree.statusCode, 400);
  assert.equal(jsonOf(noTree).error, '缺少 tree_id');
  const noJade = await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: nextTree() });
  assert.equal(noJade.statusCode, 400);
  assert.equal(jsonOf(noJade).error, '缺少 jade_id');
  // 树不存在 → 404（tree-meta 无登记）
  const noSuchTree = await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: 'no_such_tree', jade_id: 'jd_b' });
  assert.equal(noSuchTree.statusCode, 404);
  assert.equal(jsonOf(noSuchTree).error, '家族树不存在');
});

test('路由 · 合成：不足 999 → 409（code/need/current，籽与玉都不变）；够 999 → 200 永久玉', async () => {
  const phone = await newUser();
  await setAssets(phone, { seeds: [seedLot(10, 400, 'sl_short')] });

  const short = await call('/assets/synthesize-jade', 'POST', bearer(phone));
  assert.equal(short.statusCode, 409, short.body);
  const s = jsonOf(short);
  assert.equal(s.code, 'ASSET_INSUFFICIENT');
  assert.equal(s.need, 999);
  assert.equal(s.current, 10);
  assert.equal(s.unit, 'seeds');
  assert.ok(String(s.error).includes('石榴籽不足'));
  const after1 = await assetsOf(phone);
  assert.equal(after1.seeds.length, 1);
  assert.equal(after1.seeds[0].qty, 10, '整单拒绝：籽未扣');
  assert.equal(after1.jades.length, 0, '整单拒绝：不产玉');

  await setAssets(phone, { seeds: [seedLot(999, 400, 'sl_full')] });
  const full = await call('/assets/synthesize-jade', 'POST', bearer(phone));
  assert.equal(full.statusCode, 200, full.body);
  const f = jsonOf(full);
  assert.equal(f.ok, true);
  assert.equal(f.seeds_deducted, 999);
  assert.equal(f.permanent, true);
  assert.equal(f.expires_at, null);
  const after2 = await assetsOf(phone);
  assert.equal(after2.jades.length, 1);
  assert.equal(after2.jades[0].id, f.jade_id);
  assert.equal(after2.seeds.length, 0);
});

test('路由 · 分解：已镶嵌玉 409 / 玉不存在 404 / 未镶嵌玉 200（返 999 籽 / 365 天）', async () => {
  const treeId = nextTree();
  const phone = await newUser();
  await setAssets(phone, { jades: [jadeOf('jd_m', null), jadeOf('jd_free', null)] });
  assert.equal((await call('/spirit/mount-jade', 'POST', bearer(phone), {}, { tree_id: treeId, jade_id: 'jd_m' })).statusCode, 200);

  const mounted = await call('/assets/decompose-jade', 'POST', bearer(phone), {}, { jade_id: 'jd_m' });
  assert.equal(mounted.statusCode, 409, mounted.body);
  assert.equal(jsonOf(mounted).error, '已镶嵌的石榴籽玉不可分解');

  const ghost = await call('/assets/decompose-jade', 'POST', bearer(phone), {}, { jade_id: 'jd_ghost' });
  assert.equal(ghost.statusCode, 404);
  assert.equal(jsonOf(ghost).error, '未找到该石榴籽玉');

  const noId = await call('/assets/decompose-jade', 'POST', bearer(phone), {}, {});
  assert.equal(noId.statusCode, 400);
  assert.equal(jsonOf(noId).error, '缺少 jade_id');

  const freed = await call('/assets/decompose-jade', 'POST', bearer(phone), {}, { jade_id: 'jd_free' });
  assert.equal(freed.statusCode, 200, freed.body);
  const d = jsonOf(freed);
  assert.equal(d.ok, true);
  assert.equal(d.seeds_returned, 999);
  assert.equal(d.jade_id, 'jd_free');
  assert.ok(Date.parse(d.seed_expires_at) > Date.now() + 364 * DAY, '分解产籽统一 365 天');
  const after = await assetsOf(phone);
  assert.equal(after.jades.length, 1, '仅移除被分解的玉');
  assert.equal(after.seeds[0].qty, 999);
});

test('路由 · GET /spirit 惰性推进：buffer / expired / inactive（写时间字段造态，不睡时钟）', async () => {
  const treeId = nextTree();
  const jade = { jade_id: 'jd_state', mounted_at: nowIso(), expires_at: null };
  const exp1 = isoFromNow(-1); // 灵气 1 天前到期 → buffer（buffer_until 仍在未来）
  await setEntry(treeId, {
    jade: { ...jade },
    spirit_expires_at: exp1,
    buffer_until: null,
    status: 'active',
    logs: [{ id: 'spl_state_1', ts: exp1, phone: CHIEF, plan: 'daily', seeds: 1, days: 1, gift_bamboos: 0, spirit_expires_at_after: exp1 }],
  });
  const buf = jsonOf(await call('/spirit', 'GET', {}, { tree_id: treeId }));
  assert.equal(buf.status, 'buffer');
  assert.equal(buf.buffer_until, new Date(Date.parse(exp1) + 30 * DAY).toISOString());
  assert.equal(buf.buffer_until_preview, buf.buffer_until);
  assert.equal(buf.days_left, 0);
  assert.ok(buf.buffer_days_left > 0 && buf.buffer_days_left <= 30, `缓冲剩余天数越界：${buf.buffer_days_left}`);
  assert.ok(buf.state_text.primary.includes('缓冲期剩余'), buf.state_text.primary);
  assert.equal((await entryOf(treeId)).status, 'buffer', '读路径写回推进结果（惰性结算）');

  const exp2 = isoFromNow(-40); // 灵气 40 天前到期 → buffer_until 已过去 → expired
  await setEntry(treeId, { ...(await entryOf(treeId)), spirit_expires_at: exp2, buffer_until: null, status: 'buffer' });
  const expd = jsonOf(await call('/spirit', 'GET', {}, { tree_id: treeId }));
  assert.equal(expd.status, 'expired');
  assert.equal(expd.buffer_until, new Date(Date.parse(exp2) + 30 * DAY).toISOString());
  assert.equal(expd.buffer_days_left, 0);
  assert.equal(expd.state_text.primary, '时流子域已停用');
  assert.equal((await entryOf(treeId)).status, 'expired');

  // 已镶嵌、从未灌注 → inactive（buffer_until 清空为 null）
  await setEntry(treeId, { jade: { ...jade }, spirit_expires_at: null, buffer_until: exp2, status: 'expired', logs: [] });
  const inact = jsonOf(await call('/spirit', 'GET', {}, { tree_id: treeId }));
  assert.equal(inact.status, 'inactive');
  assert.equal(inact.buffer_until, null);
  assert.equal(inact.buffer_until_preview, null);
  assert.equal(inact.state_text.primary, '时流子域 · 未激活');
  assert.equal(inact.mounted, true);
  assert.equal(inact.jade.jade_id, 'jd_state');
});

test('路由 · GET /spirit 的 tree_id 口径（X-Tree-Id 头或 ?tree_id）与 400 / 404；错误体不回显系统文本', async () => {
  const treeId = nextTree();
  const miss = await call('/spirit', 'GET');
  assert.equal(miss.statusCode, 400, miss.body);
  assert.equal(jsonOf(miss).error, '缺少 tree_id');

  const nosuch = await call('/spirit', 'GET', {}, { tree_id: 'no_such_tree' });
  assert.equal(nosuch.statusCode, 404, nosuch.body);
  assert.equal(jsonOf(nosuch).error, '家族树不存在');

  const viaHeader = await call('/spirit', 'GET', { 'X-Tree-Id': treeId }, {});
  assert.equal(viaHeader.statusCode, 200, viaHeader.body);
  assert.equal(jsonOf(viaHeader).tree_id, treeId);
  const viaQuery = await call('/spirit', 'GET', {}, { tree_id: treeId });
  assert.equal(viaQuery.statusCode, 200);
  assert.equal(jsonOf(viaQuery).tree_id, treeId);

  for (const res of [miss, nosuch]) {
    const b = jsonOf(res);
    assert.equal(b.status, undefined, '域名错误体不带系统 status 字段');
    assert.ok(!/EACCES|ENOENT|open '|\/Users\/|\/tmp\//.test(res.body), `错误体不得回显系统错误文本：${res.body}`);
  }
});

// ==================== 枚举与真源 ====================

test('Tx.type 白名单含时流子域四项；未知类型仍抛错', () => {
  for (const t of ['jade_synth', 'jade_decompose', 'jade_mount', 'spirit_charge']) {
    assert.ok(el.TX_TYPES.includes(t), `TX_TYPES 应含 ${t}`);
  }
  const user = { txs: [] };
  assert.throws(() => el.recordTx(user, { type: 'jade_synth_typo' }, T0), /未知流水类型/);
  el.recordTx(user, { type: 'jade_mount', delta: { jades: 0 } }, T0);
  assert.equal(user.txs.length, 1);
});

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

// ==================== ⑮ Infinity 收口（JSON 文本 1e999 经 JSON.parse = Infinity） ====================

test('Infinity 收口：外部 days_left / buffer_days_left 归 0，绝不出现在四态投影里', () => {
  const INF = JSON.parse('1e999'); // 云端 / 前端写进来的 JSON 文本 1e999
  assert.equal(INF, Number.POSITIVE_INFINITY);
  const active = sp.stateTextOf('active', { days_left: INF, expires_date: '2026-01-01' });
  assert.equal(active.primary, '灵气充盈 · 剩余 0 天', 'Infinity 必须归 0（改前为「剩余 Infinity 天」）');
  const buffer = sp.stateTextOf('buffer', { buffer_days_left: INF, buffer_date: '2026-01-01' });
  assert.equal(buffer.primary, '灵气已尽 · 缓冲期剩余 0 天');
  assert.equal(
    /Infinity|NaN/.test(JSON.stringify([active, buffer])),
    false,
    '任何投影里都不得出现 Infinity / NaN',
  );
});
