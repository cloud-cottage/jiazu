/**
 * 好友关系域（Zang 裁定 **口径 v4**，2026-09-25 改单 —— 推翻 v3 的 F-3 / F-5 时间单位与续约语义）
 *
 * v4 相对 v3 的三处口径改正：
 *   ① **时间单位一律「天」，自然月实现作废**：基础有效期 = 365 天；每次成功续约叠加奖励有效期 = 30 天；
 *      到期时刻 = T0 + (365 + 30 × reward_months) 天（reward_months = 累计成功续约数）。
 *      v3 的自然月算术（addMonths 及月末溢出处理）**已整体删除，不留死代码**。
 *   ② **续约申请期道具锁定**：renewRequest 通过校验后即锁定发起方 1 枚兰帖（`locked_*` 四字段），
 *      **发起时锁定但不扣除**（道具仍属用户持有，仅被占用）；解除只有三情形：对方确认（⇒ 转为扣减）/
 *      对方拒绝 / 发起方撤回 / 超 7 天未确认（后三者 ⇒ **解锁且不产生任何流水**）。
 *   ③ 两条守卫：renewConfirm **只能由关系另一方执行**；关系 dissolved 后到达的任何
 *      renewConfirm / acceptInvite **一律拒绝且不得复活**（终态不可逆）。
 *
 * 分层（**纯函数与 IO 分离**，体例照 lib/economy-ledger.js）：
 *   - 纯函数（无 IO、不读写任何集合）：relationIdOf / sweepRelation / isActiveAt /
 *     otherPhoneOf / windowOpenAt / baseExpiresAt
 *   - IO 层（**唯一**读写入口，只调 store.js 的 colGet / colSet / colWhere，无第二套 IO）：
 *     createInvite / acceptInvite / rejectInvite / cancelInvite / renewRequest / renewConfirm /
 *     renewCancel / dissolve / listRelations
 *
 * 落盘纪律（照 economy-ledger.js）：同一关系 `_id` 串行锁 + **整体回写一次 colSet**（关系是单点真源，
 * F-2：双边确认 / 续约 / 缓冲 / 解除全在同一份文档上一次写完成，**不得双边冗余两份**）；
 * 校验失败 / 拒绝（含 409 整单拒绝）⇒ **零写入**（sweep 的中间结果不落盘，下次调用惰性重算）；
 * 落盘失败 ⇒ 抛错（store.js 的 colSet 先落盘成功才换缓存，失败不留幻影文档）。
 *
 * 资产边界（**本模块不得读写兰帖资产**）：本模块 **不 import 经济域账本**、不读任何资产集合；
 *   兰帖检查与扣减**全部由调用方**在资产事务内完成，本模块只吃调用方传入的布尔校验结果
 *   （`has_self_scroll` / `has_initiator_scroll`）并**只负责状态、锁定与返回值**。
 *
 * 文档字段（F-2 七字段 + F-4 明文授权的两项 + v4 的锁定字段）：
 *   _id（双方手机号**升序**拼 `A:B`，A 为字典序较小者）、version、a_phone、b_phone、status、
 *   created_at、expires_at、reward_months（v4 口径 = 累计成功续约数）、renewals、pending、history
 *   ＋ grace_until（F-4：「另存 grace_until = expires_at + 30 天」）
 *   ＋ reason（F-4：「置 dissolved 并标 reason = invite_timeout」/「reason = grace_expired」）
 *   ＋ pending.locked_by / pending.locked_pieces / pending.locked_lot_id / pending.locked_at（仅 kind = renew）
 */
import { colGet, colSet, colWhere } from './store.js';

/** F-1：集合名（部署名逐字；本地模式落 migrate-output/collections/jiazu_friends.json） */
export const FRIENDS_COL = 'jiazu_friends';

/** F-4 状态取值（逐字）：待邀请 / 生效中 / 缓冲中 / 已解除 */
export const RELATION_STATUS = {
  /** 待邀请 */
  PENDING: 'pending',
  /** 生效中 */
  ACTIVE: 'active',
  /** 缓冲中 */
  GRACE: 'grace',
  /** 已解除（终态，链不可逆） */
  DISSOLVED: 'dissolved',
};

/** F-4：待邀请超时 = 7 天未接受 → 惰性置 dissolved（reason = invite_timeout） */
export const INVITE_TTL_DAYS = 7;
/** F-5：续约申请超 7 天未确认 → 申请自动失效（清空 pending = 解锁，关系继续运行） */
export const RENEW_TTL_DAYS = 7;
/** F-4：距到期 > 30 天不得发起续约；≤ 30 天为续约窗口 */
export const RENEW_WINDOW_DAYS = 30;
/** F-4：缓冲期 = 到期时刻 + 30 天 */
export const GRACE_DAYS = 30;
/** v4 ①：基础有效期 = **365 天**（自然月口径作废） */
export const BASE_DAYS = 365;
/** v4 ①：每次成功续约叠加奖励有效期 = **30 天**（非自然月） */
export const RENEWAL_REWARD_DAYS = 30;
/** v4 ②：一次续约申请锁定的兰帖片数（锁定但不扣除） */
export const LOCKED_PIECES = 1;

