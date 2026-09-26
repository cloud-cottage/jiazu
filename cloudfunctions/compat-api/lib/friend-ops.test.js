/**
 * 好友域**编排层**单测 — lib/friend-ops.js（批2-D ＋ 批2-D 收尾）
 *
 * 口径：Zang 裁定 v4；本单实现 F-A…F-H 八条冻结口径（逐条对应用例见编号），
 * 并落**批2-D 收尾三条裁定**（⑱ relation_token 不透明化 / ⑲ scroll_consume 留痕 / ⑳ 双边扣减补偿）。
 *
 * 覆盖：
 *   ①  F-F 导出清单逐字齐备（11 个操作 + 常量/工具）+ 每个导出**返回对象**含 ok / 失败含 error + 中文 message
 *   ②  F-G listFriends 隐私：不下发好友明文手机号；有昵称出昵称、无昵称只出脱敏串
 *   ③  F-E 通知五条（邀请发出 / 被接受 / 续约待确认 / 续约成功 / 解除）复用站内信域，type 取既有枚举 `system`
 *   ④  F-C① 触发者本人基础奖励照发、**不参与池分配**；池流水形状逐字（type = 既有枚举 `reward` + ref 六键）
 *   ⑤  F-C③ **分母 0 ⇒ 不建池、无任何池流水**（本人基础奖励仍发）+ 正对照（分母 ≥ 1 时建池）
 *   ⑥  F-C② **3 个生效好友 + 池 1 碎片 ⇒ 每人 0、余数销毁**（零头也落 delta 全 0 的审计条）
 *   ⑦  F-C⑤ 分母**不含**缓冲期 / 待邀请 / 已到期未 sweep 的 active（唯一口径 = isActiveAt）
 *   ⑧  F-C④ 好友收到的碎片**不再触发**新的池分发（正向：第三人零变化；反向：显式以 B 为触发者才分发）
 *   ⑨  F-B 锁定：不足 1 枚拒（SCROLL_INSUFFICIENT）；通过则 pending 记锁、**资产未扣**；**锁定后不可二次发起**
 *   ⑩  F-B 超时失效 ⇒ 锁解除、**零流水**、可重新发起；拒绝 / 撤回 ⇒ 解锁且零流水
 *   ⑪  F-B 确认 ⇒ **双边各扣 1 枚**（读回资产验证：发起方扣的正是锁定那一批）；任一方不足 ⇒ 409 零扣减、锁定保留
 *   ⑫  v4① 到期天数三算例：365 / 395 / 725 天
 *   ⑬  v4③ 终态后不得复活（confirm / accept / renew 一律拒；再 sweep 也不复活）
 *   ⑭  F-D sweepFriends 惰性落盘（仅落变更）+ **不注册定时任务**（源码判据）
 *   ⑮  F-A **不自写第二版记账**（源码判据：无资产集合字面、入账只走 ledger 导出）
 *   ⑯  注册数 33 与磁盘 *.test.js 数一致、「已注册但磁盘缺失」0 条、磁盘未注册 0 条
 *   ⑰  真源零写入：config/tree-meta.json 与 migrate-output/（trees + details + collections）全量 md5 前后一致
 *   ⑱  **裁定 3**：**全部路由面出参**不得出现 11 位明文手机号（正则 `1[3-9]\d{9}` 扫 JSON）+ 无 `relation_id` 字段名
 *       ＋ `relation_token` 形状逐字（`fr_` + 16 hex）＋ 反查（token → 关系 `_id`）＋ 形状不符即 404
 *   ⑲  **裁定 1**：续约双边扣减**各写一笔** `scroll_consume`（delta = `{ scrolls: -100 }`）＋ ref 四键逐字
 *       ＋ 白名单登记（`TX_TYPES` 含该取值）＋ 成功路径**不得**冒充 `reward` / `fee_refund`
 *   ⑳  **裁定 2 ＋ 本单修正①**：第二笔扣减可控失败 ⇒ **补偿回写**（双方 lot 明细逐字节回到开工前）＋ 冲正 `fee_refund` 流水
 *       ＋ 关系 history 补偿审计 ＋ 返回 `RENEW_DEDUCT_ROLLED_BACK`（**仅补偿也失败**才 `RENEW_DEDUCT_PARTIAL`）
 *       ＋ **关系文档零变更**（version / renewals / expires_at / pending 逐字段与开工前相同，锁保留）＋ 可重试确认
 *   ㉑  **本单修正①·正对照**：正常路径 —— **先双边扣减、后推进关系**（双边各扣 1 枚 + 各 1 条 `scroll_consume`、
 *       renewals +1、expires_at 按 365 + 30×n 重算、pending 清空解锁、version 恰 +1、零冲正、双方各一条通知）
 *   ㉒  **本单修正②**：`TX_TYPES` 白名单**并回字面** —— `scroll_consume` 在 `economy-ledger.js` 字面内、
 *       白名单**无重复项**（Set 大小 == 长度）、`friend-ops.js` **零运行期 `push`**（源码判据 ＋ recordTx 旁证）
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（照 friends.test.js / scroll-items.test.js）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/friend-ops.test.js
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
const MOD_SRC = path.join(HERE, 'friend-ops.js');
const REAL_META = path.join(REPO, 'config', 'tree-meta.json');
const REAL_OUT = path.join(REPO, 'migrate-output');
const REAL_TREES = path.join(REAL_OUT, 'trees');
const REAL_DETAILS = path.join(REAL_OUT, 'details');
const REAL_COLLECTIONS = path.join(REAL_OUT, 'collections');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-friendops-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));

/** 真源全量指纹（config/tree-meta.json + migrate-output/ 全树，逐文件 md5 再聚合） */
function realSourceFingerprint() {
  const files = [];
  const walk = (dir, rel) => {
    for (const name of (fs.existsSync(dir) ? fs.readdirSync(dir) : [])) {
      const full = path.join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      if (fs.statSync(full).isDirectory()) walk(full, r);
      else files.push({ rel: r, hash: md5(full) });
    }
  };
  walk(REAL_OUT, 'migrate-output');
  walk(path.join(REPO, 'config'), 'config');
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1));
  const agg = crypto.createHash('md5');
  for (const f of files) agg.update(`${f.rel}\u0000${f.hash}\n`);
  return { count: files.length, digest: agg.digest('hex'), files };
}

const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);
const REAL_FP = realSourceFingerprint();

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });

const OPS = await import('./friend-ops.js');
const F = await import('./friends.js');
const L = await import('./economy-ledger.js');
const store = await import('./store.js');

const SRC = fs.readFileSync(MOD_SRC, 'utf8');
const FRIENDS_FILE = path.join(TMP, 'collections', 'jiazu_friends.json');
const MSG_FILE = path.join(TMP, 'collections', 'jiazu_messages.json');
const readFriends = () => (fs.existsSync(FRIENDS_FILE) ? JSON.parse(fs.readFileSync(FRIENDS_FILE, 'utf8')) : {});
const readMsgs = () => (fs.existsSync(MSG_FILE) ? JSON.parse(fs.readFileSync(MSG_FILE, 'utf8')) : {});
const msgItems = (phone) => readMsgs()?.global?.items?.[phone] || [];
const relDoc = (id) => readFriends()[id];
const msgsOf = (phone) => msgItems(phone).map((m) => m.text);

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString();
const at = (base, days) => iso(Date.parse(base) + days * DAY);

/** 每个用例独占一对手机号（11 位，便于脱敏断言） */
let seq = 0;
const pair = () => {
  seq += 1;
  const n = String(seq).padStart(3, '0');
  return [`1390000${n}1`, `1390000${n}2`];
};
const rid = (a, b) => F.relationIdOf(a, b);

/**
 * **裁定 3**：对外入参一律用 `relation_token` —— 用例里显式把关系 `_id` 折成句柄再入参
 * （`T()` 出现的每一处都是「路由面只传 token」的证据）。
 */
const T = (relationId) => OPS.relationTokenOf(relationId);

/** **裁定 3** 判据：11 位手机号正则（`1[3-9]\d{9}`） */
const PHONE_RE = /1[3-9]\d{9}/;

/** 关系集合里出现过的**全部**明文手机号（裁定 3 的逐字反证 denylist） */
const knownPhones = () => {
  const set = new Set();
  for (const doc of Object.values(readFriends())) {
    if (doc && typeof doc === 'object') {
      if (doc.a_phone) set.add(doc.a_phone);
      if (doc.b_phone) set.add(doc.b_phone);
    }
  }
  return [...set];
};

/** 本仓 id 形态（`msg_` / `tx_` / `sc_` … 的「前缀_载荷」）：剥离后才扫手机号正则 */
const ID_TOKEN_RE = /\b(?:msg|tx|sc|bl|sl|jd|lot|fr)_[0-9a-zA-Z]+/g;

/**
 * **裁定 3** 判据：出参 JSON 全文**不得出现**任何 11 位明文手机号，也不得出现 `relation_id` 字段名。
 * 两层判据（避免把本仓 id 载荷里的 epoch 毫秒误判成手机号）：
 *   ① **逐字反证**：关系集合里出现过的**每一个**明文手机号当 denylist，全文子串命中数必须为 0；
 *   ② **正则判据**：先剥离 id 形态（如 `msg_1790316714050_xxx` 的载荷），再以 `1[3-9]\d{9}` 扫全文 ——
 *      被剥离的都是 id、不是手机号；除 id 之外的任何 11 位数字串一律判失败。
 * @param {object} obj 出参对象
 * @param {string} label 用例标签
 */
const noPlainPhone = (obj, label) => {
  const text = JSON.stringify(obj);
  for (const p of knownPhones()) {
    assert.equal(text.includes(p), false, `${label}：出参不得含明文手机号（逐字反证，${OPS.maskPhone(p)}）`);
  }
  const hit = text.replace(ID_TOKEN_RE, '«id»').match(PHONE_RE);
  assert.equal(hit, null, `${label}：出参不得出现 11 位明文手机号，实得「${hit && hit[0]}」`);
  assert.equal(text.includes('relation_id'), false, `${label}：出参不得出现 relation_id 字段名（一律 relation_token）`);
  return obj;
};

/** 断言返回壳成功（失败时把 error 一并打出来，便于定位） */
const ok = (r, label = '') => {
  assert.equal(r.ok, true, `${label} 应成功，实得 ${JSON.stringify(r.error || r)}`);
  return r;
};
/** 断言返回壳失败且错误码命中（F-F：失败必须含结构化 error + 中文 message） */
const failsWith = (r, code, label = '') => {
  assert.equal(r.ok, false, `${label} 应失败，实得 ok=true`);
  assert.ok(r.error && typeof r.error === 'object', `${label} 失败必须含结构化 error`);
  assert.equal(r.error.code, code, `${label} 期望错误码 ${code}，实得 ${r.error.code}`);
  assert.ok(r.error.status >= 400 && r.error.status < 500, `${label} 期望 4xx，实得 ${r.error.status}`);
  assert.ok(typeof r.message === 'string' && r.message.length > 0, `${label} 必须带中文文案`);
  assert.equal(r.message, r.error.message, `${label} message 应与 error.message 一致`);
  return r;
};
const rejectsWith = (code) => async (p, label = '') => {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, `${label} 期望错误码 ${code}，实得 ${e.code}`);
    return true;
  });
};

