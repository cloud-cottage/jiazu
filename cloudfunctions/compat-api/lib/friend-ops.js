/**
 * 好友域**编排层**（批2-D）—— lib/friends.js（关系状态域）× lib/economy-ledger.js（资产账本域）
 * × 站内信域（`jiazu_messages`）。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 分工（Zang 裁定 v4 / F-A）：
 *   · 本模块**只做编排**：跨域串流程、隐私投影、通知、奖励池均分；
 *   · **所有资产读写一律在 economy-ledger 的 `withAssets` 锁内完成**（本模块**不自写第二版记账**：
 *     不出现资产集合名字面、不写资产文档；扣减只用 `chargeLots`、入账只用
 *     `addFragments` / `addScrollFragments` / `addLot` / `recordTx`）；
 *   · **关系状态读写一律走 friends.js 的导出**（createInvite … dissolve / sweepRelation / isActiveAt）。
 *     唯一例外 = 关系文档的**落盘**（`sweepFriends` 的全量迁移 + 裁定 2 的补偿审计）走本模块的
 *     **唯一私有落盘点 `writeRelationDoc`**（version + 1，与 friends.js 的 `persistRelation` 同律）：
 *     friends.js 不提供「全量遍历」与「追加审计事件」两个导出，而裁定 2 明令补偿须在关系 history 留痕。
 *   · **通知一律复用站内信域**：实测本仓**不存在 `lib/messages.js`**（只有 `messages.test.js`），
 *     通知域的实现落点是 `lib/economy-ops.js`（`jiazu_messages` 单文档 + `withMessages` 串行锁 +
 *     `messageId` / `trimMessages`）。本模块复用其 `withMessages` 写同形 `Message`，
 *     **不另造第二套通知存储**、**不动 economy-ops.js**。
 *
 * 冻结口径（逐条对 F-A…F-H）：
 *   F-B 续约锁定（Kevin 已裁）：发起 → 在 `withAssets` 内校验发起方**自持 ≥ 1 张成品兰帖**
 *       （`Σ scrolls[].qty ≥ 100 片`，1 张 = 一个 qty=100 的 ScrollLot；不足 ⇒ `SCROLL_INSUFFICIENT`，
 *       零写入）→ 通过则把**被锁定的批次 id** 交由 friends.js 记入 `relation.pending.locked_*`
 *       （**只占用、不扣除**），返回值 `locked = { by_masked, pieces, lot_id, at, by_me }` 即可据以扣减；
 *       确认 → **双边各扣 1 张（各 100 片）**，且**发起方扣的正是锁定那一批**（`chargeLots` 口径）；
 *       对方拒绝 / 发起方撤回 / 超 7 天未确认 ⇒ **解锁且零流水**。
 *   F-C 奖励池：① 触发者本人基础奖励照发（石榴籽碎片 +1、竹片 +1 片），**触发者不参与池分配**；
 *       ② 池按**领取时刻快照的「生效中好友数」**均分，**向下取整、余数销毁**（唯一口径 = `isActiveAt`）；
 *       ③ **分母为 0 ⇒ 不建池、不写任何池流水**（本人基础奖励照发）；
 *       ④ 分发路径**不调用任何活动触发逻辑**（收件人收到的碎片**不再触发**新的池分发）；
 *       ⑤ 缓冲期 / 待邀请 / 已解除 / 已到期未 sweep 的 active **一律不计入分母**；
 *       ⑥ 每次分发写**既有枚举** `reward` 的可审计流水（**不新增枚举**），`ref` 形状见 §F-C 注释。
 *   F-D 惰性 sweep：`sweepFriends(now)` 遍历全量关系调 `sweepRelation` 并把**变更落盘**；
 *       **不注册任何定时任务**（源码中无任何定时器 / 周期调度调用）。
 *   F-E 通知五条（邀请发出 / 被接受 / 续约待确认 / 续约成功 / 解除），
 *       `Message.type` 取**既有枚举** `'system'`（总册存储契约：expiring | spirit | market | system）。
 *   F-F 导出名**逐字冻结**，每个导出**返回对象**：成功含 `ok:true` + 中文 `message`；
 *       失败含 `ok:false` + `error`（结构化：`code` / `status` / `message` / 可选 `reason`）+ 中文 `message`。
 *   F-G 列表隐私：`listFriends` **不下发好友明文手机号**，出「昵称 + 脱敏手机号」。
 *   F-H 错误形状沿用本仓惯例（friends.js 的 `friendError` / 本模块 `opsError`：code + status + 中文文案）。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * **批2-D 收尾（本单）三条裁定**：
 *   裁定 3（安全口径 · Z-8）**relation_token 不透明化**：
 *       关系对外一律只下发 `relation_token` = `'fr_' + sha256(关系文档 _id) 前 16 位 hex`；
 *       所有入参字段名一律 `relation_token`（**不再有 `relation_id`**）。反查 = 对关系集合
 *       **逐份做同样 hash 比对**（`resolveRelationToken`，**零新增存储**：不建索引、不落映射表）。
 *       出参侧同时把关系文档的 `a_phone` / `b_phone` / `pending.from_phone|to_phone` /
 *       `history[].by` / `events[].by` / `deduct.locked.by` 一律脱敏（`maskPhone`）——
 *       换言之外部再也拿不到任何 11 位明文手机号（测试以正则 `1[3-9]\d{9}` 扫全部出参 JSON）。
 *   裁定 1（可审计）**续约双边扣减各写一笔账本流水**：`Tx.type = 'scroll_consume'`
 *       （兰帖消耗的自有类型，**不冒充** `reward` / `fee_refund`），`delta = { scrolls: -100 }`
 *       （本仓兰帖计量单位 = **片**，照既有 `scroll_decompose` 的 `delta.scrolls` 键名），
 *       `ref = { source:'friend_renew', relation_token, peer_masked, role }`；
 *       冲正仍只用**既有枚举** `fee_refund`（§4-6 尾注：唯一允许的冲正类型）。
 *   裁定 2（原子性）**双边扣减必须补偿**：第二笔 `withAssets` 失败 ⇒ 对第一笔**补偿回写**
 *       （同 lot id 原样还原片数 ⇒ lot 明细逐字节回到开工前）＋ 关系 history 记一笔补偿审计
 *       （`type = 'renew_deduct_rollback'`）＋ 冲正流水 `fee_refund`；**只有补偿本身也失败**
 *       才返回 `RENEW_DEDUCT_PARTIAL`（那才是需人工介入）。补偿成功时返回
 *       `RENEW_DEDUCT_ROLLED_BACK`（409，**无单向扣减**）。
 *
 * **本单修正（两处收口 · Zang 裁定）**：
 *   ① **执行序列改为「先资产、后关系」**（原为「先推进关系、后双边扣减」⇒ 扣减失败时关系已推进且不可回退，
 *      存在账实不符残窗）：
 *      ⓪ 双边预检（只读 `getAssets`；任一不足 ⇒ `SCROLL_INSUFFICIENT`，零写入）；
 *      ① 只读读计划（`listRelations` 取 `pending` 的发起方与锁定批次 ⇒ 扣减顺序 + `deduct` 出参；不写关系文档）；
 *      ② **先双边扣减**（各自 `withAssets` 内 `chargeLots` + 各一笔 `scroll_consume` 流水）；
 *         任一笔失败 ⇒ 对**已扣方**补偿回写；补偿成功 ⇒ `RENEW_DEDUCT_ROLLED_BACK`,
 *         **补偿也失败** ⇒ `RENEW_DEDUCT_PARTIAL`（需人工核对）；
 *      ③ 扣减全部成功**后**才推进关系状态（`renewConfirm`：renewals +1、`expires_at` 按
 *         `T0 + 365 + 30 × reward_months` 重算、`pending` 清空 ⇒ 解锁）；
 *      ④ 最后写审计（关系 history）与发通知。
 *      硬口径：**扣减失败且补偿成功 ⇒ 关系文档零变更**（version 不变、renewals 不增、`expires_at` 不变、
 *      `pending` 保留、锁保留 —— ③ 从未执行）；用户可稍后重试确认。
 *   ② **`TX_TYPES` 白名单并回字面**：`'scroll_consume'` 已在 `lib/economy-ledger.js` 的 `TX_TYPES`
 *      **数组字面**内正式登记（追加一段注释说明其归属）；本模块原先的**一次性 `push` 登记已删除**
 *      —— 运行期 `push` 会构成第二套真源。**本模块不再对白名单做任何运行期写入**（单测含源码判据）。
 *
 * 已知残留（如实登记，不静默处理）：
 *   · 账本锁粒度 = **单手机号**，账本不提供跨用户事务 ⇒ 双边扣减由两次 `withAssets` 串行完成；
 *     跨集合（关系集合 × 资产集合）无事务 API ⇒ 靠「先资产、后关系 + 补偿回滚」收口。
 *   · **跨用户写入不得嵌套在他人事务内**（否则 A↔B 互锁死锁）⇒ 奖励池的「一次分发」靠
 *     `opts.idempotency_key`（账本自证判重，见 `distributeFriendRewards`）保证幂等，而不是靠同锁。
 *   · ③ 之后（关系已推进、双边已扣）不再有可回退窗口：② 已成、③ 只会向前；③ 若在并发窗口内抛错，
 *     本模块对**双边**补偿回写（关系未落盘 ⇒ 零变更），并原样抛出 friends.js 的结构化拒绝。
 *   · 补偿审计写关系 history 时**不递增 `version`**（本单硬口径「关系文档版本零变更」）；
 *     关系域 CAS 版本号仍由 friends.js 的 `persistRelation`（version +1）在关系锁内独占维护。
 *   · 路由层响应壳由 `cloudfunctions/compat-api/index.js` 统一为 `{ ok, message, data }`（见该文件注释）。
 *
 * 数据安全：所有单测把 `COMPAT_OUT_DIR` / `COMPAT_META_FILE` 指向 /tmp 副本（照 friends.test.js）。
 */

