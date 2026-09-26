/**
 * 任务中心域（批3 · 后端）—— 三条每日任务 + 手动领取（T-4）+ 奖励池接线 + 三态可见（T-3）。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 分工（单写者：本单；**不自造第二套账本 / 不新增 Tx.type 枚举**）：
 *   · 资产读写**唯一**走 `lib/economy-ledger.js` 的 `withAssets` / `getAssets`；
 *     本模块**不出现资产集合名字面**（`jiazu_assets` 只在 ledger 内）；
 *   · **奖励池分发唯一入口 = `lib/friend-ops.js` 的 `distributeFriendRewards`**
 *     （本人基础 + 池均分、向下取整余数销毁、分母 0 不建池、触发者不入池、收件人不再触发 —— 全部由它实现，
 *     本模块**不另写一套**，只按 R-5 给出 `amounts`）；
 *   · 当日邀请计数**唯一口径 = `lib/invite.js` 的 `countInviteRewardsToday`**
 *     （`Tx.type === 'reward'` 且 `ref.kind === 'invite'` 且流水日在当日）；
 *   · 日切**唯一口径 = `lib/economy-ledger.js` 的 `beijingDate`**（北京时间 UTC+8 自然日 `YYYY-MM-DD`），
 *     与既有 `signin_date` / 邀请计数完全同口径。**不注册定时任务、不依赖零点整**（源码无任何定时器）。
 *
 * 三条每日任务（**枚举名逐字**，即 `/tasks/claim` 入参 `task` 的取值）：
 *   `signin` —— 每日签到
 *   `invite` —— 邀请新用户注册
 *   `write`  —— 平台写操作
 *
 * 达标判定（逐条，全部为**纯函数**，只读传入的 `user` 记录）：
 *   `signin`：`user.signin_date === beijingDate(now)`（**当日已签到**）。
 *   `invite`：`countInviteRewardsToday(user, now) > 0`（**当日有成功邀请** = 当日发过邀请奖励流水）。
 *   `write` ：当日有一条**成功写**流水 —— `Tx.type ∈ WRITE_TX_TYPES`（`edit_fee` / `delete_fee` /
 *             `move_fee` / `tree_create`）且 `beijingDate(tx.ts) === 当日`。
 *             口径依据（noop-edit-integrity）：**失败 / 被拒 / no-op 写均不产生流水**
 *             （no-op 保存 ⇒ 0 片 + 无流水；资产不足 409 ⇒ 一字节不写）⇒ 以「当日成功计费写流水」为
 *             唯一可观测判据，天然不把失败与 no-op 计入。
 *
 * 每日重置：**北京自然日日期串比对**（`beijingDate`），无定时任务、无零点依赖。
 *
 * 手动领取（T-4）：**只有调 `claimTask`（`POST /tasks/claim`）才发奖**；达标本身不发任何资产。
 *   奖励池快照 = **领取时刻**的生效中好友数（由 `distributeFriendRewards` 在领取时点读取）。
 *
 * 奖励口径（R-5，`DAILY_TASK_REWARD` 逐字）：
 *   本人基础 = 石榴籽碎片 1 + 竹片 1（`base`）；池 = 石榴籽碎片 1 + 兰帖残页 1（`pool`）——
 *   池按生效中好友数均分、**向下取整、余数销毁**；分母 0 ⇒ 不建池零流水；触发者本人**不入池**；
 *   好友所得**不再触发**分发（以上四条均由 `distributeFriendRewards` 实现）。
 *
 * 幂等（Zang 裁定）：
 *   ① 同一自然日 **(用户, 任务)** 只可领一次；
 *   ② ⚠️ **签到任务与既有签到卡（`POST /assets/signin`）共用同一 `signin_date` 判定** ——
 *      签到任务的「已领取」标记**就是** `signin_date`（**不为 signin 另建标记**，避免第二套真源）；
 *      任何一方先领，另一方即视为已领，**绝不双发**；既有签到卡已改为**调用本模块同一入口**
 *      （`claimTask(phone, 'signin', now)`，见 index.js），**不再有第二套数值**；
 *   ③ `invite` / `write` 的领取标记 = 资产记录内的 `task_claims[任务名] = 当日日期串`
 *      （既有资产文档内新增的一个**取值映射字段**，不新增集合、不新增 Tx.type）。
 *      该字段仅在本模块内读；ledger 的 `summarize()` / `blankUser()` 不投影它 ⇒ 既有读接口出参一字不变。
 *
 * 三态可见（T-3）：`not_achieved`（未达标）/ `claimable`（可领取）/ `claimed`（已领取），
 *   每条任务同时给出 `state`（英文枚举）+ `state_text`（中文）+ `achieved`（达标判定原始读数）
 *   + `blocked_reason`（未达标 / 不可领时的**中文文案**，绝不静默失败）。
 *
 * ⚠️ **签到的「未达标」态说明（如实登记，见 REPORT）**：既有签到卡的口径是「签到即领奖」，
 *   而本单硬要求签到任务与签到卡共用 `signin_date` 判定 ⇒ 对 `signin` 而言
 *   「达标（已签到）」与「已领取」是**同一事件的两个名字**：调用签到卡或 `/tasks/claim {task:'signin'}`
 *   都是「完成签到 + 领奖」。因此 `signin` 的可见态只有 `claimable`（当日未签到）/ `claimed`（当日已签到），
 *   `not_achieved` 对签到**不可达**（签到不需要任何外部事件，当事人自己即可完成）。
 *   `invite` / `write` 两条任务三态齐备（未达标 = 当日尚无成功邀请 / 尚无成功写）。
 *
 * 领取执行序列（**现口径**）—— ⓪ **只读预检**（`getAssets` 快照 + 门禁判定）⇒ 未达标 / 已领取立刻结构化拒绝、零写入；
 *   ① **池分发**（唯一入口 = `friend-ops.distributeFriendRewards`，`base: null`）带**幂等键 `手机号:自然日:任务`**
 *      （`idempotency_key`，逐字形状见 `claimTask` 内的拼装）⇒ 中途失败重试时**收件人按账本自证判重跳过入账**
 *      （不重复发、不重复写流水）；
 *   ② **「打标 + 基础奖励入账」= 同一次 `withAssets` 事务**（锁内入口 `friend-ops.grantRewardBase`）
 *      **原子提交 / 原子回滚** ⇒ 不存在「基础已入账但未打标」，重试也绝不会二次入账基础奖励。
 * 为何**不**把池写入塞进触发者事务（死锁理由）：池写的是**他人**资产（各自 `withAssets`），
 *   塞进触发者的锁内会造成 **A↔B 互锁死锁**（互相等对方的锁）⇒ 池分发必须在触发者事务之外，重复性只由幂等键兜底。
 * 历史（**已废弃**）：旧实现「先打标 → 发奖 → 失败撤标重试」在「基础已入账、池分发中途失败」窗口内重试会**重复入账一次**基础奖励（碎片 1 + 竹片 1）⇒ **已废弃**（`rollbackClaim` 已随删除）。
 *
 * 数据安全：单测把 `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 /tmp 副本（照 assets.test.js / friends.test.js）。
 */