/**
 * F-10：错误码集中（**码值字面冻结**，调用方依赖；中文文案随码固定，可按调用场景覆写 message）
 *   状态码取值：FRIEND_INVALID_PHONE = 400；FRIEND_NOT_FOUND = 404；其余 = 409。
 *   v4 新增（改单授权）：RENEW_ALREADY_PENDING = 已有 pending 续约申请时二次发起的结构化拒绝；
 *                       RENEW_SELF_CONFIRM  = 发起方自确认续约的结构化拒绝。
 */
export const FRIEND_ERRORS = {
  FRIEND_INVALID_PHONE: { status: 400, message: '手机号不能为空' },
  FRIEND_NOT_FOUND: { status: 404, message: '好友关系不存在' },
  FRIEND_SELF_INVITE: { status: 409, message: '不能邀请自己' },
  FRIEND_DUPLICATE: { status: 409, message: '该好友关系已存在' },
  FRIEND_NOT_PARTY: { status: 409, message: '你不是该好友关系的当事人' },
  FRIEND_STATE_INVALID: { status: 409, message: '当前状态不允许该操作' },
  NOT_IN_RENEW_WINDOW: { status: 409, message: '未进入续约窗口（到期前 30 天内才可发起续约）' },
  SCROLL_INSUFFICIENT: { status: 409, message: '兰帖不足，续约需双方各 1 枚成品兰帖' },
  RENEW_ALREADY_PENDING: {
    status: 409,
    message: '已有待确认的续约申请（发起方 1 枚兰帖已锁定），不可重复发起',
  },
  RENEW_SELF_CONFIRM: { status: 409, message: '续约须由关系另一方确认，发起方不能自己确认' },
};

/** F-10：全部错误码字面（顺序 = 上表声明序；测试与调用方按此清单断言） */
export const FRIEND_ERROR_CODES = Object.keys(FRIEND_ERRORS);

const DAY_MS = 86400000;

// ---- 基础工具（纯） ----

const toIso = (d) => new Date(d).toISOString();
const toMs = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const isoPlusDays = (from, days) => new Date(toMs(from) + days * DAY_MS).toISOString();

/** 手机号口径：只做 trim + 非空校验（格式校验不属本单范围，**不臆造规则**） */
function normPhone(v) {
  return String(v ?? '').trim();
}

/** F-10：结构化拒绝（status + code + 中文文案；可选 message 覆写文案） */
export function friendError(code, patch = {}) {
  const spec = FRIEND_ERRORS[code];
  if (!spec) throw new Error(`未知好友域错误码：${code}`);
  const e = new Error(patch.message || spec.message);
  e.status = spec.status;
  e.code = code;
  if (patch.reason !== undefined) e.reason = patch.reason;
  if (patch.detail !== undefined) e.detail = patch.detail;
  return e;
}

/**
 * F-2：关系 `_id` = 双方手机号**升序**拼接（`A:B`，A 为字典序较小者）。
 * 任一侧为空 ⇒ 返回 `''`（**不抛错**：纯投影函数；校验在 IO 层 createInvite 里做）。
 */
export function relationIdOf(phoneA, phoneB) {
  const x = normPhone(phoneA);
  const y = normPhone(phoneB);
  if (!x || !y) return '';
  return x <= y ? `${x}:${y}` : `${y}:${x}`;
}

/** 关系里的「另一方」；非当事人 ⇒ 返回 `''` */
export function otherPhoneOf(doc, phone) {
  const p = normPhone(phone);
  if (!doc || !p) return '';
  if (doc.a_phone === p) return doc.b_phone || '';
  if (doc.b_phone === p) return doc.a_phone || '';
  return '';
}

/** 是否当事人 */
function isParty(doc, phone) {
  return !!doc && (doc.a_phone === phone || doc.b_phone === phone);
}

/**
 * v4 ①：到期时刻 = T0 + （365 + 30 × 累计成功续约数）**天**（**锚点恒为 T0，非续约时刻**）。
 * 纯天数加法：闰年 / 月末一律按真实毫秒推进，无任何自然月溢出特判。
 * 例：T0 = 2026-01-31 ⇒ 0 次续约 2027-01-31（+365 天）、1 次 2027-03-02（+395 天）、
 *     12 次 2028-01-26（+725 天）。
 */
export function baseExpiresAt(createdAt, rewardMonths = 0) {
  const r = Math.trunc(Number(rewardMonths) || 0);
  return isoPlusDays(createdAt, BASE_DAYS + RENEWAL_REWARD_DAYS * r);
}

/** F-4：续约窗口开启时刻 = 到期时刻 − 30 天（`now >= 本值` 才可发起续约） */
export function windowOpenAt(doc) {
  if (!doc || !doc.expires_at) return '';
  return new Date(toMs(doc.expires_at) - RENEW_WINDOW_DAYS * DAY_MS).toISOString();
}