import crypto from 'node:crypto';
import { colAll, colGet, colSet } from './store.js';
import {
  BASE_DAYS,
  FRIEND_ERRORS,
  FRIENDS_COL,
  LOCKED_PIECES,
  RELATION_STATUS,
  RENEWAL_REWARD_DAYS,
  acceptInvite,
  cancelInvite,
  createInvite,
  dissolve,
  friendError,
  isActiveAt,
  listRelations,
  otherPhoneOf,
  rejectInvite,
  renewCancel,
  renewConfirm,
  renewRequest,
  sweepRelation,
  windowOpenAt,
} from './friends.js';
import {
  SCROLL_PIECES_PER_SCROLL,
  SOURCE_FRIEND_REWARD,
  // 注：不再导入 `TX_TYPES` —— 白名单真源**只在** economy-ledger.js 的数组字面内，
  //     本模块绝不运行期追加（原一次性幂等 push 已按裁定删除）。
  addFragments,
  addLot,
  addScrollFragments,
  chargeLots,
  getAssets,
  recordTx,
  sumLots,
  toNonNegInt,
  withAssets,
} from './economy-ledger.js';
import { USERS_COL, messageId, trimMessages, withMessages } from './economy-ops.js';

const DAY_MS = 86400000;

const norm = (v) => String(v ?? '').trim();
const toIso = (d) => new Date(d).toISOString();
const toMs = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

// ==================== 批2-D 收尾 · 流水类型与来源（裁定 1） ====================

/**
 * 裁定 1：续约消耗的**自有**流水类型（兰帖消耗必须留痕，**不冒充** `reward` / `fee_refund`）。
 *
 * **登记落点 = 真源唯一**：该取值已在 `lib/economy-ledger.js` 的 `TX_TYPES` **数组字面**内正式登记
 * （带归属注释），本模块**只作字面引用**，**不再做任何运行期白名单追加**
 * （运行期向 `TX_TYPES` 追加 = 第二套真源，本单已删除该段）。记账仍**唯一**走 ledger 的 `recordTx`。
 */
export const TX_TYPE_SCROLL_CONSUME = 'scroll_consume';

/** 裁定 1：续约扣减的流水来源（`Tx.ref.source`） */
export const SOURCE_FRIEND_RENEW = 'friend_renew';
/** 裁定 2：补偿回写的流水来源（`Tx.ref.source`；类型复用既有 `fee_refund`） */
export const SOURCE_FRIEND_RENEW_ROLLBACK = 'friend_renew_rollback';
/** 裁定 2：冲正流水类型 = **既有枚举**（§4-6 尾注：唯一允许的冲正类型，不新增） */
export const TX_TYPE_ROLLBACK = 'fee_refund';
/** 裁定 2：关系 history 里的补偿审计事件类型（关系域自定，非 Tx 枚举） */
export const RELATION_AUDIT_ROLLBACK = 'renew_deduct_rollback';

/**
 * ⚠️⚠️ **仅测试用（TEST ONLY）—— 生产中本对象恒为 `null`，业务 / 路由代码一律不得写入本字段。** ⚠️⚠️
 *
 * 用途：裁定 2 的原子性用例需要「第二次扣减**可控失败**」。ESM 命名空间不可改（无法 stub 掉
 * ledger 的 `withAssets`），故由本模块自持这个显式注入点：测试置为非空函数即在该次扣减前执行
 * （可抛错，模拟并发窗口下资产被扣尽）。**默认值为 `null` ⇒ 生产行为一字不变**；
 * 单测 ⑳ 含默认值判据（`assert.equal(TEST_ONLY_HOOK.beforeCharge, null)`）。
 * 任何业务代码（含 index.js 路由层）**不得**读写本对象 —— 它是测试夹具，不是业务开关。
 */
export const TEST_ONLY_HOOK = { beforeCharge: null, beforeRewardGrant: null };

// ==================== F-H：编排层结构化错误（沿用本仓形状） ====================

/** 编排层自有错误码（关系域错误码一律走 friends.js 的 FRIEND_ERRORS，不重复定义） */
export const FRIEND_OPS_ERRORS = {
  /** 入参不合法（amounts / 手机号缺失等编排层前置校验） */
  FRIEND_OPS_INVALID_INPUT: { status: 400, message: '参数不合法' },
  /**
   * 裁定 2：双边扣减只完成一方且**补偿也失败** —— 这才是需人工介入的单向扣减。
   * 补偿成功的情形一律返回 `RENEW_DEDUCT_ROLLED_BACK`（下方），**不得**用本码。
   */
  RENEW_DEDUCT_PARTIAL: { status: 409, message: '续约扣减仅完成一方且补偿失败，需人工核对' },
  /** 裁定 2：双边扣减第二笔失败，已对第一笔**全额补偿回写** ⇒ 无单向扣减（保留 409 语义） */
  RENEW_DEDUCT_ROLLED_BACK: { status: 409, message: '续约扣减失败，已补偿回滚（无单向扣减）' },
};

/** 编排层结构化拒绝（形状与 friends.js 的 friendError 一致：status + code + 中文文案） */
export function opsError(code, patch = {}) {
  const spec = FRIEND_OPS_ERRORS[code];
  if (!spec) throw new Error(`未知好友编排域错误码：${code}`);
  const e = new Error(patch.message || spec.message);
  e.status = patch.status || spec.status;
  e.code = code;
  if (patch.reason !== undefined) e.reason = patch.reason;
  if (patch.detail !== undefined) e.detail = patch.detail;
  return e;
}

/** 异常 → **安全摘要**（绝不把系统级错误文本 / 本机绝对路径写进出参，同 index.js 的 isSystemFailure 判据） */
const SYS_ERRNO_RE = /(?:EACCES|EPERM|ENOENT|EEXIST|EISDIR|ENOTDIR|EROFS|EIO|ENOSPC|ENOTEMPTY|EBUSY|ELOOP|EMFILE|ENFILE|ENAMETOOLONG)/;
const LOCAL_PATH_RE = /\/(?:Users|tmp|var|private|home|opt|etc|usr)\//;
function safeReason(e) {
  const code = norm(e?.code) || 'ASSET_INSUFFICIENT';
  const raw = norm(e?.message);
  const unsafe = SYS_ERRNO_RE.test(norm(e?.name) || code) || LOCAL_PATH_RE.test(raw) || SYS_ERRNO_RE.test(raw);
  return { code, message: unsafe ? '资产扣减或回写失败（系统级，详见服务端日志）' : raw };
}

/**
 * F-F：统一返回壳 —— 成功 `{ ok:true, message, ...data }`；
 * 失败 `{ ok:false, error:{ code, status, message, reason? }, message }`（**不抛**，路由据 `ok` 分支）。
 */
async function runOp(fn, okMessage) {
  try {
    const data = await fn();
    return { ok: true, message: okMessage, ...(data || {}) };
  } catch (e) {
    const error = {
      code: e?.code || 'FRIEND_OPS_FAILED',
      status: Number(e?.status) || 409,
      message: e?.message || '好友域操作失败',
    };
    if (e?.reason !== undefined) error.reason = e.reason;
    if (e?.detail !== undefined) error.detail = e.detail;
    return { ok: false, error, message: error.message };
  }
}

// ==================== F-G：隐私投影（脱敏 / 昵称） ====================

/**
 * F-G 脱敏手机号：≥ 7 位 ⇒ 前 3 位 + `****` + 后 4 位（11 位手机号得 `137****1234`）；
 * 更短的非空串 ⇒ 首字符 + `****`；空串 ⇒ 空串。**绝不下发明文**。
 */
export function maskPhone(phone) {
  const p = norm(phone);
  if (!p) return '';
  if (p.length >= 7) return `${p.slice(0, 3)}****${p.slice(-4)}`;
  return `${p.slice(0, 1)}****`;
}

/** 昵称（`jiazu_users` 一人一文档，`_id` = 手机号）；拿不到 ⇒ `''`（不臆造） */
async function nicknameOf(phone) {
  const p = norm(phone);
  if (!p) return '';
  const doc = await colGet(USERS_COL, p);
  return norm(doc?.nickname);
}

/** 展示名：有昵称 ⇒ 昵称；无昵称 ⇒ 脱敏串（F-G「若拿不到昵称只出脱敏串」） */
async function displayNameOf(phone) {
  const nickname = await nicknameOf(phone);
  return nickname || maskPhone(phone);
}

// ==================== F-E：通知（复用站内信域，type 取既有枚举 `system`） ====================

