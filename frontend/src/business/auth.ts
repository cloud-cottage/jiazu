/**
 * 认证状态管理（跨端：H5 localStorage / 小程序 storage）
 *
 * 认证体系: 手机号 + 短信验证码（无密码）
 * - 登录/注册由 auth-server 处理，签发 7 天 JWT
 * - 家谱数据经 auth-server 代理访问（前端不接触 Gramps 凭据）
 * - 新用户默认 guest 角色（只读），管理员审核后升级
 */

import { reactive } from 'vue';

const STORAGE_KEY = 'jiazu_auth';

export interface AuthState {
  loggedIn: boolean;
  phone: string;
  nickname: string;
  role: string;
  /** auth-server 签发的 JWT */
  token: string;
  /** token 过期时间戳 */
  expiresAt: number;
}

const state = reactive<AuthState>(load());

function load(): AuthState {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        loggedIn: !!parsed.loggedIn,
        phone: parsed.phone || '',
        nickname: parsed.nickname || '',
        role: parsed.role || 'guest',
        token: parsed.token || '',
        expiresAt: parsed.expiresAt || 0,
      };
    }
  } catch (e) {
    /* ignore */
  }
  return { loggedIn: false, phone: '', nickname: '', role: 'guest', token: '', expiresAt: 0 };
}

function persist(): void {
  try {
    uni.setStorageSync(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* ignore */
  }
}

/** 是否已登录且 token 未过期（提前 1 分钟视为过期） */
export function isAuthenticated(): boolean {
  return state.loggedIn && state.token.length > 0 && state.expiresAt > Date.now() + 60_000;
}

/** 登录/注册成功后调用 */
export function setAuth(auth: {
  phone: string;
  nickname: string;
  role: string;
  token: string;
  expiresAt: number;
}): void {
  state.loggedIn = true;
  state.phone = auth.phone;
  state.nickname = auth.nickname;
  state.role = auth.role;
  state.token = auth.token;
  state.expiresAt = auth.expiresAt;
  persist();
}

/** 退出登录 */
export function clearAuth(): void {
  state.loggedIn = false;
  state.phone = '';
  state.nickname = '';
  state.role = 'guest';
  state.token = '';
  state.expiresAt = 0;
  persist();
}

/** 获取当前登录 token（未登录返回空） */
export function getAuthToken(): string {
  return isAuthenticated() ? state.token : '';
}

export { state as authState };
