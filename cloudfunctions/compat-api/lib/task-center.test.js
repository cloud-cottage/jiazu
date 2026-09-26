/**
 * 任务中心域单测（批3）— lib/task-center.js ＋ 两条路由（GET /tasks/today · POST /tasks/claim）
 *             ＋ 缺陷 D-1（续约锁定后端强制校验）的**单元面**反证
 *
 * 规格口径（本单硬口径逐条）：
 *   三条每日任务枚举名逐字：`signin`（签到）/ `invite`（邀请新用户注册）/ `write`（平台写操作）
 *   达标判定：签到 = 当日已签到（`signin_date`）；邀请 = 当日一条 `reward` + `ref.kind='invite'` 流水；
 *             写操作 = 当日一条成功写流水（`edit_fee` / `delete_fee` / `move_fee` / `tree_create`），
 *             失败 / 被拒 / no-op 均无流水 ⇒ 不计（noop-edit-integrity 口径）
 *   每日重置 = **北京自然日日期串比对**（`beijingDate`）；**不注册定时任务、不依赖零点整**
 *   手动领取（T-4）：只有 `claimTask` / `POST /tasks/claim` 才发奖；奖励池快照 = 领取时刻生效好友数
 *   奖励口径（R-5）：本人基础 = 石榴籽碎片 1 + 竹片 1；池 = 石榴籽碎片 1 + 兰帖残页 1，按生效好友数
 *             均分、向下取整、余数销毁；分母 0 ⇒ 不建池零流水；触发者不入池；好友所得不再触发分发；
 *             池分发**唯一入口** = friend-ops.distributeFriendRewards（本模块不另写一套）
 *   幂等：同一自然日 (用户, 任务) 只可领一次；⚠️ `signin` 与既有签到卡**共用同一 `signin_date`** 判定，
 *         任何一方先领另一方即视为已领，**绝不双发**（既有签到卡已改为调用同一入口）
 *   三态（T-3）：未达标 / 可领取 / 已领取，未达标一律带中文文案（不得静默失败）
 *   D-1：`POST /assets/scroll/decompose` 必须先扣掉续约锁定片数；
 *         可分解枚数 = floor((总片数 − 锁定片数) / 100)，超出 ⇒ 409 `SCROLL_LOCKED_INSUFFICIENT`
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（照 assets.test.js / friend-ops.test.js）；
 *          文末断言真实 config/ + migrate-output/ 全量 md5 前后一致。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/task-center.test.js
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
const MOD_SRC = path.join(HERE, 'task-center.js');
const PKG_FILE = path.join(REPO, 'package.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_CONFIG = path.join(REPO, 'config');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-taskcenter-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');

/** 真源全量指纹（config/ + migrate-output/ 全树，逐文件 md5 再聚合） */
function realSourceFingerprint() {
  const files = [];
  const walk = (dir, rel) => {
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const full = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (fs.statSync(full).isDirectory()) walk(full, r);
      else files.push({ rel: r, hash: md5(full) });
    }
  };
  walk(REAL_OUT, 'migrate-output');
  walk(REAL_CONFIG, 'config');
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  const agg = crypto.createHash('md5');
  for (const f of files) agg.update(`${f.rel}\u0000${f.hash}\n`);
  return { count: files.length, digest: agg.digest('hex') };
}
const REAL_FP_BEFORE = realSourceFingerprint();

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

// ---- 用户集合（路由层鉴权用；一人一文档，_id = 手机号） ----
const U = {
  /** 主用例用户：任务中心 / 签到合并 / 池分发 */
  main: '16610000001',
  /** 生效好友 */
  friendA: '16610000002',
  friendB: '16610000003',
  /** 待邀请（未接受）—— 分母不得计入 */
  pending: '16610000004',
  /** 未锁定控制组（D-1 正对照） */
  free: '16610000005',
  /** D-1：200 片 + 锁 1 枚 */
  twoScrolls: '16610000006',
  /** D-1：锁超时后自动解锁 */
  expired: '16610000007',
};
const ALL_USERS = Object.values(U).map((phone) => [phone, { _id: phone, phone, nickname: `用户${phone.slice(-4)}`, role: 'user' }]);
fs.writeFileSync(path.join(TMP, 'collections', 'jiazu_users.json'), JSON.stringify(Object.fromEntries(ALL_USERS)));

