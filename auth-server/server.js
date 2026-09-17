/**
 * 家族历史数字馆 — 认证代理服务 (auth-server)
 *
 * 职责:
 * 1. 手机号 + 短信验证码登录/注册（开发阶段验证码打印到控制台）
 * 2. 签发自己的 JWT 登录态
 * 3. 反向代理 /api/* 到 Gramps-Web，注入访客/管理凭据
 *
 * 设计要点:
 * - 零 npm 依赖（Node >= 18 内置 http/crypto/fs）
 * - 用户/验证码存 JSON 文件（data/），生产可换 SQLite
 * - JWT 手写 HMAC-SHA256 签名（HS256）
 * - 短信服务商可插拔: console(开发) / tencent(生产)
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse as parseUrl } from 'node:url';
import { splitTree } from './split-tree.js';
import * as wallet from './wallet.js';
import * as scope from './scope.js';
import * as treeAccess from './tree-access.js';
import { isReadFilterEndpoint, filterReadBody } from './read-filter.js';
import { computeTreeDepth, rankFromDepth, MAX_DEPTH, RANKS } from './rank.js';

// ---- 配置 ----
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-only-secret-change-me';
const CODE_TTL = Number(process.env.CODE_TTL_SECONDS || 300);
const GRAMPS_BASE = process.env.GRAMPS_BASE_URL || 'http://localhost:8000';
const GRAMPS_GUEST = {
  username: process.env.GRAMPS_GUEST_USERNAME || 'guest',
  password: process.env.GRAMPS_GUEST_PASSWORD || 'GuestPass123!',
};
const GRAMPS_ADMIN = {
  username: process.env.GRAMPS_ADMIN_USERNAME || 'admin',
  password: process.env.GRAMPS_ADMIN_PASSWORD || 'AdminPass123!',
};
// 中华世本总谱编辑账号（role 4，绑定总谱 tree，仅 chief_editor 使用）
const GRAMPS_CHIEF = {
  username: process.env.GRAMPS_CHIEF_USERNAME || 'chief_editor',
  password: process.env.GRAMPS_CHIEF_PASSWORD || '',
};
const MASTER_TREE_ID = process.env.MASTER_TREE_ID || 'zhonghua';
const MASTER_TREE_UUID = process.env.MASTER_TREE_UUID || '';
const GRAMPS_OWNER = {
  username: process.env.GRAMPS_OWNER_USERNAME || 'owner',
  password: process.env.GRAMPS_OWNER_PASSWORD || 'OwnerPass123!',
};
// CLI 命令（空格分隔的 argv 数组），用于创建新 tree 的 owner 账号
const GRAMPS_CLI_CMD = (process.env.GRAMPS_CLI_CMD || '').trim();
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'console';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const CODES_FILE = path.join(DATA_DIR, 'codes.json');
const LEAVE_REQUESTS_FILE = path.join(DATA_DIR, 'leave-requests.json');
const JOIN_REQUESTS_FILE = path.join(DATA_DIR, 'join-requests.json');
// tree-meta.json 与 config/ 目录共享（git 管理）
const TREE_META_FILE = path.join(__dirname, '..', 'config', 'tree-meta.json');

// ---- 存储 ----
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function saveJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = loadJson(USERS_FILE, {});        // phone -> {phone, nickname, role, created_at}
let codes = loadJson(CODES_FILE, {});        // phone -> {code, expires_at, attempts}
let leaveRequests = loadJson(LEAVE_REQUESTS_FILE, {}); // id -> {phone, tree_id, reason, status, created_at, handled_at}
let joinRequests = loadJson(JOIN_REQUESTS_FILE, {}); // id -> 加入申请（一人一树；pending 单条/树）

function persistUsers() { saveJson(USERS_FILE, users); }
function persistCodes() { saveJson(CODES_FILE, codes); }
function persistLeaveRequests() { saveJson(LEAVE_REQUESTS_FILE, leaveRequests); }
function persistJoinRequests() { saveJson(JOIN_REQUESTS_FILE, joinRequests); }

// ---- JWT (HS256 手写) ----
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function signJwt(payload, expiresSec) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresSec };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}
function verifyJwt(token) {
  try {
    const [h, p, s] = token.split('.');
    const expect = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
    if (s !== expect) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---- 验证码 ----
function genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}
function sendSms(phone, code) {
  if (SMS_PROVIDER === 'tencent') {
    // TODO: 上线接入腾讯云 SMS（sdk 安装 + 模板调用）
    console.log(`[sms:tencent] 发送到 ${phone}: ${code}（尚未接入 SDK，请配置 SMS_* 环境变量）`);
    return;
  }
  // console provider（开发阶段）
  console.log('\n' + '='.repeat(60));
  console.log(`📱 [验证码] 手机号 ${phone}`);
  console.log(`   验证码: ${code}  （有效期 ${CODE_TTL / 60} 分钟）`);
  console.log('='.repeat(60) + '\n');
}
function requestCode(phone) {
  const code = genCode();
  codes[phone] = { code, expires_at: Date.now() + CODE_TTL * 1000, attempts: 0 };
  persistCodes();
  sendSms(phone, code);
  return { ok: true, message: '验证码已发送', dev_code: SMS_PROVIDER === 'console' ? code : undefined };
}
function verifyCode(phone, inputCode) {
  const entry = codes[phone];
  if (!entry) return { ok: false, message: '请先获取验证码' };
  if (Date.now() > entry.expires_at) {
    delete codes[phone];
    persistCodes();
    return { ok: false, message: '验证码已过期，请重新获取' };
  }
  entry.attempts = (entry.attempts || 0) + 1;
  if (entry.attempts > 5) {
    delete codes[phone];
    persistCodes();
    return { ok: false, message: '尝试次数过多，请重新获取验证码' };
  }
  if (entry.code !== inputCode) {
    persistCodes();
    return { ok: false, message: '验证码错误' };
  }
  delete codes[phone];
  persistCodes();
  return { ok: true };
}

// ---- 用户 ----
// 角色体系（权限由小到大）：guest(游客) < user < branch_curator < tree_steward < chief_editor
// guest: 未登录只读；user: 编辑自己节点及向下；branch_curator: 上下三代；
// tree_steward: 单棵树完整管理；chief_editor: 全局最高权限（= admin）
const ROLE_LEVEL = {
  guest: 0,
  user: 1,
  branch_curator: 2,
  tree_steward: 3,
  chief_editor: 4,
};

function findOrCreateUser(phone, nickname) {
  if (!users[phone]) {
    // 管理员手机号自动获得 chief_editor 角色（最高权限）
    const role = ADMIN_PHONE && phone === ADMIN_PHONE ? 'chief_editor' : 'user';
    users[phone] = {
      phone,
      nickname: nickname || `用户${phone.slice(-4)}`,
      role,
      created_at: new Date().toISOString(),
    };
    if (role === 'chief_editor') {
      console.log(`\n👑 总编辑账号就绪: ${phone} (ADMIN_PHONE → chief_editor)\n`);
    }
    persistUsers();
  } else if (nickname && nickname !== users[phone].nickname) {
    users[phone].nickname = nickname;
    persistUsers();
  }
  return users[phone];
}

// ---- 工具 ----
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); }
    });
  });
}
function json(res, status, obj) {
  // 双写保护：响应已发出（writeHead/end 已调）时不再尝试写头，避免 ERR_HTTP_HEADERS_SENT 崩溃
  if (res.headersSent) return;
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

// ---- Gramps-Web 反向代理（多 tree 凭据） ----

// tree_id -> { username, password }；含默认 guest（ji_23395_01）+ 拆分出的新树 owner
const treeCredentials = new Map();
function loadTreeCredentials() {
  // 1. 默认 guest（原树）
  treeCredentials.set('ji_23395_01', { ...GRAMPS_GUEST });
  // 2. 中华世本总谱（chief_editor 凭据）
  if (GRAMPS_CHIEF.password) {
    treeCredentials.set(MASTER_TREE_ID, { ...GRAMPS_CHIEF });
  }
  // 3. 拆分产生的新树 owner（data/gramps-owners.json）
  const ownersFile = path.join(DATA_DIR, 'gramps-owners.json');
  try {
    const owners = JSON.parse(fs.readFileSync(ownersFile, 'utf8'));
    for (const [treeId, info] of Object.entries(owners)) {
      if (info?.username && info?.password) {
        treeCredentials.set(treeId, { username: info.username, password: info.password });
      }
    }
  } catch {
    /* 文件不存在或未生成 */
  }
}
loadTreeCredentials();