/** `Message.type` 逐字取值：既有枚举（总册存储契约 expiring | spirit | market | system），**不新增** */
export const FRIEND_NOTICE_TYPE = 'system';

/** 五条通知的 title 与正文模板（取词照 economy-ops.js 的【】+ 全角标点体例）；`{name}` = 对方展示名 */
export const FRIEND_NOTICE = {
  invite_sent: {
    title: '好友邀请',
    text: (name) => `【好友邀请】${name} 邀请你成为好友，请于 7 天内到好友列表确认。`,
  },
  invite_accepted: {
    title: '好友邀请已接受',
    text: (name) => `【好友邀请】${name} 已接受你的好友邀请，关系自接受之日起生效 ${BASE_DAYS} 天。`,
  },
  renew_pending: {
    title: '好友续约待确认',
    text: (name) => `【好友续约】${name} 发起续约申请（已锁定 ${LOCKED_PIECES} 张兰帖），请于 7 天内确认。`,
  },
  renew_confirmed: {
    title: '好友续约成功',
    text: (name) =>
      `【好友续约】你与 ${name} 的续约已生效，有效期延长 ${RENEWAL_REWARD_DAYS} 天（双方各消耗 ${LOCKED_PIECES} 张兰帖）。`,
  },
  dissolved: {
    title: '好友关系已解除',
    text: (name) => `【好友解除】你与 ${name} 的好友关系已解除。`,
  },
};

/**
 * F-E：发一条站内信（**唯一写入路径 = 站内信域的 `withMessages`**，不另造存储）。
 * 落库形状与 `economy-ops.js` 的 `putWarnings` 逐字一致：
 * `{ id, type, title, text, created_at, read }`；写后按 `MESSAGE_KEEP_LIMIT`（200）裁剪。
 */
async function notify(phone, kind, otherPhone, now) {
  const tpl = FRIEND_NOTICE[kind];
  if (!tpl) return null;
  const to = norm(phone);
  if (!to) return null;
  const name = await displayNameOf(otherPhone);
  return withMessages((doc, ctx) => {
    doc.items[to] = doc.items[to] || [];
    const item = {
      id: messageId(),
      type: FRIEND_NOTICE_TYPE,
      title: tpl.title,
      text: tpl.text(name),
      created_at: toIso(now),
      read: false,
    };
    doc.items[to].push(item);
    doc.items[to] = trimMessages(doc.items[to]);
    ctx.dirty = true;
    return item;
  });
}

// ==================== 关系 id ↔ 当事人（F-2 冻结：`_id` = `A:B` 升序） ====================

/** 从关系 id 拆出双方手机号（非 `A:B` 两段 ⇒ FRIEND_NOT_FOUND；**不臆造解析规则**） */
function pairOf(relationId) {
  const id = norm(relationId);
  const parts = id.split(':').map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2) throw friendError('FRIEND_NOT_FOUND');
  return parts;
}

// ==================== 裁定 3：relation_token（对外不透明句柄，Z-8） ====================

/** 句柄前缀（对外唯一标识；出参**不得**再出现 `relation_id`，也不得出现任何明文手机号） */
export const RELATION_TOKEN_PREFIX = 'fr_';
/** 句柄形状（前缀 + 16 位小写 hex） */
const RELATION_TOKEN_RE = /^fr_[0-9a-f]{16}$/;

/**
 * 关系 id → 对外句柄：`relation_token = 'fr_' + sha256(关系文档 _id) 前 16 位 hex`。
 * **零新增存储**（无盐、无映射表、无索引）：token 由 `_id` 单向派生，反查即对关系集合逐份重算比对。
 * @param {string} relationId 关系文档 `_id`（= 双方手机号升序拼 `A:B`，**含明文手机号，仅限内部**）
 * @returns {string} `fr_` + 16 位 hex
 */
export function relationTokenOf(relationId) {
  const id = norm(relationId);
  return RELATION_TOKEN_PREFIX + crypto.createHash('sha256').update(id, 'utf8').digest('hex').slice(0, 16);
}

/**
 * 裁定 3 反查：`relation_token` → 关系文档 `_id`（**零新增存储**：遍历关系集合逐份 hash 比对）。
 * 形状不符（非 `fr_` + 16 hex）⇒ 直接 404，不做无谓遍历；集合内无命中 ⇒ `FRIEND_NOT_FOUND`（404）。
 * 越权由 friends.js 的当事人守卫兜底（`FRIEND_NOT_PARTY` ⇒ 403），句柄本身不含任何身份信息。
 */
export async function resolveRelationToken(relationToken) {
  const token = norm(relationToken);
  if (!RELATION_TOKEN_RE.test(token)) throw friendError('FRIEND_NOT_FOUND');
  const docs = await colAll(FRIENDS_COL);
  for (const doc of docs) {
    if (doc && typeof doc === 'object' && norm(doc._id) && relationTokenOf(doc._id) === token) return norm(doc._id);
  }
  throw friendError('FRIEND_NOT_FOUND');
}

/**
 * 裁定 3 出参投影：关系文档**对外脱敏**。
 * 剥掉 `a_phone` / `b_phone` 明文（只留 `a_phone_masked` / `b_phone_masked`）、
 * `pending` 走隐私投影（只出「谁发起（相对本人）+ 时刻 + 锁定标记」）、
 * `history[].by` 一律脱敏。**落库仍是明文**（内部审计需要），只收口出参。
 */
function projectRelation(relation, me) {
  if (!relation || typeof relation !== 'object') return null;
  const out = { ...relation };
  // 关系文档 `_id` = 双方手机号升序拼 `A:B`（**内嵌明文手机号**）⇒ 出参只留不透明句柄
  out.relation_token = relationTokenOf(relation._id);
  delete out._id;
  out.a_phone_masked = maskPhone(relation.a_phone);
  out.b_phone_masked = maskPhone(relation.b_phone);
  delete out.a_phone;
  delete out.b_phone;
  if (out.pending !== undefined) out.pending = projectPending(relation.pending, me);
  out.history = (Array.isArray(relation.history) ? relation.history : []).map((e) => ({ ...e, by: maskPhone(e?.by) }));
  return out;
}

/** 裁定 3：friends.js 的迁移事件出参脱敏（`by` 是明文手机号 ⇒ 只出 `by_masked`） */
function projectEvents(events) {
  return (Array.isArray(events) ? events : []).map((e) => ({
    at: norm(e?.at),
    type: norm(e?.type),
    from_status: norm(e?.from_status),
    to_status: norm(e?.to_status),
    by_masked: maskPhone(e?.by),
    reason: norm(e?.reason),
  }));
}

/** 裁定 3：锁定视图出参（`locked.by` 是明文手机号 ⇒ 只出 `by_masked` + `by_me`） */
function projectLock(locked, me) {
  if (!locked || typeof locked !== 'object') return null;
  return {
    pieces: toNonNegInt(locked.pieces),
    lot_id: norm(locked.lot_id),
    at: norm(locked.at),
    by_masked: maskPhone(locked.by),
    by_me: norm(locked.by) === norm(me),
  };
}

// ==================== 关系文档落盘点（唯一） + 审计追加 ====================

/**
 * 关系文档的**唯一私有落盘点**（默认 version + 1，与 friends.js 的 `persistRelation` 同律）。
 * 先例 = `sweepFriends` 的全量迁移落盘；裁定 2 的补偿审计复用同一落盘点。
 * friends.js 无「追加审计事件」导出，故本模块自持这一处（**不得**再开第二个写点）。
 *
 * `opts.bump_version === false`：**只追加内容、不动 version**。这是本单硬口径「扣减失败且补偿成功 ⇒
 * 关系文档零变更（version 不变）」的落点 —— 补偿审计是该情形下**唯一**的关系文档写入，
 * 且不得被误读为「关系状态已推进一个版本」。关系域 CAS 版本号仍由 friends.js 在关系锁内独占维护。
 * @param {object} relation 关系文档（含 `_id`）
 * @param {{bump_version?:boolean}} [opts]
 */
async function writeRelationDoc(relation, opts = {}) {
  const bump = opts.bump_version !== false;
  const next = bump
    ? { ...relation, version: (Number(relation.version) || 0) + 1 }
    : { ...relation };
  await colSet(FRIENDS_COL, next._id, next);
  return next;
}

/**
 * 裁定 2：追加一条**关系文档审计事件**（补偿必须留痕在关系 history）。
 * 事件形状照 friends.js 的 `pushEvent` 五键（`at` / `type` / `from_status` / `to_status` / `by`）
 * ＋ 本模块 `detail`（**不含任何明文手机号**：脱敏号 + relation_token）。
 * 关系文档不存在 ⇒ 返回 `null`（不臆造文档）。
 * `opts.bump_version === false` ⇒ 本单硬口径「关系文档零变更」的补偿审计写入（见上）。
 */
async function appendRelationAudit(relationId, event, opts = {}) {
  const doc = await colGet(FRIENDS_COL, relationId);
  if (!doc || typeof doc !== 'object' || !norm(doc._id)) return null;
  const next = JSON.parse(JSON.stringify(doc));
  next.history = Array.isArray(next.history) ? next.history : [];
  const e = {
    at: event.at,
    type: event.type,
    from_status: event.from_status || '',
    to_status: event.to_status || '',
    by: event.by || '',
    reason: event.reason || '',
  };
  if (event.detail !== undefined) e.detail = event.detail;
  next.history.push(e);
  await writeRelationDoc(next, opts);
  return e;
}

