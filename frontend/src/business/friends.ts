/**
 * 好友域（`docs/friend-domain.spec.md`；批2-E 前端）—— **纯逻辑 + 接口封装的唯一落点**。
 *
 * 口径（Zang 技术裁定）：
 * - **`relation_token` 是不透明句柄**（`'fr_' + sha256(关系文档 _id) 前 16 hex`）：前端**只透传**，
 *   不解析、不拼造、不缓存映射、不依赖其任何内部结构；出参**没有**任何明文手机号字段
 *   （后端已脱敏：`friend.phone_masked`），故本模块也**不提供**任何「拼明文」的入口。
 * - 列表**三态分组**（后端 `listRelations` 缺省已排除 dissolved ⇒ 只会有这三种）：
 *   待邀请（`pending`）/ 生效中（`active`）/ 到期缓冲期（`grace`）。
 * - **跨端逻辑全部在本模块**（H5 与小程序同一份），页面只做渲染与事件转发：
 *   分组、状态文案、到期 / 续约窗口判据、每行该出现哪些按钮与禁用原因、失败文案提取。
 * - 行囊兰帖**锁定态**判据 = 本人发起且仍在等待对方确认的续约申请（`pending.kind === 'renew'`
 *   且 `pending.locked.by_me`）⇒ 由 GET /friends 出参推导，**不为展示新增后端字段**。
 */
import { API_BASE } from './api';
import { getAuthToken } from './auth';
import { SCROLL_LOCK_TEXT } from './asset-text';
import type { ScrollLot } from './types';

// ==================== 出参形状（逐字对齐 cloudfunctions/compat-api 实测字段） ====================

/** 关系状态（后端 `RELATION_STATUS`；`listRelations` 缺省不返 dissolved） */
export type FriendStatus = 'pending' | 'active' | 'grace';

/** `pending.locked` 隐私投影（**无明文手机号**，只有「谁锁的」相对本人） */
export interface FriendLockView {
  /** 锁定的成品兰帖张数 */
  pieces: number;
  at: string;
  /** 本次锁定是否由本人发起 */
  by_me: boolean;
}

/** `pending` 隐私投影（**无明文手机号**） */
export interface FriendPendingView {
  /** `renew` = 续约申请（其余取值由后端定义，前端只透传） */
  kind: string;
  requested_at: string;
  expires_at: string;
  /** 申请是否由本人发起（false ⇒ 等本人确认 / 处理） */
  initiated_by_me: boolean;
  locked?: FriendLockView;
}

/** 对端展示信息（后端已脱敏：没有明文手机号字段） */
export interface FriendPeer {
  nickname: string;
  phone_masked: string;
  /** 有昵称 ⇒ 昵称；无昵称 ⇒ 脱敏串（后端定的口径） */
  display_name: string;
}

/** 一条好友关系（`GET /friends` 的 `friends[]` 元素） */
export interface FriendRelation {
  relation_token: string;
  status: FriendStatus | string;
  active: boolean;
  created_at: string;
  expires_at: string;
  /** 缓冲期截止时刻（仅 grace 有值） */
  grace_until: string;
  /** 累计奖励有效期（后端以「次」计，1 次 = 30 天） */
  reward_months: number;
  /** 已成功续约次数 */
  renewals: number;
  /** 续约窗口开启时刻（**仅 active 非空**；空串 = 未开窗） */
  window_open_at: string;
  /** 距到期天数（后端算；expires_at 为空 ⇒ null） */
  days_left: number | null;
  pending: FriendPendingView | null;
  friend: FriendPeer;
}

/** `GET /friends` 的 `data` */
export interface FriendsPayload {
  friends: FriendReply[];
  count: number;
}

/** 列表元素别名（页面模板里更短） */
export type FriendReply = FriendRelation;

/** 好友域请求失败（形状 = `{ok:false, error:{code,status,message}}` + HTTP 码） */
export class FriendApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = '', status = 0) {
    super(message);
    this.name = 'FriendApiError';
    this.code = code;
    this.status = status;
  }
}

