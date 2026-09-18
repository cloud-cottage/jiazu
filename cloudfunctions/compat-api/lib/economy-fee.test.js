/**
 * 竹片扣费闸门单测（P1）— lib/economy-fee.js + 4 条既有写路由的扣费行为
 * 规格：docs/economy-fee.spec.md §3-1（33 行扣费矩阵）/ §4-3（闸门顺序）/ §5-1（模块导出）/
 *   §6（错误码）/ §8（how_to_get 文案）/ §9-1（覆盖清单）；总纲 docs/economy.spec.md §5-5 / §5-8。
 *
 * 覆盖：
 *   ① `feeOf` 矩阵穷举（纯函数）：1 片 / 1 片 / 9 片（**与人数无关**）/ 3N 片 / 3 片 / 9 籽 / 未列明 = 0
 *   ② 扣费与流水：`chargeBamboo` / `chargeSeeds` 写 `edit_fee` / `delete_fee` / `move_fee` / `tree_create`
 *   ③ 不足整单拒绝 409：`need` / `current` / `unit` / `how_to_get`，批次 qty 一字节不动、无流水
 *   ④ FIFO by `expires_at` 升序（乱序批次命中最早到期）
 *   ⑤ `sweep` 先于扣费：过期批次不计入可扣量并写 `expire` 流水
 *   ⑥ 4 条写路由矩阵（成功 / 失败分支逐一实测）：PUT /people、/admin/reparent、/admin/delete-node、
 *      /admin/create-tree；含 401 / 403 / 400 无效请求 / 409 / dry_run / confirm_count 不符
 *   ⑦ dry_run 与 409 范围变化**免费**：资产总分与流水逐字节不变
 *   ⑧ 跨树迁移 9 片 / 次：带 5 个后代也是 9 片（绝不 9 × 人数）
 *   ⑨ 落库失败冲正：真实路径（路由落库抛错）+ mock 注入（`refund` / `refundAssets`）→ 资产总分还原、
 *      原批次（同 `lot_id` / `expires_at` / `qty`）复活、存在 `fee_refund` 流水
 *   ⑩ 建树扣 9 籽 / 不足 409 / 落库失败原路返还 / 删除路径不触籽（删树不退）
 *   ⑪ 0 片行：源码级穷举「30 条 0 片路由不接闸门，清单与 index.js 逐条对齐（无幽灵路由，missing 必须为 0）」
 *      + 实跑 `POST /people` 资产逐字节不变
 *   ⑫ 冲正回显统一：4 条计费路由的 catch 一律带 `fee_refunded:true`（reparent / delete-node 实测落库失败）
 *   ⑬ 资产总览：`getAssetSummary` = 账本内核 `summarize` 同形状（从未有资产的手机号也不报错）
 *   ⑭ 错误回显白名单：`EACCES` / `ENOENT` 等系统错误码与路径绝不透传；409 资产不足四字段与 `how_to_get` 原样保留
 *   ⑮ 真源未变：`config/tree-meta.json` 与 `migrate-output/`（trees + details + collections）逐字节 md5 一致
 *
 * 数据安全：COMPAT_OUT_DIR / COMPAT_META_FILE 一律指向 /tmp 副本；文末 md5 断言真实数据未变
 * （照 assets.test.js / node-delete.test.js 的模式）。
 *
 * 运行：node --test cloudfunctions/compat-api/lib/economy-fee.test.js
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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'jiazu-economy-fee-'));
process.env.COMPAT_SOURCE = 'local';
process.env.COMPAT_OUT_DIR = TMP;
process.env.COMPAT_META_FILE = path.join(TMP, 'tree-meta.json');

const md5 = (p) => crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex');
const realMetaRaw = fs.readFileSync(REAL_META, 'utf8');
const realMetaMd5 = md5(REAL_META);
const dirBaseline = (dir) =>
  new Map((fs.existsSync(dir) ? fs.readdirSync(dir) : []).map((f) => [f, md5(path.join(dir, f))]));
const realTreeBaseline = dirBaseline(REAL_TREES);
const realDetailBaseline = dirBaseline(REAL_DETAILS);
const realColBaseline = dirBaseline(REAL_COLLECTIONS);

// ---- tree-meta 副本（各用例的树 id 一一对应）----

const TREES = {
  zhonghua: { tree_id: 'zhonghua', kind: 'master', is_master: true, display_title: '中华世本总谱' },
  fee_put: { tree_id: 'fee_put', kind: 'family', display_title: '甲氏（PUT 修改）' },
  fee_ro: { tree_id: 'fee_ro', kind: 'family', display_title: '乙氏（只读镜像）' },
  fee_same: { tree_id: 'fee_same', kind: 'family', display_title: '丙氏（同树改父）' },
  fee_src: { tree_id: 'fee_src', kind: 'family', display_title: '丁氏（跨树迁移源 · 带 5 后代）' },
  fee_src1: { tree_id: 'fee_src1', kind: 'family', display_title: '戊氏（跨树迁移源 · 1 人）' },
  fee_dst: { tree_id: 'fee_dst', kind: 'family', display_title: '己氏（跨树迁移目标）' },
  fee_del: { tree_id: 'fee_del', kind: 'family', display_title: '庚氏（subtree 删除）' },
  fee_pro: { tree_id: 'fee_pro', kind: 'family', display_title: '辛氏（promote 删除）' },
  fee_conf: { tree_id: 'fee_conf', kind: 'family', display_title: '壬氏（confirm_count 不符）' },
  fee_poor: { tree_id: 'fee_poor', kind: 'family', display_title: '癸氏（资产不足）' },
  fee_zero: { tree_id: 'fee_zero', kind: 'family', display_title: '子氏（0 片路由实跑）' },
  fee_delns: { tree_id: 'fee_delns', kind: 'family', display_title: '丑氏（库层直调删节点）' },
  fee_clan: { tree_id: 'fee_clan', kind: 'clan', display_title: '祖谱（0 片实跑）' },
};
const META_FILE = process.env.COMPAT_META_FILE;
fs.writeFileSync(META_FILE, JSON.stringify({ _schema: '1.1', trees: TREES }, null, 2) + '\n');

// ---- 用户与资产 ----

const CHIEF = '16600009001'; // chief_editor（建树 / 总谱）
const STEWARD = '16600009002'; // tree_steward（4 条计费路由主用）
const POOR = '16600009003'; // tree_steward，0 资产（不足拦截）
const GUEST = '16600009004'; // guest（403）
const GUEST_WRITER = GUEST; // 403 用例复用

fs.mkdirSync(path.join(TMP, 'collections'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'details'), { recursive: true });
fs.mkdirSync(path.join(TMP, 'trees'), { recursive: true });
fs.writeFileSync(
  path.join(TMP, 'collections', 'jiazu_users.json'),
  JSON.stringify({
    [CHIEF]: { _id: CHIEF, phone: CHIEF, nickname: '总编辑', role: 'chief_editor' },
    [STEWARD]: { _id: STEWARD, phone: STEWARD, nickname: '主理人', role: 'tree_steward' },
    [POOR]: { _id: POOR, phone: POOR, nickname: '零资产主理人', role: 'tree_steward' },
    [GUEST]: { _id: GUEST, phone: GUEST, nickname: '游客', role: 'guest' },
  }),
);

const el = await import('./economy-ledger.js');
const eco = await import('./economy-fee.js');
const tw = await import('./tree-write.js');
const { handleRequest } = await import('../index.js');
const { signJwt } = await import('./auth.js');

const DAY = 86400000;
const NOW = new Date();
const isoPlus = (days, from = NOW) => new Date(from.getTime() + days * DAY).toISOString();
const bambooLot = (qty, expDays, id) => ({
  id: id || el.nextLotId('bl'),
  qty,
  expires_at: isoPlus(expDays),
  source: 'admin',
  created_at: new Date().toISOString(),
});
const seedLot = (qty, expDays, id) => ({
  id: id || el.nextLotId('sl'),
  qty,
  expires_at: isoPlus(expDays),
  source: 'admin',
  created_at: new Date().toISOString(),
});
const setAssets = (phone, patch) => el.mutateAssets(phone, (u) => Object.assign(u, patch));
const readAssets = (phone) => el.getAssets(phone);
/** 资产总分（含批次明细）指纹：0 片行 / 免费分支一律断言它逐字节不变 */
const bagOf = (u) =>
  JSON.stringify({ fragments: u.fragments, seeds: u.seeds, bamboos: u.bamboos, jades: u.jades });
/**
 * 顺序无关的资产指纹：冲正会把被扣尽后 sweep 掉的批次重新 addLot 到数组尾部（FIFO 只看 `expires_at`，
 * 数组位置不是存储契约）→ 这一类断言用「按 lot.id 排序后」的分批指纹，仍然逐字段逐字节比对。
 */
const bagSorted = (u) => {
  const byId = (lots) => [...(lots || [])].sort((a, b) => String(a?.id).localeCompare(String(b?.id)));
  return JSON.stringify({ fragments: u.fragments, seeds: byId(u.seeds), bamboos: byId(u.bamboos), jades: u.jades });
};
const txCount = (u) => (u.txs || []).length;
const txTypes = (u) => (u.txs || []).map((t) => t.type);
const bee = (phone) => ({ authorization: `Bearer ${signJwt({ sub: phone, phone, role: 'user' }, 3600)}` });
const call = (p, method = 'GET', headers = {}, query = {}, body = null) =>
  handleRequest({
    path: p,
    httpMethod: method,
    headers,
    queryStringParameters: query,
    body: body === null ? undefined : JSON.stringify(body),
  });
