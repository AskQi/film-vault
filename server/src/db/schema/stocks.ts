/**
 * 胶卷型号库（型录）。
 *
 * 客观层与个人层放在同一张表：两者严格 1:1，拆表只会多一次 JOIN。
 * 导入 seed 时只写客观层列，个人层永不覆盖。
 */
import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

export const filmStock = sqliteTable(
  'film_stock',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    // ── 客观层：导入可覆盖 ─────────────────────────────
    brandCode: text('brand_code').notNull(),
    seriesCode: text('series_code').notNull(),
    isoCode: text('iso_code').notNull(),
    iso: integer('iso').notNull(),
    formatCode: text('format_code').notNull(),
    format: text('format').notNull(),
    name: text('name').notNull(),
    nominalFrames: integer('nominal_frames'),
    defaultFrames: integer('default_frames'),
    process: text('process'),
    colorType: text('color_type'),
    status: text('status').notNull().default('active'),
    description: text('description'),

    // ── 个人层：导入永不覆盖 ───────────────────────────
    nickname: text('nickname'),
    usualEi: integer('usual_ei'),
    pushPullPref: text('push_pull_pref'),
    myRating: integer('my_rating'),
    myNotes: text('my_notes'),
    refPrice: real('ref_price'),
    /**
     * 收藏时间，空 = 未收藏。手动收藏或每次建档时写入当前时间，
     * 建档页按它倒序把常用型号排在最前。
     */
    favoritedAt: text('favorited_at'),

    // ── 元数据 ────────────────────────────────────
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('ux_stock_natural').on(t.brandCode, t.seriesCode, t.isoCode, t.formatCode),
    index('idx_stock_brand').on(t.brandCode),
  ],
)

/**
 * 前缀映射：前缀与型号是多对一。
 * 正常使用单前缀容量 6199 卷足够，is_primary=0 的备用前缀仅在极端情况使用。
 * seq_max 不用 MAX(seq) 实时聚合：删除卷后编号不被回收重用，批量分配可一次预留 N 个。
 */
export const stockPrefix = sqliteTable(
  'stock_prefix',
  {
    prefix: text('prefix').primaryKey(),
    stockId: integer('stock_id')
      .notNull()
      .references(() => filmStock.id, { onDelete: 'cascade' }),
    isPrimary: integer('is_primary').notNull().default(1),
    seqMax: integer('seq_max').notNull().default(0),
    note: text('note'),
  },
  (t) => [index('idx_prefix_stock').on(t.stockId)],
)

/** 条码绑定：一个型号可绑多个条码（不同地区、不同批次包装） */
export const stockBarcode = sqliteTable('stock_barcode', {
  barcode: text('barcode').primaryKey(),
  stockId: integer('stock_id')
    .notNull()
    .references(() => filmStock.id, { onDelete: 'cascade' }),
  source: text('source'),
  createdAt: text('created_at').notNull(),
})

/** 待认领：扫到但库里没有的前缀，不阻塞建档 */
export const pendingStock = sqliteTable('pending_stock', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  prefix: text('prefix').notNull().unique(),
  rawCode: text('raw_code'),
  barcode: text('barcode'),
  seenCount: integer('seen_count').notNull().default(1),
  createdAt: text('created_at').notNull(),
})