/**
 * v4 ②：从 pending 里投影出「锁定视图」（对外返回用的四字段投影，逐字）。
 * 非续约申请 ⇒ `null`。发起方锁定信息**只存关系文档内的 pending**，不另建集合。
 */
function lockOf(pending) {
  if (!pending || pending.kind !== 'renew') return null;
  return {
    by: pending.locked_by || '',
    pieces: Number(pending.locked_pieces) || 0,
    lot_id: pending.locked_lot_id || '',
    at: pending.locked_at || '',
  };
}

/** 审计事件入 history 并返回该事件（**同一份文档内**，不另建集合） */
function pushEvent(doc, event) {
  const e = {
    at: event.at,
    type: event.type,
    from_status: event.from_status || '',
    to_status: event.to_status || '',
    by: event.by || '',
    reason: event.reason || '',
  };
  doc.history = doc.history || [];
  doc.history.push(e);
  return e;
}

/**
 * F-8：**惰性 sweep 纯函数**（**不做任何 IO**，也不改入参文档）
 *
 * 输入：(一份关系文档, 当前时刻)；输出：`{ relation, events, changed }`
 *   - `relation` = 迁移后的**新副本**（入参为 null / 非法 ⇒ `null`）
 *   - `events`   = 本次发生的迁移事件列表（无迁移 ⇒ 空数组）
 *   - `changed`  = 是否发生迁移
 *
 * 四类超时判定**全走这里**（**不注册定时任务**）：
 *   ① 待邀请超时（pending → dissolved，reason = invite_timeout，保留审计）
 *   ② 续约申请超时（清空 pending = **顺带解锁**，关系继续运行；**不得改变 expires_at**，
 *      也**不得产生任何流水 / 扣减信息**）
 *   ③ 到期转缓冲（active → grace，expires_at 不变，另存 grace_until = expires_at + 30 天）
 *   ④ 缓冲期满解除（grace → dissolved，reason = grace_expired）
 * 说明：② 在 active 与 grace 下**同一把时钟**判定（F-5 只说「超 7 天未确认即失效」，
 *   与关系处于哪个状态无关）；grace 期内在 7 天内的续约申请**不可被确认**（见 renewConfirm）。
 */
export function sweepRelation(doc, now = new Date()) {
  const events = [];
  if (!doc || typeof doc !== 'object') return { relation: null, events, changed: false };
  const relation = JSON.parse(JSON.stringify(doc));
  const at = toIso(now);
  const nowMs = toMs(now);
  const status = relation.status;

  if (status === RELATION_STATUS.PENDING) {
    // ① 邀请超时：邀请时刻 + 7 天
    const deadline =
      toMs(relation.pending?.expires_at ?? '') || toMs(relation.created_at) + INVITE_TTL_DAYS * DAY_MS;
    if (nowMs >= deadline) {
      relation.status = RELATION_STATUS.DISSOLVED;
      relation.pending = null;
      relation.reason = 'invite_timeout'; // F-4：置 dissolved 并标 reason = invite_timeout（保留审计）
      events.push(
        pushEvent(relation, {
          at,
          type: 'invite_timeout',
          from_status: RELATION_STATUS.PENDING,
          to_status: RELATION_STATUS.DISSOLVED,
          reason: 'invite_timeout',
        }),
      );
    }
  } else if (status === RELATION_STATUS.ACTIVE || status === RELATION_STATUS.GRACE) {
    // ② 续约申请超时：申请时刻 + 7 天 → 清空 pending（**解锁；expires_at 一字不动；无流水**）
    if (relation.pending && relation.pending.kind === 'renew') {
      const deadline =
        toMs(relation.pending.expires_at ?? '') || toMs(relation.pending.requested_at) + RENEW_TTL_DAYS * DAY_MS;
      if (nowMs >= deadline) {
        relation.pending = null; // 锁随 pending 一并解除（locked_* 四字段随 pending 消失）
        events.push(
          pushEvent(relation, {
            at,
            type: 'renew_timeout',
            from_status: status,
            to_status: status,
            reason: 'renew_timeout',
          }),
        );
      }
    }
    if (status === RELATION_STATUS.ACTIVE && relation.expires_at && nowMs >= toMs(relation.expires_at)) {
      // ③ 到期转缓冲
      relation.status = RELATION_STATUS.GRACE;
      relation.grace_until = isoPlusDays(relation.expires_at, GRACE_DAYS); // expires_at 不变
      events.push(
        pushEvent(relation, {
          at,
          type: 'grace_entered',
          from_status: RELATION_STATUS.ACTIVE,
          to_status: RELATION_STATUS.GRACE,
          reason: 'expired',
        }),
      );
    } else if (status === RELATION_STATUS.GRACE && relation.grace_until && nowMs >= toMs(relation.grace_until)) {
      // ④ 缓冲期满解除
      relation.status = RELATION_STATUS.DISSOLVED;
      relation.pending = null;
      relation.reason = 'grace_expired';
      events.push(
        pushEvent(relation, {
          at,
          type: 'grace_expired',
          from_status: RELATION_STATUS.GRACE,
          to_status: RELATION_STATUS.DISSOLVED,
          reason: 'grace_expired',
        }),
      );
    }
  }
  // dissolved = 终态：链不可逆，sweep 不动它（**不得复活**）
  return { relation, events, changed: events.length > 0 };
}