// ==================== F-G：列表（只读，不下发好友明文手机号） ====================

/** `pending` 的**隐私投影**：只出「谁发起（相对本人）+ 时刻 + 锁定片数」，**不出对端明文手机号** */
function projectPending(pending, me) {
  if (!pending || typeof pending !== 'object') return null;
  const out = {
    kind: norm(pending.kind),
    requested_at: norm(pending.requested_at),
    expires_at: norm(pending.expires_at),
    initiated_by_me: norm(pending.from_phone) === me,
  };
  if (pending.kind === 'renew') {
    out.locked = {
      pieces: toNonNegInt(pending.locked_pieces),
      at: norm(pending.locked_at),
      by_me: norm(pending.locked_by) === me,
    };
  }
  return out;
}

/**
 * F-G 好友列表：只读（不落盘；sweep 投影由 `listRelations` 在内存完成）。
 * 出参每条 = 关系运行态 + `friend: { nickname, phone_masked, display_name }`；
 * **裁定 3：标识一律走 `relation_token`**，全文**不出现任何明文手机号**（含 `_id` / `pending` / `history`）。
 * @param {string} phone
 * @param {Date|string} [now]
 * @returns {Promise<{ok:true, message:string, friends:object[], count:number}>}
 */
export async function listFriends(phone, now = new Date()) {
  return runOp(async () => {
    const me = norm(phone);
    if (!me) throw friendError('FRIEND_INVALID_PHONE');
    const nowMs = toMs(now);
    const relations = await listRelations(me, { now });
    const friends = [];
    for (const r of relations) {
      const other = otherPhoneOf(r, me);
      const nickname = await nicknameOf(other);
      const masked = maskPhone(other);
      const active = isActiveAt(r, now);
      friends.push({
        // 裁定 3：对外唯一标识 = 不透明句柄（**不下发** 关系文档 `_id`）
        relation_token: relationTokenOf(r._id),
        status: r.status,
        active,
        created_at: norm(r.created_at),
        expires_at: norm(r.expires_at),
        grace_until: norm(r.grace_until),
        reward_months: toNonNegInt(r.reward_months),
        renewals: toNonNegInt(r.renewals),
        window_open_at: r.status === RELATION_STATUS.ACTIVE ? windowOpenAt(r) : '',
        days_left: r.expires_at ? Math.ceil((toMs(r.expires_at) - nowMs) / DAY_MS) : null,
        pending: projectPending(r.pending, me),
        friend: { nickname, phone_masked: masked, display_name: nickname || masked },
      });
    }
    return { friends, count: friends.length };
  }, '好友列表获取成功');
}

// ==================== 邀请（F-4 / F-7） ====================

/**
 * 发起好友邀请（关系域 `createInvite` + 通知被邀请人「好友邀请」）。
 * @param {string} from 发起方手机号（登录身份）
 * @param {string} to 被邀请人手机号（入参；**唯一**需要明文的一方，故入参名就叫 `to`）
 * @returns {Promise<{ok:true, relation_token:string, relation:object, invite:object}>}
 *   `invite = { to_masked, expires_at }`（**不出被邀请人明文手机号**）
 */
export async function sendFriendInvite(from, to, now = new Date()) {
  return runOp(async () => {
    const res = await createInvite(from, to, { now });
    const notice = await notify(res.relation.pending?.to_phone, 'invite_sent', res.relation.pending?.from_phone, now);
    return {
      relation_token: relationTokenOf(res.relation_id),
      relation: projectRelation(res.relation, norm(from)),
      events: projectEvents(res.events),
      invite: {
        to_masked: maskPhone(res.relation.pending?.to_phone),
        expires_at: norm(res.relation.pending?.expires_at),
      },
      notice_id: notice?.id || '',
    };
  }, '好友邀请已发出');
}

/** 被邀请人接受邀请（`acceptInvite` + 通知发起人「好友邀请已接受」） */
export async function acceptFriendInvite(relationToken, by, now = new Date()) {
  return runOp(async () => {
    const me = norm(by);
    const relationId = await resolveRelationToken(relationToken);
    const res = await acceptInvite(relationId, me, { now });
    const notice = await notify(otherPhoneOf(res.relation, me), 'invite_accepted', me, now);
    return {
      relation_token: relationTokenOf(res.relation_id),
      relation: projectRelation(res.relation, me),
      events: projectEvents(res.events),
      notice_id: notice?.id || '',
    };
  }, '好友邀请已接受');
}

/** 被邀请人拒绝邀请（`rejectInvite`；F-E 五条通知不含此条 ⇒ 不发通知） */
export async function rejectFriendInvite(relationToken, by, now = new Date()) {
  return runOp(async () => {
    const me = norm(by);
    const relationId = await resolveRelationToken(relationToken);
    const res = await rejectInvite(relationId, me, { now });
    return {
      relation_token: relationTokenOf(res.relation_id),
      relation: projectRelation(res.relation, me),
      events: projectEvents(res.events),
      notice_id: '',
    };
  }, '好友邀请已拒绝');
}

/** 发起方撤回邀请（`cancelInvite`；同上不发通知） */
export async function cancelFriendInvite(relationToken, by, now = new Date()) {
  return runOp(async () => {
    const me = norm(by);
    const relationId = await resolveRelationToken(relationToken);
    const res = await cancelInvite(relationId, me, { now });
    return {
      relation_token: relationTokenOf(res.relation_id),
      relation: projectRelation(res.relation, me),
      events: projectEvents(res.events),
      notice_id: '',
    };
  }, '好友邀请已撤回');
}

// ==================== F-B：续约（锁定 → 双边扣减 / 解锁） ====================

/**
 * F-B 发起续约：**在 `withAssets` 锁内**校验发起方自持 ≥ 1 张成品兰帖
 * （`Σ scrolls[].qty ≥ 100` 片 = 1 张；不足 ⇒ `SCROLL_INSUFFICIENT`，零写入），
 * 并把「将被锁定的批次 id」记入关系文档 `pending.locked_*`（**只占用、不扣除**）。
 *
 * **本单 TOCTOU 收口（①+② 同一事务）**：可用性判定（自持 ≥ 1 张）+ 锁批次选取 + **关系侧落锁**
 * 全部在**同一次** `withAssets(me, …)` 内完成 —— 「判定 → 落锁」之间不再有第二个窗口
 * （判定通过后资产被并发扣光时，不会留下「锁已落下但那一批早已不存在」的错位）。
 * `withAssets` 的语义：mutator 抛错 ⇒ 资产一字节不回写；关系侧 IO 在同一事务内抛错亦然。
 * @returns {Promise<{ok:true, relation_token, relation, locked:{pieces,lot_id,at,by_masked,by_me}, window_open_at}>}
 *   `locked` = 可据以扣减的信息：`pieces` = 1、`lot_id` = 被锁定的兰帖批次、`at` = 锁定时刻（**无明文手机号**）。
 */
export async function requestRenewal(relationToken, by, now = new Date()) {
  return runOp(async () => {
    const me = norm(by);
    if (!me) throw friendError('FRIEND_INVALID_PHONE');
    const relationId = await resolveRelationToken(relationToken);
    // ①+② **同一资产事务**（唯一写入口 = ledger 的 withAssets）：
    //   资产侧校验（不足即抛，一字节不回写）→ 取锁定批次 → 关系侧落锁（`pending.locked_*`）
    const out = await withAssets(me, async (user) => {
      const total = sumLots(user.scrolls);
      if (total < SCROLL_PIECES_PER_SCROLL) {
        throw friendError('SCROLL_INSUFFICIENT', {
          message: `兰帖不足，续约需自持 ${LOCKED_PIECES} 张成品兰帖（当前 ${Math.floor(total / SCROLL_PIECES_PER_SCROLL)} 张）`,
        });
      }
      // FIFO 口径与 chargeLots 一致：兰帖批次恒永久（expires_at 全为 null）⇒ 取第一个 qty > 0 的批次
      const lot = (user.scrolls || []).find((l) => l && toNonNegInt(l.qty) > 0);
      const held = { lot_id: lot ? norm(lot.id) : '', avail_pieces: total };
      // 关系侧：锁定（friends.js 只写状态与 pending.locked_*，不碰资产）
      const locked = await renewRequest(relationId, me, {
        now,
        has_self_scroll: true,
        locked_lot_id: held.lot_id,
      });
      return { held, locked };
    });
    const held = out.held;
    const res = out.locked;
    // ③ 通知对方「续约待确认」
    const notice = await notify(otherPhoneOf(res.relation, me), 'renew_pending', me, now);
    return {
      relation_token: relationTokenOf(res.relation_id),
      relation: projectRelation(res.relation, me),
      events: projectEvents(res.events),
      locked: projectLock(res.locked, me),
      window_open_at: res.window_open_at,
      avail_pieces: held.avail_pieces,
      notice_id: notice?.id || '',
    };
  }, '续约申请已发出（已锁定 1 张兰帖，未扣除）');
}