/** 建一份 active 关系（不走编排层，直接用关系域，保证用例前置干净） */
async function activeRelation(T0) {
  const [a, b] = pair();
  await F.createInvite(a, b, { now: T0 });
  const acc = await F.acceptInvite(rid(a, b), b, { now: T0 });
  return { a, b, id: rid(a, b), token: T(rid(a, b)), T0, expires: acc.relation.expires_at };
}

/** 发 N 枚成品兰帖（N × 100 碎片 → ledger 自动合成 N 个 qty=100 的 ScrollLot） */
async function giveScrolls(phone, n, now) {
  return L.withAssets(phone, (user) => L.addScrollFragments(user, n * L.SCROLL_PIECES_PER_SCROLL, now));
}

const pieces = async (phone) => L.sumLots((await L.getAssets(phone)).scrolls);
const scrollsOf = async (phone) => (await L.getAssets(phone)).scrolls;
const txsOf = async (phone) => (await L.getAssets(phone)).txs;
const fragsOf = async (phone) => (await L.getAssets(phone)).fragments;
const scrollFragsOf = async (phone) => (await L.getAssets(phone)).scroll_fragments;
/** 某手机号上某类型的流水条数（裁定 1/2 的审计判据） */
const txsByType = async (phone, type) => (await txsOf(phone)).filter((t) => t.type === type);

// ══ ① F-F 导出清单与返回壳 ══════════════════════════════════════════════════════
test('F-F 导出清单逐字齐备（11 个操作 + 常量/工具）+ 返回壳含 ok/error/message', async () => {
  const ops = [
    'listFriends',
    'sendFriendInvite',
    'acceptFriendInvite',
    'rejectFriendInvite',
    'cancelFriendInvite',
    'requestRenewal',
    'confirmRenewal',
    'cancelRenewal',
    'dissolveFriend',
    'distributeFriendRewards',
    'sweepFriends',
  ];
  for (const name of ops) {
    assert.equal(typeof OPS[name], 'function', `导出 ${name} 必须是函数`);
  }
  for (const extra of ['FRIEND_OPS_ERRORS', 'FRIEND_NOTICE', 'FRIEND_NOTICE_TYPE', 'opsError', 'maskPhone']) {
    assert.ok(OPS[extra] !== undefined, `导出 ${extra} 必须存在`);
  }
  // 裁定 3 的句柄工具（对外标识唯一来源）
  assert.equal(typeof OPS.relationTokenOf, 'function', '裁定 3：必须导出 relationTokenOf');
  assert.equal(typeof OPS.resolveRelationToken, 'function', '裁定 3：必须导出 resolveRelationToken');
  assert.equal(OPS.RELATION_TOKEN_PREFIX, 'fr_');
  // 失败形状：结构化 error + 中文 message（不抛）
  const bad = await OPS.listFriends('');
  failsWith(bad, 'FRIEND_INVALID_PHONE', '空手机号');
  const nf = await OPS.acceptFriendInvite('a:b', '13911110000', '2026-01-01T00:00:00.000Z');
  failsWith(nf, 'FRIEND_NOT_FOUND', '形状不符的句柄');
  // 裁定 3：形态合法但不存在的句柄 ⇒ 404（不得降级成 400 / 500）
  failsWith(
    await OPS.acceptFriendInvite('fr_0000000000000000', '13911110000', '2026-01-01T00:00:00.000Z'),
    'FRIEND_NOT_FOUND',
    '不存在的关系句柄',
  );
  failsWith(await OPS.confirmRenewal('fr_0000000000000000', '13911110000'), 'FRIEND_NOT_FOUND', '确认：不存在的句柄');
  assert.equal(OPS.maskPhone('13900000001'), '139****0001');
  assert.equal(OPS.maskPhone(''), '');
  assert.equal(OPS.maskPhone('12345'), '1****');
});

// ══ ② F-G 列表隐私 ══════════════════════════════════════════════════════════════
test('F-G listFriends：不下发好友明文手机号（有昵称出昵称、无昵称只出脱敏串）', async () => {
  const T0 = '2026-03-01T00:00:00.000Z';
  const [a, b, c] = ['13910000001', '13910000002', '13910000003'];
  await store.colSet('jiazu_users', b, { _id: b, phone: b, nickname: '乙用户', role: 'user' }); // c 无昵称
  await F.createInvite(a, b, { now: T0 });
  await F.acceptInvite(rid(a, b), b, { now: T0 });
  await F.createInvite(a, c, { now: T0 });
  await F.acceptInvite(rid(a, c), c, { now: T0 });

  const res = ok(await OPS.listFriends(a, T0), 'listFriends');
  assert.equal(res.count, 2);
  assert.equal(res.friends.length, 2);
  const byNick = res.friends.find((f) => f.friend.nickname === '乙用户');
  assert.ok(byNick, '有昵称的好友必须出昵称');
  assert.equal(byNick.friend.display_name, '乙用户');
  assert.equal(byNick.friend.phone_masked, '139****0002');
  assert.equal(byNick.active, true);
  assert.equal(byNick.status, 'active');
  assert.equal(byNick.expires_at, at(T0, 365));
  assert.equal(byNick.days_left, 365);
  assert.equal(byNick.window_open_at, at(T0, 335));
  const noNick = res.friends.find((f) => f.friend.phone_masked === '139****0003');
  assert.ok(noNick, '无昵称好友必须仍出脱敏串');
  assert.equal(noNick.friend.nickname, '');
  assert.equal(noNick.friend.display_name, '139****0003', '拿不到昵称只出脱敏串');

  // 裁定 3：标识一律 relation_token（形状逐字 = fr_ + 16 位小写 hex），**不再有 relation_id**
  for (const f of res.friends) {
    assert.match(f.relation_token, /^fr_[0-9a-f]{16}$/, `relation_token 形状：${f.relation_token}`);
    assert.equal('relation_id' in f, false, 'listFriends 单条不得再出 relation_id');
  }
  assert.deepEqual(
    res.friends.map((f) => f.relation_token).sort(),
    [T(rid(a, b)), T(rid(a, c))].sort(),
    '句柄 = hash(关系 _id) 派生',
  );
  // ②-a 裁定 3：**全文**不得出现任何 11 位明文手机号（正则 1[3-9]\d{9}）
  noPlainPhone(res, 'listFriends');
  // ②-b 逐字段反证：姓名 / 脱敏 / token 里都没有对端明文
  for (const p of [b, c]) assert.equal(JSON.stringify(res).includes(p), false, `${p} 不得出现在列表出参任何字段`);
  // 列表只读：不落盘
  const before = JSON.stringify(readFriends());
  await OPS.listFriends(a, T0);
  assert.equal(JSON.stringify(readFriends()), before, 'listFriends 必须只读、不落盘');
});

// ══ ③ F-E 通知五条（复用站内信域） ═══════════════════════════════════════════════
test('F-E 邀请/接受/续约待确认/续约成功/解除 五条通知复用站内信域（type = 既有枚举 system）', async () => {
  const T0 = '2026-04-01T00:00:00.000Z';
  // 走编排层（关系域本身不发通知），确保「邀请发出 / 被接受」两条通知由本模块产生
  const [a, b] = pair();
  const inv = ok(await OPS.sendFriendInvite(a, b, T0), 'sendFriendInvite');
  noPlainPhone(inv, 'sendFriendInvite');
  assert.equal(inv.relation_token, T(rid(a, b)), '出参只给句柄');
  const acc = ok(await OPS.acceptFriendInvite(inv.relation_token, b, T0), 'acceptFriendInvite');
  noPlainPhone(acc, 'acceptFriendInvite');
  const r = { a, b, id: rid(a, b), token: inv.relation_token, T0, expires: acc.relation.expires_at };
  assert.equal(r.expires, at(T0, 365));
  assert.equal(msgItems(r.a).length, 1);
  assert.equal(msgItems(r.b).length, 1);
  assert.equal(msgItems(r.b)[0].type, 'system');
  assert.equal(msgItems(r.b)[0].title, '好友邀请');
  assert.equal(msgItems(r.b)[0].read, false);
  assert.match(msgItems(r.b)[0].text, /^【好友邀请】.*邀请你成为好友/);
  assert.equal(msgItems(r.a)[0].title, '好友邀请已接受');
  assert.match(msgItems(r.a)[0].text, /^【好友邀请】.*已接受你的好友邀请/);
  // 落库形状与 economy-ops 的 Message 逐字一致
  for (const m of [...msgItems(r.a), ...msgItems(r.b)]) {
    assert.deepEqual(Object.keys(m).sort(), ['created_at', 'id', 'read', 'text', 'title', 'type']);
    assert.match(m.id, /^msg_\d+_[a-z0-9]{6}$/);
  }
  // 续约待确认 → 续约成功（双方各一条）
  await giveScrolls(r.a, 1, T0);
  await giveScrolls(r.b, 1, T0);
  const w = at(r.expires, -5);
  noPlainPhone(ok(await OPS.requestRenewal(r.token, r.a, w), 'requestRenewal'), 'requestRenewal');
  assert.equal(msgItems(r.b).length, 2);
  assert.equal(msgItems(r.b)[1].title, '好友续约待确认');
  assert.match(msgItems(r.b)[1].text, /^【好友续约】.*发起续约申请（已锁定 1 枚兰帖）/);
  noPlainPhone(ok(await OPS.confirmRenewal(r.token, r.b, w), 'confirmRenewal'), 'confirmRenewal');
  assert.equal(msgItems(r.a).length, 2, '发起方只收「被接受」+「续约成功」（续约待确认发给对方）');
  assert.equal(msgItems(r.a)[1].title, '好友续约成功');
  assert.equal(msgItems(r.b).length, 3);
  assert.equal(msgItems(r.b)[2].title, '好友续约成功');
  // 解除 → 双方各一条
  noPlainPhone(ok(await OPS.dissolveFriend(r.token, r.a, at(r.T0, 10)), 'dissolveFriend'), 'dissolveFriend');
  assert.equal(msgItems(r.a).length, 3);
  assert.equal(msgItems(r.b).length, 4);
  assert.equal(msgItems(r.b)[3].title, '好友关系已解除');
  assert.equal(msgItems(r.a)[2].title, '好友关系已解除');
  assert.match(msgItems(r.b)[3].text, /^【好友解除】/);
  // 五条通知一律 type = 'system'（既有枚举，不新增）
  for (const m of [...msgItems(r.a), ...msgItems(r.b)]) assert.equal(m.type, 'system');
  assert.equal(OPS.FRIEND_NOTICE_TYPE, 'system');
  assert.deepEqual(Object.keys(OPS.FRIEND_NOTICE).sort(), [
    'dissolved',
    'invite_accepted',
    'invite_sent',
    'renew_confirmed',
    'renew_pending',
  ]);
});

