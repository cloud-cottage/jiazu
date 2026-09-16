/**
 * 认证模块：JWT 签发/验证、短信验证码、用户账户（集合 jiazu_users / jiazu_sms_codes）
 * 行为与 auth-server/server.js 保持一致（默认 secret 相同，本地 token 互通）。
 */
import crypto from 'node:crypto';
import { colGet, colSet, colDelete } from './store.js';

const JWT_SECRET = process.env.AUTH_JWT_SECRET || 'dev-only-secret-change-me';
const CODE_TTL = Number(process.env.CODE_TTL_SECONDS || 300);
const SMS_PROVIDER = process.env.SMS_PROVIDER || 'console';
const ADMIN_PHONE = process.env.ADMIN_PHONE || '';

export const ROLE_LEVEL = {
  guest: 0,
  user: 1,
  branch_curator: 2,
  tree_steward: 3,
  chief_editor: 4,
};

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

export function signJwt(payload, expiresSec) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + expiresSec };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}

export function verifyJwt(token) {
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

/** 从 Authorization header 提取并校验用户；无效返回 null */
export async function authUser(headers) {
  const auth = Object.entries(headers || {}).find(
    ([k]) => k.toLowerCase() === 'authorization',
  )?.[1] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const payload = verifyJwt(token);
  if (!payload) return null;
  const user = await colGet('jiazu_users', payload.phone);
  return user ? { phone: user.phone, role: user.role } : null;
}

// ---- 验证码 ----

function genCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function sendSms(phone, code) {
  if (SMS_PROVIDER === 'tencent') {
    console.log(`[sms:tencent] 发送到 ${phone}: ${code}（尚未接入 SDK）`);
    return;
  }
  console.log(`\n📱 [验证码] 手机号 ${phone} → ${code}（有效期 ${CODE_TTL / 60} 分钟）\n`);
}

export async function requestCode(phone) {
  const code = genCode();
  await colSet('jiazu_sms_codes', phone, {
    code,
    expires_at: Date.now() + CODE_TTL * 1000,
    attempts: 0,
  });
  sendSms(phone, code);
  return { ok: true, message: '验证码已发送', dev_code: SMS_PROVIDER === 'console' ? code : undefined };
}

export async function verifyCode(phone, inputCode) {
  const entry = await colGet('jiazu_sms_codes', phone);
  if (!entry) return { ok: false, message: '请先获取验证码' };
  if (Date.now() > entry.expires_at) {
    await colDelete('jiazu_sms_codes', phone);
    return { ok: false, message: '验证码已过期，请重新获取' };
  }
  entry.attempts = (entry.attempts || 0) + 1;
  if (entry.attempts > 5) {
    await colDelete('jiazu_sms_codes', phone);
    return { ok: false, message: '尝试次数过多，请重新获取验证码' };
  }
  if (entry.code !== inputCode) {
    await colSet('jiazu_sms_codes', phone, entry);
    return { ok: false, message: '验证码错误' };
  }
  await colDelete('jiazu_sms_codes', phone);
  return { ok: true };
}

// ---- 用户 ----

export async function findOrCreateUser(phone, nickname) {
  let user = await colGet('jiazu_users', phone);
  if (!user) {
    const role = ADMIN_PHONE && phone === ADMIN_PHONE ? 'chief_editor' : 'user';
    user = {
      phone,
      nickname: nickname || `用户${phone.slice(-4)}`,
      role,
      created_at: new Date().toISOString(),
    };
    await colSet('jiazu_users', phone, user);
  } else if (nickname && nickname !== user.nickname) {
    user.nickname = nickname;
    await colSet('jiazu_users', phone, user);
  }
  return user;
}
