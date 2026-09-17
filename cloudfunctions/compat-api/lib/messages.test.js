/**
 * 站内信（P4）单测 — lib/economy-ops.js 的预警惰性生成 + 两条消息路由
 * 规格：docs/economy-ops.spec.md §4.2（`Message` 字段）/ §4.3（接口）/ §4.4（四类预警：生成条件 + 去重键 "/ §4.5（惰性算法）/
 *   §6.2（M1–M4 **逐字文案**）/ §6.3（title 映射与运行时填值）/ §11-5（每用户留最近 200 条、只裁已读）/
 *   §11-6（灵气收件人 = anchor + tree_steward + 全部 chief_editor）/ §11-7（剩余天数 `ceil`）；总册 §4-4 / §4-5 存储契约。
 *
 * 覆盖（规格 §8.2 用例 #10–#12、#14）：
 *  ① M1–M4 文案逐字（含【】与全角标点）+ title 映射 + type 枚举
 *  ② 资产到期预警：30 / 7 天各一次；31 天不生成、已过期批次（sweep 后）不生成；去重键与 `warned` 同次落库
 *  ③ 阈值边界（恰好 30 / 恰好 7 / 31 / 已过期）
 *  ④ 灵气三条：active ≤30 天（M2）、buffer（M3）、缓冲期剩 ≤7 天（M4）；同树同阶段不重复
 *  ⑤ §11-6 收件人集合：anchor 用户 + 该树 tree_steward + 全部 chief_editor；惰性生成只补当前请求人
 *  ⑥ §11-5 保留上限 200：只裁最旧的**已读**，未读不裁（纯函数 + 路由级）
 *  ⑦ `GET /messages`：未读计数 + `created_at` 倒序 + 同刻按写入顺序倒序（后写入者在前，§4.2 引用 §5.3 定序口径）+ 401
 *  ⑧ `POST /messages/read`：指定 id / 缺省全部 / 幂等 / 他人 id 忽略不计 / 401
 *  ⑨ 真源未变：config/tree-meta.json 与 migrate-output/（trees + details + collections）md5 逐字节一致
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本（照 economy-spirit.test.js / economy-market.test.js 模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/messages.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-messages-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realMetaRaw = fs.readFileSync(REAL_META, 'utf8');
const realMetaMd5 = md5(REAL_META);
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

const DAY = 86400000;
const nowMs = () => Date.now();
/** 相对**真实当前时刻**偏移天数的 ISO（路由内取服务端 now，无法注入时钟） */
const at = (days) => new Date(nowMs() + days * DAY).toISOString();

// ---- 沙箱 tree-meta 副本 ----
const TREES = ['ms_f0', 'ms_f1', 'ms_f2'];
const META_TREES = { zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, display_title: '中华世本总谱' } };
for (const t of TREES) META_TREES[t] = { tree_id: t, kind: 'family', display_title: `消息测试家族 ${t}` };
fs.writeFileSync(process.env.COMPAT_META_FILE, JSON.stringify({ _schema: '1.1', trees: META_TREES }, null, 2) + '\n');

// ---- 用户 / 锚点（§11-6 收件人集合口径） ----
const MEMBER = '16600009001'; // user，锚点 = ms_f0
const STEWARD = '16600009002'; // tree_steward，锚点 = ms_f1
const CHIEF = '16600009003'; // chief_editor（无锚点）
const OTHER = '16600009004'; // user（无锚点，非任何树成员）
fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [MEMBER]: { _id: MEMBER, phone: MEMBER, nickname: '树锚点用户', role: 'user' },
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '该树主理人', role: 'tree_steward' },
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [OTHER]: { _id: OTHER, phone: OTHER, nickname: '无锚点用户', role: 'user' },
  }),
);
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_anchors.json'),
  JSON.stringify({
    [MEMBER]: { _id: MEMBER, tree_id: 'ms_f0', person_handle: 'h_member', updated_at: at(-30) },
    [STEWARD]: { _id: STEWARD, tree_id: 'ms_f1', person_handle: 'h_steward', updated_at: at(-30) },
  }),
);

