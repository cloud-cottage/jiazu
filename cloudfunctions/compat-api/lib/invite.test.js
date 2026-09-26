/**
 * 邀请链路单测 —— lib/invite.js + 注册分支 invite_code + 两条邀请路由
 * 口径：Zang 裁定 v3（2026-09-25）I-1…I-9（逐条见 lib/invite.js 头部）
 *
 * 覆盖：
 *  ① 常量与错误码字面（集合名 / 奖励 9 + 11 / 日限 3 / 四个错误码）
 *  ② 校验链顺序：缺省空 → none；格式 → INVITE_CODE_FORMAT；自邀 → FRIEND_SELF_INVITE；
 *     未注册邀请人 → INVITE_CODE_UNKNOWN；已有记录 → already（**静默**，不报错）
 *  ③ I-4 发奖：**邀请人**得 9 石榴籽碎片 + 11 兰帖残页（`type='reward'`、`ref.kind='invite'`）；
 *     **被邀请人零入账**（无资产文档）
 *  ④ I-5 日限：北京自然日 3 次上限，**第 4 次静默不发放**（无新流水、资产不变、注册不受影响），
 *     且邀请记录照写 `rewarded:false`
 *  ⑤ I-5 防刷：同一被邀请人二次 `applyInvite` → `already_invited`，不重发奖
 *  ⑥ I-7 兰帖依赖逐字断言（真源导出名 + 取值）
 *  ⑦ 路由：`GET /invite/me` 未登录 401 / 登录 200 且字段齐；`POST /invite/accept` 校验 + 发奖 + 幂等；
 *     `POST /auth/register` 带 / 不带 `invite_code` 的全链路（含 400 三态）
 *  ⑧ 真源零写入：`migrate-output/` 与 `config/tree-meta.json` md5 逐字节未变
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向副本（`os.tmpdir()` 下 mkdtemp），
 * 文末 md5 断言真实真源未变（照 assets.test.js / meta-guard.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/invite.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-invite-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaMd5 = fs.existsSync(REAL_META) ? md5(REAL_META) : null;
const realTreeBaseline = new Map(fs.existsSync(REAL_TREES) ? fs.readdirSync(REAL_TREES).map((f) => [f, md5(path.join(REAL_TREES, f))]) : []);
const realColBaseline = new Map(
  fs.existsSync(REAL_COLLECTIONS) ? fs.readdirSync(REAL_COLLECTIONS).map((f) => [f, md5(path.join(REAL_COLLECTIONS, f))]) : [],
);

// ---- 种子：邀请人们 + 若干已注册手机号（被邀请人刻意**不**预置，供注册路径用例） ----
const INVITER_A = '16600009901'; // 基础发奖
const INVITER_B = '16600009902'; // 日限
const INVITER_C = '16600009903'; // /invite/accept
const INVITER_D = '16600009904'; // 注册路径
const INVITEES_B = ['16600009921', '16600009922', '16600009923', '16600009924']; // 4 个 → 触发日限
const INVITEES_A = ['16600009911', '16600009912'];
const INVITEE_C = '16600009931';
const REG_INVITEE = '16600009941';

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify(
    Object.fromEntries(
      [INVITER_A, INVITER_B, INVITER_C, INVITER_D]
        .concat(INVITEES_A, INVITEES_B, [INVITEE_C])
        .map((p) => [p, { _id: p, phone: p, nickname: `邀测${p.slice(-4)}`, role: 'user' }]),
    ),
  ),
);

const inv = await import('./invite.js');
const el = await import('./economy-ledger.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const bearer = (phone) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: 'user' }, 3600)}` });
/** 独立实现的北京时间自然日（不引用被测模块的 beijingDate） */
const beijingToday = (d = new Date()) => new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({ path: p, httpMethod: method, headers, queryStringParameters: query, body: body ? JSON.stringify(body) : undefined });
const jsonOf = (r) => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body);
const getAssets = (phone) => el.getAssets(phone);
const inviteTxs = (user) => (user.txs || []).filter((t) => t.type === 'reward' && t.ref && t.ref.kind === 'invite');