/**
 * F-9：**奖励池分母的唯一口径** —— 判定一份关系在给定时刻是否处于「生效中」。
 * 仅 `status === 'active'` **且未到期**（`now < expires_at`）计入；
 * pending / grace / dissolved **均不计**；已过期但尚未惰性 sweep 的 active **同样不计**。
 */
export function isActiveAt(doc, now = new Date()) {
  if (!doc || doc.status !== RELATION_STATUS.ACTIVE) return false;
  if (!doc.expires_at) return false;
  return toMs(now) < toMs(doc.expires_at);
}

// ---- IO 层（唯一读写入口；同一关系 _id 串行锁 + 整体回写一次） ----

const relationLocks = new Map();

/** 同一关系串行化（模式照 store.js 的 treeWriteLocks / economy-ledger.js 的 assetsLocks） */
function withRelationLock(id, fn) {
  const lock = relationLocks.get(id) || Promise.resolve();
  const run = lock.then(fn);
  relationLocks.set(id, run.catch(() => {}));
  return run;
}

/** 落盘一次（version 自增）；失败抛错（colSet 先落盘成功才换缓存，不留幻影） */
async function persistRelation(id, doc) {
  const next = { ...doc, version: (Number(doc.version) || 0) + 1 };
  await colSet(FRIENDS_COL, id, next);
  return next;
}

const resolveNow = (opts) => (opts?.now ? new Date(opts.now) : new Date());

/**
 * F-4 / F-7：发起邀请（创建待邀请关系）
 * @param {string} fromPhone 发起方手机号
 * @param {string} toPhone 被邀请人手机号
 * @param {{now?:Date|string}} [opts]
 * @returns {Promise<{ok:true, relation_id:string, relation:object, events:object[]}>}
 * 拒绝：FRIEND_INVALID_PHONE（400）/ FRIEND_SELF_INVITE（409）/ FRIEND_DUPLICATE（409）
 */
export async function createInvite(fromPhone, toPhone, opts = {}) {
  const from = normPhone(fromPhone);
  const to = normPhone(toPhone);
  if (!from || !to) throw friendError('FRIEND_INVALID_PHONE');
  if (from === to) throw friendError('FRIEND_SELF_INVITE'); // F-7：不得自邀
  const id = relationIdOf(from, to);
  return withRelationLock(id, async () => {
    const now = resolveNow(opts);
    const at = toIso(now);
    const base = await colGet(FRIENDS_COL, id);
    if (base) {
      // F-7：同一对手机号只能存在一份**非 dissolved** 关系
      const { relation: swept } = sweepRelation(base, now);
      if (swept.status !== RELATION_STATUS.DISSOLVED) throw friendError('FRIEND_DUPLICATE');
      // 已解除 ⇒ 允许重建：F-4「重建只能新建一份全新文档（历史累计奖励月清零）」
    }
    const a = from <= to ? from : to;
    const b = from <= to ? to : from;
    const doc = {
      _id: id,
      version: 0, // 落盘时自增为 1（全新文档）
      a_phone: a,
      b_phone: b,
      status: RELATION_STATUS.PENDING,
      created_at: at, // 待邀请阶段 = 发起时刻；接受时改写为 T0（接受时刻）
      expires_at: null, // 待邀请阶段无有效期
      reward_months: 0, // v4：建立时累计成功续约数 = 0
      renewals: 0,
      pending: {
        kind: 'invite',
        from_phone: from, // 发起人
        to_phone: to, // 被邀请人
        requested_at: at, // 发起时刻
        expires_at: isoPlusDays(at, INVITE_TTL_DAYS),
      },
      grace_until: null,
      reason: '',
      history: [],
    };
    const event = pushEvent(doc, {
      at,
      type: 'invite_created',
      from_status: '',
      to_status: RELATION_STATUS.PENDING,
      by: from,
    });
    const relation = await persistRelation(id, doc);
    return { ok: true, relation_id: id, relation, events: [event] };
  });
}

/** 读一份关系（不存在 ⇒ 404）；内部用，供各操作共用 */
async function loadRelation(id) {
  const doc = await colGet(FRIENDS_COL, id);
  if (!doc) throw friendError('FRIEND_NOT_FOUND');
  return doc;
}

const requireId = (relationId) => {
  const id = normPhone(relationId);
  if (!id) throw friendError('FRIEND_NOT_FOUND');
  return id;
};

