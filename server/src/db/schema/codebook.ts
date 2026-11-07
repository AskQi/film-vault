/**
 * 码表：完全由代码维护，不随用户数据变化。
 * 与 shared/src/constants.ts 保持一致，seed 时写入。
 */
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const brand = sqliteTable('brand', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
})

export const filmSeries = sqliteTable('film_series', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  brandCode: text('brand_code').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
})

export const isoCodeMap = sqliteTable('iso_code_map', {
  code: text('code').primaryKey(),
  iso: integer('iso').notNull(),
  isException: integer('is_exception').notNull().default(0),
})

export const formatCodeMap = sqliteTable('format_code_map', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
})