// ══ ④ F-C① 基础奖励 + 池流水形状逐字 ════════════════════════════════════════════
test('F-C① 触发者本人基础奖励照发、本人不参与池分配；池流水形状逐字（type = 既有枚举 reward）', async () => {
  const T0 = '2026-05-01T00:00:00.000Z';
  const r = await activeRelation(T0);
  const trigger = r.a;
  const res = ok(
    await OPS.distributeFriendRewards(
      trigger,
      { base: { seed_fragments: 1, bamboo_pieces: 1 }, pool: { seed_fragments: 1, scroll_fragments: 1 } },
      T0,
    ),
    'distribute',
  );
  noPlainPhone(res, 'distributeFriendRewards');
  assert.equal(res.denominator, 1);
  assert.equal(res.pooled, true);
  assert.deepEqual(res.base, { seed_fragments: 1, bamboo_pieces: 1, scroll_fragments: 0 });
  assert.deepEqual(res.pool_per_friend, { seed_fragments: 1, bamboo_pieces: 0, scroll_fragments: 1 });
  assert.deepEqual(res.distributed.map((d) => d.phone_masked), [OPS.maskPhone(r.b)], '池只发给生效中好友，且只出脱敏串');
  // 裁定 3：出参只给句柄（账本 ref 里的 relation_id 属**存储审计**，非出参）
  assert.equal(res.distributed[0].relation_token, T(r.id));
  assert.equal('relation_id' in res.distributed[0], false);

  // 本人：石榴籽碎片 +1、竹片 +1 片（**且不因池多拿一分**）
  const mine = await L.getAssets(trigger);
  assert.equal(mine.fragments, 1, '触发者本人碎片 +1');
  assert.equal(L.sumLots(mine.bamboos), 1, '触发者本人竹片 +1 片');
  assert.equal(L.sumLots(mine.scrolls), 0, '触发者不得参与池分配（无兰帖残页入账）');
  assert.equal(mine.scroll_fragments, 0, '触发者不得参与池分配');
  const baseTx = mine.txs.find((t) => t.type === 'reward' && t.ref?.scope === 'base');
  assert.ok(baseTx, '基础奖励必须写 reward 流水');
  assert.deepEqual(baseTx.delta, { fragments: 1, bamboos: 1, scroll_fragments: 0 });
  assert.deepEqual(baseTx.ref, { source: 'friend_reward', scope: 'base', trigger_masked: OPS.maskPhone(trigger) });

  // 好友：池入账 + 池流水 ref 六键逐字（含 denominator / pool_total / remainder）
  const other = await L.getAssets(r.b);
  const poolTx = other.txs.find((t) => t.type === 'reward' && t.ref?.scope === 'pool');
  assert.ok(poolTx, '池分发必须写 reward 流水');
  assert.equal(poolTx.type, 'reward', 'F-C⑥：type 取既有枚举 reward，不新增枚举');
  assert.ok(L.TX_TYPES.includes(poolTx.type), 'reward 必须在 ledger 的 TX_TYPES 白名单内');
  assert.deepEqual(Object.keys(poolTx.ref).sort(), [
    'denominator',
    'pool_total',
    'relation_id',
    'remainder',
    'scope',
    'source',
    'trigger_masked',
  ]);
  assert.equal(poolTx.ref.scope, 'pool');
  assert.equal(poolTx.ref.source, L.SOURCE_FRIEND_REWARD);
  assert.equal(poolTx.ref.relation_id, r.id, '账本存储审计仍用关系 _id（非出参）');
  assert.equal(poolTx.ref.trigger_masked, OPS.maskPhone(trigger));
  assert.equal(poolTx.ref.denominator, 1);
  assert.deepEqual(poolTx.ref.pool_total, { seed_fragments: 1, bamboo_pieces: 0, scroll_fragments: 1 });
  assert.deepEqual(poolTx.ref.remainder, { seed_fragments: 0, bamboo_pieces: 0, scroll_fragments: 0 });
  assert.deepEqual(poolTx.delta, { fragments: 1, bamboos: 0, scroll_fragments: 1 });
  assert.equal(other.fragments, 1);
  assert.equal(other.scroll_fragments, 1);
  // 所有落账类型都在既有枚举内（不新增枚举）
  for (const t of [...mine.txs, ...other.txs]) assert.ok(L.TX_TYPES.includes(t.type), `非法流水类型 ${t.type}`);
});

// ══ ⑤ F-C③ 分母 0 ⇒ 不建池、无池流水（本人基础奖励照发）+ 正对照 ═══════════════
test('F-C③ 分母 0 ⇒ 不建池、不写任何池流水（本人基础奖励仍发，正对照：分母 ≥ 1 建池）', async () => {
  const T0 = '2026-06-01T00:00:00.000Z';
  const lone = '13920000001'; // 无任何好友
  const before = JSON.stringify(readFriends());
  const res = ok(
    await OPS.distributeFriendRewards(
      lone,
      { base: { seed_fragments: 1, bamboo_pieces: 1 }, pool: { seed_fragments: 1, scroll_fragments: 1 } },
      T0,
    ),
    '分母 0 分发',
  );
  noPlainPhone(res, '分母 0 分发');
  assert.equal(res.denominator, 0);
  assert.equal(res.recipients, 0);
  assert.equal(res.pooled, false, '分母 0 ⇒ 不建池');
  assert.deepEqual(res.distributed, []);
  assert.deepEqual(res.remainder, { seed_fragments: 1, bamboo_pieces: 0, scroll_fragments: 1 }, '池总量全额销毁');
  const mine = await L.getAssets(lone);
  assert.equal(mine.fragments, 1, '本人基础奖励照发（正对照）');
  assert.equal(L.sumLots(mine.bamboos), 1, '本人基础奖励照发');
  assert.equal(mine.txs.filter((t) => t.ref?.scope === 'pool').length, 0, '分母 0 ⇒ 零池流水');
  assert.equal(mine.txs.filter((t) => t.type === 'reward').length, 1, '只应有基础奖励那一条');
  assert.equal(JSON.stringify(readFriends()), before, '无好友 ⇒ 关系集合零写入');

  // 正对照：同一调用方在分母 ≥ 1 时**建池**并写池流水
  const r = await activeRelation(T0);
  const res2 = ok(
    await OPS.distributeFriendRewards(
      r.a,
      { base: { seed_fragments: 1, bamboo_pieces: 1 }, pool: { seed_fragments: 1, scroll_fragments: 1 } },
      T0,
    ),
    '分母 1 分发',
  );
  assert.equal(res2.denominator, 1);
  assert.equal(res2.pooled, true, '分母 ≥ 1 ⇒ 建池');
  assert.equal(res2.distributed.length, 1);
  assert.equal((await txsOf(r.b)).filter((t) => t.ref?.scope === 'pool').length, 1, '收件人必须有一条池流水');
});

// ══ ⑥ F-C② 3 个生效好友 + 池 1 碎片 ⇒ 每人 0、余数销毁 ═════════════════════════
test('F-C② 3 个生效好友 + 池 1 碎片 ⇒ 每人 0、余数销毁（零头仍落 delta 全 0 的审计条）', async () => {
  const T0 = '2026-07-01T00:00:00.000Z';
  const [a, b, c, d] = ['13930000001', '13930000002', '13930000003', '13930000004'];
  for (const p of [b, c, d]) {
    await F.createInvite(a, p, { now: T0 });
    await F.acceptInvite(rid(a, p), p, { now: T0 });
  }
  const res = ok(await OPS.distributeFriendRewards(a, { base: {}, pool: { seed_fragments: 1 } }, T0), '均分');
  assert.equal(res.denominator, 3);
  assert.equal(res.recipients, 3);
  assert.equal(res.pooled, true, '分母 > 0 ⇒ 建池');
  assert.deepEqual(res.pool_per_friend, { seed_fragments: 0, bamboo_pieces: 0, scroll_fragments: 0 }, 'floor(1/3) = 0');
  assert.deepEqual(res.remainder, { seed_fragments: 1, bamboo_pieces: 0, scroll_fragments: 0 }, '余数销毁');
  assert.deepEqual(res.distributed.map((x) => x.phone_masked).sort(), ['139****0002', '139****0003', '139****0004']);
  noPlainPhone(res, '均分');
  for (const p of [b, c, d]) {
    assert.equal(await fragsOf(p), 0, '每人 0 ⇒ 账上零变化');
    const pool = (await txsOf(p)).filter((t) => t.ref?.scope === 'pool');
    assert.equal(pool.length, 1, '零头也落一条可审计流水（照 ledger 的 jade_mount 零 delta 记账体例）');
    assert.deepEqual(pool[0].delta, { fragments: 0, bamboos: 0, scroll_fragments: 0 });
    assert.equal(pool[0].ref.denominator, 3);
    assert.deepEqual(pool[0].ref.remainder, { seed_fragments: 1, bamboo_pieces: 0, scroll_fragments: 0 });
  }
  // 余数不结转：再来一次仍按 3 人均分（销毁的 1 片不会积累）
  const res2 = ok(await OPS.distributeFriendRewards(a, { base: {}, pool: { seed_fragments: 1 } }, T0), '再均分');
  assert.deepEqual(res2.pool_per_friend, { seed_fragments: 0, bamboo_pieces: 0, scroll_fragments: 0 });
  assert.deepEqual(res2.remainder, { seed_fragments: 1, bamboo_pieces: 0, scroll_fragments: 0 });
});

// ══ ⑦ F-C⑤ 分母不含缓冲期 / 待邀请 / 已到期 active ═════════════════════════════
test('F-C⑤ 分母只算生效中：缓冲期 / 待邀请 / 已到期未 sweep 的 active 一律不计（唯一口径 isActiveAt）', async () => {
  const NOW = '2027-06-01T00:00:00.000Z';
  const [a, live, grace] = ['13940000001', '13940000002', '13940000003'];
  // ① 生效中：T0 = NOW（expires = NOW + 365）
  await F.createInvite(a, live, { now: NOW });
  await F.acceptInvite(rid(a, live), live, { now: NOW });
  // ② 缓冲期：T0 = NOW − 400 天 ⇒ 已过期（listRelations 会 sweep 成 grace）
  const T0old = at(NOW, -400);
  await F.createInvite(a, grace, { now: T0old });
  await F.acceptInvite(rid(a, grace), grace, { now: T0old });
  assert.equal(relDoc(rid(a, grace)).status, 'active', '磁盘上仍是 active（未 sweep）');
  // ③ 待邀请：刚发出、7 天内
  const pendingPhone = '13940000004';
  await F.createInvite(a, pendingPhone, { now: at(NOW, -1) });

  const res = ok(await OPS.distributeFriendRewards(a, { base: {}, pool: { seed_fragments: 3 } }, NOW), '分母过滤');
  assert.equal(res.denominator, 1, '分母只含 1 个生效中好友');
  assert.deepEqual(res.distributed.map((x) => x.phone_masked), ['139****0002']);
  assert.equal(await fragsOf(live), 3, '3 片全给唯一生效好友');
  assert.equal(await fragsOf(grace), 0, '缓冲期不计入分母、不得分发');
  assert.equal(await fragsOf(pendingPhone), 0, '待邀请不计入分母、不得分发');
  assert.equal((await txsOf(grace)).length, 0);
  assert.equal((await txsOf(pendingPhone)).length, 0);
  // 唯一口径 = friends.js 的 isActiveAt（直接对照）
  const rels = await F.listRelations(a, { now: NOW });
  assert.equal(rels.filter((r) => F.isActiveAt(r, NOW)).length, 1);
  assert.equal(rels.length, 3);
});