/** 状态文案（拒绝时给中文可读原因） */
const STATE_TEXT = {
  [RELATION_STATUS.PENDING]: '邀请尚未接受',
  [RELATION_STATUS.ACTIVE]: '关系已生效',
  [RELATION_STATUS.GRACE]: '关系处于缓冲期',
  [RELATION_STATUS.DISSOLVED]: '关系已解除',
};

const stateReject = (relation) =>
  friendError('FRIEND_STATE_INVALID', { message: `当前状态不允许该操作（${STATE_TEXT[relation.status] || relation.status}）` });

/** v4 ③：终态（dissolved）守卫 —— 到达 dissolved 后一律拒绝，**不得复活** */
const terminalReject = (what) =>
  friendError('FRIEND_STATE_INVALID', {
    message: `关系已解除（终态不可逆），不能${what}`,
    reason: 'dissolved_terminal',
  });

/**
 * F-4：被邀请人接受 → status = active，created_at = 接受时刻（T0 = 接受时刻），
 * expires_at = T0 + **365 天**（v4 ①）
 * @param {string} relationId `A:B`
 * @param {string} byPhone 被邀请人手机号
 * @param {{now?:Date|string}} [opts]
 * @returns {Promise<{ok:true, relation_id:string, relation:object, events:object[]}>}
 * 拒绝：FRIEND_NOT_FOUND（404）/ FRIEND_STATE_INVALID（409，含已超时作废 / **已解除终态**）/
 *       FRIEND_NOT_PARTY（409，非被邀请人）
 */
export async function acceptInvite(relationId, byPhone, opts = {}) {
  const id = requireId(relationId);
  const by = normPhone(byPhone);
  if (!by) throw friendError('FRIEND_INVALID_PHONE');
  return withRelationLock(id, async () => {
    const now = resolveNow(opts);
    const at = toIso(now);
    const base = await loadRelation(id);
    const { relation, events } = sweepRelation(base, now);
    if (relation.status === RELATION_STATUS.DISSOLVED) throw terminalReject('接受邀请'); // 终态不可逆
    if (relation.status !== RELATION_STATUS.PENDING) throw stateReject(relation); // 超时作废 ⇒ 不可接受
    const inv = relation.pending;
    if (!inv || inv.kind !== 'invite') throw stateReject(relation);
    if (inv.to_phone !== by) throw friendError('FRIEND_NOT_PARTY', { message: '只有被邀请人本人可以接受邀请' });
    relation.status = RELATION_STATUS.ACTIVE;
    relation.created_at = at; // T0 = 接受时刻
    relation.expires_at = baseExpiresAt(at, relation.reward_months); // T0 + 365 天
    relation.pending = null;
    relation.grace_until = null;
    relation.reason = '';
    const event = pushEvent(relation, {
      at,
      type: 'invite_accepted',
      from_status: RELATION_STATUS.PENDING,
      to_status: RELATION_STATUS.ACTIVE,
      by,
    });
    const saved = await persistRelation(id, relation);
    return { ok: true, relation_id: id, relation: saved, events: [...events, event] };
  });
}

/**
 * F-4：被邀请人拒绝 → dissolved（链不可逆，不返还任何东西）
 * @returns {Promise<{ok:true, relation_id:string, relation:object, events:object[]}>}
 */
export async function rejectInvite(relationId, byPhone, opts = {}) {
  const id = requireId(relationId);
  const by = normPhone(byPhone);
  if (!by) throw friendError('FRIEND_INVALID_PHONE');
  return withRelationLock(id, async () => {
    const now = resolveNow(opts);
    const at = toIso(now);
    const base = await loadRelation(id);
    const { relation, events } = sweepRelation(base, now);
    if (relation.status !== RELATION_STATUS.PENDING) throw stateReject(relation);
    const inv = relation.pending;
    if (!inv || inv.kind !== 'invite') throw stateReject(relation);
    if (inv.to_phone !== by) throw friendError('FRIEND_NOT_PARTY', { message: '只有被邀请人本人可以拒绝邀请' });
    relation.status = RELATION_STATUS.DISSOLVED;
    relation.pending = null;
    relation.reason = 'invite_rejected';
    const event = pushEvent(relation, {
      at,
      type: 'invite_rejected',
      from_status: RELATION_STATUS.PENDING,
      to_status: RELATION_STATUS.DISSOLVED,
      by,
      reason: 'invite_rejected',
    });
    const saved = await persistRelation(id, relation);
    return { ok: true, relation_id: id, relation: saved, events: [...events, event] };
  });
}

/**
 * F-4：发起方撤回邀请 → dissolved
 * @returns {Promise<{ok:true, relation_id:string, relation:object, events:object[]}>}
 */
