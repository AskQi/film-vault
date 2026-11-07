/**
 * 型号库种子导入。
 *
 * 规则：只覆盖客观层，个人层（nickname / usual_ei / my_rating / my_notes …）永不覆盖。
 * 以 prefix 为键做 upsert：已存在则更新客观列，不存在则新建。
 */
import type { Db } from './client.js'
import { filmStock, stockPrefix, filmSeries, stockBarcode } from './schema/index.js'
import { eq, inArray } from 'drizzle-orm'
import type { StockRow } from './stocks-tsv.js'
import { barcodeCandidates, normalizeBarcode } from '../lib/barcode.js'

export interface ImportResult {
  inserted: number
  updated: number
  seriesInserted: number
  barcodesBound: number
}

export function importStocks(db: Db, rows: StockRow[], now = new Date().toISOString()): ImportResult {
  let inserted = 0
  let updated = 0
  let seriesInserted = 0
  let barcodesBound = 0

  db.transaction((tx) => {
    // 系列码表：品牌内唯一的系列字母，补全缺失项
    const knownSeries = new Set(
      tx.select().from(filmSeries).all().map((s) => `${s.brandCode}:${s.code}`),
    )

    /**
     * 把 TSV 里写的条码绑定到型号。
     * 已被别的型号占用的条码跳过并计数，不覆盖已有绑定。
     */
    function bindBarcodes(row: StockRow, stockId: number) {
      for (const raw of row.barcodes) {
        const barcode = normalizeBarcode(raw)
        if (!barcode) continue

        const taken = tx
          .select()
          .from(stockBarcode)
          .where(inArray(stockBarcode.barcode, barcodeCandidates(raw)))
          .get()
        if (taken) {
          if (taken.stockId === stockId) continue
          continue
        }

        tx.insert(stockBarcode)
          .values({ barcode, stockId, source: 'seed', createdAt: now })
          .run()
        barcodesBound++
      }
    }

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

      /** 本行最终归属的型号 id，用于绑定条码 */
      let stockId: number | null = existingPrefix?.stockId ?? null

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
        stockId = existingPrefix.stockId
        updated++
        bindBarcodes(row, stockId)
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
        stockId = existingStock.id
        updated++
        bindBarcodes(row, stockId)
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
      stockId = created!.id
      inserted++
      bindBarcodes(row, stockId)
    }
  })

  return { inserted, updated, seriesInserted, barcodesBound }
}
