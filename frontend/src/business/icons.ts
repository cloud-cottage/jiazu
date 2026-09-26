/**
 * 统一图标引用（固化位置：frontend/src/static/icons/，uni-app 静态目录随包发布）
 *
 * 约定：禁止在组件里散落手写 '/static/icons/xx.svg' 路径——一律经本模块引用，
 * 便于统一改图标、避免引用随组件重构丢失（历史教训：性别徽章曾因弹窗层删除而失联）。
 */
export const ICON = {
  /** 性别徽章：男 / 女（黑底白字圆章） */
  GENDER_MALE: '/static/icons/male.svg',
  GENDER_FEMALE: '/static/icons/female.svg',
  /** 石榴籽（资产计量 / 市集标价「N 籽」） */
  SEED: '/static/icons/seed.png',
  /** 石榴籽玉（家族树凹槽镶玉 / 玉操作） */
  JADE: '/static/icons/jade.png',
  /** 竹简（行囊竹简格 / 资产页竹简行） */
  BAMBOO: '/static/icons/bamboo.png',
  /** 石榴籽碎片（签到碎片 · 行囊碎片格 / 资产页碎片行；不规则三角形） */
  FRAGMENT: '/static/icons/fragment.png',
  /** 兰帖（市集 / 行囊中的兰帖藏品） */
  SCROLL: '/static/icons/scroll.png',
  /** 兰帖碎片（兰帖碎裂产物） */
  SCROLL_SHARD: '/static/icons/scroll-shard.png',
} as const;

/** 按资产种类取图标 URL（seed→石榴籽 / jade→石榴籽玉 / 其它→空串不显示） */
export function assetIconSrc(kind: 'seed' | 'jade'): string {
  if (kind === 'seed') return ICON.SEED;
  if (kind === 'jade') return ICON.JADE;
  return '';
}

/** 按性别取图标 URL（M→男章 / F→女章 / 其它→空串不显示） */
export function genderIconSrc(gender?: 'M' | 'F' | 'U' | string | null): string {
  if (gender === 'M') return ICON.GENDER_MALE;
  if (gender === 'F') return ICON.GENDER_FEMALE;
  return '';
}
