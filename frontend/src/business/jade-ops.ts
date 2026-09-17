/**
 * 石榴籽玉：规格常量 + 定稿确认文案（前端唯一副本）。
 *
 * 真源：
 * - 定稿文案 = `docs/economy-ops.spec.md` §6.1（8.2 石榴籽玉合成确认 / 8.3 石榴籽玉镶嵌不可逆确认），
 *   **逐字引用，不得改写、增删标点或【】包裹词**；
 * - 业务数值 = `docs/spirit-domain.spec.md` §3 常量表：`SEED_COST = 999`、`PERMANENT_THRESHOLD_DAYS = 360`、
 *   `SEED_DAYS = 365`（分解固定返还 999 颗籽、产出统一 365 天）；
 * - 规则 = 同上 §5-1（合成）/ §5-2（分解）/ §5-3（镶嵌，不可逆、每树唯一凹槽）。
 *
 * 落点多处（资产页合成 / 分解、时流子域页镶嵌）共用本模块 —— 禁止各页再复制一份文案常量。
 */

/** 合成一枚玉的固定消耗（颗；分解同样固定返还该数） */
export const JADE_SYNTH_SEEDS = 999;

/** 永久判定阈值（天）：参与合成的籽**全部**剩余 ≥ 360 天 → 玉 `expires_at = null`（恰好 360 天算永久） */
export const JADE_PERMANENT_THRESHOLD_DAYS = 360;

/** 石榴籽统一有效期（天）：分解产出的籽一律 365 天（无永久籽） */
export const SEED_VALID_DAYS = 365;

// ---- 8.2 石榴籽玉合成确认（docs/economy-ops.spec.md §6.1；无运行时填值，整段照抄） ----

/** 8.2 标题行（逐字） */
export const SYNTH_CONFIRM_TITLE = '⚠️ 合成提示';

/** 8.2 正文（逐字；`/` = 换行） */
export const SYNTH_CONFIRM_BODY = [
  `本次将消耗${JADE_SYNTH_SEEDS}颗石榴籽。`,
  `若全部${JADE_SYNTH_SEEDS}颗石榴籽剩余有效期均≥${JADE_PERMANENT_THRESHOLD_DAYS}天，合成石榴籽玉为永久有效；`,
  `若存在有效期不足${JADE_PERMANENT_THRESHOLD_DAYS}天的石榴籽，石榴籽玉有效期将取本次所用石榴籽中最早到期的剩余时长。`,
  `石榴籽玉可免费分解，分解后返还${JADE_SYNTH_SEEDS}颗石榴籽，分解所得石榴籽统一拥有${SEED_VALID_DAYS}天有效期。`,
  '请确认是否继续合成？',
].join('\n');

// ---- 8.3 石榴籽玉镶嵌不可逆确认（docs/economy-ops.spec.md §6.1；无运行时填值，整段照抄） ----

/** 8.3 标题行（逐字） */
export const MOUNT_CONFIRM_TITLE = '⚠️ 不可逆操作确认';

/** 8.3 正文（逐字；`/` = 换行） */
export const MOUNT_CONFIRM_BODY = [
  '您即将把石榴籽玉镶嵌至家族树凹槽。镶嵌后该石榴籽玉将永久销毁，不可取回、不可分解。',
  '镶嵌成功将解锁本家族树【时流子域】，您可以通过灌注玉露灵泽维持灵气持续生效。',
  '是否确认镶嵌？',
].join('\n');

// ---- 分解二次确认（非 §6 定稿文案；内容按 docs/spirit-domain.spec.md §5-2 的免费 / 999 颗 / 365 天口径） ----

/** 分解确认标题 */
export const DECOMPOSE_CONFIRM_TITLE = '分解石榴籽玉';

/** 分解确认正文：免费、固定返还 999 颗、产出统一 365 天 */
export const DECOMPOSE_CONFIRM_BODY = [
  '本次分解免费，不收取任何费用。',
  `固定返还 ${JADE_SYNTH_SEEDS} 颗石榴籽，产出的石榴籽统一 ${SEED_VALID_DAYS} 天有效期。`,
  '是否确认分解？',
].join('\n');
