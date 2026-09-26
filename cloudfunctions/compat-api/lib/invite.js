/**
 * 邀请链路内核（jiazu_invites）— Zang 裁定 v3（2026-09-25，冻结口径 I-1…I-9）
 *
 * 口径（逐条实现，每条一句话可改）：
 *   I-1 集合 `jiazu_invites`，**每被邀请人一文档**：`_id = 被邀请人手机号`；
 *       字段 `inviter_phone` / `created_at` / `rewarded`（布尔）/ `reward_tx_id`（可选）。
 *       一个手机号只能被邀请一次（`_id` 唯一天然保证）；**记录永不复用、不删除**。
 *   I-2 **邀请码 = 邀请人手机号（11 位）**，不引入短码与映射表；可校验：该手机号必须已注册。
 *   I-3 注册时可选填 `invite_code`；缺省 / 空 = 无邀请（行为与既有完全一致）。
 *       依次校验：① 11 位手机号格式 ② 邀请人 ≠ 被邀请人 ③ 邀请人已注册 ④ 该被邀请人尚无邀请记录
 *       （④ 命中 → **静默忽略，不重发奖**）。**校验全过才写 jiazu_invites 文档**。
 *   I-4 发奖：**邀请人**得 9 石榴籽碎片 + 11 兰帖残页；**被邀请人不得奖**。
 *   I-5 日限与防刷：邀请人 **3 次/日**（按北京自然日）；超限**静默不发放**、**不回滚注册**；
 *       计数口径 = 扫描本仓既有 `Tx.type === 'reward'` 流水（**不新增顶层计数字段**）；
 *       同一被邀请人只奖一次（`_id` 唯一 + `rewarded` 标志双重保证）。
 *   I-6 路由：`GET /invite/me`、`POST /invite/accept`（均需登录；注册在树编辑闸门之前）。
 *   I-7 兰帖残页**依赖另一单的真源导出，本模块不写第二版**：`addScrollFragments` 与
 *       `SCROLL_FRAGMENT_CAP` / `SCROLL_FRAGMENT_SYNTH_THRESHOLD` / `SCROLL_PIECES_PER_SCROLL`
 *       一律从 `./economy-ledger.js` 导入（**真源导出名为 `SCROLL_PIECES_PER_SCROLL`**，
 *       冻结单所写 `SCROLL_PIECES_PER_ITEM` 在真源中不存在，见报告 §2）。
 *       ⚠️ 取值沿革（2026-09-26 Kevin 裁定）：`SCROLL_FRAGMENT_CAP` = **单格容纳上限 / 展示层口径**
 *       （`99` → `999`，**不是拒绝阈值**）；`SCROLL_FRAGMENT_SYNTH_THRESHOLD` 保持 `100` =
 *       **手动合成门槛**（自动合成已取消 ⇒ 本模块只累加、不判合成）。
 *   I-9 不改 `assets` / 好友路由相关文件。
 *
 * 分层：纯函数（不发 IO）= `countInviteRewardsToday` / `inviteDocId` / `inviteCodeFormatOk`；
 *       IO = `resolveInvite` / `grantInviteReward` / `recordInvite` / `applyInvite` / `inviteStats`。
 *
 * 写入路径：资产一律经 `withAssets`（唯一写路径，docs/economy.spec.md §5-7）；
 *           邀请记录只经本模块 `colSet`，无其它写入口。
 */
import { colGet, colSet, colAll } from './store.js';
import {
  withAssets,
  getAssets,
  addFragments,
  addScrollFragments,
  recordTx,
  beijingDate,
  toNonNegInt,
  sweep,
} from './economy-ledger.js';

// ---- 集合与常量 ----

export const INVITES_COL = 'jiazu_invites';
export const USERS_COL = 'jiazu_users';

/** 邀请码形态 = 11 位手机号（I-2；与既有 PHONE_RE 同口径） */
export const PHONE_RE = /^1\d{10}$/;

/** I-4 发奖：邀请人得 9 石榴籽碎片（`user.fragments`）+ 11 兰帖残页（`user.scroll_fragments`） */
export const INVITE_REWARD_FRAGMENTS = 9;
export const INVITE_REWARD_SCROLL_FRAGMENTS = 11;

/** I-5 日限：邀请人每日最多发放 3 次邀请奖励（北京自然日） */
export const INVITE_DAILY_LIMIT = 3;

/** I-5 计数 / 归因口径：沿用既有 `Tx.type = 'reward'`，用 `ref.kind` 标记为本链路所发 */
export const INVITE_TX_TYPE = 'reward';
export const INVITE_TX_REF_KIND = 'invite';

// ---- 错误码（逐字；随报告 §8 登记）----

/** 邀请码不是 11 位手机号 */
export const ERR_INVITE_CODE_FORMAT = 'INVITE_CODE_FORMAT';
/** 邀请码 = 自己（自邀） */
export const ERR_FRIEND_SELF_INVITE = 'FRIEND_SELF_INVITE';
/** 邀请码对应的手机号尚未注册 */
export const ERR_INVITE_CODE_UNKNOWN = 'INVITE_CODE_UNKNOWN';
/** `/invite/accept` 未带邀请码（注册路径缺省 = 无邀请，**不报此码**） */
export const ERR_INVITE_CODE_REQUIRED = 'INVITE_CODE_REQUIRED';