/**
 * 裁定 2 补偿回写（**原子性**）：把**已扣批次**原样还原（同一 lot id、同一片数 ⇒ lot 明细逐字节一致），
 * 并写一条**既有枚举** `fee_refund` 的冲正流水。
 * 极端情形（该批次已被惰性 sweep 剔除，理论上不发生：补偿紧随扣减）⇒ 以原 id / 原 `expires_at` 重建批次。
 * @returns {Promise<{ok:true, restored:object[], total:number, refund_tx_id:string}|{ok:false, error:{code,message}}>}
 */
async function rollbackCharged(entry, ctx) {
  const { now, token, peerMasked, reason } = ctx;
  try {
    return await withAssets(entry.phone, (user) => {
      const restored = [];
      for (const t of entry.taken) {
        const lot = (user.scrolls || []).find((l) => l && norm(l.id) === norm(t.id));
        if (lot) {
          lot.qty = toNonNegInt(lot.qty) + toNonNegInt(t.qty);
          restored.push({ lot_id: norm(t.id), qty: toNonNegInt(t.qty), recreated: false });
        } else {
          user.scrolls = user.scrolls || [];
          user.scrolls.push({
            id: t.id,
            qty: toNonNegInt(t.qty),
            expires_at: t.expires_at ?? null,
            source: SOURCE_FRIEND_RENEW_ROLLBACK,
            created_at: toIso(now),
          });
          restored.push({ lot_id: norm(t.id), qty: toNonNegInt(t.qty), recreated: true });
        }
      }
      const tx = recordTx(
        user,
        {
          type: TX_TYPE_ROLLBACK,
          delta: { scrolls: entry.pieces },
          ref: {
            source: SOURCE_FRIEND_RENEW_ROLLBACK,
            relation_token: token,
            peer_masked: peerMasked,
            reason,
            reversed_tx: entry.tx_id,
          },
          desc: `续约扣减补偿：还原 ${entry.pieces} 片成品兰帖（原扣流水 ${entry.tx_id}）`,
        },
        now,
      );
      return { ok: true, restored, total: sumLots(user.scrolls || []), refund_tx_id: tx.id };
    });
  } catch (e) {
    const s = safeReason(e);
    return { ok: false, restored: [], error: { code: s.code, message: s.message } };
  }
}

/**
 * **本单修正 ①**：确认续约的**只读读计划**（不写关系文档）。
 *
 * 用途：新执行序列要求**先双边扣减、后推进关系**，故扣减前必须先知道「谁是发起方、锁的是哪一批、
 * 关系当前处于什么状态」。计划来源 = friends.js 的只读导出 `listRelations`（内存 sweep，零落盘；
 * `include_dissolved: true` 只为把 dissolved 关系读出来当作**终态守卫**判据，不产生任何写入）。
 *
 * 守卫按 friends.js 的 `renewConfirm` **逐条只读复述**（错误码一字不改：`FRIEND_STATE_INVALID` /
 * `RENEW_SELF_CONFIRM` / `FRIEND_NOT_PARTY`）—— **这不是第二套状态写**：真正的关系状态写仍唯一在
 * `renewConfirm`；此处只把「必然会拒」的调用**挡在扣减之前**，以免白扣一笔。
 * 复述与真实状态若有偏差（并发窗口），后续 `renewConfirm` 抛错 ⇒ 对双边补偿回写（见 confirmRenewal ③）。
 * @returns {Promise<{initiator:string, amount_each:number, locked:object, status:string}>}
 */
async function renewPlanOf(relationId, me, now) {
  const rows = await listRelations(me, { now, include_dissolved: true });
  const rel = rows.find((r) => r && norm(r._id) === norm(relationId));
  if (!rel) throw friendError('FRIEND_NOT_FOUND');
  if (rel.status === RELATION_STATUS.DISSOLVED) {
    throw friendError('FRIEND_STATE_INVALID', { message: '关系已解除（终态不可逆），不能确认续约', reason: 'dissolved_terminal' });
  }
  if (rel.status !== RELATION_STATUS.ACTIVE) throw friendError('FRIEND_STATE_INVALID');
  const req = rel.pending;
  if (!req || req.kind !== 'renew') throw friendError('FRIEND_STATE_INVALID', { message: '没有待确认的续约申请' });
  if (norm(req.from_phone) === me) throw friendError('RENEW_SELF_CONFIRM'); // 发起方自确认
  if (norm(req.to_phone) !== me) throw friendError('FRIEND_NOT_PARTY', { message: '只有被申请的对方可以确认续约' });
  return {
    initiator: norm(req.from_phone),
    amount_each: LOCKED_PIECES,
    locked: {
      by: norm(req.from_phone),
      pieces: toNonNegInt(req.locked_pieces),
      lot_id: norm(req.locked_lot_id),
      at: norm(req.locked_at),
    },
    status: rel.status,
  };
}

/**
 * F-B 确认续约：**双边各扣 1 张成品兰帖（各 100 片）**，发起方扣的正是本次锁定那一批。
 *
 * **执行序列（本单修正：先资产、后关系）**：
 *   ⓪ 双边预检（只读快照，任一不足 ⇒ `SCROLL_INSUFFICIENT` **零写入**，申请与锁定保留至超时）；
 *   ① 只读读计划（`listRelations` 取 `pending`：发起方 / 锁定批次 ⇒ 扣减顺序与 `deduct` 出参；
 *      **不写关系文档**；守卫按 friends.js **只读复述**，真正的状态写仍唯一在 `renewConfirm`）；
 *   ② **先双边扣减**：各自 `withAssets` 内 `chargeLots` ＋ **各写一笔 `scroll_consume` 流水**
 *      （裁定 1：可审计，`delta = { scrolls: -100 }`）；任一笔失败 ⇒ 对**已扣方**补偿回写；
 *      补偿成功 ⇒ `RENEW_DEDUCT_ROLLED_BACK`；**只有补偿也失败**才 `RENEW_DEDUCT_PARTIAL`（需人工核对）；
 *   ③ 扣减**全部成功后**才推进关系状态（`renewConfirm`，须由**关系另一方**执行）：renewals +1、
 *      `expires_at` 按 `T0 + 365 + 30 × reward_months` 重算、`pending` 清空 ⇒ 解锁；
 *   ④ 最后写审计（关系 history，仅补偿时）与发通知（双方各一条「续约成功」）。
 *
 * **硬口径（本单核心）**：② 扣减失败且补偿成功 ⇒ **关系文档零变更**（① 只读、③ 未执行 ⇒
 *   `renewConfirm` **从未被调用**）：`version` 不变、`renewals` 不增、`expires_at` 不变、`pending` 保留、
 *   锁保留；唯一写入 = 关系 history 末尾追加 1 条补偿审计（**不递增 version**）；用户可稍后重试确认。
 * @returns {Promise<{ok:true, relation_token, relation, deduct, charged, notice_ids}>}
 */
