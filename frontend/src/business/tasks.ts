/**
 * 任务中心域（`docs/task-center.spec.md`；批3 前端）—— **纯逻辑 + 接口封装的唯一落点**。
 *
 * 口径（Zang 技术裁定，逐条）：
 * - **状态文案一律取后端下发**（`state_text` / `blocked_reason` / 回执 `message`）：本模块**不自编**任何
 *   状态名与成功 / 失败文案，只做透传与「字段缺失时给占位符」（`stateTextOf`）。
 * - **奖励数量前端不写死**（spec §6-3）：品类数量一律从出参（`reward.base` / `reward.pool` /
 *   `pool_per_friend` / `denominator`）读；**品类名**单点 = `business/asset-text.ts` 的
 *   `assetNameOf()`（未知字段**原样显示字段名**，绝不新造中文名）。
 * - **失败绝不静默**：所有非 2xx 一律抛 `TaskApiError`（`message` = 后端中文原文，`code` / `status` 原样），
 *   页面负责把 `taskErrorText()` 显示出来；`401` 不降级、`409 TASK_ALREADY_CLAIMED` 由页面
 *   **映射为「已领取」态**（spec §5-2 第 3 条 —— 不是错误弹窗、也不是无反应）。
 * - **跨端逻辑全在本模块**（H5 与小程序同一份）：失败分类、奖励回执行拼装、行囊摘要行。
 *
 * 接口（`cloudfunctions/compat-api/index.js` 现证；成功 `{ok:true,message,data}` / 失败
 * `{ok:false,error:{code,status,message,reason?}}`）：
 *   `GET  /tasks/today`        当日三任务三态 + 奖励口径（只读、零写入）
 *   `POST /tasks/claim {task}` 手动领取（**唯一发奖入口**）；`task ∈ signin / invite / write`
 */
import { API_BASE } from './api';
import { getAuthToken } from './auth';
import { assetNameOf, BAMBOO_PIECES_NAME, BAMBOO_PIECES_UNIT, SEED_FRAGMENT_NAME, SEED_FRAGMENT_UNIT } from './asset-text';

const str = (v: unknown): string => String(v ?? '').trim();
const num0 = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** 任务中心请求错误（形状同 `business/friends.ts` 的 `FriendApiError`：`message` = 后端中文原文） */
export class TaskApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = '', status = 0) {
    super(message);
    this.name = 'TaskApiError';
    this.code = code;
    this.status = status;
  }
}

/** 未登录文案（后端 401 的 message 与其一致） */
export const TASK_NEED_LOGIN = '未登录或登录已过期';

/** 三态枚举（与后端 `lib/task-center.js` 的 `TASK_STATE` 逐字一致；**只用于分支，不用于显示**） */
export type TaskState = 'not_achieved' | 'claimable' | 'claimed';

/** 三条每日任务的枚举名（`POST /tasks/claim` 的 `task` 取值，逐字） */
export type TaskId = 'signin' | 'invite' | 'write';

/** 单条任务的三态投影（= `GET /tasks/today` 的 `data.tasks[]` 元素，字段逐字对齐后端） */
export interface TaskView {
  task: string;
  title: string;
  /** 后端下发的规则说明（**原样展示**，前端不自编） */
  rule: string;
  /** 北京时间自然日 `YYYY-MM-DD` */
  day: string;
  achieved: boolean;
  claimed: boolean;
  claimed_day: string;
  claimable: boolean;
  state: string;
  /** 后端下发的状态中文文案（`未达标` / `可领取` / `已领取`） */
  state_text: string;
  /** 后端下发的未达标 / 不可领原因（中文；空串 = 无） */
  blocked_reason: string;
}

/** 奖励口径（`data.reward`；数量**全部来自后端**，前端不写死） */
export interface TaskRewardSpec {
  base: Record<string, number>;
  pool: Record<string, number>;
}

/** `GET /tasks/today` 的 `data` */
export interface TasksToday {
  day: string;
  tasks: TaskView[];
  reward: TaskRewardSpec;
}

