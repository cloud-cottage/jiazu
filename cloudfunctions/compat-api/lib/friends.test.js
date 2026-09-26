/**
 * 好友关系域单测 — lib/friends.js（纯逻辑 + IO 层，**不含路由**）
 * 口径：Zang 裁定 **v4**（2026-09-25 改单）—— v3 的 F-3 / F-5 时间单位与续约语义被推翻：
 *   ① 时间单位一律「天」：基础有效期 365 天、每次成功续约叠加 30 天、
 *      到期 = T0 + (365 + 30 × reward_months) 天；**自然月算术已删除**（addMonths 不存在）
 *   ② 续约申请期道具锁定：发起时锁定但不扣除；确认 ⇒ 发起方那枚转为应扣减；
 *      对方拒绝 / 发起方撤回 / 超 7 天未确认 ⇒ 解锁且**零流水**
 *   ③ 守卫：发起方自确认 ⇒ RENEW_SELF_CONFIRM；dissolved 终态后 confirm / acceptInvite 一律拒绝且不复活
 *
 * 覆盖（逐条对时间线）：
 *   ①  F-2 relationIdOf 升序 + 每关系一文档 + 文档字段逐字（单点真源，不双份）
 *   ②  F-4 接受 → T0 = 接受时刻、expires_at = T0 + 365 天
 *   ③  v4① 天数口径：365 / 395 / 725 天三算例 + 闰日 / 月末不漂移 + addMonths 已删除
 *   ④  F-4 邀请超 7 天惰性作废（reason = invite_timeout）+ 作废后不可接受
 *   ⑤  F-5 距到期 31 天拒续约（NOT_IN_RENEW_WINDOW + 零写入）、30 天可续
 *   ⑥  F-5 续约成功 reward_months +1、expires_at 按 **T0 锚点**重算
 *   ⑦  F-5 连续续约 12 次 → expires_at = T0 + 725 天
 *   ⑧  F-5 双边各再校一次：任一不足 → 409 整单拒绝、申请保留、零写入
 *   ⑨  F-5 续约申请超 7 天未确认自动失效、**不得改 expires_at**
 *   ⑩  F-4 到期转缓冲（expires_at 不变 + grace_until = +30 天）
 *   ⑪  F-4 缓冲期不可续约 + 可单方解除（立即终止）
 *   ⑫  F-4 缓冲期满自动解除（reason = grace_expired）
 *   ⑬  F-4/F-6 解除后重建 = 全新文档（reward_months 归零、version 回 1、history 清空）
 *   ⑭  F-7 自邀拒绝 / 同一对手机号仅一份非 dissolved 关系（含反序邀请）
 *   ⑮  F-10 错误码集中逐字 + 状态码（v4 新增 RENEW_ALREADY_PENDING / RENEW_SELF_CONFIRM）
 *   ⑯  F-9 isActiveAt：仅未到期 active 计入
 *   ⑰  F-2 列表只走 colWhere（listRelations 缺省排除 dissolved）
 *   ⑱  F-8 sweepRelation 纯函数：不做 IO、不改入参
 *   ⑲  F-11 本模块不碰资产 / 无第二套 IO（源码判据）
 *   ⑳  F-12 导出清单逐字齐备
 *   ㉑  v4② 锁定逐字（pending 九字段 / 返回值 locked）+ 二次发起结构化拒绝 + 缺省 lot_id = ''
 *   ㉒  v4② 超时 ⇒ 解锁、无任何流水、可重新发起
 *   ㉓  v4② 确认 ⇒ 发起方那枚锁定项转应扣减（deduct 出参逐字）
 *   ㉔  v4② 对方拒绝 / 发起方撤回 ⇒ unlocked、无 deduct（零流水）
 *   ㉕  v4③ 发起方自确认 ⇒ RENEW_SELF_CONFIRM（零写入、锁定保留）
 *   ㉖  v4③ dissolved 终态 ⇒ confirm / acceptInvite / 二次操作一律拒绝且不复活
 *   ㉗  真源零写入：config/tree-meta.json 与 migrate-output/（trees + details + collections）md5 逐字节一致
 *
 * 数据安全：`COMPAT_OUT_DIR` / `COMPAT_META_FILE` 一律指向 /tmp 副本；文末 md5 断言真源未变
 * （照 assets.test.js / scroll-items.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/friends.test.js
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
const MOD_SRC = path.join(HERE, 'friends.js');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-friends-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

const F = await import('./friends.js');

const COL_FILE = path.join(TMP, 'collections', 'jiazu_friends.json');
const readCol = () => JSON.parse(fs.readFileSync(COL_FILE, 'utf8'));
const docOf = (id) => readCol()[id];

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString();
const at = (base, days) => iso(Date.parse(base) + days * DAY);

/** 每用例独占一对手机号（互不干扰，且便于断言「同一对只有一份文档」） */
let seq = 0;
const pair = () => {
  seq += 1;
  const n = String(seq).padStart(3, '0');
  return [`1370000${n}1`, `1370000${n}2`];
};
const rid = (a, b) => F.relationIdOf(a, b);

const rejectsWith = (code) => async (p) => {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, `期望错误码 ${code}，实得 ${e.code}`);
    assert.ok(e.status >= 400 && e.status < 500, `期望 4xx，实得 ${e.status}`);
    assert.ok(typeof e.message === 'string' && e.message.length > 0, '错误必须带中文文案');
    return true;
  });
};

/** 终态守卫：同时核错误码与 reason */
const rejectsWithReason = (code, reason) => async (p) => {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, `期望错误码 ${code}，实得 ${e.code}`);
    assert.equal(e.reason, reason, `期望 reason ${reason}，实得 ${e.reason}`);
    return true;
  });
};

/** 建一份 active 关系，返回 { a, b, id, T0, expires } */
async function activeRelation(T0) {
  const [a, b] = pair();
  await F.createInvite(a, b, { now: T0 });
  const acc = await F.acceptInvite(rid(a, b), b, { now: T0 });
  return { a, b, id: rid(a, b), T0, expires: acc.relation.expires_at };
}

