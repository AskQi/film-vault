/**
 * 盒、卷、进度快照、单张注解、冲洗、附件。
 */
import { sqliteTable, text, integer, real, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { filmStock } from './stocks.js'
import { camera, lens } from './cameras.js'

/** 一次采购的一盒（一盒多卷，共享购入信息） */
export const box = sqliteTable('box', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  stockId: integer('stock_id')
    .notNull()
    .references(() => filmStock.id),
  label: text('label'),
  purchasedAt: text('purchased_at'),
  unitPrice: real('unit_price'),
  source: text('source'),
  storage: text('storage'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
})

/**
 * 真正的一卷胶卷。
 *
 * 同时存 serial_txt 与 seq：
 *   - serial_txt 用于展示与拼编码（'004' / 'A07' / 'z12'）
 *   - seq 用于排序、取最大值、找下一个可用号、唯一约束
 * 字符串比较会出错：字典序下 'A00' < '999'，但业务上 A00 更大。
 *
 * 不冗余存 frames_shot：当前进度由 MAX(roll_progress.reached_frame) 推导。
 */
export const roll = sqliteTable(
  'roll',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** 7 字符完整编码，如 KG2T004 */
    code: text('code').notNull().unique(),
    /** 4 位前缀，冗余存便于按前缀检索 */
    prefix: text('prefix').notNull(),
    /** 3 字符序号原样 */
    serialTxt: text('serial_txt').notNull(),
    /** 可排序整数：'004'=4，'A07'=1007，'z12'=6112 */
    seq: integer('seq').notNull(),
    stockId: integer('stock_id')
      .notNull()
      .references(() => filmStock.id),
    boxId: integer('box_id').references(() => box.id),

    framesTotal: integer('frames_total').notNull(),
    status: text('status').notNull().default('unopened'),

    cameraId: integer('camera_id').references(() => camera.id),
    lensId: integer('lens_id').references(() => lens.id),
    ei: integer('ei'),
    pushPull: integer('push_pull').notNull().default(0),

    loadedAt: text('loaded_at'),
    finishedAt: text('finished_at'),
    expiryDate: text('expiry_date'),

    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('ux_roll_prefix_seq').on(t.prefix, t.seq),
    index('idx_roll_status').on(t.status, t.updatedAt),
    index('idx_roll_stock').on(t.stockId),
    check('ck_roll_seq', sql`${t.seq} BETWEEN 1 AND 6199`),
    check('ck_roll_code_len', sql`length(${t.code}) = 7`),
  ],
)

/** 进度快照（核心表）：记录「拍到了第几张」 */
export const rollProgress = sqliteTable(
  'roll_progress',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rollId: integer('roll_id')
      .notNull()
      .references(() => roll.id, { onDelete: 'cascade' }),
    /** 拍到了第几张 */
    reachedFrame: integer('reached_frame').notNull(),
    /** 什么时候拍的（可回填过去时间） */
    happenedAt: text('happened_at').notNull(),
    cameraId: integer('camera_id').references(() => camera.id),
    lensId: integer('lens_id').references(() => lens.id),
    note: text('note'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_progress_roll').on(t.rollId, t.happenedAt)],
)

/** 单张注解（辅助）：所有业务字段均可空，与进度快照完全解耦 */
export const frameNote = sqliteTable(
  'frame_note',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rollId: integer('roll_id')
      .notNull()
      .references(() => roll.id, { onDelete: 'cascade' }),
    frameNo: integer('frame_no').notNull(),
    aperture: text('aperture'),
    shutter: text('shutter'),
    ei: integer('ei'),
    evOffset: text('ev_offset'),
    lensId: integer('lens_id').references(() => lens.id),
    location: text('location'),
    note: text('note'),
    photoPath: text('photo_path'),
    happenedAt: text('happened_at'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_frame_note_roll').on(t.rollId, t.frameNo)],
)

/** 冲洗记录 */
export const development = sqliteTable(
  'development',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rollId: integer('roll_id')
      .notNull()
      .references(() => roll.id, { onDelete: 'cascade' }),
    /** self=自冲 / lab=送店 */
    method: text('method').notNull(),
    process: text('process'),
    developer: text('developer'),
    dilution: text('dilution'),
    tempC: real('temp_c'),
    durationSec: integer('duration_sec'),
    agitation: text('agitation'),
    pushPull: integer('push_pull'),
    labName: text('lab_name'),
    devAt: text('dev_at'),
    rating: integer('rating'),
    issues: text('issues'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_dev_roll').on(t.rollId)],
)

/** 附件（照片等） */
export const asset = sqliteTable(
  'asset',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    rollId: integer('roll_id')
      .notNull()
      .references(() => roll.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    path: text('path').notNull(),
    thumbPath: text('thumb_path'),
    mime: text('mime'),
    size: integer('size'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_asset_roll').on(t.rollId)],
)