/** 取一枚验证码（local 模式 dev_code 直出） */
async function devCode(phone) {
  const r = await call('/auth/send-code', 'POST', {}, {}, { phone });
  assert.equal(r.statusCode, 200, `send-code 应 200，实际 ${r.statusCode}`);
  const j = jsonOf(r);
  assert.ok(j.dev_code, 'local 模式必须直出 dev_code');
  return j.dev_code;
}

// ===================== ① 常量与错误码字面 =====================

test('① 常量与错误码字面：集合名 / 奖励 9+11 / 日限 3 / 四个错误码', () => {
  assert.equal(inv.INVITES_COL, 'jiazu_invites', '集合名（I-1）');
  assert.equal(inv.USERS_COL, 'jiazu_users');
  assert.equal(inv.INVITE_REWARD_FRAGMENTS, 9, '邀请人得 9 石榴籽碎片（I-4）');
  assert.equal(inv.INVITE_REWARD_SCROLL_FRAGMENTS, 11, '邀请人得 11 兰帖残页（I-4）');
  assert.equal(inv.INVITE_DAILY_LIMIT, 3, '邀请人 3 次/日（I-5）');
  assert.equal(inv.INVITE_TX_TYPE, 'reward', '沿用既有 reward 流水（I-5）');
  assert.equal(inv.INVITE_TX_REF_KIND, 'invite');
  assert.equal(inv.ERR_INVITE_CODE_FORMAT, 'INVITE_CODE_FORMAT');
  assert.equal(inv.ERR_FRIEND_SELF_INVITE, 'FRIEND_SELF_INVITE');
  assert.equal(inv.ERR_INVITE_CODE_UNKNOWN, 'INVITE_CODE_UNKNOWN');
  assert.equal(inv.ERR_INVITE_CODE_REQUIRED, 'INVITE_CODE_REQUIRED');
  assert.equal(inv.inviteDocId('16600000000'), '16600000000', '_id = 被邀请人手机号（I-1）');
  assert.equal(inv.inviteCodeFormatOk('16600000000'), true);
  assert.equal(inv.inviteCodeFormatOk('1660000000'), false);
  assert.equal(inv.inviteCodeFormatOk(''), false);
});

// ===================== ⑥ I-7 兰帖依赖逐字断言 =====================

test('⑥ I-7 兰帖依赖已就绪：真源导出名与取值逐字（不自写第二版）', () => {
  assert.equal(el.SCROLL_FRAGMENT_CAP, 999, '单格容纳上限（展示层口径，非拒绝阈值）');
  assert.equal(el.SCROLL_FRAGMENT_SYNTH_THRESHOLD, 100);
  assert.equal(el.SCROLL_PIECES_PER_SCROLL, 100, '真源导出名 = SCROLL_PIECES_PER_SCROLL（非 SCROLL_PIECES_PER_ITEM）');
  assert.equal(typeof el.addScrollFragments, 'function');
  assert.ok(el.TX_TYPES.includes('scroll_synth') && el.TX_TYPES.includes('scroll_decompose'));
  const u = { fragments: 0, scroll_fragments: 0, seeds: [], bamboos: [], jades: [], scrolls: [], txs: [], signin_date: '' };
  const r = el.addScrollFragments(u, 11, new Date());
  assert.equal(u.scroll_fragments, 11, '11 片不触发合成');
  assert.equal(r.synthesized, 0);
  assert.equal(u.scrolls.length, 0);
});

// ===================== ② 校验链 =====================