// ══ ① F-2 关系 id 与存储形态 ══════════════════════════════════════════════════════
test('F-2 关系 _id：双方手机号升序拼接（A 为字典序较小者）；每关系一文档、字段逐字', async () => {
  const [a, b] = pair();
  assert.equal(F.relationIdOf(a, b), `${a}:${b}`);
  assert.equal(F.relationIdOf(b, a), `${a}:${b}`, '反向调用必须得到同一 id');
  assert.equal(F.relationIdOf(a, ''), '');

  const T0 = '2027-01-15T00:00:00.000Z';
  const res = await F.createInvite(a, b, { now: T0 });
  assert.equal(res.ok, true);
  assert.equal(res.relation_id, `${a}:${b}`);
  const doc = docOf(res.relation_id);
  assert.equal(doc._id, `${a}:${b}`);
  assert.equal(doc.a_phone, a);
  assert.equal(doc.b_phone, b);
  assert.equal(doc.status, 'pending');
  assert.equal(doc.created_at, T0);
  assert.equal(doc.expires_at, null, '待邀请阶段无有效期');
  assert.equal(doc.reward_months, 0, 'v4：建立时累计成功续约数 = 0');
  assert.equal(doc.renewals, 0);
  assert.equal(doc.grace_until, null);
  assert.equal(doc.reason, '');
  assert.equal(doc.version, 1, '全新文档 version 从 1 起');
  assert.equal(doc.pending.kind, 'invite');
  assert.equal(doc.pending.from_phone, a);
  assert.equal(doc.pending.to_phone, b);
  assert.equal(doc.pending.requested_at, T0);
  assert.equal(doc.pending.expires_at, at(T0, 7));
  assert.equal(doc.history.length, 1);
  assert.equal(doc.history[0].type, 'invite_created');
  // 字段清单逐字（F-2 十一字段 + F-4 授权的 grace_until / reason）
  assert.deepEqual(Object.keys(doc).sort(), [
    '_id',
    'a_phone',
    'b_phone',
    'created_at',
    'expires_at',
    'grace_until',
    'history',
    'pending',
    'reason',
    'renewals',
    'reward_months',
    'status',
    'version',
  ]);
  // 单点真源：同一关系在集合里只有一份文档
  assert.equal(Object.keys(readCol()).filter((k) => k === res.relation_id).length, 1);
});

test('F-1 集合名逐字 = jiazu_friends，本地模式落 collections/jiazu_friends.json', async () => {
  assert.equal(F.FRIENDS_COL, 'jiazu_friends');
  assert.ok(fs.existsSync(COL_FILE), '副本目录下应生成 jiazu_friends.json');
});

// ══ ② / ③ 接受锚点与天数算术（v4 ①） ══════════════════════════════════════════════
test('F-4 接受邀请：status=active、created_at = 接受时刻（T0）、expires_at = T0 + 365 天', async () => {
  const [a, b] = pair();
  const t0 = '2027-02-10T08:30:00.000Z';
  const accept = at(t0, 2);
  await F.createInvite(a, b, { now: t0 });
  const res = await F.acceptInvite(rid(a, b), b, { now: accept });
  assert.equal(res.relation.status, 'active');
  assert.equal(res.relation.created_at, accept, 'T0 = 接受时刻（不是发起时刻）');
  assert.equal(res.relation.expires_at, F.baseExpiresAt(accept, 0), '锚点 = T0');
  assert.equal(res.relation.expires_at, at(accept, 365), 'v4① 基础有效期 = 365 天');
  assert.equal(res.relation.expires_at, '2028-02-12T08:30:00.000Z', 'T0 2027-02-12 + 365 天');
  assert.equal(res.relation.pending, null);
  assert.equal(res.relation.reward_months, 0);
  assert.equal(res.relation.version, 2);
  assert.equal(docOf(rid(a, b)).history.at(-1).type, 'invite_accepted');
});

test('v4① 天数口径：baseExpiresAt 三算例（365 / 395 / 725 天）且不因闰日月末漂移；addMonths 已删除', () => {
  assert.equal(F.BASE_DAYS, 365, '基础有效期 = 365 天');
  assert.equal(F.RENEWAL_REWARD_DAYS, 30, '每次成功续约叠加 30 天');
  assert.equal(F.LOCKED_PIECES, 1, '一次续约申请锁定 1 枚');
  assert.equal(F.addMonths, undefined, 'v4 起自然月算术整体删除，不留死代码');
  assert.equal(F.BASE_MONTHS, undefined, 'v3 的自然月常量已删除');
  assert.equal(F.RENEWAL_REWARD_MONTHS, undefined, 'v3 的奖励月常量已删除');
  assert.equal(F.INVITE_TTL_DAYS, 7);
  assert.equal(F.RENEW_TTL_DAYS, 7);
  assert.equal(F.RENEW_WINDOW_DAYS, 30);
  assert.equal(F.GRACE_DAYS, 30);

  // 三算例（逐字）：T0 = 2026-01-31（月末）⇒ 0 / 1 / 12 次续约
  const T0 = '2026-01-31T00:00:00.000Z';
  assert.equal(F.baseExpiresAt(T0, 0), at(T0, 365), '首次建立 = T0 + 365 天');
  assert.equal(F.baseExpiresAt(T0, 0), '2027-01-31T00:00:00.000Z');
  assert.equal(F.baseExpiresAt(T0, 1), at(T0, 395), '续约 1 次 = T0 + 395 天');
  assert.equal(F.baseExpiresAt(T0, 1), '2027-03-02T00:00:00.000Z');
  assert.equal(F.baseExpiresAt(T0, 12), at(T0, 725), '续约 12 次 = T0 + 725 天');
  assert.equal(F.baseExpiresAt(T0, 12), '2028-01-26T00:00:00.000Z');
  assert.equal(365 + 30 * 12, 725);

  // 纯天数加法：闰日 / 月末锚点一律按真实毫秒推进，差值恒等于 (365 + 30n) 天
  for (const anchor of ['2026-01-31T00:00:00.000Z', '2028-02-29T12:00:00.000Z', '2026-08-31T23:59:59.999Z']) {
    for (const n of [0, 1, 12]) {
      assert.equal(Date.parse(F.baseExpiresAt(anchor, n)) - Date.parse(anchor), (365 + 30 * n) * DAY);
    }
  }
  assert.equal(F.baseExpiresAt('2028-02-29T00:00:00.000Z', 0), '2029-02-28T00:00:00.000Z', '闰日锚点按真实天数推进');
});

// ══ ④ 邀请超时 ═══════════════════════════════════════════════════════════════════
test('F-4 邀请超 7 天：惰性置 dissolved（reason=invite_timeout、保留审计），且不可再接受', async () => {
  const [a, b] = pair();
  const T0 = '2027-03-01T00:00:00.000Z';
  await F.createInvite(a, b, { now: T0 });
  const doc = docOf(rid(a, b));

  // 未到期（6 天 23:59:59.999）→ 不迁移
  const early = F.sweepRelation(doc, new Date(Date.parse(at(T0, 7)) - 1));
  assert.equal(early.changed, false);
  assert.equal(early.events.length, 0);
  assert.equal(early.relation.status, 'pending');

  // 到期（第 7 天整）→ 迁移
  const late = F.sweepRelation(doc, at(T0, 7));
  assert.equal(late.changed, true);
  assert.equal(late.relation.status, 'dissolved');
  assert.equal(late.relation.reason, 'invite_timeout');
  assert.equal(late.relation.pending, null);
  assert.equal(late.events.length, 1);
  assert.equal(late.events[0].type, 'invite_timeout');
  assert.equal(late.events[0].to_status, 'dissolved');
  assert.equal(late.relation.history.at(-1).type, 'invite_timeout', '保留审计：事件入 history');

  // IO 路径：超时后接受 → 结构化拒绝；且**零写入**（磁盘仍是 pending）
  await rejectsWith('FRIEND_STATE_INVALID')(F.acceptInvite(rid(a, b), b, { now: at(T0, 7) }));
  assert.equal(docOf(rid(a, b)).status, 'pending');
  assert.equal(docOf(rid(a, b)).version, 1);
});