// tree_id -> { token, exp }（模块级缓存，避免登录限流）
const treeTokenCache = new Map();

// tree_id -> families 缓存（用于节点范围校验）
const familiesCache = new Map();

async function getFamiliesForTree(treeId) {
  const cached = familiesCache.get(treeId);
  if (cached && cached.exp > Date.now()) return cached.data;
  const token = await getGrampsTokenFor(treeId);
  const res = await fetch(`${GRAMPS_BASE}/api/families/?profile=all`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`读取家族数据失败: ${res.status}`);
  const data = await res.json();
  const normalized = data.map((f) => ({
    handle: f.handle,
    father_handle: f.father_handle || '',
    mother_handle: f.mother_handle || '',
    child_handles: (f.child_ref_list || []).map((c) => c.ref),
  }));
  familiesCache.set(treeId, { data: normalized, exp: Date.now() + 5 * 60 * 1000 });
  return normalized;
}

async function getGrampsTokenFor(treeId, forWrite = false) {
  // 写请求：优先用该树的 owner 凭据（有写权限）
  // 读请求：guest（只读）
  let cred;
  if (forWrite) {
    // 总谱 → chief；拆分树 → gramps-owners.json 的 owner；原树 → GRAMPS_OWNER
    if (treeId === MASTER_TREE_ID && GRAMPS_CHIEF.password) {
      cred = { ...GRAMPS_CHIEF };
    } else {
      let ownerCred = null;
      try {
        const owners = JSON.parse(
          fs.readFileSync(path.join(DATA_DIR, 'gramps-owners.json'), 'utf8'),
        );
        if (owners[treeId]?.username && owners[treeId]?.password) {
          ownerCred = { username: owners[treeId].username, password: owners[treeId].password };
        }
      } catch { /* 文件不存在 */ }
      if (ownerCred) {
        cred = ownerCred;
      } else if (treeId === 'ji_23395_01' && GRAMPS_OWNER.password) {
        // 原树用 owner 凭据（role 4 有写权限）
        cred = { ...GRAMPS_OWNER };
      } else {
        cred = treeCredentials.get(treeId) || { ...GRAMPS_GUEST };
      }
    }
  } else {
    cred = treeCredentials.get(treeId) || { ...GRAMPS_GUEST };
  }

  // 懒加载：拆分产生的新树凭据写入文件后，无需重启即生效
  // 注意：loadTreeCredentials() 之后必须重新取 cred（此前可能已回落为 guest）
  if (!treeCredentials.get(treeId) && !forWrite) {
    loadTreeCredentials();
    cred = treeCredentials.get(treeId) || cred;
  }

  const cacheKey = `${treeId}${forWrite ? ':w' : ':r'}`;
  const cached = treeTokenCache.get(cacheKey);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  let res = await fetch(`${GRAMPS_BASE}/api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cred),
  });
  // 限流重试（1/second）
  for (let i = 0; i < 3 && res.status === 429; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    res = await fetch(`${GRAMPS_BASE}/api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cred),
    });
  }
  if (!res.ok) throw new Error(`Gramps 登录失败 (${cred.username}): ${res.status}`);
  const data = await res.json();
  treeTokenCache.set(cacheKey, { token: data.access_token, exp: Date.now() + 14 * 60 * 1000 });
  return data.access_token;
}

/** 从请求中提取 tree_id（header 优先，其次 URL tree_id 参数） */
function extractTreeId(req, query) {
  const fromHeader = req.headers['x-tree-id'];
  if (fromHeader) return fromHeader;
  try {
    const params = new URLSearchParams(query || '');
    if (params.get('tree_id')) return params.get('tree_id');
  } catch { /* ignore */ }
  return 'ji_23395_01'; // 默认原树
}

/**
 * 从写请求中提取目标 person handle
 * - PUT/DELETE /people/<handle>：URL 中的 handle
 * - POST /people/：body 中的 handle（新建，用 handle 校验，新节点视为用户自己）
 * - families 相关：校验 father/mother/child handle
 */
function extractTargetHandle(pathname, method, req) {
  // /api/people/<handle>（代理收到的 pathname 不含 /api 前缀）
  const peopleMatch = pathname.match(/^\/people\/([^/]+)\/?$/);
  if (peopleMatch) return peopleMatch[1];

  // POST /people/ 新建：body 里可能有 handle（编辑场景是 PUT）
  if (pathname === '/people/' || pathname === '/people') {
    if (req._body && req._body.handle) return req._body.handle;
    // 新建 person：无 handle，放行（后续由前端控制）
  }
  return null;
}

