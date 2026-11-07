/**
 * 状态与类型的枚举及中文标签。
 *
 * 单独成文件、不依赖 zod：前端只需要这些常量，从 schemas.ts 引入会把整个 zod 带进页面。
 */

/** 胶卷状态流转 */
export const ROLL_STATUSES = [
  'unopened', // 未拆封
  'loaded', // 已装机
  'partial', // 部分使用
  'exposed', // 已拍完
  'developed', // 已冲洗
  'archived', // 已扫描/归档
  'void', // 作废
  'lost', // 丢失
] as const

export type RollStatus = (typeof ROLL_STATUSES)[number]

export const ROLL_STATUS_LABEL: Record<RollStatus, string> = {
  unopened: '未拆封',
  loaded: '已装机',
  partial: '部分使用',
  exposed: '已拍完',
  developed: '已冲洗',
  archived: '已归档',
  void: '作废',
  lost: '丢失',
}

/** 型号在产状态 */
export const STOCK_STATUSES = ['active', 'discontinued', 'cinema'] as const
export type StockStatus = (typeof STOCK_STATUSES)[number]

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  active: '在产',
  discontinued: '停产',
  cinema: '电影卷',
}

/** 色彩类型 */
export const COLOR_TYPES = ['color_negative', 'color_positive', 'bw'] as const
export type ColorType = (typeof COLOR_TYPES)[number]

export const COLOR_TYPE_LABEL: Record<ColorType, string> = {
  color_negative: '彩色负片',
  color_positive: '彩色反转',
  bw: '黑白',
}