/** 未登录文案（后端 401 的 message 与其一致） */
export const FRIEND_NEED_LOGIN = '未登录或登录已过期';

const DAY_MS = 86400000;

// ==================== 请求封装（唯一出口） ====================

interface FriendEnvelope {
  /** 后端 `message`（成功回执 = 「已完成」三态里的完成态文案） */
  message: string;
  /** 后端 `data`（出参业务字段） */
  data: Record<string, unknown>;
}

/**
 * 好友域请求：Bearer 必填（后端 401 不降级 guest）；失败按 `error.message` 原样上抛
 * （前端**只如实展示后端文案**，不自造提示、不吞错误）。
 */
async function friendRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<FriendEnvelope> {
  const token = getAuthToken();
  if (!token) throw new FriendApiError(FRIEND_NEED_LOGIN, 'FRIEND_UNAUTHORIZED', 401);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => null)) as
    | { ok?: boolean; message?: string; data?: Record<string, unknown>; error?: { code?: string; message?: string; status?: number } }
    | null;
  if (!payload || payload.ok !== true) {
    const err = payload?.error || {};
    throw new FriendApiError(
      err.message || `请求失败 (${res.status})`,
      err.code || '',
      Number(err.status) || res.status,
    );
  }
  return { message: payload.message || '操作成功', data: payload.data || {} };
}

/** `GET /friends` → 好友列表（后端先 sweep 再 list） */
export async function fetchFriends(): Promise<FriendsPayload> {
  const { data } = await friendRequest('/friends', 'GET');
  const friends = Array.isArray(data.friends) ? (data.friends as FriendRelation[]) : [];
  return { friends, count: typeof data.count === 'number' ? data.count : friends.length };
}

/** `POST /friends/invite` {to} → 邀请（`to` 是**唯一**需要明文手机号的入参） */
export async function sendFriendInvite(to: string): Promise<FriendEnvelope> {
  return friendRequest('/friends/invite', 'POST', { to });
}

/** 按 relation_token 操作的路由表（入参字段名逐字 = `relation_token`） */
const FRIEND_ACTION_PATH: Record<FriendActionKey, string> = {
  accept: '/friends/accept',
  reject: '/friends/reject',
  cancel_invite: '/friends/cancel',
  renew_request: '/friends/renew/request',
  renew_confirm: '/friends/renew/confirm',
  renew_cancel: '/friends/renew/cancel',
  dissolve: '/friends/dissolve',
};

/** 执行一条关系操作（`relation_token` 原样透传，不解析） */
export async function runFriendAction(key: FriendActionKey, relationToken: string): Promise<FriendEnvelope> {
  const path = FRIEND_ACTION_PATH[key];
  if (!path) throw new FriendApiError('未知的好友操作', 'FRIEND_ACTION_UNKNOWN', 0);
  return friendRequest(path, 'POST', { relation_token: relationToken });
}

// ==================== 纯逻辑：分组 / 文案 / 按钮三态 ====================

/** 三态分组标题（逐字；顺序即为页面渲染顺序） */
export const FRIEND_GROUPS: { key: FriendStatus; title: string }[] = [
  { key: 'pending', title: '待邀请' },
  { key: 'active', title: '生效中' },
  { key: 'grace', title: '到期缓冲期' },
];

export interface FriendGroup {
  key: FriendStatus;
  title: string;
  items: FriendRelation[];
}

/** 按三态分组（未知状态不臆造分组：既不显示也不丢错误 —— 直接归入 `active` 之外的落空桶并被忽略） */
export function groupFriends(friends: FriendRelation[]): FriendGroup[] {
  return FRIEND_GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    items: friends.filter((f) => f.status === g.key),
  }));
}

