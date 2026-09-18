/**
 * 兼容层 API（P1 只读 + P2 写接口）
 *
 * 输出 Gramps-Web 形状 JSON，前端 business/api.ts 解析逻辑零改动。
 * 数据源：树 JSON（云存储）+ 人物详情/业务集合（CloudBase 文档库，jiazu_ 前缀）。
 * 双模式：COMPAT_SOURCE=local（读/写 migrate-output/）| cloud（默认，CloudBase）。
 *
 * 写接口（P2）：
 *   POST /auth/send-code | /auth/register | /auth/login
 *   GET  /auth/me
 *   GET  /wallet/balance
 *   POST /wallet/recharge
 *   /wallet/transfer、/wallet/tree-balance：**家族树资金功能已下线** → 恒 410（`TREE_FUND_RETIRED`，docs/economy.spec.md §12-3）
 *   GET  /search/global（全站人物搜索：姓名 / 编号，跨树 + 节点级可见裁剪；无需 X-Tree-Id，注册在树编辑闸门之前）
 *   GET  /assets/summary | /assets/expiring（资产账本 · docs/economy.spec.md §6-1）
 *   POST /assets/synthesize-jade | /assets/decompose-jade（石榴籽玉合成 / 分解）
 *   GET  /spirit | POST /spirit/mount-jade | /spirit/charge（时流子域 · docs/spirit-domain.spec.md §6 / §7）
 *   GET  /market/listings（guest 可读）| GET /market/my | POST /market/list | /market/cancel | /market/buy |
 *   /market/official-buy（市集 + 官方竹简每日限量发售 · docs/economy-market.spec.md §6 / §7；挂单与家族树无关 K7）
 *   POST /assets/signin（签到：北京时间自然日各 1 碎片；同日重复 409「今日已签到」，§6-2）
 *   GET  /messages | POST /messages/read（站内信中心：四类预警惰性生成 + 已读，docs/economy-ops.spec.md §4）
 *   POST /admin/assets/grant | GET /admin/assets/logs | /admin/assets/user（资产运维 · 仅 chief_editor，§5）
 *   POST /account/delete（账号注销：注销前置挂单检查 → 清空四类资产 + account_clear 流水，§7 / K10）
 *   PUT  /admin/wallet-fee | /tree-meta
 *   GET  /admin/users | /admin/get-anchor | /admin/leave-requests
 *   POST /admin/set-role | /admin/set-anchor | /admin/approve-leave
 *   POST /admin/split-tree | /admin/remove-branch-link
 *   POST /admin/chain-append | /admin/chain-append-batch（总谱续编：单节点续编 / 批量「一条线」最多 10 代·单事务）
 *   POST /admin/delete-node（删除节点：连同全部后代 / 仅本节点·子女上提一级；跨树引用 → 409 拒绝）
 *   POST /admin/establish-branch（立支：祖先链并入宗谱 + 新建家族树；9999 颗石榴籽 · docs/branch-clan-ops.spec.md）
 *   POST /admin/converge-clan（汇宗：源树整体并入他树普通节点；0 片 0 籽 + 灵气折损并入）
 *   POST /admin/add-spouse | /admin/add-child（跨树婚姻家庭的子女自动归到真身树）
 *   POST /admin/founder-request | /admin/decide-founder | /admin/attach-founder | /admin/detach-founder
 *   POST /admin/reset-founder（重置始祖：清空本树始祖登记 → 「无始祖」态）
 *   GET  /admin/founder-requests（始祖挂载 / 认祖，docs/founder-attach.spec.md）
 *   POST /admin/clan-request | /admin/decide-clan
 *   GET  /admin/clan-requests | /admin/clans | /admin/clan-info（祖谱，docs/clan-tree.spec.md）
 *   POST /join | /leave-request
 *   POST /people/ | PUT /people/<handle> | POST /families/ | PUT /families/<handle>
 */
import { getMeta, saveMeta, getTree, getAllDetails, getDetail, getEventIndex, colGet, colAll, colSet, updateTrees } from './lib/store.js';
import { signJwt, authUser, requestCode, verifyCode, findOrCreateUser, ROLE_LEVEL } from './lib/auth.js';
import * as wallet from './lib/wallet.js';
import * as ledger from './lib/economy-ledger.js';
import * as eco from './lib/economy-fee.js';
import * as spirit from './lib/economy-spirit.js';
import * as market from './lib/economy-market.js';
import * as ops from './lib/economy-ops.js';
import { getAnchor, setAnchor, clearAnchor, canEditPerson } from './lib/scope.js';
import * as tw from './lib/tree-write.js';
import * as mr from './lib/marriage.js';
import * as cw from './lib/child-write.js';
import * as fa from './lib/founder-attach.js';
import * as clan from './lib/clan.js';
import * as bco from './lib/branch-clan-ops.js';
import { resolveNode } from './lib/id-resolve.js';
import { idAllocator, reserveFamilyIds, reservePersonIds, numberOfId } from './lib/id-seq.js';
import { treeActivity } from './lib/tree-activity.js';
import { computeAccess, isHiddenFamily, accessToPayload, computePersonDepth } from './lib/tree-access.js';

const MASTER_TREE_ID = process.env.MASTER_TREE_ID || 'zhonghua';
const MAX_DEPTH = 72;

// ---- 工具 ----

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function parseBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    return {};
  }
}

// ---- 等级计算（P1 复用） ----

const RANKS = {
  family: { key: 'family_rank', label: '家乘级', en: 'Family-Rank', desc: '短程亲属谱系，合计总世代 ≤9 世' },
  clan: { key: 'clan_rank', label: '族乘级', en: 'Clan-Rank', desc: '中程亲属谱系，合计总世代 10-18 世' },
  lineage: { key: 'lineage_rank', label: '宗乘级', en: 'Lineage-Rank', desc: '长程亲属谱系，合计总世代 19-72 世' },
  stemma: { key: 'stemma_rank', label: '世乘级', en: 'Stemma-Rank', desc: '远古长程谱系记录，合计总世代 >72 世' },
};

function computeTreeDepth(tree, explicitGens) {
  if (explicitGens && explicitGens.size > 0) {
    return { totalGenerations: Math.max(...explicitGens.values()), personCount: explicitGens.size, explicit: true };
  }
  const childOf = new Map();
  const parentOf = new Map();
  for (const f of Object.values(tree.families)) {
    const parents = [f.father_handle, f.mother_handle].filter(Boolean);
    for (const c of f.child_handles || []) {
      if (!childOf.has(c)) childOf.set(c, new Set());
      for (const p of parents) childOf.get(c).add(p);
    }
    for (const p of parents) {
      if (!parentOf.has(p)) parentOf.set(p, new Set());
      for (const c of f.child_handles || []) parentOf.get(p).add(c);
    }
  }
  const allPeople = new Set([...Object.keys(tree.people), ...childOf.keys(), ...parentOf.keys()]);
  const roots = [...allPeople].filter((p) => !childOf.has(p) || childOf.get(p).size === 0);
  if (roots.length === 0) return { totalGenerations: 1, personCount: allPeople.size, explicit: false };
  const depth = new Map();
  const queue = [...roots];
  for (const r of roots) depth.set(r, 1);
  let maxDepth = 1;
  let guard = 0;
  while (queue.length && guard < 100000) {
    guard++;
    const cur = queue.shift();
    const curDepth = depth.get(cur) || 1;
    for (const child of parentOf.get(cur) || []) {
      const nd = curDepth + 1;
      if (nd > (depth.get(child) || 0)) {
        depth.set(child, nd);
        maxDepth = Math.max(maxDepth, nd);
        queue.push(child);
      }
    }
  }
  return { totalGenerations: maxDepth, personCount: allPeople.size, explicit: false };
}

function rankFromDepth(total) {
  if (total <= 9) return RANKS.family;
  if (total <= 18) return RANKS.clan;
  if (total <= 72) return RANKS.lineage;
  return RANKS.stemma;
}

// ---- 形状转换（Gramps RawPerson 兼容） ----

const GENDER_NUM = { M: 1, F: 2, U: 0 };

function attrEntry(key, value) {
  // Gramps 原生 attribute type 是纯字符串（前端 fetchMasterTree 只处理字符串形式）
  return { type: key, value };
}

function profilePerson(tree, handle) {
  const p = tree.people[handle];
  if (!p) return null;
  const out = { handle: p.handle, gramps_id: p.gramps_id, name_given: p.given, name_surname: p.surname, sex: p.gender };
  // 显式健在状态：树 JSON 已存 is_living 用之；旧数据缺省按 !death_date 推断（有卒年=已故）
  out.is_living = p.is_living !== undefined ? p.is_living : !p.death_date;
  if (p.birth_date) out.birth = { date: p.birth_date };
  if (p.death_date) out.death = { date: p.death_date };
  return out;
}

function profileFamily(tree, fam) {
  if (!fam) return null;
  const out = { handle: fam.handle, gramps_id: fam.gramps_id || '' };
  if (fam.father_handle) out.father = profilePerson(tree, fam.father_handle);
  if (fam.mother_handle) out.mother = profilePerson(tree, fam.mother_handle);
  out.children = (fam.child_handles || []).map((c) => profilePerson(tree, c)).filter(Boolean);
  return out;
}

function toRawPerson(tree, person, detail) {
  const attributes = [];
  for (const a of detail?.attributes || []) attributes.push(attrEntry(a.key, a.value));
  for (const k of tw.EXTERNAL_KEYS) {
    if (person[k]) attributes.push(attrEntry(k, person[k]));
  }
  const raw = {
    handle: person.handle,
    gramps_id: person.gramps_id,
    gender: GENDER_NUM[person.gender] ?? 0,
    // 显式健在状态：编辑/脱敏用（旧数据缺省 = 无卒年即推断健在）
    is_living: person.is_living !== undefined ? person.is_living : !person.death_date,
    primary_name: { first_name: person.given || '', surname_list: [{ surname: person.surname || '', primary: true }] },
    attribute_list: attributes,
    event_ref_list: (detail?.events || []).map((e) => ({ ref: e.handle })),
    family_list: person.spouse_families || [],
    parent_family_list: person.parent_family ? [person.parent_family] : [],
    profile: {},
  };
  if (person.birth_date) raw.profile.birth = { date: person.birth_date, place: person.birth_place || '' };
  if (person.death_date) raw.profile.death = { date: person.death_date, place: person.death_place || '' };
  const spouseFams = (person.spouse_families || []).map((fh) => profileFamily(tree, tree.families[fh])).filter(Boolean);
  if (spouseFams.length) raw.profile.families = spouseFams;
  if (person.parent_family && tree.families[person.parent_family]) {
    raw.profile.primary_parent_family = profileFamily(tree, tree.families[person.parent_family]);
  }
  return raw;
}

// ---- 写权限拦截（照搬 auth-server 语义） ----

async function requireWriteUser(headers, treeId, pathname, targetHandle, isAddNode) {
  const u = await authUser(headers);
  if (!u) throw httpError(401, '请先登录后再进行编辑操作');
  const user = await colGet('jiazu_users', u.phone);
  if (!user) throw httpError(401, '用户不存在');
  const role = user.role;
  if (role === 'guest') throw httpError(403, '游客无编辑权限，请注册后编辑');

  const isMaster = treeId === MASTER_TREE_ID;
  if (isMaster && role !== 'chief_editor') throw httpError(403, '中华世本总谱仅总编辑（chief_editor）可编辑');

  if (!isMaster && (role === 'user' || role === 'branch_curator') && targetHandle) {
    const tree = await getTree(treeId);
    const families = Object.values(tree.families).map((f) => ({
      handle: f.handle,
      father_handle: f.father_handle,
      mother_handle: f.mother_handle,
      child_handles: f.child_handles,
    }));
    const allowed = await canEditPerson(families, user.phone, role, targetHandle);
    if (!allowed) {
      throw httpError(
        403,
        role === 'branch_curator' ? '您的权限范围仅限本人上下三代节点' : '您的权限范围仅限本人及向下节点',
      );
    }
  }

  // 世代深度上限：普通家族树 ≤72 世，新增节点时检查
  if (!isMaster && role !== 'chief_editor' && isAddNode) {
    const tree = await getTree(treeId);
    const { totalGenerations } = computeTreeDepth(tree, null);
    if (totalGenerations >= MAX_DEPTH) {
      throw httpError(403, `该家族树已到 ${MAX_DEPTH} 世深度上限，新增节点请联系总编辑（扩容或调整深度上限）`);
    }
  }
  return u;
}

// ---- 竹片扣费闸门（P1 · docs/economy-fee.spec.md §4-3）----

/**
 * 落库失败 → 冲正（best-effort）：冲正本身失败**绝不掩盖**原始落库错误（§4-3 ⑥）。
 * @returns {Promise<boolean>} 是否已返还
 */
async function refundQuietly(phone, charged, reason = '落库失败') {
  if (!charged || !charged.charged) return false;
  try {
    const r = await eco.refundCharged(phone, charged, reason);
    return !!r.ok;
  } catch {
    return false;
  }
}

/**
 * 写路由透传给 `tw.*` 的闸门回调对（charge / refund）：
 * 单价一律由 `lib/economy-fee.js` 的 `feeOf` 决定，路由不判价（§5-2）。
 */
function feeGate(phone, op) {
  // `refunded` 记录本次闸门是否真的发生过冲正 → 四条计费路由的 catch 统一带 `fee_refunded:true`
  // （口径与 PUT /people、/admin/create-tree 一致；未扣费 / 冲正失败一律不带该字段）
  const gate = { charge: eco.charger(phone, op), refunded: false };
  gate.refund = async (charged) => {
    const ok = await refundQuietly(phone, charged, '落库失败，已原路返还');
    if (ok) gate.refunded = true;
    return ok;
  };
  return gate;
}

// ---- 路由（统一返回 {statusCode, headers, body}） ----

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tree-Id',
};

function send(statusCode, obj) {
  return { statusCode, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(obj) };
}