export async function cancelInvite(relationId, byPhone, opts = {}) {
  const id = requireId(relationId);
  const by = normPhone(byPhone);
  if (!by) throw friendError('FRIEND_INVALID_PHONE');
  return withRelationLock(id, async () => {
    const now = resolveNow(opts);
    const at = toIso(now);
    const base = await loadRelation(id);
    const { relation, events } = sweepRelation(base, now);
    if (relation.status !== RELATION_STATUS.PENDING) throw stateReject(relation);
    const inv = relation.pending;
    if (!inv || inv.kind !== 'invite') throw stateReject(relation);
    if (inv.from_phone !== by) throw friendError('FRIEND_NOT_PARTY', { message: '只有发起方本人可以撤回邀请' });
    relation.status = RELATION_STATUS.DISSOLVED;
    relation.pending = null;
    relation.reason = 'invite_cancelled';
    const event = pushEvent(relation, {
      at,
      type: 'invite_cancelled',
      from_status: RELATION_STATUS.PENDING,
      to_status: RELATION_STATUS.DISSOLVED,
      by,
      reason: 'invite_cancelled',
    });
    const saved = await persistRelation(id, relation);
    return { ok: true, relation_id: id, relation: saved, events: [...events, event] };
  });
}

/**
 * F-5 / v4 ②：发起续约申请（**只写状态与锁定，不碰资产、不扣除**）
 * 前置：status = active、已进入续约窗口（now ≥ expires_at − 30 天）、**无待确认申请**、
 *       发起方自持 1 枚兰帖。通过校验后即**锁定**发起方 1 枚兰帖（发起时锁定但不扣除）。
 * @param {string} relationId
 * @param {string} byPhone 发起方手机号（当事人）
 * @param {{now?:Date|string, has_self_scroll?:boolean, locked_lot_id?:string}} [opts]
 *        `has_self_scroll === false` ⇒ SCROLL_INSUFFICIENT（409）；缺省 = 调用方已在资产事务内校验通过。
 *        `locked_lot_id` = 调用方指定的被锁定道具批次号，**可为空**（缺省 ⇒ `''`）。
 * @returns {Promise<{ok:true, relation_id:string, relation:object, events:object[],
 *   window_open_at:string, locked:{by:string,pieces:number,lot_id:string,at:string}}>}
 *   `locked` = 本次申请占用的道具（**仅占用，未扣除**；调用方据此登记占用，不得扣减）。
 * 拒绝：FRIEND_NOT_FOUND（404）/ FRIEND_STATE_INVALID（409，含 **dissolved 终态** / 缓冲期）/
 *       FRIEND_NOT_PARTY（409）/ **RENEW_ALREADY_PENDING（409，已有 pending 续约申请）** /
 *       NOT_IN_RENEW_WINDOW（409）/ SCROLL_INSUFFICIENT（409）
 */
export async function renewRequest(relationId, byPhone, opts = {}) {
  const id = requireId(relationId);
  const by = normPhone(byPhone);
  if (!by) throw friendError('FRIEND_INVALID_PHONE');
  return withRelationLock(id, async () => {
    const now = resolveNow(opts);
    const at = toIso(now);
    const base = await loadRelation(id);
    const { relation, events } = sweepRelation(base, now);
    if (relation.status === RELATION_STATUS.DISSOLVED) throw terminalReject('发起续约'); // 终态不可逆
    if (relation.status !== RELATION_STATUS.ACTIVE) throw stateReject(relation); // 缓冲期 → 不可发起
    if (!isParty(relation, by)) throw friendError('FRIEND_NOT_PARTY');
    // v4 ②：同一关系已存在 pending 续约申请 ⇒ 结构化拒绝（新码，零写入）
    if (relation.pending && relation.pending.kind === 'renew') throw friendError('RENEW_ALREADY_PENDING');
    if (relation.pending) throw friendError('FRIEND_STATE_INVALID', { message: '已有待确认的邀请申请' });
    const openAt = windowOpenAt(relation);
    if (toMs(now) < toMs(openAt)) {
      const daysLeft = Math.ceil((toMs(relation.expires_at) - toMs(now)) / DAY_MS);
      throw friendError('NOT_IN_RENEW_WINDOW', {
        message: `距到期还有 ${daysLeft} 天，到期前 ${RENEW_WINDOW_DAYS} 天内才可发起续约`,
      });
    }
    if (opts.has_self_scroll === false) throw friendError('SCROLL_INSUFFICIENT');
    // v4 ②：锁定（不扣除）—— 锁信息只存这份关系文档的 pending 内
    const locked = {
      by,
      pieces: LOCKED_PIECES,
      lot_id: normPhone(opts.locked_lot_id),
      at,
    };
    relation.pending = {
      kind: 'renew',
      from_phone: by, // 申请方（锁定方）
      to_phone: otherPhoneOf(relation, by), // 待确认方
      requested_at: at,
      expires_at: isoPlusDays(at, RENEW_TTL_DAYS),
      locked_by: locked.by,
      locked_pieces: locked.pieces,
      locked_lot_id: locked.lot_id,
      locked_at: locked.at,
    };
    const event = pushEvent(relation, {
      at,
      type: 'renew_requested',
      from_status: RELATION_STATUS.ACTIVE,
      to_status: RELATION_STATUS.ACTIVE,
      by,
    });
    const saved = await persistRelation(id, relation);
    return {
      ok: true,
      relation_id: id,
      relation: saved,
      events: [...events, event],
      window_open_at: openAt,
      locked,
    };
  });
}