export async function confirmRenewal(relationToken, by, now = new Date()) {
  return runOp(async () => {
    const me = norm(by);
    if (!me) throw friendError('FRIEND_INVALID_PHONE');
    const relationId = await resolveRelationToken(relationToken);
    const token = relationTokenOf(relationId);
    const pair = pairOf(relationId);
    // ⓪ 双边预检（ledger 的只读快照；不足 ⇒ 零写入、零扣减）
    for (const p of pair) {
      const snap = await getAssets(p);
      const total = sumLots(snap.scrolls);
      if (total < SCROLL_PIECES_PER_SCROLL) {
        throw friendError('SCROLL_INSUFFICIENT', {
          message: `兰帖不足，续约需双方各 ${LOCKED_PIECES} 张成品兰帖（${maskPhone(p)} 当前 ${Math.floor(total / SCROLL_PIECES_PER_SCROLL)} 张）`,
        });
      }
    }
    // ① 只读读计划（**不写关系文档**）：扣减顺序（发起方在前）+ `deduct` 出参 + 关系当前状态
    const plan = await renewPlanOf(relationId, me, now);
    const deduct = { phones: pair, amount_each: plan.amount_each, locked: plan.locked };
    const pieces = toNonNegInt(deduct.amount_each) * SCROLL_PIECES_PER_SCROLL;
    // ② **先双边扣减**：发起方（锁定那一批）在前，确认方在后；各自在自身 withAssets 锁内 chargeLots + 留痕
    const initiator = plan.initiator;
    const order = [initiator, ...pair.filter((p) => p !== initiator)].filter(Boolean);
    const applied = []; // 内部记账（含明文手机号，**仅供内部补偿与脱敏投影**）
    for (const [index, p] of order.entries()) {
      const role = p === initiator ? 'initiator' : 'confirmer';
      const peer = pair.find((x) => x !== p) || '';
      try {
        // ⚠️ 测试专用注入点（默认 null ⇒ 生产行为一字不变）；置于 try 内 ⇒ 抛错即走裁定 2 的补偿分支
        if (typeof TEST_ONLY_HOOK.beforeCharge === 'function') {
          await TEST_ONLY_HOOK.beforeCharge(p, { role, index, relation_token: token });
        }
        const one = await withAssets(p, (user) => {
          const c = chargeLots(user.scrolls || [], pieces, 'scroll'); // 不足 ⇒ 抛 409，不部分扣
          // 裁定 1：扣减**必须留痕**（同锁内、同一次回写；类型 = 兰帖消耗自有枚举）
          const tx = recordTx(
            user,
            {
              type: TX_TYPE_SCROLL_CONSUME,
              delta: { scrolls: -pieces },
              ref: { source: SOURCE_FRIEND_RENEW, relation_token: token, peer_masked: maskPhone(peer), role },
              desc: `好友续约消耗：${role === 'initiator' ? '发起方' : '确认方'}自持 ${toNonNegInt(deduct.amount_each)} 张成品兰帖（${pieces} 片）`,
            },
            now,
          );
          return { taken: c.taken, left: c.current, tx_id: tx.id };
        });
        applied.push({
          phone: p, // 内部专用（脱敏投影时剔除，绝不进任何出参）
          phone_masked: maskPhone(p),
          role,
          pieces,
          taken: one.taken,
          left: one.left,
          tx_id: one.tx_id,
        });
      } catch (e) {
        if (applied.length === 0) throw e; // 首笔即失败 ⇒ 零扣减（无单向扣减），原样抛出
        const reason = safeReason(e);
        // 裁定 2：任一笔失败 ⇒ 对**已扣方**补偿回写，并把补偿写进关系 history（可审计）
        // 补偿对象 = 扣减顺序里的**第一方**（已扣方；`applied[0]` 与 `order[0]` 同指）
        const first = applied[0];
        const undone = await rollbackCharged(first, {
          now,
          token,
          peerMasked: first.phone_masked,
          reason: reason.code,
        });
        const audit = await appendRelationAudit(
          relationId,
          {
            at: toIso(now),
            type: RELATION_AUDIT_ROLLBACK,
            from_status: plan.status,
            to_status: plan.status, // ③ 未执行 ⇒ 关系状态**未变**（不得填「推进后」的状态）
            by: me,
            reason: reason.code,
            detail: {
              relation_token: token,
              compensated_masked: first.phone_masked,
              failed_masked: maskPhone(p),
              pieces,
              restored: undone.ok ? undone.restored : [],
              refund_tx_id: undone.ok ? undone.refund_tx_id : '',
              rollback_ok: !!undone.ok,
            },
          },
          { bump_version: false }, // 硬口径：关系文档 version 零变更（唯一写入 = history 追加审计）
        );
        if (!undone.ok) {
          // 补偿**也失败** ⇒ 这才是需人工介入的单向扣减
          throw opsError('RENEW_DEDUCT_PARTIAL', {
            message: `续约扣减仅完成一方且补偿失败（已扣：${first.phone_masked}；失败方：${maskPhone(p)}；补偿失败：${undone.error.code}），需人工核对`,
            reason: reason.code,
            detail: {
              relation_token: token,
              charged: applied.map((c) => ({ phone_masked: c.phone_masked, role: c.role, pieces: c.pieces, tx_id: c.tx_id })),
              failed_masked: maskPhone(p),
              rollback_error: undone.error,
              audit_at: norm(audit?.at),
            },
          });
        }
        // 补偿成功 ⇒ 无单向扣减，且**关系文档零变更**（③ 未执行；补偿审计已留痕）
        throw opsError('RENEW_DEDUCT_ROLLED_BACK', {
          message: `续约扣减未完成（已扣方 ${first.phone_masked} 已全额补偿回滚 ${pieces} 片；失败方 ${maskPhone(p)}：${reason.message || reason.code}）`,
          reason: reason.code,
          detail: {
            relation_token: token,
            compensated: { phone_masked: first.phone_masked, pieces, restored: undone.restored, refund_tx_id: undone.refund_tx_id },
            failed_masked: maskPhone(p),
            audit_at: norm(audit?.at),
          },
        });
      }
    }
    // 出参脱敏投影：`charged` **不含明文手机号**（明文字段只留在内部 `applied`）
    const charged = applied.map(({ phone, ...rest }) => rest);
    // ③ 关系状态推进（唯一状态写；此刻双边资产已扣齐）
    let res;
    try {
      res = await renewConfirm(relationId, me, {
        now,
        has_self_scroll: true,
        has_initiator_scroll: true,
      });
    } catch (e) {
      // 并发窗口兜底：③ 抛错 ⇒ 关系文档**零变更**（renewConfirm 抛错即未落盘），
      // 对**双边**补偿回写，保持「资产零净变更 + 关系零变更」，并原样抛出 friends.js 的结构化拒绝
      const undone = [];
      for (const c of applied) {
        undone.push(
          await rollbackCharged(c, { now, token, peerMasked: c.phone_masked, reason: norm(e?.code) || 'RENEW_CONFIRM_FAILED' }),
        );
      }
      const failed = undone.filter((u) => !u.ok);
      if (failed.length > 0) {
        throw opsError('RENEW_DEDUCT_PARTIAL', {
          message: `续约关系推进失败且双边补偿失败（已扣 ${applied.length} 方，其中 ${failed.length} 方补偿失败），需人工核对`,
          reason: norm(e?.code) || '',
          detail: {
            relation_token: token,
            charged: applied.map((c) => ({ phone_masked: c.phone_masked, role: c.role, pieces: c.pieces, tx_id: c.tx_id })),
            rollback_errors: failed.map((u) => u.error),
            confirm_error: norm(e?.code) || '',
          },
        });
      }
      throw e;
    }
    const plan2 = res.deduct || deduct;
    // ④ 通知双方「续约成功」（发起方 + 确认方各一条）
    const others = pair.filter((p) => p !== me);
    const noticeIds = [];
    for (const p of [me, ...others]) {
      const peer = pair.find((x) => x !== p) || '';
      const n = await notify(p, 'renew_confirmed', peer, now);
      if (n?.id) noticeIds.push(n.id);
    }
    return {
      relation_token: relationTokenOf(res.relation_id),
      relation: projectRelation(res.relation, me),
      events: projectEvents(res.events),
      deduct: {
        phones_masked: (plan2.phones || []).map((p) => maskPhone(p)),
        amount_each: toNonNegInt(plan2.amount_each),
        locked: projectLock(plan2.locked, me),
      },
      charged,
      notice_ids: noticeIds,
    };
  }, '续约成功（双边各扣 1 张兰帖）');
}

/**
 * F-B 拒绝 / 撤回续约申请 ⇒ **解锁**（清空 pending、不改 expires_at、**零流水**）。
 * friends.js 的 `renewCancel` 自定 reason（发起方 = renew_cancelled、对方 = renew_rejected）；
 * 本参数 `reason` 仅作**透传审计**（不改 friends.js）。
 */
export async function cancelRenewal(relationToken, by, now = new Date(), reason = '') {
  return runOp(async () => {
    const me = norm(by);
    const relationId = await resolveRelationToken(relationToken);
    const res = await renewCancel(relationId, me, { now, reason: String(reason || '') });
    return {
      relation_token: relationTokenOf(res.relation_id),
      relation: projectRelation(res.relation, me),
      events: projectEvents(res.events),
      unlocked: { pieces: toNonNegInt(res.unlocked?.pieces), lot_id: norm(res.unlocked?.lot_id), at: norm(res.unlocked?.at), by_masked: maskPhone(res.unlocked?.by) },
      reason: norm(res.relation?.history?.[res.relation.history.length - 1]?.reason),
      unlocked_hint: maskPhone(res.unlocked?.by),
    };
  }, '续约申请已取消（锁定已解除，无流水）');
}

/** F-6 单方解除：任意状态（除 dissolved）立即终止 → dissolved；调用方传 `reason` 写入关系；通知双方 */
export async function dissolveFriend(relationToken, by, now = new Date(), reason = '') {
  return runOp(async () => {
    const me = norm(by);
    if (!me) throw friendError('FRIEND_INVALID_PHONE');
    const relationId = await resolveRelationToken(relationToken);
    const res = await dissolve(relationId, me, { now, ...(reason ? { reason: String(reason) } : {}) });
    const pair = pairOf(relationId);
    const noticeIds = [];
    for (const p of pair) {
      const peer = pair.find((x) => x !== p) || '';
      const n = await notify(p, 'dissolved', peer, now);
      if (n?.id) noticeIds.push(n.id);
    }
    return {
      relation_token: relationTokenOf(res.relation_id),
      relation: projectRelation(res.relation, me),
      events: projectEvents(res.events),
      reason: norm(res.relation?.reason),
      notice_ids: noticeIds,
    };
  }, '好友关系已解除');
}

// ==================== F-C：奖励池均分分发 ====================

/**
 * 三类奖励的落账口径（**入账一律走 ledger 的导出**；`delta` 键名照 ledger 的 `Tx.delta` 体例）：
 *   seed_fragments   → `addFragments`（满 10 自动合成，ledger 自理）
 *   bamboo_pieces    → `addLot('bamboo', n, { source })`（365 天批次）
 *   scroll_fragments → `addScrollFragments`（**纯累加：照收、不拒绝、不截断、不合成** —— 自动合成已于
 *                      2026-09-26 裁定取消，合成改由用户手动触发 `synthesizeScroll`，ledger 自理）
 */
const GRANT = {
  seed_fragments: { delta: 'fragments', label: '石榴籽碎片', add: (user, n, now) => addFragments(user, n, now) },
  bamboo_pieces: {
    delta: 'bamboos',
    label: '竹片',
    add: (user, n, now) => addLot(user, 'bamboo', n, { source: SOURCE_FRIEND_REWARD, now }),
  },
  scroll_fragments: { delta: 'scroll_fragments', label: '兰帖残页', add: (user, n, now) => addScrollFragments(user, n, now) },
};