const L = await import('./economy-ledger.js');
const F = await import('./friends.js');
const OPS = await import('./friend-ops.js');
const TC = await import('./task-center.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const TC_SRC = fs.readFileSync(MOD_SRC, 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(HERE, '..', 'index.js'), 'utf8');

const DAY = 86400000;
const bearer = (phone) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: 'user' }, 3600)}` });
const call = (p, method = 'GET', headers = {}, body = null) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: {},
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
  });
const json = (res) => JSON.parse(res.body);
/** 独立实现的北京时间自然日（不引用被测模块的 beijingDate） */
const cnDay = (d = new Date()) => new Date((d instanceof Date ? d.getTime() : Date.parse(d)) + 8 * 3600 * 1000).toISOString().slice(0, 10);

const assetsOf = (phone) => L.getAssets(phone);
const txsOf = (phone) => assetsOf(phone).then((u) => u.txs || []);
const fragmentsOf = (phone) => assetsOf(phone).then((u) => u.fragments);
const bamboosOf = (phone) => assetsOf(phone).then((u) => L.sumLots(u.bamboos));
const scrollFragsOf = (phone) => assetsOf(phone).then((u) => u.scroll_fragments);
const piecesOf = (phone) => assetsOf(phone).then((u) => L.sumLots(u.scrolls));
const seed = (phone, patch) => L.withAssets(phone, (u) => Object.assign(u, patch));
/** 造 N 枚成品兰帖（N × 100 片 → ledger 自动合成 N 个 qty=100 的批） */
const giveScrolls = (phone, n, now) =>
  L.withAssets(phone, (u) => L.addScrollFragments(u, n * L.SCROLL_PIECES_PER_SCROLL, now));
/** 造一条**当日**流水（走唯一写路径 recordTx；type 必须在白名单内） */
const mkTx = (phone, tx, now) => L.withAssets(phone, (u) => L.recordTx(u, tx, now));

const rid = (a, b) => F.relationIdOf(a, b);
/** 建一份 active 关系（前置一律直接走关系域，干净可复现） */
async function activeRelation(a, b, now) {
  await F.createInvite(a, b, { now });
  await F.acceptInvite(rid(a, b), b, { now });
  return { a, b, id: rid(a, b), token: OPS.relationTokenOf(rid(a, b)) };
}
/** 建一份**待邀请**关系（未接受 ⇒ 不计入池分母） */
async function pendingRelation(a, b, now) {
  await F.createInvite(a, b, { now });
  return { token: OPS.relationTokenOf(rid(a, b)), id: rid(a, b) };
}
/**
 * 建一份**处于续约窗口内**的 active 关系：T0 = now − 364 天 ⇒ 到期 ≈ now + 1 天，
 * 续约窗口（到期前 30 天）已开 ⇒ `requestRenewal(…, now)` 可发起（否则 409 NOT_IN_RENEW_WINDOW）。
 */
async function windowRelation(a, b, now) {
  return activeRelation(a, b, new Date(now.getTime() - 364 * DAY));
}

/** 达标 / 三态用的干净用户快照（纯函数入参，不落盘） */
const blankUser = () => ({ fragments: 0, scroll_fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' });

// ══ ① 导出清单 / 枚举名 / 奖励口径（逐字） ══════════════════════════════════════
test('① 枚举名逐字（signin/invite/write）+ 三态枚举与中文 + R-5 奖励口径逐字 + 无新增 Tx.type', () => {
  assert.equal(typeof TC.tasksToday, 'function');
  assert.equal(typeof TC.claimTask, 'function');
  assert.deepEqual(TC.TASK_IDS, { SIGNIN: 'signin', INVITE: 'invite', WRITE: 'write' });
  assert.deepEqual(
    TC.TASK_DEFS.map((d) => d.id),
    ['signin', 'invite', 'write'],
  );
  assert.deepEqual(TC.TASK_STATE, { NOT_ACHIEVED: 'not_achieved', CLAIMABLE: 'claimable', CLAIMED: 'claimed' });
  assert.deepEqual(TC.TASK_STATE_TEXT, { not_achieved: '未达标', claimable: '可领取', claimed: '已领取' });
  // R-5 奖励口径逐字
  assert.deepEqual(TC.DAILY_TASK_REWARD, {
    base: { seed_fragments: 1, bamboo_pieces: 1 },
    pool: { seed_fragments: 1, scroll_fragments: 1 },
  });
  // 写操作枚举 = 既有 Tx.type（白名单内），且**不新增枚举**
  assert.deepEqual(TC.WRITE_TX_TYPES, ['edit_fee', 'delete_fee', 'move_fee', 'tree_create']);
  for (const t of TC.WRITE_TX_TYPES) assert.ok(L.TX_TYPES.includes(t), `写操作判据 ${t} 必须是既有白名单枚举`);
  // 源码判据：不得对白名单做运行期写入（第二套真源）；不得自造定时器 / 零点依赖
  assert.equal(/TX_TYPES\s*\.\s*(push|unshift|splice)\s*\(/.test(TC_SRC), false, '不得运行期改写 TX_TYPES');
  assert.equal(/\bsetInterval\s*\(|\bsetTimeout\s*\(|node-cron|new\s+CronJob/.test(TC_SRC), false, '不得注册定时任务');
  assert.ok(TC_SRC.includes('beijingDate'), '每日重置必须走北京时间自然日');
  // 池分发唯一入口：必须引用 friend-ops 的 distributeFriendRewards
  assert.ok(/from '\.\/friend-ops\.js'/.test(TC_SRC) && TC_SRC.includes('distributeFriendRewards'), '池分发必须调 friend-ops');
});

// ══ ② 达标判定（纯函数） ═══════════════════════════════════════════════════════
test('② 达标判定：签到 / 邀请（ref.kind=invite）/ 写操作（成功写流水；失败·no-op 无流水不计）', () => {
  const now = new Date('2026-09-25T04:00:00.000Z'); // 北京 2026-09-25 12:00
  const yest = new Date('2026-09-24T04:00:00.000Z');

  // 签到：日期串比对（北京自然日）
  const u1 = blankUser();
  assert.equal(TC.achievedToday(u1, 'signin', now), false);
  assert.equal(TC.achievedToday(u1, 'signin', yest), false, '空 signin_date 任何日子都未达标');
  u1.signin_date = '2026-09-25';
  assert.equal(TC.achievedToday(u1, 'signin', now), true);
  assert.equal(TC.achievedToday(u1, 'signin', yest), false, '昨日已签到 ⇒ 今日未达标');

  // 邀请：当日一条 reward + ref.kind='invite'
  const u2 = blankUser();
  assert.equal(TC.achievedToday(u2, 'invite', now), false);
  u2.txs.push({ id: 'tx_1', ts: now.toISOString(), type: 'reward', delta: { fragments: 9 }, ref: { kind: 'invite', invitee: '16610000002' } });
  assert.equal(TC.achievedToday(u2, 'invite', now), true, '当日成功邀请 ⇒ 达标');
  assert.equal(TC.achievedToday(u2, 'invite', yest), false, '昨日邀请 ⇒ 今日未达标（每日重置）');
  assert.equal(TC.achievedToday(blankUser(), 'invite', now), false, '无邀请 ⇒ 未达标');
  // 混淆项：同类型但非邀请归因 / 非 reward 类型
  const u3 = blankUser();
  u3.txs.push({ id: 'tx_2', ts: now.toISOString(), type: 'reward', delta: { fragments: 1 }, ref: { source: 'friend_reward', scope: 'base' } });
  u3.txs.push({ id: 'tx_3', ts: now.toISOString(), type: 'signin', delta: {}, ref: { kind: 'invite' } });
  assert.equal(TC.achievedToday(u3, 'invite', now), false, '没有 ref.kind=invite 的 reward ⇒ 不计');

  // 写操作：当日成功写流水
  const u4 = blankUser();
  assert.equal(TC.achievedToday(u4, 'write', now), false);
  for (const t of TC.WRITE_TX_TYPES) {
    const u = blankUser();
    u.txs.push({ id: `tx_${t}`, ts: now.toISOString(), type: t, delta: { bamboos: -1 }, ref: { op: 'person_update' } });
    assert.equal(TC.achievedToday(u, 'write', now), true, `${t} ⇒ 成功写 ⇒ 达标`);
    assert.equal(TC.achievedToday(u, 'write', yest), false, `${t} 昨日 ⇒ 今日未达标`);
  }
  assert.equal(TC.countWritesToday(u4, now), 0);
  // 失败 / 被拒 / no-op 都**没有流水** ⇒ 天然不计（反向：非写类型流水不计）
  const u5 = blankUser();
  for (const t of ['fee_refund', 'reward', 'signin', 'expire', 'market_list', 'spirit_charge']) {
    u5.txs.push({ id: `tx_${t}`, ts: now.toISOString(), type: t, delta: {}, ref: {} });
  }
  assert.equal(TC.achievedToday(u5, 'write', now), false, '非写操作类型（含冲正 / 奖励 / 市集 / 灵气）不计入写操作达标');
  assert.equal(TC.countWritesToday(u5, now), 0);
});

// ══ ③ 三态投影（纯函数） ═══════════════════════════════════════════════════════
test('③ 三态投影：未达标 / 可领取 / 已领取 + 中文文案（不得静默失败）', () => {
  const now = new Date('2026-09-25T04:00:00.000Z');
  const day = cnDay(now);
  const v = (u) => TC.taskViewsOf(u, now);
  const byId = (u, id) => v(u).find((x) => x.task === id);

  // 干净用户：签到「可领取」（签到即领奖，无需外部事件）；邀请 / 写操作「未达标」
  const fresh = v(blankUser());
  assert.deepEqual(
    fresh.map((x) => x.state),
    ['claimable', 'not_achieved', 'not_achieved'],
    '干净用户三态：签到可领取 / 邀请未达标 / 写操作未达标',
  );
  assert.deepEqual(
    fresh.map((x) => x.state_text),
    ['可领取', '未达标', '未达标'],
  );
  assert.equal(fresh[0].day, day);
  assert.equal(fresh[0].achieved, false, '未签到时达标读数 = false（逐字口径）');
  assert.equal(fresh[0].claimable, true, '当日未签到 ⇒ 可领取（调用即完成签到 + 领奖）');
  assert.ok(fresh[1].blocked_reason.includes('未达标'), '未达标必须给中文文案');
  assert.equal(fresh[2].blocked_reason.includes('未'), true);

  // 达标后 ⇒ 可领取；领取后 ⇒ 已领取
  const u = blankUser();
  u.txs.push({ id: 'tx_w', ts: now.toISOString(), type: 'edit_fee', delta: { bamboos: -1 }, ref: {} });
  assert.equal(byId(u, 'write').state, 'claimable');
  assert.equal(byId(u, 'write').achieved, true);
  assert.equal(byId(u, 'write').blocked_reason, '');
  u[TC.CLAIMS_FIELD] = { write: day };
  assert.equal(byId(u, 'write').state, 'claimed');
  assert.equal(byId(u, 'write').claimed_day, day);

  // 幂等判定与日切：昨日标记（signin 走同一 signin_date）⇒ 今日仍可领
  const u2 = blankUser();
  u2[TC.CLAIMS_FIELD] = { invite: '2000-01-01' };
  assert.equal(TC.claimedToday(u2, 'invite', now), false, '昨日标记 ⇒ 今日未领（北京自然日比对）');
  u2[TC.CLAIMS_FIELD] = { invite: day };
  assert.equal(TC.claimedToday(u2, 'invite', now), true);
  const u3 = blankUser();
  u3.signin_date = day;
  assert.equal(TC.claimedToday(u3, 'signin', now), true, '签到任务的已领判定 = 共用 signin_date');
  assert.equal(TC.claimedDayOf(u3, 'signin'), day);
});

// ══ ④ 手动领取（T-4）：达标不发奖，领取才发奖 ══════════════════════════════════
test('④ T-4：达标本身不发奖（GET /tasks/today 零写入）；未达标领取 ⇒ 409 中文；领取 ⇒ 本人基础 + 池', async () => {
  const me = U.main;
  const day = cnDay(new Date());
  // 当日已达标（一条成功写流水）
  await mkTx(me, { type: 'edit_fee', delta: { bamboos: -1 }, ref: { op: 'person_update' }, desc: '测试：一次成功写' }, new Date());
  const before = await assetsOf(me);

  const view = await call('/tasks/today', 'GET', bearer(me));
  assert.equal(view.statusCode, 200);
  const vBody = json(view);
  assert.equal(vBody.ok, true);
  assert.equal(vBody.data.day, day);
  assert.deepEqual(
    vBody.data.tasks.map((t) => `${t.task}:${t.state}`),
    ['signin:claimable', 'invite:not_achieved', 'write:claimable'],
  );
  assert.deepEqual(await assetsOf(me), before, 'GET /tasks/today 必须零写入（达标不发奖）');

  // 未达标任务领取 ⇒ 409 + 中文文案
  const nope = await call('/tasks/claim', 'POST', bearer(me), { task: 'invite' });
  assert.equal(nope.statusCode, 409);
  const nopeBody = json(nope);
  assert.equal(nopeBody.ok, false);
  assert.equal(nopeBody.error.code, 'TASK_NOT_ACHIEVED');
  assert.ok(nopeBody.error.message.includes('尚未达标'), `中文文案：${nopeBody.error.message}`);
  assert.deepEqual(await assetsOf(me), before, '被拒领取零写入');

  // 未知任务 ⇒ 400 + 中文文案
  const unknown = await call('/tasks/claim', 'POST', bearer(me), { task: 'bogus' });
  assert.equal(unknown.statusCode, 400);
  assert.equal(json(unknown).error.code, 'TASK_UNKNOWN');
  assert.ok(json(unknown).error.message.includes('未知任务'));

  // 未登录 ⇒ 401（两条路由都不降级 guest）
  assert.equal((await call('/tasks/today', 'GET', {})).statusCode, 401);
  assert.equal((await call('/tasks/claim', 'POST', {}, { task: 'write' })).statusCode, 401);

  // 领取「平台写操作」：本人基础 = 石榴籽碎片 1 + 竹片 1；分母 0 ⇒ 不建池零流水
  const frags0 = await fragmentsOf(me);
  const bamboo0 = await bamboosOf(me);
  const claim = await call('/tasks/claim', 'POST', bearer(me), { task: 'write' });
  assert.equal(claim.statusCode, 200, claim.body);
  const cBody = json(claim);
  assert.equal(cBody.ok, true);
  assert.equal(cBody.data.state, 'claimed');
  assert.equal(cBody.data.state_text, '已领取');
  assert.equal(cBody.data.reward.pooled, false, '分母 0 ⇒ 不建池');
  assert.equal(cBody.data.reward.denominator, 0);
  assert.deepEqual(cBody.data.reward.distributed, []);
  // 读回资产：碎片 +1、竹片 +1
  assert.equal(await fragmentsOf(me), frags0 + 1, '本人基础：石榴籽碎片 +1');
  assert.equal(await bamboosOf(me), bamboo0 + 1, '本人基础：竹片 +1');
  // 读回流水：一条 base reward（既有枚举）+ 无任何池流水
  const txs = await txsOf(me);
  const base = txs.filter((t) => t.ref?.scope === 'base');
  assert.equal(base.length, 1);
  assert.equal(base[0].type, 'reward', '个人基础奖励走既有枚举 reward');
  assert.equal(base[0].ref.source, 'friend_reward', '分发来源 = friend-ops 的 SOURCE_FRIEND_REWARD');
  assert.equal(txs.filter((t) => t.ref?.scope === 'pool').length, 0, '分母 0 ⇒ 零池流水');
  // 领取后三态
  const after = json(await call('/tasks/today', 'GET', bearer(me)));
  assert.equal(after.data.tasks.find((t) => t.task === 'write').state, 'claimed');
});

// ══ ⑤ 幂等：同一自然日 (用户, 任务) 只可领一次 ═════════════════════════════════
test('⑤ 幂等：同日重复领取 ⇒ 409 TASK_ALREADY_CLAIMED 且零写入；跨日可再领', async () => {
  const me = U.friendA; // 独立手机号，避免与其它用例互相干扰
  const now = new Date();
  await activeRelation(me, U.friendB, now);
  await mkTx(me, { type: 'delete_fee', delta: { bamboos: -3 }, ref: { op: 'delete_node' } }, now);

  const first = json(await call('/tasks/claim', 'POST', bearer(me), { task: 'write' }));
  assert.equal(first.ok, true, JSON.stringify(first));
  const snapF = await fragmentsOf(me);
  const snapB = await bamboosOf(me);
  const snapTxs = (await txsOf(me)).length;

  const second = await call('/tasks/claim', 'POST', bearer(me), { task: 'write' });
  assert.equal(second.statusCode, 409);
  assert.equal(json(second).error.code, 'TASK_ALREADY_CLAIMED');
  assert.ok(json(second).error.message.includes('已领取'));
  assert.equal(await fragmentsOf(me), snapF, '重复领取不得二次发奖（碎片）');
  assert.equal(await bamboosOf(me), snapB, '重复领取不得二次发奖（竹片）');
  assert.equal((await txsOf(me)).length, snapTxs, '重复领取零流水');

  // 跨日（+1 天）⇒ 标记失效，可再领一次（北京自然日串比对；不依赖零点整定时任务）
  const tomorrow = new Date(now.getTime() + DAY);
  await mkTx(me, { type: 'edit_fee', delta: { bamboos: -1 }, ref: { op: 'person_update' } }, tomorrow); // 次日再有一次成功写
  const cross = await TC.claimTask(me, 'write', tomorrow);
  assert.equal(cross.state, 'claimed');
  assert.equal(cross.day, cnDay(tomorrow));
  assert.equal(await fragmentsOf(me), snapF + 1, '跨日再领 ⇒ 基础奖励再 +1 碎片');
});

// ══ ⑥ 签到合并改动面：卡与任务共用同一 signin_date，绝不双发 ══════════════════
test('⑥ 签到卡片与签到任务共用同一 signin_date：卡先领 ⇒ 任务 409 已领；任务先领 ⇒ 卡 409「今日已签到」', async () => {
  // 6-1 卡先领：既有出参形状逐字保留 + 任务侧即视为已领
  const p1 = U.friendB;
  await seed(p1, { fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' });
  const card = await call('/assets/signin', 'POST', bearer(p1));
  assert.equal(card.statusCode, 200);
  const cb = json(card);
  assert.equal(cb.ok, true, '既有 ok 字段');
  assert.equal(cb.fragments, 1, '既有 fragments 字段（碎片 +1）');
  assert.equal(cb.synthesized, 0);
  assert.equal(cb.seed_lot, null);
  assert.equal(cb.signin_date, cnDay(new Date()));
  const t1 = json(await call('/tasks/today', 'GET', bearer(p1)));
  const signin1 = t1.data.tasks.find((t) => t.task === 'signin');
  assert.equal(signin1.state, 'claimed', '卡先领 ⇒ 签到任务即视为已领');
  assert.equal(signin1.claimed, true);
  // 任务侧再领 ⇒ 409（绝不双发）
  const dup = await call('/tasks/claim', 'POST', bearer(p1), { task: 'signin' });
  assert.equal(dup.statusCode, 409);
  assert.equal(json(dup).error.code, 'TASK_ALREADY_CLAIMED');
  assert.equal(await fragmentsOf(p1), 1, '签到碎片只 +1（绝不双发）');
  assert.equal(await bamboosOf(p1), 1, '竹片只 +1（绝不双发）');
  const cardAgain = await call('/assets/signin', 'POST', bearer(p1));
  assert.equal(cardAgain.statusCode, 409);
  assert.deepEqual(json(cardAgain), { error: '今日已签到' }, '同日重复：既有文案与形状逐字保留');

  // 6-2 任务先领 ⇒ 卡 409「今日已签到」（共用同一 signin_date）
  const p2 = U.pending;
  await seed(p2, { fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' });
  const claimed = await call('/tasks/claim', 'POST', bearer(p2), { task: 'signin' });
  assert.equal(claimed.statusCode, 200, claimed.body);
  assert.equal(json(claimed).data.signin_date, cnDay(new Date()), '领取签到任务即写入共用 signin_date');
  assert.equal(await fragmentsOf(p2), 1);
  assert.equal(await bamboosOf(p2), 1);
  const cardAfter = await call('/assets/signin', 'POST', bearer(p2));
  assert.equal(cardAfter.statusCode, 409);
  assert.deepEqual(json(cardAfter), { error: '今日已签到' }, '任务先领 ⇒ 卡即视为已领（共用 signin_date）');
  // 审计：既有枚举 signin 仍留痕（delta 全 0，不构成第二套数值）
  const txs = await txsOf(p2);
  const sg = txs.filter((t) => t.type === 'signin');
  assert.equal(sg.length, 1, '签到事件在账本内留痕（既有枚举 signin）');
  assert.deepEqual(sg[0].delta, {}, '审计条 delta 全 0（奖励统一由 reward 流水体现）');
  const reward = txs.filter((t) => t.type === 'reward');
  assert.equal(reward.length, 1, '奖励走既有枚举 reward（签到卡不再独立发奖）');
  assert.deepEqual(reward[0].delta, { fragments: 1, bamboos: 1, scroll_fragments: 0 });
  // 源码判据：签到路由已改为调用任务中心同一入口（不得两套数值并存）
  assert.ok(INDEX_SRC.includes("tc.claimTask(u.phone, 'signin', new Date())"), 'index.js 签到卡必须调用任务中心同一入口');
  const signinHandler = INDEX_SRC.slice(INDEX_SRC.indexOf("pathname === '/assets/signin'"), INDEX_SRC.indexOf("pathname === '/spirit'"));
  assert.equal(/addFragments\s*\(/.test(signinHandler), false, '签到卡不得再自写发奖（addFragments 已迁走）');
  assert.equal(/recordTx\s*\(/.test(signinHandler), false, '签到卡不得再自写流水');
});

// ══ ⑦ 奖励池：领取时刻快照 + 均分/向下取整/余数销毁 + 触发者不入池 + 不再触发 ══
test('⑦ 池分发：按领取时刻生效好友数均分（floor + 余数销毁）、分母 0 不建池、触发者不入池、好友所得不再触发', async () => {
  const now = new Date();
  const me = U.twoScrolls;

  // 7-1 无好友（分母 0）：只发本人基础、零池流水
  await mkTx(me, { type: 'move_fee', delta: { bamboos: -3 }, ref: { op: 'reparent_cross_tree' } }, now);
  const r0 = await TC.claimTask(me, 'write', now);
  assert.equal(r0.reward.pooled, false);
  assert.equal(r0.reward.denominator, 0);
  assert.equal((await txsOf(me)).filter((t) => t.ref?.scope === 'pool').length, 0, '分母 0 ⇒ 零池流水');

  // 7-2 两个生效好友 + 一个待邀请：分母只算生效关系（=2）⇒ pool 1 碎片 / 1 兰帖残页 ⇒ 每人 0（余数销毁）
  const other = U.expired;
  await activeRelation(other, U.friendA, now);
  await activeRelation(other, U.friendB, now);
  await pendingRelation(other, U.main, now); // 待邀请 ⇒ 不计入分母
  await mkTx(other, { type: 'edit_fee', delta: { bamboos: -1 }, ref: { op: 'person_update' } }, now);
  const fA0 = await fragmentsOf(U.friendA);
  const r2 = await TC.claimTask(other, 'write', now);
  assert.equal(r2.reward.denominator, 2, '分母 = 领取时刻生效中好友数（待邀请不计）');
  assert.deepEqual(r2.reward.pool_per_friend, { seed_fragments: 0, bamboo_pieces: 0, scroll_fragments: 0 }, 'floor(1/2) = 0');
  assert.deepEqual(r2.reward.remainder, { seed_fragments: 1, bamboo_pieces: 0, scroll_fragments: 1 }, '余数销毁（1 碎片 + 1 兰帖残页）');
  assert.equal(await fragmentsOf(U.friendA), fA0, '每人 0 ⇒ 好友账上零变化（零头也落审计流水，由 friend-ops 保证）');
  assert.equal(await fragmentsOf(other), 1, '触发者本人基础照发（碎片 +1）');
  // 触发者不入池：本人无 pool 流水
  assert.equal((await txsOf(other)).filter((t) => t.ref?.scope === 'pool').length, 0, '触发者不入池');

  // 7-3 一个生效好友：每人 1 碎片 + 1 兰帖残页；好友所得**不再触发**新的池分发
  const solo = U.free;
  await activeRelation(solo, U.friendA, now);
  await mkTx(solo, { type: 'tree_create', delta: { seeds: -1 }, ref: { op: 'tree_create' } }, now);
  // 好友侧基线**就在领取前取**（本文件前序用例亦会给该友好发池奖励，故一律用相对增量断言）
  const peerF0 = await fragmentsOf(U.friendA);
  const peerSF0 = await scrollFragsOf(U.friendA);
  const beforePoolTxs = (await txsOf(U.friendA)).filter((t) => t.ref?.scope === 'pool').length;
  const peerWrites0 = TC.countWritesToday(await assetsOf(U.friendA), now);
  const r1 = await TC.claimTask(solo, 'write', now);
  assert.equal(r1.reward.denominator, 1);
  assert.equal(r1.reward.pooled, true);
  assert.deepEqual(r1.reward.pool_per_friend, { seed_fragments: 1, bamboo_pieces: 0, scroll_fragments: 1 });
  assert.deepEqual(r1.reward.remainder, { seed_fragments: 0, bamboo_pieces: 0, scroll_fragments: 0 });
  assert.equal(r1.reward.distributed.length, 1);
  const peer = r1.reward.distributed[0];
  assert.equal(peer.granted.seed_fragments, 1);
  assert.equal(peer.granted.scroll_fragments, 1);
  assert.ok(peer.relation_token.startsWith('fr_'), '出参只给不透明句柄');
  assert.equal(await fragmentsOf(U.friendA), peerF0 + 1, '好友获得池内 1 碎片');
  assert.equal(await scrollFragsOf(U.friendA), peerSF0 + 1, '好友获得池内 1 兰帖残页（增量恰为 1）');
  const afterPoolTxs = (await txsOf(U.friendA)).filter((t) => t.ref?.scope === 'pool').length;
  assert.equal(afterPoolTxs, beforePoolTxs + 1, '好友仅得一条池流水（**不再触发**下游分发）');
  // 池分发不得让好友端多出「平台写操作」达标（收礼 ≠ 一次成功写）
  assert.equal(
    TC.countWritesToday(await assetsOf(U.friendA), now),
    peerWrites0,
    '池分发不写写操作流水、不得抬升好友的「平台写操作」达标计数',
  );
});

// ══ ⑧ D-1 单元面：lockedScrollPieces 口径 ═════════════════════════════════════
test('⑧ D-1：lockedScrollPieces —— 未锁 0 / 发起续约锁 1 / 超时不算 / 对方发起的锁不计本人', async () => {
  const now = new Date('2026-09-25T04:00:00.000Z');

  // 8-1 无关系 ⇒ 0
  assert.deepEqual(await OPS.lockedScrollPieces(U.main, now), { pieces: 0, locks: [] });

  // 8-2 发起续约（自持 ≥ 1 枚）⇒ 锁 1 片（**只占用、不扣除**：资产片数一字不变）
  const a = U.friendA;
  await seed(a, { fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' });
  const rel = await windowRelation(a, U.main, now);
  const before = await piecesOf(a);
  await giveScrolls(a, 1, now);
  assert.equal(await piecesOf(a), 100);
  const req = await OPS.requestRenewal(rel.token, a, now);
  assert.equal(req.ok, true, JSON.stringify(req.error || {}));
  assert.equal(req.locked.pieces, 1, '锁定 1 枚（F-B：LOCKED_PIECES = 1）');
  assert.equal(await piecesOf(a), 100, '锁定**只占用不扣除**（那 1 枚仍在账上）');
  const lock = await OPS.lockedScrollPieces(a, now);
  assert.equal(lock.pieces, 1);
  assert.equal(lock.locks.length, 1);
  assert.equal(lock.locks[0].pieces, 1);
  assert.equal(lock.locks[0].relation_token, rel.token);
  // 对方（被邀请人）侧：锁不是自己发的 ⇒ 本人可分解额度不受影响
  assert.equal((await OPS.lockedScrollPieces(U.main, now)).pieces, 0, '对方发起的锁不计入本人锁定片数');

  // 8-3 超时（+8 天）⇒ 锁随 pending 解除 ⇒ 不算
  const later = new Date(now.getTime() + 8 * DAY);
  assert.equal((await OPS.lockedScrollPieces(a, later)).pieces, 0, '续约申请超 7 天 ⇒ 锁解除（超时的不算）');
  assert.equal(before, 0);
});

// ══ ⑨ D-1 路由面：分解必须扣掉锁定片数（本单核心反证） ═════════════════════════
test('⑨ D-1：共 100 片 + 锁 1 枚 ⇒ 分解 1 枚被拒（409 SCROLL_LOCKED_INSUFFICIENT）', async () => {
  const now = new Date();
  const a = U.friendB;
  await seed(a, { fragments: 0, scroll_fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' });
  await giveScrolls(a, 1, now); // 100 片
  const rel = await windowRelation(a, U.main, now);
  const req = await OPS.requestRenewal(rel.token, a, now);
  assert.equal(req.ok, true, JSON.stringify(req.error || {}));
  assert.equal(await piecesOf(a), 100, '锁定不动资产');

  const res = await call('/assets/scroll/decompose', 'POST', bearer(a), { count: 1 });
  assert.equal(res.statusCode, 409, res.body);
  const body = json(res);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'SCROLL_LOCKED_INSUFFICIENT');
  assert.ok(body.error.message.includes('续约锁定'), `中文文案：${body.error.message}`);
  assert.equal(body.error.detail.locked_pieces, 1);
  assert.equal(body.error.detail.available_pieces, 99);
  assert.equal(body.error.detail.capacity, 0, 'floor((100 − 1)/100) = 0');
  assert.equal(body.error.detail.total_pieces, 100);
  assert.equal(await piecesOf(a), 100, '被拒：一片不扣、不返还');
  assert.equal(await scrollFragsOf(a), 0, '被拒：零流水（无 scroll_decompose）');
  assert.equal((await txsOf(a)).filter((t) => t.type === 'scroll_decompose').length, 0);
});

test('⑨-2 D-1：共 200 片 + 锁 1 枚 ⇒ 可分解 1 枚（floor(199/100)），分解 2 枚被拒', async () => {
  const now = new Date();
  const a = U.twoScrolls;
  await seed(a, { fragments: 0, scroll_fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' });
  await giveScrolls(a, 2, now); // 200 片
  const rel = await windowRelation(a, U.main, now);
  const req = await OPS.requestRenewal(rel.token, a, now);
  assert.equal(req.ok, true, JSON.stringify(req.error || {}));
  assert.equal((await OPS.lockedScrollPieces(a, now)).pieces, 1);

  // 2 枚 ⇒ 拒（capacity = 1）
  const over = await call('/assets/scroll/decompose', 'POST', bearer(a), { count: 2 });
  assert.equal(over.statusCode, 409, over.body);
  assert.equal(json(over).error.code, 'SCROLL_LOCKED_INSUFFICIENT');
  assert.equal(json(over).error.detail.capacity, 1);
  assert.equal(await piecesOf(a), 200, '被拒：一片不扣');

  // 1 枚 ⇒ 通过（199 片里取 100 片；返还 99 片；锁定 1 枚仍未被分解）
  const okRes = await call('/assets/scroll/decompose', 'POST', bearer(a), { count: 1 });
  assert.equal(okRes.statusCode, 200, okRes.body);
  const okBody = json(okRes);
  assert.equal(okBody.ok, true);
  assert.equal(okBody.data.decomposed, 1);
  assert.equal(okBody.data.locked_pieces, 1, '出参回显锁定读数');
  assert.equal(okBody.data.available_pieces, 199);
  assert.equal(okBody.data.capacity, 1);
  assert.equal(okBody.data.refunded, 99, 'A-7① 运行时读数：1 枚 ⇒ 返还 99 片');
  assert.equal(okBody.data.synthesized, 0, 'A-7① 不得回环：返还 99 片不得当场又合成');
  assert.equal(await piecesOf(a), 100, '扣 100 片后余 100 片（被锁的那 1 枚仍在）');
  assert.equal(await scrollFragsOf(a), 99, '兰帖残页 = 99（一单不拆的损耗 1 片）');
  assert.equal((await txsOf(a)).filter((t) => t.type === 'scroll_decompose').length, 1, '恰好一条分解流水');
});

test('⑨-3 D-1 控制组：未锁定 ⇒ 正常通过（100 片分解 1 枚成功、返还 99 片不回环）', async () => {
  const now = new Date();
  const a = U.expired;
  await seed(a, { fragments: 0, scroll_fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' });
  await giveScrolls(a, 1, now);
  assert.equal((await OPS.lockedScrollPieces(a, now)).pieces, 0, '控制组：无锁定');
  const res = await call('/assets/scroll/decompose', 'POST', bearer(a), { count: 1 });
  assert.equal(res.statusCode, 200, res.body);
  const body = json(res);
  assert.equal(body.data.refunded, 99);
  assert.equal(body.data.synthesized, 0, '不得回环');
  assert.equal(await piecesOf(a), 0, '唯一 1 枚已分解');
  assert.equal(await scrollFragsOf(a), 99);
  assert.equal(body.data.locked_pieces, 0);
});

// ══ ⑫ 幂等（Zang 裁定 · 本单修正） ═══════════════════════════════════════════════
/** 身份类取值归一化（手机号 / 各种 id）⇒ 两场景可逐字段对比；**金额字段一字不改** */
function normalizeUser(u, phones) {
  const repl = (v) => {
    if (Array.isArray(v)) return v.map(repl);
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = /(^|_)id$/.test(k) ? '<id>' : repl(val);
      return out;
    }
    if (typeof v === 'string') {
      let s = v;
      for (const p of phones) s = s.split(p).join('<phone>');
      // 脱敏串（maskPhone 形状：137****1234 / 1****）同样归一化（身份类，非金额）
      return s.replace(/\d{3}\*{4}\d{4}|\d\*{4}/g, '<phone>');
    }
    return v;
  };
  return repl(u);
}

test('⑫ 幂等（Zang 裁定）：池分发中途失败 ⇒ 本人零写入 / 无悬空打标；重试后与「一次成功」逐字段一致', async () => {
  const now = new Date('2026-10-01T04:00:00.000Z'); // 固定时刻 ⇒ 两场景可逐字段对比
  const day = cnDay(now);

  // 场景 A（对照）：一次成功（1 个生效好友 ⇒ 池每人 1 碎片 + 1 兰帖残页）
  const A = '16610000021';
  const Af = '16610000022';
  await activeRelation(A, Af, now);
  await mkTx(A, { type: 'edit_fee', delta: { bamboos: -1 }, ref: { op: 'person_update' } }, now);
  const aRes = await TC.claimTask(A, 'write', now);
  assert.equal(aRes.state, 'claimed');
  assert.equal(aRes.reward.denominator, 1);
  assert.equal(aRes.reward.base.seed_fragments, 1, 'R-5 基础奖励口径回显');
  const aMe = await assetsOf(A);
  assert.equal(aMe.fragments, 1, '（对照）基础奖励入账');
  assert.equal(aMe.txs.filter((t) => t.ref?.scope === 'base').length, 1, '（对照）基础奖励流水恰一条');

  // 场景 B（重试）：池分发**中途失败**（第 1 个收件人已入账后抛错）
  const B = '16610000031';
  const Bf1 = '16610000032';
  const Bf2 = '16610000033';
  await activeRelation(B, Bf1, now);
  await activeRelation(B, Bf2, now);
  await mkTx(B, { type: 'edit_fee', delta: { bamboos: -1 }, ref: { op: 'person_update' } }, now);
  const bBefore = await assetsOf(B);
  let threw = null;
  OPS.TEST_ONLY_HOOK.beforeRewardGrant = async (phone, info) => {
    if (info.index === 1) throw new Error('注入：池分发中途失败');
  };
  try {
    await TC.claimTask(B, 'write', now);
  } catch (e) {
    threw = e;
  } finally {
    OPS.TEST_ONLY_HOOK.beforeRewardGrant = null;
  }
  assert.ok(threw, '池分发失败必须结构化抛出（不静默）');
  assert.equal(threw.code, 'TASK_REWARD_FAILED');
  assert.equal(threw.status, 409);
  assert.equal(threw.detail.stage, 'pool');
  // ① 本人**零写入**：资产逐字段一字不变（无基础奖励、无流水、**无打标** ⇒ 无悬空标记、天然可重试）
  assert.deepEqual(await assetsOf(B), bBefore, '池分发失败 ⇒ 本人资产逐字段零变化');
  assert.equal((await assetsOf(B))[TC.CLAIMS_FIELD], undefined, '不得留下悬空打标');
  // ② 失败点之前已入账的收件人保留其（带幂等键的）流水；其后零入账
  assert.equal((await txsOf(Bf1)).filter((t) => t.ref?.scope === 'pool').length, 1, '失败点之前已入账');
  assert.equal((await txsOf(Bf2)).filter((t) => t.ref?.scope === 'pool').length, 0, '失败点之后零入账');
  const f1BeforeRetry = await assetsOf(Bf1);

  // ③ 重试（注入已撤）⇒ 与「一次成功」逐字段一致（不得多出 碎片 1 / 竹片 1 / 重复流水）
  const retry = await TC.claimTask(B, 'write', now);
  assert.equal(retry.state, 'claimed');
  const bMe = await assetsOf(B);
  assert.deepEqual(
    normalizeUser(bMe, [B, Bf1, Bf2]),
    normalizeUser(aMe, [A, Af]),
    '重试后本人资产与「一次成功」**逐字段一致**（金额类一字不差：不得多出 碎片 1 / 竹片 1）',
  );
  assert.equal(bMe.fragments, 1, '碎片净额 = 1（绝无重复入账）');
  assert.equal(L.sumLots(bMe.bamboos), 1, '竹片净额 = 1（绝无重复入账）');
  assert.equal(bMe.txs.filter((t) => t.ref?.scope === 'base').length, 1, '基础奖励流水恰一条');
  assert.equal(bMe.txs.filter((t) => t.type === 'fee_refund').length, 0, '零冲正（窗口已不存在，无需补偿）');
  assert.equal(bMe.txs.length, aMe.txs.length, '流水条数与「一次成功」一致（无重复入账 / 无多余补偿条）');
  assert.deepEqual(bMe[TC.CLAIMS_FIELD], { write: day }, '打标恰为当日一次');
  // ④ 失败前已入账的收件人**不被二次入账**（幂等键去重）；另一位重试后恰入账一次
  const f1 = await assetsOf(Bf1);
  assert.equal(f1.txs.filter((t) => t.ref?.scope === 'pool').length, 1, '重试对已入账收件人**跳过**（幂等键）');
  assert.deepEqual(f1, f1BeforeRetry, '重试不得改动已入账收件人的任何字段');
  assert.equal((await txsOf(Bf2)).filter((t) => t.ref?.scope === 'pool').length, 1, '未入账收件人重试后恰入账一次');
  assert.equal(retry.reward.denominator, 2);
  assert.equal(retry.reward.distributed.filter((d) => d.replayed).length, 1, '出参如实标注本次跳过（replayed）');
  // ⑤ 流水类型仍在既有白名单内（幂等键只是 ref 上的一个字段，**不新增 Tx.type**）
  for (const t of bMe.txs) assert.ok(L.TX_TYPES.includes(t.type), `非法流水类型 ${t.type}`);
});

// ══ ⑬ TOCTOU（本单修正）：锁定读 / 落锁 / 兰帖扣减共用同一资产事务 ═══════════════
test('⑬ TOCTOU：锁定读与兰帖扣减同锁（持锁期间读不得返回）；续约「判定 + 落锁」在同一事务内', async () => {
  const now = new Date('2026-11-01T04:00:00.000Z');
  const me = '16610000051';
  const peer = '16610000052';
  const blank = { fragments: 0, scroll_fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' };
  await seed(me, blank);
  await seed(peer, blank);
  await giveScrolls(me, 1, now); // 100 片 = 1 枚
  const relDocSync = (id) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(TMP, 'collections', 'jiazu_friends.json'), 'utf8'))[id] || null;
    } catch {
      return null;
    }
  };
  const waitFor = async (cond, ms = 2000) => {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > ms) return false;
      await new Promise((r) => setTimeout(r, 5));
    }
    return true;
  };

  // ① 锁定读必须在**同手机号的资产事务**队列里排队（持锁期间不得返回）——同一把锁 / 同一事务域
  const order = [];
  let release1;
  const gate1 = new Promise((r) => (release1 = r));
  const hold = L.withAssets(me, async () => {
    order.push('lock-enter');
    await gate1;
    order.push('lock-exit');
  });
  assert.ok(await waitFor(() => order.includes('lock-enter')), '占位事务必须已进入临界区');
  const read = OPS.lockedScrollPieces(me, now).then((r) => {
    order.push('read-done');
    return r;
  });
  await new Promise((r) => setTimeout(r, 30)); // 给锁定读「插队」的机会
  assert.deepEqual(order, ['lock-enter'], '持锁期间锁定读不得返回（同一把锁 ⇒ 必须排队，不得旁路直读）');
  release1();
  await hold;
  assert.deepEqual(await read, { pieces: 0, locks: [] });
  assert.deepEqual(order, ['lock-enter', 'lock-exit', 'read-done'], '锁定读与兰帖扣减同一串行队列');
  assert.equal(await piecesOf(me), 100, '锁定读语义零写入（片数不变）');

  // ② 续约「自持校验 + 落锁」必须在**同一资产事务**内：持锁期间不得出现「锁外落锁」
  const rel = await windowRelation(me, peer, now);
  let release2;
  const gate2 = new Promise((r) => (release2 = r));
  const entered = { hold: false };
  const hold2 = L.withAssets(me, async () => {
    entered.hold = true;
    await gate2;
  });
  assert.ok(await waitFor(() => entered.hold), '占位事务已进入临界区');
  const req = OPS.requestRenewal(rel.token, me, now); // 排在持锁事务之后
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(relDocSync(rel.id)?.pending ?? null, null, '持锁期间：续约不得在资产事务之外落锁（判定与落锁同事务）');
  release2();
  const reqRes = await req;
  assert.equal(reqRes.ok, true, JSON.stringify(reqRes.error || {}));
  assert.equal(reqRes.locked.pieces, 1);
  assert.equal(relDocSync(rel.id).pending.kind, 'renew', '释放后落锁（同一事务内完成）');
  assert.equal(await piecesOf(me), 100, '锁定只占用不扣除（片数仍 100）');
  assert.equal((await OPS.lockedScrollPieces(me, now)).pieces, 1, '落锁后锁定读 = 1');

  // ③ 源码判据：关系侧落锁必须写在 `withAssets` 事务内（不得在事务外再落一次锁）
  const OPS_SRC = fs.readFileSync(path.join(HERE, 'friend-ops.js'), 'utf8');
  const reqBody = OPS_SRC.slice(OPS_SRC.indexOf('export async function requestRenewal'), OPS_SRC.indexOf('export async function confirmRenewal'));
  const tx0 = reqBody.indexOf('await withAssets(');
  const lock0 = reqBody.indexOf('await renewRequest(');
  assert.ok(tx0 > -1 && lock0 > tx0, 'requestRenewal：关系侧落锁必须写在 withAssets 事务内（在 withAssets 之后）');
  const lockReadBody = OPS_SRC.slice(OPS_SRC.indexOf('export async function lockedScrollPieces'), OPS_SRC.indexOf('export async function sweepFriends'));
  assert.ok(lockReadBody.includes('withAssets(me,'), 'lockedScrollPieces：锁定读必须在资产事务内（同一把锁）');
});

// ══ ⑩ 注册数 / ⑪ 真源零写入 ════════════════════════════════════════════════════
test('⑩ 注册数 34 = 磁盘 *.test.js 数；「已注册但磁盘缺失」0 条；磁盘未注册 0 条', () => {
  const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
  const registered = (pkg.scripts.test.match(/[\w./-]+\.test\.js/g) || []).map((p) => p.replace(/^.*lib\//, ''));
  const onDisk = fs.readdirSync(HERE).filter((f) => f.endsWith('.test.js'));
  assert.equal(registered.length, 34, `注册数应为 34，实得 ${registered.length}`);
  assert.equal(onDisk.length, registered.length, `磁盘 *.test.js 数 ${onDisk.length} 应等于注册数 ${registered.length}`);
  assert.equal(new Set(registered).size, registered.length, '注册项不得重复');
  const missing = registered.filter((f) => !fs.existsSync(path.join(HERE, f)));
  assert.deepEqual(missing, [], '「已注册但磁盘缺失」必须 0 条');
  const unregistered = onDisk.filter((f) => !registered.includes(f));
  assert.deepEqual(unregistered, [], '磁盘未注册必须 0 条');
  assert.ok(registered.includes('task-center.test.js'), '本单新增测试必须已注册');
});

test('⑪ 真源零写入：config/ + migrate-output/ 全量指纹与本文件开工时逐字节一致', () => {
  const after = realSourceFingerprint();
  assert.equal(after.count, REAL_FP_BEFORE.count, '真源文件数不得变化');
  assert.equal(after.digest, REAL_FP_BEFORE.digest, '真源全量 md5 指纹不得变化');
  assert.equal(process.env.COMPAT_OUT_DIR, TMP, '本文件必须把数据根指向 /tmp 副本');
});
