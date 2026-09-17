/**
 * 扣费闸门的前端公共提示：文案 + 资产不足引导
 * （docs/economy-fee.spec.md §6 / §7 / §8、docs/economy.spec.md §5-8）。
 *
 * 只做两件事，不放业务判断：
 * - 余额不足一律用 `isAssetInsufficientError`（按 `err.code === 'ASSET_INSUFFICIENT'` 判定，
 *   中文文案只作后端未带 code 时的兜底备份路径）；
 * - 文案直出后端 `error`（不改写、不隐藏），来源清单优先取后端 `how_to_get`；
 * - 引导统一落到「我的资产」页（`pages/assets/index`）。
 *
 * 籽域数量口径（用户拍板）：数字与量词连写「9颗石榴籽」（与 8.4 定稿弹窗逐字一致）；竹片域沿用「N 片竹片」。
 */
import { ApiStatusError } from './api';
import type { FeeInfo } from './api';

/** 竹片来源提示（唯一文案真源：docs/economy-fee.spec.md §8；与后端 HOW_TO_GET 同文，此处为前端本地兜底） */
export const HOW_TO_GET: string[] = [
  '官方 9.9 元/束',
  '每日 21 点限量发售',
  '市集购买',
  '蓄能档位赠送（季度 1 束 / 半年度 2 束 / 年度 8 束）',
];

/** 计价单位的中文写法（竹片论「片」、石榴籽论「颗」） */
function unitWords(unit: string | undefined): { name: string; quantifier: string } {
  return unit === 'seeds' ? { name: '石榴籽', quantifier: '颗' } : { name: '竹片', quantifier: '片' };
}

/**
 * 扣费回执文案（fee 缺省返回空串，调用方据此决定是否追加）：
 * 籽域「本次消耗 9颗石榴籽，余 0 颗」（数字与量词连写，用户拍板口径，与 8.4 定稿弹窗一致）；
 * 竹片域「本次消耗 N 片竹片，余 M 片」（保持既有空格写法）。
 */
export function feeText(fee?: FeeInfo | null): string {
  if (!fee || !fee.pieces) return '';
  const { name, quantifier } = unitWords(fee.unit);
  return fee.unit === 'seeds'
    ? `本次消耗 ${fee.pieces}${quantifier}${name}，余 ${fee.balance_after} ${quantifier}`
    : `本次消耗 ${fee.pieces} ${quantifier}${name}，余 ${fee.balance_after} ${quantifier}`;
}

/**
 * 是否为「资产不足」409（docs/economy-fee.spec.md §6）。
 * 按 `err.code` 判定；后端未带 code 时用「资产不足」文案兜底（旧路径的中文正则降级为备份）。
 */
export function isAssetInsufficientError(e: unknown): boolean {
  if (!(e instanceof ApiStatusError) || e.status !== 409) return false;
  if (e.code === 'ASSET_INSUFFICIENT') return true;
  return /资产不足/.test(e.message || '');
}

/** 跳「我的资产」页（pages/assets/index，已在 pages.json 注册） */
export function goMyAssets(): void {
  uni.navigateTo({ url: '/pages/assets/index' });
}

/**
 * 资产不足的统一引导：toast 后端 error 原文（不隐藏、不改写）
 * + 弹窗列「如何获得竹片 / 石榴籽」清单 + 一键跳「我的资产」。
 *
 * @param e 409 错误对象（ApiStatusError；缺失字段时退回本地 HOW_TO_GET）
 * @param opts.extra 追加说明行（如「已保存的部分：本次消耗 1 片竹片，余 99 片」）
 * @param opts.title 弹窗标题（缺省「资产不足」）
 */
export function showAssetInsufficientGuide(
  e: unknown,
  opts: { extra?: string; title?: string } = {},
): void {
  const msg = (e as Error | undefined)?.message || '资产不足';
  const provided = (e as { howToGet?: string[] } | undefined)?.howToGet;
  const items = Array.isArray(provided) && provided.length ? provided : HOW_TO_GET;
  const list = items.map((t) => `· ${t}`).join('\n');
  // toast 直出后端文案（保证「不得静默失败」）；弹窗承载来源清单与跳转入口
  uni.showToast({ title: msg, icon: 'none', duration: 4000 });
  uni.showModal({
    title: opts.title || '资产不足',
    content: `${msg}${opts.extra ? `\n${opts.extra}` : ''}\n\n如何获得竹片 / 石榴籽：\n${list}`,
    confirmText: '去我的资产',
    cancelText: '稍后再说',
    success: (res) => {
      if (res.confirm) goMyAssets();
    },
  });
}