// ══ ⑧ F-C④ 好友收到的碎片不再触发新的池分发（正 / 反向） ═══════════════════════
test('F-C④ 分发路径不调用任何活动触发逻辑：好友收到的碎片不再触发新的池分发（正/反向各一）', async () => {
  const T0 = '2026-08-01T00:00:00.000Z';
  const [a, b, c] = ['13950000001', '13950000002', '13950000003'];
  await F.createInvite(a, b, { now: T0 });
  await F.acceptInvite(rid(a, b), b, { now: T0 });
  await F.createInvite(b, c, { now: T0 });
  await F.acceptInvite(rid(b, c), c, { now: T0 });

  // 正向：A 分发 ⇒ 只有 B 收；B 是 C 的好友，但 C **零变化**（收到碎片不触发连环分发）
  ok(await OPS.distributeFriendRewards(a, { base: {}, pool: { seed_fragments: 9 } }, T0), 'A→B');
  assert.equal(await fragsOf(b), 9);
  assert.equal((await txsOf(b)).filter((t) => t.ref?.scope === 'pool').length, 1, 'B 只收到 1 条池流水（无连环）');
  assert.equal(await fragsOf(c), 0, 'C 不得因 B 收到碎片而被分发');
  assert.equal((await txsOf(c)).length, 0, 'C 无任何流水');
  assert.equal((await txsOf(b)).filter((t) => t.ref?.relation_id === rid(b, c)).length, 0, 'B 账上无指向 C 的分发流水');

  // 反向：分发必须由**显式触发**（以 B 为触发者）才发生 —— 碎片本身不触发
  assert.equal(await fragsOf(c), 0, '显式触发前 C 仍为 0');
  const res = ok(await OPS.distributeFriendRewards(b, { base: {}, pool: { seed_fragments: 2 } }, T0), 'B→C');
  assert.equal(res.denominator, 2, 'B 的生效中好友 = A 与 C（各 1 片）');
  assert.equal(await fragsOf(c), 1, '只有显式触发才分发（C 得 1 片）');

  // 源码判据：分发路径不引用任何活动/奖励触发逻辑，也无定时器
  assert.equal(/grantAssets|triggerReward|triggerActivity|checkIn|signin\(/.test(SRC), false, '分发路径不得调用活动触发逻辑');
  assert.equal(/setTimeout|setInterval|cron|schedule/.test(SRC), false, 'F-D：不得注册任何定时任务');
});

// ══ ⑨ F-B 锁定：不足拒 / 记锁不扣 / 不可二次发起 ════════════════════════════════
test('F-B 续约锁定：不足 1 枚拒（SCROLL_INSUFFICIENT）；通过则 pending 记锁且资产未扣；锁定后不可二次发起', async () => {
  const T0 = '2026-09-01T00:00:00.000Z';
  const r = await activeRelation(T0);
  const w = at(r.expires, -3); // 续约窗口内
  // ① 发起方零兰帖 ⇒ 拒（SCROLL_INSUFFICIENT），关系与资产零写入
  const relBefore = JSON.stringify(relDoc(r.id));
  const bad = await OPS.requestRenewal(r.token, r.a, w);
  failsWith(bad, 'SCROLL_INSUFFICIENT', '无兰帖发起续约');
  assert.equal(JSON.stringify(relDoc(r.id)), relBefore, '资产不足 ⇒ 关系零写入');
  assert.equal(await pieces(r.a), 0, '资产零变化');
  // ② 只有 99 片（不足 1 枚 = 100 片）⇒ 仍拒
  await L.withAssets(r.a, (user) => L.addScrollFragments(user, 99, T0));
  failsWith(await OPS.requestRenewal(r.token, r.a, w), 'SCROLL_INSUFFICIENT', '99 片不足 1 枚');
  // ③ 补足 1 枚 ⇒ 通过：pending 记锁（九字段）+ 资产**未扣除**
  await giveScrolls(r.a, 1, T0);
  const lotId = (await scrollsOf(r.a)).find((l) => l.qty > 0).id;
  const req = ok(await OPS.requestRenewal(r.token, r.a, w), 'requestRenewal');
  assert.equal(req.locked.by_masked, OPS.maskPhone(r.a), '裁定 3：锁视图只出脱敏号');
  assert.equal(req.locked.by_me, true);
  assert.equal('by' in req.locked, false, '裁定 3：锁视图不得出明文手机号字段');
  assert.equal(req.locked.pieces, 1, 'LOCKED_PIECES = 1');
  assert.equal(req.locked.lot_id, lotId, 'lot_id = 被锁定的那一批实号');
  assert.equal(req.locked.at, w);
  noPlainPhone(req, 'requestRenewal');
  const doc = relDoc(r.id);
  assert.equal(doc.pending.kind, 'renew');
  assert.equal(doc.pending.locked_by, r.a);
  assert.equal(doc.pending.locked_pieces, 1);
  assert.equal(doc.pending.locked_lot_id, lotId);
  assert.equal(doc.pending.locked_at, w);
  assert.equal(await pieces(r.a), 100, '锁定**不扣除**（资产仍 100 片）');
  assert.equal((await txsOf(r.a)).filter((t) => t.type === 'reward' && t.ref?.scope === 'base').length, 0);
  // ④ 锁定后不可二次发起（结构化拒绝 + 关系零写入）
  const snapshot = JSON.stringify(relDoc(r.id));
  failsWith(await OPS.requestRenewal(r.token, r.a, w), 'RENEW_ALREADY_PENDING', '二次发起');
  // 校验顺序（报告已登记）：① 入参 ② 资产（先于关系）③ 关系状态 ⇒ 对端需先自持 1 枚才会走到关系层拒绝
  await giveScrolls(r.b, 1, w);
  failsWith(await OPS.requestRenewal(r.token, r.b, w), 'RENEW_ALREADY_PENDING', '对端发起也被已有申请拦下');
  assert.equal(JSON.stringify(relDoc(r.id)), snapshot, '拒绝 ⇒ 零写入');
  // ⑤ 列表出参把锁投影成「谁锁的 + 片数」，且不出对端明文手机号
  const listA = ok(await OPS.listFriends(r.a, w), 'list');
  assert.equal(listA.friends[0].pending.kind, 'renew');
  assert.equal(listA.friends[0].pending.initiated_by_me, true);
  assert.deepEqual(listA.friends[0].pending.locked, { pieces: 1, at: w, by_me: true });
  const listB = ok(await OPS.listFriends(r.b, w), 'list');
  assert.deepEqual(listB.friends[0].pending.locked, { pieces: 1, at: w, by_me: false });
  assert.equal(listB.friends[0].pending.initiated_by_me, false);
  noPlainPhone(listA, 'listFriends(发起方)');
  noPlainPhone(listB, 'listFriends(对端)');
  // 裁定 3：对端投影里连「明文手机号子串」都不得出现（token 由 hash 派生，不含手机号）
  assert.equal(JSON.stringify(listB.friends[0].friend).includes(r.a), false, 'friend 投影里不得有对端明文手机号');
  assert.equal(listB.friends[0].friend.phone_masked, OPS.maskPhone(r.a));
  assert.equal(listB.friends[0].relation_token, r.token);
  // 裁定 3 反查：token ⇒ 关系 _id（零新增存储）
  assert.equal(await OPS.resolveRelationToken(r.token), r.id);
});

// ══ ⑩ F-B 超时失效 / 拒绝 / 撤回 ⇒ 解锁且零流水 ═════════════════════════════════
test('F-B 超时失效 ⇒ 锁解除、零流水、可重新发起；对方拒绝 / 发起方撤回 ⇒ 解锁且零流水', async () => {
  const T0 = '2026-10-01T00:00:00.000Z';
  const r = await activeRelation(T0);
  await giveScrolls(r.a, 1, T0);
  // 锁定的超时线（w + 7 天）必须落在关系到期之前，才能验证「超时解锁但关系仍生效」
  const w = at(r.expires, -25);
  ok(await OPS.requestRenewal(r.token, r.a, w), 'requestRenewal');
  const txsBefore = (await txsOf(r.a)).length;
  // ① 超 7 天未确认（sweepFriends 惰性推进）⇒ pending 清空 = 解锁、expires_at 不动、零流水
  const sweepAt = at(w, 8);
  const sw = ok(await OPS.sweepFriends(sweepAt), 'sweepFriends');
  assert.ok(sw.changed_count >= 1, '必须有关系发生迁移并落盘');
  const doc = relDoc(r.id);
  assert.equal(doc.pending, null, '超时 ⇒ pending 清空（锁定随 pending 解除）');
  assert.equal(doc.expires_at, r.expires, '超时不得改 expires_at');
  assert.equal(doc.renewals, 0, '未确认不得计续约');
  assert.equal((await txsOf(r.a)).length, txsBefore, '解锁零流水');
  assert.equal(await pieces(r.a), 100, '锁定的那枚仍属用户（只解除占用）');
  // ② 解锁后可重新发起；随后由**对方拒绝** ⇒ unlocked、无 deduct、零流水
  ok(await OPS.requestRenewal(r.token, r.a, sweepAt), '重新发起');
  const txs2 = (await txsOf(r.a)).length;
  const rej = ok(await OPS.cancelRenewal(r.token, r.b, sweepAt), '对方拒绝');
  assert.equal(rej.unlocked.by_masked, OPS.maskPhone(r.a));
  assert.equal(rej.unlocked.pieces, 1);
  assert.equal(rej.unlocked.lot_id !== '', true);
  assert.equal(rej.reason, 'renew_rejected', '对方拒绝的 reason 逐字');
  assert.equal(rej.relation.pending, null);
  assert.equal(rej.relation.expires_at, r.expires, '拒绝不得改 expires_at');
  assert.equal(rej.deduct, undefined, '拒绝不得返回 deduct');
  assert.equal((await txsOf(r.a)).length, txs2, '拒绝 ⇒ 零流水');
  assert.equal(await pieces(r.a), 100, '拒绝 ⇒ 不扣减');
  assert.equal(relDoc(r.id).renewals, 0);
  noPlainPhone(rej, 'cancelRenewal(拒绝)');
  // ③ 发起方撤回 ⇒ reason = renew_cancelled、零流水
  ok(await OPS.requestRenewal(r.token, r.a, sweepAt), '三次发起');
  const txs3 = (await txsOf(r.a)).length;
  const can = ok(await OPS.cancelRenewal(r.token, r.a, sweepAt), '发起方撤回');
  assert.equal(can.reason, 'renew_cancelled');
  assert.equal(can.unlocked.by_masked, OPS.maskPhone(r.a));
  assert.equal((await txsOf(r.a)).length, txs3, '撤回 ⇒ 零流水');
  assert.equal(await pieces(r.a), 100);
  // ④ 无申请时的取消 ⇒ 结构化拒绝
  failsWith(await OPS.cancelRenewal(r.token, r.a, sweepAt), 'FRIEND_STATE_INVALID', '无申请可取消');
});

// ══ ⑪ F-B 确认 ⇒ 双边各扣 1 枚（读回资产验证） ══════════════════════════════════
test('F-B 确认 ⇒ 双边各扣 1 枚（发起方扣的正是锁定那一批）；任一方不足 ⇒ 拒且零扣减、锁定保留', async () => {
  const T0 = '2026-11-01T00:00:00.000Z';
  const r = await activeRelation(T0);
  await giveScrolls(r.a, 2, T0); // 发起方 2 枚（锁定取第一个 qty>0 的批次）
  await giveScrolls(r.b, 1, T0); // 确认方 1 枚
  const w = at(r.expires, -2);
  const req = ok(await OPS.requestRenewal(r.token, r.a, w), 'requestRenewal');
  assert.equal(await pieces(r.a), 200, '锁定不扣除');
  assert.equal(req.locked.lot_id, (await scrollsOf(r.a)).find((l) => l.qty > 0).id);

  // ① 确认方不足（花掉自己的那枚）⇒ 双边预检拦下：零扣减、锁定保留
  const bLot = (await scrollsOf(r.b)).find((l) => l.qty > 0).id;
  await L.withAssets(r.b, (user) => L.chargeLots(user.scrolls, 100, 'scroll'));
  failsWith(await OPS.confirmRenewal(r.token, r.b, w), 'SCROLL_INSUFFICIENT', '确认方不足');
  assert.equal(await pieces(r.a), 200, '预检失败 ⇒ 发起方一颗粒未扣');
  assert.equal(await pieces(r.b), 0);
  assert.equal(relDoc(r.id).pending.locked_lot_id, req.locked.lot_id, '预检失败 ⇒ 锁定保留');
  assert.equal(relDoc(r.id).renewals, 0);

  // ② 补足 ⇒ 确认成功：发起方扣**锁定那一批**、确认方扣自己的那枚
  await giveScrolls(r.b, 1, T0);
  const conf = ok(await OPS.confirmRenewal(r.token, r.b, w), 'confirmRenewal');
  noPlainPhone(conf, 'confirmRenewal');
  assert.equal(conf.deduct.amount_each, 1);
  assert.equal(conf.deduct.locked.pieces, req.locked.pieces);
  assert.equal(conf.deduct.locked.lot_id, req.locked.lot_id);
  assert.equal(conf.deduct.locked.at, req.locked.at);
  assert.equal(conf.deduct.locked.by_masked, OPS.maskPhone(r.a), '裁定 3：只出锁定方脱敏号');
  assert.equal(conf.deduct.locked.by_me, false, '确认方视角：锁定方不是本人');
  assert.equal(conf.deduct.phones_masked.length, 2);
  assert.deepEqual(conf.charged.map((c) => c.role), ['initiator', 'confirmer']);
  assert.deepEqual(conf.charged.map((c) => c.pieces), [100, 100]);
  assert.equal(conf.charged[0].taken[0].id, req.locked.lot_id, '发起方扣的正是锁定那一批');
  assert.equal(conf.charged[0].taken[0].qty, 100);
  // 读回资产：双边各扣 1 枚（各 100 片）；发起方 2 枚 → 1 枚、确认方 1 枚 → 0 枚
  assert.equal(await pieces(r.a), 100, '发起方 200 → 100 片');
  assert.equal(await pieces(r.b), 0, '确认方 100 → 0 片');
  assert.equal((await scrollsOf(r.a)).find((l) => l.id === req.locked.lot_id).qty, 0, '被锁定那一批已扣至 0');
  assert.equal((await scrollsOf(r.b)).find((l) => l.id === bLot).qty, 0, '确认方那批已扣至 0');
  // 关系侧：renewals / reward_months +1、expires_at 按 T0 锚点 +30 天、锁随 pending 释放
  const doc = relDoc(r.id);
  assert.equal(doc.renewals, 1);
  assert.equal(doc.reward_months, 1);
  assert.equal(doc.pending, null);
  assert.equal(doc.expires_at, at(r.T0, 395), 'T0 + 365 + 30 天');
  // ③ 扣减**留痕**（裁定 1，见 ⑲ 的逐字形状）；成功路径不得出现冲正流水（裁定 2 只用于失败补偿）
  assert.equal((await txsByType(r.a, 'scroll_consume')).length, 1, '发起方 1 条 scroll_consume');
  assert.equal((await txsByType(r.b, 'scroll_consume')).length, 1, '确认方 1 条 scroll_consume');
  assert.equal((await txsByType(r.a, 'fee_refund')).length, 0, '成功路径零冲正');
  assert.equal((await txsByType(r.b, 'fee_refund')).length, 0);
  assert.equal(await scrollFragsOf(r.a), 0, '扣减不得返还碎片');
  assert.equal((await txsOf(r.a)).filter((t) => t.type === 'reward').length, 0, '续约不得冒充奖励流水');
  // ④ 申请已被消费 ⇒ 再确认 ⇒ 结构化拒绝（校验顺序：资产预检在前 ⇒ 先补足确认方兰帖）
  await giveScrolls(r.b, 1, w);
  failsWith(await OPS.confirmRenewal(r.token, r.b, w), 'FRIEND_STATE_INVALID', '无申请可确认');
});

// ══ ⑫ v4① 到期天数三算例：365 / 395 / 725 ══════════════════════════════════════
test('v4① 到期算例：0 / 1 / 12 次续约 = 365 / 395 / 725 天（T0 锚点）', async () => {
  const T0 = '2026-01-31T00:00:00.000Z';
  // ① 0 次续约 = 365 天
  const r0 = await activeRelation(T0);
  assert.equal(relDoc(r0.id).expires_at, at(T0, 365));
  assert.equal(relDoc(r0.id).expires_at, '2027-01-31T00:00:00.000Z');
  // ② 1 次续约 = 395 天
  const r1 = await activeRelation(T0);
  await giveScrolls(r1.a, 1, T0);
  await giveScrolls(r1.b, 1, T0);
  const w1 = at(r1.expires, -1);
  ok(await OPS.requestRenewal(r1.token, r1.a, w1), '1 次续约发起');
  ok(await OPS.confirmRenewal(r1.token, r1.b, w1), '1 次续约确认');
  assert.equal(relDoc(r1.id).expires_at, at(T0, 395));
  assert.equal(relDoc(r1.id).expires_at, '2027-03-02T00:00:00.000Z');
  assert.equal(await pieces(r1.a), 0);
  assert.equal(await pieces(r1.b), 0);
  // ③ 12 次连续续约 = 725 天（每轮双边各消耗 1 枚）
  const r12 = await activeRelation(T0);
  for (let i = 1; i <= 12; i += 1) {
    const expires = relDoc(r12.id).expires_at;
    const w = at(expires, -1); // 窗口内
    await giveScrolls(r12.a, 1, w);
    await giveScrolls(r12.b, 1, w);
    ok(await OPS.requestRenewal(r12.token, r12.a, w), `第 ${i} 次发起`);
    ok(await OPS.confirmRenewal(r12.token, r12.b, w), `第 ${i} 次确认`);
    assert.equal(relDoc(r12.id).reward_months, i);
    assert.equal(relDoc(r12.id).renewals, i);
    assert.equal(relDoc(r12.id).expires_at, at(T0, 365 + 30 * i), `第 ${i} 次到期 = T0 + ${365 + 30 * i} 天`);
    assert.equal(await pieces(r12.a), 0, '每轮双边各扣 1 枚');
    assert.equal(await pieces(r12.b), 0);
  }
  assert.equal(relDoc(r12.id).expires_at, at(T0, 725));
  assert.equal(relDoc(r12.id).expires_at, '2028-01-26T00:00:00.000Z');
  // 裁定 1 一致性：12 轮 × 双边 = 各 12 条 scroll_consume
  assert.equal((await txsByType(r12.a, 'scroll_consume')).length, 12);
  assert.equal((await txsByType(r12.b, 'scroll_consume')).length, 12);
});

// ══ ⑬ 终态后不得复活 ════════════════════════════════════════════════════════════
test('v4③ 终态后不得复活：解除后 confirm / accept / 续约 / 再 sweep 一律拒且状态不变', async () => {
  const T0 = '2026-12-01T00:00:00.000Z';
  const r = await activeRelation(T0);
  await giveScrolls(r.a, 1, T0);
  await giveScrolls(r.b, 1, T0);
  const dis = ok(await OPS.dissolveFriend(r.token, r.a, at(T0, 30)), 'dissolveFriend');
  assert.equal(dis.relation.status, 'dissolved');
  assert.equal(dis.relation.pending, null, '解除清空 pending（锁定一并解除）');
  assert.equal('_id' in dis.relation, false, '裁定 3：出参关系文档不得含 _id（内嵌明文手机号）');
  assert.equal(dis.relation.relation_token, r.token);
  noPlainPhone(dis, 'dissolveFriend');
  const after = JSON.stringify(relDoc(r.id));
  // 解除后：接受邀请 / 发起续约 / 确认续约 / 拒绝 / 取消 全部拒绝
  failsWith(await OPS.acceptFriendInvite(r.token, r.b, at(T0, 31)), 'FRIEND_STATE_INVALID', '接受已解除');
  failsWith(await OPS.requestRenewal(r.token, r.a, at(T0, 31)), 'FRIEND_STATE_INVALID', '续约已解除');
  failsWith(await OPS.confirmRenewal(r.token, r.b, at(T0, 31)), 'FRIEND_STATE_INVALID', '确认已解除');
  failsWith(await OPS.rejectFriendInvite(r.token, r.b, at(T0, 31)), 'FRIEND_STATE_INVALID', '拒绝已解除');
  failsWith(await OPS.cancelFriendInvite(r.token, r.b, at(T0, 31)), 'FRIEND_STATE_INVALID', '撤回已解除');
  failsWith(await OPS.dissolveFriend(r.token, r.a, at(T0, 31)), 'FRIEND_STATE_INVALID', '重复解除');
  assert.equal(JSON.stringify(relDoc(r.id)), after, '终态后任何拒绝都不得写入');
  // 再 sweep（远期）也不复活
  const sw = ok(await OPS.sweepFriends(at(T0, 3650)), '远期 sweep');
  const still = relDoc(r.id);
  assert.equal(still.status, 'dissolved');
  assert.equal(still.pending, null);
  assert.equal(
    sw.changed.every((c) => relDoc(c.relation_id).status !== 'active' && c.status !== 'active'),
    true,
    '终态链不可逆：任何被 sweep 到的关系都不得回到 active',
  );
  assert.equal(await pieces(r.a), 100, '解除不返还已锁定道具（F-6：不返还）');

  // 已被邀请人拒绝的邀请同样是终态
  const [x, y] = pair();
  await F.createInvite(x, y, { now: T0 });
  ok(await OPS.rejectFriendInvite(T(rid(x, y)), y, T0), 'rejectFriendInvite');
  assert.equal(relDoc(rid(x, y)).status, 'dissolved');
  failsWith(await OPS.acceptFriendInvite(T(rid(x, y)), y, at(T0, 400)), 'FRIEND_STATE_INVALID', '被拒后接受');
});

// ══ ⑭ F-D sweepFriends 惰性落盘 ═════════════════════════════════════════════════
test('F-D sweepFriends：全量关系惰性推进并**仅落变更**（版本 +1），且不注册定时任务', async () => {
  const T0 = '2026-02-01T00:00:00.000Z';
  const live = await activeRelation(at(T0, 600)); // 到期 = T0+965，晚于本用例所有 sweep 时刻 ⇒ 未到期（不得落盘）
  const dead = await activeRelation(T0); // 到期 → 缓冲 → 解除
  const pend = pair();
  await F.createInvite(pend[0], pend[1], { now: T0 }); // 待邀请超时
  const vLive = relDoc(live.id).version;

  const sw = ok(await OPS.sweepFriends(at(T0, 400)), 'sweep 1');
  const ids = sw.changed.map((c) => c.relation_id);
  assert.equal(ids.includes(live.id), false, '未到期关系不得落盘');
  assert.equal(relDoc(live.id).version, vLive, '未迁移 ⇒ version 不变');
  assert.equal(relDoc(dead.id).status, 'grace', '到期 → 缓冲（一步）');
  assert.equal(relDoc(dead.id).grace_until, at(relDoc(dead.id).expires_at, 30));
  assert.equal(relDoc(pend.join(':')).status, 'dissolved', '待邀请超 7 天 ⇒ dissolved');
  assert.equal(relDoc(pend.join(':')).reason, 'invite_timeout');
  assert.ok(relDoc(dead.id).version > 1, '迁移必须落盘并 +1 version');
  // 第二次 sweep 把缓冲期满的推向终态
  const sw2 = ok(await OPS.sweepFriends(at(T0, 400 + 400)), 'sweep 2');
  assert.equal(relDoc(dead.id).status, 'dissolved');
  assert.equal(relDoc(dead.id).reason, 'grace_expired');
  assert.ok(sw2.changed_count >= 1);
  // 无迁移 ⇒ 零写入（按关系逐一验证：终态链不可逆 + 未到期不动 ⇒ 该关系的文档一字不改）
  const docLive = JSON.stringify(relDoc(live.id));
  const docDead = JSON.stringify(relDoc(dead.id));
  ok(await OPS.sweepFriends(at(T0, 400 + 400)), 'sweep 3');
  assert.equal(JSON.stringify(relDoc(live.id)), docLive, '未到期 ⇒ 零写入');
  assert.equal(JSON.stringify(relDoc(dead.id)), docDead, '终态（dissolved）再 sweep 也不得写入');
});

// ══ ⑮ F-A 不自写第二版记账（源码判据） ═══════════════════════════════════════════
test('F-A 只做编排：资产只经 ledger 的 withAssets/导出读写（无资产集合字面、无第二套记账）', async () => {
  assert.equal(SRC.includes('jiazu_assets'), false, '不得出现资产集合字面');
  assert.equal(/ASSETS_COL|ASSETS_ID|mutateAssets/.test(SRC), false, '不得直接引用资产集合常量');
  assert.equal(SRC.includes("from './economy-ledger.js'"), true, '必须从账本域导入');
  for (const fn of ['withAssets', 'chargeLots', 'addFragments', 'addScrollFragments', 'addLot', 'recordTx', 'sumLots']) {
    assert.ok(SRC.includes(fn), `必须复用 ledger 的 ${fn}`);
  }
  assert.equal(SRC.includes("from './friends.js'"), true, '关系状态必须复用 friends.js');
  assert.equal(SRC.includes("from './economy-ops.js'"), true, '通知必须复用站内信域（economy-ops 的 withMessages）');
  assert.equal(SRC.includes('withMessages('), true);
  assert.equal(SRC.includes('while ('), false, '不得出现 while 重读自身式循环（照 ledger 的判据 C 纪律）');
  // 关系集合的**唯一**直接落盘点 = 私有 writeRelationDoc（sweepFriends 全量迁移 + 裁定 2 补偿审计共用）
  const directColSets = SRC.split('colSet(').length - 1;
  assert.equal(directColSets, 1, 'colSet 只允许出现一次（唯一私有落盘点 writeRelationDoc）');
  assert.ok(SRC.includes('async function writeRelationDoc'), '关系文档落盘必须集中在 writeRelationDoc');
  assert.equal(SRC.includes('colAll('), true, 'sweepFriends / 句柄反查 需要全量遍历');
});

// ══ ⑯ 注册数 34 与磁盘一致 ══════════════════════════════════════════════════════
// ⚠️ 本判据的基线必须跟随**磁盘真值**：上一单新增第 34 个测试文件（task-center.test.js）后，
//    此处残留的旧基线 33 变成假红。基线口径 = 「package.json 注册数 = 磁盘 *.test.js 数 = 定额」，
//    仍为**精确等值 + 双向零缺口 + 去重**（不放宽、不删除任何断言），只把定额改成实得真值 34。
test('package.json 注册数 = 磁盘 *.test.js 数 = 34，且双向零缺口', async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  const registered = pkg.scripts.test
    .split(/\s+/)
    .filter((x) => x.endsWith('.test.js'))
    .map((x) => path.basename(x));
  const onDisk = fs.readdirSync(HERE).filter((f) => f.endsWith('.test.js')).sort();
  assert.equal(registered.length, 34, `注册数应为 34，实得 ${registered.length}`);
  assert.equal(onDisk.length, 34, `磁盘 *.test.js 应为 34，实得 ${onDisk.length}`);
  assert.equal(new Set(registered).size, registered.length, '注册项不得重复');
  const missingOnDisk = registered.filter((f) => !onDisk.includes(f));
  const unregistered = onDisk.filter((f) => !registered.includes(f));
  assert.deepEqual(missingOnDisk, [], `已注册但磁盘缺失：${missingOnDisk.join(', ')}`);
  assert.deepEqual(unregistered, [], `磁盘存在但未注册：${unregistered.join(', ')}`);
  assert.ok(registered.includes('friend-ops.test.js'), 'friend-ops.test.js 必须已注册');
});