test('② 校验链：缺省→none；格式→FORMAT；自邀→FRIEND_SELF_INVITE；未注册→UNKNOWN', async () => {
  const none = await inv.resolveInvite(undefined, INVITEES_A[0]);
  assert.deepEqual({ ok: none.ok, kind: none.kind }, { ok: true, kind: 'none' }, '缺省 = 无邀请（I-3）');
  const empty = await inv.resolveInvite('   ', INVITEES_A[0]);
  assert.equal(empty.kind, 'none', '空串 = 无邀请');

  const bad = await inv.resolveInvite('123', INVITEES_A[0]);
  assert.equal(bad.ok, false);
  assert.equal(bad.status, 400);
  assert.equal(bad.code, 'INVITE_CODE_FORMAT');
  assert.equal(bad.error, '邀请码格式不正确（应为 11 位手机号）');

  const self = await inv.resolveInvite(INVITEES_A[0], INVITEES_A[0]);
  assert.equal(self.ok, false);
  assert.equal(self.status, 400);
  assert.equal(self.code, 'FRIEND_SELF_INVITE');
  assert.equal(self.error, '不能填写自己的邀请码');

  const unknown = await inv.resolveInvite('16600000000', INVITEES_A[0]);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.status, 400);
  assert.equal(unknown.code, 'INVITE_CODE_UNKNOWN');
  assert.equal(unknown.error, '邀请码无效：该手机号尚未注册');

  const ok = await inv.resolveInvite(INVITER_A, INVITEES_A[0]);
  assert.equal(ok.ok, true);
  assert.equal(ok.kind, 'pending');
  assert.equal(ok.inviter_phone, INVITER_A, '邀请码 = 邀请人手机号（I-2）');
});

test('②′ 邀请码格式失败 / 未知邀请人时**不写任何邀请文档**（校验全过才写，I-3）', async () => {
  await inv.applyInvite(INVITEES_A[0], 'abc');
  await inv.applyInvite(INVITEES_A[0], '16600000000');
  const doc = await (await import('./store.js')).colGet('jiazu_invites', INVITEES_A[0]);
  assert.equal(doc, null, '校验失败不得落 jiazu_invites 文档');
});

// ===================== ③ I-4 发奖 =====================

test('③ I-4 发奖：邀请人得 9 石榴籽碎片 + 11 兰帖残页；被邀请人零入账', async () => {
  const before = await getAssets(INVITER_A);
  assert.equal(inviteTxs(before).length, 0);

  const r = await inv.applyInvite(INVITEES_A[0], INVITER_A, { now: new Date() });
  assert.equal(r.ok, true);
  assert.equal(r.applied, true);
  assert.equal(r.reason, 'rewarded');
  assert.equal(r.rewarded, true);
  assert.ok(r.reward_tx_id, '必须回发奖流水 id');

  const after = await getAssets(INVITER_A);
  assert.equal(after.fragments, 9, '石榴籽碎片 = 9');
  assert.equal(after.scroll_fragments, 11, '兰帖残页 = 11');
  assert.equal(after.seeds.length, 0, '9 片不触发碎片自动合成');
  assert.equal(after.scrolls.length, 0, '11 片不合成兰帖（手动合成门槛 100 片；自动合成已取消）');

  const txs = inviteTxs(after);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].type, 'reward');
  assert.deepEqual(txs[0].delta, { fragments: 9, scroll_fragments: 11 }, 'delta 逐字 = 9 / 11');
  assert.equal(txs[0].ref.kind, 'invite');
  assert.equal(txs[0].ref.invitee, INVITEES_A[0]);
  assert.equal(txs[0].operator, INVITER_A);
  assert.equal(beijingToday(new Date(txs[0].ts)), beijingToday(), '流水落在北京自然日今天');

  // 被邀请人不得奖
  const inviteeAssets = await getAssets(INVITEES_A[0]);
  assert.equal(inviteeAssets.fragments, 0, '被邀请人不得奖（I-4）');
  assert.equal(inviteeAssets.scroll_fragments, 0);
  assert.equal(inviteTxs(inviteeAssets).length, 0);

  // I-1 邀请文档形状
  const { colGet } = await import('./store.js');
  const doc = await colGet('jiazu_invites', INVITEES_A[0]);
  assert.equal(doc._id, INVITEES_A[0]);
  assert.equal(doc.inviter_phone, INVITER_A);
  assert.equal(doc.rewarded, true);
  assert.equal(doc.reward_tx_id, txs[0].id);
  assert.ok(typeof doc.created_at === 'string' && doc.created_at, 'created_at 必填');
});