// ---- catch 统一出口：系统级失败 = 500 + 通用文案（业务错误不得被通用句覆盖）----
// 背景：`send(e.status || 400, { error: e.message })` 在 EACCES / ENOENT 时会**把本机绝对路径吐给前端**
// （实测：`EACCES: permission denied, open '/private/var/folders/…/trees/xx.json'`），
// 与 docs/branch-clan-ops.spec.md §7（两条新路由的 500 口径）不一致。
// 口径（与 lib/economy-fee.js 的 `errorPayload` 同向，但**不误吞业务裸异常**）：
//   - 带 `status` 的业务错误（lib `fail(msg, 4xx)` / `httpError(4xx, msg)`）→ 沿用自身 status 与业务文案；
//   - 系统级失败（errno 类 code/name：EACCES / ENOENT / EPERM / EEXIST …，或异常文本里出现本机绝对路径）
//     → `500` + `eco.INTERNAL_ERROR_TEXT`，**绝不回显 e.message / e.stack / 路径**；
//   - 其余无 `status` 的裸异常 = lib 层历史业务拒绝（lib/child-write.js / lib/wallet.js 用裸 Error 表达）
//     → 沿用旧语义（`fallbackStatus` + 业务文案）。
const SYSTEM_ERRNO = new Set([
  'EACCES',
  'EPERM',
  'ENOENT',
  'EEXIST',
  'EISDIR',
  'ENOTDIR',
  'EROFS',
  'EIO',
  'ENOSPC',
  'ENOTEMPTY',
  'EBUSY',
  'ELOOP',
  'EMFILE',
  'ENFILE',
  'ENAMETOOLONG',
]);
/** 异常文本里出现本机文件系统绝对路径（/Users、/tmp、/var、/private…）→ 一律按系统级失败处理 */
const LOCAL_PATH_RE = /\/(?:Users|tmp|var|private|home|opt|etc|usr)\//;

/**
 * 系统级失败判据（safeError 与计费路由出码共用）：errno 类 code / name（EACCES / ENOENT / …），
 * 或异常文本里出现本机绝对路径。
 */
function isSystemFailure(e) {
  const err = e || {};
  const errno = String(err.code || err.name || '');
  return SYSTEM_ERRNO.has(errno) || LOCAL_PATH_RE.test(String(err.message || ''));
}

/**
 * @param {Error} e 捕获到的异常
 * @param {number} [fallbackStatus=400] 旧语义下的缺省状态码（普通路由 400；外层兜底 / 拆分类 500）
 * @param {string} [prefix=''] 仅业务错误保留的文案前缀（如旧文案里的「拆分失败: 」）
 */
function safeError(e, fallbackStatus = 400, prefix = '') {
  const err = e || {};
  if (isSystemFailure(err)) return send(500, { error: eco.INTERNAL_ERROR_TEXT, status: 500 });
  const status = Number(err.status);
  const text = String(err.message || '');
  return send(Number.isFinite(status) ? status : fallbackStatus, { error: prefix ? `${prefix}: ${text}` : text });
}

/**
 * 计费路由 catch 的**出码**（响应体仍由 `eco.errorPayload` 生成）：
 * - 业务错误（lib 层 `fail(msg, 4xx)` / `httpError(4xx, msg)`）→ 保持自身 status；
 * - 系统级失败（EACCES / ENOENT / ERRNO / 异常含本机路径）→ `payload.status`（= 500）——
 *   旧写法 `send(e.status || 400, …)` 会把系统级 500 报成 HTTP 400（响应体却是 `{"status":500}`）；
 * - 其余无 status 的裸异常 = lib 层历史业务拒绝（如 `person not found`）→ 沿用旧语义 400。
 */
function errorStatusOf(e, payload) {
  const own = Number((e || {}).status);
  if (Number.isFinite(own)) return own;
  if (isSystemFailure(e)) return Number(payload?.status) || 500;
  return 400;
}

/**
 * 解析当前访问者的节点级可见性（读路径）。
 * guest（无有效 JWT）→ 隐藏树梢 18 世；已登录未加入 → 隐藏 9 世；
 * member / chief_editor / zhonghua → full。规格 docs/permission-tier.spec.md。
 */
async function resolveTreeAccess(headers, treeId, tree) {
  const u = await authUser(headers);
  const anchor = u ? await getAnchor(u.phone) : null;
  return computeAccess({
    treeId,
    isMaster: treeId === MASTER_TREE_ID,
    role: u?.role || null,
    anchorTreeId: anchor?.tree_id || null,
    people: tree?.people || {},
    families: tree?.families || {},
  });
}