// ══ ⑰ 真源零写入 ════════════════════════════════════════════════════════════════
test('真源零写入：config/tree-meta.json 与 migrate-output/ 全量 md5 与开工基线逐字节一致', async () => {
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 被改动');
  const nowTrees = dirBaseline(REAL_TREES);
  const nowDetails = dirBaseline(REAL_DETAILS);
  const nowCols = dirBaseline(REAL_COLLECTIONS);
  assert.deepEqual([...nowTrees.keys()].sort(), [...realTreeBaseline.keys()].sort(), 'trees 文件集变化');
  for (const [f, h] of realTreeBaseline) assert.equal(nowTrees.get(f), h, `trees/${f} 内容变化`);
  assert.deepEqual([...nowDetails.keys()].sort(), [...realDetailBaseline.keys()].sort(), 'details 文件集变化');
  for (const [f, h] of realDetailBaseline) assert.equal(nowDetails.get(f), h, `details/${f} 内容变化`);
  assert.deepEqual([...nowCols.keys()].sort(), [...realColBaseline.keys()].sort(), 'collections 文件集变化');
  for (const [f, h] of realColBaseline) assert.equal(nowCols.get(f), h, `collections/${f} 内容变化`);
  const fp = realSourceFingerprint();
  assert.equal(fp.count, 342, `真源文件数应为 342，实得 ${fp.count}`);
  assert.equal(fp.digest, REAL_FP.digest, '真源全量指纹变化');
  assert.equal(REAL_FP.count, 342);
  // 沙箱自证：本测试全程只写 /tmp 副本
  assert.ok(TMP.startsWith(os.tmpdir()), '测试根必须是 /tmp 副本');
  assert.equal(store.PATHS.out, TMP);
  assert.equal(store.PATHS.metaFile, path.join(TMP, 'tree-meta.json'));
  assert.equal(store.PATHS.sandbox, true, '必须处于沙箱模式');
});