// ===================== ⑤ 防刷：同一被邀请人只奖一次 =====================

test('⑤ 同一被邀请人二次 applyInvite → already_invited，不重发奖、记录不复用', async () => {
  const before = await getAssets(INVITER_A);
  const r = await inv.applyInvite(INVITEES_A[0], INVITER_A, { now: new Date() });
  assert.equal(r.ok, true);
  assert.equal(r.applied, false);
  assert.equal(r.reason, 'already_invited');
  assert.equal(r.rewarded, false);
  assert.equal(r.inviter_phone, INVITER_A, '静默忽略但仍回已记录的邀请人');
  const after = await getAssets(INVITER_A);
  assert.deepEqual(after, before, '资产与流水一字不变');
});

// ===================== ④ I-5 日限 3 次/日 =====================

test('④ 日限：同一邀请人第 1–3 次发放、第 4 次静默不发（记录照写 rewarded:false）', async () => {
  const now = new Date();
  const results = [];
  for (const p of INVITEES_B) results.push(await inv.applyInvite(p, INVITER_B, { now }));
  assert.deepEqual(results.map((r) => r.reason), ['rewarded', 'rewarded', 'rewarded', 'daily_limit'], '第 4 次 = daily_limit');
  assert.deepEqual(results.map((r) => r.rewarded), [true, true, true, false]);

  const user = await getAssets(INVITER_B);
  assert.equal(inviteTxs(user).length, 3, '日限内只发 3 条 reward 流水（不新增顶层计数字段）');
  // 9×3 = 27 石榴籽碎片 → 满 10 合成：2 籽 + 余 7 碎片
  assert.equal(user.fragments, 7, '27 片 → 2 颗籽（20 片）+ 余 7 碎片');
  assert.equal(el.sumLots(user.seeds), 2);
  assert.equal(user.scroll_fragments, 33, '11×3 = 33 兰帖残页（未满 100，不合成）');
  assert.equal(user.scrolls.length, 0);

  const { colGet } = await import('./store.js');
  const doc4 = await colGet('jiazu_invites', INVITEES_B[3]);
  assert.ok(doc4, '超限也要写邀请记录（I-1：记录永不复用、不删除）');
  assert.equal(doc4.rewarded, false, '超限 → rewarded=false');
  assert.equal(doc4.reward_tx_id, undefined, '未发奖 → 无 reward_tx_id');
  assert.equal(doc4.inviter_phone, INVITER_B);

  // 面板读数：今日已邀 = 3、剩余 0
  const stats = await inv.inviteStats(INVITER_B, now);
  assert.equal(stats.invite_code, INVITER_B);
  assert.equal(stats.today_invited, 3);
  assert.equal(stats.total_invited, 4, '已邀总数含未发奖的 1 条');
  assert.equal(stats.remaining_today, 0);

  // 超限静默：再次尝试同一邀请人都不得入账
  const again = await inv.applyInvite(INVITEES_B[3], INVITER_B, { now });
  assert.equal(again.reason, 'already_invited', '同一被邀请人优先命中 already（_id 唯一 + rewarded 双保证）');
  assert.equal(inviteTxs(await getAssets(INVITER_B)).length, 3);
});

// ===================== ⑦ 路由 =====================