/** `YYYY-MM-DD`（本地时区）；空值 / 非法值 → `—` */
export function friendDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** 状态文案（三态逐字） */
export function friendStatusText(r: FriendRelation): string {
  if (r.status === 'pending') return '待接受邀请';
  if (r.status === 'active') return r.active ? '生效中' : '已失效';
  if (r.status === 'grace') return '已到期 · 缓冲期内';
  return '状态未知';
}

/** 到期 / 有效期文案（三态各有形态） */
export function friendExpiryLine(r: FriendRelation): string {
  if (r.status === 'pending') return `邀请有效至 ${friendDate(r.pending?.expires_at || r.expires_at)}`;
  if (r.status === 'active') {
    const left = typeof r.days_left === 'number' ? `（剩余 ${Math.max(0, r.days_left)} 天）` : '';
    return r.expires_at ? `有效期至 ${friendDate(r.expires_at)}${left}` : '有效期未定';
  }
  if (r.status === 'grace') {
    const left = r.grace_until ? `（缓冲期至 ${friendDate(r.grace_until)}）` : '';
    return `${friendDate(r.expires_at)} 已到期${left}`;
  }
  return '—';
}

/** 已续约次数 + 累计奖励有效期（后端 1 次续约 = 奖励 30 天；只用出参推导，不写死常量） */
export function friendRewardLine(r: FriendRelation): string {
  const months = Math.max(0, r.reward_months || 0);
  const days = renewalRewardDaysPerTime(r) * months;
  return `已续约 ${Math.max(0, r.renewals || 0)} 次 · 累计奖励有效期 ${days} 天`;
}

/**
 * 单次续约的奖励天数——由出参反推（`expires_at = created_at + 365 + 30 × reward_months` 天），
 * 避免在前端另写一份后端常量（口径漂移时前端文案跟着后端走）。
 */
export function renewalRewardDaysPerTime(r: FriendRelation): number {
  const months = Math.max(0, r.reward_months || 0);
  if (months <= 0) return 0;
  const base = Date.parse(r.created_at);
  const exp = Date.parse(r.expires_at);
  if (Number.isNaN(base) || Number.isNaN(exp)) return 0;
  const per = Math.round((exp - base) / DAY_MS / months - 365);
  return per > 0 ? per : 0;
}

/** 续约窗口天数（= 到期时刻 − 窗口开启时刻，由出参反推；缺值 ⇒ 0） */
export function renewWindowDays(r: FriendRelation): number {
  const open = Date.parse(r.window_open_at);
  const exp = Date.parse(r.expires_at);
  if (Number.isNaN(open) || Number.isNaN(exp)) return 0;
  return Math.max(0, Math.round((exp - open) / DAY_MS));
}

/** 续约窗口是否开启（**只有 active 才可能有窗口**；后端非 active 时 `window_open_at` 恒空串） */
export function renewWindowOpen(r: FriendRelation, nowMs: number): boolean {
  if (r.status !== 'active' || !r.window_open_at) return false;
  const open = Date.parse(r.window_open_at);
  return !Number.isNaN(open) && nowMs >= open;
}

/** 未开窗的原因文案（**禁用时必须给出**，不得静默无反应） */
export function renewDisabledReason(r: FriendRelation, nowMs: number): string {
  if (r.status === 'grace') return '关系已过有效期，缓冲期内不可续约';
  if (r.status === 'pending') return '邀请尚未接受，不可续约';
  if (!r.window_open_at) return '暂无续约窗口';
  const open = Date.parse(r.window_open_at);
  if (Number.isNaN(open)) return '暂无续约窗口';
  const days = Math.max(0, Math.ceil((open - nowMs) / DAY_MS));
  return `距可续约窗口还有 ${days} 天（到期前 ${renewWindowDays(r)} 天内才可发起续约）`;
}

/** 行内按钮标识（每个标识对应唯一一条后端路由） */
export type FriendActionKey =
  | 'accept'
  | 'reject'
  | 'cancel_invite'
  | 'renew_request'
  | 'renew_confirm'
  | 'renew_cancel'
  | 'dissolve';