import { beijingDate, getAssets, recordTx, toNonNegInt, withAssets } from './economy-ledger.js';
import { countInviteRewardsToday } from './invite.js';
import {
  distributeFriendRewards,
  // Zang 裁定（发放必须幂等）：**基础奖励的锁内入账入口** —— 在调用方自己的 `withAssets`
  // 事务内调用（本模块把「打标 + 基础奖励入账」放进**同一次**事务 ⇒ 不会重复入账）。
  grantRewardBase,
} from './friend-ops.js';

const norm = (v) => String(v ?? '').trim();
const asDate = (d) => (d instanceof Date ? d : new Date(d));

// ==================== 任务定义（枚举名逐字冻结） ====================

/** 三条每日任务的**枚举名**（`/tasks/claim` 的 `task` 取值，逐字） */
export const TASK_IDS = {
  /** 每日签到（与签到卡共用 `signin_date` 判定） */
  SIGNIN: 'signin',
  /** 邀请新用户注册（口径 = 当日邀请奖励流水） */
  INVITE: 'invite',
  /** 平台写操作（口径 = 当日成功计费写流水） */
  WRITE: 'write',
};

/** 三态枚举（T-3） */
export const TASK_STATE = {
  NOT_ACHIEVED: 'not_achieved',
  CLAIMABLE: 'claimable',
  CLAIMED: 'claimed',
};