test('⑦-a GET /invite/me：未登录 → 401（不降级 guest）；登录 → 200 且字段齐', async () => {
  const anon = await call('/invite/me', 'GET');
  assert.equal(anon.statusCode, 401, '未登录必须 401');
  const j = jsonOf(anon);
  assert.equal(j.error, '未登录或登录已过期');
  assert.equal(j.code, undefined, '401 不带域名码');

  const bad = await call('/invite/me', 'GET', { authorization: 'Bearer not-a-jwt' });
  assert.equal(bad.statusCode, 401, '无效 token 必须 401');
  assert.equal(jsonOf(bad).invite_code, undefined, '不得降级 guest 泄漏任何字段');

  const ok = await call('/invite/me', 'GET', bearer(INVITER_C));
  assert.equal(ok.statusCode, 200);
  const s = jsonOf(ok);
  assert.deepEqual(Object.keys(s).sort(), ['daily_limit', 'invite_code', 'remaining_today', 'today_invited', 'total_invited']);
  assert.equal(s.invite_code, INVITER_C, '邀请码 = 我的手机号（I-2）');
  assert.equal(s.today_invited, 0);
  assert.equal(s.total_invited, 0);
  assert.equal(s.remaining_today, 3);
  assert.equal(s.daily_limit, 3);
});

test('⑦-b POST /invite/accept：未登录 401；缺码 400；校验三态；发奖；幂等不重发', async () => {
  const anon = await call('/invite/accept', 'POST', {}, {}, { invite_code: INVITER_C });
  assert.equal(anon.statusCode, 401, '未登录必须 401');

  const h = bearer(INVITEE_C);
  const miss = await call('/invite/accept', 'POST', h, {}, {});
  assert.equal(miss.statusCode, 400);
  assert.equal(jsonOf(miss).code, 'INVITE_CODE_REQUIRED');
  assert.equal(jsonOf(miss).error, '请填写邀请码');

  const badFmt = await call('/invite/accept', 'POST', h, {}, { invite_code: '123' });
  assert.equal(badFmt.statusCode, 400);
  assert.equal(jsonOf(badFmt).code, 'INVITE_CODE_FORMAT');

  const self = await call('/invite/accept', 'POST', h, {}, { invite_code: INVITEE_C });
  assert.equal(self.statusCode, 400);
  assert.equal(jsonOf(self).code, 'FRIEND_SELF_INVITE');

  const unknown = await call('/invite/accept', 'POST', h, {}, { invite_code: '16600000000' });
  assert.equal(unknown.statusCode, 400);
  assert.equal(jsonOf(unknown).code, 'INVITE_CODE_UNKNOWN');

  const okr = await call('/invite/accept', 'POST', h, {}, { invite_code: INVITER_C });
  assert.equal(okr.statusCode, 200);
  const rj = jsonOf(okr);
  assert.equal(rj.ok, true);
  assert.equal(rj.applied, true);
  assert.equal(rj.reason, 'rewarded');
  assert.equal(rj.rewarded, true);
  assert.equal(rj.inviter_phone, INVITER_C);
  assert.ok(rj.reward_tx_id);

  const inviterAssets = await getAssets(INVITER_C);
  assert.equal(inviterAssets.fragments, 9);
  assert.equal(inviterAssets.scroll_fragments, 11);

  // 幂等：二次 accept → 不重发
  const again = await call('/invite/accept', 'POST', h, {}, { invite_code: INVITER_C });
  assert.equal(again.statusCode, 200);
  const aj = jsonOf(again);
  assert.equal(aj.applied, false);
  assert.equal(aj.reason, 'already_invited');
  assert.equal(aj.rewarded, false);
  assert.equal(inviteTxs(await getAssets(INVITER_C)).length, 1, '同一被邀请人只奖一次');
});

