/**
 * 前后端共享的 Zod schema 与类型。
 * 服务端的路由入参校验、前端表单校验都从这里取，避免两套规则漂移。
 */

import { z } from 'zod'
import { COLOR_TYPES, ROLL_STATUSES, STOCK_STATUSES } from './enums.js'

/** 7 位胶卷编码（仅结构校验，是否已入库由服务端判断） */
export const rollCodeSchema = z
  .string()
  .trim()
  .length(7, '编码必须是 7 位')
  .regex(
    /^[A-Z][A-Z][0-9A-Za-z][A-Z][0-9A-Za-z]\d{2}$/,
    '编码格式不正确（示例 KG2T001）',
  )
  .refine((v) => v.slice(4) !== '000', '000 为保留序号')

/** 4 位前缀 */
export const prefixSchema = z
  .string()
  .trim()
  .length(4, '前缀必须是 4 位')
  .regex(/^[A-Z][A-Z][0-9A-Za-z][A-Z]$/, '前缀格式不正确（示例 KG2T）')

/** 3 位序号 */
export const serialSchema = z
  .string()
  .trim()
  .length(3, '序号必须是 3 位')
  .regex(/^[0-9A-Za-z]\d{2}$/, '序号格式不正确（示例 001 / A07 / a12）')
  .refine((v) => v !== '000', '000 为保留序号')

/** 序号对应的整数 seq（1..6199） */
export const seqSchema = z.number().int().min(1).max(6199)

/** ISO 值：25..3200 的常见档位，允许任意正整数以便将来扩展 */
export const isoSchema = z.number().int().min(1).max(100000)

/** 登录 */
export const loginSchema = z.object({
  pin: z.string().min(1, '请输入 PIN'),
})

/** 新建/编辑型号（客观层） */
export const stockInputSchema = z.object({
  brandCode: z.string().length(1),
  seriesCode: z.string().length(1).regex(/^[A-Z]$/, '系列位必须是大写字母'),
  iso: isoSchema,
  formatCode: z.string().length(1),
  name: z.string().min(1).max(120),
  nominalFrames: z.number().int().min(1).max(200).nullable().optional(),
  defaultFrames: z.number().int().min(1).max(200).nullable().optional(),
  process: z.string().max(20).nullable().optional(),
  colorType: z.enum(COLOR_TYPES).nullable().optional(),
  status: z.enum(STOCK_STATUSES).optional(),
  description: z.string().max(2000).nullable().optional(),
})

/** 编辑型号的个人层 */
export const stockPersonalSchema = z.object({
  nickname: z.string().max(60).nullable().optional(),
  usualEi: z.number().int().min(1).max(100000).nullable().optional(),
  pushPullPref: z.string().max(20).nullable().optional(),
  myRating: z.number().int().min(1).max(5).nullable().optional(),
  myNotes: z.string().max(2000).nullable().optional(),
  refPrice: z.number().min(0).nullable().optional(),
})

/** 记一笔（进度快照） */
export const progressInputSchema = z
  .object({
    /** progress=拍到第几张，load=装机 */
    event: z.enum(['progress', 'load']).default('progress'),
    reachedFrame: z.number().int().min(0),
    happenedAt: z.string().datetime({ offset: true }).or(z.string().min(1)).optional(),
    cameraId: z.number().int().positive().nullable().optional(),
    lensId: z.number().int().positive().nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
    address: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => (v.lat == null) === (v.lng == null), '经纬度必须同时提供')

/** 单张注解 */
export const frameNoteInputSchema = z.object({
  frameNo: z.number().int().min(1),
  aperture: z.string().max(20).nullable().optional(),
  shutter: z.string().max(20).nullable().optional(),
  ei: z.number().int().min(1).max(100000).nullable().optional(),
  evOffset: z.string().max(20).nullable().optional(),
  lensId: z.number().int().positive().nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  happenedAt: z.string().min(1).optional(),
})

/** 扫码分流入参 */
export const scanInputSchema = z.object({
  raw: z.string().min(1, '请输入或扫描内容'),
})

/** 批量建档 */
export const batchRollInputSchema = z.object({
  prefix: prefixSchema,
  startSeq: seqSchema,
  count: z.number().int().min(1).max(50),
  framesTotal: z.number().int().min(1).max(200),
  /**
   * 冲突策略：
   *   strict — 起始序号往后的连续 N 个号里只要有一个已存在，就报错并列出重复项（默认）
   *   skip   — 跳过已占用的号，往后取满 N 个
   *   append — 忽略起始序号，从该前缀最大号之后顺延
   */
  onConflict: z.enum(['strict', 'skip', 'append']).default('strict'),
  box: z
    .object({
      label: z.string().max(120).optional(),
      purchasedAt: z.string().optional(),
      unitPrice: z.number().min(0).optional(),
      source: z.string().max(120).optional(),
      storage: z.string().max(120).optional(),
      notes: z.string().max(2000).optional(),
    })
    .optional(),
})

export type StockInput = z.infer<typeof stockInputSchema>
export type StockPersonal = z.infer<typeof stockPersonalSchema>
export type ProgressInput = z.infer<typeof progressInputSchema>
export type FrameNoteInput = z.infer<typeof frameNoteInputSchema>
export type BatchRollInput = z.infer<typeof batchRollInputSchema>