const el = await import('./economy-ledger.js');
const store = await import('./store.js');
const ops = await import('./economy-ops.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

// ---- 夹具工具 ----

const seedLot = (qty, expDays, id, source = 'admin') => ({
  id,
  qty,
  expires_at: at(expDays),
  source,
  created_at: new Date(nowMs()).toISOString(),
});
const bambooLot = (qty, expDays, id, source = 'admin') => ({
  id,
  qty,
  expires_at: at(expDays),
  source,
  created_at: new Date(nowMs()).toISOString(),
});
const jadeOf = (id, expDays = null) => ({
  id,
  expires_at: expDays === null ? null : at(expDays),
  created_at: new Date(nowMs()).toISOString(),
  source: 'synthesis',
});

/** 直接写个人资产（绕过被测模块，仅夹具） */
async function setAssets(phone, { fragments = 0, seeds = [], bamboos = [], jades = [], txs = [], signin_date = '' } = {}) {
  await el.withAssets(phone, (user) => {
    user.fragments = fragments;
    user.seeds = seeds.map((l) => ({ ...l }));
    user.bamboos = bamboos.map((l) => ({ ...l }));
    user.jades = jades.map((l) => ({ ...l }));
    user.txs = txs.map((t) => ({ ...t }));
    user.signin_date = signin_date;
  });
}
const assetsOf = (phone) => el.getAssets(phone);

/** 灵气记录（只读数据源；状态推进由 settle 负责，夹具按 settle 口径造一致值） */
async function setEntry(treeId, entry) {
  const doc = (await store.colGet('jiazu_spirit', 'global')) || { _id: 'global', trees: {} };
  doc.trees = doc.trees || {};
  doc.trees[treeId] = entry;
  await store.colSet('jiazu_spirit', 'global', doc);
}
const entryOf = async (treeId) => (await store.colGet('jiazu_spirit', 'global'))?.trees?.[treeId] || null;
/** 已镶玉的灵气记录：`spirit_expires_at` / `buffer_until` / `status` 三者与 settle 口径一致 */
const spiritEntry = (spiritExpiresAt, bufferUntil = null, status = 'active') => ({
  jade: { jade_id: `jd_${treeIdSafe(spiritExpiresAt)}`, mounted_at: at(-40), expires_at: null },
  spirit_expires_at: spiritExpiresAt,
  buffer_until: bufferUntil,
  status,
  logs: [],
});
function treeIdSafe(v) {
  return String(v || '').replace(/[^0-9]/g, '').slice(-6);
}
async function clearSpirit() {
  await store.colSet('jiazu_spirit', 'global', { _id: 'global', trees: {} });
}

/** 站内信真源读写（断言用） */
const messagesDoc = () => store.colGet('jiazu_messages', 'global');
const messagesFor = async (phone) => (await messagesDoc())?.items?.[phone] || [];
const warned = async () => (await messagesDoc())?.warned || {};
async function setMessages(phone, items) {
  const doc = (await messagesDoc()) || ops.blankMessagesDoc();
  doc.items = doc.items || {};
  doc.warned = doc.warned || {};
  doc.items[phone] = items.map((m) => ({ ...m }));
  await store.colSet('jiazu_messages', 'global', doc);
}
const msg = (id, { read = false, created_at = new Date(nowMs()).toISOString(), text = '夹具消息', type = 'system' } = {}) => ({
  id,
  type,
  title: '夹具',
  text,
  created_at,
  read,
});

// ---- 路由夹具 ----
const bearer = (phone, role = 'user') => {
  const scheme = ['Bear', 'er'].join(''); // 避免字面量被外部工具误判为凭据
  return { authorization: `${scheme} ${signJwt({ sub: phone, phone, role }, 3600)}` };
};
const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({ path: p, httpMethod: method, headers, queryStringParameters: query, body: body ? JSON.stringify(body) : undefined });
const jsonOf = (res) => JSON.parse(res.body);

// ==================== ① M1–M4 文案逐字（§6.2 / §6.3） ====================

test('M1–M4 文案逐字：与 docs/economy-ops.spec.md §6.2 完全一致（含【】与全角标点）', () => {
  // 期望值**独立照抄**规格 §6.2 原文（不引用被测模块的常量，否则等于自己断言自己）
  const SPEC_M1 = '【资产到期提醒】您的【石榴籽/竹片】即将于X日后到期失效，请尽快使用避免损耗。';
  const SPEC_M2 = '【家族灵气预警】本家族【时流子域】灵气剩余30天，即将到期。请及时灌注玉露灵泽续期，避免子域名停用。';
  const SPEC_M3 = '【家族缓冲期通知】本家族灵气已耗尽，现已进入30天缓冲期。若未及时续期，缓冲期结束后子域名将自动失效。';
  const SPEC_M4 = '【紧急通知】本家族【时流子域】缓冲期仅剩7天，未灌注玉露灵泽续期将永久停用子域名，请尽快操作！';
  assert.equal(ops.M1_TEMPLATE, SPEC_M1);
  assert.equal(ops.M2_TEXT, SPEC_M2);
  assert.equal(ops.M3_TEXT, SPEC_M3);
  assert.equal(ops.M4_TEXT, SPEC_M4);

  // 运行时填值（§6.3）：资产类型二选一、天数固定 30 / 7；**其余逐字不变**
  assert.equal(ops.m1Text('seed', 30), SPEC_M1.replace('【石榴籽/竹片】', '【石榴籽】').replace('于X日', '于30日'));
  assert.equal(ops.m1Text('seed', 7), SPEC_M1.replace('【石榴籽/竹片】', '【石榴籽】').replace('于X日', '于7日'));
  assert.equal(ops.m1Text('bamboo', 30), SPEC_M1.replace('【石榴籽/竹片】', '【竹片】').replace('于X日', '于30日'));
  assert.equal(ops.m1Text('bamboo', 7), SPEC_M1.replace('【石榴籽/竹片】', '【竹片】').replace('于X日', '于7日'));
  // 非法天数收口为 30（固定值口径，不随实际剩余天数变化）
  assert.equal(ops.m1Text('seed', 12), ops.m1Text('seed', 30));

  // title 映射（短标题，不含【】）
  assert.deepEqual(ops.MESSAGE_TITLES, {
    m1: '资产到期提醒',
    m2: '家族灵气预警',
    m3: '家族缓冲期通知',
    m4: '紧急通知',
  });
  // type 枚举（总册 §4-4）：资产到期 = 'expiring'；灵气三条 = 'spirit'
  const assetCand = ops.expiringCandidates('16600009000', { seeds: [{ id: 'x', qty: 1, expires_at: new Date(Date.now() + 10 * DAY).toISOString() }] }, new Date());
  assert.deepEqual(assetCand.map((c) => c.type), ['expiring']);
  assert.equal(assetCand[0].text, ops.m1Text('seed', 30));
  const spiritCand = ops.spiritCandidates(
    '16600009000',
    'ms_f0',
    { jade: { jade_id: 'jd' }, spirit_expires_at: new Date(Date.now() + 10 * DAY).toISOString(), buffer_until: null, status: 'active' },
    new Date(),
  );
  assert.deepEqual(spiritCand.map((c) => c.type), ['spirit']);
  assert.equal(spiritCand[0].text, ops.M2_TEXT);
});

// ==================== ②⑨ 资产到期预警：生成 + 去重键同次落库 ====================

test('资产到期预警：30 / 7 天各一条（逐字 M1）；31 天与已过期批次不生成；`warned` 与消息同次落库', async () => {
  await clearSpirit();
  await setMessages(MEMBER, []);
  await setAssets(MEMBER, {
    seeds: [seedLot(3, 30, 'sl_30'), seedLot(5, 31, 'sl_31'), seedLot(1, -1, 'sl_expired')],
    bamboos: [bambooLot(100, 7, 'bl_7')],
  });

  const res = await call('/messages', 'GET', bearer(MEMBER));
  assert.equal(res.statusCode, 200);
  const body = jsonOf(res);
  assert.equal(body.unread, 3, '恰好 30 天 → @30；恰好 7 天 → @30 + @7；共 3 条');
  assert.equal(body.items.length, 3);

  const byText = Object.fromEntries(body.items.map((m) => [m.text, m]));
  assert.ok(
    byText['【资产到期提醒】您的【石榴籽】即将于30日后到期失效，请尽快使用避免损耗。'],
    `缺 30 天籽提醒，实际：${JSON.stringify(body.items.map((m) => m.text))}`,
  );
  assert.ok(byText['【资产到期提醒】您的【竹片】即将于30日后到期失效，请尽快使用避免损耗。']);
  assert.ok(byText['【资产到期提醒】您的【竹片】即将于7日后到期失效，请尽快使用避免损耗。']);
  for (const m of body.items) {
    assert.equal(m.type, 'expiring');
    assert.equal(m.title, '资产到期提醒');
    assert.equal(m.read, false);
    assert.ok(/^msg_\d+_[0-9a-z]{6}$/.test(m.id), `Message.id 形态：${m.id}`);
    assert.ok(Number.isFinite(Date.parse(m.created_at)), 'created_at 为 ISO 时刻');
  }
  // 31 天批次不生成；已过期批次被 sweep 剔除（资产与提醒同时收口）
  assert.equal(body.items.some((m) => m.text.includes('竹片') && m.text.includes('31')), false);
  assert.equal(body.items.some((m) => m.text.includes('1日')), false, '已过期批次不得生成提醒');
  const assets = await assetsOf(MEMBER);
  assert.equal(assets.seeds.some((l) => l.id === 'sl_expired'), false, '读入口先 sweep，过期批次已剔除');

  // 去重键（总册三段格式 + 阶段后缀）与消息**同一次落库**
  const w = await warned();
  assert.deepEqual(
    Object.keys(w).filter((k) => k.includes(MEMBER)).sort(),
    [`expiring:${MEMBER}:bl_7@30`, `expiring:${MEMBER}:bl_7@7`, `expiring:${MEMBER}:sl_30@30`].sort(),
  );
  for (const k of Object.keys(w).filter((x) => x.includes(MEMBER))) assert.equal(w[k], true);
  assert.equal((await messagesFor(MEMBER)).length, 3, '同一批消息已在同一次 colSet 落库');

  // 第二次读：不再重复生成（每键终身一次）
  const again = jsonOf(await call('/messages', 'GET', bearer(MEMBER)));
  assert.equal(again.items.length, 3, '重复调用不得重复生成');
  assert.equal((await messagesFor(MEMBER)).length, 3);
});

// ==================== ③ 阈值边界（纯函数 · 固定时钟） ====================

test('阈值边界（§11-7 ceil）：恰好 30 → 仅 @30；恰好 7 → @30 + @7；30<n≤31 → 不生成；≤0 → 不生成', () => {
  const NOW = new Date('2026-09-16T00:00:00.000Z');
  const iso = (days) => new Date(NOW.getTime() + days * DAY).toISOString();
  const user = {
    fragments: 0,
    seeds: [
      { id: 'b30', qty: 1, expires_at: iso(30), source: 'admin', created_at: iso(0) },
      { id: 'b31', qty: 1, expires_at: iso(31), source: 'admin', created_at: iso(0) },
      { id: 'b7', qty: 1, expires_at: iso(7), source: 'admin', created_at: iso(0) },
      { id: 'b6', qty: 1, expires_at: iso(6), source: 'admin', created_at: iso(0) },
      { id: 'b1', qty: 1, expires_at: iso(1), source: 'admin', created_at: iso(0) },
      { id: 'b0', qty: 1, expires_at: iso(0), source: 'admin', created_at: iso(0) },
      { id: 'bneg', qty: 1, expires_at: iso(-1), source: 'admin', created_at: iso(0) },
    ],
    bamboos: [],
    jades: [],
    txs: [],
  };
  const P = '16600009999';
  const EXPECTED = [`expiring:${P}:b30@30`, `expiring:${P}:b7@30`, `expiring:${P}:b7@7`, `expiring:${P}:b6@30`, `expiring:${P}:b6@7`, `expiring:${P}:b1@30`, `expiring:${P}:b1@7`];
  const keys = ops.expiringCandidates(P, user, NOW).map((c) => c.key);
  assert.deepEqual(keys, EXPECTED, '恰好 30 天与恰好 7 天均在窗口内，31 天不在');
  assert.equal(keys.some((k) => k.includes(':b31@')), false, '剩余 31 天 → 不生成');
  assert.equal(keys.some((k) => k.includes('b0')), false, '剩余 0（已到期）→ 不生成');
  assert.equal(keys.some((k) => k.includes('bneg')), false, '剩余为负 → 不生成');
  assert.equal(keys.filter((k) => k.endsWith('@30')).length, 4, 'b30 / b7 / b6 / b1 各一条 @30');
  assert.equal(ops.daysLeftUntil(iso(30), NOW), 30);
  assert.equal(ops.daysLeftUntil(iso(7), NOW), 7);
  assert.equal(ops.daysLeftUntil('', NOW), NaN);
});

// ==================== ④ 灵气三条 ====================

test('灵气三条（§4.4 第 3–5 行）：active ≤30 天 → M2；buffer → M3；缓冲期剩 ≤7 天 → M4；同树同阶段不重复', async () => {
  await setMessages(MEMBER, []);

  // —— active：灵气剩 20 天 → M2（逐字）——
  await setEntry('ms_f0', spiritEntry(at(20), null, 'active'));
  await setAssets(MEMBER, { seeds: [], bamboos: [] });
  const first = jsonOf(await call('/messages', 'GET', bearer(MEMBER)));
  const m2 = first.items.find((m) => m.text.startsWith('【家族灵气预警】'));
  assert.ok(m2, `active 应生成 M2，实际：${JSON.stringify(first.items.map((m) => m.text))}`);
  assert.equal(m2.type, 'spirit');
  assert.equal(m2.title, '家族灵气预警');
  assert.equal(
    m2.text,
    '【家族灵气预警】本家族【时流子域】灵气剩余30天，即将到期。请及时灌注玉露灵泽续期，避免子域名停用。',
    'M2 必须逐字（含【时流子域】字面保留）',
  );
  const exp1 = (await entryOf('ms_f0')).spirit_expires_at;
  assert.equal((await warned())[`spirit:${MEMBER}:ms_f0@30@${exp1}`], true, 'M2 去重键含 spirit_expires_at');

  // 同阶段再读：不重复
  const second = jsonOf(await call('/messages', 'GET', bearer(MEMBER)));
  assert.equal(second.items.filter((m) => m.text.startsWith('【家族灵气预警】')).length, 1);

  // —— buffer：灵气耗尽、缓冲期剩 5 天 → M3 + M4（逐字）——
  //    settle 口径：buffer_until = spirit_expires_at + 30 天（末 5 天 → 灵气到期于 25 天前）
  const expBuf = at(-25);
  await setEntry('ms_f0', spiritEntry(expBuf, at(5), 'buffer'));
  const third = jsonOf(await call('/messages', 'GET', bearer(MEMBER)));
  const m3 = third.items.find((m) => m.text.startsWith('【家族缓冲期通知】'));
  const m4 = third.items.find((m) => m.text.startsWith('【紧急通知】'));
  assert.ok(m3, 'buffer 应生成 M3');
  assert.ok(m4, '缓冲期剩 ≤7 天应生成 M4');
  assert.equal(m3.text, '【家族缓冲期通知】本家族灵气已耗尽，现已进入30天缓冲期。若未及时续期，缓冲期结束后子域名将自动失效。');
  assert.equal(m4.text, '【紧急通知】本家族【时流子域】缓冲期仅剩7天，未灌注玉露灵泽续期将永久停用子域名，请尽快操作！');
  assert.equal(m3.title, '家族缓冲期通知');
  assert.equal(m4.title, '紧急通知');
  assert.equal(m3.type, 'spirit');
  assert.equal(m4.type, 'spirit');
  const bufUntil = (await entryOf('ms_f0')).buffer_until;
  const w = await warned();
  assert.equal(w[`spirit:${MEMBER}:ms_f0@buffer@${(await entryOf('ms_f0')).spirit_expires_at}`], true);
  assert.equal(w[`spirit:${MEMBER}:ms_f0@7@${bufUntil}`], true);

  // 同阶段再读：M3 / M4 各只有一条
  const fourth = jsonOf(await call('/messages', 'GET', bearer(MEMBER)));
  assert.equal(fourth.items.filter((m) => m.text.startsWith('【家族缓冲期通知】')).length, 1);
  assert.equal(fourth.items.filter((m) => m.text.startsWith('【紧急通知】')).length, 1);

  // —— buffer 但缓冲期剩 > 7 天 → 只有 M3 ——
  await setEntry('ms_f1', spiritEntry(at(-20), at(10), 'buffer'));
  const fifth = jsonOf(await call('/messages', 'GET', bearer(STEWARD)));
  const s3 = fifth.items.filter((m) => m.text.startsWith('【家族缓冲期通知】'));
  const s4 = fifth.items.filter((m) => m.text.startsWith('【紧急通知】'));
  assert.equal(s3.length, 1, '缓冲期剩 10 天：只发 M3');
  assert.equal(s4.length, 0, '缓冲期剩 10 天：不发 M4');

  // —— expired：不发第 3/5 条；无玉的树不发 ——
  await setEntry('ms_f2', spiritEntry(at(-40), at(-10), 'expired'));
  await setAssets(OTHER, {});
  await setMessages(OTHER, []);
  const sixth = jsonOf(await call('/messages', 'GET', bearer(OTHER)));
  assert.equal(sixth.items.length, 0, 'expired 状态与无锚点用户都不生成灵气预警');

  // —— 纯函数边界（固定时钟）：active 剩 31 天不生成；无玉不生成 ——
  const NOW = new Date('2026-09-16T00:00:00.000Z');
  const active31 = { jade: { jade_id: 'jd_x' }, spirit_expires_at: new Date(NOW.getTime() + 31 * DAY).toISOString(), buffer_until: null, status: 'active' };
  assert.deepEqual(ops.spiritCandidates('16600009999', 't', active31, NOW), [], '灵气剩 31 天 → 不生成');
  assert.deepEqual(ops.spiritCandidates('16600009999', 't', { status: 'active', spirit_expires_at: NOW.toISOString() }, NOW), [], '未镶玉 → 不生成');
});

// ==================== ⑤ §11-6 收件人集合 ====================

test('§11-6 收件人集合：anchor 用户 + 该树 tree_steward + 全部 chief_editor；惰性生成只补当前请求人', async () => {
  assert.deepEqual((await ops.spiritRecipients('ms_f0')).sort(), [CHIEF, MEMBER].sort());
  assert.deepEqual((await ops.spiritRecipients('ms_f1')).sort(), [CHIEF, STEWARD].sort());
  assert.deepEqual(await ops.spiritRecipients('ms_missing'), [CHIEF], '无 anchor / steward 的树：收件人集合里只有全部 chief_editor');
  assert.deepEqual(await ops.spiritRecipients(''), []);

  // 惰性生成只补当前请求人：OTHER（无锚点、非 chief）不生成；CHIEF 请求时补全**全部**树
  await clearSpirit();
  await setEntry('ms_f1', spiritEntry(at(10), null, 'active'));
  await setMessages(OTHER, []);
  await setMessages(CHIEF, []);
  const asOther = jsonOf(await call('/messages', 'GET', bearer(OTHER)));
  assert.equal(asOther.items.length, 0, '无接收权的用户不得生成灵气预警');
  assert.equal((await warned())[`spirit:${OTHER}:ms_f1@30@${(await entryOf('ms_f1')).spirit_expires_at}`], undefined);

  const asChief = jsonOf(await call('/messages', 'GET', bearer(CHIEF)));
  assert.deepEqual(
    asChief.items.map((m) => m.text),
    ['【家族灵气预警】本家族【时流子域】灵气剩余30天，即将到期。请及时灌注玉露灵泽续期，避免子域名停用。'],
    'chief_editor 是该树收件人（逐人各自一份）',
  );
  // 同树同阶段、不同收件人 → 各自的键（与 STEWARD 那次互不串味）
  const w = await warned();
  assert.equal(w[`spirit:${CHIEF}:ms_f1@30@${(await entryOf('ms_f1')).spirit_expires_at}`], true);
  assert.equal(w[`spirit:${CHIEF}:ms_f1@30@${(await entryOf('ms_f1')).spirit_expires_at}`] !== undefined, true);
});

// ==================== ⑥ §11-5 保留上限 200（只裁已读） ====================

test('§11-5 保留上限：trimMessages 只裁最旧的已读；未读不裁（纯函数）', () => {
  const reads = (n, read) => Array.from({ length: n }, (_, i) => msg(`m_${read ? 'r' : 'u'}_${i}`, { read }));
  assert.equal(ops.trimMessages(reads(205, true)).length, 200, '205 条已读 → 裁到 200');
  assert.equal(ops.trimMessages(reads(205, false)).length, 205, '未读一律不裁（允许暂时超上限）');
  const mixed = [...reads(3, false), ...reads(202, true)];
  const trimmed = ops.trimMessages(mixed);
  assert.equal(trimmed.length, 200);
  assert.deepEqual(
    trimmed.filter((m) => !m.read).map((m) => m.id),
    ['m_u_0', 'm_u_1', 'm_u_2'],
    '未读全部保留',
  );
  assert.equal(trimmed.filter((m) => m.read).length, 197, '只裁最旧的已读');
  assert.equal(ops.trimMessages(reads(10, true)).length, 10, '未超上限不裁');
  assert.equal(ops.MESSAGE_KEEP_LIMIT, 200);
});

test('§11-5 路由级：新预警落库时把该用户裁到 200 条，且未读消息全部保留', async () => {
  const items = [...Array.from({ length: 3 }, (_, i) => msg(`keep_u_${i}`, { read: false })), ...Array.from({ length: 202 }, (_, i) => msg(`keep_r_${i}`, { read: true }))];
  await setMessages(OTHER, items);
  assert.equal((await messagesFor(OTHER)).length, 205);
  // 造一条即将到期批次（10 天后）→ 触发预警生成 + 同次裁剪
  await setAssets(OTHER, { seeds: [seedLot(2, 10, 'sl_trim')] });
  const body = jsonOf(await call('/messages', 'GET', bearer(OTHER)));
  const mine = await messagesFor(OTHER);
  const created = mine.find((m) => !String(m.id).startsWith('keep_'));
  assert.ok(created, '10 天后到期的批次应生成 1 条新预警');
  assert.equal(mine.length, 200, '205 + 1 新预警 → 裁到上限 200');
  assert.deepEqual(
    mine.filter((m) => !m.read).map((m) => m.id).sort(),
    ['keep_u_0', 'keep_u_1', 'keep_u_2', created.id].sort(),
    '未读（含新预警）全部保留',
  );
  assert.equal(mine.some((m) => m.id === 'keep_r_0'), false, '最旧的已读被裁掉');
  assert.equal(mine.some((m) => m.id === 'keep_r_201'), true, '最新的已读保留');
  assert.equal(body.unread, 4, '未读计数 = 3 条夹具未读 + 1 条新预警');
});

// ==================== ⑦ GET /messages ====================

test('GET /messages：返回本人消息（created_at 倒序）+ 未读计数；未登录 401', async () => {
  await clearSpirit();
  await setMessages(OTHER, [
    msg('o_old', { read: true, created_at: at(-3) }),
    msg('o_new', { read: false, created_at: at(-1) }),
    msg('o_mid', { read: false, created_at: at(-2) }),
    { ...msg('o_bad', { read: true }), created_at: undefined },
  ]);
  await setAssets(OTHER, { seeds: [] });
  const res = await call('/messages', 'GET', bearer(OTHER));
  assert.equal(res.statusCode, 200);
  const body = jsonOf(res);
  assert.equal(body.unread, 2);
  assert.deepEqual(body.items.map((m) => m.id), ['o_new', 'o_mid', 'o_old', 'o_bad'], '按 created_at 倒序（脏值排最后）');
  for (const m of body.items) assert.equal(typeof m.read, 'boolean');

  // `unread=1` → 只回未读（不影响未读计数口径）
  const onlyUnread = jsonOf(await call('/messages', 'GET', bearer(OTHER), { unread: '1' }));
  assert.deepEqual(onlyUnread.items.map((m) => m.id), ['o_new', 'o_mid']);
  assert.equal(onlyUnread.unread, 2);

  assert.equal((await call('/messages', 'GET', {})).statusCode, 401);
});

// ---- ⑦' 列表定序：同刻（created_at 完全相同）必须确定 ----

test('GET /messages 定序：同刻（created_at 完全相同）按写入顺序倒序（后写入者在前）；unreadOnly 过滤后次序不变', async () => {
  await clearSpirit();
  await setAssets(OTHER, { seeds: [] });
  const SAME = new Date(nowMs() - 60000).toISOString(); // 三条同一时刻（模拟同一批写入）
  const NEWER = at(0);
  await setMessages(OTHER, [
    msg('t_first', { read: false, created_at: SAME }), // 最先写入
    msg('t_second', { read: true, created_at: SAME }), // 其次
    msg('t_third', { read: false, created_at: SAME }), // 最后写入
    msg('t_newer', { read: false, created_at: NEWER }),
  ]);

  const res = await call('/messages', 'GET', bearer(OTHER));
  assert.equal(res.statusCode, 200);
  const body = jsonOf(res);
  assert.equal(body.unread, 3);
  assert.deepEqual(
    body.items.map((m) => m.id),
    ['t_newer', 't_third', 't_second', 't_first'],
    '同刻按写入顺序倒序（后写入者在前）；只靠「稳定排序保留插入序」会得到相反结果',
  );

  // unreadOnly 只过滤、不改同刻次序（未读：t_first / t_third / t_newer）
  const onlyUnread = jsonOf(await call('/messages', 'GET', bearer(OTHER), { unread: '1' }));
  assert.deepEqual(onlyUnread.items.map((m) => m.id), ['t_newer', 't_third', 't_first']);
  assert.equal(onlyUnread.unread, 3, '未读计数口径不变（全量口径）');
});

test('GET /messages 定序：同一次请求内 ensureWarnings 生成的多条预警（created_at 同毫秒）出参为写入序倒序', async () => {
  await clearSpirit();
  await setMessages(MEMBER, []);
  await setAssets(MEMBER, { seeds: [seedLot(3, 30, 'ord_sl')], bamboos: [bambooLot(100, 7, 'ord_bl')] });

  const body = jsonOf(await call('/messages', 'GET', bearer(MEMBER)));
  const stored = await messagesFor(MEMBER);
  assert.equal(stored.length, 3, `一次请求应生成 3 条预警，实际 ${stored.length}`);
  assert.equal(
    new Set(stored.map((m) => m.created_at)).size,
    1,
    '同一次 ensureWarnings 生成的 3 条 created_at 完全相同（同刻是常态，不是异常）',
  );
  // 落库写入序（= 候选顺序）：籽 @30 → 竹片 @30 → 竹片 @7；出参必须是它的倒序
  const T30 = '【资产到期提醒】您的【石榴籽】即将于30日后到期失效，请尽快使用避免损耗。';
  const B30 = '【资产到期提醒】您的【竹片】即将于30日后到期失效，请尽快使用避免损耗。';
  const B7 = '【资产到期提醒】您的【竹片】即将于7日后到期失效，请尽快使用避免损耗。';
  assert.deepEqual(body.items.map((m) => m.text), [B7, B30, T30], '同刻按写入顺序倒序（后写入者在前）');
  assert.deepEqual(body.items.map((m) => m.id), stored.map((m) => m.id).reverse(), '出参 = 落库写入序的倒序');
  assert.equal(body.unread, 3);

  // unreadOnly 过滤后仍保持同一同刻次序
  const onlyUnread = jsonOf(await call('/messages', 'GET', bearer(MEMBER), { unread: '1' }));
  assert.deepEqual(onlyUnread.items.map((m) => m.text), [B7, B30, T30]);
});

// ==================== ⑧ POST /messages/read ====================

test('POST /messages/read：指定 id / 缺省全部 / 幂等 / 他人 id 忽略不计 / 401', async () => {
  await setMessages(MEMBER, [msg('r_a'), msg('r_b'), msg('r_c')]);
  await setMessages(STEWARD, [msg('s_only')]);
  await setAssets(MEMBER, { seeds: [] });

  const one = jsonOf(await call('/messages/read', 'POST', bearer(MEMBER), {}, { ids: ['r_b'] }));
  assert.deepEqual(one, { ok: true, unread: 2, marked: 1 });
  assert.equal((await messagesFor(MEMBER)).find((m) => m.id === 'r_b').read, true);

  // 幂等：重复标记同一条不再计数
  const again = jsonOf(await call('/messages/read', 'POST', bearer(MEMBER), {}, { ids: ['r_b'] }));
  assert.equal(again.unread, 2);
  assert.equal(again.marked, 0);
  assert.equal((await messagesFor(MEMBER)).find((m) => m.id === 'r_a').read, false, '未被点名的消息不受影响');

  // 他人 id 忽略不计（不报错、他人消息不被标记）
  const foreign = jsonOf(await call('/messages/read', 'POST', bearer(MEMBER), {}, { ids: ['s_only', 'r_c'] }));
  assert.equal(foreign.unread, 1);
  assert.equal((await messagesFor(STEWARD))[0].read, false, '他人消息绝不被标记');
  assert.equal((await messagesFor(MEMBER)).find((m) => m.id === 'r_c').read, true);

  // 缺省 ids = 全部标记已读
  const all = jsonOf(await call('/messages/read', 'POST', bearer(MEMBER), {}, {}));
  assert.deepEqual(all, { ok: true, unread: 0, marked: 1 });
  assert.equal((await messagesFor(MEMBER)).every((m) => m.read), true);
  const idempotent = jsonOf(await call('/messages/read', 'POST', bearer(MEMBER), {}, {}));
  assert.deepEqual(idempotent, { ok: true, unread: 0, marked: 0 });

  assert.equal((await call('/messages/read', 'POST', {})).statusCode, 401);
  // 空数组 = 缺省（全部已读）口径
  await setMessages(MEMBER, [msg('r_d')]);
  const empty = jsonOf(await call('/messages/read', 'POST', bearer(MEMBER), {}, { ids: [] }));
  assert.deepEqual(empty, { ok: true, unread: 0, marked: 1 });
});

// ==================== ⑨ 真源未变 ====================

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/ 逐字节未变', () => {
  assert.equal(fs.readFileSync(REAL_META, 'utf8'), realMetaRaw, 'config/tree-meta.json 被改动了');
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 的 md5 变了');
  for (const [dir, baseline, label] of [
    [REAL_TREES, realTreeBaseline, 'trees'],
    [REAL_DETAILS, realDetailBaseline, 'details'],
    [REAL_COLLECTIONS, realColBaseline, 'collections'],
  ]) {
    const files = fs.readdirSync(dir);
    assert.deepEqual(files.sort(), [...baseline.keys()].sort(), `真实 ${label} 目录文件名/数量变了`);
    for (const f of files) assert.equal(md5(path.join(dir, f)), baseline.get(f), `真实 ${label}/${f} 被改动了`);
  }
});