const bodyOf = (res) => JSON.parse(res.body);

// ---- 造树工具 ----

const person = (handle, gramps_id, name, gender = 'M', parent_family = '') => ({
  handle,
  gramps_id,
  name,
  surname: '甲',
  given: name,
  gender,
  birth_date: '',
  death_date: '',
  birth_place: '',
  death_place: '',
  parent_family,
  spouse_families: [],
});

function writeTree(tree) {
  const p = path.join(TMP, 'trees', `${tree.tree_id}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(tree, null, 2));
}
const readTree = (id) => JSON.parse(fs.readFileSync(path.join(TMP, 'trees', `${id}.json`), 'utf8'));
const treeMd5 = (id) => md5(path.join(TMP, 'trees', `${id}.json`));

/**
 * 单链家族树：root → d1 → … → dN（共 N+1 人，逐代一个家族记录）
 * 用途：subtree 删除人数确定（N+1）与跨树迁移「带 N 个后代」。
 * 形状对齐真实树契约（同 node-delete.test.js 的夹具）：后代必须能由
 * `person.spouse_families` → `families[fh].child_handles` 走通，否则整支只有本人。
 */
function chainTree(id, n = 5, base = 100) {
  const keys = ['root', ...Array.from({ length: n }, (_, i) => `d${i + 1}`)];
  const handles = keys.map((k) => `${id}-${k}`);
  const people = {};
  const families = {};
  handles.forEach((handle, i) => {
    people[handle] = person(handle, `I${base + i}`, `节点${i}`, 'M', i === 0 ? '' : `${id}-fam-${i - 1}`);
  });
  handles.forEach((handle, i) => {
    if (i === handles.length - 1) return;
    const fh = `${id}-fam-${i}`;
    // 有子女 → 该节点是这一家族的家长（BFS 走 spouse_families 才能看到后代）
    people[handle].spouse_families = [fh];
    families[fh] = {
      handle: fh,
      gramps_id: `F${base + i}`,
      father_handle: handle,
      mother_handle: '',
      child_handles: [handles[i + 1]],
    };
  });
  return { id, handles, people, families, tree: { _schema: '1.0', tree_id: id, version: 1, people, families } };
}

/** 单人树（跨树迁移的目标父容器 / 只读镜像用例） */
function singleTree(id, { mirror = false, base = 900 } = {}) {
  const handle = `${id}-host`;
  const node = person(handle, `I${base}`, mirror ? '镜像节点' : '目标父', 'M');
  if (mirror) {
    node.external_mirror = 'true';
    node.external_tree = 'zhonghua';
    node.external_link_type = 'founder';
  }
  return {
    id,
    handle,
    tree: { _schema: '1.0', tree_id: id, version: 1, people: { [handle]: node }, families: {} },
  };
}

/** 布景：写树 + 给用户预置资产 */
async function scene({ trees = [], phone = STEWARD, bamboos = 0, seeds = 0, expireDays = 100 } = {}) {
  for (const t of trees) writeTree(t.tree || t);
  await setAssets(phone, {
    fragments: 0,
    seeds: seeds ? [seedLot(seeds, expireDays, `sl_${phone}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)] : [],
    bamboos: bamboos ? [bambooLot(bamboos, expireDays, `bl_${phone}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)] : [],
    jades: [],
    txs: [],
    signin_date: '',
  });
}

const H = (treeId, phone = STEWARD) => ({ ...bee(phone), 'x-tree-id': treeId });

// ================= ① 单价矩阵（纯函数穷举） =================

test('单价表 FEE 与 feeOf 矩阵穷举：1 / 1 / 9（与人数无关）/ 3N / 3 / 9 籽 / 立支 9999 籽 / 汇宗 0 片 / 未列明 = 0', () => {
  // 单价常量 = 规格唯一真源（路由内禁止魔法数字）
  assert.deepEqual(eco.FEE, {
    person_update: 1,
    reparent_same_tree: 1,
    reparent_cross_tree: 9,
    delete_node_per_person: 3,
    tree_create_seeds: 9,
    branch_fee_seeds: 9999, // 立支（docs/branch-clan-ops.spec.md §3-4 / §6-1-7）
  });

  // #1 人物内容修改 1 片 / 节点
  assert.deepEqual(eco.feeOf('person_update'), { unit: 'bamboos', pieces: 1, tx_type: 'edit_fee' });

  // #2 同树改父 1 片 / 节点；#3 跨树改父 9 片 / 次
  assert.equal(eco.feeOf('reparent', { cross_tree: false }).pieces, 1);
  assert.equal(eco.feeOf('reparent', { cross_tree: false }).tx_type, 'edit_fee');
  assert.equal(eco.feeOf('reparent', { cross_tree: true }).pieces, 9);
  assert.equal(eco.feeOf('reparent', { cross_tree: true }).tx_type, 'move_fee');
  // 跨树 9 片**与带多少后代无关**：1 人 / 30 人 / 200 人同价
  for (const moving of [1, 30, 200]) {
    assert.equal(
      eco.feeOf('reparent', { cross_tree: true, moving_count: moving }).pieces,
      9,
      `跨树迁移 ${moving} 人也只扣 9 片（绝不 9 × 人数）`,
    );
  }

  // #4 subtree 3 片 × N（每条节点独立计费，不合并）；#5 promote 3 片
  for (const n of [1, 4, 5, 6, 20]) {
    const f = eco.feeOf('delete_node', { mode: 'subtree', people_count: n });
    assert.equal(f.pieces, 3 * n, `subtree 删 ${n} 人 = ${3 * n} 片`);
    assert.equal(f.tx_type, 'delete_fee');
  }
  assert.equal(eco.feeOf('delete_node', { mode: 'promote', people_count: 5 }).pieces, 3, 'promote 只删本节点 = 3 片');
  assert.equal(eco.feeOf('delete_node', { mode: 'subtree', people_count: 0 }).pieces, 0);

  // #6 dry_run 免费（但 pieces 仍回「本次将消耗」供前端拼文案）；#7 409 范围变化 0 片
  const dry = eco.feeOf('delete_node', { mode: 'subtree', people_count: 5, dry_run: true });
  assert.equal(dry.pieces, 15);
  assert.equal(dry.free, true, 'dry_run 必须标 free（不写资产）');
  assert.equal(eco.feeOf('delete_node', { people_count: 5, scope_changed: true }).pieces, 0);

  // #8 建树 9颗石榴籽（非竹片）
  assert.deepEqual(eco.feeOf('create_tree'), { unit: 'seeds', pieces: 9, tx_type: 'tree_create' });

  // #34 立支 9999 颗石榴籽（复用既有 Tx.type='tree_create'；后台 config.branch_fee_seeds 可覆盖）
  assert.deepEqual(eco.feeOf('establish_branch'), { unit: 'seeds', pieces: 9999, tx_type: 'tree_create' });
  assert.equal(eco.feeOf('establish_branch', { branch_fee_seeds: 12 }).pieces, 12, '后台设置键覆盖默认单价');
  assert.equal(eco.feeOf('establish_branch').tx_type, 'tree_create', '立支复用既有枚举，不新造 Tx.type');

  // #35 汇宗 0 片 + 0 籽（不接闸门）
  const converge = eco.feeOf('converge_clan');
  assert.equal(converge.pieces, 0);
  assert.equal(converge.free, true);
  assert.equal(converge.reason, 'not_charged');

  // 未列明操作（新增 / 关系类）= 0 片
  for (const op of ['add_child', 'add_spouse', 'chain_append', 'marriage', 'split_tree', 'promote_tree', 'unknown']) {
    assert.equal(eco.feeOf(op).pieces, 0, `${op} 必须 0 片`);
    assert.equal(eco.feeOf(op).free, true);
  }

  // how_to_get 唯一文案真源（§8 四条渠道）
  assert.deepEqual(eco.HOW_TO_GET, [
    '官方 9.9 元/束',
    '每日 21 点限量发售',
    '市集购买',
    '蓄能档位赠送（季度 1 束 / 半年度 2 束 / 年度 8 束）',
  ]);
});

test('请求体可修改字段判定：姓名/性别/生卒/健在/称号任一 → 计费；全空 → 无效请求（不扣）', () => {
  assert.equal(eco.hasPersonChanges({ gender: 1 }), true);
  assert.equal(eco.hasPersonChanges({ primary_name: { first_name: '三', surname_list: [] } }), true);
  assert.equal(eco.hasPersonChanges({ primary_name: { first_name: '', surname_list: [{ surname: '甲' }] } }), true);
  assert.equal(eco.hasPersonChanges({ birth_date: '1900' }), true);
  assert.equal(eco.hasPersonChanges({ death_date: '1980' }), true);
  assert.equal(eco.hasPersonChanges({ is_living: false }), true, 'is_living=false 仍是内容字段');
  assert.equal(eco.hasPersonChanges({ attribute_list: [{ key: 'title', value: '进士' }] }), true, '称号三字段');
  assert.equal(eco.hasPersonChanges({}), false);
  assert.equal(eco.hasPersonChanges({ primary_name: { first_name: '', surname_list: [] }, attribute_list: [] }), false);
});

test('409 错误回显：ASSET_INSUFFICIENT 全字段（need / current / unit / how_to_get）；白名单内错误带 code', () => {
  const insuff = eco.feeInsufficient(9, 3, 'bamboos');
  assert.equal(insuff.status, 409);
  assert.match(insuff.message, /资产不足，需 9 片竹片，当前 3 片/);
  const b = eco.errorPayload(insuff);
  assert.equal(b.code, 'ASSET_INSUFFICIENT');
  assert.equal(b.need, 9);
  assert.equal(b.current, 3);
  assert.equal(b.unit, 'bamboos');
  assert.deepEqual(b.how_to_get, eco.HOW_TO_GET);
  assert.equal(b.error, insuff.message, '既有字段语义不变（仍以 error 为主）');

  const seedBody = eco.errorPayload(eco.feeInsufficient(9, 0, 'seeds'));
  assert.equal(seedBody.unit, 'seeds');
  assert.equal(seedBody.current, 0);
  assert.match(seedBody.error, /需 9颗石榴籽，当前 0 颗/);

  const scopeErr = Object.assign(new Error('删除范围已变化（当前 5 人，确认时 4 人），请重新确认'), {
    status: 409,
    code: 'DELETE_SCOPE_CHANGED',
  });
  assert.deepEqual(eco.errorPayload(scopeErr), { error: scopeErr.message, code: 'DELETE_SCOPE_CHANGED' });
  // 无 status 的裸异常 = 意外 / 系统错误 → 通用文案 + 默认 500（不再回显底层异常文本）
  assert.deepEqual(eco.errorPayload(new Error('随便一个错误')), { error: '服务内部错误', status: 500 });
  // 带 status 的业务错误（lib 层 fail(msg, 4xx) / httpError(4xx, msg)）→ 原文照回，不被通用句覆盖
  assert.deepEqual(eco.errorPayload(Object.assign(new Error('游客无编辑权限，请注册后编辑'), { status: 403 })), {
    error: '游客无编辑权限，请注册后编辑',
  });
});

test('errorPayload 系统错误码白名单：EACCES 不透传 code / 路径；资产不足四字段与 how_to_get 逐字段保留', () => {
  // 白名单 = 照实际使用枚举（ASSET_INSUFFICIENT / DELETE_SCOPE_CHANGED），清单外一律不透传
  assert.deepEqual(eco.DOMAIN_ERROR_CODES, ['ASSET_INSUFFICIENT', 'DELETE_SCOPE_CHANGED']);
  assert.equal(eco.INTERNAL_ERROR_TEXT, '服务内部错误');

  // ① 文件系统错误（含本机路径）→ 无 code、无 EACCES、无路径片段、无 errno 原文
  const sys = Object.assign(new Error("EACCES: permission denied, open '/tmp/jiazu-assets-9f3/secret.json'"), {
    code: 'EACCES',
  });
  const b = eco.errorPayload(sys);
  assert.equal('code' in b, false, '白名单外的 code 不得出现在响应体');
  assert.equal(b.error, '服务内部错误');
  assert.equal(b.status, 500, '底层没有 status → 默认 500');
  const raw = JSON.stringify(b);
  for (const leak of ['EACCES', 'permission denied', '/tmp', 'secret.json', 'jiazu-assets']) {
    assert.equal(raw.includes(leak), false, `响应体不得泄露「${leak}」：${raw}`);
  }

  // ② 白名单外的 code + 显式 status：同样只回通用文案（status 沿用），绝不透传 code
  const sys2 = Object.assign(new Error("ENOENT: no such file or directory, open '/Users/kevin/bistro/jiazu/migrate-output/trees/x.json'"), {
    code: 'ENOENT',
    status: 503,
  });
  const b2 = eco.errorPayload(sys2);
  assert.equal('code' in b2, false);
  assert.equal(b2.error, '服务内部错误');
  assert.equal(b2.status, 503, '底层本就有 status → 沿用');
  assert.equal(JSON.stringify(b2).includes('ENOENT'), false);
  assert.equal(JSON.stringify(b2).includes('/Users/kevin'), false);

  // ③ 白名单内：409 资产不足 —— need / current / unit / how_to_get 与后端原文**一个都不能少**
  const ins = eco.errorPayload(eco.feeInsufficient(9, 3, 'bamboos'));
  assert.equal(ins.code, 'ASSET_INSUFFICIENT');
  assert.equal(ins.need, 9);
  assert.equal(ins.current, 3);
  assert.equal(ins.unit, 'bamboos');
  assert.deepEqual(ins.how_to_get, eco.HOW_TO_GET);
  assert.deepEqual(ins.how_to_get, [
    '官方 9.9 元/束',
    '每日 21 点限量发售',
    '市集购买',
    '蓄能档位赠送（季度 1 束 / 半年度 2 束 / 年度 8 束）',
  ]);
  assert.match(ins.error, /资产不足，需 9 片竹片，当前 3 片/, '白名单内保留后端原文');
  const insSeed = eco.errorPayload(eco.feeInsufficient(9, 0, 'seeds'));
  assert.deepEqual(
    { code: insSeed.code, need: insSeed.need, current: insSeed.current, unit: insSeed.unit, how_to_get: insSeed.how_to_get },
    { code: 'ASSET_INSUFFICIENT', need: 9, current: 0, unit: 'seeds', how_to_get: eco.HOW_TO_GET },
  );
  assert.equal(insSeed.status, undefined, '资产不足是 409 业务错误，不带内部 status 字段');

  // ④ 白名单内的 DELETE_SCOPE_CHANGED：原文 + code 照旧（前端靠它提示「重新确认」）
  const scope = eco.errorPayload(Object.assign(new Error('删除范围已变化（当前 6 人，确认时 2 人），请重新确认'), { status: 409, code: 'DELETE_SCOPE_CHANGED' }));
  assert.deepEqual(scope, { error: '删除范围已变化（当前 6 人，确认时 2 人），请重新确认', code: 'DELETE_SCOPE_CHANGED' });
});

// ================= ② 扣费与流水 =================

test('chargeBamboo / chargeSeeds：写 edit_fee / delete_fee / move_fee / tree_create，返回 fee 形状', async () => {
  const P = '16600009101';
  await setAssets(P, { fragments: 0, seeds: [seedLot(20, 200)], bamboos: [bambooLot(50, 200)], jades: [], txs: [], signin_date: '' });

  const one = await eco.chargeBamboo(P, eco.FEE.person_update, { op: 'person_update', tree_id: 't1', person_handle: 'h1', person_name: '季志全' });
  assert.deepEqual(one.fee, { unit: 'bamboos', pieces: 1, balance: 50, balance_after: 49 });
  assert.equal(one.charged, true);
  assert.ok(one.txn_id, '扣费成功必须返回 txn_id');
  assert.equal(one.spent.length, 1);
  assert.equal(one.spent[0].qty, 1);

  const del = await eco.chargeBamboo(P, 3 * 5, { op: 'delete_node', tree_id: 't1', person_handle: 'h2', people_count: 5 });
  assert.equal(del.fee.balance_after, 34);

  const mv = await eco.chargeBamboo(P, eco.FEE.reparent_cross_tree, { op: 'reparent_cross_tree', tree_id: 't1', person_handle: 'h3' });
  assert.equal(mv.fee.balance_after, 25);

  const seeds = await eco.chargeSeeds(P, eco.FEE.tree_create_seeds, { op: 'tree_create', tree_id: 'new_tree' });
  assert.deepEqual(seeds.fee, { unit: 'seeds', pieces: 9, balance: 20, balance_after: 11 });

  const u = await readAssets(P);
  assert.equal(el.sumLots(u.bamboos), 25, '竹片 50 - 1 - 15 - 9 = 25');
  assert.equal(el.sumLots(u.seeds), 11);
  const feeTxs = u.txs.filter((t) => ['edit_fee', 'delete_fee', 'move_fee', 'tree_create'].includes(t.type));
  assert.deepEqual(feeTxs.map((t) => t.type), ['edit_fee', 'delete_fee', 'move_fee', 'tree_create']);
  assert.deepEqual(feeTxs.map((t) => t.delta), [{ bamboos: -1 }, { bamboos: -15 }, { bamboos: -9 }, { seeds: -9 }]);
  assert.equal(feeTxs[0].operator, P, 'operator 写发起人手机号');
  assert.equal(feeTxs[0].ref.tree_id, 't1');
  assert.equal(feeTxs[0].ref.person_handle, 'h1');
  assert.match(feeTxs[0].desc, /修改节点 季志全/, 'desc 写人类可读说明');

  // 每扣一次写一条流水：4 次扣费 → 恰好 4 条（无多余流水）；批次总和口径自洽
  assert.equal(txCount(u), 4, '4 次扣费 = 4 条流水，不多不少');
  assert.equal(el.sumLots(u.bamboos), u.bamboos.reduce((s, l) => s + l.qty, 0));
});

test('不足整单拒绝 409：批次 qty 一字节不动、无流水（竹片与籽各一例，缺 1 即拒）', async () => {
  const P = '16600009102';
  await setAssets(P, {
    fragments: 3,
    seeds: [seedLot(8, 200, 'sl_p')],
    bamboos: [bambooLot(6, 200, 'bl_a'), bambooLot(1, 200, 'bl_b')],
    jades: [],
    txs: [],
    signin_date: '',
  });
  const before = await readAssets(P);

  let err = null;
  try {
    await eco.chargeBamboo(P, 8, { op: 'reparent_cross_tree', tree_id: 't1', person_handle: 'h1' });
  } catch (e) {
    err = e;
  }
  assert.ok(err, '余额 7 片不足 8 片必须抛错');
  assert.equal(err.status, 409);
  assert.equal(err.code, 'ASSET_INSUFFICIENT');
  assert.equal(err.need, 8);
  assert.equal(err.current, 7);
  assert.equal(err.unit, 'bamboo');
  const body = eco.errorPayload(err);
  assert.equal(body.unit, 'bamboos');
  assert.equal(body.need, 8);
  assert.equal(body.current, 7);
  assert.deepEqual(body.how_to_get, eco.HOW_TO_GET);
  assert.deepEqual(await readAssets(P), before, '整单拒绝：资产与流水逐字节不变');

  let seedErr = null;
  try {
    await eco.chargeSeeds(P, 9, { op: 'tree_create', tree_id: 'x' });
  } catch (e) {
    seedErr = e;
  }
  assert.equal(seedErr.status, 409);
  assert.equal(seedErr.need, 9);
  assert.equal(seedErr.current, 8);
  assert.match(seedErr.message, /需 9颗石榴籽，当前 8 颗/);
  assert.deepEqual(await readAssets(P), before, '籽不足同样一字节不写');
});

// ================= ③ FIFO / sweep =================

test('FIFO by expires_at：乱序三批次扣减命中最早到期批次（复用账本内核，闸门不另写算法）', async () => {
  const P = '16600009103';
  await setAssets(P, {
    fragments: 0,
    seeds: [],
    bamboos: [
      bambooLot(3, 300, 'bl_late'),
      bambooLot(5, 10, 'bl_early'),
      bambooLot(2, 100, 'bl_mid'),
    ],
    jades: [],
    txs: [],
    signin_date: '',
  });
  const r = await eco.chargeBamboo(P, 6, { op: 'person_update', tree_id: 't1', person_handle: 'h' });
  assert.deepEqual(r.spent.map((s) => s.lot_id), ['bl_early', 'bl_mid'], '必须先扣最早到期的批次');
  assert.deepEqual(r.spent.map((s) => s.qty), [5, 1]);
  const u = await readAssets(P);
  assert.equal(u.bamboos.find((l) => l.id === 'bl_late').qty, 3, '剩余有效期最长的批次不动');
  assert.equal(el.sumLots(u.bamboos), 4);
});

test('sweep 先于扣费：过期批次不计入可扣量并写 expire 流水（余额口径只算剩余批次）', async () => {
  const P = '16600009104';
  await setAssets(P, {
    fragments: 0,
    seeds: [],
    bamboos: [bambooLot(30, -1, 'bl_expired'), bambooLot(4, 100, 'bl_alive')],
    jades: [],
    txs: [],
    signin_date: '',
  });
  // 只读报价：过期批次一律视为 0（内存内 sweep，不落盘）
  const beforeQuote = await readAssets(P);
  const q = await eco.quoteBamboo(P, 5);
  assert.equal(q.current, 4, '过期批次不得计入可扣量');
  assert.equal(q.enough, false);
  assert.deepEqual(await readAssets(P), beforeQuote, '只读报价不落盘：资产 + 流水逐字节不变');

  let err = null;
  try {
    await eco.chargeBamboo(P, 5, { op: 'person_update', tree_id: 't1', person_handle: 'h' });
  } catch (e) {
    err = e;
  }
  assert.equal(err.status, 409, '30 片已过期 → 4 片不够 5 片');
  assert.equal(err.current, 4);

  // 4 片够 4 片：入口先 sweep（写 expire 流水）再扣
  const ok = await eco.chargeBamboo(P, 4, { op: 'person_update', tree_id: 't1', person_handle: 'h' });
  assert.equal(ok.fee.balance, 4, '余额口径 = sweep 之后的可扣量');
  assert.equal(ok.fee.balance_after, 0);
  const u = await readAssets(P);
  assert.ok(u.txs.some((t) => t.type === 'expire' && t.desc.includes('bl_expired')), '写 expire 流水');
  assert.equal(u.bamboos.some((l) => l.id === 'bl_expired'), false, '过期批次已被 sweep 剔除');
  assert.equal(el.sumLots(u.bamboos), 0);
  // 扣尽（qty=0）的批次按 §5-2-3 由**下一次** sweep 移除（不在扣费函数内直接 delete）
  await el.mutateAssets(P, (user) => el.sweep(user, new Date()));
  assert.deepEqual((await readAssets(P)).bamboos.map((l) => l.id), [], '扣尽批次在下一次资产入口被移除');
});

// ================= ④ 路由矩阵 =================

test('PUT /people/<handle>：401 / 403 / 400（无内容字段）/ 409（不足）/ 200（1 片 + fee）逐分支实测', async () => {
  const t = chainTree('fee_put', 1, 200);
  const ro = singleTree('fee_ro', { mirror: true });
  await scene({ trees: [t, ro], phone: STEWARD, bamboos: 1 });
  await scene({ phone: POOR, bamboos: 0 });
  const root = t.handles[0];
  const path0 = `/people/${root}`;
  const putBody = { primary_name: { first_name: '改名', surname_list: [{ surname: '甲' }] }, gender: 1 };
  const beforeTree = treeMd5('fee_put');
  const roBefore = treeMd5('fee_ro');

  // ① 未登录 → 401，不扣费
  const anon = await call(path0, 'PUT', { 'x-tree-id': 'fee_put' }, {}, putBody);
  assert.equal(anon.statusCode, 401);
  assert.equal(txCount(await readAssets(STEWARD)), 0, '鉴权先于扣费：401 不产生任何流水');
  assert.equal(treeMd5('fee_put'), beforeTree);

  // ② 游客 → 403，不扣费
  const guest = await call(path0, 'PUT', H('fee_put', GUEST), {}, putBody);
  assert.equal(guest.statusCode, 403);
  assert.equal(txCount(await readAssets(GUEST)), 0);
  assert.equal(treeMd5('fee_put'), beforeTree);

  // ③ 只读预检 403（上层镜像）→ 不扣费
  const mirror = await call(`/people/${ro.handle}`, 'PUT', H('fee_ro'), {}, putBody);
  assert.equal(mirror.statusCode, 403);
  assert.equal(txCount(await readAssets(STEWARD)), 0, '只读预检 403 在扣费之前');
  assert.equal(treeMd5('fee_ro'), roBefore, '镜像树未被写');

  // ④ 请求体无可修改内容 → 400 无效请求，不扣
  const invalid = await call(path0, 'PUT', H('fee_put'), {}, {});
  assert.equal(invalid.statusCode, 400);
  assert.equal(txCount(await readAssets(STEWARD)), 0);

  // ⑤ 成功一次 = 1 片（余额恰好 1 片 → 扣完）
  const ok = await call(path0, 'PUT', H('fee_put'), {}, putBody);
  assert.equal(ok.statusCode, 200);
  const okBody = bodyOf(ok);
  assert.deepEqual(okBody.fee, { unit: 'bamboos', pieces: 1, balance: 1, balance_after: 0 });
  const after = await readAssets(STEWARD);
  assert.deepEqual(txTypes(after), ['edit_fee'], '成功写一条 edit_fee 流水');
  assert.equal(el.sumLots(after.bamboos), 0);
  assert.notEqual(treeMd5('fee_put'), beforeTree, '树已落库');
  assert.equal(readTree('fee_put').people[root].name, '甲改名', '节点内容已改');

  // ⑥ 再改一次 → 409 资产不足（need 1 / current 0），树与资产不再变化
  const treeAfterOk = treeMd5('fee_put');
  const afterOk = await readAssets(STEWARD);
  const poorRes = await call(path0, 'PUT', H('fee_put'), {}, { ...putBody, gender: 2 });
  assert.equal(poorRes.statusCode, 409);
  const poorBody = bodyOf(poorRes);
  assert.equal(poorBody.code, 'ASSET_INSUFFICIENT');
  assert.equal(poorBody.need, 1);
  assert.equal(poorBody.current, 0);
  assert.equal(poorBody.unit, 'bamboos');
  assert.deepEqual(poorBody.how_to_get, eco.HOW_TO_GET);
  assert.equal(treeMd5('fee_put'), treeAfterOk, '409 不写树');
  assert.deepEqual(await readAssets(STEWARD), afterOk, '409 资产逐字节不变');

  // ⑦ 零资产账号直接 409（一字节不写）
  //    注意 body 必须带**真实差异**：第 ⑤ 步已把节点改成「甲改名 / M」，直接复用 putBody 就是
  //    no-op → 新版路由按契约回 200 unchanged（不扣费也就用不到余额），那条路径另有专门用例覆盖。
  const poorAnon = await call(path0, 'PUT', H('fee_put', POOR), {}, { ...putBody, birth_date: '1900' });
  assert.equal(poorAnon.statusCode, 409);
  assert.equal(txCount(await readAssets(POOR)), 0);
});

test('/admin/reparent：同树 1 片；跨树 9 片（带 5 个后代也是 9 片）；不足 409 两棵树都不写', async () => {
  // 同树改父：链 d2 改挂 root（1 片 = edit_fee）
  const same = chainTree('fee_same', 2, 300);
  await scene({ trees: [same], phone: STEWARD, bamboos: 10 });
  const sameRes = await call(
    '/admin/reparent',
    'POST',
    bee(STEWARD),
    {},
    { tree_id: 'fee_same', person_handle: same.handles[2], new_parent_id: same.people[same.handles[0]].gramps_id },
  );
  assert.equal(sameRes.statusCode, 200);
  const sameBody = bodyOf(sameRes);
  assert.equal(sameBody.cross_tree, false);
  assert.deepEqual(sameBody.fee, { unit: 'bamboos', pieces: 1, balance: 10, balance_after: 9 });
  assert.deepEqual(txTypes(await readAssets(STEWARD)), ['edit_fee']);

  // 跨树迁移：源树 root + 5 个后代（6 人）→ 9 片 / 次（**不是 9 × 6 = 54**）
  const src = chainTree('fee_src', 5, 400);
  const dst = singleTree('fee_dst');
  const src1 = chainTree('fee_src1', 0, 500);
  await scene({ trees: [src, dst, src1], phone: STEWARD, bamboos: 100 });
  const crossRes = await call(
    '/admin/reparent',
    'POST',
    bee(STEWARD),
    {},
    {
      tree_id: 'fee_src',
      person_handle: src.handles[0],
      new_parent_id: dst.tree.people[dst.handle].gramps_id,
      new_parent_tree_id: 'fee_dst',
    },
  );
  assert.equal(crossRes.statusCode, 200);
  const crossBody = bodyOf(crossRes);
  assert.equal(crossBody.cross_tree, true);
  assert.equal(crossBody.moved_people, 6, '连带迁移 6 人（root + 5 后代）');
  assert.deepEqual(crossBody.fee, { unit: 'bamboos', pieces: 9, balance: 100, balance_after: 91 }, '9 片 / 次，与人数无关');
  const srcAfter = readTree('fee_src');
  const dstAfter = readTree('fee_dst');
  assert.equal(srcAfter.people[src.handles[0]], undefined, '源树已清');
  assert.equal(Object.keys(dstAfter.people).length, 7, '目标树 1 + 6');
  const u = await readAssets(STEWARD);
  assert.deepEqual(txTypes(u), ['move_fee']);
  assert.deepEqual(u.txs[0].delta, { bamboos: -9 });
  assert.equal(el.sumLots(u.bamboos), 91);

  // 迁 1 人（无后代）→ 同样 9 片（绝不按人数计费）
  const oneRes = await call(
    '/admin/reparent',
    'POST',
    bee(STEWARD),
    {},
    {
      tree_id: 'fee_src1',
      person_handle: src1.handles[0],
      new_parent_id: dst.tree.people[dst.handle].gramps_id,
      new_parent_tree_id: 'fee_dst',
    },
  );
  assert.equal(oneRes.statusCode, 200);
  assert.equal(bodyOf(oneRes).moved_people, 1);
  assert.equal(bodyOf(oneRes).fee.pieces, 9, '迁 1 人也是 9 片');
  const u2 = await readAssets(STEWARD);
  assert.deepEqual(txTypes(u2), ['move_fee', 'move_fee']);
  assert.deepEqual(u2.txs[1].delta, { bamboos: -9 }, '迁 1 人也只扣 9 片');
  assert.match(u2.txs[1].desc, /跨树迁移/, 'desc 写人类可读说明（§2）');
  assert.equal(el.sumLots(u2.bamboos), 82);

  // 不足（余额 8 片 < 9 片）→ 409：**两棵树 md5 都不变**、资产不变、无流水
  const src2 = chainTree('fee_src2', 5, 600);
  const dst2 = singleTree('fee_dst2', { base: 700 });
  writeTree(src2.tree);
  writeTree(dst2.tree);
  await scene({ phone: POOR, bamboos: 8 });
  const src2Before = treeMd5('fee_src2');
  const dst2Before = treeMd5('fee_dst2');
  const poorRes = await call(
    '/admin/reparent',
    'POST',
    H('fee_src2', POOR),
    {},
    {
      tree_id: 'fee_src2',
      person_handle: src2.handles[0],
      new_parent_id: dst2.tree.people[dst2.handle].gramps_id,
      new_parent_tree_id: 'fee_dst2',
    },
  );
  assert.equal(poorRes.statusCode, 409);
  const pb = bodyOf(poorRes);
  assert.equal(pb.code, 'ASSET_INSUFFICIENT');
  assert.equal(pb.need, 9);
  assert.equal(pb.current, 8);
  assert.equal(treeMd5('fee_src2'), src2Before, '扣费失败 → 源树不写');
  assert.equal(treeMd5('fee_dst2'), dst2Before, '扣费失败 → 目标树不写');
  assert.deepEqual(txTypes(await readAssets(POOR)), [], '409 不写流水');
});

test('/admin/delete-node：dry_run 0 片 / 409 范围变化 0 片 / subtree 3N / promote 3 / 不足 409', async () => {
  const del = chainTree('fee_del', 5, 800); // root + 5 = 6 人
  const pro = chainTree('fee_pro', 1, 850); // root + 1 = 2 人
  const conf = chainTree('fee_conf', 5, 900);
  const poor = chainTree('fee_poor', 1, 950);
  await scene({ trees: [del, pro, conf, poor], phone: STEWARD, bamboos: 100 });
  await scene({ phone: POOR, bamboos: 0 });
  const delPath = '/admin/delete-node';

  // ① 未登录 401 / 游客 403 → 不扣费、不写树
  const delBefore = treeMd5('fee_del');
  assert.equal((await call(delPath, 'POST', {}, {}, { tree_id: 'fee_del', person_handle: del.handles[0] })).statusCode, 401);
  assert.equal(
    (await call(delPath, 'POST', H('fee_del', GUEST), {}, { tree_id: 'fee_del', person_handle: del.handles[0] })).statusCode,
    403,
  );
  assert.equal(treeMd5('fee_del'), delBefore);
  assert.equal(txCount(await readAssets(STEWARD)), 0);

  // ② dry_run → 0 片：响应带 fee（3 片 × 6 人 = 18），资产与流水逐字节不变、树不写
  const beforeDry = await readAssets(STEWARD);
  const dryRes = await call(delPath, 'POST', H('fee_del'), {}, { tree_id: 'fee_del', person_handle: del.handles[0], dry_run: true });
  assert.equal(dryRes.statusCode, 200);
  const dryBody = bodyOf(dryRes);
  assert.equal(dryBody.dry_run, true);
  assert.equal(dryBody.people_count, 6);
  assert.deepEqual(dryBody.fee, { unit: 'bamboos', pieces: 18, balance: 100, balance_after: 100 }, 'dry_run 免费但带 fee 供前端拼文案');
  assert.deepEqual(await readAssets(STEWARD), beforeDry, 'dry_run 资产 + 流水逐字节不变');
  assert.equal(treeMd5('fee_del'), delBefore, 'dry_run 不写树');

  // ③ confirm_count 不符 → 409 DELETE_SCOPE_CHANGED，0 片（校验先于扣费）
  const confBefore = treeMd5('fee_conf');
  const scopeRes = await call(
    delPath,
    'POST',
    H('fee_conf'),
    {},
    { tree_id: 'fee_conf', person_handle: conf.handles[0], confirm_count: 2 },
  );
  assert.equal(scopeRes.statusCode, 409);
  const scopeBody = bodyOf(scopeRes);
  assert.equal(scopeBody.code, 'DELETE_SCOPE_CHANGED');
  assert.match(scopeBody.error, /删除范围已变化（当前 6 人，确认时 2 人），请重新确认/);
  assert.deepEqual(await readAssets(STEWARD), beforeDry, '409 范围变化：资产与流水逐字节不变');
  assert.equal(treeMd5('fee_conf'), confBefore, '409 范围变化：树文件未被写');

  // ④ subtree 正式提交 → 3 片 × 6 人 = 18 片（delete_fee）
  const okRes = await call(
    delPath,
    'POST',
    H('fee_del'),
    {},
    { tree_id: 'fee_del', person_handle: del.handles[0], mode: 'subtree', confirm_count: 6 },
  );
  assert.equal(okRes.statusCode, 200);
  const okBody = bodyOf(okRes);
  assert.deepEqual(okBody.fee, { unit: 'bamboos', pieces: 18, balance: 100, balance_after: 82 });
  assert.equal(Object.keys(readTree('fee_del').people).length, 0, '整支已删');
  let u = await readAssets(STEWARD);
  assert.deepEqual(txTypes(u), ['delete_fee']);
  assert.deepEqual(u.txs[0].delta, { bamboos: -18 });
  assert.equal(el.sumLots(u.bamboos), 82);

  // ⑤ promote → 3 片
  const proRes = await call(
    delPath,
    'POST',
    H('fee_pro'),
    {},
    { tree_id: 'fee_pro', person_handle: pro.handles[0], mode: 'promote', confirm_count: 1 },
  );
  assert.equal(proRes.statusCode, 200);
  assert.deepEqual(bodyOf(proRes).fee, { unit: 'bamboos', pieces: 3, balance: 82, balance_after: 79 });
  assert.equal(readTree('fee_pro').people[pro.handles[0]], undefined, '仅删本节点');
  assert.ok(readTree('fee_pro').people[pro.handles[1]], '子女上提一级后仍存在');
  u = await readAssets(STEWARD);
  assert.deepEqual(txTypes(u), ['delete_fee', 'delete_fee']);
  assert.equal(el.sumLots(u.bamboos), 79);

  // ⑥ 不足 → 409（树不被写）
  const poorBefore = treeMd5('fee_poor');
  const poorRes = await call(
    delPath,
    'POST',
    H('fee_poor', POOR),
    {},
    { tree_id: 'fee_poor', person_handle: poor.handles[0], mode: 'promote', confirm_count: 1 },
  );
  assert.equal(poorRes.statusCode, 409);
  assert.equal(bodyOf(poorRes).need, 3);
  assert.equal(bodyOf(poorRes).current, 0);
  assert.equal(treeMd5('fee_poor'), poorBefore, '409 不写树');
  assert.deepEqual(txTypes(await readAssets(POOR)), []);
});

test('POST /admin/create-tree：不足 8 籽 409 不建树；9 籽建树扣 tree_create；落库失败原路返还同一批次', async () => {
  const newTreesIn = () => Object.keys(JSON.parse(fs.readFileSync(META_FILE, 'utf8')).trees);

  // ① 籽不足（8 < 9）→ 409 + need 9，不建树、资产逐字节不变
  await scene({ phone: CHIEF, seeds: 8 });
  const beforeMeta = newTreesIn();
  const beforeBag = bagOf(await readAssets(CHIEF));
  const poorRes = await call('/admin/create-tree', 'POST', bee(CHIEF), {}, { surname_char: '雷', founder_name: '震' });
  assert.equal(poorRes.statusCode, 409);
  const pb = bodyOf(poorRes);
  assert.equal(pb.code, 'ASSET_INSUFFICIENT');
  assert.equal(pb.need, 9);
  assert.equal(pb.current, 8);
  assert.equal(pb.unit, 'seeds');
  assert.equal(pb.error, '资产不足，需 9颗石榴籽，当前 8 颗', '建树 409 文案口径：9颗石榴籽（不带空格 / 不带「完整」，用户拍板）');
  assert.deepEqual(newTreesIn(), beforeMeta, '不足 → 不建树');
  assert.equal(bagOf(await readAssets(CHIEF)), beforeBag, '不足 → 籽一字节不动');
  assert.deepEqual(txTypes(await readAssets(CHIEF)), []);

  // ② 9 籽 → 建树成功，扣 9颗石榴籽（非竹片），写 tree_create 流水
  await scene({ phone: CHIEF, seeds: 9 });
  const okRes = await call('/admin/create-tree', 'POST', bee(CHIEF), {}, { surname_char: '雷', founder_name: '震' });
  assert.equal(okRes.statusCode, 200);
  const created = bodyOf(okRes);
  assert.ok(created.tree_id, '返回新树 id');
  const after = await readAssets(CHIEF);
  assert.equal(el.sumLots(after.seeds), 0, '扣 9 籽');
  assert.deepEqual(txTypes(after), ['tree_create']);
  assert.deepEqual(after.txs[0].delta, { seeds: -9 });
  assert.equal(after.txs[0].operator, CHIEF);
  assert.equal(after.txs[0].ref.tree_id, created.tree_id, 'ref.tree_id = onBeforeWrite 拿到的 plannedTreeId');
  assert.ok(fs.existsSync(path.join(TMP, 'trees', `${created.tree_id}.json`)), '树 JSON 已落库');
  assert.ok(newTreesIn().includes(created.tree_id), 'tree-meta 已登记');
  // 旧 ¥ 钩子已废弃：不再写 jiazu_wallets（wallet.deductTreeCreateFee 不再被调用）
  assert.equal(fs.existsSync(path.join(TMP, 'collections', 'jiazu_wallets.json')), false, '不得再走 ¥ 建树费');

  // ③ 落库失败 → 原路返还同一批次（把 trees 目录临时占位成文件，制造真实落库失败）
  await scene({ phone: CHIEF, seeds: 9 });
  const seedLotId = (await readAssets(CHIEF)).seeds[0].id;
  const seedsBefore = JSON.stringify((await readAssets(CHIEF)).seeds);
  const treesDir = path.join(TMP, 'trees');
  const stash = fs.readdirSync(treesDir).map((f) => [f, fs.readFileSync(path.join(treesDir, f))]);
  fs.rmSync(treesDir, { recursive: true, force: true });
  fs.writeFileSync(treesDir, 'blocked'); // 目录被文件占位 → createTreeFile 必失败
  let failRes = null;
  try {
    failRes = await call('/admin/create-tree', 'POST', bee(CHIEF), {}, { surname_char: '雷', founder_name: '震' });
  } finally {
    fs.rmSync(treesDir, { force: true });
    fs.mkdirSync(treesDir, { recursive: true });
    for (const [f, buf] of stash) fs.writeFileSync(path.join(treesDir, f), buf);
  }
  assert.ok(failRes.statusCode >= 400, '落库失败 → 非 2xx');
  assert.equal(bodyOf(failRes).fee_refunded, true, '响应带 fee_refunded');
  const refunded = await readAssets(CHIEF);
  assert.equal(el.sumLots(refunded.seeds), 9, '籽已原路返还');
  assert.equal(JSON.stringify(refunded.seeds), seedsBefore, '原路返还**同一批次**（同 id / 同 expires_at / 同 qty）');
  assert.equal(refunded.seeds[0].id, seedLotId);
  assert.equal(eco.FEE.tree_create_seeds, 9);
  assert.deepEqual(txTypes(refunded), ['tree_create', 'fee_refund']);
  assert.deepEqual(refunded.txs[1].delta, { seeds: 9 }, 'fee_refund delta 取原值反向');
  assert.match(refunded.txs[1].desc, /冲正原流水/, 'fee_refund desc 写明原 Tx');
  assert.equal(refunded.txs[1].ref.txn_id, refunded.txs[0].id, 'ref 沿用原流水 id');

  // ④ 删除路径不触籽（删树不退）：新建树内删节点不改变籽总量与批次
  const delTarget = singleTree('fee_delns');
  writeTree(delTarget.tree);
  const seedsBagBefore = bagOf(await readAssets(CHIEF));
  const deleted = await tw.deleteNode({
    treeId: 'fee_delns',
    personHandle: delTarget.handle,
    mode: 'promote',
    masterTreeId: 'zhonghua',
  });
  assert.equal(deleted.ok, true);
  assert.equal(deleted.fee, null, '未接闸门调用（0 片）→ 无 fee');
  assert.equal(bagOf(await readAssets(CHIEF)), seedsBagBefore, '删除路径不写 seeds / 不返还建树籽');
});

// ================= ⑤ 落库失败冲正 =================

test('落库失败冲正（真实路径）：PUT /people 落库抛错 → fee_refunded + 资产与批次逐字节还原', async () => {
  const t = chainTree('fee_put', 1, 200);
  await scene({ trees: [t], phone: STEWARD, bamboos: 5 });
  // 额外造两个批次（含一个更早到期的），验证冲正回到**原批次**而不是新造批次
  await setAssets(STEWARD, {
    fragments: 0,
    seeds: [],
    bamboos: [bambooLot(2, 5, 'bl_soon'), bambooLot(3, 300, 'bl_far')],
    jades: [],
    txs: [],
    signin_date: '',
  });
  const before = await readAssets(STEWARD);
  const bagBefore = bagOf(before);
  const treeBefore = treeMd5('fee_put');

  // 落库失败注入：handle 不存在 → chargeBamboo 成功 → tw.updatePerson 在 updateTree 闭包内抛错
  const res = await call('/people/不存在的句柄', 'PUT', H('fee_put'), {}, { gender: 1, primary_name: { first_name: 'x' } });
  assert.equal(res.statusCode, 400);
  const body = bodyOf(res);
  assert.equal(body.fee_refunded, true, '响应带 fee_refunded（§6）');
  assert.equal(bagOf(await readAssets(STEWARD)), bagBefore, '资产总分 + 批次逐字节还原');
  const after = await readAssets(STEWARD);
  assert.deepEqual(txTypes(after), ['edit_fee', 'fee_refund'], '扣费 + 冲正各一条流水');
  assert.deepEqual(after.txs[1].delta, { bamboos: 1 }, 'fee_refund delta 取原值反向');
  assert.equal(after.txs[1].ref.txn_id, after.txs[0].id);
  assert.deepEqual(
    after.txs[0].ref.lots.map((l) => l.lot_id),
    ['bl_soon'],
    '原流水记录批次明细 → 冲正可原路返还',
  );
  assert.equal(el.sumLots(after.bamboos), 5, '净扣减为 0（不丢用户资产）');
  assert.equal(treeMd5('fee_put'), treeBefore, '落库失败 → 树文件未被写');
});

test('落库失败冲正（mock 注入）：refund / refundAssets 原路返还同一批次；批次已 sweep 也不新造 id', async () => {
  const P = '16600009105';
  await setAssets(P, {
    fragments: 0,
    seeds: [],
    bamboos: [bambooLot(1, 3, 'bl_tiny'), bambooLot(4, 200, 'bl_big')],
    jades: [],
    txs: [],
    signin_date: '',
  });
  const before = await readAssets(P);

  // 扣 4 片：1 片命中最早到期的 bl_tiny（恰好取尽）+ 3 片取 bl_big
  const charged = await eco.chargeBamboo(P, 4, { op: 'person_update', tree_id: 't1', person_handle: 'h1' });
  assert.deepEqual(charged.spent.map((s) => s.lot_id), ['bl_tiny', 'bl_big']);
  assert.equal(el.sumLots((await readAssets(P)).bamboos), 1);

  // 模拟「落库失败」→ 按流水 id 冲正（§5-1 的 refundAssets 路径）
  const r = await eco.refundAssets(P, charged.txn_id, '落库失败（mock 注入）');
  assert.equal(r.ok, true);
  assert.equal(r.refunded, 4);
  const after = await readAssets(P);
  assert.equal(bagSorted(after), bagSorted(before), '资产与批次逐字段还原（同 id / 同 expires_at / 同 qty）');
  assert.deepEqual(txTypes(after), ['edit_fee', 'fee_refund']);
  assert.match(after.txs[1].desc, /落库失败（mock 注入）/);
  assert.equal(after.txs[1].operator, P);

  // 冲正后再扣一次 4 片：仍命中最早到期的原批次（证明确实「原路」而非另造批次）
  const again = await eco.chargeBamboo(P, 4, { op: 'person_update', tree_id: 't1', person_handle: 'h1' });
  assert.deepEqual(again.spent.map((s) => s.lot_id), ['bl_tiny', 'bl_big']);
  // 再冲正（refund 直接注入 taken，覆盖 refundCharged 之外的 refund 导出）
  const r2 = await eco.refundCharged(P, again, '再次 mock 落库失败');
  assert.equal(r2.ok, true);
  assert.equal(bagSorted(await readAssets(P)), bagSorted(before));

  // 批次已被 sweep 的场景：扣尽后 sweep 移除 → 冲正仍按原 lot_id / expires_at 复原同一批次
  const Q = '16600009106';
  await setAssets(Q, { fragments: 0, seeds: [], bamboos: [bambooLot(2, 30, 'bl_gone')], jades: [], txs: [], signin_date: '' });
  const c2 = await eco.chargeBamboo(Q, 2, { op: 'person_update', tree_id: 't1', person_handle: 'h' });
  await el.mutateAssets(Q, (u) => {
    el.sweep(u, new Date(Date.now() + 40 * DAY)); // 40 天后 sweep：批次数已扣尽 → 就地移除、无残留
  });
  assert.equal((await readAssets(Q)).bamboos.length, 0);
  await eco.refund(Q, c2.spent, { unit: 'bamboos', txn_id: c2.txn_id, reason: '落库失败' });
  const q = await readAssets(Q);
  assert.deepEqual(q.bamboos.map((l) => l.id), ['bl_gone'], '复原**同一** lot_id，不新造批次');
  assert.equal(q.bamboos[0].expires_at, c2.spent[0].expires_at, '保留原 expires_at（不因冲正续命）');
  assert.equal(el.sumLots(q.bamboos), 2);
  assert.equal(txTypes(q).includes('fee_refund'), true);
});

// ================= ⑤-2 资产总览读接口 =================

test('getAssetSummary：与账本内核 summarize 同形状（从未有资产的手机号也不报错）', async () => {
  const P = '16600009150';
  await setAssets(P, {
    fragments: 3,
    seeds: [seedLot(9, 100, 'sl_sum_1')],
    bamboos: [bambooLot(150, 100, 'bl_sum_1')],
    jades: [{ id: 'jd_sum_1', expires_at: null }],
    txs: [],
    signin_date: '2026-09-16',
  });
  // 缺陷回归：getAssetSummary 内调 sweep / summarize 而 import 漏了 summarize → 一调即 ReferenceError
  const s = await eco.getAssetSummary(P);
  assert.deepEqual(s, el.summarize(await readAssets(P)), '字段口径 = 账本内核 summarize（本册不另立字段名）');
  assert.deepEqual(Object.keys(s).sort(), Object.keys(el.summarize({}, new Date())).sort(), '与 summarize 同形状');
  assert.equal(s.fragments, 3);
  assert.equal(s.fragment_cap, el.FRAGMENT_CAP);
  assert.equal(s.seeds_total, 9);
  assert.equal(s.seed_lot_count, 1);
  assert.equal(s.seed_lots.length, 1);
  assert.equal(s.bamboos_total_pieces, 150);
  assert.equal(s.bamboo_bundles, 1, '150 片 → 1 束（折整）');
  assert.equal(s.bamboo_lot_count, 1);
  assert.equal(s.jades_total, 1);
  assert.equal(s.jades[0].permanent, true, 'jade.expires_at=null → permanent');
  assert.equal(s.signin_date, '2026-09-16');
  assert.deepEqual(s.txs, []);
  assert.deepEqual(s.expiring, el.expiringItems(await readAssets(P)));

  // 幂等：连读两次结果逐字段一致（sweep 在写路径内，不产生额外流水）
  assert.deepEqual(await eco.getAssetSummary(P), s);
  assert.deepEqual(txTypes(await readAssets(P)), [], 'sweep 无过期批次 → 不写流水');

  // 从未有资产的手机号：不抛错、全 0、形状与有资产账号一致
  const NEVER = '16600009151';
  const b = await eco.getAssetSummary(NEVER);
  assert.deepEqual(Object.keys(b).sort(), Object.keys(s).sort(), '从未有资产的账号：同一形状');
  assert.equal(b.fragments, 0);
  assert.equal(b.seeds_total, 0);
  assert.equal(b.bamboos_total_pieces, 0);
  assert.equal(b.bamboo_bundles, 0);
  assert.equal(b.jades_total, 0);
  assert.deepEqual(b.seed_lots, []);
  assert.deepEqual(b.bamboo_lots, []);
  assert.deepEqual(b.txs, []);
  assert.equal(b.signin_date, '');
});

// ================= ⑥ 0 片行穷举 =================

const INDEX_LINES = fs.readFileSync(path.join(REPO, 'cloudfunctions/compat-api/index.js'), 'utf8').split('\n');
const GATE_RE = /feeGate\(|eco\.charge|eco\.charger\(/;
/**
 * 路由守卫行（分支边界）：字面量 `pathname === 'x'` / 前缀 `pathname.startsWith('x')` /
 * 正则 `pathname.match(...)` —— 三者都要算边界，否则一个 `pathname === '/people'`（POST）
 * 的分支会吞掉紧随其后的 `peMatch && method === 'PUT'`（PUT /people/<handle> 是**计费**路由，
 * 会把 0 片清单里的 /people 误判成「误接闸门」）。
 */
const ROUTE_GUARD_RE = /pathname\s*(?:===|\.startsWith\(|\.match\()/;
/** index.js 中某路由（字面量形式）的全部分支片段：从该守卫行到**下一个**路由守卫行之前 */
function branchesOf(routePath) {
  const out = [];
  INDEX_LINES.forEach((line, i) => {
    if (!line.includes(`pathname === '${routePath}'`)) return;
    let end = INDEX_LINES.length;
    for (let j = i + 1; j < INDEX_LINES.length; j++) {
      if (ROUTE_GUARD_RE.test(INDEX_LINES[j])) {
        end = j;
        break;
      }
    }
    out.push(INDEX_LINES.slice(i, end).join('\n'));
  });
  return out;
}

/**
 * §3-1 的 0 片行 + §3-2 附录（index.js 里以字面量 pathname 判定的路由）。
 *
 * 清单必须与 index.js **实际存在的路由**逐条一致：幽灵路由不得再放过（P1 质检删掉了不存在的
 * `POST /admin/reject-leave` —— index.js 只有 `POST /leave-request`、`GET /admin/leave-requests`、
 * `POST /admin/approve-leave`，驳回靠 `approve:false`）。
 */
const ZERO_FEE_ROUTES = [
  '/admin/add-child',
  '/admin/add-spouse',
  '/admin/chain-append',
  '/admin/chain-append-batch',
  '/admin/founder-request',
  '/admin/decide-founder',
  '/admin/attach-founder',
  '/admin/detach-founder',
  '/admin/remove-branch-link',
  '/admin/reset-founder',
  '/admin/clan-request',
  '/admin/decide-clan',
  '/marriage-request',
  '/admin/approve-marriage',
  '/admin/reject-marriage',
  '/admin/marry-end',
  '/admin/split-tree',
  '/tree-meta',
  '/people',
  '/families',
  '/join-request',
  '/leave-request',
  '/admin/approve-join',
  '/admin/reject-join',
  '/admin/approve-leave',
  '/admin/set-role',
  '/admin/set-anchor',
  '/admin/wallet-fee',
  '/wallet/recharge',
  '/wallet/transfer',
];

test('0 片穷举：矩阵里 30 条 0 片路由均未接闸门（源码级）+ POST /people 实跑资产逐字节不变', async () => {
  const offenders = [];
  const missing = [];
  let checked = 0;
  for (const p of ZERO_FEE_ROUTES) {
    const branches = branchesOf(p);
    if (!branches.length) {
      missing.push(p);
      continue;
    }
    checked += branches.length;
    for (const b of branches) if (GATE_RE.test(b)) offenders.push(p);
  }
  assert.deepEqual(offenders, [], `这些 0 片路由被误接了闸门（矩阵即契约）：${offenders.join(', ')}`);
  assert.ok(checked >= 30, `实际扫描到的 0 片路由分支片段仅 ${checked} 个`);
  // 清单必须与 index.js 实际路由逐条对上：**一条都不许缺**（幽灵路由 / 改名漏改一律红灯，
  // 不得为了跑绿把断言放松 —— P1 质检已删掉不存在的 POST /admin/reject-leave）
  assert.equal(missing.length, 0, `0 片清单与 index.js 对不上的路由（幽灵或改名）：${missing.join(', ')}`);
  assert.equal(ZERO_FEE_ROUTES.length, 30, '0 片清单条数固定（矩阵即契约）');

  // 正向对照：4 条计费路由都确实接了闸门
  for (const p of ['/admin/reparent', '/admin/delete-node', '/admin/create-tree']) {
    const snippets = branchesOf(p).join('\n');
    assert.ok(GATE_RE.test(snippets), `${p} 应接入扣费闸门`);
  }
  assert.ok(
    INDEX_LINES.some((l) => l.includes('eco.chargeBamboo(u.phone, eco.FEE.person_update')),
    'PUT /people/<handle> 必须走 chargeBamboo + FEE.person_update',
  );

  // 实跑一条 0 片路由：POST /people（新增）→ 资产总分与流水逐字节不变
  // 独立 tree_id（fee_zero）：避开 store 进程内 treeCache 与其它用例建树 / 删树的别名干扰
  const t = singleTree('fee_zero');
  writeTree(t.tree);
  await scene({ phone: STEWARD, bamboos: 7 });
  const before = await readAssets(STEWARD);
  const res = await call('/people', 'POST', H('fee_zero'), {}, { primary_name: { first_name: '新增', surname_list: [{ surname: '甲' }] }, gender: 1 });
  assert.equal(res.statusCode, 201, '新增人物成功');
  assert.equal(bagOf(await readAssets(STEWARD)), bagOf(before), '新增类 0 片：资产逐字节不变');
  assert.equal(txCount(await readAssets(STEWARD)), 0, '新增类不写任何流水');

  // §9-1 #2 硬要求：0 片行必须**含总谱 `zhonghua` 与祖谱 `kind='clan'` 各至少一例**（实跑，不只看源码）
  const master = singleTree('zhonghua');
  const clan = singleTree('fee_clan');
  writeTree(master.tree);
  writeTree(clan.tree);
  await scene({ phone: CHIEF, bamboos: 3, seeds: 2 });
  const chiefBefore = bagOf(await readAssets(CHIEF));
  const masterRes = await call('/people', 'POST', H('zhonghua', CHIEF), {}, { primary_name: { first_name: '总谱新增', surname_list: [{ surname: '华' }] }, gender: 1 });
  assert.equal(masterRes.statusCode, 201, '总谱（zhonghua，chief_editor）新增成功');
  const clanRes = await call('/people', 'POST', H('fee_clan'), {}, { primary_name: { first_name: '祖谱新增', surname_list: [{ surname: '甲' }] }, gender: 1 });
  assert.equal(clanRes.statusCode, 201, '祖谱（kind=clan）新增成功');
  assert.equal(bagOf(await readAssets(CHIEF)), chiefBefore, '总谱 / 祖谱新增同样 0 片：资产逐字节不变');
  assert.equal(txCount(await readAssets(CHIEF)), 0, '总谱 / 祖谱新增不写任何流水');

  // 正则匹配（非字面量 pathname）的 0 片行 #16 `PUT /families/<handle>`：分支体同样不得出现闸门
  const famIdx = INDEX_LINES.findIndex((l) => l.includes("famMatch && method === 'PUT'"));
  assert.ok(famIdx > 0, '源码里应能找到 PUT /families/<handle> 分支');
  let famEnd = INDEX_LINES.length;
  for (let j = famIdx + 1; j < INDEX_LINES.length; j++) {
    if (ROUTE_GUARD_RE.test(INDEX_LINES[j])) {
      famEnd = j;
      break;
    }
  }
  assert.equal(
    GATE_RE.test(INDEX_LINES.slice(famIdx, famEnd).join('\n')),
    false,
    'PUT /families/<handle> 不得接闸门（矩阵 #16 = 0 片）',
  );
});

// ================= ⑥-2 冲正回显统一（fee_refunded） =================

test('冲正回显统一：4 条计费路由落库失败一律带 fee_refunded:true（/admin/reparent、/admin/delete-node 实测）', async () => {
  // 源码口径：四条 catch 一律 `…refunded ? { fee_refunded: true } : {}`（PUT /people、/admin/create-tree、
  // /admin/reparent、/admin/delete-node 各一处；冲正才回显，未扣费 / 冲正失败不带）
  const hits = (INDEX_LINES.join('\n').match(/refunded \? \{ fee_refunded: true \} : \{\}/g) || []).length;
  assert.equal(hits, 4, '四条冲正分支口径必须统一');
  for (const p of ['/admin/reparent', '/admin/delete-node']) {
    assert.match(branchesOf(p).join('\n'), /refunded \? \{ fee_refunded: true \}/, `${p} 冲正分支应回显 fee_refunded`);
  }

  // ① /admin/reparent 落库失败（树文件 0444 → writeFileSync EACCES）→ 冲正 + fee_refunded:true
  const rp = chainTree('fee_ref_rp', 2, 1400);
  await scene({ trees: [rp], phone: STEWARD, bamboos: 10 });
  const rpFile = path.join(TMP, 'trees', 'fee_ref_rp.json');
  const rpBefore = await readAssets(STEWARD);
  fs.chmodSync(rpFile, 0o444);
  let rpRes = null;
  try {
    rpRes = await call(
      '/admin/reparent',
      'POST',
      H('fee_ref_rp'),
      {},
      { tree_id: 'fee_ref_rp', person_handle: rp.handles[2], new_parent_id: rp.people[rp.handles[0]].gramps_id },
    );
  } finally {
    fs.chmodSync(rpFile, 0o644);
  }
  assert.ok(rpRes.statusCode >= 400, '落库失败 → 非 2xx');
  assert.equal(bodyOf(rpRes).fee_refunded, true, '/admin/reparent 冲正回显 fee_refunded:true');
  const rpAfter = await readAssets(STEWARD);
  assert.equal(bagSorted(rpAfter), bagSorted(rpBefore), '冲正 → 资产逐字节还原');
  assert.deepEqual(txTypes(rpAfter), ['edit_fee', 'fee_refund']);

  // ② /admin/delete-node 落库失败 → 冲正 + fee_refunded:true（且错误体不透传 errno / 本机路径）
  const dn = chainTree('fee_ref_dn', 1, 1500);
  await scene({ trees: [dn], phone: STEWARD, bamboos: 10 });
  const dnFile = path.join(TMP, 'trees', 'fee_ref_dn.json');
  const dnBefore = await readAssets(STEWARD);
  fs.chmodSync(dnFile, 0o444);
  let dnRes = null;
  try {
    dnRes = await call(
      '/admin/delete-node',
      'POST',
      H('fee_ref_dn'),
      {},
      { tree_id: 'fee_ref_dn', person_handle: dn.handles[0], mode: 'promote', confirm_count: 1 },
    );
  } finally {
    fs.chmodSync(dnFile, 0o644);
  }
  assert.ok(dnRes.statusCode >= 400, '落库失败 → 非 2xx');
  assert.equal(bodyOf(dnRes).fee_refunded, true, '/admin/delete-node 冲正回显 fee_refunded:true');
  const dnAfter = await readAssets(STEWARD);
  assert.equal(bagSorted(dnAfter), bagSorted(dnBefore), '冲正 → 资产逐字节还原');
  assert.deepEqual(txTypes(dnAfter), ['delete_fee', 'fee_refund']);
  const dnBody = bodyOf(dnRes);
  assert.equal(dnBody.error, eco.INTERNAL_ERROR_TEXT, '落库失败是系统错误 → 通用文案');
  assert.equal('code' in dnBody === false || dnBody.code !== 'EACCES', true, 'errno 不得作为业务 code 回显');
  const dnRaw = JSON.stringify(dnBody);
  for (const leak of ['EACCES', 'permission denied', TMP]) {
    assert.equal(dnRaw.includes(leak), false, `落库失败响应不得泄露「${leak}」：${dnRaw}`);
  }
  assert.equal(readTree('fee_ref_dn').people[dn.handles[0]] !== undefined, true, '落库失败 → 磁盘上的树未被写');

  // ③ 未冲正的分支不带该字段：401（未登录）/ 409（资产不足）
  // 独立树 id：上一步落库失败会把改动留在 store 进程内 treeCache（对象引用），复用同一棵树会读到脏快照
  const dn2 = chainTree('fee_ref_dn2', 1, 1600);
  await scene({ trees: [dn2], phone: STEWARD, bamboos: 10 });
  await scene({ phone: POOR, bamboos: 0 });
  const unauth = await call('/admin/delete-node', 'POST', {}, {}, { tree_id: 'fee_ref_dn2', person_handle: dn2.handles[0] });
  assert.equal(unauth.statusCode, 401, '未登录 401');
  assert.equal('fee_refunded' in bodyOf(unauth), false, '401 不带 fee_refunded');
  assert.equal(readTree('fee_ref_dn2').people[dn2.handles[0]] !== undefined, true, '401 不写树');
  const poorRes = await call(
    '/admin/delete-node',
    'POST',
    H('fee_ref_dn2', POOR),
    {},
    { tree_id: 'fee_ref_dn2', person_handle: dn2.handles[0], mode: 'promote', confirm_count: 1 },
  );
  assert.equal(poorRes.statusCode, 409, '余额不足 409');
  assert.equal(bodyOf(poorRes).code, 'ASSET_INSUFFICIENT');
  assert.equal('fee_refunded' in bodyOf(poorRes), false, '409 未扣费 → 不带 fee_refunded');
});

// ================= ⑦ 真源未变 =================

test('本文件全程未写真实数据：config/tree-meta.json 与 migrate-output/（trees + details + collections）逐字节未变', () => {
  assert.equal(fs.readFileSync(REAL_META, 'utf8'), realMetaRaw, 'config/tree-meta.json 被改动了');
  assert.equal(md5(REAL_META), realMetaMd5, 'config/tree-meta.json 的 md5 变了');
  for (const [dir, baseline, label] of [
    [REAL_TREES, realTreeBaseline, '真实树'],
    [REAL_DETAILS, realDetailBaseline, '真实详情'],
    [REAL_COLLECTIONS, realColBaseline, '真实集合'],
  ]) {
    const files = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).sort();
    assert.deepEqual(files, [...baseline.keys()].sort(), `${label}目录文件名/数量变了`);
    for (const f of files) assert.equal(md5(path.join(dir, f)), baseline.get(f), `${label} ${f} 被改动了`);
  }
});