test('⑦-c POST /auth/register 带 invite_code：全链路发奖；不带 → 行为与既有一致', async () => {
  // 不带邀请码：响应形状与既有完全一致，且不落邀请记录、不发奖
  const c1 = await devCode('16600009951');
  const reg1 = await call('/auth/register', 'POST', {}, {}, { phone: '16600009951', code: c1, nickname: '无邀请' });
  assert.equal(reg1.statusCode, 201);
  assert.deepEqual(Object.keys(jsonOf(reg1)).sort(), ['nickname', 'phone', 'role', 'token'], '响应形状一字不改');
  const { colGet } = await import('./store.js');
  assert.equal(await colGet('jiazu_invites', '16600009951'), null, '无邀请码 → 不落文档');

  // 带合法邀请码：注册 201 + 邀请人得 9 + 11
  const before = await getAssets(INVITER_D);
  assert.equal(inviteTxs(before).length, 0);
  const c2 = await devCode(REG_INVITEE);
  const reg2 = await call('/auth/register', 'POST', {}, {}, { phone: REG_INVITEE, code: c2, nickname: '有邀请', invite_code: INVITER_D });
  assert.equal(reg2.statusCode, 201);
  assert.deepEqual(Object.keys(jsonOf(reg2)).sort(), ['nickname', 'phone', 'role', 'token']);
  const after = await getAssets(INVITER_D);
  assert.equal(after.fragments, 9);
  assert.equal(after.scroll_fragments, 11);
  assert.equal(inviteTxs(after).length, 1);
  const doc = await colGet('jiazu_invites', REG_INVITEE);
  assert.equal(doc.inviter_phone, INVITER_D);
  assert.equal(doc.rewarded, true);

  // 校验不过 → 400 且**不建号**（建用户前先校验）
  const selfPhone = '16600009952';
  const c3 = await devCode(selfPhone);
  const regSelf = await call('/auth/register', 'POST', {}, {}, { phone: selfPhone, code: c3, invite_code: selfPhone });
  assert.equal(regSelf.statusCode, 400);
  assert.equal(jsonOf(regSelf).code, 'FRIEND_SELF_INVITE');
  assert.equal(await colGet('jiazu_users', selfPhone), null, '校验失败不得建号');

  const c4 = await devCode('16600009953');
  const regUnknown = await call('/auth/register', 'POST', {}, {}, { phone: '16600009953', code: c4, invite_code: '16600000000' });
  assert.equal(regUnknown.statusCode, 400);
  assert.equal(jsonOf(regUnknown).code, 'INVITE_CODE_UNKNOWN');
  assert.equal(await colGet('jiazu_users', '16600009953'), null, '校验失败不得建号');

  const c5 = await devCode('16600009954');
  const regFmt = await call('/auth/register', 'POST', {}, {}, { phone: '16600009954', code: c5, invite_code: 'abc' });
  assert.equal(regFmt.statusCode, 400);
  assert.equal(jsonOf(regFmt).code, 'INVITE_CODE_FORMAT');
});

test('⑦-d 日限静默回落：邀请人达 3 次后，被邀请人注册仍 201（不回滚注册）', async () => {
  const invitee = '16600009961';
  const c = await devCode(invitee);
  const reg = await call('/auth/register', 'POST', {}, {}, { phone: invitee, code: c, invite_code: INVITER_B });
  assert.equal(reg.statusCode, 201, '超限不得影响注册');
  const { colGet } = await import('./store.js');
  const doc = await colGet('jiazu_invites', invitee);
  assert.equal(doc.inviter_phone, INVITER_B);
  assert.equal(doc.rewarded, false, '日限外静默不发放');
  assert.equal(inviteTxs(await getAssets(INVITER_B)).length, 3, '流水条数仍为 3');
});

// ===================== ⑧ 真源零写入 =====================

test('⑧ 真源零写入：migrate-output/ 与 config/tree-meta.json 逐字节未变', () => {
  if (realMetaMd5 !== null) assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 被改动');
  for (const [f, h] of realTreeBaseline) assert.equal(md5(path.join(REAL_TREES, f)), h, `真源树被改动：${f}`);
  if (fs.existsSync(REAL_COLLECTIONS)) {
    const now = fs.readdirSync(REAL_COLLECTIONS);
    for (const f of now) {
      const h = md5(path.join(REAL_COLLECTIONS, f));
      if (realColBaseline.has(f)) assert.equal(h, realColBaseline.get(f), `真源集合被改动：${f}`);
    }
    for (const f of realColBaseline.keys()) assert.ok(now.includes(f), `真源集合被删除：${f}`);
  }
});
