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

function persistUsers() { saveJson(USERS_FILE, users); }
function persistCodes() { saveJson(CODES_FILE, codes); }

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
function findOrCreateUser(phone, nickname) {
  if (!users[phone]) {
    // 管理员手机号自动获得 admin 角色
    const role = ADMIN_PHONE && phone === ADMIN_PHONE ? 'admin' : 'guest';
    users[phone] = {
      phone,
      nickname: nickname || `用户${phone.slice(-4)}`,
      role,
      created_at: new Date().toISOString(),
    };
    if (role === 'admin') {
      console.log(`\n👑 管理员账号就绪: ${phone} (ADMIN_PHONE)\n`);
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
  // 2. 拆分产生的新树 owner（data/gramps-owners.json）
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

async function getGrampsTokenFor(treeId) {
  const cred = treeCredentials.get(treeId);
  if (!cred) throw new Error(`未配置 tree ${treeId} 的访客凭据`);
  const cached = treeTokenCache.get(treeId);
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
  treeTokenCache.set(treeId, { token: data.access_token, exp: Date.now() + 14 * 60 * 1000 });
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

async function proxyToGramps(req, res, pathname, query) {
  try {
    const treeId = extractTreeId(req, query);
    const token = await getGrampsTokenFor(treeId);
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
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBodyRaw(req);
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
    });
    const data = await upstream.arrayBuffer();
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'X-Total-Count': upstream.headers.get('x-total-count') || '',
    });
    res.end(Buffer.from(data));
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

    if (urlPath === '/api/tree-meta' && req.method === 'PUT') {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const payload = verifyJwt(token);
      if (!payload) return json(res, 401, { error: '未登录或登录已过期' });
      const user = users[payload.phone];
      if (!user || user.role !== 'admin') {
        return json(res, 403, { error: '需要管理员权限' });
      }
      const body = await readBody(req);
      const { tree_id, display_title, hall_name, origin, description } = body;
      if (!tree_id) return json(res, 400, { error: '缺少 tree_id' });

      const meta = readTreeMeta();
      const entry = Object.values(meta.trees).find(
        (t) => t.tree_id === tree_id,
      );
      if (!entry) return json(res, 404, { error: `未找到 tree: ${tree_id}` });

      if (display_title !== undefined) entry.display_title = display_title;
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
      if (!user || user.role !== 'admin') {
        return json(res, 403, { error: '需要管理员权限' });
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
        });
        return json(res, 200, result);
      } catch (e) {
        console.error('[split-tree] 失败:', e.message);
        return json(res, 500, { error: `拆分失败: ${e.message}` });
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