// ══ ⑤ / ⑥ 续约窗口与续约成功 ═════════════════════════════════════════════════════
test('F-5 距到期 31 天拒续约（NOT_IN_RENEW_WINDOW、零写入）、30 天可续', async () => {
  const T0 = '2026-01-31T00:00:00.000Z'; // 月末锚点 ⇒ expires = T0 + 365 天 = 2027-01-31
  const { a, b, id, expires } = await activeRelation(T0);
  assert.equal(expires, '2027-01-31T00:00:00.000Z');
  assert.equal(F.windowOpenAt({ expires_at: expires }), '2027-01-01T00:00:00.000Z');

  const before = docOf(id);
  await rejectsWith('NOT_IN_RENEW_WINDOW')(F.renewRequest(id, a, { now: '2026-12-31T00:00:00.000Z' })); // 距到期 31 天
  const after = docOf(id);
  assert.equal(after.version, before.version, '拒绝 ⇒ 零写入');
  assert.equal(after.pending, null);
  assert.equal(after.expires_at, before.expires_at);

  const ok = await F.renewRequest(id, a, { now: '2027-01-01T00:00:00.000Z', locked_lot_id: 'LOT-5-1' }); // 距到期 30 天整
  assert.equal(ok.ok, true);
  assert.equal(ok.relation.pending.kind, 'renew');
  assert.equal(ok.relation.pending.from_phone, a);
  assert.equal(ok.relation.pending.to_phone, b);
  assert.equal(ok.relation.pending.expires_at, '2027-01-08T00:00:00.000Z');
  assert.equal(ok.relation.expires_at, '2027-01-31T00:00:00.000Z', '申请阶段不得改有效期');
  assert.equal(ok.window_open_at, '2027-01-01T00:00:00.000Z');
  assert.deepEqual(ok.locked, { by: a, pieces: 1, lot_id: 'LOT-5-1', at: '2027-01-01T00:00:00.000Z' });

  // v4②：已有待确认申请 → 结构化拒绝（新码），且**零写入**（双方任一侧再发起都被拒）
  const snap = docOf(id);
  await rejectsWith('RENEW_ALREADY_PENDING')(F.renewRequest(id, b, { now: '2027-01-02T00:00:00.000Z' }));
  await rejectsWith('RENEW_ALREADY_PENDING')(F.renewRequest(id, a, { now: '2027-01-02T00:00:00.000Z' }));
  assert.equal(docOf(id).version, snap.version, 'RENEW_ALREADY_PENDING ⇒ 零写入');
  assert.equal(docOf(id).pending.locked_by, a, '拒绝不得改写锁定方');
  // 非当事人 → 拒绝
  await rejectsWith('FRIEND_NOT_PARTY')(F.renewRequest(id, '13799999999', { now: '2027-01-02T00:00:00.000Z' }));
  // 申请方自持不足 → 结构化拒绝（此刻上一笔申请已超 7 天，调用时被惰性清空后走到兰帖校验）
  await rejectsWith('SCROLL_INSUFFICIENT')(F.renewRequest(id, b, { now: '2027-01-09T00:00:00.000Z', has_self_scroll: false }));
  // 拒绝 ⇒ 零写入：盘上仍是 2027-01-01 那笔待确认申请（惰性清空只随下一次成功写路径落地）
  assert.equal(docOf(id).pending.requested_at, '2027-01-01T00:00:00.000Z');
});

test('F-5 续约成功：renewals+1 / reward_months+1 / expires_at 按 T0 锚点重算（非续约时刻）', async () => {
  const T0 = '2026-01-31T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const reqAt = iso(Date.parse(expires) - 20 * DAY);
  const confirmAt = iso(Date.parse(expires) - 19 * DAY);
  await F.renewRequest(id, a, { now: reqAt, locked_lot_id: 'LOT-6-1' });
  const res = await F.renewConfirm(id, b, { now: confirmAt });

  assert.equal(res.relation.renewals, 1);
  assert.equal(res.relation.reward_months, 1);
  assert.equal(res.relation.pending, null);
  // T0 锚点 + 395 天；**不是**续约时刻 + 365 天
  assert.equal(res.relation.expires_at, at(T0, 395));
  assert.equal(res.relation.expires_at, '2027-03-02T00:00:00.000Z');
  assert.notEqual(res.relation.expires_at, at(confirmAt, 365));
  assert.equal(res.relation.created_at, T0, 'T0 不变');
  assert.equal(docOf(id).history.at(-1).type, 'renew_confirmed');
});

test('v4① 连续续约 12 次 → reward_months = 12、expires_at = T0 + 725 天', async () => {
  const T0 = '2026-01-15T00:00:00.000Z';
  const { a, b, id } = await activeRelation(T0);
  let expires = at(T0, 365);
  for (let k = 0; k < 12; k += 1) {
    const when = iso(Date.parse(expires) - 29 * DAY); // 距到期 29 天 = 窗口内
    const by = k % 2 === 0 ? a : b; // 双方轮流发起
    const other = by === a ? b : a;
    await F.renewRequest(id, by, { now: when, locked_lot_id: `LOT-12-${k}` });
    const res = await F.renewConfirm(id, other, { now: when });
    expires = res.relation.expires_at;
    assert.equal(expires, at(T0, 365 + 30 * (k + 1)), `第 ${k + 1} 次续约后应为 T0 + ${365 + 30 * (k + 1)} 天`);
  }
  const doc = docOf(id);
  assert.equal(doc.renewals, 12);
  assert.equal(doc.reward_months, 12);
  assert.equal(doc.expires_at, at(T0, 725), '续约 12 次 = T0 + 725 天');
  assert.equal(doc.expires_at, '2028-01-10T00:00:00.000Z');
  assert.equal(doc.status, 'active');
});