async function handleRequest(event) {
  let pathname = (event.path || '').split('?')[0].replace(/\/+$/, '');
  if (pathname.startsWith('/api')) pathname = pathname.slice(4) || '/';
  const method = (event.httpMethod || 'GET').toUpperCase();
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' };

  const query = event.queryStringParameters || {};
  const headers = event.headers || {};
  // header 大小写不敏感读取（HTTP 访问服务/直传事件可能大小写不同）
  const header = (name) => {
    const lower = name.toLowerCase();
    const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === lower);
    return hit ? hit[1] : undefined;
  };
  const treeId = header('x-tree-id') || query.tree_id || '';

  try {
    // ================= 认证 =================
    if (pathname === '/auth/send-code' && method === 'POST') {
      const body = parseBody(event);
      const phone = String(body.phone || '').trim();
      if (!/^1\d{10}$/.test(phone)) return send(400, { error: '手机号格式不正确' });
      const existing = await colGet('jiazu_sms_codes', phone);
      if (existing && existing.expires_at > Date.now()) {
        const { requestCode: rc } = await import('./lib/auth.js');
        const r = await rc(phone);
        return send(200, { ok: true, message: '验证码已发送', dev_code: r.dev_code });
      }
      const r = await requestCode(phone);
      return send(200, { ok: true, message: '验证码已发送', dev_code: r.dev_code });
    }

    if (pathname === '/auth/login' && method === 'POST') {
      const body = parseBody(event);
      const phone = String(body.phone || '').trim();
      const code = String(body.code || '').trim();
      const user = await colGet('jiazu_users', phone);
      if (!user) return send(404, { error: '该手机号未注册，请先注册' });
      const v = await verifyCode(phone, code);
      if (!v.ok) return send(401, { error: v.message });
      const token = signJwt({ sub: phone, phone, role: user.role }, 7 * 24 * 3600);
      return send(200, { token, phone, nickname: user.nickname, role: user.role });
    }

    if (pathname === '/auth/register' && method === 'POST') {
      const body = parseBody(event);
      const phone = String(body.phone || '').trim();
      const code = String(body.code || '').trim();
      const nickname = String(body.nickname || '').trim().slice(0, 30);
      if (!/^1\d{10}$/.test(phone)) return send(400, { error: '手机号格式不正确' });
      if (await colGet('jiazu_users', phone)) return send(409, { error: '该手机号已注册，请直接登录' });
      const v = await verifyCode(phone, code);
      if (!v.ok) return send(401, { error: v.message });
      const user = await findOrCreateUser(phone, nickname || undefined);
      const token = signJwt({ sub: phone, phone, role: user.role }, 7 * 24 * 3600);
      return send(201, { token, phone, nickname: user.nickname, role: user.role });
    }

    if (pathname === '/auth/me' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user) return send(404, { error: '用户不存在' });
      return send(200, { phone: user.phone, nickname: user.nickname, role: user.role });
    }

    // ================= tree-meta =================
    if (pathname === '/tree-meta' && method === 'GET') {
      const meta = await getMeta();
      if (!meta) return send(500, { error: 'tree-meta 缺失' });
      return send(200, meta);
    }

    if (pathname === '/tree-meta' && method === 'PUT') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user || user.role !== 'chief_editor') return send(403, { error: '需要总编辑权限' });
      const body = parseBody(event);
      const { tree_id, display_title, genealogy_name, archive_url, hall_name, origin, description } = body;
      if (!tree_id) return send(400, { error: '缺少 tree_id' });
      const meta = await getMeta();
      const entry = Object.values(meta.trees).find((t) => t.tree_id === tree_id);
      if (!entry) return send(404, { error: `未找到 tree: ${tree_id}` });
      if (display_title !== undefined) entry.display_title = display_title;
      if (genealogy_name !== undefined) entry.genealogy_name = genealogy_name;
      if (archive_url !== undefined) entry.archive_url = archive_url;
      if (hall_name !== undefined) entry.hall_name = hall_name;
      if (origin !== undefined) entry.origin = origin;
      if (description !== undefined) entry.description = description;
      await saveMeta(meta);
      return send(200, { ok: true, entry });
    }

    // ================= 等级 =================
    if (pathname === '/tree/rank' && method === 'GET') {
      if (!treeId) return send(400, { error: '缺少 X-Tree-Id' });
      const tree = await getTree(treeId);
      if (!tree) return send(404, { error: `树不存在: ${treeId}` });
      const gens = new Map();
      const details = await getAllDetails(treeId);
      for (const d of details) {
        const g = d.attributes?.find((a) => a.key === 'external_chain_gen');
        if (g) gens.set(d.handle, parseInt(g.value, 10) || 0);
      }
      const { totalGenerations, personCount, explicit } = computeTreeDepth(tree, gens);
      const rank = rankFromDepth(totalGenerations);
      const access = await resolveTreeAccess(headers, treeId, tree);
      // activity：近 30 天与本树相关的互动事件数（lib/tree-activity.js；集合不可用恒 0，不抛）
      const activity = await treeActivity(treeId, { now: new Date() });
      return send(200, {
        tree_id: treeId,
        total_generations: totalGenerations,
        rank_key: rank.key,
        rank_label: rank.label,
        rank_en: rank.en,
        rank_desc: rank.desc,
        over_limit: totalGenerations > MAX_DEPTH,
        max_depth: MAX_DEPTH,
        root_count: Object.values(tree.people).filter((p) => !p.parent_family).length,
        person_count: personCount,
        explicit,
        activity,
        updated_at: tree.updated_at === undefined || tree.updated_at === null ? '' : String(tree.updated_at),
        access: accessToPayload(access, totalGenerations),
      });
    }

    // ================= 钱包 =================
    if (pathname === '/wallet/balance' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      return send(200, await wallet.getWalletOverview(u.phone));
    }

    if (pathname === '/wallet/recharge' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const amount = Number(parseBody(event).amount);
      if (!amount || amount <= 0) return send(400, { error: '请输入正确的充值金额' });
      try {
        const balance = await wallet.recharge(u.phone, Math.round(amount * 100));
        return send(200, { ok: true, balance_yuan: (balance / 100).toFixed(2), payment: 'mock' });
      } catch (e) {
        return safeError(e);
      }
    }

    // 家族树资金 / 转账功能已整体下线（docs/economy.spec.md §12-3「人民币钱包收缩」）：
    // 路由保留（防旧前端静默 404），**在任何鉴权 / 参数校验之前**恒返回 410 + `TREE_FUND_RETIRED`。
    if (pathname === '/wallet/transfer' && method === 'POST') {
      return send(410, { error: '家族树资金功能已下线', code: 'TREE_FUND_RETIRED' });
    }

    if (pathname === '/wallet/tree-balance' && method === 'GET') {
      return send(410, { error: '家族树资金功能已下线', code: 'TREE_FUND_RETIRED' });
    }

    // 后台费用设置（治理路由，沿用既有入口；docs/branch-clan-ops.spec.md §5-4 / §13-13）：
    // - `fee`：建树费（¥，既有键 —— 行为与出参 `tree_create_fee_yuan` 保持原样、不得改）
    // - `branch_fee_seeds`：立支费（颗完整石榴籽，默认 9999）
    // - `converge_spirit_ratio`：汇宗灵气折损比例（0–1，默认 0.5）
    if (pathname === '/admin/wallet-fee' && method === 'PUT') {
      const u = await authUser(headers);
      if (!u || u.role !== 'chief_editor') return send(403, { error: '需要总编辑权限' });
      const body = parseBody(event);
      const has = (k) => body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== '';
      const out = { ok: true };
      if (has('fee')) {
        const fee = Number(body.fee);
        if (!fee || fee <= 0) return send(400, { error: '请输入正确的费用' });
        const cents = await wallet.setTreeCreateFeeCents(Math.round(fee * 100));
        out.tree_create_fee_yuan = (cents / 100).toFixed(2);
      }
      if (has('branch_fee_seeds')) {
        const seeds = Number(body.branch_fee_seeds);
        if (!Number.isFinite(seeds) || seeds <= 0 || Math.floor(seeds) !== seeds) {
          return send(400, { error: '请输入正确的立支费用（正整数，颗石榴籽）' });
        }
        out.branch_fee_seeds = await wallet.setBranchFeeSeeds(seeds);
      }
      if (has('converge_spirit_ratio')) {
        const ratio = Number(body.converge_spirit_ratio);
        if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
          return send(400, { error: '请输入正确的折损比例（0–1）' });
        }
        out.converge_spirit_ratio = await wallet.setConvergeSpiritRatio(ratio);
      }
      if (Object.keys(out).length === 1) return send(400, { error: '请输入正确的费用' });
      return send(200, out);
    }

    // ================= 资产账本（docs/economy.spec.md §6-1 / §6-2 · P0） =================
    // 权限：任何已登录用户（只读 / 写本人资产）；未登录 401。P0 不接写权校验与竹片扣费闸门（P1）。
    if (pathname === '/assets/summary' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const now = new Date();
      const summary = await ledger.mutateAssets(u.phone, (user) => {
        ledger.sweep(user, now); // 任何资产入口先惰性结算（§5-4-1）
        return ledger.summarize(user, now);
      });
      return send(200, summary);
    }

    if (pathname === '/assets/expiring' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const now = new Date();
      const rawDays = query.days;
      const days = rawDays === undefined || String(rawDays).trim() === '' ? ledger.EXPIRING_DEFAULT_DAYS : Number(rawDays);
      const window = Number.isFinite(days) && days >= 0 ? days : ledger.EXPIRING_DEFAULT_DAYS;
      const items = await ledger.mutateAssets(u.phone, (user) => {
        ledger.sweep(user, now);
        return ledger.expiringItems(user, now, window);
      });
      return send(200, { items });
    }

    if (pathname === '/assets/signin' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const now = new Date();
      const today = ledger.beijingDate(now); // 北京时间（UTC+8）自然日
      const r = await ledger.mutateAssets(u.phone, (user) => {
        ledger.sweep(user, now);
        if (user.signin_date === today) throw httpError(409, '今日已签到'); // 同日重复 → 整单不写（资产不变）
        user.signin_date = today;
        ledger.recordTx(user, { type: 'signin', delta: { fragments: 1 }, desc: '每日签到 +1 碎片' }, now);
        const added = ledger.addFragments(user, 1, now); // 满 10 立即合成（§5-1）
        return { fragments: added.fragments, synthesized: added.synthesized, seed_lot: added.seed_lots[0] || null, signin_date: today };
      });
      return send(200, { ok: true, ...r });
    }

    // ================= 时流子域（docs/spirit-domain.spec.md §6 / §7 · P2 第二段） =================
    // 鉴权（K1 定稿 · Kevin 2026-09-16 拍板）：灌注 / 镶嵌 = **任何已登录用户**（未登录 401，
    // 不设 403 档、不判树写权、不接竹片扣费闸门）；`GET /spirit` = guest 可读**摘要**（`tree_id` 必填，
    // 取 `X-Tree-Id` 头或 `?tree_id`），灌注流水仅该树成员可见（§7-2）。
    // 错误体统一走 `eco.errorPayload`（仅回显域名码，绝不透传系统错误文本）。
    if (pathname === '/spirit' && method === 'GET') {
      try {
        const u = await authUser(headers);
        return send(200, await spirit.spiritInfo(treeId, u ? { phone: u.phone, role: u.role } : null, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/spirit/mount-jade' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '请先登录后再进行编辑操作');
        const body = parseBody(event);
        return send(200, await spirit.mountJade(u.phone, body.tree_id || treeId, body.jade_id, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/spirit/charge' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '请先登录后再进行编辑操作');
        const body = parseBody(event);
        return send(200, await spirit.chargeSpirit(u.phone, body.tree_id || treeId, body.plan, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/assets/synthesize-jade' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '未登录或登录已过期');
        return send(200, await spirit.synthesizeJade(u.phone, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/assets/decompose-jade' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '未登录或登录已过期');
        return send(200, await spirit.decomposeJade(u.phone, parseBody(event).jade_id, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    // ================= 市集 + 官方竹简每日限量发售（docs/economy-market.spec.md · P3） =================
    // 鉴权（§8）：`GET /market/listings` = **guest 可读**；其余需登录 401；`PUT /admin/market/official-stock`
    // = `chief_editor`（403）。挂单与**家族树无关（K7）**：不传、不派生、不校验家族树字段（`Listing` 无 tree_id）。
    // 本段**必须注册在树编辑闸门之前**（总册 §12-2：与 /assets/* /spirit/* 同段，闸门会拦 `缺少 X-Tree-Id`）。
    // 错误体统一走 `eco.errorPayload`（只回域名码，绝不透传系统错误文本）。
    if (pathname === '/market/listings' && method === 'GET') {
      try {
        const rawStatus = query.status;
        const status = rawStatus === undefined || String(rawStatus).trim() === '' ? undefined : String(rawStatus).trim();
        return send(200, await market.marketListings(status, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/market/my' && method === 'GET') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '未登录或登录已过期');
        const rawStatus = query.status;
        const status = rawStatus === undefined || String(rawStatus).trim() === '' ? undefined : String(rawStatus).trim();
        return send(200, await market.myMarket(u.phone, status, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/market/list' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '请先登录后再进行编辑操作');
        const body = parseBody(event);
        // 入参只认 `{ bundles, price_seeds }`（**无家族树字段**；pieces = bundles × 100 由服务端派生）
        return send(200, await market.listBamboo(u.phone, { bundles: body.bundles, price_seeds: body.price_seeds }, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/market/cancel' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '请先登录后再进行编辑操作');
        return send(200, await market.cancelListing(u.phone, parseBody(event).listing_id, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/market/buy' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '请先登录后再进行编辑操作');
        return send(200, await market.buyListing(u.phone, parseBody(event).listing_id, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/market/official-buy' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '请先登录后再进行编辑操作');
        return send(200, await market.officialPurchase(u.phone, { bundles: parseBody(event).bundles }, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/admin/market/official-stock' && method === 'PUT') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, '未登录或登录已过期');
        if (u.role !== 'chief_editor') throw httpError(403, '需要总编辑权限');
        const body = parseBody(event);
        return send(200, await market.setOfficialStock(body.daily_stock, body.price_fen, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    // ================= 运营侧（docs/economy-ops.spec.md · P4） =================
    // 站内信（§4.3）：`GET /messages`（登录，惰性补齐预警 + 未读计数）、`POST /messages/read`（登录，缺省全部已读）。
    // 后台资产运维（§5，**仅 `chief_editor`**）：`POST /admin/assets/grant`（`reason` 必填 + 逐笔留痕 + 用户流水）、
    // `GET /admin/assets/logs`（`operator?` / `phone?` / `limit?` 默认 50 上限 200）、`GET /admin/assets/user`（资产快照）。
    // 账号注销（§7，K10）：`POST /account/delete` → 先 `openListingGuard`（有 open 挂单 → 409「请先撤销未成交挂单」，
    // 不自动撤单）→ 清空四类资产 + 写 `account_clear` 流水（**保留流水审计 / jiazu_users / jiazu_anchors**）。
    // 本段**必须注册在树编辑闸门之前**（§10.1：闸门会先拦 `缺少 X-Tree-Id`）；
    // 错误体统一走 `eco.errorPayload`（只回域名码，绝不透传系统错误文本）。
    if (pathname === '/messages' && method === 'GET') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, ops.ERR_NOT_LOGGED_IN);
        const unreadFlag = query.unread;
        const unreadOnly = unreadFlag !== undefined && ['1', 'true', 'yes'].includes(String(unreadFlag).trim().toLowerCase());
        return send(200, await ops.messagesOf(u, new Date(), { unreadOnly }));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/messages/read' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, ops.ERR_NOT_LOGGED_IN);
        const body = parseBody(event);
        return send(200, await ops.readMessages(u.phone, body.ids, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/admin/assets/grant' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, ops.ERR_NOT_LOGGED_IN);
        if (u.role !== 'chief_editor') throw httpError(403, ops.ERR_CHIEF_ONLY);
        const body = parseBody(event);
        return send(
          200,
          await ops.grantAssets(u.phone, {
            target_phone: body.target_phone,
            delta: body.delta,
            reason: body.reason,
            evidence: body.evidence,
          }),
        );
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/admin/assets/logs' && method === 'GET') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, ops.ERR_NOT_LOGGED_IN);
        if (u.role !== 'chief_editor') throw httpError(403, ops.ERR_CHIEF_ONLY);
        return send(200, await ops.opsLogs({ operator: query.operator, phone: query.phone, limit: query.limit }));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/admin/assets/user' && method === 'GET') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, ops.ERR_NOT_LOGGED_IN);
        if (u.role !== 'chief_editor') throw httpError(403, ops.ERR_CHIEF_ONLY);
        return send(200, await ops.adminUserAssets(query.phone, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    if (pathname === '/account/delete' && method === 'POST') {
      try {
        const u = await authUser(headers);
        if (!u) throw httpError(401, ops.ERR_NOT_LOGGED_IN);
        return send(200, await ops.deleteAccount(u.phone, new Date()));
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e));
      }
    }

    // ================= 角色 / 锚点 / 用户 =================
    if (pathname === '/admin/users' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) return send(403, { error: '需要族谱主理人或以上权限' });
      const list = (await colAll('jiazu_users')).map((usr) => ({ phone: usr.phone, nickname: usr.nickname, role: usr.role, created_at: usr.created_at }));
      return send(200, list);
    }

    if (pathname === '/admin/set-role' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const body = parseBody(event);
      const targetPhone = String(body.phone || '').trim();
      const newRole = String(body.role || '').trim();
      if (!targetPhone || !ROLE_LEVEL[newRole]) {
        return send(400, { error: '参数错误：phone + role 必填，role ∈ user/branch_curator/tree_steward/chief_editor' });
      }
      const target = await colGet('jiazu_users', targetPhone);
      if (!target) return send(404, { error: `用户不存在: ${targetPhone}` });
      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      const targetLevel = ROLE_LEVEL[target.role] ?? 0;
      if (targetPhone === u.phone) return send(400, { error: '不能修改自己的角色' });
      if (ROLE_LEVEL[newRole] >= myLevel) return send(403, { error: `无权授予 ${newRole}（需要高于该级别的权限）` });
      if (targetLevel >= myLevel) return send(403, { error: '无权修改级别不低于自己的用户' });
      if (u.role === 'tree_steward' && !['guest', 'user'].includes(target.role)) {
        return send(403, { error: '族谱主理人仅可管理普通用户与支系记录官' });
      }
      const oldRole = target.role;
      target.role = newRole;
      target.role_updated_at = new Date().toISOString();
      await colSet('jiazu_users', targetPhone, target);
      return send(200, { ok: true, phone: targetPhone, role: newRole, old_role: oldRole });
    }

    if (pathname === '/admin/set-anchor' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) return send(403, { error: '需要族谱主理人或以上权限' });
      const body = parseBody(event);
      const targetPhone = String(body.phone || '').trim();
      const targetTree = String(body.tree_id || '').trim();
      const personHandle = String(body.person_handle || '').trim();
      if (!targetPhone || !targetTree || !personHandle) return send(400, { error: '参数错误：phone + tree_id + person_handle 必填' });
      if (!(await colGet('jiazu_users', targetPhone))) return send(404, { error: `用户不存在: ${targetPhone}` });
      await setAnchor(targetPhone, targetTree, personHandle);
      return send(200, { ok: true });
    }

    if (pathname === '/admin/get-anchor' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const targetPhone = query.phone || u.phone;
      if (targetPhone !== u.phone && (ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) {
        return send(403, { error: '无权查看他人锚点' });
      }
      const anchor = await getAnchor(targetPhone);
      return send(200, { phone: targetPhone, anchor });
    }

    // ================= 加入 / 解绑 =================
    // ================= 加入家族（申请-审批制；docs/permission-tier.spec.md §9，自助认领已取消） =================

    if (pathname === '/join-request' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const body = parseBody(event);
      const targetTree = String(body.tree_id || '').trim();
      const referenceHandle = String(body.reference_handle || '').trim();
      const selfName = String(body.self_name || '').trim().slice(0, 30);
      const note = String(body.note || '').trim().slice(0, 200);
      if (!targetTree || !referenceHandle) return send(400, { error: '参数错误：tree_id + reference_handle 必填' });
      if (!selfName && !note) return send(400, { error: '请填写您的姓名或补充说明（认领线索）' });
      if (targetTree === MASTER_TREE_ID) return send(403, { error: '中华世本总谱不可加入，仅可加入普通家族树' });
      if (await getAnchor(u.phone)) return send(400, { error: '您已绑定家族树，如需改绑请先申请解绑并等待审批' });
      const meta = await getMeta();
      if (!Object.values(meta.trees).some((t) => t.tree_id === targetTree)) {
        return send(404, { error: `家族树不存在: ${targetTree}` });
      }
      const all = await colAll('jiazu_join_requests');
      if (all.some((r) => r.phone === u.phone && r.tree_id === targetTree && r.status === 'pending')) {
        return send(400, { error: '您已提交加入申请，请等待族谱主理人审核' });
      }
      const tree = await getTree(targetTree);
      if (!tree) return send(404, { error: `树不存在: ${targetTree}` });
      const refPerson = tree.people?.[referenceHandle];
      if (!refPerson) return send(400, { error: '该家族树中找不到此节点' });
      // 可见性校验：禁止用隐藏近代层 handle 申报（按申请人档位 guest 之上）
      const access = await resolveTreeAccess(headers, targetTree, tree);
      if (access.isHiddenPerson(referenceHandle)) {
        return send(400, { error: '所选支系节点当前不可见，请在公开谱系中选择一个代表您支系的节点' });
      }
      const refName = refPerson.name || `${refPerson.surname || ''}${refPerson.given || ''}` || referenceHandle;
      const id = `JR_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      await colSet('jiazu_join_requests', id, {
        phone: u.phone,
        tree_id: targetTree,
        reference_handle: referenceHandle,
        reference_name: refName,
        self_name: selfName,
        note,
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      return send(201, { ok: true, id });
    }

    if (pathname === '/admin/join-requests' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) return send(403, { error: '需要族谱主理人或以上权限' });
      const myTree = u.role === 'chief_editor' ? null : (await getAnchor(u.phone))?.tree_id || null;
      const list = await colAll('jiazu_join_requests');
      const out = list
        .filter((r) => myTree === null || r.tree_id === myTree)
        .map((r) => ({ id: r._id, ...r }));
      // reference 节点世数（per tree 拉一次）
      const depthCache = new Map();
      for (const item of out) {
        if (!item.reference_handle || !item.tree_id) continue;
        if (!depthCache.has(item.tree_id)) {
          try {
            const t = await getTree(item.tree_id);
            const { depth } = computePersonDepth(t.people || {}, t.families || {});
            depthCache.set(item.tree_id, depth);
          } catch {
            depthCache.set(item.tree_id, null);
          }
        }
        const depth = depthCache.get(item.tree_id);
        if (depth) item.reference_depth = depth.get(item.reference_handle) ?? null;
      }
      return send(200, out);
    }

    if (pathname === '/admin/approve-join' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) return send(403, { error: '需要族谱主理人或以上权限' });
      const body = parseBody(event);
      const id = String(body.id || '').trim();
      const personHandle = String(body.person_handle || '').trim();
      if (!id || !personHandle) return send(400, { error: '参数错误：id + person_handle 必填' });
      const jr = await colGet('jiazu_join_requests', id);
      if (!jr) return send(404, { error: '申请不存在' });
      if (jr.status !== 'pending') return send(400, { error: '该申请已处理' });
      if (u.role !== 'chief_editor') {
        const myTree = (await getAnchor(u.phone))?.tree_id;
        if (myTree && jr.tree_id !== myTree) return send(403, { error: '只能审批自己家族树的加入申请' });
      }
      const tree = await getTree(jr.tree_id);
      if (!tree?.people?.[personHandle]) return send(400, { error: '该家族树中找不到此节点' });
      if (await getAnchor(jr.phone)) return send(400, { error: '申请人已绑定家族树，无法重复绑定' });
      await setAnchor(jr.phone, jr.tree_id, personHandle);
      jr.status = 'approved';
      jr.handled_by = u.phone;
      jr.handled_at = new Date().toISOString();
      await colSet('jiazu_join_requests', jr._id, jr);
      return send(200, { ok: true, status: 'approved' });
    }

    if (pathname === '/admin/reject-join' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) return send(403, { error: '需要族谱主理人或以上权限' });
      const body = parseBody(event);
      const jr = await colGet('jiazu_join_requests', String(body.id || ''));
      if (!jr) return send(404, { error: '申请不存在' });
      if (jr.status !== 'pending') return send(400, { error: '该申请已处理' });
      if (u.role !== 'chief_editor') {
        const myTree = (await getAnchor(u.phone))?.tree_id;
        if (myTree && jr.tree_id !== myTree) return send(403, { error: '只能审批自己家族树的加入申请' });
      }
      jr.status = 'rejected';
      jr.reject_reason = String(body.reason || '').slice(0, 200);
      jr.handled_by = u.phone;
      jr.handled_at = new Date().toISOString();
      await colSet('jiazu_join_requests', jr._id, jr);
      return send(200, { ok: true, status: 'rejected' });
    }

    if (pathname === '/leave-request' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const anchor = await getAnchor(u.phone);
      if (!anchor) return send(400, { error: '您尚未绑定家族树' });
      const all = await colAll('jiazu_leave_requests');
      if (all.some((r) => r.phone === u.phone && r.status === 'pending')) {
        return send(400, { error: '已有待审批的解绑申请，请等待处理' });
      }
      const id = `LR_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      await colSet('jiazu_leave_requests', id, {
        phone: u.phone,
        tree_id: anchor.tree_id,
        person_handle: anchor.person_handle,
        reason: String(parseBody(event).reason || '').slice(0, 200),
        status: 'pending',
        created_at: new Date().toISOString(),
      });
      return send(200, { ok: true, id });
    }

    if (pathname === '/admin/leave-requests' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) return send(403, { error: '需要族谱主理人或以上权限' });
      const list = await colAll('jiazu_leave_requests');
      const myTree = u.role === 'chief_editor' ? null : (await getAnchor(u.phone))?.tree_id;
      // 前端 LeaveRequestItem 读 r.id → 从 _id 映射
      const out = list
        .filter((r) => myTree === null || r.tree_id === myTree)
        .map((r) => ({ id: r._id, ...r }));
      return send(200, out);
    }

    if (pathname === '/admin/approve-leave' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) return send(403, { error: '需要族谱主理人或以上权限' });
      const body = parseBody(event);
      const req = await colGet('jiazu_leave_requests', String(body.id || ''));
      if (!req) return send(404, { error: '申请不存在' });
      if (req.status !== 'pending') return send(400, { error: '该申请已处理' });
      req.status = body.approve ? 'approved' : 'rejected';
      req.handled_by = u.phone;
      req.handled_at = new Date().toISOString();
      await colSet('jiazu_leave_requests', req._id, req);
      if (body.approve) await clearAnchor(req.phone);
      return send(200, { ok: true, status: req.status });
    }

    // ================= 管理（树操作，body.tree_id 不依赖 X-Tree-Id header） =================
    // 添加配偶（同树）：已存在家族补空位，家族已满则新建家族（再婚）
    if (pathname === '/admin/add-spouse' && method === 'POST') {
      const body = parseBody(event);
      if (!body.person_handle) return send(400, { error: '缺少 person_handle' });
      const spouseTreeId = body.tree_id || treeId || MASTER_TREE_ID;
      try {
        await requireWriteUser(headers, spouseTreeId, pathname, body.person_handle, false);
        // 始祖镜像节点：配偶结构只读（docs/founder-attach.spec.md §5）
        await fa.assertFounderEditable(await getTree(spouseTreeId), body.person_handle, MASTER_TREE_ID);
        const result = await tw.addSpouseNode({
          treeId: spouseTreeId,
          personHandle: body.person_handle,
          mode: body.mode === 'attach' ? 'attach' : 'new',
          name: body.name || '',
          surname: body.surname || '',
          gender: body.gender || 'U',
          childHandle: body.child_handle || '',
          extraAttributes: body.attributes || [],
        });
        return send(200, result);
      } catch (e) {
        return safeError(e);
      }
    }

    // 添加子女：家庭里父为外树镜像节点时，子女归到父真身所在树，本树只留镜像子女
    // （docs/marriage.spec.md §7-4；跨树写入经 updateTrees 一次事务完成）
    if (pathname === '/admin/add-child' && method === 'POST') {
      const body = parseBody(event);
      if (!body.person_handle) return send(400, { error: '缺少 person_handle' });
      const childTreeId = body.tree_id || treeId || MASTER_TREE_ID;
      try {
        await requireWriteUser(headers, childTreeId, pathname, body.person_handle, true);
        const result = await cw.addChildNode({
        masterTreeId: MASTER_TREE_ID,
          maxDepth: MAX_DEPTH,
          depthOf: (t) => computeTreeDepth(t, null).totalGenerations,
          treeId: childTreeId,
          personHandle: body.person_handle,
          childHandle: body.child_handle || '',
          name: body.name || '',
          surname: body.surname || '',
          gender: body.gender || 'U',
          extraAttributes: body.attributes || [],
        });
        return send(200, result);
      } catch (e) {
        return safeError(e);
      }
    }

    // ---- 跨树嫁娶（docs/marriage.spec.md）----
    // 发起申请：嫁出/娶入（action=marry）/ 合离（action=divorce）→ 对方树审批后生效（权限口径 C）
    if (pathname === '/marriage-request' && method === 'POST') {
      const body = parseBody(event);
      const fromTree = body.tree_id || treeId;
      if (!body.person_handle) return send(400, { error: '缺少 person_handle' });
      try {
        const u = await authUser(headers);
        if (!u) return send(401, { error: '请先登录后再进行编辑操作' });
        await requireWriteUser(headers, fromTree, pathname, body.person_handle, false);
        const myTree = await getTree(fromTree);
        const me = myTree.people[body.person_handle];
        if (!me) return send(404, { error: '发起方节点不存在' });
        const now = new Date().toISOString();
        const note = String(body.note || '').slice(0, 200);

        if (body.action !== 'divorce') {
          // 对方节点：全局编号（自动识别所属树）/ handle / 树内旧号；spouse_tree_id 仍可显式限定（兼容）
          const spouseRef = String(body.spouse_handle || body.spouse_ref || '').trim();
          if (!spouseRef) return send(400, { error: '请填写配偶的全局编号（如 000052）或 handle' });
          const spouseHit = await resolveNode(spouseRef, '', {
            targetTreeId: String(body.spouse_tree_id || '').trim(),
          });
          if (!spouseHit) return send(404, { error: `找不到编号/句柄为「${spouseRef}」的配偶节点` });
          const toTree = spouseHit.tree_id;
          const toHandle = spouseHit.handle;
          if (toTree === fromTree) return send(400, { error: '同树婚配请用档案里的「＋ 添加配偶」' });
          const otherTree = await getTree(toTree);
          const other = otherTree.people[toHandle];
          if (!other) return send(404, { error: '对方节点不存在' });
          const mid = mr.genMarriageId();
          const date = mr.normalizeMarriageDate(body.marriage_date || '');
          // 同一对已有有效婚姻 → 直接拒（不产生无意义申请单）
          if (me.external_marriage_id && me.external_marriage_id === other.external_marriage_id) {
            return send(400, { error: `「${me.name}」与「${other.name}」已建立婚姻关系` });
          }
          const request = {
            action: 'marry',
            direction: body.direction === 'in' ? 'in' : 'out',
            from_tree: fromTree,
            from_person_handle: me.handle,
            from_person_name: me.name,
            to_tree: toTree,
            to_person_handle: other.handle,
            to_person_name: other.name,
            marriage_id: mid,
            marriage_date: date,
            end_date: '',
            kind: '',
            note,
            status: 'pending',
            requested_by: u.phone,
            created_at: now,
          };
          await colSet('jiazu_marriage_requests', mid, request);
          return send(200, { ok: true, request_id: mid, status: 'pending', to_tree: toTree, to_person_name: other.name });
        }

        // 合离：双方自愿 → 需对方树确认（绝婚为男方单方，走 /admin/marry-end）
        const mid = me.external_marriage_id || '';
        if (!mid) return send(400, { error: '该节点当前没有有效的跨树婚姻（旧版出嫁链接请用「绝婚/合离」入口）' });
        const toTree = me.external_tree || '';
        const toHandle = me.external_person_handle || '';
        if (!toTree || !toHandle) return send(400, { error: '婚姻对方信息缺失' });
        const otherTree = await getTree(toTree);
        const other = otherTree.people[toHandle];
        if (!other) return send(404, { error: '婚姻对方节点在其家族树中不存在' });
        const rid = mr.genMarriageId();
        const endDate = mr.normalizeMarriageDate(body.end_date || '');
        const request = {
          action: 'divorce',
          direction: '',
          kind: '合离',
          from_tree: fromTree,
          from_person_handle: me.handle,
          from_person_name: me.name,
          to_tree: toTree,
          to_person_handle: other.handle,
          to_person_name: other.name,
          marriage_id: mid,
          marriage_date: '',
          end_date: endDate,
          note,
          status: 'pending',
          requested_by: u.phone,
          created_at: now,
        };
        await colSet('jiazu_marriage_requests', rid, request);
        return send(200, { ok: true, request_id: rid, status: 'pending', to_tree: toTree, to_person_name: other.name });
      } catch (e) {
        return safeError(e);
      }
    }

    // 待审批的联姻/离异申请（steward 看自己树相关；chief 全部）
    if (pathname === '/admin/marriage-requests' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user) return send(401, { error: '用户不存在' });
      const chief = user.role === 'chief_editor';
      const anchor = chief ? null : await getAnchor(u.phone);
      const myTree = anchor?.tree_id || '';
      const all = await colAll('jiazu_marriage_requests');
      const list = all
        .filter((r) => r.status === 'pending')
        .filter((r) => chief || r.to_tree === myTree)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return send(200, { list, can_approve_all: chief, my_tree: myTree });
    }

    // 审批通过 / 驳回（需**目标树**写权）
    if ((pathname === '/admin/approve-marriage' || pathname === '/admin/reject-marriage') && method === 'POST') {
      const approve = pathname === '/admin/approve-marriage';
      const body = parseBody(event);
      const rid = String(body.request_id || '').trim();
      if (!rid) return send(400, { error: '缺少 request_id' });
      try {
        const u = await authUser(headers);
        if (!u) return send(401, { error: '未登录或登录已过期' });
        const request = await colGet('jiazu_marriage_requests', rid);
        if (!request) return send(404, { error: '申请不存在' });
        if (request.status !== 'pending') {
          return send(400, { error: request.status === 'approved' ? '该申请已通过' : '该申请已驳回' });
        }
        await requireWriteUser(headers, request.to_tree, pathname, request.to_person_handle, false);
        const now = new Date().toISOString();
        if (!approve) {
          await colSet('jiazu_marriage_requests', rid, {
            ...request,
            status: 'rejected',
            decided_by: u.phone,
            decided_at: now,
            reject_reason: String(body.reason || '').slice(0, 200),
          });
          return send(200, { ok: true, status: 'rejected' });
        }
        const from = request.from_tree;
        const to = request.to_tree;
        const marryPersonIds = request.action === 'marry' ? await reservePersonIds(2) : [];
        const marryFamilyIds = request.action === 'marry' ? await reserveFamilyIds(2) : [];
        const result =
          request.action === 'marry'
            ? await updateTrees([from, to], (trees) =>
                mr.applyMarriage({
                  treeA: trees[from],
                  treeB: trees[to],
                  handleA: request.from_person_handle,
                  handleB: request.to_person_handle,
                  direction: request.direction === 'in' ? 'in' : 'out',
                  marriageDate: request.marriage_date,
                  createdBy: request.requested_by,
                  marriageId: request.marriage_id,
                  allocPersonId: idAllocator(marryPersonIds),
                  allocFamilyId: idAllocator(marryFamilyIds),
                }),
              )
            : await updateTrees([from, to], (trees) =>
                mr.applyMarriageEnd({
                  treeA: trees[from],
                  treeB: trees[to],
                  handleA: request.from_person_handle,
                  handleB: request.to_person_handle,
                  marriageId: request.marriage_id,
                  kind: request.kind || '合离',
                  endDate: request.end_date,
                  createdBy: request.requested_by,
                }),
              );
        await colSet('jiazu_marriage_requests', rid, {
          ...request,
          status: 'approved',
          decided_by: u.phone,
          decided_at: now,
          result,
        });
        return send(200, { ok: true, status: 'approved', result });
      } catch (e) {
        return safeError(e);
      }
    }

    // 绝婚（男方主动解除，单方生效，无需对方审批）
    if (pathname === '/admin/marry-end' && method === 'POST') {
      const body = parseBody(event);
      const fromTree = body.tree_id || treeId;
      if (!body.person_handle) return send(400, { error: '缺少 person_handle' });
      try {
        const u = await authUser(headers);
        if (!u) return send(401, { error: '未登录或登录已过期' });
        const myTree = await getTree(fromTree);
        const me = myTree.people[body.person_handle];
        if (!me) return send(404, { error: '节点不存在' });
        const otherTreeId = me.external_tree || '';
        const otherHandle = me.external_person_handle || '';
        if (!otherTreeId || !otherHandle) return send(400, { error: '该节点没有跨树婚姻记录' });
        if (!me.gender || me.gender === 'U') return send(400, { error: '本人性别未知，无法判定男方（主动）一侧' });
        // 绝婚由男方侧发起 → 需男方所在树写权
        const husbandTree = me.gender === 'M' ? fromTree : otherTreeId;
        const husbandHandle = me.gender === 'M' ? me.handle : otherHandle;
        await requireWriteUser(headers, husbandTree, pathname, husbandHandle, false);
        const otherTree = await getTree(otherTreeId);
        const other = otherTree.people[otherHandle];
        if (!other) return send(404, { error: '婚姻对方节点在其家族树中不存在' });
        const mid = me.external_marriage_id || '';
        const result = mid
          ? await updateTrees([fromTree, otherTreeId], (trees) =>
              mr.applyMarriageEnd({
                treeA: trees[fromTree],
                treeB: trees[otherTreeId],
                handleA: me.handle,
                handleB: otherHandle,
                marriageId: mid,
                kind: '绝婚',
                endDate: body.end_date,
                createdBy: u.phone,
              }),
            )
          : await updateTrees([fromTree, otherTreeId], (trees) =>
              mr.applyLegacyMarriageEnd({
                tree: trees[fromTree],
                person: trees[fromTree].people[me.handle],
                otherTree: trees[otherTreeId],
                otherPerson: trees[otherTreeId].people[otherHandle],
                kind: '绝婚',
                endDate: body.end_date,
                createdBy: u.phone,
              }),
            );
        return send(200, { ok: true, kind: '绝婚', result });
      } catch (e) {
        return safeError(e);
      }
    }

    // ---- 始祖挂载（认祖 / Founders Attach，docs/founder-attach.spec.md + docs/clan-tree.spec.md）----
    // 方式 A：本层树在自己的始祖节点发起「认祖」申请 → **上层树** chief_editor 审批
    // - 普通家族树 → target 必须是祖谱（kind='clan'，硬口径 2：不得直挂世本）
    // - 祖谱 → target 必须是中华世本（kind='master'）
    if (pathname === '/admin/founder-request' && method === 'POST') {
      const body = parseBody(event);
      const reqTree = body.tree_id || treeId;
      if (!reqTree) return send(400, { error: '缺少 X-Tree-Id' });
      if (!body.person_handle) return send(400, { error: '缺少 person_handle' });
      try {
        const u = await requireWriteUser(headers, reqTree, pathname, body.person_handle, false);
        const meta = await getMeta();
        const entry = clan.entryOf(meta, reqTree);
        const reqKind = fa.treeKindOf(entry);
        if (reqKind === fa.TREE_KIND.MASTER) return send(400, { error: '中华世本总谱本身不可认祖' });
        const targetTreeId = String(
          body.target_tree_id || body.master_tree_id || (reqKind === fa.TREE_KIND.CLAN ? MASTER_TREE_ID : ''),
        ).trim();
        if (!targetTreeId) return send(400, { error: '请选择认祖目标（祖谱 / 中华世本）' });
        const targetEntry = clan.entryOf(meta, targetTreeId);
        const masterRef = String(body.target_handle || body.master_handle || body.target_ref || '').trim();
        if (!masterRef) return send(400, { error: '请选择目标树中的真身节点' });
        // 全局编号 / handle / 树内旧号 → 统一解析（限定在认祖目标树内）
        const masterHit = await resolveNode(masterRef, targetTreeId, { targetTreeId });
        if (!masterHit) return send(404, { error: `目标树 ${targetTreeId} 中找不到编号/句柄为「${masterRef}」的节点` });
        const masterHandle = masterHit.handle;
        const tree = await getTree(reqTree);
        if (!tree) return send(404, { error: `树不存在: ${reqTree}` });
        const founder = tree.people[body.person_handle];
        if (!founder) return send(404, { error: '该家族树中找不到始祖节点' });
        // 认祖入口守卫（前后端同口径 fa.canInitiateAttach）：
        // - 无始祖态（meta.founder_state='none'，重置后）→ **该树任意节点**可发起（认祖 = 指定始祖）
        // - 已有登记的始祖 → 仅始祖位置节点（meta.founder_handle → founder_gramps_id → 树 JSON）
        //   与祖谱顶端的上层镜像（founder / chain）
        // 注：不再兜底 'I0001'（未登记始祖的树不得把 I0001 当始祖）
        if (!fa.canInitiateAttach({ tree, person: founder, entry, treeId: reqTree })) {
          return send(400, { error: '仅本家族树/祖谱的始祖节点可发起认祖' });
        }
        fa.assertOneAttachPerTree(founder);
        fa.assertAttachTarget({ sourceTreeId: reqTree, sourceEntry: entry, targetTreeId, targetEntry });
        const targetTree = await getTree(targetTreeId);
        const masterPerson = targetTree?.people?.[masterHandle];
        if (!masterPerson) return send(404, { error: '所选目标树节点不存在' });
        const pending = (await colAll(fa.FOUNDER_REQUEST_COLLECTION)).find(
          (r) => r.status === 'pending' && r.tree_id === reqTree,
        );
        if (pending) return send(400, { error: '该家族树已有待审批的认祖申请，请等待总编审批' });
        const id = fa.genRequestId();
        const targetKind = fa.treeKindOf(targetEntry);
        const request = fa.buildFounderRequest({
          id,
          treeId: reqTree,
          founder,
          masterTreeId: targetTreeId,
          masterPerson,
          requestedBy: u.phone,
          note: body.note,
          targetKind,
        });
        await colSet(fa.FOUNDER_REQUEST_COLLECTION, id, request);
        return send(200, {
          ok: true,
          request_id: id,
          status: 'pending',
          master_tree_id: targetTreeId,
          target_kind: targetKind,
          master_name: masterPerson.name || '',
          message: `认祖申请已提交，等待${fa.kindLabel(targetKind)}总编审批（${masterPerson.name || ''}）`,
        });
      } catch (e) {
        return safeError(e);
      }
    }

    // 待审批的认祖申请（上层树 chief_editor / 本树 steward 可见）；
    // 带 ?master_handle=<真身 handle> 时，同时返回该真身节点上的挂载树（读侧推导 §3-2）
    if (pathname === '/admin/founder-requests' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user) return send(401, { error: '用户不存在' });
      const chief = user.role === 'chief_editor';
      const anchor = chief ? null : await getAnchor(u.phone);
      const myTree = anchor?.tree_id || '';
      const list = fa.filterPendingRequests(await colAll(fa.FOUNDER_REQUEST_COLLECTION), { chief, myTree });
      const masterHandle = String(query.master_handle || '').trim();
      const attachments = masterHandle
        ? fa.attachedTreesOf(await fa.listAttachedTrees({ masterTreeId: MASTER_TREE_ID }), masterHandle)
        : [];
      // 祖谱（认祖世本的一层）单列：统计不计入世本人数/世数（docs/clan-tree.spec.md §3-6）
      const clans = chief ? await clan.listClans() : [];
      return send(200, { list, can_approve_all: chief, my_tree: myTree, attachments, clans });
    }

    // 认祖审批：通过 → 建立挂载（普通树→祖谱：attachFounder；祖谱→世本：attachClanToMaster）；
    // 驳回 → 只写驳回理由，不改任何数据。审批人 = 目标树（上层树）写权（世本仅 chief_editor）
    if (pathname === '/admin/decide-founder' && method === 'POST') {
      const body = parseBody(event);
      const rid = String(body.request_id || '').trim();
      if (!rid) return send(400, { error: '缺少 request_id' });
      const approve = !(body.approve === false || body.action === 'reject');
      try {
        const u = await authUser(headers);
        if (!u) return send(401, { error: '未登录或登录已过期' });
        const request = await colGet(fa.FOUNDER_REQUEST_COLLECTION, rid);
        if (!request) return send(404, { error: '申请不存在' });
        if (request.status !== 'pending') {
          return send(400, { error: request.status === 'approved' ? '该申请已通过' : '该申请已驳回' });
        }
        const targetTreeId = request.master_tree_id || MASTER_TREE_ID;
        await requireWriteUser(headers, targetTreeId, pathname, request.master_handle, false);
        const now = new Date().toISOString();
        if (!approve) {
          await colSet(fa.FOUNDER_REQUEST_COLLECTION, rid, {
            ...request,
            status: 'rejected',
            decided_by: u.phone,
            decided_at: now,
            reject_reason: String(body.reason || '').slice(0, 200),
          });
          return send(200, { ok: true, status: 'rejected' });
        }
        const srcKind = fa.treeKindOf(clan.entryOf(await getMeta(), request.tree_id));
        const result =
          srcKind === fa.TREE_KIND.CLAN
            ? await clan.attachClanToMaster({
                treeId: request.tree_id,
                masterTreeId: targetTreeId,
                masterHandle: request.master_handle,
                chainDepth: body.chain_depth,
                // 被指定为祖谱始祖的节点：审批请求显式给出 → 否则用发起认祖的那个节点
                // （无始祖态重置后 meta.founder_handle 已被清空，必须由发起节点接手）
                ownRootHandle: body.founder_handle || request.founder_handle,
                requestedBy: request.requested_by,
              })
            : await fa.attachFounder({
                treeId: request.tree_id,
                founderHandle: request.founder_handle,
                masterTreeId: targetTreeId,
                masterHandle: request.master_handle,
                requestedBy: request.requested_by,
                entry: await fa.metaEntryOf(request.tree_id),
                targetEntry: clan.entryOf(await getMeta(), targetTreeId),
              });
        await colSet(fa.FOUNDER_REQUEST_COLLECTION, rid, {
          ...request,
          status: 'approved',
          decided_by: u.phone,
          decided_at: now,
          result,
        });
        return send(200, { ok: true, status: 'approved', result });
      } catch (e) {
        return safeError(e);
      }
    }

    // 方式 B：上层树的总编辑/主理人在真身节点上直接选树挂载（无需申请）
    // - 目标树 = 要被挂载的下层树（tree_id）；target_tree_id = 上层树（缺省 = 本请求树 / 世本）
    // - 普通家族树 → 只能挂到祖谱；祖谱 → 只能挂到世本（硬口径 2）
    if (pathname === '/admin/attach-founder' && method === 'POST') {
      const body = parseBody(event);
      const attachTree = String(body.tree_id || '').trim();
      const targetTreeId = String(body.target_tree_id || treeId || MASTER_TREE_ID).trim();
      const masterRef = String(body.target_handle || body.master_handle || body.target_ref || '').trim();
      if (!attachTree) return send(400, { error: '请选择要挂载的下层树（祖谱 / 家族树）' });
      if (!masterRef) return send(400, { error: '缺少 target_handle' });
      const masterHit = await resolveNode(masterRef, targetTreeId, { targetTreeId });
      if (!masterHit) return send(404, { error: `目标树 ${targetTreeId} 中找不到编号/句柄为「${masterRef}」的节点` });
      const masterHandle = masterHit.handle;
      try {
        const u = await requireWriteUser(headers, targetTreeId, pathname, masterHandle, false);
        const meta = await getMeta();
        const srcEntry = clan.entryOf(meta, attachTree);
        const targetEntry = clan.entryOf(meta, targetTreeId);
        const tree = await getTree(attachTree);
        if (!tree) return send(404, { error: `树不存在: ${attachTree}` });
        fa.assertAttachTarget({ sourceTreeId: attachTree, sourceEntry: srcEntry, targetTreeId, targetEntry });
        const srcKind = fa.treeKindOf(srcEntry);
        let result;
        if (srcKind === fa.TREE_KIND.CLAN) {
          result = await clan.attachClanToMaster({
            treeId: attachTree,
            masterTreeId: targetTreeId,
            masterHandle,
            chainDepth: body.chain_depth,
            ownRootHandle: body.founder_handle,
            requestedBy: u.phone,
          });
        } else {
          // 指定为始祖的节点也收全局编号（树内旧号亦可）
          const explicitHit = String(body.founder_handle || body.founder_ref || '').trim()
            ? await resolveNode(String(body.founder_handle || body.founder_ref).trim(), attachTree)
            : null;
          const explicit = explicitHit ? explicitHit.handle : '';
          const founderHandle = explicit || fa.resolveFounderHandle(tree, srcEntry);
          // 无始祖态（重置后）的树须显式指定要登记为始祖的节点（认祖 = 指定始祖）
          if (!founderHandle && fa.isFounderMissing(srcEntry)) {
            return send(400, { error: '该家族树尚未登记始祖，请先选择要指定为始祖的节点' });
          }
          if (!founderHandle) return send(404, { error: '该家族树没有登记的始祖节点，无法挂载' });
          result = await fa.attachFounder({
            treeId: attachTree,
            founderHandle,
            masterTreeId: targetTreeId,
            masterHandle,
            requestedBy: u.phone,
            entry: srcEntry,
            targetEntry,
          });
        }
        // 同树若有待审批的认祖申请 → 一并置为通过（直接挂载语义上已完成认祖）
        const now = new Date().toISOString();
        for (const r of await colAll(fa.FOUNDER_REQUEST_COLLECTION)) {
          if (r.status !== 'pending' || r.tree_id !== attachTree) continue;
          await colSet(fa.FOUNDER_REQUEST_COLLECTION, r._id, {
            ...r,
            status: 'approved',
            decided_by: u.phone,
            decided_at: now,
            decided_via: 'direct_attach',
            result,
          });
        }
        return send(200, result);
      } catch (e) {
        return safeError(e);
      }
    }

    // 解除始祖挂载（双方均可发起，无需申请，立即生效）
    // - 下层树侧：传始祖节点 person_handle（本树 steward / chief）；祖谱 → 清顶端镜像段、留自有段
    // - 上层树侧：传 master_handle / target_handle（+ attached_tree_id 指定具体挂载树；仅一个时可省略）
    if (pathname === '/admin/detach-founder' && method === 'POST') {
      const body = parseBody(event);
      const fromTree = body.tree_id || treeId;
      if (!fromTree) return send(400, { error: '缺少 X-Tree-Id' });
      try {
        const meta = await getMeta();
        const fromEntry = clan.entryOf(meta, fromTree);
        const fromKind = fa.treeKindOf(fromEntry);
        const isMasterSide = fromKind === fa.TREE_KIND.MASTER || fromTree === MASTER_TREE_ID;
        if (isMasterSide) {
          const masterRef = String(body.master_handle || body.target_handle || body.person_handle || '').trim();
          if (!masterRef) return send(400, { error: '缺少 master_handle' });
          const masterHit = await resolveNode(masterRef, MASTER_TREE_ID);
          if (masterHit && masterHit.tree_id !== MASTER_TREE_ID) {
            return send(404, { error: `编号/句柄「${masterRef}」属于家族树 ${masterHit.tree_id}，不在总谱` });
          }
          // 解析不到（未知节点）→ 原样透传，由下游「未挂载任何树」等语义决定状态码
          const masterHandle = masterHit ? masterHit.handle : masterRef;
          await requireWriteUser(headers, MASTER_TREE_ID, pathname, masterHandle, false);
          const attachments = fa.attachedTreesOf(
            await fa.listAttachedTrees({ masterTreeId: MASTER_TREE_ID }),
            masterHandle,
          );
          const clanList = (await clan.listClans({ meta })).filter((c) => c.master_handle === masterHandle);
          const want = String(body.attached_tree_id || body.attached_clan_tree_id || '').trim();
          if (!want && attachments.length + clanList.length > 1) {
            return send(400, { error: '请选择要解除的挂载树' });
          }
          const target = want || attachments[0]?.tree_id || clanList[0]?.tree_id || '';
          if (!target) {
            return send(400, {
              error: attachments.length || clanList.length ? '请选择要解除的挂载树' : '该节点当前没有挂载树',
            });
          }
          if (clanList.some((c) => c.tree_id === target)) {
            return send(200, await clan.detachClanFromMaster({ treeId: target }));
          }
          const att = attachments.find((a) => a.tree_id === target);
          if (!att) return send(400, { error: '该上层节点未挂载到该树' });
          return send(200, await fa.detachFounder({
            treeId: target,
            founderHandle: att.founder_handle,
            masterTreeId: MASTER_TREE_ID,
          }));
        }
        if (fromKind === fa.TREE_KIND.CLAN) {
          // 祖谱侧：清空顶端镜像段，自有段保留（docs/clan-tree.spec.md §5）
          const handle = String(body.person_handle || body.founder_handle || '').trim();
          await requireWriteUser(headers, fromTree, pathname, handle, false);
          return send(200, await clan.detachClanFromMaster({ treeId: fromTree }));
        }
        if (!body.person_handle) return send(400, { error: '缺少 person_handle' });
        const detachHit = await resolveNode(String(body.person_handle).trim(), fromTree);
        if (!detachHit) return send(404, { error: `找不到编号/句柄为「${body.person_handle}」的节点` });
        await requireWriteUser(headers, fromTree, pathname, detachHit.handle, false);
        const tree = await getTree(fromTree);
        const founder = tree?.people?.[detachHit.handle];
        return send(200, await fa.detachFounder({
          treeId: fromTree,
          founderHandle: detachHit.handle,
          masterTreeId: founder?.external_tree || '',
        }));
      } catch (e) {
        return safeError(e);
      }
    }

    // 重置始祖（清空本树始祖登记 → 回到「无始祖」态，可重新「认祖」）
    // - 只写 tree-meta（founder_handle / founder_gramps_id / founder_name 删除，founder_state='none'）
    // - 总谱（kind='master'）→ 400；当前始祖为镜像 → 400（须先「解除挂载」）；树不存在 → 404
    // - 鉴权：本树写权（requireWriteUser；总谱仅 chief_editor）
    if (pathname === '/admin/reset-founder' && method === 'POST') {
      const body = parseBody(event);
      const reqTree = String(body.tree_id || treeId || '').trim();
      if (!reqTree) return send(400, { error: '缺少 X-Tree-Id' });
      try {
        const u = await authUser(headers);
        if (!u) return send(401, { error: '请先登录后再进行编辑操作' });
        const tree = await getTree(reqTree);
        if (!tree) return send(404, { error: `树不存在: ${reqTree}` });
        const meta = await getMeta();
        // 节点级写权校验要拿到「当前始祖节点」handle（无 person_handle 时按始祖位置解析）
        const personHandle =
          String(body.person_handle || body.founder_handle || '').trim() ||
          fa.currentFounderHandle(tree, clan.entryOf(meta, reqTree));
        await requireWriteUser(headers, reqTree, pathname, personHandle, false);
        return send(200, await fa.resetFounder({ treeId: reqTree, meta }));
      } catch (e) {
        return safeError(e);
      }
    }

    // ---- 祖谱（docs/clan-tree.spec.md）----
    // 认祖目标选择器数据：祖谱清单（按姓过滤）+ 各祖谱的自有支系入口
    if (pathname === '/admin/clans' && method === 'GET') {
      const surname = String(query.surname || '').trim();
      const all = await clan.listClans();
      const list = surname ? all.filter((c) => c.surname === surname) : all;
      return send(200, { ok: true, list });
    }

    // 祖谱页面数据（P4 三段版式）：顶端镜像链 / 自有世代 / 支系入口列表 + 统计口径
    if (pathname === '/admin/clan-info' && method === 'GET') {
      const want = String(query.tree_id || treeId || '').trim();
      if (!want) return send(400, { error: '缺少 tree_id' });
      const info = await clan.clanInfo({ treeId: want });
      if (info.kind !== fa.TREE_KIND.CLAN) return send(400, { error: `该树不是祖谱: ${want}` });
      return send(200, { ok: true, ...info });
    }

    // 建谱申请：发起人 = 该姓现有树 steward / chief_editor（硬口径 3）→ 写 pending
    if (pathname === '/admin/clan-request' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const body = parseBody(event);
      try {
        const meta = await getMeta();
        const reqTree = String(body.tree_id || treeId || '').trim();
        const anchorEntry =
          (reqTree ? clan.entryOf(meta, reqTree) : null) ||
          Object.values(meta.trees || {}).find((t) => clan.clanSurnameOf(t) === String(body.surname || '').trim());
        if (!anchorEntry) return send(400, { error: '未找到该姓的现有家族树，请先建立家族树再申请祖谱' });
        const surname = String(body.surname || '').trim() || clan.clanSurnameOf(anchorEntry);
        if (!/^[\u4e00-\u9fa5]$/.test(surname)) return send(400, { error: '请填写单个汉字姓氏' });
        if (clan.clanSurnameOf(anchorEntry) && clan.clanSurnameOf(anchorEntry) !== surname) {
          return send(400, { error: `所选家族树不属于「${surname}」姓` });
        }
        await requireWriteUser(headers, anchorEntry.tree_id, pathname, '', false);
        const masterRef = String(body.master_handle || body.target_handle || body.master_ref || '').trim();
        if (!masterRef) return send(400, { error: '请选择中华世本（总谱）的始祖节点' });
        const masterHit = await resolveNode(masterRef, MASTER_TREE_ID, { targetTreeId: MASTER_TREE_ID });
        const masterTree = await getTree(MASTER_TREE_ID);
        const masterPerson = masterHit ? masterTree?.people?.[masterHit.handle] : null;
        if (!masterPerson) return send(404, { error: '所选中华世本节点不存在' });
        const masterHandle = masterHit.handle;
        const clauses = await colAll(clan.CLAN_REQUEST_COLLECTION);
        if (clauses.some((r) => r.status === 'pending' && r.surname === surname && r.master_handle === masterHandle)) {
          return send(400, { error: clan.PENDING_CLAN_MESSAGE });
        }
        // 硬口径 1（同姓同世本节点唯一）提前拦截，避免审批时才失败
        try {
          clan.assertClanFounderUnique({
            entries: meta.trees,
            surname,
            masterTreeId: MASTER_TREE_ID,
            masterHandle,
          });
        } catch (e) {
          return send(e.status || 400, { error: e.message });
        }
        const id = clan.genRequestId();
        const request = clan.buildClanRequest({
          id,
          surname,
          treeId: anchorEntry.tree_id,
          masterTreeId: MASTER_TREE_ID,
          masterHandle,
          masterName: masterPerson.name || '',
          clanTitle: body.clan_title,
          requestedBy: u.phone,
          note: body.note,
        });
        await colSet(clan.CLAN_REQUEST_COLLECTION, id, request);
        return send(200, {
          ok: true,
          request_id: id,
          status: 'pending',
          surname,
          master_tree_id: MASTER_TREE_ID,
          master_name: masterPerson.name || '',
          message: `建谱申请已提交，等待总编辑审批（始祖：${masterPerson.name || ''}）`,
        });
      } catch (e) {
        return safeError(e);
      }
    }

    // 待审批建谱申请：chief_editor 看全部；其余看本人发起 / 本树相关的
    if (pathname === '/admin/clan-requests' && method === 'GET') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user) return send(401, { error: '用户不存在' });
      const chief = user.role === 'chief_editor';
      const anchor = chief ? null : await getAnchor(u.phone);
      const list = clan.filterPendingClanRequests(await colAll(clan.CLAN_REQUEST_COLLECTION), {
        chief,
        myTreeIds: anchor?.tree_id ? [anchor.tree_id] : [],
        myPhone: u.phone,
      });
      return send(200, { ok: true, list, can_approve_all: chief, my_tree: anchor?.tree_id || '' });
    }

    // 建谱审批（仅 chief_editor，硬口径 3）：通过 → 唯一性校验 + 建祖谱树；驳回 → 只写理由
    if (pathname === '/admin/decide-clan' && method === 'POST') {
      const body = parseBody(event);
      const rid = String(body.request_id || '').trim();
      if (!rid) return send(400, { error: '缺少 request_id' });
      const approve = !(body.approve === false || body.action === 'reject');
      try {
        const u = await authUser(headers);
        if (!u) return send(401, { error: '未登录或登录已过期' });
        const user = await colGet('jiazu_users', u.phone);
        if (!user || user.role !== 'chief_editor') return send(403, { error: '建谱审批需要总编辑权限' });
        const request = await colGet(clan.CLAN_REQUEST_COLLECTION, rid);
        if (!request) return send(404, { error: '申请不存在' });
        if (request.status !== 'pending') {
          return send(400, { error: request.status === 'approved' ? '该申请已通过' : '该申请已驳回' });
        }
        const now = new Date().toISOString();
        if (!approve) {
          await colSet(clan.CLAN_REQUEST_COLLECTION, rid, {
            ...request,
            status: 'rejected',
            decided_by: u.phone,
            decided_at: now,
            reject_reason: String(body.reason || '').slice(0, 200),
          });
          return send(200, { ok: true, status: 'rejected' });
        }
        const result = await clan.createClanTree({
          surname: request.surname,
          clanTitle: request.clan_title,
          masterTreeId: request.master_tree_id || MASTER_TREE_ID,
          masterHandle: request.master_handle,
          chainDepth: body.chain_depth,
          ownRootName: body.founder_name,
          initiatorPhone: request.requested_by,
        });
        await colSet(clan.CLAN_REQUEST_COLLECTION, rid, {
          ...request,
          status: 'approved',
          tree_id: result.tree_id,
          decided_by: u.phone,
          decided_at: now,
          result,
        });
        return send(200, { ok: true, status: 'approved', result });
      } catch (e) {
        return safeError(e);
      }
    }

    // 重新指定父节点（管理员）：填新父节点编号 → 直接把节点改挂到该节点家族下。
    // 编号属于**别的家族树**时 = 跨树改父：该节点及其全部子节点整体迁到目标家族树
    // （单事务 updateTrees([源树, 目标树])，失败双侧回滚；详情文档随迁、目标树编号重分配）
    if (pathname === '/admin/reparent' && method === 'POST') {
      const body = parseBody(event);
      if (!body.person_handle) return send(400, { error: '缺少 person_handle' });
      if (!String(body.new_parent_id || '').trim()) return send(400, { error: '请填写新父节点编号' });
      const reparentTreeId = body.tree_id || treeId || MASTER_TREE_ID;
      let gate = null; // 闸门（冲正标记随 catch 回显：fee_refunded）
      try {
        // 跨树迁移的发起人需对**源树**有写权（目标树按现有跨树写入口径不额外要求写权）
        const u = await requireWriteUser(headers, reparentTreeId, pathname, body.person_handle, false);
        // 始祖镜像节点：父/母结构只读（docs/founder-attach.spec.md §5）→ 403 且不扣费
        await fa.assertFounderEditable(await getTree(reparentTreeId), body.person_handle, MASTER_TREE_ID);
        // P1 闸门：同树改父 1 片 / 跨树迁移 9 片（**单价由 feeOf 决定，与带多少后代无关**）
        gate = feeGate(u.phone, 'reparent');
        const result = await tw.reparentNode({
          treeId: reparentTreeId,
          personHandle: body.person_handle,
          newParentRef: body.new_parent_id,
          masterTreeId: MASTER_TREE_ID,
          targetTreeId: String(body.new_parent_tree_id || '').trim(),
          maxDepth: MAX_DEPTH,
          depthOf: (t) => computeTreeDepth(t, null).totalGenerations,
          charge: gate.charge,
          refund: gate.refund,
        });
        return send(200, result);
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e, gate?.refunded ? { fee_refunded: true } : {}));
      }
    }

    // 删除节点（管理员）：默认「连同全部后代」，mode='promote' → 仅删本节点、子女上提一级。
    // 拒绝：总谱 / 始祖节点 / 镜像节点 / 待删子树被其它家族树引用（409，绝不级联改对方树）。
    // body: { tree_id, person_handle, mode?, dry_run?, confirm_count? }
    if (pathname === '/admin/delete-node' && method === 'POST') {
      const body = parseBody(event);
      if (!body.person_handle) return send(400, { error: '缺少 person_handle' });
      const delTreeId = body.tree_id || treeId || '';
      if (!delTreeId) return send(400, { error: '缺少 tree_id' });
      let gate = null; // 闸门（冲正标记随 catch 回显：fee_refunded）
      try {
        // 统一解析：全局编号（I000052 / 000052）/ handle / 树内旧号 都收（docs/id-system.spec.md §5）
        const delHit = await resolveNode(String(body.person_handle).trim(), delTreeId);
        if (!delHit) return send(404, { error: `找不到编号/句柄为「${body.person_handle}」的节点` });
        if (delHit.tree_id !== delTreeId) {
          return send(400, { error: `「${body.person_handle}」属于家族树 ${delHit.tree_id}，请在该树内删除` });
        }
        const delHandle = delHit.handle;
        const u = await requireWriteUser(headers, delTreeId, pathname, delHandle, false);
        await fa.assertFounderEditable(await getTree(delTreeId), delHandle, MASTER_TREE_ID);
        // P1 闸门：dry_run / 确认数不符 = 0 片；正式提交 3 片 × 本次删除节点数（subtree）/ 3 片（promote）
        gate = feeGate(u.phone, 'delete_node');
        const result = await tw.deleteNode({
          treeId: delTreeId,
          personHandle: delHandle,
          mode: body.mode === tw.DELETE_MODE_PROMOTE ? tw.DELETE_MODE_PROMOTE : tw.DELETE_MODE_SUBTREE,
          masterTreeId: MASTER_TREE_ID,
          dryRun: body.dry_run === true,
          confirmCount: body.confirm_count === undefined || body.confirm_count === null ? null : Number(body.confirm_count),
          charge: gate.charge,
          refund: gate.refund,
        });
        return send(200, result);
      } catch (e) {
        return send(e.status || 400, eco.errorPayload(e, gate?.refunded ? { fee_refunded: true } : {}));
      }
    }

    // ================= 立支 / 汇宗（docs/branch-clan-ops.spec.md · P5） =================
    // 权限：立支 = 本树 `tree_steward` / `chief_editor`（费用扣**发起人个人**资产）；汇宗 = 仅 `chief_editor`。
    // 树上下文一律取 **body 的 `tree_id`**（不依赖 `X-Tree-Id`），因此**必须注册在树编辑闸门之前**（§8 / §13-14）。
    // 错误体统一走 `eco.errorPayload`（只回域名码：`ASSET_INSUFFICIENT` / `DELETE_SCOPE_CHANGED`）。
    if (pathname === '/admin/establish-branch' && method === 'POST') {
      let gate = null; // 闸门（冲正标记随 catch 回显：fee_refunded）
      try {
        const body = parseBody(event);
        const u = await authUser(headers);
        if (!u) throw httpError(401, '请先登录后再进行编辑操作');
        const reqUser = await colGet('jiazu_users', u.phone);
        if (!reqUser) throw httpError(401, '用户不存在');
        if (reqUser.role === 'guest') throw httpError(403, '游客无编辑权限，请注册后编辑');
        if (reqUser.role !== 'chief_editor' && reqUser.role !== 'tree_steward') {
          throw httpError(403, '立支需要本家族树主理人（tree_steward）或总编辑（chief_editor）权限');
        }
        if (!body.tree_id) throw httpError(400, '缺少 tree_id');
        if (!String(body.person_handle || '').trim()) throw httpError(400, '缺少 person_handle');
        // 立支费（颗石榴籽；默认 9999，后台 `config.branch_fee_seeds` 可覆盖）
        const feeSeeds = await wallet.getBranchFeeSeeds();
        gate = feeGate(u.phone, 'establish_branch');
        return send(
          200,
          await bco.establishBranch({
            treeId: body.tree_id,
            personRef: body.person_handle,
            phone: u.phone,
            feeSeeds,
            charge: gate.charge,
            refund: gate.refund,
          }),
        );
      } catch (e) {
        const payload = eco.errorPayload(e);
        if (gate && gate.refunded) payload.fee_refunded = true;
        // §7-1：业务错误沿用自身 status；**系统级失败（EACCES / ENOENT… 无 status）一律 500 + 通用文案**
        return send(e.status || payload.status || 500, payload);
      }
    }

    // 汇宗（并入他树）：源树全部真实节点整体迁到目标节点 X 之下，源树条目与树 JSON 删除（**不可逆**）。
    // **0 片 + 0 籽**（不接扣费闸门）；源树灵气剩余有效期按比例折损后累加到目标树（未镶嵌玉 → 只提示）。
    // body: { tree_id, target_person_id, confirm_people }（`target_person_id` = 全局编号 / handle，走 resolveNode）
    if (pathname === '/admin/converge-clan' && method === 'POST') {
      try {
        const body = parseBody(event);
        const u = await authUser(headers);
        if (!u) throw httpError(401, '请先登录后再进行编辑操作');
        const reqUser = await colGet('jiazu_users', u.phone);
        if (!reqUser || reqUser.role !== 'chief_editor') throw httpError(403, '需要总编辑权限');
        const ratio = await wallet.getConvergeSpiritRatio();
        return send(
          200,
          await bco.convergeClan({
            treeId: body.tree_id,
            targetRef: body.target_person_id,
            confirmPeople: body.confirm_people,
            ratio,
          }),
        );
      } catch (e) {
        // §7-2：业务错误沿用自身 status；系统级失败（无 status）一律 500 + 通用文案
        const payload = eco.errorPayload(e);
        return send(e.status || payload.status || 500, payload);
      }
    }

    // 新建家族树（chief_editor）：校验通过 → 扣 9颗石榴籽 → 写树 JSON + 始祖 + tree-meta
    // （P1：原 ¥9.90 `wallet.deductTreeCreateFee` 钩子废弃 → 资产侧扣籽；删树不退）
    if (pathname === '/admin/create-tree' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user || user.role !== 'chief_editor') return send(403, { error: '需要总编辑权限' });
      const body = parseBody(event);
      let charged = null;
      try {
        const result = await tw.createTree({
          surnameChar: body.surname_char,
          founderName: body.founder_name,
          founderGender: body.founder_gender,
          displayTitle: body.display_title,
          genealogyName: body.genealogy_name,
          hallName: body.hall_name,
          origin: body.origin,
          description: body.description,
          initiatorPhone: u.phone,
          // 校验全部通过后、落库前扣 9颗石榴籽（不足 409 → 不建树、不扣籽）
          onBeforeWrite: async (plannedTreeId) => {
            charged = await eco.chargeSeeds(u.phone, eco.FEE.tree_create_seeds, {
              op: 'tree_create',
              tree_id: plannedTreeId,
            });
          },
        });
        return send(200, result);
      } catch (e) {
        const refunded = await refundQuietly(u.phone, charged, '建树落库失败，已原路返还');
        return send(e.status || 400, eco.errorPayload(e, refunded ? { fee_refunded: true } : {}));
      }
    }

    if (pathname === '/admin/split-tree' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user || user.role !== 'chief_editor') return send(403, { error: '需要总编辑权限' });
      const body = parseBody(event);
      if (!body.tree_id || !body.ancestor_handle) return send(400, { error: '缺少 tree_id 或 ancestor_handle' });
      try {
        const result = await tw.splitTree({
          treeId: body.tree_id,
          ancestorHandle: body.ancestor_handle,
          ancestorName: body.ancestor_name || '',
          initiatorPhone: u.phone,
        });
        return send(200, result);
      } catch (e) {
        return safeError(e, 500, '拆分失败');
      }
    }

    // 总谱续编（chief_editor）：在中华世本源流链节点下续编第 N+1 世
    // mode='new' 新建节点 / mode='attach' 挂接树内已有节点
    if (pathname === '/admin/chain-append' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user || user.role !== 'chief_editor') return send(403, { error: '需要总编辑权限' });
      const body = parseBody(event);
      if (!body.tree_id || !body.parent_handle) return send(400, { error: '缺少 tree_id 或 parent_handle' });
      try {
        const result = await tw.appendChainNode({
          treeId: body.tree_id,
          parentHandle: body.parent_handle,
          mode: body.mode === 'attach' ? 'attach' : 'new',
          name: body.name || '',
          surname: body.surname || '',
          gender: body.gender || 'U',
          childHandle: body.child_handle || '',
          note: body.note || '',
          extraAttributes: body.attributes || [],
          masterTreeId: MASTER_TREE_ID,
        });
        return send(200, result);
      } catch (e) {
        return safeError(e);
      }
    }

    // 总谱批量续编（chief_editor）：按**已解析好的名字数组**（前端解析标点/序号）沿「一条线」依次续编
    // 最多 MAX_BATCH_CHAIN（10）代子孙；全部新节点 + 详情文档 + 家族挂接在**同一次** updateTree 回调内完成
    // （整批成功或整批不写）。入参 `{ tree_id, parent_handle, names }` —— **不接受 surname**（姓一律随父姓继承），
    // 也不解析文本（解析在前端）。鉴权档位与 `/admin/chain-append` 完全一致。
    if (pathname === '/admin/chain-append-batch' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user || user.role !== 'chief_editor') return send(403, { error: '需要总编辑权限' });
      const body = parseBody(event);
      try {
        const result = await tw.appendChainBatch({
          treeId: body.tree_id,
          parentHandle: body.parent_handle,
          names: body.names,
          masterTreeId: MASTER_TREE_ID,
        });
        return send(200, result);
      } catch (e) {
        return safeError(e);
      }
    }

    if (pathname === '/admin/remove-branch-link' && method === 'POST') {
      const u = await authUser(headers);
      if (!u) return send(401, { error: '未登录或登录已过期' });
      const user = await colGet('jiazu_users', u.phone);
      if (!user || user.role !== 'chief_editor') return send(403, { error: '需要总编辑权限' });
      const body = parseBody(event);
      if (!body.tree_id || !body.person_handle) return send(400, { error: '缺少 tree_id 或 person_handle' });
      await tw.removeBranchLink(body.tree_id, body.person_handle);
      return send(200, { ok: true });
    }

    // GET /search/global（全站人物搜索：跨树按姓名 / 编号检索，套节点级读权限裁剪 + 镜像归并）
    // 口径 B：**不需要 X-Tree-Id**，且必须注册在树编辑闸门（下方 `缺少 X-Tree-Id`）**之前**。
    // 口径 D（镜像归并）：镜像节点按**最终真身** handle 折叠，同一人只出一条；出参新增 restricted。
    // 口径 D-2（假受限修复）：restricted **不再用「组内有没有真身节点」代理**，而是递归解析镜像链到最终真身，
    //   再**直接判定真身对当前访问者的可见性**：
    //   真身可见 → 代表取真身（tree_id/tree_title/handle/gramps_id/… 全取真身）且 restricted=false
    //             —— 即使查询（编号 / 姓名）只命中镜像；
    //   真身不可见 / 解析不到 → 代表保持镜像且 restricted=true，且**不得泄漏真身**任何信息。
    // 入参 query（trim 后为空 → 200 []）、limit（默认 30，clamp 1..100）。
    // 排序：matched==='id' 命中置顶 → 其余按 tree_id 字典序（稳定，同树内保持 people 键序）。
    // **先归并、后截断到 limit**（同一人不会占多个名额，故扫描阶段不做 limit 短路）。
    if (pathname === '/search/global' && method === 'GET') {
      const raw = String(query.query ?? '').trim();
      if (!raw) return send(200, []);
      const parsedLimit = parseInt(String(query.limit ?? ''), 10);
      const limit = Number.isFinite(parsedLimit) ? Math.min(100, Math.max(1, parsedLimit)) : 30;
      const qNorm = raw.replace(/\s+/g, '').toLowerCase(); // 去空格 + 小写（大小写不敏感）
      const qNum = numberOfId(raw); // 纯数字形态（`123` / `000123` / `I000123` → 123；非编号 → null）

      // 镜像判据：**只有** external_mirror==='true' 才算镜像 —— 真身自身也会带 external_*（配偶指针），不能作判据。
      const isMirrorNode = (p) => String(p?.external_mirror) === 'true' && !!p?.external_person_handle;

      // 请求内缓存（口径 D-2 · 改动 3）：同一次搜索里 getTree / resolveTreeAccess / 真身解析
      // 按 tree_id（真身解析按 tree:handle）各只算一次 —— 真身可能落在候选集之外的树，递归解析会引发额外 IO。
      // **只在本请求生命周期内有效**：可见性判定取决于请求者身份，绝不写成模块级长存（否则跨请求串权）。
      const ctx = { treeCache: new Map(), accessCache: new Map(), realCache: new Map() };
      const ctxTree = async (id) => {
        const key = String(id || '');
        if (!key) return null;
        if (!ctx.treeCache.has(key)) {
          let t = null;
          try {
            t = await getTree(key);
          } catch {
            t = null;
          }
          ctx.treeCache.set(key, t);
        }
        return ctx.treeCache.get(key);
      };
      const ctxAccess = async (id, tree) => {
        const key = String(id || '');
        if (!ctx.accessCache.has(key)) ctx.accessCache.set(key, await resolveTreeAccess(headers, key, tree));
        return ctx.accessCache.get(key);
      };

      const meta = await getMeta();
      const trees = [];
      for (const [key, entry] of Object.entries(meta?.trees || {})) {
        const id = String(entry?.tree_id || key || '').trim();
        if (!id) continue;
        const tree = await ctxTree(id);
        if (!tree || !tree.people) continue; // meta 有登记但树文件缺失 → 跳过该树（不得整体 500）
        // ord：该树内 people 键序（供归并后「同树内保持 people 键序」显式 tie-break，不依赖遍历顺序）
        trees.push({ id, title: entry?.display_title || id, tree, ord: new Map(Object.keys(tree.people).map((h, i) => [h, i])) });
      }
      trees.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // tree_id 字典序（稳定）
      const treeById = new Map(trees.map((t) => [t.id, t]));
      // 树引用：真身可能不在候选集（本次命中）里 → 按 tree_id 从已加载树取；未登记树兜底用 meta 标题
      const treeRefOf = (id) =>
        treeById.get(id) || { id, title: String(meta?.trees?.[id]?.display_title || id), tree: null, ord: null };

      // 递归解析最终真身（口径 D-2）：镜像节点沿 external_person_handle 逐级向上，直到非镜像节点。
      // - 定位：先在 external_tree 对应的**已加载树**里找该 handle；external_tree 空/指错 → 扫其余已加载树（全局定位）；
      // - 防环：已访问 handle 集合命中环 → 返回 null（环上没有真身，绝不拿镜像冒充真身）；
      // - 防深：至多 MAX_MIRROR_HOPS 跳；断链（该环解析失败）→ 返回最后一个已解析节点（兵底，可能为 null）；
      // - **绝不抛**：任何一环异常都收敛为「解析不到」（调用侧按 restricted=true 处理）。
      const MAX_MIRROR_HOPS = 32;
      const findPersonByHandle = async (treeId, handle) => {
        const tip = String(treeId || '').trim();
        if (tip) {
          const p = treeById.get(tip)?.tree?.people?.[handle];
          if (p) return { treeId: tip, person: p };
        }
        for (const t of trees) {
          const p = t.tree?.people?.[handle];
          if (p) return { treeId: t.id, person: p };
        }
        return null; // 未登记树 / 幽灵树 → 解析不到（不猜）
      };
      const resolveRealBody = async (t, p) => {
        const ck = `${t.id}:${p.handle}`;
        if (ctx.realCache.has(ck)) return ctx.realCache.get(ck);
        const walk = async () => {
          if (!isMirrorNode(p)) return { treeId: t.id, person: p }; // 已是真身
          let cur = p;
          let last = null; // 兵底：最后一个成功解析到的节点
          const seen = new Set();
          for (let hop = 0; hop < MAX_MIRROR_HOPS; hop++) {
            const ref = String(cur.external_person_handle || '').trim();
            if (!ref || seen.has(ref)) return null; // 空指针 / 成环 → 环上没有真身
            seen.add(ref);
            let hit = null;
            try {
              hit = await findPersonByHandle(cur.external_tree, ref);
            } catch {
              hit = null;
            }
            if (!hit) return last; // 该环解析失败 → 兵底（绝不抛）
            if (!isMirrorNode(hit.person)) return hit; // 最终非镜像节点 = 真身
            last = hit;
            cur = hit.person;
          }
          return last; // 超深（异常数据）→ 兵底
        };
        const out = await walk();
        ctx.realCache.set(ck, out);
        return out;
      };

      const shape = (t, p, matched) => ({
        tree_id: t.id,
        tree_title: t.title,
        handle: p.handle,
        gramps_id: p.gramps_id || '',
        name: p.name || `${p.surname || ''}${p.given || ''}`,
        gender: p.gender || '',
        birth_date: p.birth_date === undefined || p.birth_date === null ? '' : String(p.birth_date),
        death_date: p.death_date === undefined || p.death_date === null ? '' : String(p.death_date),
        matched,
      });

      // 候选全量收集（不截断；归并后再截断）：pushHit 只做 (tree_id, handle) 精确去重
      const seen = new Set();
      const hits = [];
      const pushHit = (t, p, matched, pinned) => {
        const k = `${t.id}:${p.handle}`;
        if (seen.has(k)) return;
        seen.add(k);
        hits.push({ t, p, matched, pinned: pinned === true });
      };

      // ① 编号 / handle 精确命中（不传 treeId = 全站解析）→ matched:'id' 并置顶
      let refHit = null;
      try {
        refHit = await resolveNode(raw);
      } catch {
        refHit = null; // 多树重号等歧义 → 退回下方姓名 / 编号扫描，不让搜索整体失败
      }
      if (refHit) {
        const t = trees.find((x) => x.id === refHit.tree_id);
        const p = t?.tree.people?.[refHit.handle];
        if (t && p) {
          const access = await ctxAccess(t.id, t.tree);
          if (!access.isHiddenPerson(p.handle)) pushHit(t, p, 'id', true);
        }
      }

      // ② 编号匹配（gramps_id 去掉 I/F 前缀后的数字部分与 query 的纯数字形态相等）→ matched:'id'
      for (const t of trees) {
        const access = await ctxAccess(t.id, t.tree);
        for (const p of Object.values(t.tree.people)) {
          if (!p || !p.handle) continue;
          if (seen.has(`${t.id}:${p.handle}`)) continue;
          if (access.isHiddenPerson(p.handle)) continue; // 节点级可见裁剪（guest / 登录未加入 / member 分档沿用既有函数）
          const pid = numberOfId(p.gramps_id);
          if (qNum === null || pid === null || pid !== qNum) continue;
          pushHit(t, p, 'id', false);
        }
      }

      // ③ 姓名匹配（name / surname / given 任一包含 query）→ matched:'name'
      for (const t of trees) {
        const access = await ctxAccess(t.id, t.tree);
        for (const p of Object.values(t.tree.people)) {
          if (!p || !p.handle) continue;
          if (seen.has(`${t.id}:${p.handle}`)) continue;
          if (access.isHiddenPerson(p.handle)) continue;
          const hitName = [p.name, p.surname, p.given].some((f) =>
            String(f === undefined || f === null ? '' : f)
              .replace(/\s+/g, '')
              .toLowerCase()
              .includes(qNorm),
          );
          if (!hitName) continue;
          pushHit(t, p, 'name', false);
        }
      }

      // ==== 镜像归并（口径 D / D-2）：同一归并键 = 同一人 → 只出一条 ====
      // 归并键 = 递归解析到的**最终真身** handle（多级镜像链折叠到同一真身）；解析不到 → 退回
      // 「镜像取 external_person_handle / 真身取自身 handle」（handle 全站唯一；**绝不按姓名归并**）。
      const groups = new Map(); // 归并键 → 组内候选（保持 hits 扫描序）
      for (const h of hits) {
        const rel = await resolveRealBody(h.t, h.p);
        const key =
          rel?.person?.handle || (isMirrorNode(h.p) ? String(h.p.external_person_handle) : String(h.p.handle));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(h);
      }

      // 组内选代表（逐字口径）：①matched==='id' 者优先 → ②真身（非镜像）优先 → ③tree_id 字典序 → handle 字典序
      const cmpRep = (a, b) => {
        const ai = a.matched === 'id' ? 0 : 1;
        const bi = b.matched === 'id' ? 0 : 1;
        if (ai !== bi) return ai - bi;
        const am = isMirrorNode(a.p) ? 1 : 0;
        const bm = isMirrorNode(b.p) ? 1 : 0;
        if (am !== bm) return am - bm;
        if (a.t.id !== b.t.id) return a.t.id < b.t.id ? -1 : 1;
        if (a.p.handle !== b.p.handle) return a.p.handle < b.p.handle ? -1 : 1;
        return 0;
      };

      const picked = [];
      for (const members of groups.values()) {
        const best = members.slice().sort(cmpRep)[0];
        // tier：0 = resolveNode 置顶命中，1 = 其余编号命中，2 = 姓名命中（同 tier 内稳定按 tree_id 字典序）
        const tier = best.matched === 'id' ? (best.pinned ? 0 : 1) : 2;
        // 组内**有**非镜像命中节点：该真身进候选集前已过节点级裁剪 → 对访问者必然可见 → 代表 = 该真身
        const realMembers = members.filter((m) => !isMirrorNode(m.p));
        if (realMembers.length > 0) {
          const realBest = realMembers.slice().sort(cmpRep)[0];
          picked.push({ t: realBest.t, p: realBest.p, matched: best.matched, restricted: false, tier });
          continue;
        }
        // 组内**全是**镜像命中节点：解析最终真身（可能在别树、甚至不在本次候选集里），
        // 再**直接判定真身对该访问者的可见性**（不用「组内有无真身」代理 → 假受限的根因即在此）
        const rel = await resolveRealBody(best.t, best.p);
        const real = rel && !isMirrorNode(rel.person) ? rel : null; // 解析不到 / 兵底是镜像 → 视为无真身
        const realTree = real ? treeRefOf(real.treeId) : null;
        const realVisible = realTree
          ? !(await ctxAccess(realTree.id, realTree.tree)).isHiddenPerson(real.person.handle)
          : false;
        if (realVisible) {
          // 真身可见 → 代表改为真身（字段全取真身），matched 保留原命中类型，restricted=false
          picked.push({ t: realTree, p: real.person, matched: best.matched, restricted: false, tier });
        } else {
          // 真身不可见 / 解析不到 → 代表保持镜像、restricted=true（只填镜像自身信息，绝不泄漏真身）
          picked.push({ t: best.t, p: best.p, matched: best.matched, restricted: true, tier });
        }
      }
      picked.sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        if (a.t.id !== b.t.id) return a.t.id < b.t.id ? -1 : 1;
        // 同 tier 同树 → 按该树 people 键序（显式 tie-break，不依赖遍历顺序）
        return (a.t.ord?.get(a.p.handle) ?? 0) - (b.t.ord?.get(b.p.handle) ?? 0);
      });

      return send(200, picked.slice(0, limit).map(({ t, p, matched, restricted }) => ({
        ...shape(t, p, matched),
        restricted,
      })));
    }

    // ================= 树编辑 =================
    if (!treeId) return send(400, { error: '缺少 X-Tree-Id' });
    const tree = await getTree(treeId);
    if (!tree) return send(404, { error: `树不存在: ${treeId}` });

    // POST /people/（新建）
    if (pathname === '/people' && method === 'POST') {
      await requireWriteUser(headers, treeId, pathname, null, true);
      const body = parseBody(event);
      const r = await tw.createPerson(treeId, body);
      return send(201, [{ handle: r.handle }]);
    }

    // PUT /people/<handle>（保存）— P1 闸门：成功一次 = 1 片竹片（含总谱，无豁免通道）
    const peMatch = pathname.match(/^\/people\/([^/]+)$/);
    if (peMatch && method === 'PUT') {
      const u = await requireWriteUser(headers, treeId, pathname, peMatch[1], false);
      const body = parseBody(event);
      // ② 只读预检（始祖 / 上层镜像 → 403，不扣费）；请求体无可修改字段 → 无效请求，不扣费
      const putTree = await getTree(treeId);
      await fa.assertFounderEditable(putTree, peMatch[1], MASTER_TREE_ID);
      if (!eco.hasPersonChanges(body)) {
        return send(400, { error: '请求体不包含可修改内容（姓名 / 性别 / 生卒 / 健在 / 称号）' });
      }
      // ②′ 值级比对：与现值逐字段规范化后**完全相同** → no-op 编辑（打开弹窗不改东西点保存）：
      //     不扣费、不写树（version / updated_at 不动）、不写详情、不产生任何 txs 流水，
      //     返回 200 + `unchanged:true` + `fee.pieces:0`（余额取当前实际值）。
      const putPerson = putTree?.people?.[peMatch[1]];
      if (putPerson) {
        const putDetail = await getDetail(treeId, peMatch[1]);
        if (eco.isPersonUnchanged(body, putPerson, putDetail)) {
          const q = await eco.quoteBamboo(u.phone, 0);
          return send(200, {
            ok: true,
            unchanged: true,
            fee: { unit: 'bamboos', pieces: 0, balance: q.current, balance_after: q.current },
          });
        }
      }
      let charged = null;
      let detailSaved = true;
      try {
        // ③④ 余额预检 + 扣费（整单拒绝 409 → 一字节不写）；⑤ 落库；⑥ 落库失败 → 冲正
        charged = await eco.chargeBamboo(u.phone, eco.FEE.person_update, {
          op: 'person_update',
          tree_id: treeId,
          person_handle: peMatch[1],
          person_name: putTree?.people?.[peMatch[1]]?.name || '',
        });
        const saved = await tw.updatePerson(treeId, peMatch[1], body, { masterTreeId: MASTER_TREE_ID });
        // 详情文档（称号/档案）在树落盘之后才写；写失败不回滚树、不退费，只回警示（见 lib/tree-write.js）
        detailSaved = saved?.detailSaved !== false;
      } catch (e) {
        const refunded = await refundQuietly(u.phone, charged, '保存落库失败，已原路返还');
        const payload = eco.errorPayload(e, refunded ? { fee_refunded: true } : {});
        return send(errorStatusOf(e, payload), payload);
      }
      const okBody = { ok: true, fee: eco.feeResponse(charged) };
      if (!detailSaved) okBody.detail_warning = '称号/档案信息未保存，请重试';
      return send(200, okBody);
    }

    // POST /families/（新建）
    if (pathname === '/families' && method === 'POST') {
      await requireWriteUser(headers, treeId, pathname, null, true);
      const body = parseBody(event);
      const targetHandle = body.father_handle || body.mother_handle || body.child_ref_list?.[0]?.ref || '';
      if (targetHandle) {
        await requireWriteUser(headers, treeId, pathname, targetHandle, true);
      }
      const r = await tw.createFamily(treeId, body, { masterTreeId: MASTER_TREE_ID });
      return send(201, [{ handle: r.handle }]);
    }

    // PUT /families/<handle>
    const famMatch = pathname.match(/^\/families\/([^/]+)$/);
    if (famMatch && method === 'PUT') {
      const fam = tree.families[famMatch[1]];
      if (!fam) return send(404, { error: 'family not found' });
      const scopeHandle = fam.father_handle || fam.mother_handle || fam.child_handles?.[0] || '';
      if (scopeHandle) await requireWriteUser(headers, treeId, pathname, scopeHandle, false);
      const body = parseBody(event);
      await tw.updateFamily(treeId, famMatch[1], body, { masterTreeId: MASTER_TREE_ID });
      return send(200, { ok: true });
    }

    // ================= 读接口（P1） =================
    // 节点级可见分层：guest/logged-in 裁剪树梢近代世（master/成员/特权 full）
    const readAccess = await resolveTreeAccess(headers, treeId, tree);

    // /events/<handle>
    const evMatch = pathname.match(/^\/events\/([^/]+)$/);
    if (evMatch && method === 'GET') {
      const index = await getEventIndex(treeId);
      const e = index.get(evMatch[1]);
      if (!e) return send(404, { error: 'event not found' });
      return send(200, { handle: e.handle, type: e.type, date: { text: e.date }, place: e.place, description: e.description });
    }

    // GET /people/<handle>
    if (peMatch && method === 'GET') {
      const person = tree.people[peMatch[1]];
      if (!person) return send(404, { error: 'person not found' });
      if (readAccess.isHiddenPerson(person.handle)) return send(404, { error: '该节点暂不可见（近代世谱系仅家族成员可见）' });
      const detail = await getDetail(treeId, person.handle);
      return send(200, toRawPerson(tree, person, detail));
    }

    // GET /people/
    if (pathname === '/people' && method === 'GET') {
      const details = await getAllDetails(treeId);
      const detailMap = new Map(details.map((d) => [d.handle, d]));
      const out = Object.values(tree.people)
        .filter((p) => !readAccess.isHiddenPerson(p.handle))
        .map((p) => toRawPerson(tree, p, detailMap.get(p.handle)));
      return send(200, out);
    }

    // GET /families/
    if (pathname === '/families' && method === 'GET') {
      const out = Object.values(tree.families)
        .filter((f) => !isHiddenFamily(readAccess, f))
        .map((f) => ({
          handle: f.handle,
          gramps_id: f.gramps_id || '',
          father_handle: f.father_handle || '',
          mother_handle: f.mother_handle || '',
          child_ref_list: (f.child_handles || []).map((c) => ({ ref: c })),
        }));
      return send(200, out);
    }

    // GET /search/
    if (pathname === '/search' && method === 'GET') {
      const q = (query.query || '').toLowerCase();
      if (!q) return send(200, []);
      const limit = parseInt(query.pagesize || '20', 10) || 20;
      const details = await getAllDetails(treeId);
      const detailMap = new Map(details.map((d) => [d.handle, d]));
      const matched = [];
      // 编号 / 句柄检索（docs/id-system.spec.md §5：搜索也是「选节点」入口）：
      // 全局编号（I000052 / 000052）/ handle / 树内旧号命中本树 → 置顶返回
      const refHit = await resolveNode(String(query.query || '').trim(), treeId);
      if (refHit && refHit.tree_id === treeId && tree.people[refHit.handle] && !readAccess.isHiddenPerson(refHit.handle)) {
        const p = tree.people[refHit.handle];
        matched.push({ handle: p.handle, object: toRawPerson(tree, p, detailMap.get(p.handle)) });
      }
      for (const p of Object.values(tree.people)) {
        if (readAccess.isHiddenPerson(p.handle)) continue;
        if (matched.some((m) => m.handle === p.handle)) continue;
        const hay = `${p.name}${p.surname}${p.given}`.toLowerCase();
        if (hay.includes(q)) {
          matched.push({ handle: p.handle, object: toRawPerson(tree, p, detailMap.get(p.handle)) });
          if (matched.length >= limit) break;
        }
      }
      return send(200, matched);
    }

    return send(404, { error: `未知路径: ${pathname}` });
  } catch (e) {
    return safeError(e, 500);
  }
}

// 云函数入口（CloudBase HTTP 访问服务）
export async function main(event) {
  return handleRequest(event || {});
}

export { handleRequest };