export const MSG_INVITE_CODE_FORMAT = '邀请码格式不正确（应为 11 位手机号）';
export const MSG_FRIEND_SELF_INVITE = '不能填写自己的邀请码';
export const MSG_INVITE_CODE_UNKNOWN = '邀请码无效：该手机号尚未注册';
export const MSG_INVITE_CODE_REQUIRED = '请填写邀请码';

// ---- 纯工具 ----

/** I-1：`_id` = 被邀请人手机号（一个手机号只能被邀请一次） */
export function inviteDocId(inviteePhone) {
  return String(inviteePhone || '').trim();
}

/** I-3①：邀请码格式（11 位手机号） */
export function inviteCodeFormatOk(code) {
  return PHONE_RE.test(String(code ?? '').trim());
}

/** 手机号脱敏（流水 `desc` 只落脱敏串，避免在本人账本里落他人完整号码） */
export function maskPhone(phone) {
  const p = String(phone || '');
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

/**
 * I-5 计数口径（纯函数）：该用户在**北京自然日 `now` 当天**已发放的邀请奖励条数。
 * 只扫 `Tx.type === 'reward'` 且带本链路归因 `ref.kind === 'invite'` 的流水 ——
 * 与「好友奖励」等其它 `reward` 来源互不串味；**不新增顶层计数字段**。
 */
export function countInviteRewardsToday(user, now = new Date()) {
  const today = beijingDate(now);
  const txs = Array.isArray(user?.txs) ? user.txs : [];
  return txs.filter(
    (t) =>
      t &&
      t.type === INVITE_TX_TYPE &&
      t.ref &&
      t.ref.kind === INVITE_TX_REF_KIND &&
      t.ts &&
      beijingDate(t.ts) === today,
  ).length;
}

/** 错误结果（路由层直接 `send(status, { error, code })`；形状沿用既有 `TREE_FUND_RETIRED` 先例） */
const fail = (code, error) => ({ ok: false, status: 400, code, error });

// ---- 校验（I-3，顺序逐条）----

/**
 * I-3 校验链（含 I-1 的「一个手机号只能被邀请一次」读侧判定）。
 *
 * @param {string} rawCode 入参 `invite_code`（可缺省 / 空）
 * @param {string} inviteePhone 被邀请人手机号
 * @param {boolean} [required] `true` = 缺省即报 `INVITE_CODE_REQUIRED`（仅 `/invite/accept`）
 * @returns {Promise<
 *   | {ok:true, kind:'none'}
 *   | {ok:true, kind:'already', inviter_phone:string}
 *   | {ok:true, kind:'pending', invite_code:string, inviter_phone:string}
 *   | {ok:false, status:number, code:string, error:string}>}
 */
export async function resolveInvite(rawCode, inviteePhone, required = false) {
  const code = String(rawCode ?? '').trim();
  const invitee = String(inviteePhone || '').trim();
  // ① 缺省 / 空：注册路径 = 无邀请（行为与既有完全一致）；accept 路径 = 400
  if (!code) return required ? fail(ERR_INVITE_CODE_REQUIRED, MSG_INVITE_CODE_REQUIRED) : { ok: true, kind: 'none' };
  // ② 格式：11 位手机号
  if (!PHONE_RE.test(code)) return fail(ERR_INVITE_CODE_FORMAT, MSG_INVITE_CODE_FORMAT);
  // ③ 自邀
  if (code === invitee) return fail(ERR_FRIEND_SELF_INVITE, MSG_FRIEND_SELF_INVITE);
  // ④ 邀请人必须已注册
  const inviter = await colGet(USERS_COL, code);
  if (!inviter) return fail(ERR_INVITE_CODE_UNKNOWN, MSG_INVITE_CODE_UNKNOWN);
  // ⑤ 该被邀请人尚无邀请记录 → 已有 = **静默忽略**（不报错、不重发奖；I-1 / I-5）
  const existing = await colGet(INVITES_COL, invitee);
  if (existing) return { ok: true, kind: 'already', inviter_phone: existing.inviter_phone || code };
  return { ok: true, kind: 'pending', invite_code: code, inviter_phone: code };
}

// ---- 发奖（I-4 / I-5）----

/**
 * I-4 发奖：给**邀请人**发 9 石榴籽碎片 + 11 兰帖残页（**被邀请人不得奖**）。
 * I-5 日限：北京自然日内已发满 `INVITE_DAILY_LIMIT` 次 → **静默不发放**（不改任何资产、不写流水，
 * 也不抛错）；日限只影响发奖，**不影响注册成功**。
 *
 * @returns {Promise<{rewarded:boolean, reason:string, tx_id:string|null, fragments?:number, scroll_fragments?:number}>}
 */
export async function grantInviteReward(inviterPhone, inviteePhone, now = new Date()) {
  const inviter = String(inviterPhone || '').trim();
  // 前置只读判定：已达日限 → **零写入**（连 withAssets 的整体回写都不触发）
  const snapshot = await getAssets(inviter);
  if (countInviteRewardsToday(snapshot, now) >= INVITE_DAILY_LIMIT) {
    return { rewarded: false, reason: 'daily_limit', tx_id: null };
  }
  return withAssets(inviter, (user) => {
    sweep(user, now);
    // 防御性复检：并发窗口内多个请求同时通过前置判定时，在同一手机号的串行队列内再判一次
    if (countInviteRewardsToday(user, now) >= INVITE_DAILY_LIMIT) {
      return { rewarded: false, reason: 'daily_limit', tx_id: null };
    }
    // 9 石榴籽碎片（`addFragments`：满 10 自动合成，9 片不会触发）
    addFragments(user, INVITE_REWARD_FRAGMENTS, now);
    // 11 兰帖残页（I-7 依赖：真源导出，本模块不写第二版；**纯累加 —— 自动合成 2026-09-26 裁定取消**）
    addScrollFragments(user, INVITE_REWARD_SCROLL_FRAGMENTS, now);
    const tx = recordTx(
      user,
      {
        type: INVITE_TX_TYPE,
        delta: { fragments: INVITE_REWARD_FRAGMENTS, scroll_fragments: INVITE_REWARD_SCROLL_FRAGMENTS },
        ref: { kind: INVITE_TX_REF_KIND, invitee: String(inviteePhone || '').trim() },
        desc: `邀请奖励：好友 ${maskPhone(inviteePhone)} 填写了您的邀请码`,
        operator: inviter,
      },
      now,
    );
    return {
      rewarded: true,
      reason: 'rewarded',
      tx_id: tx.id,
      fragments: toNonNegInt(user.fragments),
      scroll_fragments: toNonNegInt(user.scroll_fragments),
    };
  });
}

/**
 * I-1 写邀请记录（每被邀请人一文档；**永不复用、不删除**）。
 * `rewarded` 记录本次是否真的发过奖（日限静默不发放时 = `false`，且无 `reward_tx_id`）。
 */
export async function recordInvite(inviterPhone, inviteePhone, reward, now = new Date()) {
  const doc = {
    inviter_phone: String(inviterPhone || '').trim(),
    created_at: new Date(now).toISOString(),
    rewarded: !!(reward && reward.rewarded),
  };
  if (reward && reward.tx_id) doc.reward_tx_id = reward.tx_id;
  await colSet(INVITES_COL, inviteDocId(inviteePhone), doc);
  return doc;
}

// ---- 编排（注册路径与 `/invite/accept` 共用同一套校验与发奖）----

/**
 * 把一个 `invite_code` 落到被邀请人身上：校验 → 发奖 → 写邀请记录。
 * `/auth/register` 与 `POST /invite/accept` **共用本函数**（I-6：同一套校验与发奖）。
 *
 * @returns {Promise<{ok:true, applied:boolean, reason:string, inviter_phone:string|null, rewarded:boolean, reward_tx_id:string|null}
 *   | {ok:false, status:number, code:string, error:string}>}
 */
export async function applyInvite(inviteePhone, rawCode, opts = {}) {
  const now = opts.now || new Date();
  const required = !!opts.required;
  const invitee = String(inviteePhone || '').trim();
  const v = await resolveInvite(rawCode, invitee, required);
  if (!v.ok) return v; // 校验失败 → 路由层 400（此时**未写任何文档**）
  if (v.kind === 'none') {
    return { ok: true, applied: false, reason: 'no_code', inviter_phone: null, rewarded: false, reward_tx_id: null };
  }
  if (v.kind === 'already') {
    // I-3④ / I-5：同一被邀请人只奖一次 → 静默（不报错、不重发奖）
    return {
      ok: true,
      applied: false,
      reason: 'already_invited',
      inviter_phone: v.inviter_phone,
      rewarded: false,
      reward_tx_id: null,
    };
  }
  const reward = await grantInviteReward(v.inviter_phone, invitee, now);
  await recordInvite(v.inviter_phone, invitee, reward, now);
  return {
    ok: true,
    applied: true,
    reason: reward.rewarded ? 'rewarded' : 'daily_limit',
    inviter_phone: v.inviter_phone,
    rewarded: !!reward.rewarded,
    reward_tx_id: reward.tx_id || null,
  };
}

// ---- 读口径（I-6 `GET /invite/me`）----

/**
 * 我的邀请面板：邀请码（= 我的手机号，I-2）、今日已邀次数（I-5 口径：今日已发放的邀请奖励条数）、
 * 已邀总数（`jiazu_invites` 中 `inviter_phone = 我` 的文档数）、剩余今日额度。
 */
export async function inviteStats(phone, now = new Date()) {
  const me = String(phone || '').trim();
  const user = await getAssets(me);
  const today_invited = countInviteRewardsToday(user, now);
  const all = await colAll(INVITES_COL);
  const total_invited = all.filter((d) => d && d.inviter_phone === me).length;
  return {
    invite_code: me,
    today_invited,
    total_invited,
    remaining_today: Math.max(0, INVITE_DAILY_LIMIT - today_invited),
    daily_limit: INVITE_DAILY_LIMIT,
  };
}