// ══ ⑱ 裁定 3：relation_token 不透明化（全出参无明文手机号） ════════════════════════
test('裁定 3 relation_token：全程只出不透明句柄（fr_ + 16 hex），全部路由面出参零明文手机号', async () => {
  const T0 = '2028-01-01T00:00:00.000Z';
  const [a, b, c] = ['13980000001', '13980000002', '13980000003'];
  await store.colSet('jiazu_users', b, { _id: b, phone: b, nickname: '乙', role: 'user' });
  const seen = [];
  const collect = (label, r) => {
    noPlainPhone(r, label);
    seen.push(label);
    return r;
  };

  // —— 邀请链路 ——
  const inv = collect('sendFriendInvite', ok(await OPS.sendFriendInvite(a, b, T0), 'sendFriendInvite'));
  assert.equal(inv.relation_token, T(rid(a, b)));
  const acc = collect('acceptFriendInvite', ok(await OPS.acceptFriendInvite(inv.relation_token, b, T0), 'acceptFriendInvite'));
  assert.equal(acc.relation_token, inv.relation_token, '句柄跨调用恒定（由 _id 派生，无状态）');
  assert.equal(acc.relation.status, 'active');
  assert.equal(acc.relation.a_phone_masked, OPS.maskPhone(a));
  assert.equal('a_phone' in acc.relation, false, '关系文档出参不得含 a_phone');
  assert.equal('b_phone' in acc.relation, false, '关系文档出参不得含 b_phone');
  assert.deepEqual(acc.relation.history.map((h) => h.by), [OPS.maskPhone(a), OPS.maskPhone(b)], 'history.by 一律脱敏');
  const inv2 = collect('sendFriendInvite(拒)', ok(await OPS.sendFriendInvite(a, c, T0), 'sendFriendInvite'));
  collect('rejectFriendInvite', ok(await OPS.rejectFriendInvite(inv2.relation_token, c, T0), 'rejectFriendInvite'));
  const inv3 = collect('sendFriendInvite(撤)', ok(await OPS.sendFriendInvite(a, c, at(T0, 100)), 'sendFriendInvite'));
  collect('cancelFriendInvite', ok(await OPS.cancelFriendInvite(inv3.relation_token, a, at(T0, 100)), 'cancelFriendInvite')); // 撤回 = 发起方本人（a）

  // —— 续约链路 ——
  const [x, y] = pair();
  await F.createInvite(x, y, { now: T0 });
  await F.acceptInvite(rid(x, y), y, { now: T0 });
  const rt = T(rid(x, y));
  await giveScrolls(x, 1, T0);
  await giveScrolls(y, 1, T0);
  const w = at(T0, 364);
  collect('requestRenewal', ok(await OPS.requestRenewal(rt, x, w), 'requestRenewal'));
  collect('cancelRenewal', ok(await OPS.cancelRenewal(rt, y, w), 'cancelRenewal'));
  ok(await OPS.requestRenewal(rt, x, w), '再发起');
  const conf = collect('confirmRenewal', ok(await OPS.confirmRenewal(rt, y, w), 'confirmRenewal'));
  assert.equal(conf.deduct.phones_masked.length, 2, '出参只出双方脱敏号');
  assert.equal('phones' in conf.deduct, false, '出参不得含 phones（明文数组）');

  // —— 列表 / 分发 / 解除 ——
  const list = collect('listFriends', ok(await OPS.listFriends(a, w), 'listFriends'));
  for (const f of list.friends) assert.equal('_id' in f, false);
  const dis = collect('distributeFriendRewards', ok(await OPS.distributeFriendRewards(x, { base: { seed_fragments: 1 } }, w), 'distribute'));
  assert.equal(dis.distributed[0].relation_token, rt);
  collect('dissolveFriend', ok(await OPS.dissolveFriend(rt, x, at(w, 1)), 'dissolveFriend'));

  // 逐条反证：把这些出参**连同关系文档本体**一起序列化，也扫不出 11 位手机号
  for (const p of [a, b, c, x, y]) {
    assert.equal(PHONE_RE.test(JSON.stringify(list.friends)), false, `listFriends 任意字段不得含 ${p}`);
  }
  // 路由面 10 条出参全部收集完毕（逐条已扫明文手机号）
  assert.equal(seen.length, 12);
  for (const label of [
    'listFriends',
    'sendFriendInvite',
    'acceptFriendInvite',
    'rejectFriendInvite',
    'cancelFriendInvite',
    'requestRenewal',
    'confirmRenewal',
    'cancelRenewal',
    'dissolveFriend',
    'distributeFriendRewards',
  ]) {
    assert.ok(seen.includes(label), `必须收集到 ${label} 的出参并扫描`);
  }

  // —— 句柄性质（零新增存储 · 反查 = 集内 hash 比对）——
  assert.match(rt, /^fr_[0-9a-f]{16}$/);
  assert.equal(await OPS.resolveRelationToken(rt), rid(x, y), '反查回关系 _id');
  assert.equal(rt.includes(y.slice(0, 4)), false, '句柄不得内嵌手机号片段');
  // 形态合法但集合内不存在的句柄 ⇒ 一律 404（不得降级为 400 / 500）
  for (const op of ['acceptFriendInvite', 'rejectFriendInvite', 'cancelFriendInvite', 'requestRenewal', 'confirmRenewal', 'cancelRenewal', 'dissolveFriend']) {
    failsWith(await OPS[op]('fr_0123456789abcdef', a, w), 'FRIEND_NOT_FOUND', `${op} 未知句柄`);
  }
  // 非当事人拿真实句柄 ⇒ friends.js 的当事人守卫（403 语义，非 404）
  const [p1, p2] = pair();
  const pendInv = ok(await OPS.sendFriendInvite(p1, p2, T0), 'sendFriendInvite(当事人守卫)');
  noPlainPhone(pendInv, 'sendFriendInvite(当事人守卫)');
  failsWith(await OPS.acceptFriendInvite(pendInv.relation_token, '13980000099', T0), 'FRIEND_NOT_PARTY', '非被邀请人接受');
  failsWith(await OPS.rejectFriendInvite(pendInv.relation_token, '13980000099', T0), 'FRIEND_NOT_PARTY', '非被邀请人拒绝');
  failsWith(await OPS.cancelFriendInvite(pendInv.relation_token, '13980000099', T0), 'FRIEND_NOT_PARTY', '非发起方撤回');
});