/** 一个按钮的三态：`disabled` = 未达标（附 `reason` 文案）/ 否则可操作；完成后由回执文案承担 |
 */
export interface FriendAction {
  key: FriendActionKey;
  label: string;
  /** 主操作（页面渲染为实心按钮） */
  primary: boolean;
  disabled: boolean;
  /** 未达标原因（空串 = 无） */
  reason: string;
}

/**
 * 某一行在当前时刻该出现哪些按钮（三态由 `disabled` + `reason` 承载；**已完成**由操作回执承担）。
 * 权限口径逐条对齐后端守卫：
 * - 邀请：发起方「取消邀请」；被邀请方「接受 / 拒绝」；
 * - 续约：仅 **active** 且**窗口已开**才可「发起续约」；已有申请时 —— 发起方「撤回续约申请」、
 *   对方「确认续约 / 拒绝续约」（后端 `RENEW_SELF_CONFIRM`：发起方不能自确认）；
 * - 解除：**生效中（active）与到期缓冲期（grace）都给出【解除好友】**（后端 `dissolve` 只拒终态
 *   `dissolved`；active 期可解除，且会把 `pending` 锁定一并清掉）；**待邀请态仍用【取消邀请】**（不得混）。
 *   解除是破坏性操作 ⇒ 页面必须二次确认（文案 = 本模块 `DISSOLVE_CONFIRM_*`；自绘确认层，**不得用 `uni.showModal`**）。
 */
export function rowActions(r: FriendRelation, nowMs: number): FriendAction[] {
  const acts: FriendAction[] = [];
  if (r.status === 'pending') {
    if (r.pending?.initiated_by_me) {
      acts.push({ key: 'cancel_invite', label: '取消邀请', primary: false, disabled: false, reason: '' });
    } else {
      acts.push({ key: 'accept', label: '接受', primary: true, disabled: false, reason: '' });
      acts.push({ key: 'reject', label: '拒绝', primary: false, disabled: false, reason: '' });
    }
    return acts;
  }
  if (r.status === 'active') {
    if (r.pending && r.pending.kind === 'renew') {
      if (r.pending.initiated_by_me) {
        acts.push({ key: 'renew_cancel', label: '撤回续约申请', primary: false, disabled: false, reason: '' });
      } else {
        acts.push({ key: 'renew_confirm', label: '确认续约', primary: true, disabled: false, reason: '' });
        acts.push({ key: 'renew_cancel', label: '拒绝续约', primary: false, disabled: false, reason: '' });
      }
      acts.push(dissolveAction());
      return acts;
    }
    const open = renewWindowOpen(r, nowMs);
    acts.push({
      key: 'renew_request',
      label: '发起续约',
      primary: true,
      disabled: !open,
      reason: open ? '' : renewDisabledReason(r, nowMs),
    });
    acts.push(dissolveAction());
    return acts;
  }
  if (r.status === 'grace') {
    acts.push({
      key: 'renew_request',
      label: '发起续约',
      primary: true,
      disabled: true,
      reason: renewDisabledReason(r, nowMs),
    });
    acts.push(dissolveAction());
    return acts;
  }
  return acts;
}

/**
 * 【解除好友】按钮 —— **生效中（active）与到期缓冲期（grace）一律给出**（需求原文：任何时候单方主动
 * 解除好友，关系直接终止、不返还已消耗的兰帖、历史奖励保留不追回）。恒可点（无未达标态），
 * **破坏性语义由页面的二次确认层承担**（文案见 `DISSOLVE_CONFIRM_*`）。
 */
function dissolveAction(): FriendAction {
  return { key: 'dissolve', label: '解除好友', primary: false, disabled: false, reason: '' };
}

/** 行内「等待对方确认」提示（**仅对方发起时**给本人看；本人发起时该看的锁定态在行囊里） */
export function pendingWaitLine(r: FriendRelation): string {
  const p = r.pending;
  if (!p) return '';
  if (p.kind === 'renew') {
    return p.initiated_by_me
      ? `续约申请待对方确认（${friendDate(p.expires_at)} 前有效）`
      : `对方发起续约申请，待你确认（${friendDate(p.expires_at)} 前有效）`;
  }
  return p.initiated_by_me ? '邀请待对方接受' : '邀请待你处理';
}