// ══ ⑧ 双边各再校一次 + 守卫① ══════════════════════════════════════════════════════
test('F-5 确认续约双边各再校一次：任一不足 → 409 整单拒绝、申请与锁定保留、零写入', async () => {
  const T0 = '2026-06-10T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const when = iso(Date.parse(expires) - 10 * DAY);
  await F.renewRequest(id, a, { now: when, locked_lot_id: 'LOT-8-1' });
  const snapshot = docOf(id);

  await rejectsWith('SCROLL_INSUFFICIENT')(F.renewConfirm(id, b, { now: when, has_initiator_scroll: false }));
  await rejectsWith('SCROLL_INSUFFICIENT')(F.renewConfirm(id, b, { now: when, has_self_scroll: false }));
  const kept = docOf(id);
  assert.equal(kept.version, snapshot.version, '整单拒绝 ⇒ 零写入');
  assert.equal(kept.pending.kind, 'renew', '申请保留至超时');
  assert.equal(kept.pending.locked_lot_id, 'LOT-8-1', '锁定保留至超时');
  assert.equal(kept.expires_at, snapshot.expires_at);
  assert.equal(kept.reward_months, 0);

  // 第三方不可确认
  await rejectsWith('FRIEND_NOT_PARTY')(F.renewConfirm(id, '13799999999', { now: when }));
  assert.equal(docOf(id).pending.kind, 'renew');

  const res = await F.renewConfirm(id, b, { now: when, has_self_scroll: true, has_initiator_scroll: true });
  assert.equal(res.relation.reward_months, 1);
  assert.equal(docOf(id).pending, null);
  // 申请已消费 → 再确认 → 状态拒绝
  await rejectsWith('FRIEND_STATE_INVALID')(F.renewConfirm(id, a, { now: when }));
});

// ══ ⑨ 续约申请超时 ═══════════════════════════════════════════════════════════════
test('F-5 续约申请超 7 天未确认：自动失效（= 解锁）、关系继续运行、**不得改 expires_at**', async () => {
  const T0 = '2026-03-05T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const reqAt = iso(Date.parse(expires) - 20 * DAY);
  await F.renewRequest(id, a, { now: reqAt, locked_lot_id: 'LOT-9-1' });
  const expiresBefore = docOf(id).expires_at;

  // 纯函数口径
  const swept = F.sweepRelation(docOf(id), at(reqAt, 7));
  assert.equal(swept.changed, true);
  assert.equal(swept.relation.pending, null, 'v4②：超时 ⇒ 清空 pending（锁一并解除）');
  assert.equal(swept.relation.status, 'active');
  assert.equal(swept.relation.expires_at, expiresBefore, '申请失效不得改变 expires_at');
  assert.equal(swept.events[0].type, 'renew_timeout');
  assert.deepEqual(Object.keys(swept).sort(), ['changed', 'events', 'relation'], '纯函数只出三字段，无扣减信息');
  assert.equal(JSON.stringify(swept).includes('LOT-9-1'), false, '超时路径不得残留锁定批次号');
  // 6 天 23:59:59.999 仍未失效
  assert.equal(F.sweepRelation(docOf(id), new Date(Date.parse(at(reqAt, 7)) - 1)).changed, false);

  // IO 路径：超时后确认 → 拒；sweep 落盘由下一次成功写路径完成
  await rejectsWith('FRIEND_STATE_INVALID')(F.renewConfirm(id, b, { now: at(reqAt, 8) }));
  const after = docOf(id);
  assert.equal(after.expires_at, expiresBefore);
  assert.equal(after.pending.kind, 'renew', '仅 reject 不动盘：申请由下一次写路径惰性失效');
});

// ══ ⑩ / ⑪ / ⑫ 缓冲期 ════════════════════════════════════════════════════════════
test('F-4 到期转缓冲：expires_at 不变、另存 grace_until = expires_at + 30 天', async () => {
  const T0 = '2026-05-20T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const acc = { relation: docOf(id) };
  assert.equal(acc.relation.expires_at, expires);
  assert.equal(F.isActiveAt(acc.relation, new Date(Date.parse(expires) - 1)), true);
  assert.equal(F.isActiveAt(acc.relation, new Date(expires)), false, '到期那一刻不再是生效中');

  const swept = F.sweepRelation(docOf(id), expires);
  assert.equal(swept.relation.status, 'grace');
  assert.equal(swept.relation.expires_at, expires, 'expires_at 不变');
  assert.equal(swept.relation.grace_until, at(expires, 30));
  assert.equal(swept.events[0].type, 'grace_entered');
  assert.equal(F.isActiveAt(swept.relation, new Date(swept.relation.grace_until)), false, '缓冲期不计入奖励池分母');
  assert.equal(F.sweepRelation(docOf(id), at(expires, 29)).relation.status, 'grace');
  void a;
  void b;
});

test('F-4 缓冲期内：不可发起续约（零写入）、可单方解除立即终止', async () => {
  const T0 = '2026-05-20T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const graceDoc = F.sweepRelation(docOf(id), expires).relation;
  assert.equal(graceDoc.status, 'grace');
  // grace 是惰性到达的：盘上仍是 active（无成功写路径会落 grace），调用时按 now 重算后拒绝
  await rejectsWith('FRIEND_STATE_INVALID')(F.renewRequest(id, a, { now: at(expires, 1) }));
  await rejectsWith('FRIEND_STATE_INVALID')(F.renewConfirm(id, b, { now: at(expires, 1) }));
  assert.equal(docOf(id).status, 'active', '拒绝 ⇒ 零写入（expires_at 已过但未落盘为 grace）');

  const res = await F.dissolve(id, a, { now: at(expires, 2) });
  assert.equal(res.relation.status, 'dissolved', '缓冲期内单方解除立即终止');
  assert.equal(res.relation.reason, 'dissolved_by_party');
  assert.equal(docOf(id).status, 'dissolved');
  await rejectsWith('FRIEND_STATE_INVALID')(F.dissolve(id, b, { now: at(expires, 3) }));
});

test('F-4 缓冲期满 30 天：惰性自动解除（reason = grace_expired）', async () => {
  const T0 = '2026-05-20T00:00:00.000Z';
  const { id, expires } = await activeRelation(T0);
  const graceDoc = F.sweepRelation(docOf(id), expires).relation;
  const swept = F.sweepRelation(graceDoc, graceDoc.grace_until);
  assert.equal(swept.relation.status, 'dissolved');
  assert.equal(swept.relation.reason, 'grace_expired');
  assert.equal(swept.events[0].type, 'grace_expired');
  assert.equal(swept.relation.pending, null);
  assert.equal(F.isActiveAt(swept.relation, new Date()), false);
  // 期满前一刻仍为 grace
  assert.equal(F.sweepRelation(graceDoc, new Date(Date.parse(graceDoc.grace_until) - 1)).relation.status, 'grace');
  // 终态不可逆：再 sweep 不再产生事件
  assert.equal(F.sweepRelation(swept.relation, at(graceDoc.grace_until, 3650)).changed, false);
});

