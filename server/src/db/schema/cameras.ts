/** 机身与镜头库 */
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const camera = sqliteTable('camera', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  mount: text('mount'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
})

export const lens = sqliteTable('lens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  brand: text('brand').notNull(),
  model: text('model').notNull(),
  mount: text('mount'),
  focalMm: integer('focal_mm'),
  maxAperture: real('max_aperture'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
})