/**
 * F-5 / v4 ②③：**对方**确认续约 → renewals +1、reward_months +1、expires_at 按 **T0 锚点**重算
 * （T0 + 365 + 30 × reward_months 天）；发起方那枚锁定道具转为**应扣减**（由调用方在资产事务内扣）。
 * 双边各再校一次：`has_self_scroll`（确认方）/ `has_initiator_scroll`（发起方，申请后可能已花掉）
 * 任一不足 ⇒ 409 **整单拒绝、零写入**，申请与锁定保留至超时。
 *
 * v4 ③ 守卫：**只能由关系另一方执行**（发起方自确认 ⇒ RENEW_SELF_CONFIRM）；
 *   dissolved 终态到达后一律拒绝且不复活。
 * @param {string} relationId
 * @param {string} byPhone 待确认方（**必须是申请对象**，不是申请方）
 * @param {{now?:Date|string, has_self_scroll?:boolean, has_initiator_scroll?:boolean}} [opts]
 * @returns {Promise<{ok:true, relation_id:string, relation:object, events:object[],
 *   deduct:{phones:string[], amount_each:number, locked:{by:string,pieces:number,lot_id:string,at:string}}}>}
 *   `deduct` = 调用方应扣的**哪一方、各多少片**：`phones` 双边各扣 `amount_each` 片；
 *   其中 `deduct.locked`（`by` = 发起方）那 1 片即本次申请锁定的那枚（按 `lot_id` 对应）。
 * 拒绝：FRIEND_NOT_FOUND（404）/ FRIEND_STATE_INVALID（409，缓冲期不可续约 / 无申请 / **dissolved 终态**）/
 *       **RENEW_SELF_CONFIRM（409，发起方自确认）** / FRIEND_NOT_PARTY（409，第三方）/ SCROLL_INSUFFICIENT（409）
 */
export async function renewConfirm(relationId, byPhone, opts = {}) {
  const id = requireId(relationId);
  const by = normPhone(byPhone);
  if (!by) throw friendError('FRIEND_INVALID_PHONE');
  return withRelationLock(id, async () => {
    const now = resolveNow(opts);
    const at = toIso(now);
    const base = await loadRelation(id);
    const { relation, events } = sweepRelation(base, now);
    if (relation.status === RELATION_STATUS.DISSOLVED) throw terminalReject('确认续约'); // v4 ③ 终态不可逆
    if (relation.status !== RELATION_STATUS.ACTIVE) throw stateReject(relation); // F-4：缓冲期不可续约
    const req = relation.pending;
    if (!req || req.kind !== 'renew') throw friendError('FRIEND_STATE_INVALID', { message: '没有待确认的续约申请' });
    // v4 ③ 守卫①：只能由关系另一方确认（发起方自确认 ⇒ 结构化拒绝、零写入、锁定保留）
    if (req.from_phone === by) throw friendError('RENEW_SELF_CONFIRM');
    if (req.to_phone !== by) throw friendError('FRIEND_NOT_PARTY', { message: '只有被申请的对方可以确认续约' });
    if (opts.has_self_scroll === false || opts.has_initiator_scroll === false) {
      throw friendError('SCROLL_INSUFFICIENT'); // 409 整单拒绝：零写入，申请与锁定保留至超时
    }
    const locked = lockOf(req); // 发起方那枚锁定道具：确认 ⇒ 由「占用」转为「应扣减」
    relation.renewals = (Number(relation.renewals) || 0) + 1;
    relation.reward_months = (Number(relation.reward_months) || 0) + 1; // 累计成功续约数
    relation.expires_at = baseExpiresAt(relation.created_at, relation.reward_months); // v4 ①：恒锚 T0
    relation.pending = null; // 锁随 pending 一并释放（该枚转为扣减，不再占用）
    const event = pushEvent(relation, {
      at,
      type: 'renew_confirmed',
      from_status: RELATION_STATUS.ACTIVE,
      to_status: RELATION_STATUS.ACTIVE,
      by,
    });
    const saved = await persistRelation(id, relation);
    return {
      ok: true,
      relation_id: id,
      relation: saved,
      events: [...events, event],
      // 调用方在资产事务内扣减：双边各 amount_each 片，其中 locked.by（发起方）那 1 片 = 本次锁定项
      deduct: { phones: [saved.a_phone, saved.b_phone], amount_each: 1, locked },
    };
  });
}

/**
 * F-5 / v4 ②：**对方拒绝** 或 **发起方撤回**待确认的续约申请 ⇒ **解锁**（清空 pending，
 * **不改 expires_at**，**不产生任何流水**，即返回值**不含 deduct**）。
 * 发起方与对方均可调用（`reason` 区分：发起方 = renew_cancelled，对方 = renew_rejected）。
 * @param {{now?:Date|string}} [opts]
 * @returns {Promise<{ok:true, relation_id:string, relation:object, events:object[],
 *   unlocked:{by:string,pieces:number,lot_id:string,at:string}|null}>}
 * 仅 status ∈ {active, grace} 且存在续约申请时可调用；否则 FRIEND_STATE_INVALID
 */