// ══ ⑲ 裁定 1：续约双边扣减各写一笔 scroll_consume ═════════════════════════════════
test('裁定 1 scroll_consume：双边扣减**各写一笔**账本流水（可审计），成功路径零冲正', async () => {
  const T0 = '2029-01-01T00:00:00.000Z';
  const [a, b] = pair();
  await F.createInvite(a, b, { now: T0 });
  await F.acceptInvite(rid(a, b), b, { now: T0 });
  const token = T(rid(a, b));
  await giveScrolls(a, 1, T0);
  await giveScrolls(b, 1, T0);
  const w = at(T0, 364);
  ok(await OPS.requestRenewal(token, a, w), 'requestRenewal');
  const conf = ok(await OPS.confirmRenewal(token, b, w), 'confirmRenewal');

  // 白名单登记：本仓既有 22 项 + scroll_consume（**待制度员并入 economy-ledger.js 字面**）
  assert.equal(OPS.TX_TYPE_SCROLL_CONSUME, 'scroll_consume');
  assert.ok(L.TX_TYPES.includes('scroll_consume'), 'TX_TYPES 必须含 scroll_consume（否则 recordTx 抛错）');
  assert.equal(new Set(L.TX_TYPES).size, L.TX_TYPES.length, '白名单不得重名');

  // 双边各一笔，形状逐字
  for (const [phone, role, peer] of [
    [a, 'initiator', b],
    [b, 'confirmer', a],
  ]) {
    const list = await txsByType(phone, 'scroll_consume');
    assert.equal(list.length, 1, `${role} 必须恰好 1 条 scroll_consume`);
    const tx = list[0];
    assert.deepEqual(tx.delta, { scrolls: -100 }, 'delta 逐字 = { scrolls: -100 }（本仓兰帖计量单位 = 片）');
    assert.deepEqual(Object.keys(tx.delta), ['scrolls']);
    assert.equal(-tx.delta.scrolls, 1 * L.SCROLL_PIECES_PER_SCROLL, '1 枚 = 100 片');
    assert.deepEqual(Object.keys(tx.ref).sort(), ['peer_masked', 'relation_token', 'role', 'source']);
    assert.equal(tx.ref.source, 'friend_renew');
    assert.equal(tx.ref.relation_token, token, 'ref 带 relation_token（**不带** relation_id）');
    assert.equal(tx.ref.peer_masked, OPS.maskPhone(peer), 'ref 带对方脱敏号');
    assert.equal(tx.ref.role, role);
    assert.match(tx.desc, /^好友续约消耗：/);
    assert.match(tx.id, /^tx_/);
    assert.equal(typeof tx.ts, 'string');
    assert.equal(PHONE_RE.test(JSON.stringify(tx)), false, '流水全文不得含明文手机号');
  }
  // 双方 tx_id 不同（各写各的），且 charged 出参给出流水 id
  assert.notEqual(conf.charged[0].tx_id, conf.charged[1].tx_id);
  assert.equal(conf.charged[0].tx_id, (await txsByType(a, 'scroll_consume'))[0].id);
  assert.equal(conf.charged[1].tx_id, (await txsByType(b, 'scroll_consume'))[0].id);
  // 成功路径：零冲正 / 零 reward（不冒充既有枚举）
  assert.equal((await txsByType(a, 'fee_refund')).length, 0);
  assert.equal((await txsByType(b, 'fee_refund')).length, 0);
  assert.equal((await txsByType(a, 'reward')).length, 0);
  // 扣减后资产逐片归零（读回）
  assert.equal(await pieces(a), 0);
  assert.equal(await pieces(b), 0);
});

// ══ ⑳ 裁定 2：双边扣减第二笔失败 ⇒ 补偿回写（原子性） ═════════════════════════════
test('裁定 2 补偿回滚：第二笔失败 ⇒ 还原已扣批次（双方 lot 明细逐字节一致）+ 关系 history 补偿审计', async () => {
  const T0 = '2029-06-01T00:00:00.000Z';
  const [a, b] = pair();
  await F.createInvite(a, b, { now: T0 });
  await F.acceptInvite(rid(a, b), b, { now: T0 });
  const token = T(rid(a, b));
  await giveScrolls(a, 2, T0); // 发起方 2 枚（2 个批次）
  await giveScrolls(b, 1, T0); // 确认方 1 枚
  const w = at(T0, 364);
  ok(await OPS.requestRenewal(token, a, w), 'requestRenewal');

  // 注入点默认必须为空（生产行为一字不变）
  assert.equal(OPS.TEST_ONLY_HOOK.beforeCharge, null, '测试注入点默认必须为 null');
  // 开工前快照：双方 lot 明细 + 全量资产（txs 单列，因为审计流水**必须**新增）
  const beforeA = JSON.stringify(await scrollsOf(a));
  const beforeB = JSON.stringify(await scrollsOf(b));
  const piecesA = await pieces(a);
  const piecesB = await pieces(b);
  const txsAbefore = JSON.stringify(await txsOf(a));
  const txsBbefore = JSON.stringify(await txsOf(b));
  const relBefore = JSON.stringify(relDoc(rid(a, b)));

  try {
    // 可控失败注入：第二笔（确认方）扣减前抛错 —— 模拟并发窗口下确认方资产被扣尽
    OPS.TEST_ONLY_HOOK.beforeCharge = async (phone, info) => {
      if (info.role !== 'confirmer') return;
      const e = new Error('注入：确认方兰帖在锁外被扣尽');
      e.code = 'ASSET_INSUFFICIENT';
      throw e;
    };
    const res = await OPS.confirmRenewal(token, b, w);
    // 补偿成功 ⇒ 返回 RENEW_DEDUCT_ROLLED_BACK（**不得**返回 RENEW_DEDUCT_PARTIAL）
    failsWith(res, 'RENEW_DEDUCT_ROLLED_BACK', '第二笔失败已补偿');
    assert.equal(res.error.status, 409);
    assert.equal(res.error.reason, 'ASSET_INSUFFICIENT');
    noPlainPhone(res, '补偿出参');
    assert.equal(res.error.detail.relation_token, token);
    assert.equal(res.error.detail.compensated.phone_masked, OPS.maskPhone(a));
    assert.equal(res.error.detail.failed_masked, OPS.maskPhone(b));
    assert.equal(res.error.detail.compensated.pieces, 100);
    assert.equal(res.error.detail.compensated.restored.length, 1);
    assert.equal(res.error.detail.compensated.restored[0].recreated, false, '原批次仍在 ⇒ 就地还原（非重建）');
    assert.match(res.error.detail.compensated.refund_tx_id, /^tx_/);
  } finally {
    OPS.TEST_ONLY_HOOK.beforeCharge = null;
  }

  // ① **双方资产 lot 明细逐字节回到开工前**
  assert.equal(JSON.stringify(await scrollsOf(a)), beforeA, '发起方 lot 明细必须逐字节一致');
  assert.equal(JSON.stringify(await scrollsOf(b)), beforeB, '确认方 lot 明细必须逐字节一致');
  assert.equal(await pieces(a), piecesA, '发起方片数还原');
  assert.equal(await pieces(b), piecesB, '确认方片数还原');
  assert.equal(piecesB, 100, '确认方开工前 1 枚（100 片）；第二笔从未落盘 ⇒ 不增不减');
  assert.equal(JSON.stringify(await txsOf(b)), txsBbefore, '确认方账本一字未动（无单向扣减）');
  assert.equal((await txsByType(b, 'scroll_consume')).length, 0, '确认方无任何扣减流水（第二笔从未落盘）');
  assert.equal((await txsByType(b, 'fee_refund')).length, 0, '确认方无冲正流水');

  // ② 发起方：**留痕两条** —— 原扣 scroll_consume（审计保留，不删）+ 冲正 fee_refund
  const consume = await txsByType(a, 'scroll_consume');
  const refund = await txsByType(a, 'fee_refund');
  assert.equal(consume.length, 1, '原扣流水保留（可审计，不得静默删除）');
  assert.equal(refund.length, 1, '补偿必须写冲正流水');
  assert.deepEqual(refund[0].delta, { scrolls: 100 }, '冲正 delta = 还原 100 片');
  assert.deepEqual(Object.keys(refund[0].ref).sort(), ['peer_masked', 'reason', 'relation_token', 'reversed_tx', 'source']);
  assert.equal(refund[0].ref.source, 'friend_renew_rollback');
  assert.equal(refund[0].ref.reversed_tx, consume[0].id, '冲正指向被冲的原扣流水');
  assert.equal(refund[0].ref.relation_token, token);
  assert.equal(refund[0].ref.peer_masked, OPS.maskPhone(a), '补偿方自身的脱敏号');
  assert.equal(refund[0].ref.reason, 'ASSET_INSUFFICIENT');
  assert.match(refund[0].desc, /^续约扣减补偿：还原 100 片成品兰帖/);
  assert.equal(PHONE_RE.test(JSON.stringify(refund[0])), false, '冲正流水不得含明文手机号');
  // 发起方 txs 恰好新增这 2 条（其余字段不动）
  const txsAfter = await txsOf(a);
  assert.equal(txsAfter.length, JSON.parse(txsAbefore).length + 2, '只新增「原扣 + 冲正」两条审计流水');

  // ③ 关系 history 里有补偿审计记录
  const relAfter = relDoc(rid(a, b));
  const rollback = (relAfter.history || []).filter((h) => h.type === 'renew_deduct_rollback');
  assert.equal(rollback.length, 1, '关系 history 必须恰有 1 条补偿审计');
  assert.equal(rollback[0].reason, 'ASSET_INSUFFICIENT');
  // `by` = **落库明文**（与 friends.js 的 pushEvent 同律，内部审计需要；出参经 projectRelation 脱敏）
  assert.equal(rollback[0].by, b, 'by = 补偿发起方（落库明文，出参面一律脱敏）');
  assert.equal(PHONE_RE.test(JSON.stringify(rollback[0].detail)), false, '审计 detail 不得含明文手机号（出参面）');
  assert.equal(rollback[0].detail.relation_token, token);
  assert.equal(rollback[0].detail.rollback_ok, true);
  assert.equal(rollback[0].detail.compensated_masked, OPS.maskPhone(a));
  assert.equal(rollback[0].detail.failed_masked, OPS.maskPhone(b));
  assert.equal(rollback[0].detail.pieces, 100);
  assert.equal(rollback[0].detail.restored[0].lot_id, JSON.parse(beforeA)[0].id);
  assert.equal(rollback[0].detail.refund_tx_id, refund[0].id);
  // 注：事件 `by` 是**落库明文**（关系文档内部审计，与 friends.js 的 pushEvent 同律）⇒ 正则只判出参面（detail）
  // 关系文档：**仅** history 末尾追加 1 条补偿审计（身份 / 状态字段一字不改，**version 也不变**）
  const relBeforeObj = JSON.parse(relBefore);
  assert.equal(relAfter.a_phone, relBeforeObj.a_phone, '参与方身份字段不得改动');
  assert.equal(relAfter.b_phone, relBeforeObj.b_phone);
  assert.equal(relAfter.created_at, relBeforeObj.created_at);
  assert.equal(relAfter.history.length, relBeforeObj.history.length + 1, '新增 1 条：仅补偿审计（renewConfirm 从未被调用）');
  assert.equal(relAfter.history[relAfter.history.length - 1].type, 'renew_deduct_rollback', '追加在 history 末尾');

  // ③-2 **本单硬口径**：扣减失败且补偿成功 ⇒ **关系文档零变更**（逐字段；旧序的「关系已推进」残窗已消除）
  assert.equal(relAfter.version, relBeforeObj.version, 'version 必须零变更（③ renewConfirm 从未被调用）');
  assert.equal(relAfter.renewals, relBeforeObj.renewals, 'renewals 不得增加');
  assert.equal(relAfter.renewals, 0, '关系**未被推进**');
  assert.equal(relAfter.reward_months, relBeforeObj.reward_months, 'reward_months 不得增加');
  assert.equal(relAfter.expires_at, relBeforeObj.expires_at, 'expires_at 必须与开工前逐字节相同');
  assert.equal(relAfter.expires_at, at(T0, 365), '仍是 T0 + 365 天（未按 365 + 30×n 重算）');
  assert.deepEqual(relAfter.pending, relBeforeObj.pending, 'pending 逐字段保留（申请未丢）');
  assert.ok(relAfter.pending && relAfter.pending.kind === 'renew', 'pending 保留');
  assert.equal(relAfter.pending.locked_lot_id, relBeforeObj.pending.locked_lot_id, '锁保留（锁定批次不变）');
  assert.equal(relAfter.pending.locked_by, relBeforeObj.pending.locked_by);
  assert.equal(relAfter.pending.locked_pieces, relBeforeObj.pending.locked_pieces);
  // 逐字段全量比对（除 history 外，关系文档开工前后**一字不改**）
  const stripHistory = (o) => JSON.stringify({ ...o, history: [] });
  assert.equal(stripHistory(relAfter), stripHistory(relBeforeObj), '除 history 外关系文档逐字节零变更');

  // ④ 关系未被推进、锁未释放 ⇒ **无需重新发起**，用户可直接重试确认（硬口径最后一句「可稍后重试确认」）
  const retryAt = at(relAfter.expires_at, -1); // 仍在续约窗口内（7 天锁定期 / 365 天口径一字未动）
  const retry = ok(await OPS.confirmRenewal(token, b, retryAt), '补偿后重试确认');
  assert.equal(retry.charged.length, 2, '重试：双边各扣 1 枚');
  assert.equal((await txsByType(a, 'scroll_consume')).length, 2, '原扣 + 重试扣');
  assert.equal((await txsByType(b, 'scroll_consume')).length, 1, '确认方首轮从未落盘、重试才扣');
  assert.equal((await txsByType(a, 'fee_refund')).length, 1, '冲正不重复');
  assert.equal((await txsByType(b, 'fee_refund')).length, 0, '确认方全程无冲正');
  const relDone = relDoc(rid(a, b));
  assert.equal(relDone.renewals, 1, '重试后关系才推进（0 → 1）');
  assert.equal(relDone.reward_months, 1);
  assert.equal(relDone.pending, null, '重试成功后 pending 清空（解锁）');
  assert.equal(relDone.expires_at, at(T0, 395), 'T0 + 365 + 30 × 1 天');
  assert.equal(relDone.version, relBeforeObj.version + 1, '关系推进只写 1 次（version 恰好 +1）');
  assert.equal(await pieces(a), 100, '发起方 200 → 重试后 100 片');
  assert.equal(await pieces(b), 0, '确认方 100 → 重试后 0 片');
});