// 读取 body（用于校验，只读一次缓存到 req._body）
function readBodyOnce(req) {
  if (req._body !== undefined) return Promise.resolve(req._body);
  return readBody(req).then((b) => { req._body = b; return b; });
}

// ---- 读路径节点级可见分层（规格 docs/permission-tier.spec.md） ----

/** 从读请求解析（可选）登录态 → { phone, role } | null（无/坏 token = guest） */
function readAuthPayload(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = token ? verifyJwt(token) : null;
  if (!payload) return null;
  const user = users[payload.phone];
  return user ? { phone: user.phone, role: user.role } : null;
}

/**
 * 计算读路径可见性（guest 藏树梢 18 世 / 已登录未加入藏 9 世 / 浅树兜底 1 世）。
 * zhonghua（is_master）、chief_editor、本树成员（member）→ mode=full（不裁）。
 * 数据用 getFamiliesForTree 缓存；full 档不触碰 families。
 */
async function resolveReadAccess(req, treeId) {
  const isMaster = treeId === MASTER_TREE_ID;
  const u = readAuthPayload(req);
  const anchor = u ? scope.getAnchor(u.phone) : null;
  const member = !!(anchor && anchor.tree_id === treeId);
  const opts = {
    treeId,
    isMaster,
    role: u?.role || null,
    anchorTreeId: anchor?.tree_id || null,
    families: [],
  };
  if (isMaster || u?.role === 'chief_editor' || member) {
    return treeAccess.computeAccess(opts); // full 分支不依赖 families
  }
  opts.families = await getFamiliesForTree(treeId);
  return treeAccess.computeAccess(opts);
}

// GET 列表/详情读端点裁剪判定与响应过滤逻辑在 ./read-filter.js（纯函数，可单测）：
//   isReadFilterEndpoint(pathname) / filterReadBody(access, pathname, bodyText)