/** 领取回执的池读数（`data.reward`；分母 / 均分 / 余数均为后端读数） */
export interface ClaimRewardView {
  base: Record<string, number>;
  pooled: boolean;
  denominator: number;
  pool_per_friend: Record<string, number>;
  remainder: Record<string, number>;
}

/** 领取回执的行囊读数（`data.detail`；用于「领取后重新拉取行囊摘要」之外的即时反馈） */
export interface ClaimBagView {
  fragments: number;
  fragments_before: number;
  scroll_fragments: number;
  bamboos_total_pieces: number;
}

/** `POST /tasks/claim` 的 `data` */
export interface TaskClaimResult {
  task: string;
  title: string;
  day: string;
  state: string;
  state_text: string;
  claimed_at: string;
  achieved: boolean;
  signin_date: string;
  reward: ClaimRewardView;
  detail: ClaimBagView;
  /** 领取后的当日三态（可直接覆盖本地列表，避免二次请求的中间态） */
  tasks: TaskView[];
}

/** 领取出参（含后端 `message` 回执 —— 成功文案一律透传，不自编） */
export interface ClaimEnvelope {
  message: string;
  result: TaskClaimResult;
}

// ==================== 请求封装（唯一出口） ====================

interface TaskEnvelope {
  message: string;
  data: Record<string, unknown>;
}

async function taskRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<TaskEnvelope> {
  const token = getAuthToken();
  if (!token) throw new TaskApiError(TASK_NEED_LOGIN, 'TASK_UNAUTHORIZED', 401);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        message?: string;
        data?: Record<string, unknown>;
        error?: { code?: string; message?: string; status?: number };
      }
    | null;
  if (!payload || payload.ok !== true) {
    const err = payload?.error || {};
    throw new TaskApiError(
      err.message || `请求失败 (${res.status})`,
      err.code || '',
      Number(err.status) || res.status,
    );
  }
  return { message: str(payload.message), data: payload.data || {} };
}

/** 数量映射归一（只保留正数；后端未下发 / 非数 → 空表 ⇒ 不渲染该行，绝不猜数量） */
function toCountMap(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
    const q = num0(n);
    if (q > 0) out[k] = q;
  }
  return out;
}

/** 三态投影归一（字段逐字取后端；缺字段按「不达标」的**空读数**处理，不编状态名） */
function toTaskView(v: unknown): TaskView {
  const raw = (v || {}) as Record<string, unknown>;
  return {
    task: str(raw.task),
    title: str(raw.title),
    rule: str(raw.rule),
    day: str(raw.day),
    achieved: raw.achieved === true,
    claimed: raw.claimed === true,
    claimed_day: str(raw.claimed_day),
    claimable: raw.claimable === true,
    state: str(raw.state),
    state_text: str(raw.state_text),
    blocked_reason: str(raw.blocked_reason),
  };
}

/** 当日三任务三态 + 奖励口径（只读；失败抛 `TaskApiError`） */
export async function fetchTasksToday(): Promise<TasksToday> {
  const { data } = await taskRequest('/tasks/today', 'GET');
  const reward = (data.reward || {}) as { base?: unknown; pool?: unknown };
  return {
    day: str(data.day),
    tasks: Array.isArray(data.tasks) ? data.tasks.map(toTaskView) : [],
    reward: { base: toCountMap(reward.base), pool: toCountMap(reward.pool) },
  };
}

/** 手动领取（`POST /tasks/claim`；失败抛 `TaskApiError`，`code` 原样供页面分类） */
export async function postTaskClaim(task: string): Promise<ClaimEnvelope> {
  const { message, data } = await taskRequest('/tasks/claim', 'POST', { task });
  const reward = (data.reward || {}) as Record<string, unknown>;
  const detail = (data.detail || {}) as Record<string, unknown>;
  return {
    message,
    result: {
      task: str(data.task),
      title: str(data.title),
      day: str(data.day),
      state: str(data.state),
      state_text: str(data.state_text),
      claimed_at: str(data.claimed_at),
      achieved: data.achieved === true,
      signin_date: str(data.signin_date),
      reward: {
        base: toCountMap(reward.base),
        pooled: reward.pooled === true,
        denominator: num0(reward.denominator),
        pool_per_friend: toCountMap(reward.pool_per_friend),
        remainder: toCountMap(reward.remainder),
      },
      detail: {
        fragments: num0(detail.fragments),
        fragments_before: num0(detail.fragments_before),
        scroll_fragments: num0(detail.scroll_fragments),
        bamboos_total_pieces: num0(detail.bamboos_total_pieces),
      },
      tasks: Array.isArray(data.tasks) ? data.tasks.map(toTaskView) : [],
    },
  };
}