// ══ ⑬ 重建 ══════════════════════════════════════════════════════════════════════
test('F-4/F-6 解除后重建 = 全新文档（reward_months 归零、version 回 1、history 清空）', async () => {
  const T0 = '2026-02-01T00:00:00.000Z';
  const { a, b, id } = await activeRelation(T0);
  let expires = at(T0, 365);
  for (let k = 0; k < 2; k += 1) {
    const when = iso(Date.parse(expires) - 5 * DAY);
    await F.renewRequest(id, a, { now: when, locked_lot_id: `LOT-13-${k}` });
    const r = await F.renewConfirm(id, b, { now: when });
    expires = r.relation.expires_at;
  }
  assert.equal(docOf(id).reward_months, 2);
  const d = await F.dissolve(id, a, { now: iso(Date.parse(expires) - DAY) });
  assert.equal(d.relation.status, 'dissolved');
  assert.equal(d.relation.reward_months, 2, '解除不返还 / 不追回，历史数值原样保留');

  const again = await F.createInvite(b, a, { now: '2026-08-08T00:00:00.000Z' }); // 反序邀请同一对
  const fresh = docOf(id);
  assert.equal(again.relation_id, id, '同一对手机号 → 同一份文档');
  assert.equal(fresh.status, 'pending');
  assert.equal(fresh.reward_months, 0, '历史累计续约数清零');
  assert.equal(fresh.renewals, 0);
  assert.equal(fresh.version, 1, '全新文档');
  assert.equal(fresh.history.length, 1);
  assert.equal(fresh.history[0].type, 'invite_created');
  assert.equal(fresh.created_at, '2026-08-08T00:00:00.000Z');
  assert.equal(fresh.expires_at, null);
  assert.equal(fresh.grace_until, null);
  assert.equal(fresh.reason, '');
});

// ══ ⑭ 防刷 ══════════════════════════════════════════════════════════════════════
test('F-7 不得自邀（a_phone 与 b_phone 相同一律拒）', async () => {
  const [a] = pair();
  await rejectsWith('FRIEND_SELF_INVITE')(F.createInvite(a, a, { now: '2026-01-01T00:00:00.000Z' }));
  await rejectsWith('FRIEND_INVALID_PHONE')(F.createInvite('', a));
  await rejectsWith('FRIEND_INVALID_PHONE')(F.createInvite(a, '  '));
});

test('F-7 同一对手机号只能存在一份非 dissolved 关系（pending / active / grace 均拒；含反序邀请）', async () => {
  const [a, b] = pair();
  const T0 = '2026-07-01T00:00:00.000Z';
  await F.createInvite(a, b, { now: T0 });
  const id = rid(a, b);
  await rejectsWith('FRIEND_DUPLICATE')(F.createInvite(a, b, { now: T0 }));
  await rejectsWith('FRIEND_DUPLICATE')(F.createInvite(b, a, { now: T0 }));

  const acc = await F.acceptInvite(id, b, { now: T0 });
  await rejectsWith('FRIEND_DUPLICATE')(F.createInvite(a, b, { now: T0 }));

  // 造一份 grace（在 expires_at 之后发起重建请求）
  const justAfter = at(acc.relation.expires_at, 1);
  await rejectsWith('FRIEND_DUPLICATE')(F.createInvite(a, b, { now: justAfter }));
  assert.equal(F.sweepRelation(docOf(id), justAfter).relation.status, 'grace');

  await F.dissolve(id, b, { now: at(acc.relation.expires_at, 2) });
  const ok = await F.createInvite(a, b, { now: at(acc.relation.expires_at, 3) });
  assert.equal(ok.relation.status, 'pending', '解除后可重建');
});

// ══ ⑮ 错误形状 ══════════════════════════════════════════════════════════════════
test('F-10 错误码集中逐字、状态码固定、未知码抛错', async () => {
  assert.deepEqual(F.FRIEND_ERROR_CODES.slice().sort(), [
    'FRIEND_DUPLICATE',
    'FRIEND_INVALID_PHONE',
    'FRIEND_NOT_FOUND',
    'FRIEND_NOT_PARTY',
    'FRIEND_SELF_INVITE',
    'FRIEND_STATE_INVALID',
    'NOT_IN_RENEW_WINDOW',
    'RENEW_ALREADY_PENDING',
    'RENEW_SELF_CONFIRM',
    'SCROLL_INSUFFICIENT',
  ]);
  assert.equal(F.FRIEND_ERRORS.FRIEND_NOT_FOUND.status, 404);
  assert.equal(F.FRIEND_ERRORS.FRIEND_INVALID_PHONE.status, 400);
  assert.equal(F.FRIEND_ERRORS.NOT_IN_RENEW_WINDOW.status, 409);
  assert.equal(F.FRIEND_ERRORS.SCROLL_INSUFFICIENT.status, 409);
  assert.equal(F.FRIEND_ERRORS.RENEW_ALREADY_PENDING.status, 409, 'v4② 新增码 = 409');
  assert.equal(F.FRIEND_ERRORS.RENEW_SELF_CONFIRM.status, 409, 'v4③ 新增码 = 409');
  for (const code of F.FRIEND_ERROR_CODES) {
    const e = F.friendError(code);
    assert.equal(e.code, code);
    assert.equal(e.status, F.FRIEND_ERRORS[code].status);
    assert.equal(typeof e.message, 'string');
    assert.ok(/[\u4e00-\u9fa5]/.test(e.message), '文案必须是中文');
  }
  assert.throws(() => F.friendError('NOPE'), /未知好友域错误码/);
  await rejectsWith('FRIEND_NOT_FOUND')(F.acceptInvite('13711112222:13711113333', '13711113333'));
  await rejectsWith('FRIEND_NOT_FOUND')(F.dissolve('13711112222:13711113333', '13711113333'));
  await rejectsWith('FRIEND_INVALID_PHONE')(F.listRelations(''));
});

// ══ ⑯ 奖励池口径 ════════════════════════════════════════════════════════════════
test('F-9 isActiveAt：仅「未到期的 active」计入（pending / grace / dissolved / 已过期 active 均不计）', async () => {
  const [a, b] = pair();
  const T0 = '2026-04-01T00:00:00.000Z';
  const pend = (await F.createInvite(a, b, { now: T0 })).relation;
  assert.equal(F.isActiveAt(pend, new Date(T0)), false, 'pending 不计入');
  const acc = await F.acceptInvite(rid(a, b), b, { now: T0 });
  assert.equal(F.isActiveAt(acc.relation, new Date(T0)), true);
  assert.equal(F.isActiveAt(acc.relation, new Date(Date.parse(acc.relation.expires_at) - 1)), true);
  assert.equal(F.isActiveAt(acc.relation, new Date(acc.relation.expires_at)), false, '已过期但未 sweep 的 active 不计');
  const grace = F.sweepRelation(acc.relation, acc.relation.expires_at).relation;
  assert.equal(F.isActiveAt(grace, new Date(Date.parse(grace.grace_until) - 1)), false, 'grace 不计入');
  const dead = F.sweepRelation(grace, grace.grace_until).relation;
  assert.equal(F.isActiveAt(dead, new Date()), false, 'dissolved 不计入');
  assert.equal(F.isActiveAt(null, new Date()), false);
  assert.equal(F.isActiveAt({ status: 'active', expires_at: null }, new Date()), false);
});