const GRANT_KEYS = Object.keys(GRANT);

/** `amounts` 收口（只认三类键；非法 / 缺席 ⇒ 0，不臆造） */
function normalizeAmounts(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of GRANT_KEYS) out[k] = toNonNegInt(src[k]);
  return out;
}

/** 单侧落账（**调用方必须已持有 withAssets 锁**）：逐键入账 + 一条 `reward` 审计流水 */
function grantTo(user, per, now, ref, desc) {
  const delta = {};
  for (const k of GRANT_KEYS) {
    const n = toNonNegInt(per[k]);
    delta[GRANT[k].delta] = n;
    if (n > 0) GRANT[k].add(user, n, now);
  }
  const tx = recordTx(user, { type: 'reward', delta, ref, desc }, now);
  return tx;
}

/**
 * Zang 裁定（**发放必须幂等** · 基础奖励的**锁内**入口）。
 *
 * ⚠️ **必须在调用方自己持有的 `withAssets(user)` 事务内调用**（本函数不做任何 IO、不取锁）：
 * 任务中心把「打标 + 基础奖励入账」放进**同一次** `withAssets` 事务 ⇒ 结构上不存在
 * 「基础已入账但没有打标」或「重试再入账一次基础」的窗口（原子提交 / 原子回滚）。
 * 奖励口径与流水形状与 `distributeFriendRewards` 的 `base` 分支**共用同一实现**（`grantTo`），
 * 不构成第二套记账 / 不新增 Tx.type。
 * @param {object} user 资产文档内的用户记录（**事务内**）
 * @param {object} amounts `{ seed_fragments, bamboo_pieces, scroll_fragments? }`
 * @param {Date|string} now
 * @param {string} triggerPhone 触发者手机号（**仅用于脱敏投影**，不入库明文）
 * @returns {object} 账本流水（`Tx`）
 */
export function grantRewardBase(user, amounts, now, triggerPhone) {
  const baseAmt = normalizeAmounts(amounts);
  const triggerMasked = maskPhone(triggerPhone);
  return grantTo(
    user,
    baseAmt,
    now,
    { source: SOURCE_FRIEND_REWARD, scope: 'base', trigger_masked: triggerMasked },
    `好友奖励（基础）：触发者本人 +${baseAmt.seed_fragments} 石榴籽碎片 / +${baseAmt.bamboo_pieces} 竹片`,
  );
}

/** 池流水的**幂等键**字段名（`ref.grant_key`；只在调用方给出 `idempotency_key` 时出现） */
export const REWARD_GRANT_KEY = 'grant_key';

/**
 * F-C 好友奖励分发（**本单核心**）。
 *
 * `amounts` 形状（调用方给出）：
 * `{ base: { seed_fragments, bamboo_pieces }, pool: { seed_fragments, scroll_fragments } }`
 *   注：`base: null`（**显式**）⇒ **跳过本人基础奖励**（调用方已在自己的 `withAssets` 事务内
 *   用 `grantRewardBase` 发放，见 Zang 裁定「发放必须幂等」）；不给 / 给 `{}` ⇒ 行为与既往一字不变。
 *
 * 四条硬口径：
 *   ① **触发者本人基础奖励照发**（`base` 逐键入账到 `triggerPhone`），**触发者不参与池分配**；
 *   ② 池按**领取时刻快照的「生效中好友数」**均分（`floor(pool[键] / 分母)`，**余数销毁**；
 *      唯一口径 = friends.js 的 `isActiveAt`）；
 *   ③ **分母为 0 ⇒ 不建池、不写任何池流水**（本人基础奖励照发，流水照写）；
 *   ④ 分发路径**不调用任何活动触发逻辑** ⇒ 收件人收到的碎片**不再触发**新的池分发；
 *   ⑤ 缓冲期 / 待邀请 / 已解除 / 已到期未 sweep 的 active 一律**不计入分母**。
 *
 * 幂等（`opts.idempotency_key`，Zang 裁定「发放必须幂等」）：
 *   给出幂等键时 ⇒ 每个收件人入账前先**在其自身事务内**按账本自证判重
 *   （该收件人账上是否已有 `ref.scope='pool' && ref.grant_key === key && ref.relation_id === 本关系`
 *   的 `reward` 流水）；已有 ⇒ **跳过入账**（不重复发、不重复写流水，`distributed[]` 该条 `replayed: true`
 *   并回显既有 `tx_id`）。键的语义 = 「**这一次**分发」（任务中心用法 = `手机号:自然日:任务`）。
 *   **不给键（默认）⇒ 行为与既往一字不变**：每次调用都真实入账，池流水 `ref` 仍是原七键（形状冻结）。
 *
 * 流水形状（**既有枚举 `reward`，不新增枚举**；零头也落一条 delta 全 0 的审计条，
 *   照 ledger 既有体例 `jade_mount`「delta 为 0 的记账条」）：
 *   基础：`type='reward'`，`ref = { source:'friend_reward', scope:'base', trigger_masked }`，
 *         `delta = { fragments, bamboos, scroll_fragments }`（逐键给出，无则 0）
 *   池  ：`type='reward'`，`ref = { source:'friend_reward', scope:'pool', relation_id,
 *         trigger_masked, denominator, pool_total:{…}, remainder:{…} }`（给出幂等键时**追加**
 *         `grant_key` 一键；不给键 ⇒ 七键逐字冻结不变），`delta` 同上（本次实际入账量）
 *   注：`ref.relation_id` 是**账本内的存储审计**（非出参），维持 F-C 冻结形状；
 *       出参侧按裁定 3 只给 `relation_token`。
 *
 * @param {string} triggerPhone
 * @param {{base?:object, pool?:object}} [amounts] `base: null` ⇒ 跳过基础奖励（见上）
 * @param {Date|string} [now]
 * @param {{idempotency_key?:string}} [opts]
 * @returns {Promise<{ok:true, denominator:number, recipients:number, base:object, pool_per_friend:object,
 *   remainder:object, distributed:object[], pooled:boolean, notice_ids:string[]}>}
 */
export async function distributeFriendRewards(triggerPhone, amounts = {}, now = new Date(), opts = {}) {
  return runOp(async () => {
    const trigger = norm(triggerPhone);
    if (!trigger) throw friendError('FRIEND_INVALID_PHONE');
    // `base: null`（显式）⇒ 跳过基础奖励：调用方（任务中心）把「打标 + 基础奖励入账」放进
    // **同一次** withAssets 事务（grantRewardBase），此处不得再发一次。
    const skipBase = amounts?.base === null;
    const baseAmt = skipBase ? normalizeAmounts({}) : normalizeAmounts(amounts?.base);
    const poolAmt = normalizeAmounts(amounts?.pool);
    const triggerMasked = maskPhone(trigger);
    const grantKey = norm(opts?.idempotency_key);

    // ① 触发者本人基础奖励（**照发**；唯一写入口 = withAssets；`base: null` 时由调用方在自身事务内发）
    const baseTx = skipBase
      ? null
      : await withAssets(trigger, (user) => grantRewardBase(user, baseAmt, now, trigger));

    // ② 分母：**领取时刻快照的生效中好友数**（唯一口径 = friends.js 的 isActiveAt；本人不参与）
    const relations = await listRelations(trigger, { now });
    const actives = [];
    for (const r of relations) {
      if (!isActiveAt(r, now)) continue; // pending / grace / dissolved / 已到期未 sweep 的 active 全部剔除
      const peer = otherPhoneOf(r, trigger);
      if (!peer || peer === trigger) continue; // F-C① 触发者不得参与池分配
      actives.push({ relation_id: r._id, phone: peer });
    }
    // 同一好友去重（一人一票）
    const seen = new Set();
    const recipients = actives.filter((x) => (seen.has(x.phone) ? false : (seen.add(x.phone), true)));
    const denominator = recipients.length;

    // ③ 分母为 0 ⇒ 不建池、不写任何池流水（本人基础奖励已照发）
    if (denominator === 0) {
      return {
        denominator: 0,
        recipients: 0,
        base: baseAmt,
        pool_per_friend: normalizeAmounts({}),
        remainder: poolAmt,
        distributed: [],
        pooled: false,
        base_tx_id: baseTx?.id || '',
        notice_ids: [],
      };
    }

    // ④ 每键向下取整、余数销毁
    const per = {};
    const remainder = {};
    for (const k of GRANT_KEYS) {
      const total = poolAmt[k];
      per[k] = Math.floor(total / denominator);
      remainder[k] = total - per[k] * denominator; // 销毁（不回填、不结转）
    }

    // ⑤ 逐个收件人在**其自身** withAssets 锁内落账；**不调用任何活动触发逻辑**
    const distributed = [];
    for (const [index, { phone, relation_id }] of recipients.entries()) {
      // ⚠️ 测试专用注入点（默认 null ⇒ 生产行为一字不变）：模拟「池分发中途失败」，用例据此验证
      //    失败重试的幂等性（重试不得二次入账 / 不得留下悬空打标）
      if (typeof TEST_ONLY_HOOK.beforeRewardGrant === 'function') {
        await TEST_ONLY_HOOK.beforeRewardGrant(phone, {
          index,
          relation_id,
          relation_token: relationTokenOf(relation_id),
          trigger_masked: triggerMasked,
          idempotency_key: grantKey,
        });
      }
      const ref = {
        source: SOURCE_FRIEND_REWARD,
        scope: 'pool',
        relation_id,
        trigger_masked: triggerMasked,
        denominator,
        pool_total: { ...poolAmt },
        remainder: { ...remainder },
        // 幂等键：**只在调用方给出时**追加 ⇒ 未给键时池流水 ref 仍是原七键（形状冻结不变）
        ...(grantKey ? { [REWARD_GRANT_KEY]: grantKey } : {}),
      };
      const one = await withAssets(phone, (user) => {
        // 幂等判重（**账本自证**：只读本收件人自己的流水，不新增字段 / 不新增集合 / 不新增 Tx.type）
        if (grantKey) {
          const seen = (Array.isArray(user.txs) ? user.txs : []).find(
            (t) =>
              t &&
              norm(t.type) === 'reward' &&
              norm(t.ref?.scope) === 'pool' &&
              norm(t.ref?.[REWARD_GRANT_KEY]) === grantKey &&
              norm(t.ref?.relation_id) === norm(relation_id),
          );
          if (seen) return { tx: null, replayed: true, existing_id: norm(seen.id) };
        }
        const tx = grantTo(
          user,
          per,
          now,
          ref,
          `好友奖励（池）：生效中好友 ${denominator} 人均分，本次 +${per.seed_fragments} 石榴籽碎片 / +${per.scroll_fragments} 兰帖残页`,
        );
        return { tx, replayed: false, existing_id: norm(tx?.id) };
      });
      distributed.push({
        phone_masked: maskPhone(phone),
        // 裁定 3：出参侧只给不透明句柄
        relation_token: relationTokenOf(relation_id),
        granted: { ...per },
        tx_id: one.existing_id,
        // 重试跳过（本次分发的幂等键已在账上）⇒ true；正常入账 ⇒ false
        replayed: one.replayed,
      });
    }

    return {
      denominator,
      recipients: denominator,
      base: baseAmt,
      pool_per_friend: per,
      remainder,
      distributed,
      pooled: true,
      base_tx_id: baseTx?.id || '',
      notice_ids: [],
    };
  }, '好友奖励已分发');
}