// ==================== 纯逻辑：显示（文案一律透传后端） ====================

/** 后端未下发 `state_text` 时的占位（**不自编状态名**） */
export const TASK_NO_STATE_TEXT = '—';

/** 行内状态文案 = 后端 `state_text`（未下发 → 占位符） */
export function stateTextOf(t: TaskView): string {
  return str(t.state_text) || TASK_NO_STATE_TEXT;
}

/** 该行是否可点【领取】：仅「可领取」态高亮；其余态**仍可点**（spec §5-2：点了给明确提示，不得无反应） */
export function isHighlighted(t: TaskView): boolean {
  return t.claimable === true;
}

/** 失败文案提取（后端 `error.message` 原样；无则退回兜底串 —— 绝不静默） */
export function taskErrorText(e: unknown, fallback = '领取失败，请重试'): string {
  const msg = (e as { message?: string })?.message;
  return msg && String(msg).trim() ? String(msg) : fallback;
}

/** 是否需要引导登录（后端 401） */
export function isTaskUnauthorized(e: unknown): boolean {
  return e instanceof TaskApiError && (e.status === 401 || e.code === 'TASK_UNAUTHORIZED');
}

/** 409「同日已领」⇒ 页面必须映射为「已领取」态（spec §5-2 第 3 条） */
export function isAlreadyClaimed(e: unknown): boolean {
  return e instanceof TaskApiError && e.code === 'TASK_ALREADY_CLAIMED';
}

/** 奖励条目行（品类名 = `asset-text.ts` 单点；数量来自后端出参） */
export function rewardItemLine(map: Record<string, number> | undefined): string {
  const entries = Object.entries(map || {}).filter(([, n]) => num0(n) > 0);
  if (!entries.length) return '';
  return entries.map(([k, n]) => `${assetNameOf(k)} ${num0(n)}`).join(' · ');
}

/**
 * 领取回执行（成功反馈的**行内可见文本**；toast 之外的留痕，便于用户回看）：
 * ① 后端 `message` 回执原文；② 本人基础奖励；③ 好友奖励池（分母 / 均分均取后端读数）。
 */
export function claimReceiptLines(message: string, result: TaskClaimResult): string[] {
  const lines: string[] = [];
  if (str(message)) lines.push(str(message));
  const base = rewardItemLine(result.reward.base);
  if (base) lines.push(`本人基础奖励：${base}`);
  if (result.reward.pooled) {
    const per = rewardItemLine(result.reward.pool_per_friend);
    lines.push(
      `好友奖励池：按领取时刻生效中好友 ${result.reward.denominator} 人均分${per ? `，每位好友得 ${per}` : ''}`,
    );
  } else {
    lines.push(`好友奖励池：本次未分发（领取时刻生效中好友 ${result.reward.denominator} 人）`);
  }
  return lines;
}

/**
 * 行囊摘要行（领取成功后按 spec §5-1 #4 重新读 `GET /assets/summary`；只展示**后端读数**）。
 * 品类名 / 单位单点 = `business/asset-text.ts`。
 */
export function bagSummaryLine(v: { fragments: number; bamboos_total_pieces: number }): string {
  return `行囊：${SEED_FRAGMENT_NAME} ${num0(v.fragments)} ${SEED_FRAGMENT_UNIT} · ${BAMBOO_PIECES_NAME} ${num0(v.bamboos_total_pieces)} ${BAMBOO_PIECES_UNIT}`;
}