/** 三态中文文案（逐字；**不得静默失败**：未达标 / 不可领一律给出 `blocked_reason`） */
export const TASK_STATE_TEXT = {
  not_achieved: '未达标',
  claimable: '可领取',
  claimed: '已领取',
};

/** `invite` / `write` 的领取标记字段（资产记录内；`signin` 不写此字段，共用 `signin_date`） */
export const CLAIMS_FIELD = 'task_claims';

/**
 * 「平台写操作」的成功判据 = 当日存在这些类型之一的**成功计费写流水**：
 * `edit_fee`（人物 / 家族编辑、同胞排行重排）、`delete_fee`（删节点）、`move_fee`（跨树移动）、
 * `tree_create`（建树 / 立支）。均为**既有** Tx.type 枚举（白名单 `TX_TYPES` 内），本单不新增。
 * 未纳入：市集挂单 / 撤单 / 交易（交易域，另单）；`spirit_charge`（时流子域）；官方发售（购买，非写操作）。
 */
export const WRITE_TX_TYPES = ['edit_fee', 'delete_fee', 'move_fee', 'tree_create'];

/** R-5 每日任务奖励口径（**逐字**；`base` 照发本人、`pool` 按领取时刻生效好友数均分） */
export const DAILY_TASK_REWARD = {
  base: { seed_fragments: 1, bamboo_pieces: 1 },
  pool: { seed_fragments: 1, scroll_fragments: 1 },
};

/** 任务展示元数据（title 供前端 / 报告逐字引用） */
export const TASK_DEFS = [
  {
    id: TASK_IDS.SIGNIN,
    title: '每日签到',
    rule: '当日（北京时间自然日）已签到：`signin_date` = 当日日期串（与签到卡同一字段、同一判定）',
  },
  {
    id: TASK_IDS.INVITE,
    title: '邀请新用户注册',
    rule: "当日有一条成功邀请奖励流水（`Tx.type='reward'` 且 `ref.kind='invite'`，与 /invite 链路同一口径）",
  },
  {
    id: TASK_IDS.WRITE,
    title: '平台写操作',
    rule: "当日有一条成功写流水（`Tx.type ∈ edit_fee/delete_fee/move_fee/tree_create`；失败、被拒、no-op 均无流水 ⇒ 不计）",
  },
];

const TASK_BY_ID = new Map(TASK_DEFS.map((d) => [d.id, d]));

// ==================== 结构化错误（形状同 friends.js 的 friendError / index.js 的 httpError） ====================

export const TASK_ERRORS = {
  TASK_INVALID_PHONE: { status: 400, message: '手机号不合法' },
  TASK_UNKNOWN: { status: 400, message: '未知任务' },
  TASK_NOT_ACHIEVED: { status: 409, message: '今日任务尚未达标，请先完成后再领取' },
  TASK_ALREADY_CLAIMED: { status: 409, message: '今日该任务奖励已领取（同一自然日每项任务只能领一次）' },
  TASK_REWARD_FAILED: { status: 409, message: '任务奖励发放失败，本次领取已撤销，请稍后重试' },
};

/** 构造结构化错误（带 `status` / `code` / 中文 `message`；路由 `catch (e) { send(e.status, {ok:false,error:{...}}) }`） */
export function taskError(code, patch = {}) {
  const spec = TASK_ERRORS[code] || { status: 409, message: '任务中心操作失败' };
  const e = new Error(patch.message || spec.message);
  e.status = Number(patch.status) || spec.status;
  e.code = patch.code || code;
  if (patch.reason !== undefined) e.reason = patch.reason;
  if (patch.detail !== undefined) e.detail = patch.detail;
  return e;
}