export async function renewCancel(relationId, byPhone, opts = {}) {
  const id = requireId(relationId);
  const by = normPhone(byPhone);
  if (!by) throw friendError('FRIEND_INVALID_PHONE');
  return withRelationLock(id, async () => {
    const now = resolveNow(opts);
    const at = toIso(now);
    const base = await loadRelation(id);
    const { relation, events } = sweepRelation(base, now);
    if (relation.status === RELATION_STATUS.DISSOLVED) throw stateReject(relation); // 终态不可逆
    if (relation.status !== RELATION_STATUS.ACTIVE && relation.status !== RELATION_STATUS.GRACE) {
      throw stateReject(relation);
    }
    if (!isParty(relation, by)) throw friendError('FRIEND_NOT_PARTY');
    const req = relation.pending;
    if (!req || req.kind !== 'renew') throw friendError('FRIEND_STATE_INVALID', { message: '没有待确认的续约申请' });
    const unlocked = lockOf(req); // v4 ②：解锁（仅释放占用，**不产生任何流水**）
    const isInitiator = req.from_phone === by;
    const reason = isInitiator ? 'renew_cancelled' : 'renew_rejected';
    const before = relation.expires_at;
    relation.pending = null;
    relation.expires_at = before; // 显式声明：申请失效 / 取消**不得改变 expires_at**
    const event = pushEvent(relation, {
      at,
      type: 'renew_cancelled',
      from_status: relation.status,
      to_status: relation.status,
      by,
      reason,
    });
    const saved = await persistRelation(id, relation);
    return { ok: true, relation_id: id, relation: saved, events: [...events, event], unlocked };
  });
}

/**
 * F-6：单方解除 —— **任意状态（除 dissolved）**立即终止 → dissolved；不返还已消耗兰帖、历史奖励不追回。
 * 解除同时清空 pending（**锁定随 pending 一并解除**）。
 * @param {string} relationId
 * @param {string} byPhone 当事人（单方即可）
 * @param {{now?:Date|string, reason?:string}} [opts]
 * @returns {Promise<{ok:true, relation_id:string, relation:object, events:object[]}>}
 * 拒绝：FRIEND_NOT_FOUND（404）/ FRIEND_STATE_INVALID（409，已是终态）/ FRIEND_NOT_PARTY（409）
 */
export async function dissolve(relationId, byPhone, opts = {}) {
  const id = requireId(relationId);
  const by = normPhone(byPhone);
  if (!by) throw friendError('FRIEND_INVALID_PHONE');
  return withRelationLock(id, async () => {
    const now = resolveNow(opts);
    const at = toIso(now);
    const base = await loadRelation(id);
    const { relation, events } = sweepRelation(base, now);
    if (relation.status === RELATION_STATUS.DISSOLVED) throw stateReject(relation); // 终态，链不可逆
    if (!isParty(relation, by)) throw friendError('FRIEND_NOT_PARTY');
    const fromStatus = relation.status;
    relation.status = RELATION_STATUS.DISSOLVED;
    relation.pending = null; // v4 ②：解除 ⇒ 锁定随 pending 一并解除（无流水）
    relation.reason = String(opts.reason || 'dissolved_by_party');
    const event = pushEvent(relation, {
      at,
      type: 'dissolved',
      from_status: fromStatus,
      to_status: RELATION_STATUS.DISSOLVED,
      by,
      reason: relation.reason,
    });
    const saved = await persistRelation(id, relation);
    return { ok: true, relation_id: id, relation: saved, events: [...events, event] };
  });
}

/**
 * F-2 列表查询：**只用 colWhere 过滤**（**不另建索引表**）；只读，不落盘。
 * 缺省排除 dissolved（F-4：grace 关系保留、列表可见）；`include_dissolved: true` 时全出。
 * 返回的文档是**内存中 sweep 后**的投影（真源由下一次写路径落盘）。
 * @param {string} phone
 * @param {{now?:Date|string, include_dissolved?:boolean}} [opts]
 * @returns {Promise<object[]>} 按 created_at 升序
 */
export async function listRelations(phone, opts = {}) {
  const p = normPhone(phone);
  if (!p) throw friendError('FRIEND_INVALID_PHONE');
  const now = resolveNow(opts);
  const rows = await colWhere(FRIENDS_COL, (d) => !!d && (d.a_phone === p || d.b_phone === p));
  const out = [];
  for (const row of rows) {
    const { relation } = sweepRelation(row, now);
    if (!relation) continue;
    if (relation.status === RELATION_STATUS.DISSOLVED && !opts.include_dissolved) continue;
    out.push(relation);
  }
  return out.sort((x, y) => toMs(x.created_at) - toMs(y.created_at));
}
