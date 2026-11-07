/**
 * 型号库种子导入。
 *
 * 规则：只覆盖客观层，个人层（nickname / usual_ei / my_rating / my_notes …）永不覆盖。
 * 以 prefix 为键做 upsert：已存在则更新客观列，不存在则新建。
 */
import type { Db } from './client.js'
import { filmStock, stockPrefix, filmSeries } from './schema/index.js'
import { eq } from 'drizzle-orm'
import type { StockRow } from './stocks-tsv.js'

export interface ImportResult {
  inserted: number
  updated: number
  seriesInserted: number
}

export function importStocks(db: Db, rows: StockRow[], now = new Date().toISOString()): ImportResult {
  let inserted = 0
  let updated = 0
  let seriesInserted = 0

  db.transaction((tx) => {
    // 系列码表：品牌内唯一的系列字母，补全缺失项
    const knownSeries = new Set(
      tx.select().from(filmSeries).all().map((s) => `${s.brandCode}:${s.code}`),
    )

    for (const row of rows) {
      const key = `${row.brandCode}:${row.seriesCode}`
      if (!knownSeries.has(key)) {
        tx.insert(filmSeries)
          .values({ brandCode: row.brandCode, code: row.seriesCode, name: row.seriesName })
          .run()
        knownSeries.add(key)
        seriesInserted++
      }

      const existingPrefix = tx
        .select()
        .from(stockPrefix)
        .where(eq(stockPrefix.prefix, row.prefix))
        .get()

      // 客观层：导入时总是覆盖
      const objective = {
        brandCode: row.brandCode,
        seriesCode: row.seriesCode,
        isoCode: row.prefix[2]!,
        iso: row.iso,
        formatCode: row.formatCode,
        format: row.format,
        name: row.name,
        nominalFrames: row.nominalFrames,
        defaultFrames: row.nominalFrames,
        process: row.process,
        colorType: row.colorType,
        status: row.status,
        description: row.notes,
        updatedAt: now,
      }

      if (existingPrefix) {
        // 已存在该前缀 → 更新所属型号的客观层，个人层不动
        tx.update(filmStock)
          .set(objective)
          .where(eq(filmStock.id, existingPrefix.stockId))
          .run()
        updated++
        continue
      }

      // 前缀不存在：先看型号（自然键）是否已存在
      const existingStock = tx
        .select()
        .from(filmStock)
        .where(eq(filmStock.brandCode, row.brandCode))
        .all()
        .find(
          (s) =>
            s.seriesCode === row.seriesCode &&
            s.isoCode === row.prefix[2] &&
            s.formatCode === row.formatCode,
        )

      if (existingStock) {
        tx.update(filmStock).set(objective).where(eq(filmStock.id, existingStock.id)).run()
        tx.insert(stockPrefix)
          .values({ prefix: row.prefix, stockId: existingStock.id, isPrimary: 1, seqMax: 0 })
          .run()
        updated++
        continue
      }

      const created = tx
        .insert(filmStock)
        .values({
          ...objective,
          createdAt: now,
        })
        .returning({ id: filmStock.id })
        .get()

      tx.insert(stockPrefix)
        .values({ prefix: row.prefix, stockId: created!.id, isPrimary: 1, seqMax: 0 })
        .run()
      inserted++
    }
  })

  return { inserted, updated, seriesInserted }
}