// ══ ⑰ 列表（colWhere） ══════════════════════════════════════════════════════════
test('F-2 列表查询只用 colWhere：缺省排除 dissolved、grace 仍可见、非当事人为空', async () => {
  const [a, b] = pair();
  const [c] = pair();
  const T0 = '2026-09-01T00:00:00.000Z';
  const id = rid(a, b);
  await F.createInvite(a, b, { now: T0 });
  const acc = await F.acceptInvite(id, b, { now: T0 });
  const keep = { id, a, b, expires_at: acc.relation.expires_at };
  await F.createInvite(a, c, { now: T0 });
  const idDead = rid(a, c);
  await F.dissolve(idDead, c, { now: T0 });

  const rows = await F.listRelations(a, { now: T0 });
  assert.equal(rows.length, 1, 'dissolved 缺省不出现');
  assert.equal(rows[0]._id, keep.id);
  const all = await F.listRelations(a, { now: T0, include_dissolved: true });
  assert.deepEqual(all.map((r) => r._id).sort(), [keep.id, idDead].sort());
  assert.equal((await F.listRelations('13799998888', { now: T0 })).length, 0);

  // grace 仍可见（F-4：关系保留、列表可见）
  const graceRows = await F.listRelations(a, { now: at(keep.expires_at, 1), include_dissolved: true });
  const graceRow = graceRows.find((r) => r._id === keep.id);
  assert.equal(graceRow.status, 'grace');
  assert.equal(docOf(keep.id).status, 'active', '列表是只读投影，不落盘');
});

// ══ ⑱ 纯函数口径 ════════════════════════════════════════════════════════════════
test('F-8 sweepRelation 是纯函数：不改入参、无 IO、返回新对象', async () => {
  const [a, b] = pair();
  const T0 = '2026-11-11T00:00:00.000Z';
  await F.createInvite(a, b, { now: T0 });
  const snapshot = docOf(rid(a, b));
  const copy = JSON.parse(JSON.stringify(snapshot));
  const out = F.sweepRelation(snapshot, at(T0, 30));
  assert.deepEqual(snapshot, copy, '入参文档一字节未改');
  assert.notEqual(out.relation, snapshot, '返回迁移后的新副本');
  assert.equal(out.relation.status, 'dissolved');
  assert.equal(out.changed, true);
  assert.equal(F.sweepRelation(null, new Date()).relation, null);
  assert.equal(F.sweepRelation(undefined, new Date()).changed, false);
  assert.deepEqual(F.sweepRelation(docOf(rid(a, b)), T0).events, [], '无迁移 ⇒ 空事件表');
});