// ==================== 达标 / 已领判定（纯函数，只读 user 记录） ====================

/** 当日「成功写」流水条数（纯函数；口径见 WRITE_TX_TYPES 注释） */
export function countWritesToday(user, now = new Date()) {
  const today = beijingDate(now);
  const txs = Array.isArray(user?.txs) ? user.txs : [];
  let n = 0;
  for (const t of txs) {
    if (!t || !WRITE_TX_TYPES.includes(norm(t.type))) continue;
    if (!t.ts) continue;
    if (beijingDate(t.ts) === today) n += 1;
  }
  return n;
}

/**
 * 达标判定（逐字三条）。
 * @returns {boolean} `true` = 当日已达标
 */
export function achievedToday(user, task, now = new Date()) {
  const id = norm(task);
  if (id === TASK_IDS.SIGNIN) return norm(user?.signin_date) === beijingDate(now);
  if (id === TASK_IDS.INVITE) return countInviteRewardsToday(user, now) > 0;
  if (id === TASK_IDS.WRITE) return countWritesToday(user, now) > 0;
  return false;
}

/** 「已领取」的日期串（`signin` = 共用 `signin_date`；其余 = `task_claims[任务名]`） */
export function claimedDayOf(user, task) {
  const id = norm(task);
  if (id === TASK_IDS.SIGNIN) return norm(user?.signin_date); // ⚠️ 与签到卡共用同一字段
  return norm((user && user[CLAIMS_FIELD] && user[CLAIMS_FIELD][id]) || '');
}

/** 当日是否已领（同一自然日判定 = 北京自然日日期串比对） */
export function claimedToday(user, task, now = new Date()) {
  return claimedDayOf(user, task) === beijingDate(now);
}

/**
 * 逐条任务的三态投影（纯函数）。
 * `claimable` 判据：`signin` = 当日未签到（签到即领奖）；`invite` / `write` = **当日已达标**。
 */
export function taskViewOf(user, def, now = new Date()) {
  const day = beijingDate(now);
  const achieved = achievedToday(user, def.id, now);
  const claimed = claimedToday(user, def.id, now);
  const claimable = !claimed && (def.id === TASK_IDS.SIGNIN ? true : achieved);
  const state = claimed ? TASK_STATE.CLAIMED : claimable ? TASK_STATE.CLAIMABLE : TASK_STATE.NOT_ACHIEVED;
  return {
    task: def.id,
    title: def.title,
    rule: def.rule,
    day,
    achieved,
    claimed,
    claimed_day: claimedDayOf(user, def.id),
    claimable,
    state,
    state_text: TASK_STATE_TEXT[state],
    blocked_reason:
      state === TASK_STATE.CLAIMED
        ? TASK_STATE_TEXT.claimed
        : state === TASK_STATE.NOT_ACHIEVED
          ? `${TASK_STATE_TEXT.not_achieved}：${def.title}尚未完成（北京时间自然日 ${day}）`
          : '',
  };
}

/** 三条任务的三态投影（`/tasks/today` 的 data.tasks） */
export function taskViewsOf(user, now = new Date()) {
  return TASK_DEFS.map((def) => taskViewOf(user, def, now));
}

// ==================== IO：当日三态读数（GET /tasks/today） ====================

/**
 * 当日三任务三态读数（**只读、零写入、不 sweep**：GET 不得产生资产变更）。
 * @returns {Promise<{day:string, tasks:object[]}>}
 */
export async function tasksToday(phone, now = new Date()) {
  const me = norm(phone);
  if (!me) throw taskError('TASK_INVALID_PHONE');
  const at = asDate(now);
  const user = await getAssets(me); // 只读快照；一切写入走 withAssets
  return { day: beijingDate(at), tasks: taskViewsOf(user, at), reward: { ...DAILY_TASK_REWARD } };
}

// ==================== IO：手动领取（POST /tasks/claim） ====================