// ==================== F-I：续约锁定读数（本单新增 · D-1 后端强制校验） ====================

/**
 * F-I 续约锁定读数（**只读、零写入、不注册定时任务**）：汇总该手机号当前**未超时**的
 * 续约待确认关系所**锁定**的兰帖片数。
 *
 * 背景（缺陷 D-1）：F-B 的续约锁定**只占用、不扣除** —— 锁定四字段落在关系文档
 * `pending.locked_*`（`locked_by` / `locked_pieces` / `locked_lot_id` / `locked_at`），
 * 那 1 张成品兰帖**仍留在账本域的资产集合里**（集合名字面只允许出现在 `economy-ledger.js` 内，
 * 本模块不得出现该字面 —— F-A 源码判据）。前端对「兰帖分解」置灰，但
 * `POST /assets/scroll/decompose` **此前不校验锁定** ⇒ 直接 curl 即可把被锁定的那 1 张分解掉，
 * 置灰形同虚设。本导出给路由层提供**唯一**的锁定读数，使「可分解张数」在**后端**可判。
 *
 * 口径（逐条）：
 *   ① **超时的不算**：`listRelations` 内部先做**内存 sweep**（`sweepRelation`），
 *      续约申请超 7 天 ⇒ `pending` 被清空（锁随 pending 一并解除，见 friends.js F-8 ②），
 *      故已超时的锁**天然不被计入** —— 不需要也不允许再写第二套超时判定。
 *   ② **只算「本人锁定的」**：`pending.locked_by === phone`。锁定的是**发起方自己的**那 1 张兰帖
 *      （F-B：发起方须自持 ≥ 1 张 ⇒ 占用发起方资产）；对方发起的续约锁的是**对方的**资产，
 *      不占本手机号的可分解额度。故按 `locked_by` 过滤（不是「本人是当事人的全部关系」）。
 *   ③ 只认 `pending.kind === 'renew'`（待邀请 pending 的 `locked_*` 不存在）；
 *      `locked_pieces` 一律过 `toNonNegInt`（脏数据不放大、不缩水为负）。
 *   ④ **零写入（语义）**：不改关系文档、不碰资产字段、不写流水 —— 本读数是**同一次资产事务内**的
 *      一致性快照（见 ⑤）；mutator 不修改任何字段 ⇒ 回写内容逐字节相同（不是「第二套记账」）。
 *   ⑤ **本单 TOCTOU 收口**：本读数放进**该手机号的资产事务**（`withAssets(me, …)`）内完成 ⇒
 *      「锁定读」与「兰帖扣减」处在**同一把锁 / 同一串行队列**上，且与 `requestRenewal` 的落锁
 *      （同一事务，见该导出）互相串行：读数不会落在别人「判定 → 落锁」的中途。
 *      残余（**如实登记**）：路由 `POST /assets/scroll/decompose`（**本单冻结，不得改**）在本函数
 *      返回后**另起一次资产写事务**做扣减 ⇒ 两次调用之间仍有**一次释放窗口**。彻底消除需把锁读
 *      移入同一扣减事务（须改 index.js，超出本单可写范围）；现口径下该类交错的兜底 = 续约确认时的
 *      双边预检 + `chargeLots` 不足即整单拒绝 + 裁定 2 补偿回滚（账实绝不单向错位）。
 *
 * @param {string} phone 手机号（本人）
 * @param {Date|string} [now]
 * @returns {Promise<{pieces:number, locks:Array<{relation_token:string, pieces:number}>}>}
 *   `pieces` = 锁定片数合计（0 = 未锁定）；`locks` = 明细（**只出 relation_token**，不出关系 _id / 明文手机号）
 */
export async function lockedScrollPieces(phone, now = new Date()) {
  const me = norm(phone);
  if (!me) throw friendError('FRIEND_INVALID_PHONE');
  const at = now instanceof Date ? now : new Date(now);
  return withAssets(me, async () => {
    const rows = await listRelations(me, { now: at }); // 内存 sweep：超时的 renew pending 已清空 ⇒ 不计
    let pieces = 0;
    const locks = [];
    for (const r of rows) {
      const p = r?.pending;
      if (!p || p.kind !== 'renew') continue;
      if (norm(p.locked_by) !== me) continue; // ② 只算本人锁定的
      const n = toNonNegInt(p.locked_pieces);
      if (n <= 0) continue;
      pieces += n;
      locks.push({ relation_token: relationTokenOf(r._id), pieces: n });
    }
    return { pieces, locks };
  });
}

// ==================== F-D：惰性 sweep（不注册定时任务） ====================

/**
 * F-D 惰性 sweep：遍历 `jiazu_friends` **全量关系**，对每份调用 friends.js 的**纯函数** `sweepRelation`，
 * **仅对发生迁移的关系落盘**（version + 1，走本模块唯一落盘点 `writeRelationDoc`）。
 * **不注册定时任务**：源码中无任何定时器 / 周期调度调用。
 * @param {Date|string} [now]
 * @returns {Promise<{ok:true, total:number, changed_count:number, changed:object[]}>}
 *   `changed[] = { relation_id, status, from_status, events }`（**仅用户面之外的运营视角**，不经路由下发）
 */
export async function sweepFriends(now = new Date()) {
  return runOp(async () => {
    const docs = await colAll(FRIENDS_COL);
    const changed = [];
    for (const doc of docs) {
      const { relation, events, changed: moved } = sweepRelation(doc, now);
      if (!moved || !relation) continue; // 无迁移 ⇒ 零写入
      const saved = await writeRelationDoc(relation);
      changed.push({
        relation_id: saved._id,
        status: saved.status,
        from_status: norm(events?.[0]?.from_status),
        events: events || [],
      });
    }
    return { total: docs.length, changed_count: changed.length, changed };
  }, '好友关系惰性结算完成');
}

// ==================== 导出清单（F-F 逐字冻结） ====================
// listFriends / sendFriendInvite / acceptFriendInvite / rejectFriendInvite / cancelFriendInvite /
// requestRenewal / confirmRenewal / cancelRenewal / dissolveFriend / distributeFriendRewards / sweepFriends
// ＋ 常量与工具：FRIEND_OPS_ERRORS / opsError / maskPhone / FRIEND_NOTICE / FRIEND_NOTICE_TYPE
// ＋ F-I 续约锁定读数（本单新增 · D-1）：lockedScrollPieces
// ＋ 裁定 3 的句柄工具：relationTokenOf / resolveRelationToken / RELATION_TOKEN_PREFIX
// ＋ 裁定 1/2 的常量：TX_TYPE_SCROLL_CONSUME / SOURCE_FRIEND_RENEW / SOURCE_FRIEND_RENEW_ROLLBACK /
//   TX_TYPE_ROLLBACK / RELATION_AUDIT_ROLLBACK
// （FRIEND_ERRORS 等关系域错误码从 friends.js 转发引用，不在此重复定义）
export { FRIEND_ERRORS };