// ══ ⑲ 不碰资产 / 无第二套 IO ════════════════════════════════════════════════════
test('F-11 本模块不读写兰帖资产、不建第二套 IO（源码判据）', () => {
  const raw = fs.readFileSync(MOD_SRC, 'utf8');
  // 只判代码、不判注释（模块头注释里为说明边界会引用被禁对象的**名字**）
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[ \t]+\/\/.*$/gm, '');
  assert.equal(/economy-ledger|jiazu_assets|withAssets/.test(src), false, '不得 import / 引用经济域账本');
  assert.equal(/writeFileSync|readFileSync|unlinkSync|fs\./.test(src), false, '不得直接碰文件系统');
  assert.equal(/require\(/.test(src), false, '不得用 CJS require 另开 IO');
  assert.equal(/colDelete/.test(src), false, '不得删除文档（关系只走状态机，不物理删）');
  const ioLines = src.split('\n').filter((l) => /from '\.\/|\bimport\b/.test(l));
  assert.deepEqual(ioLines, [`import { colGet, colSet, colWhere } from './store.js';`], 'IO 只经 store.js');
});

// ══ ⑳ 导出清单 ═════════════════════════════════════════════════════════════════
test('F-12 导出清单逐字齐备（函数 + 常量）；自然月导出已不存在', () => {
  for (const name of [
    'createInvite',
    'acceptInvite',
    'rejectInvite',
    'cancelInvite',
    'renewRequest',
    'renewConfirm',
    'renewCancel',
    'dissolve',
    'sweepRelation',
    'isActiveAt',
    'relationIdOf',
    'otherPhoneOf',
    'baseExpiresAt',
    'windowOpenAt',
    'friendError',
  ]) {
    assert.equal(typeof F[name], 'function', `${name} 必须是导出函数`);
  }
  assert.deepEqual(F.RELATION_STATUS, {
    PENDING: 'pending',
    ACTIVE: 'active',
    GRACE: 'grace',
    DISSOLVED: 'dissolved',
  });
  assert.equal(typeof F.FRIEND_ERRORS, 'object');
  assert.equal(F.BASE_DAYS, 365);
  assert.equal(F.RENEWAL_REWARD_DAYS, 30);
  assert.equal(F.LOCKED_PIECES, 1);
  assert.equal(F.FRIENDS_COL, 'jiazu_friends');
  // v4：自然月算术/常量一律不得再导出（无死代码）
  assert.equal(F.addMonths, undefined);
  assert.equal(F.BASE_MONTHS, undefined);
  assert.equal(F.RENEWAL_REWARD_MONTHS, undefined);
});

test('F-4 拒绝 / 撤回邀请：仅被邀请人可拒、仅发起方可撤；终态不可逆', async () => {
  const [a, b] = pair();
  const T0 = '2026-12-01T00:00:00.000Z';
  await F.createInvite(a, b, { now: T0 });
  const id = rid(a, b);
  await rejectsWith('FRIEND_NOT_PARTY')(F.rejectInvite(id, a, { now: T0 }));
  await rejectsWith('FRIEND_NOT_PARTY')(F.cancelInvite(id, b, { now: T0 }));
  const rej = await F.rejectInvite(id, b, { now: at(T0, 1) });
  assert.equal(rej.relation.status, 'dissolved');
  assert.equal(rej.relation.reason, 'invite_rejected');
  await rejectsWith('FRIEND_STATE_INVALID')(F.acceptInvite(id, b, { now: at(T0, 2) }));

  const [c, d] = pair();
  await F.createInvite(c, d, { now: T0 });
  const can = await F.cancelInvite(rid(c, d), c, { now: at(T0, 1) });
  assert.equal(can.relation.status, 'dissolved');
  assert.equal(can.relation.reason, 'invite_cancelled');
  await rejectsWith('FRIEND_STATE_INVALID')(F.cancelInvite(rid(c, d), c, { now: at(T0, 2) }));
});

// ══ ㉑ v4② 锁定：字段逐字 + 二次发起拒 + lot_id 缺省 ══════════════════════════════
test('v4② 续约申请锁定：pending 九字段逐字、返回值 locked 逐字、二次发起 RENEW_ALREADY_PENDING（零写入）', async () => {
  const T0 = '2026-02-01T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const reqAt = iso(Date.parse(expires) - 20 * DAY);

  const res = await F.renewRequest(id, a, { now: reqAt, locked_lot_id: 'LOT-A-77' });
  // 返回值 locked 逐字（仅占用、未扣除；调用方据以登记占用，**不得扣减**）
  assert.deepEqual(res.locked, { by: a, pieces: 1, lot_id: 'LOT-A-77', at: reqAt });
  // pending 字段逐字（既有四字段 + 锁定四字段）
  assert.deepEqual(res.relation.pending, {
    kind: 'renew',
    from_phone: a,
    to_phone: b,
    requested_at: reqAt,
    expires_at: at(reqAt, 7),
    locked_by: a,
    locked_pieces: 1,
    locked_lot_id: 'LOT-A-77',
    locked_at: reqAt,
  });
  assert.deepEqual(Object.keys(docOf(id).pending).sort(), [
    'expires_at',
    'from_phone',
    'kind',
    'locked_at',
    'locked_by',
    'locked_lot_id',
    'locked_pieces',
    'requested_at',
    'to_phone',
  ]);
  assert.equal(res.relation.pending.locked_pieces, 1);
  assert.equal(res.relation.expires_at, expires, '锁定阶段不得改有效期');
  assert.equal('deduct' in res, false, '发起阶段绝不返回扣减（锁定不扣除）');
  assert.equal('unlocked' in res, false);

  // 同一关系已存在 pending 续约申请 → 再次 renewRequest 结构化拒绝且零写入
  const snap = docOf(id);
  await rejectsWith('RENEW_ALREADY_PENDING')(F.renewRequest(id, a, { now: at(reqAt, 1) }));
  await rejectsWith('RENEW_ALREADY_PENDING')(F.renewRequest(id, b, { now: at(reqAt, 1) }));
  assert.equal(docOf(id).version, snap.version, '零写入');
  assert.deepEqual(docOf(id).pending, snap.pending, '锁与申请一字未动');

  // locked_lot_id 缺省 ⇒ ''（可为空）
  const [c, d] = pair();
  await F.createInvite(c, d, { now: T0 });
  const acc2 = await F.acceptInvite(rid(c, d), d, { now: T0 });
  const res2 = await F.renewRequest(rid(c, d), c, { now: iso(Date.parse(acc2.relation.expires_at) - 10 * DAY) });
  assert.deepEqual(res2.locked, {
    by: c,
    pieces: 1,
    lot_id: '',
    at: iso(Date.parse(acc2.relation.expires_at) - 10 * DAY),
  });
  assert.equal(docOf(rid(c, d)).pending.locked_lot_id, '');
});

// ══ ㉒ v4② 超时 ⇒ 解锁、无任何流水、可重新发起 ════════════════════════════════════
test('v4② 超 7 天未确认：锁随 pending 解除、不产生任何流水、随后可重新发起', async () => {
  const T0 = '2026-03-01T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const reqAt = iso(Date.parse(expires) - 20 * DAY);
  await F.renewRequest(id, a, { now: reqAt, locked_lot_id: 'LOT-B-1' });
  assert.equal(docOf(id).pending.locked_lot_id, 'LOT-B-1');

  // 纯函数路径：解锁（pending 清空）且不夹带任何扣减信息
  const swept = F.sweepRelation(docOf(id), at(reqAt, 7));
  assert.equal(swept.changed, true);
  assert.equal(swept.relation.pending, null);
  assert.equal(swept.relation.expires_at, expires, '解锁不得改 expires_at');
  assert.equal(swept.events.map((e) => e.type).join(','), 'renew_timeout');
  assert.deepEqual(Object.keys(swept).sort(), ['changed', 'events', 'relation']);
  assert.equal(/deduct|unlocked|LOT-B-1/.test(JSON.stringify(swept)), false, '解锁不得产生任何流水 / 残留锁');

  // IO 路径：锁已失效 ⇒ 可重新发起（新锁覆盖）；旧批次号从文档中彻底消失
  const again = await F.renewRequest(id, b, { now: at(reqAt, 8), locked_lot_id: 'LOT-B-2' });
  assert.deepEqual(again.locked, { by: b, pieces: 1, lot_id: 'LOT-B-2', at: at(reqAt, 8) });
  assert.equal(docOf(id).pending.locked_by, b, '新锁归新发起方');
  assert.equal(JSON.stringify(docOf(id)).includes('LOT-B-1'), false, '旧锁批次号不得残留');
  assert.equal(docOf(id).expires_at, expires, '重新发起也不得改 expires_at');

  // 确认时被扣的是新发起方（b）那枚
  const res = await F.renewConfirm(id, a, { now: at(reqAt, 8) });
  assert.equal(res.deduct.locked.by, b);
  assert.equal(res.deduct.locked.lot_id, 'LOT-B-2');
});

// ══ ㉓ v4② 确认 ⇒ 发起方那枚锁定项被扣（deduct 逐字） ══════════════════════════════
test('v4② 对方确认：发起方那枚锁定项转为应扣减（deduct 出参逐字断言）', async () => {
  const T0 = '2026-05-01T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const reqAt = iso(Date.parse(expires) - 15 * DAY);
  const confirmAt = iso(Date.parse(expires) - 14 * DAY);
  await F.renewRequest(id, a, { now: reqAt, locked_lot_id: 'LOT-C-9' });

  const res = await F.renewConfirm(id, b, { now: confirmAt });
  assert.deepEqual(res.deduct, {
    phones: [a, b],
    amount_each: 1,
    locked: { by: a, pieces: 1, lot_id: 'LOT-C-9', at: reqAt },
  });
  assert.equal(res.deduct.locked.by, a, '被扣的锁定项 = 发起方那枚');
  assert.notEqual(res.deduct.locked.by, b, '不是确认方那枚');
  assert.equal(res.deduct.locked.pieces, 1);
  assert.equal(res.relation.pending, null, '确认后锁不再占用（转为扣减）');
  assert.equal(res.relation.reward_months, 1);
  assert.equal(res.relation.expires_at, at(T0, 395));
  assert.equal(docOf(id).pending, null);
});

// ══ ㉔ v4② 对方拒绝 / 发起方撤回 ⇒ 解锁、零流水 ═════════════════════════════════════
test('v4② 对方拒绝 / 发起方撤回：解锁 unlocked 逐字、**不产生任何流水**（无 deduct）', async () => {
  const T0 = '2026-06-01T00:00:00.000Z';
  // 情形一：对方（b）拒绝
  const one = await activeRelation(T0);
  const reqAt1 = iso(Date.parse(one.expires) - 20 * DAY);
  await F.renewRequest(one.id, one.a, { now: reqAt1, locked_lot_id: 'LOT-D-1' });
  const rej = await F.renewCancel(one.id, one.b, { now: at(reqAt1, 1) }); // b = 对方 ⇒ 拒绝
  assert.deepEqual(rej.unlocked, { by: one.a, pieces: 1, lot_id: 'LOT-D-1', at: reqAt1 });
  assert.equal('deduct' in rej, false, '解锁不得产生任何流水（无 deduct 出参）');
  assert.equal(rej.relation.pending, null);
  assert.equal('locked_by' in rej.relation, false, '锁只存在于 pending 内，随 pending 一并消失');
  assert.equal(rej.relation.expires_at, one.expires, '解锁不得改 expires_at');
  assert.equal(rej.events.at(-1).reason, 'renew_rejected');
  assert.equal(docOf(one.id).pending, null);
  assert.equal(JSON.stringify(docOf(one.id)).includes('LOT-D-1'), false, '拒绝后不得残留锁');

  // 情形二：发起方（a）撤回
  const two = await activeRelation(T0);
  const reqAt2 = iso(Date.parse(two.expires) - 20 * DAY);
  await F.renewRequest(two.id, two.a, { now: reqAt2, locked_lot_id: 'LOT-D-2' });
  const back = await F.renewCancel(two.id, two.a, { now: at(reqAt2, 1) }); // a = 发起方 ⇒ 撤回
  assert.deepEqual(back.unlocked, { by: two.a, pieces: 1, lot_id: 'LOT-D-2', at: reqAt2 });
  assert.equal('deduct' in back, false);
  assert.equal(back.relation.pending, null);
  assert.equal(back.events.at(-1).reason, 'renew_cancelled');
  assert.equal(back.relation.reward_months, 0, '解锁路径不得累计奖励');
  assert.equal(back.relation.renewals, 0);
});

// ══ ㉕ v4③ 守卫①：发起方自确认 ════════════════════════════════════════════════════
test('v4③ 守卫：发起方自确认 ⇒ RENEW_SELF_CONFIRM（零写入、申请与锁定保留）', async () => {
  const T0 = '2026-07-01T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  const reqAt = iso(Date.parse(expires) - 12 * DAY);
  await F.renewRequest(id, a, { now: reqAt, locked_lot_id: 'LOT-E-1' });
  const snap = docOf(id);

  await rejectsWith('RENEW_SELF_CONFIRM')(F.renewConfirm(id, a, { now: at(reqAt, 1) }));
  const kept = docOf(id);
  assert.equal(kept.version, snap.version, '自确认被拒 ⇒ 零写入');
  assert.deepEqual(kept.pending, snap.pending, '申请与锁定一字未动');
  assert.equal(kept.reward_months, 0);
  assert.equal(kept.renewals, 0);
  assert.equal(kept.expires_at, expires, '有效期不得被自确认推进');

  // 换对方确认 → 成功（反向：若由 b 发起，则 a 自确认同样被拒）
  const res = await F.renewConfirm(id, b, { now: at(reqAt, 1) });
  assert.equal(res.relation.reward_months, 1);

  const [c, d] = pair();
  await F.createInvite(c, d, { now: T0 });
  const acc2 = await F.acceptInvite(rid(c, d), d, { now: T0 });
  const reqAt2 = iso(Date.parse(acc2.relation.expires_at) - 12 * DAY);
  await F.renewRequest(rid(c, d), d, { now: reqAt2 }); // 这次由 d 发起
  await rejectsWith('RENEW_SELF_CONFIRM')(F.renewConfirm(rid(c, d), d, { now: at(reqAt2, 1) }));
  await rejectsWith('FRIEND_NOT_PARTY')(F.renewConfirm(rid(c, d), '13799999999', { now: at(reqAt2, 1) }));
});

// ══ ㉖ v4③ 守卫②：dissolved 终态不复活 ═════════════════════════════════════════════
test('v4③ 守卫：关系已 dissolved 后 renewConfirm / acceptInvite / 续约一律被拒且不复活', async () => {
  const T0 = '2026-08-01T00:00:00.000Z';
  const { a, b, id, expires } = await activeRelation(T0);
  // 先成功续约一次，再单方解除（带着 1 次续约历史进入终态）
  const reqAt = iso(Date.parse(expires) - 10 * DAY);
  await F.renewRequest(id, a, { now: reqAt, locked_lot_id: 'LOT-F-1' });
  await F.renewConfirm(id, b, { now: at(reqAt, 1) });
  const dead = await F.dissolve(id, a, { now: at(reqAt, 2) });
  assert.equal(dead.relation.status, 'dissolved');
  const snap = docOf(id);

  await rejectsWithReason('FRIEND_STATE_INVALID', 'dissolved_terminal')(F.renewConfirm(id, b, { now: at(reqAt, 3) }));
  await rejectsWithReason('FRIEND_STATE_INVALID', 'dissolved_terminal')(F.acceptInvite(id, b, { now: at(reqAt, 3) }));
  await rejectsWithReason('FRIEND_STATE_INVALID', 'dissolved_terminal')(F.renewRequest(id, a, { now: at(reqAt, 3) }));
  await rejectsWith('FRIEND_STATE_INVALID')(F.renewCancel(id, a, { now: at(reqAt, 3) }));
  await rejectsWith('FRIEND_STATE_INVALID')(F.dissolve(id, a, { now: at(reqAt, 3) }));

  const now = docOf(id);
  assert.equal(now.status, 'dissolved', '终态不可逆：不得复活');
  assert.equal(now.version, snap.version, '全部拒绝 ⇒ 零写入（version 不动）');
  assert.deepEqual(now, snap, '文档逐字节未变');
  assert.equal(now.history.length, snap.history.length, '不得新增审计事件');

  // 邀请被拒 ⇒ dissolved 的关系同样不可再接受
  const [c, d] = pair();
  await F.createInvite(c, d, { now: T0 });
  await F.rejectInvite(rid(c, d), d, { now: at(T0, 1) });
  await rejectsWithReason('FRIEND_STATE_INVALID', 'dissolved_terminal')(F.acceptInvite(rid(c, d), d, { now: at(T0, 2) }));
  assert.equal(docOf(rid(c, d)).status, 'dissolved');
});

// ══ ㉗ 真源零写入收尾 ════════════════════════════════════════════════════════════
test('数据安全：config/tree-meta.json 与 migrate-output/（trees + details + collections）md5 逐字节一致', () => {
  assert.equal(md5(REAL_META), realMetaMd5, '真源 tree-meta.json 未被写入');
  assert.deepEqual(dirBaseline(REAL_TREES), realTreeBaseline, '真源 trees/ 未被写入');
  assert.deepEqual(dirBaseline(REAL_DETAILS), realDetailBaseline, '真源 details/ 未被写入');
  assert.deepEqual(dirBaseline(REAL_COLLECTIONS), realColBaseline, '真源 collections/ 未被写入');
  assert.equal(fs.existsSync(path.join(REAL_COLLECTIONS, 'jiazu_friends.json')), false, '真源不得出现 jiazu_friends.json');
});