/** 领取前置（纯函数）：`{ok:true}` / `{ok:false, code, message}` */
function claimGateOf(user, task, now) {
  if (claimedToday(user, task, now)) {
    return { ok: false, code: 'TASK_ALREADY_CLAIMED', message: `今日「${TASK_BY_ID.get(task)?.title || task}」奖励已领取（北京时间自然日 ${beijingDate(now)} 每项任务只能领一次）` };
  }
  if (task === TASK_IDS.SIGNIN) return { ok: true }; // 签到：签到动作即本次领取（与签到卡共用 signin_date）
  if (!achievedToday(user, task, now)) {
    return { ok: false, code: 'TASK_NOT_ACHIEVED', message: `今日「${TASK_BY_ID.get(task)?.title || task}」尚未达标（${TASK_BY_ID.get(task)?.rule || ''}）` };
  }
  return { ok: true };
}

/**
 * 手动领取（T-4）：**唯一**发奖入口。
 *
 * 执行序列（**本单修正**：Zang 裁定「发放必须幂等」）：
 *   ⓪ **只读预检**（`getAssets` 快照 + `claimGateOf`）：未达标 / 已领取 ⇒ 立刻结构化拒绝，零写入；
 *   ① **池分发**（唯一入口 = `friend-ops.distributeFriendRewards`，`base: null` ⇒ 不在那里发基础奖励）；
 *      幂等键 = `手机号 + 自然日 + 任务` ⇒ 中途失败重试时，**已在账上的收件人跳过入账**（不重复发、
 *      不重复写流水）。池写的是**他人**资产（各自 `withAssets`），故这里**不**把跨用户写入塞进
 *      触发者的锁内（那会造成 A↔B 互锁死锁，见报告）；池的幂等由幂等键保证。
 *      失败 ⇒ `TASK_REWARD_FAILED`（此刻**本人零写入、零打标** ⇒ 领取天然可重试，无悬空标记）。
 *   ② **打标 + 基础奖励入账 = 同一 `withAssets` 事务**：锁内**复核**幂等 / 达标（并发双领的最后一道闸）
 *      ⇒ 打标（`signin` 写共用 `signin_date` + 既有枚举 `signin` 审计条；`invite` / `write` 写
 *      `task_claims[任务]`）+ `friend-ops.grantRewardBase`（基础奖励逐键入账 + 一条 `reward` 流水）。
 *      **原子提交 / 原子回滚** ⇒ 不存在「基础已入账但未打标」，重试也绝不会二次入账基础奖励。
 *      失败 ⇒ `TASK_REWARD_FAILED`（零写入）；锁内复核失败 ⇒ 原样抛 409（`TASK_ALREADY_CLAIMED` /
 *      `TASK_NOT_ACHIEVED`，错误码与文案逐字保留）。
 *   ③ 领取后读数（供 `/assets/signin` 兼容出参 + 报告逐字读回）。
 *
 * @param {string} phone
 * @param {'signin'|'invite'|'write'} task
 * @param {Date|string} [now]
 * @returns {Promise<{task:string,title:string,day:string,state:string,state_text:string,claimed_at:string,
 *   achieved:boolean, signin_date:string, reward:object, detail:object, tasks:object[]}>}
 */