// ══ ㉑ **本单修正 · 正对照**：先扣减后推进的正常路径（双边扣减 + 关系推进 + 锁清空 + 零冲正） ════════
test('本单修正 正对照：正常路径——先双边扣减、后推进关系；锁清空、零冲正、零补偿审计', async () => {
  const T0 = '2029-08-01T00:00:00.000Z';
  const [a, b] = pair();
  await F.createInvite(a, b, { now: T0 });
  await F.acceptInvite(rid(a, b), b, { now: T0 });
  const token = T(rid(a, b));
  await giveScrolls(a, 1, T0);
  await giveScrolls(b, 1, T0);
  const w = at(T0, 364);
  const req = ok(await OPS.requestRenewal(token, a, w), 'requestRenewal');
  const relBefore = relDoc(rid(a, b));
  assert.ok(relBefore.pending && relBefore.pending.kind === 'renew', '开工前：有续约申请与锁');
  assert.equal(relBefore.pending.locked_lot_id, req.locked.lot_id);
  const aLotsBefore = JSON.stringify(await scrollsOf(a));

  const conf = ok(await OPS.confirmRenewal(token, b, w), 'confirmRenewal');
  noPlainPhone(conf, 'confirmRenewal(正对照)');

  // ① 双边扣减**均发生**（先资产）：各 1 枚、各一笔 scroll_consume
  assert.deepEqual(conf.charged.map((c) => c.role), ['initiator', 'confirmer'], '扣减顺序：发起方在前');
  assert.deepEqual(conf.charged.map((c) => c.pieces), [100, 100]);
  assert.equal('phone' in conf.charged[0], false, '出参脱敏投影不得含 phone 明文字段');
  assert.equal(conf.charged[0].taken[0].id, req.locked.lot_id, '发起方扣的正是锁定那一批');
  assert.equal(await pieces(a), 0, '发起方 100 → 0 片');
  assert.equal(await pieces(b), 0, '确认方 100 → 0 片');
  assert.equal((await txsByType(a, 'scroll_consume')).length, 1, '发起方 1 条留痕');
  assert.equal((await txsByType(b, 'scroll_consume')).length, 1, '确认方 1 条留痕');
  assert.notEqual(JSON.stringify(await scrollsOf(a)), aLotsBefore, '资产确已变更（正对照）');

  // ② 关系**推进**：renewals / reward_months +1、expires_at 重算、pending 清空（解锁）
  const relAfter = relDoc(rid(a, b));
  assert.equal(relAfter.renewals, relBefore.renewals + 1, 'renewals +1');
  assert.equal(relAfter.reward_months, relBefore.reward_months + 1, 'reward_months +1');
  assert.equal(relAfter.expires_at, at(T0, 395), 'T0 + 365 + 30 × 1 天（365 / 30 口径一字未动）');
  assert.equal(relAfter.pending, null, 'pending 清空 = 锁释放');
  assert.equal(relAfter.version, relBefore.version + 1, '关系推进只写 1 次（version +1）');
  assert.equal((relAfter.history || []).filter((h) => h.type === 'renew_deduct_rollback').length, 0, '正常路径零补偿审计');
  assert.equal(relAfter.history[relAfter.history.length - 1].type, 'renew_confirmed', 'history 末尾 = 关系推进事件');

  // ③ 零冲正 / 零冒充既有枚举
  assert.equal((await txsByType(a, 'fee_refund')).length, 0, '正常路径零冲正');
  assert.equal((await txsByType(b, 'fee_refund')).length, 0, '正常路径零冲正');
  assert.equal((await txsByType(a, 'reward')).length, 0, '不冒充 reward');

  // ④ 通知照发（双方各一条「续约成功」）
  assert.equal(msgsOf(a).some((t) => t.includes('续约已生效')), true, '发起方收到续约成功通知');
  assert.equal(msgsOf(b).some((t) => t.includes('续约已生效')), true, '确认方收到续约成功通知');
});

// ══ ㉒ **本单修正 · TX_TYPES 白名单并回字面**：真源唯一、无重名、无运行期 push ═════════════════════
test('本单修正 TX_TYPES：scroll_consume 并入字面、无重复项、本模块零运行期 push', () => {
  // ① 字面登记（真源 = economy-ledger.js 的 TX_TYPES 数组字面）
  assert.ok(L.TX_TYPES.includes('scroll_consume'), 'TX_TYPES 字面必须含 scroll_consume（否则 recordTx 抛错）');
  assert.equal(OPS.TX_TYPE_SCROLL_CONSUME, 'scroll_consume', '常量与字面取值一致');
  // ② 无重复项（Set 大小 == 数组长度）
  assert.equal(new Set(L.TX_TYPES).size, L.TX_TYPES.length, 'TX_TYPES 不得有重复项');
  assert.deepEqual(L.TX_TYPES, [...new Set(L.TX_TYPES)], '去重后顺序与字面逐项一致（无隐含重名）');
  assert.equal(L.TX_TYPES.indexOf('scroll_consume'), L.TX_TYPES.lastIndexOf('scroll_consume'), '该取值恰出现 1 次');
  // ③ 字面登记的**文本证据**：ledger 源文件字面里确有该取值
  const ledgerSrc = fs.readFileSync(path.join(HERE, 'economy-ledger.js'), 'utf8');
  assert.equal(/'scroll_consume'/.test(ledgerSrc), true, 'economy-ledger.js 字面必须出现 scroll_consume');
  // ④ 源码判据：本模块**不得**再出现运行期白名单追加（第二套真源）
  assert.equal(/TX_TYPES\.push/.test(SRC), false, 'friend-ops.js 不得出现运行期白名单追加');
  assert.equal(/TX_TYPES\s*=/.test(SRC), false, 'friend-ops.js 不得重新赋值 TX_TYPES');
  // ⑤ 判据自证：recordTx 只认字面（旁证——用未登记取值必抛）
  assert.throws(() => L.recordTx({ txs: [] }, { type: 'not_a_registered_type' }, new Date()), /未知流水类型/, '未登记取值必被拒');
  assert.doesNotThrow(() => L.recordTx({ txs: [] }, { type: 'scroll_consume' }, new Date()), '字面已登记 ⇒ 放行');
});