/** 失败文案提取（后端 `error.message` 原样；无则退回兜底串 —— 绝不静默） */
export function friendErrorText(e: unknown, fallback = '操作失败，请重试'): string {
  const msg = (e as { message?: string })?.message;
  return msg && String(msg).trim() ? String(msg) : fallback;
}

/** 是否需要引导登录（后端 401） */
export function isFriendUnauthorized(e: unknown): boolean {
  return e instanceof FriendApiError && (e.status === 401 || e.code === 'FRIEND_UNAUTHORIZED');
}

// ==================== 纯逻辑：行囊兰帖锁定态（必做 5） ====================

/** 行囊锁定视图（组件只认这个 prop；文案单点 = `asset-text.ts`） */
export interface ScrollLockView {
  /** 被锁定的成品兰帖张数（多关系同时锁定时求和） */
  pieces: number;
  text: string;
}

/**
 * 从 `GET /friends` 出参推导**本人兰帖**的锁定态：
 * 只认「本人发起、等待对方确认」的续约申请（`pending.locked.by_me`）—— 对方发起的申请锁的是
 * **对方**那张兰帖，与本人行囊无关。无此类申请 ⇒ `null`（不显示锁定态）。
 */
export function scrollLockOf(friends: FriendRelation[]): ScrollLockView | null {
  let pieces = 0;
  let hit = false;
  friends.forEach((r) => {
    const p = r.pending;
    if (p && p.kind === 'renew' && p.locked && p.locked.by_me) {
      hit = true;
      pieces += Math.max(0, p.locked.pieces || 0);
    }
  });
  if (!hit) return null;
  return { pieces, text: SCROLL_LOCK_TEXT };
}

// ==================== 纯逻辑：解除好友二次确认文案（逐字 · 单点） ====================

/**
 * 解除好友二次确认（**页面自绘确认层**渲染；**严禁 `uni.showModal`** —— `.uni-modal` 的 z-index 999
 * 低于页面既有遮罩 `.som-mask` 1000 / 行囊属性提示层 1010，会被压住而不可见、不可点）。
 * 文案必须写明后果（需求原文）：**立即终止 / 不返还已消耗的兰帖 / 历史奖励保留不追回**。
 */
export const DISSOLVE_CONFIRM_TITLE = '⚠️ 解除好友确认';

/** 解除好友确认正文（逐行渲染，不合并、不改标点） */
export const DISSOLVE_CONFIRM_LINES: string[] = [
  '解除后该好友关系立即终止，双方不再互为好友。',
  '已消耗的兰帖不返还（续约时双方各自消耗的兰帖不予退还）。',
  '历史奖励保留、不追回。',
  '是否确认解除好友？',
];

/** 确认按钮文案（取消 / 确认解除） */
export const DISSOLVE_CONFIRM_OK_TEXT = '确认解除';

// ==================== 请求：兰帖【分解】（`POST /assets/scroll/decompose`） ====================

/**
 * `POST /assets/scroll/decompose` 出参（= 账本 `decomposeScroll` 的投影，`{count}` 入参）。
 *
 * ⚠️ **本路由与好友域同注册段**：`cloudfunctions/compat-api/index.js` 的前缀判据逐字含
 * `pathname === '/assets/scroll/decompose'`，未登录同回 **401 `FRIEND_UNAUTHORIZED`** ⇒ 复用本模块的
 * `friendRequest`（同一出参壳 `{ok,message,data}` / 同一 `error.message` 提取口径），**不另起一套请求封装**。
 * `count` 的单位 = **成品（整）兰帖张数**（1 张 = 100 片 —— §14-13 ② 张数口径，**不是格数**）；
 * 片数不足 ⇒ 后端 **409 整单拒绝**（一片不扣、不返还、无流水）。
 */