export async function claimTask(phone, task, now = new Date()) {
  const me = norm(phone);
  if (!me) throw taskError('TASK_INVALID_PHONE');
  const id = norm(task);
  const def = TASK_BY_ID.get(id);
  if (!def) {
    throw taskError('TASK_UNKNOWN', {
      message: `未知任务：${id || '(空)'}（可用：${TASK_DEFS.map((d) => d.id).join(' / ')}）`,
    });
  }
  const at = asDate(now);
  const day = beijingDate(at);

  // ⓪ 只读预检（零写入）：被拒的领取一字节不写（错误码 / 文案与旧口径逐字一致）
  const preGate = claimGateOf(await getAssets(me), id, at);
  if (!preGate.ok) throw taskError(preGate.code, { message: preGate.message, detail: { task: id, day } });

  // ① 池分发（唯一入口 = friend-ops；幂等键 = 触发者 + 自然日 + 任务 ⇒ 失败重试不重复入账）
  let pool = null;
  let failure = null;
  try {
    const res = await distributeFriendRewards(
      me,
      // `base: null` ⇒ friend-ops 只发池：本人基础奖励在 ② 与打标**同一事务**内入账（见下）
      { base: null, pool: { ...DAILY_TASK_REWARD.pool } },
      at,
      { idempotency_key: `${me}:${day}:${id}` },
    );
    if (!res || res.ok === false) {
      failure = res?.error || { code: 'TASK_REWARD_FAILED', message: TASK_ERRORS.TASK_REWARD_FAILED.message };
    } else {
      pool = res;
    }
  } catch (e) {
    failure = { code: norm(e?.code) || 'TASK_REWARD_FAILED', message: norm(e?.message) || TASK_ERRORS.TASK_REWARD_FAILED.message };
  }
  if (failure) {
    throw taskError('TASK_REWARD_FAILED', {
      message:
        `任务奖励发放失败（${failure.code || 'REWARD_FAILED'}）：${failure.message || '好友奖励池分发未成功'}` +
        '；本次领取**未落任何标记、零写入**，可直接重试',
      reason: failure.code || 'TASK_REWARD_FAILED',
      detail: { task: id, day, rolled_back: true, stage: 'pool' },
    });
  }

  // ② 打标 + 基础奖励入账（**同一 withAssets 事务**；锁内复核 ⇒ 并发双领的最后一道闸）
  let before = null;
  let baseTxId = '';
  try {
    const out = await withAssets(me, (user) => {
      const gate = claimGateOf(user, id, at);
      if (!gate.ok) throw taskError(gate.code, { message: gate.message, detail: { task: id, day } });
      const snap = {
        signin_date: norm(user.signin_date),
        claims: { ...((user && user[CLAIMS_FIELD]) || {}) },
        fragments: toNonNegInt(user.fragments),
        seed_ids: (Array.isArray(user.seeds) ? user.seeds : []).map((l) => norm(l?.id)),
      };
      if (id === TASK_IDS.SIGNIN) {
        user.signin_date = day; // ⚠️ 与签到卡共用同一字段（同一判定、绝不双发）
        // 审计流水：既有枚举 `signin`（delta 全 0 的记账条，照 ledger 既有 `jade_mount` 体例）
        recordSigninAudit(user, at);
      } else {
        user[CLAIMS_FIELD] = { ...((user && user[CLAIMS_FIELD]) || {}), [id]: day };
      }
      // 基础奖励（石榴籽碎片 1 + 竹片 1）：锁内入账 + 一条既有枚举 `reward` 流水（与打标同事务）
      const tx = grantRewardBase(user, { ...DAILY_TASK_REWARD.base }, at, me);
      return { snap, tx_id: norm(tx?.id) };
    });
    before = out.snap;
    baseTxId = out.tx_id;
  } catch (e) {
    // 锁内复核的拒绝 ⇒ **原样抛出**（409 语义与错误码逐字保留）
    if (e?.code === 'TASK_ALREADY_CLAIMED' || e?.code === 'TASK_NOT_ACHIEVED') throw e;
    throw taskError('TASK_REWARD_FAILED', {
      message: `任务奖励发放失败（${norm(e?.code) || 'REWARD_FAILED'}）：基础奖励入账未完成（本事务已整体回滚，零写入）`,
      reason: norm(e?.code) || 'TASK_REWARD_FAILED',
      detail: { task: id, day, rolled_back: true, stage: 'claim_and_base' },
    });
  }

  // ③ 领取后读数（供 /assets/signin 兼容出参 + 报告逐字读回）
  const after = await getAssets(me);
  return {
    task: id,
    title: def.title,
    day,
    state: TASK_STATE.CLAIMED,
    state_text: TASK_STATE_TEXT.claimed,
    claimed_at: at.toISOString(),
    achieved: achievedToday(after, id, at),
    signin_date: norm(after.signin_date),
    reward: summaryOfReward(pool, baseTxId),
    detail: detailOf(before, after),
    tasks: taskViewsOf(after, at),
  };
}