async function proxyToGramps(req, res, pathname, query) {
  try {
    const treeId = extractTreeId(req, query);
    const method = req.method;
    const isWrite = method === 'POST' || method === 'PUT' || method === 'DELETE' || method === 'PATCH';

    // 写请求用该树的有写权限凭据（owner/chief），读请求用 guest
    // 否则 Gramps-Web 上游拒绝 guest 写操作（403）
    const token = await getGrampsTokenFor(treeId, isWrite);
    if (isWrite) {
      const auth = req.headers.authorization || '';
      const authToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const payload = verifyJwt(authToken);
      if (!payload) {
        return json(res, 401, { error: '请先登录后再进行编辑操作' });
      }
      const user = users[payload.phone];
      if (!user) return json(res, 401, { error: '用户不存在' });

      const role = user.role;
      // guest 无编辑权
      if (role === 'guest') {
        console.log(`[写拦截] ${user.phone} (guest) 尝试编辑 ${treeId}${pathname} → 403`);
        return json(res, 403, { error: '游客无编辑权限，请注册后编辑' });
      }

      // chief_editor 可编辑总谱 + 所有树；tree_steward 管理单棵树
      const isMasterTree = treeId === MASTER_TREE_ID;
      if (isMasterTree && role !== 'chief_editor') {
        console.log(`[写拦截] ${user.phone} (${role}) 尝试编辑总谱 → 403`);
        return json(res, 403, { error: '中华世本总谱仅总编辑（chief_editor）可编辑' });
      }
      // 总谱只允许 chief_editor 写
      if (!isMasterTree) {
        // 普通角色（user/branch_curator）需要节点范围校验
        if (role === 'user' || role === 'branch_curator') {
          // 预读 body（PUT/POST 校验用）
          try { await readBodyOnce(req); } catch { /* ignore */ }
          // 解析目标 person handle（从 URL 或 body）
          const targetHandle = extractTargetHandle(pathname, method, req);
          if (targetHandle) {
            const familiesByTree = {};
            try {
              familiesByTree[treeId] = await getFamiliesForTree(treeId);
            } catch {
              /* 缓存读取失败则不限制（保守放行） */
            }
            const allowed = scope.canEditPerson(familiesByTree, user.phone, role, treeId, targetHandle);
            if (!allowed) {
              console.log(`[写拦截] ${user.phone} (${role}) 编辑 ${treeId}/${targetHandle} 超出范围 → 403`);
              return json(res, 403, {
                error: role === 'branch_curator'
                  ? '您的权限范围仅限本人上下三代节点'
                  : '您的权限范围仅限本人及向下节点',
              });
            }
          }
        }
        // tree_steward 无节点限制（整棵树可管理）
      }

      // ---- 世代深度上限（普通家族树 ≤72 世） ----
      // 新建 person/family 会加深树；超限树仅 chief_editor 可继续写（用于处理/总谱）
      if (!isMasterTree && role !== 'chief_editor') {
        const isAddNode =
          (method === 'POST' && (pathname.startsWith('/people') || pathname.startsWith('/families'))) ||
          (method === 'PUT' && (pathname.startsWith('/people') || pathname.startsWith('/families')));
        if (isAddNode) {
          try {
            const families = await getFamiliesForTree(treeId);
            const { totalGenerations } = computeTreeDepth(families);
            if (totalGenerations >= MAX_DEPTH) {
              console.log(`[写拦截] ${user.phone} (${role}) 向 ${treeId} 新增节点，深度 ${totalGenerations} 已达上限 ${MAX_DEPTH} → 403`);
              return json(res, 403, {
                error: `该家族树已达 ${MAX_DEPTH} 世深度上限（当前 ${totalGenerations} 世）。请管理员将部分节点并入中华世本总谱后继续。`,
              });
            }
          } catch {
            /* 深度计算失败不限制 */
          }
        }
      }
    }

    // 剥离 tree_id 参数（Gramps-Web 不认，会导致 422），仅用于选择凭据
    let upstreamQuery = query || '';
    try {
      const params = new URLSearchParams(upstreamQuery);
      params.delete('tree_id');
      upstreamQuery = params.toString();
    } catch { /* ignore */ }
    const target = `${GRAMPS_BASE}/api${pathname}${upstreamQuery ? `?${upstreamQuery}` : ''}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
    };
    // 已预读 body 则复用（避免重复消费流）
    let body = req._body !== undefined
      ? JSON.stringify(req._body)
      : (req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBodyRaw(req));
    // people 写请求剥离前端扩展字段（birth_date/death_date/is_living 走 compat 树 JSON 真源；
    // Gramps-Web 不认顶层扩展字段，转发会反序列化失败 → 仅透传 Gramps RawPerson 原生字段）
    if (isWrite && body && (pathname === '/people' || pathname === '/people/' || /^\/people\/[^/]+\/?$/.test(pathname))) {
      try {
        const obj = JSON.parse(body);
        if (obj && typeof obj === 'object') {
          delete obj.birth_date;
          delete obj.death_date;
          delete obj.is_living;
          body = JSON.stringify(obj);
        }
      } catch { /* 非 JSON body 不剥离 */ }
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    });
    const data = await upstream.arrayBuffer();

    // ---- 读路径节点级可见分层（docs/permission-tier.spec.md §5） ----
    // GET 列表/详情端点按档位裁剪树梢近代世；zhonghua/成员/特权 full 不裁。
    let outStatus = upstream.status;
    let outBody = Buffer.from(data); // arrayBuffer → Buffer（res.end 不接受 ArrayBuffer）
    const outHeaders = {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'X-Total-Count': upstream.headers.get('x-total-count') || '',
    };
    const contentType = upstream.headers.get('content-type') || '';
    if (
      !isWrite && method === 'GET' && outStatus === 200 &&
      contentType.includes('application/json') &&
      isReadFilterEndpoint(pathname)
    ) {
      try {
        const access = await resolveReadAccess(req, treeId);
        if (access.mode !== 'full') {
          const filtered = filterReadBody(access, pathname, Buffer.from(data).toString('utf8'));
          if (filtered) {
            outStatus = filtered.status;
            outBody = Buffer.from(filtered.body, 'utf8');
            delete outHeaders['X-Total-Count']; // 裁剪后计数不可信，交由前端以 body 为准
          }
        }
      } catch (e) {
        // 裁剪失败保守拒绝，避免向低档位泄漏近代世数据
        console.error(`[读裁剪] ${treeId}${pathname} 失败: ${e.message}`);
        return json(res, 502, { error: { code: 502, message: `可见性校验失败: ${e.message}` } });
      }
    }
    res.writeHead(outStatus, outHeaders);
    res.end(outBody);
  } catch (e) {
    json(res, 502, { error: { code: 502, message: `上游 Gramps-Web 不可用: ${e.message}` } });
  }
}
function readBodyRaw(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ---- tree-meta 读写（config/tree-meta.json，git 管理） ----

function readTreeMeta() {
  try {
    return JSON.parse(fs.readFileSync(TREE_META_FILE, 'utf8'));
  } catch {
    return { _schema: '1.0', trees: {} };
  }
}

function writeTreeMeta(meta) {
  fs.mkdirSync(path.dirname(TREE_META_FILE), { recursive: true });
  fs.writeFileSync(TREE_META_FILE, JSON.stringify(meta, null, 2) + '\n');
}

// ---- 路由 ----
const server = http.createServer(async (req, res) => {
  const { pathname, query } = parseUrl(req.url, true);
  const urlPath = pathname;

  // CORS（开发放开；生产收紧）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  try {
    // ---- 认证 API ----
    if (urlPath === '/api/auth/send-code' && req.method === 'POST') {
      const body = await readBody(req);
      const phone = String(body.phone || '').trim();
      if (!/^1\d{10}$/.test(phone)) return json(res, 400, { error: '手机号格式不正确' });
      // 防刷：同号码 60 秒内限一次
      const existing = codes[phone];
      if (existing && existing.expires_at > Date.now() - 60_000 + CODE_TTL * 1000 - 60_000) {
        // 已有未过期验证码则直接重发（不刷新）
        sendSms(phone, existing.code);
        return json(res, 200, { ok: true, message: '验证码已发送' });
      }
      return json(res, 200, requestCode(phone));
    }

    if (urlPath === '/api/auth/login' && req.method === 'POST') {
      const body = await readBody(req);
      const phone = String(body.phone || '').trim();
      const code = String(body.code || '').trim();
      if (!users[phone]) return json(res, 404, { error: '该手机号未注册，请先注册' });
      const v = verifyCode(phone, code);
      if (!v.ok) return json(res, 401, { error: v.message });
      const token = signJwt({ sub: phone, phone, role: users[phone].role }, 7 * 24 * 3600);
      return json(res, 200, { token, phone, nickname: users[phone].nickname, role: users[phone].role });
    }

    if (urlPath === '/api/auth/register' && req.method === 'POST') {
      const body = await readBody(req);
      const phone = String(body.phone || '').trim();
      const code = String(body.code || '').trim();
      const nickname = String(body.nickname || '').trim().slice(0, 30);
      if (!/^1\d{10}$/.test(phone)) return json(res, 400, { error: '手机号格式不正确' });
      if (users[phone]) return json(res, 409, { error: '该手机号已注册，请直接登录' });
      const v = verifyCode(phone, code);
      if (!v.ok) return json(res, 401, { error: v.message });
      const user = findOrCreateUser(phone, nickname || undefined);
      const token = signJwt({ sub: phone, phone, role: user.role }, 7 * 24 * 3600);
      return json(res, 201, { token, phone, nickname: user.nickname, role: user.role });
    }

    if (urlPath === '/api/auth/me' && req.method === 'GET') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const payload = verifyJwt(token);
      if (!payload) return json(res, 401, { error: '未登录或登录已过期' });
      const user = users[payload.phone];
      if (!user) return json(res, 404, { error: '用户不存在' });
      return json(res, 200, { phone: user.phone, nickname: user.nickname, role: user.role });
    }

    // ---- tree-meta 管理（公开读，管理员写） ----

    if (urlPath === '/api/tree-meta' && req.method === 'GET') {
      return json(res, 200, readTreeMeta());
    }

    // ---- 家族树等级（世代深度 → 家乘/族乘/宗乘/世乘） ----
    if (urlPath === '/api/tree/rank' && req.method === 'GET') {
      const treeId = extractTreeId(req, query);
      if (!treeId) return json(res, 400, { error: '缺少 tree_id' });
      try {
        // 显式世数：拉 people 收集 external_chain_gen
        let explicitGens = null;
        try {
          const token = await getGrampsTokenFor(treeId);
          const pr = await fetch(`${GRAMPS_BASE}/api/people/?profile=all&pagesize=2000`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (pr.ok) {
            const people = await pr.json();
            const gens = new Map();
            for (const p of people) {
              for (const a of p.attribute_list || []) {
                if (a.type === 'external_chain_gen' && a.value) {
                  gens.set(p.handle, parseInt(a.value, 10) || 0);
                }
              }
            }
            if (gens.size > 0) explicitGens = gens;
          }
        } catch { /* 显式世数可选，失败走 family 图 */ }
        const families = await getFamiliesForTree(treeId);
        const { totalGenerations, roots, personCount } = computeTreeDepth(families, explicitGens);
        const rank = rankFromDepth(totalGenerations);
        // 读路径节点级可见分层：access 元信息（docs/permission-tier.spec.md §6）
        const access = await resolveReadAccess(req, treeId);
        return json(res, 200, {
          tree_id: treeId,
          total_generations: totalGenerations,
          rank_key: rank.key,
          rank_label: rank.label,
          rank_en: rank.en,
          rank_desc: rank.desc,
          over_limit: totalGenerations > MAX_DEPTH,
          max_depth: MAX_DEPTH,
          root_count: roots.length,
          person_count: personCount,
          explicit: !!explicitGens,
          access: treeAccess.accessToPayload(access, totalGenerations),
        });
      } catch (e) {
        return json(res, 500, { error: `等级计算失败: ${e.message}` });
      }
    }

    if (urlPath === '/api/tree-meta' && req.method === 'PUT') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const payload = verifyJwt(token);
      if (!payload) return json(res, 401, { error: '未登录或登录已过期' });
      const user = users[payload.phone];
      if (!user || user.role !== 'chief_editor') {
        return json(res, 403, { error: '需要总编辑权限' });
      }
      const body = await readBody(req);
      const { tree_id, display_title, genealogy_name, archive_url, hall_name, origin, description } = body;
      if (!tree_id) return json(res, 400, { error: '缺少 tree_id' });

      const meta = readTreeMeta();
      const entry = Object.values(meta.trees).find(
        (t) => t.tree_id === tree_id,
      );
      if (!entry) return json(res, 404, { error: `未找到 tree: ${tree_id}` });

      if (display_title !== undefined) entry.display_title = display_title;
      if (genealogy_name !== undefined) entry.genealogy_name = genealogy_name;
      if (archive_url !== undefined) entry.archive_url = archive_url;
      if (hall_name !== undefined) entry.hall_name = hall_name;
      if (origin !== undefined) entry.origin = origin;
      if (description !== undefined) entry.description = description;
      writeTreeMeta(meta);
      return json(res, 200, { ok: true, entry });
    }

    // ---- 拆分家族树（admin）：「移除并新建家族树」 ----

    if (urlPath === '/api/admin/split-tree' && req.method === 'POST') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const payload = verifyJwt(token);
      if (!payload) return json(res, 401, { error: '未登录或登录已过期' });
      const user = users[payload.phone];
      if (!user || user.role !== 'chief_editor') {
        return json(res, 403, { error: '需要总编辑权限' });
      }
      const body = await readBody(req);
      const { tree_id, ancestor_handle, ancestor_name } = body;
      if (!tree_id || !ancestor_handle) {
        return json(res, 400, { error: '缺少 tree_id 或 ancestor_handle' });
      }

      try {
        const result = await splitTree({
          treeId: tree_id,
          ancestorHandle: ancestor_handle,
          ancestorName: ancestor_name || '',
          grampsBase: GRAMPS_BASE,
          adminUser: GRAMPS_ADMIN.username,
          adminPass: GRAMPS_ADMIN.password,
          ownerUser: GRAMPS_OWNER.username,
          ownerPass: GRAMPS_OWNER.password,
          initiatorPhone: user.phone,
          chiefUser: GRAMPS_CHIEF.username,
          chiefPass: GRAMPS_CHIEF.password,
          masterTreeId: MASTER_TREE_ID,
        });
        return json(res, 200, result);
      } catch (e) {
        console.error('[split-tree] 失败:', e.message);
        return json(res, 500, { error: `拆分失败: ${e.message}` });
      }
    }

    // ---- 钱包（余额 / 充值 / 转账 / 流水） ----

    // 鉴权辅助：从 header 提取当前用户
    function authUser(req) {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const payload = verifyJwt(token);
      if (!payload) return null;
      const user = users[payload.phone];
      return user ? { phone: user.phone, role: user.role } : null;
    }

    // 查询余额总览（需登录）
    if (urlPath === '/api/wallet/balance' && req.method === 'GET') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      return json(res, 200, wallet.getWalletOverview(u.phone));
    }

    // 充值（开发阶段模拟；预留真实支付接入点）
    if (urlPath === '/api/wallet/recharge' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const body = await readBody(req);
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return json(res, 400, { error: '请输入正确的充值金额' });
      const cents = Math.round(amount * 100);
      try {
        const balance = wallet.recharge(u.phone, cents);
        return json(res, 200, {
          ok: true,
          balance_yuan: (balance / 100).toFixed(2),
          // TODO: 上线接入微信支付后，此处返回支付参数，余额在支付回调后到账
          payment: 'mock',
        });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    // 转账到家族树（仅入账，不支持转出）
    if (urlPath === '/api/wallet/transfer' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const body = await readBody(req);
      const treeId = String(body.tree_id || '').trim();
      const amount = Number(body.amount);
      if (!treeId) return json(res, 400, { error: '缺少 tree_id' });
      if (!amount || amount <= 0) return json(res, 400, { error: '请输入正确的金额' });
      // 校验 tree 存在
      const meta = readTreeMeta();
      const treeExists = Object.values(meta.trees).some((t) => t.tree_id === treeId);
      if (!treeExists) return json(res, 404, { error: `家族树不存在: ${treeId}` });
      try {
        const result = wallet.transferToTree(u.phone, treeId, Math.round(amount * 100));
        return json(res, 200, {
          ok: true,
          user_balance_yuan: (result.user_balance / 100).toFixed(2),
          tree_balance_yuan: (result.tree_balance / 100).toFixed(2),
        });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    // 查询某家族树余额（公开）
    if (urlPath === '/api/wallet/tree-balance' && req.method === 'GET') {
      const treeId = new URL(req.url, 'http://x').searchParams.get('tree_id') || '';
      if (!treeId) return json(res, 400, { error: '缺少 tree_id' });
      return json(res, 200, {
        tree_id: treeId,
        balance_yuan: (wallet.getTreeBalance(treeId) / 100).toFixed(2),
      });
    }

    // 管理：设置新建家族树费用（仅 admin）
    if (urlPath === '/api/admin/wallet-fee' && req.method === 'PUT') {
      const u = authUser(req);
      if (!u || u.role !== 'chief_editor') return json(res, 403, { error: '需要总编辑权限' });
      const body = await readBody(req);
      const amount = Number(body.fee);
      if (!amount || amount <= 0) return json(res, 400, { error: '请输入正确的费用' });
      const cents = wallet.setTreeCreateFeeCents(Math.round(amount * 100));
      return json(res, 200, {
        ok: true,
        tree_create_fee_yuan: (cents / 100).toFixed(2),
      });
    }

    // ---- 角色管理（tree_steward 管理下属 / chief_editor 全局） ----

    // 角色升级：谁可以授予谁
    // chief_editor 可授予/撤销任意角色（除自己）
    // tree_steward 可授予 user / branch_curator（自己树内成员）
    if (urlPath === '/api/admin/set-role' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const body = await readBody(req);
      const targetPhone = String(body.phone || '').trim();
      const newRole = String(body.role || '').trim();
      if (!targetPhone || !ROLE_LEVEL[newRole]) {
        return json(res, 400, { error: '参数错误：phone + role 必填，role ∈ user/branch_curator/tree_steward/chief_editor' });
      }
      const target = users[targetPhone];
      if (!target) return json(res, 404, { error: `用户不存在: ${targetPhone}` });

      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      const targetLevel = ROLE_LEVEL[target.role] ?? 0;
      // 不能操作自己
      if (targetPhone === u.phone) return json(res, 400, { error: '不能修改自己的角色' });
      // 只能授予不高于自己级别的角色
      if (ROLE_LEVEL[newRole] >= myLevel) {
        return json(res, 403, { error: `无权授予 ${newRole}（需要高于该级别的权限）` });
      }
      // 不能修改级别不低于自己的用户
      if (targetLevel >= myLevel) {
        return json(res, 403, { error: '无权修改级别不低于自己的用户' });
      }
      // tree_steward 只能管理自己树内成员（简化：仅限 user/branch_curator 且目标当前是 guest/user）
      if (u.role === 'tree_steward' && !['guest', 'user'].includes(target.role)) {
        return json(res, 403, { error: '族谱主理人仅可管理普通用户与支系记录官' });
      }

      const oldRole = target.role;
      target.role = newRole;
      target.role_updated_at = new Date().toISOString();
      persistUsers();
      console.log(`[角色] ${u.phone}(${u.role}) 将 ${targetPhone} 从 ${oldRole} 升级为 ${newRole}`);
      return json(res, 200, { ok: true, phone: targetPhone, role: newRole, old_role: oldRole });
    }

    // 设置用户锚点（chief_editor / tree_steward 可操作）
    if (urlPath === '/api/admin/set-anchor' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      if (myLevel < ROLE_LEVEL.tree_steward) {
        return json(res, 403, { error: '需要族谱主理人或以上权限' });
      }
      const body = await readBody(req);
      const targetPhone = String(body.phone || '').trim();
      const treeId = String(body.tree_id || '').trim();
      const personHandle = String(body.person_handle || '').trim();
      if (!targetPhone || !treeId || !personHandle) {
        return json(res, 400, { error: '参数错误：phone + tree_id + person_handle 必填' });
      }
      if (!users[targetPhone]) return json(res, 404, { error: `用户不存在: ${targetPhone}` });
      // tree_steward 只能给同树用户设锚点（简化：不校验树归属）
      scope.setAnchor(targetPhone, treeId, personHandle);
      console.log(`[锚点] ${u.phone} 为 ${targetPhone} 设置锚点: ${treeId}/${personHandle}`);
      return json(res, 200, { ok: true });
    }

    // 查询用户锚点（本人可查自己；管理角色可查任意）
    if (urlPath === '/api/admin/get-anchor' && req.method === 'GET') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const targetPhone = new URL(req.url, 'http://x').searchParams.get('phone') || u.phone;
      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      if (targetPhone !== u.phone && myLevel < ROLE_LEVEL.tree_steward) {
        return json(res, 403, { error: '无权查看他人锚点' });
      }
      const anchor = scope.getAnchor(targetPhone);
      return json(res, 200, { phone: targetPhone, anchor });
    }

    // 用户列表（tree_steward 及以上可查）
    if (urlPath === '/api/admin/users' && req.method === 'GET') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      if (myLevel < ROLE_LEVEL.tree_steward) return json(res, 403, { error: '需要族谱主理人或以上权限' });
      const list = Object.values(users).map((usr) => ({
        phone: usr.phone,
        nickname: usr.nickname,
        role: usr.role,
        created_at: usr.created_at,
      }));
      return json(res, 200, list);
    }

    // ---- 加入家族（申请-审批制；docs/permission-tier.spec.md §9，自助认领已取消） ----

    // 用户申请加入家族树（一人一树；同树 pending 单条，拒绝后可重申）
    if (urlPath === '/api/join-request' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const body = await readBody(req);
      const treeId = String(body.tree_id || '').trim();
      const referenceHandle = String(body.reference_handle || '').trim();
      const selfName = String(body.self_name || '').trim().slice(0, 30);
      const note = String(body.note || '').trim().slice(0, 200);
      if (!treeId || !referenceHandle) {
        return json(res, 400, { error: '参数错误：tree_id + reference_handle 必填' });
      }
      if (!selfName && !note) {
        return json(res, 400, { error: '请填写您的姓名或补充说明（认领线索）' });
      }
      // 总谱不开放加入
      if (treeId === MASTER_TREE_ID) {
        return json(res, 403, { error: '中华世本总谱不可加入，仅可加入普通家族树' });
      }
      // 一人一树：已有锚点禁止再申请（改绑走解绑审批）
      const existing = scope.getAnchor(u.phone);
      if (existing) {
        return json(res, 400, { error: '您已绑定家族树，如需改绑请先申请解绑并等待审批' });
      }
      // 树存在性
      const meta = readTreeMeta();
      const treeExists = Object.values(meta.trees).some((t) => t.tree_id === treeId);
      if (!treeExists) return json(res, 404, { error: `家族树不存在: ${treeId}` });
      // 同树 pending 单条
      const pending = Object.values(joinRequests).some(
        (r) => r.phone === u.phone && r.tree_id === treeId && r.status === 'pending',
      );
      if (pending) {
        return json(res, 400, { error: '您已提交加入申请，请等待族谱主理人审核' });
      }
      // 节点存在性 + 可见性（禁止用隐藏近代层 handle 申报；参照 read 档位）
      try {
        const access = await resolveReadAccess(req, treeId);
        if (access.isHiddenPerson(referenceHandle)) {
          return json(res, 400, { error: '所选支系节点当前不可见，请在公开谱系中选择一个代表您支系的节点' });
        }
        const token = await getGrampsTokenFor(treeId, false);
        const personRes = await fetch(
          `${GRAMPS_BASE}/api/people/${encodeURIComponent(referenceHandle)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!personRes.ok) {
          return json(res, 400, { error: `该家族树中找不到此节点（${personRes.status}）` });
        }
        const person = await personRes.json();
        const pn = person.primary_name || {};
        const refName = ((pn.surname_list?.[0]?.surname || '') + (pn.first_name || '')) || referenceHandle;
        const id = `JR_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        joinRequests[id] = {
          phone: u.phone,
          tree_id: treeId,
          reference_handle: referenceHandle,
          reference_name: refName,
          self_name: selfName,
          note,
          status: 'pending',
          created_at: new Date().toISOString(),
        };
        persistJoinRequests();
        console.log(`[加入申请] ${u.phone} → ${treeId}（支系节点 ${refName}）`);
        return json(res, 201, { ok: true, id });
      } catch (e) {
        return json(res, 502, { error: `校验节点失败: ${e.message}` });
      }
    }

    // 加入申请列表（tree_steward 仅自己树，chief_editor 全部）
    if (urlPath === '/api/admin/join-requests' && req.method === 'GET') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) {
        return json(res, 403, { error: '需要族谱主理人或以上权限' });
      }
      const myTree = u.role === 'chief_editor' ? null : scope.getAnchor(u.phone)?.tree_id || null;
      // reference 节点世数（per 树算一次，families 5min 缓存）
      const depthByTree = new Map();
      const list = Object.entries(joinRequests)
        .filter(([, r]) => (myTree ? r.tree_id === myTree : true))
        .map(([id, r]) => ({ id, ...r }))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      for (const item of list) {
        if (item.reference_handle && item.tree_id) {
          if (!depthByTree.has(item.tree_id)) {
            try {
              const families = await getFamiliesForTree(item.tree_id);
              const { depth } = treeAccess.computePersonDepth(null, families);
              depthByTree.set(item.tree_id, depth);
            } catch {
              depthByTree.set(item.tree_id, null);
            }
          }
          const depth = depthByTree.get(item.tree_id);
          if (depth) item.reference_depth = depth.get(item.reference_handle) ?? null;
        }
      }
      return json(res, 200, list);
    }

    // 审批通过（绑定锚点 → 申请人成为 member）
    if (urlPath === '/api/admin/approve-join' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) {
        return json(res, 403, { error: '需要族谱主理人或以上权限' });
      }
      const body = await readBody(req);
      const id = String(body.id || '').trim();
      const personHandle = String(body.person_handle || '').trim();
      if (!id || !personHandle) {
        return json(res, 400, { error: '参数错误：id + person_handle 必填' });
      }
      const jr = joinRequests[id];
      if (!jr) return json(res, 404, { error: '申请不存在' });
      if (jr.status !== 'pending') return json(res, 400, { error: '该申请已处理' });
      // 审批隔离：tree_steward 仅能审批自己树的申请
      if (u.role !== 'chief_editor') {
        const myTree = scope.getAnchor(u.phone)?.tree_id;
        if (myTree && jr.tree_id !== myTree) {
          return json(res, 403, { error: '只能审批自己家族树的加入申请' });
        }
      }
      try {
        // 本人节点必须真实存在于该树
        const token = await getGrampsTokenFor(jr.tree_id, false);
        const personRes = await fetch(
          `${GRAMPS_BASE}/api/people/${encodeURIComponent(personHandle)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!personRes.ok) {
          return json(res, 400, { error: `该家族树中找不到此节点（${personRes.status}）` });
        }
        // 申请人可能已在此期间绑定其它树（重申竞态）
        const holder = scope.getAnchor(jr.phone);
        if (holder) {
          return json(res, 400, { error: '申请人已绑定家族树，无法重复绑定' });
        }
        scope.setAnchor(jr.phone, jr.tree_id, personHandle);
        jr.status = 'approved';
        jr.handled_by = u.phone;
        jr.handled_at = new Date().toISOString();
        persistJoinRequests();
        console.log(`[加入审批] ${u.phone} 通过 ${jr.phone} 加入 ${jr.tree_id}（本人节点 ${personHandle}）`);
        return json(res, 200, { ok: true, status: 'approved' });
      } catch (e) {
        return json(res, 502, { error: `校验节点失败: ${e.message}` });
      }
    }

    // 审批拒绝（申请人可重申）
    if (urlPath === '/api/admin/reject-join' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      if ((ROLE_LEVEL[u.role] ?? 0) < ROLE_LEVEL.tree_steward) {
        return json(res, 403, { error: '需要族谱主理人或以上权限' });
      }
      const body = await readBody(req);
      const id = String(body.id || '').trim();
      const jr = joinRequests[id];
      if (!jr) return json(res, 404, { error: '申请不存在' });
      if (jr.status !== 'pending') return json(res, 400, { error: '该申请已处理' });
      if (u.role !== 'chief_editor') {
        const myTree = scope.getAnchor(u.phone)?.tree_id;
        if (myTree && jr.tree_id !== myTree) {
          return json(res, 403, { error: '只能审批自己家族树的加入申请' });
        }
      }
      jr.status = 'rejected';
      jr.reject_reason = String(body.reason || '').slice(0, 200);
      jr.handled_by = u.phone;
      jr.handled_at = new Date().toISOString();
      persistJoinRequests();
      console.log(`[加入审批] ${u.phone} 拒绝 ${jr.phone} 加入 ${jr.tree_id}`);
      return json(res, 200, { ok: true, status: 'rejected' });
    }

    // ---- 解绑申请（一人一树终身制 → 改绑需 tree_steward 审批） ----

    if (urlPath === '/api/leave-request' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const body = await readBody(req);
      const anchor = scope.getAnchor(u.phone);
      if (!anchor) return json(res, 400, { error: '您尚未绑定家族树' });
      const pending = Object.values(leaveRequests).some(
        (r) => r.phone === u.phone && r.status === 'pending',
      );
      if (pending) return json(res, 400, { error: '已有待审批的解绑申请，请等待处理' });
      const id = `LR_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      leaveRequests[id] = {
        phone: u.phone,
        tree_id: anchor.tree_id,
        person_handle: anchor.person_handle,
        reason: String(body.reason || '').slice(0, 200),
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      persistLeaveRequests();
      console.log(`[解绑申请] ${u.phone} 申请离开 ${anchor.tree_id}`);
      return json(res, 200, { ok: true, id });
    }

    // 解绑申请列表（tree_steward 仅看自己树，chief_editor 看全部）
    if (urlPath === '/api/admin/leave-requests' && req.method === 'GET') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      if (myLevel < ROLE_LEVEL.tree_steward) return json(res, 403, { error: '需要族谱主理人或以上权限' });
      const myTree = u.role === 'chief_editor' ? null : scope.getAnchor(u.phone)?.tree_id || null;
      const list = Object.entries(leaveRequests)
        .filter(([, r]) => (myTree ? r.tree_id === myTree : true))
        .map(([id, r]) => ({
          id,
          phone: r.phone,
          nickname: users[r.phone]?.nickname || r.phone,
          tree_id: r.tree_id,
          person_handle: r.person_handle,
          reason: r.reason || '',
          status: r.status,
          created_at: r.created_at,
        }))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return json(res, 200, list);
    }

    // 解绑审批（通过 → 清除锚点，用户可改绑；拒绝 → 维持绑定）
    if (urlPath === '/api/admin/approve-leave' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      if (myLevel < ROLE_LEVEL.tree_steward) return json(res, 403, { error: '需要族谱主理人或以上权限' });
      const body = await readBody(req);
      const id = String(body.id || '').trim();
      const approve = body.approve !== false; // 默认通过
      const leaveReq = leaveRequests[id];
      if (!leaveReq) return json(res, 404, { error: '申请不存在' });
      if (leaveReq.status !== 'pending') return json(res, 400, { error: '该申请已处理' });
      // tree_steward 只能审批自己树的申请
      if (u.role !== 'chief_editor') {
        const myTree = scope.getAnchor(u.phone)?.tree_id;
        if (myTree && leaveReq.tree_id !== myTree) {
          return json(res, 403, { error: '只能审批自己家族树的解绑申请' });
        }
      }
      if (approve) {
        scope.clearAnchor(leaveReq.phone);
        leaveReq.status = 'approved';
      } else {
        leaveReq.status = 'rejected';
      }
      leaveReq.handled_by = u.phone;
      leaveReq.handled_at = new Date().toISOString();
      persistLeaveRequests();
      console.log(`[解绑审批] ${u.phone} ${approve ? '通过' : '拒绝'} ${leaveReq.phone} 的解绑申请`);
      return json(res, 200, { ok: true, status: leaveReq.status });
    }

    // ---- 删除分迁链接（管理员）：「彻底无连接」 ----
    // 校验占位节点 → 从父家族解除挂接 → 删除占位 person
    if (urlPath === '/api/admin/remove-branch-link' && req.method === 'POST') {
      const u = authUser(req);
      if (!u) return json(res, 401, { error: '未登录或登录已过期' });
      const myLevel = ROLE_LEVEL[u.role] ?? 0;
      if (myLevel < ROLE_LEVEL.tree_steward) return json(res, 403, { error: '需要族谱主理人或以上权限' });
      const body = await readBody(req);
      const treeId = String(body.tree_id || '').trim();
      const personHandle = String(body.person_handle || '').trim();
      if (!treeId || !personHandle) return json(res, 400, { error: '参数错误：tree_id + person_handle 必填' });
      // tree_steward 仅能操作自己树
      if (u.role !== 'chief_editor') {
        const myTree = scope.getAnchor(u.phone)?.tree_id;
        if (myTree && treeId !== myTree) return json(res, 403, { error: '只能操作自己家族树的链接' });
      }
      try {
        const token = await getGrampsTokenFor(treeId, true);
        const hdr = { Authorization: `Bearer ${token}` };
        // 1. 校验是分迁占位节点
        const personRes = await fetch(`${GRAMPS_BASE}/api/people/${encodeURIComponent(personHandle)}?profile=all`, { headers: hdr });
        if (!personRes.ok) return json(res, 404, { error: `找不到节点（${personRes.status}）` });
        const person = await personRes.json();
        const attrs = person.attribute_list || [];
        const isBranch = attrs.some((a) => a.type === 'external_link_type' && a.value === 'branch');
        if (!isBranch) return json(res, 400, { error: '该节点不是分迁占位节点，不可删除' });
        // 2. 从父家族解除挂接
        const parentFamHandle = (person.parent_family_list || [])[0];
        if (parentFamHandle) {
          const famRes = await fetch(`${GRAMPS_BASE}/api/families/${parentFamHandle}`, { headers: hdr });
          if (famRes.ok) {
            const fam = await famRes.json();
            fam.child_ref_list = (fam.child_ref_list || []).filter((c) => c.ref !== personHandle);
            await fetch(`${GRAMPS_BASE}/api/families/${parentFamHandle}`, {
              method: 'PUT',
              headers: { ...hdr, 'Content-Type': 'application/json' },
              body: JSON.stringify(fam),
            });
          }
        }
        // 3. 删除占位 person
        const delRes = await fetch(`${GRAMPS_BASE}/api/people/${encodeURIComponent(personHandle)}`, {
          method: 'DELETE',
          headers: hdr,
        });
        if (!delRes.ok && delRes.status !== 404) {
          return json(res, 500, { error: `删除占位节点失败: ${delRes.status}` });
        }
        console.log(`[删除分迁链接] ${u.phone} 删除 ${treeId}/${personHandle}，与原支系彻底断开`);
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 502, { error: `操作失败: ${e.message}` });
      }
    }

    // ---- 反向代理到 Gramps-Web ----
    if (urlPath.startsWith('/api/')) {
      return proxyToGramps(req, res, urlPath.slice('/api'.length), parseUrl(req.url).query || '');
    }

    json(res, 404, { error: 'Not Found' });
  } catch (e) {
    console.error('[auth-server] error:', e);
    json(res, 500, { error: { code: 500, message: e.message } });
  }
});

server.listen(PORT, () => {
  console.log(`\n✅ 认证代理服务已启动: http://localhost:${PORT}`);
  console.log(`   短信模式: ${SMS_PROVIDER}（console=控制台打印验证码）`);
  console.log(`   上游 Gramps-Web: ${GRAMPS_BASE}\n`);
});