export interface ScrollDecomposeResult {
  /** 实际分解的成品兰帖张数 */
  decomposed: number;
  /** 扣减的兰帖片数（= `decomposed × 100`） */
  pieces: number;
  /** 返还的兰帖残页片数（= `decomposed × 99`，每张留 1 片损耗） */
  refunded: number;
  /** 分解后的兰帖残页片数（照收、不拒绝、不截断；满 100 片须由用户在行囊残页格点【合成】**手动**合成 1 张） */
  scroll_fragments: number;
  /** 本次返还触发的合成张数（= 后端返回的 `synthesized`）——自动合成已取消 ⇒ 该键**恒 `0`**，仅作兼容保留项 */
  synthesized: number;
  /** 被扣减的兰帖批次（FIFO 明细；本模块只透传，不做展示拼装） */
  taken: Array<{ id: string; qty: number; expires_at: string }>;
}

/** 兰帖【分解】：分解 `count` 张成品兰帖（1 张 = 100 片；不足 ⇒ 409，不改一处状态） */
export async function postDecomposeScroll(count: number): Promise<ScrollDecomposeResult> {
  const { data } = await friendRequest('/assets/scroll/decompose', 'POST', { count });
  return data as unknown as ScrollDecomposeResult;
}

// ==================== 请求：兰帖残页【手动合成】（`POST /assets/scroll/synthesize`） ====================

/**
 * `POST /assets/scroll/synthesize` 出参（= 账本 `synthesizeScroll` 的投影，`{count?}` 入参、**缺省 1**）。
 *
 * ⚠️ **本路由与好友域同注册段**（`cloudfunctions/compat-api/index.js` 的前缀判据逐字含
 * `pathname === '/assets/scroll/synthesize'`；与相邻 `/assets/scroll/decompose` 同一段、同一出参壳）
 * ⇒ **沿用本模块 `friendRequest`**（未登录同回 401 `FRIEND_UNAUTHORIZED`；失败按 `error.message`
 * 原文上抛），**不另起一套请求封装**。
 * ⚠️ 落点说明（本单）：本函数**命名与语义对偶 `postDecomposeScroll`**，故与它同落在本模块
 * （`business/api.ts` 的 `assetPostJson` 按 `err.error` 取**字符串**文案，遇上本段的
 * `error:{code,status,message}` **对象**会退化成 `[object Object]` ⇒ 那条路不适用于本路由）。
 * 由 `business/index.ts` 对外转出（供行囊组件引用）。
 *
 * `count` 的单位 = **成品兰帖张数**（1 张 = 100 片残页；一次恰好消耗 `count × 100` 片、余数保留）；
 * 残页不足 ⇒ 后端 **409 整单拒绝**（一字节不写：标量 / 批次 / 流水全不动）；**免费**（不扣竹片）。
 */
export interface ScrollSynthesizeResult {
  /** 本次合成的成品兰帖张数（= 请求的 `count`） */
  synthesized: number;
  /** 本次消耗的兰帖残页片数（= `synthesized × 100`） */
  pieces: number;
  /** 合成后的兰帖残页总量（余数保留） */
  scroll_fragments: number;
  /** 新入账的兰帖批次（每张一个新批次，`expires_at` 恒 `null` = 永久） */
  scroll_lots: ScrollLot[];
}

/**
 * 兰帖残页【手动合成】：消耗 `count × 100` 片残页，合成 `count` 张成品兰帖（不足 ⇒ 409，零写入）。
 * 入口 = 行囊残页格属性提示层【合成】按钮（一次 1 张），**唯一合成入口**（自动合成已取消）。
 */
export async function synthesizeScrollRemote(count: number): Promise<ScrollSynthesizeResult> {
  const { data } = await friendRequest('/assets/scroll/synthesize', 'POST', { count });
  return data as unknown as ScrollSynthesizeResult;
}