/**
 * 补偿路径的说明（**本单修正后已无调用点，保留注释以便追溯**）：
 *   旧口径「先打标 → 再发奖 → 失败则撤销打标」在「基础已入账、池分发中途失败」的窗口内重试会
 *   **重复入账一次基础奖励**（碎片 1 + 竹片 1）。本单按 Zang 裁定「发放必须幂等」改为：
 *   池先发（按幂等键去重）+ 「打标 + 基础奖励入账」同一次 `withAssets` 事务原子提交 / 原子回滚
 *   ⇒ 该窗口在结构上消失，不再需要「撤标」这一补偿动作（`rollbackClaim` 已随之删除）。
 */

/**
 * 签到的**审计流水**（既有枚举 `signin`，`delta` 全 0）。
 * 为什么必须留这一条：`Tx.type='signin'` 是签到在账本里的**唯一语义锚点**（前端资产流水亦按此类型
 * 展示「每日签到」）；本单把「发奖」统一交给任务中心（`reward` 流水），但**签到这一事件本身仍必须留痕**。
 * `delta` 全 0 ⇒ 不产生任何资产变动，**不构成第二套数值**（既有先例：`jade_mount` 的 0-delta 记账条）。
 * 写路径**唯一** = ledger 的 `recordTx`（id / ts 由它生成；type 受 `TX_TYPES` 白名单校验 ⇒ 不新增枚举）。
 */
function recordSigninAudit(user, now) {
  return recordTx(
    user,
    {
      type: 'signin',
      delta: {},
      ref: { source: 'task_center', task: 'signin' },
      desc: '每日签到（北京时间自然日；奖励经任务中心领取：石榴籽碎片 1 + 竹片 1，好友池另计）',
    },
    now,
  );
}

/**
 * 发奖结果摘要（**只出脱敏与聚合读数**；池明细含 relation_token / 脱敏手机号，由 friend-ops 决定）。
 * `base` = R-5 口径的基础奖励（本单起由 ② 的**同一事务**发放 ⇒ 取常量，不回显池调用的 `base:null`）；
 * `base_tx_id` = 该事务里那条 `reward`（`scope='base'`）流水的 id。
 */
function summaryOfReward(pool, baseTxId) {
  return {
    base: { seed_fragments: 0, bamboo_pieces: 0, scroll_fragments: 0, ...DAILY_TASK_REWARD.base },
    pooled: !!pool?.pooled,
    denominator: toNonNegInt(pool?.denominator),
    pool_per_friend: pool?.pool_per_friend || {},
    remainder: pool?.remainder || {},
    distributed: Array.isArray(pool?.distributed) ? pool.distributed : [],
    base_tx_id: norm(baseTxId),
  };
}

/** 领取前后的资产读数（供 `/assets/signin` 兼容出参：`fragments` / `synthesized` / `seed_lot`） */
function detailOf(before, after) {
  const seedIds = new Set(before?.seed_ids || []);
  const fresh = (Array.isArray(after?.seeds) ? after.seeds : []).filter(
    (l) => l && !seedIds.has(norm(l.id)) && norm(l.source) === 'fragment_synth',
  );
  return {
    fragments: toNonNegInt(after?.fragments),
    synthesized: fresh.length,
    seed_lot: fresh[0] || null,
    signin_date: norm(after?.signin_date),
    scroll_fragments: toNonNegInt(after?.scroll_fragments),
    bamboos_total_pieces: (Array.isArray(after?.bamboos) ? after.bamboos : []).reduce((s, l) => s + toNonNegInt(l?.qty), 0),
    fragments_before: toNonNegInt(before?.fragments),
  };
}

// ==================== 导出清单 ====================
// IO：tasksToday / claimTask
// 纯函数：achievedToday / countWritesToday / claimedDayOf / claimedToday / taskViewOf / taskViewsOf
// 常量与错误：TASK_IDS / TASK_DEFS / TASK_STATE / TASK_STATE_TEXT / CLAIMS_FIELD / WRITE_TX_TYPES /
//   DAILY_TASK_REWARD / TASK_ERRORS / taskError
