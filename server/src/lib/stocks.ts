/**
 * 服务端独享的数据库服务：编号解析要查库，所以放在这里而不是 shared。
 */
import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { filmStock, stockPrefix, pendingStock } from '../db/schema/index.js'
import { parseRollCode, type RollCodeParse } from '@film-vault/shared'

export interface StockWithPrefix {
  id: number
  name: string
  brandCode: string
  seriesCode: string
  iso: number
  formatCode: string
  format: string
  /** 建档默认张数（120 等由片盒决定时为空） */
  framesTotal: number | null
  prefix: string
  seqMax: number
}

export function findStockByPrefix(db: Db, prefix: string): StockWithPrefix | null {
  const row = db
    .select({
      id: filmStock.id,
      name: filmStock.name,
      brandCode: filmStock.brandCode,
      seriesCode: filmStock.seriesCode,
      iso: filmStock.iso,
      formatCode: filmStock.formatCode,
      format: filmStock.format,
      framesTotal: filmStock.defaultFrames,
      prefix: stockPrefix.prefix,
      seqMax: stockPrefix.seqMax,
    })
    .from(stockPrefix)
    .innerJoin(filmStock, eq(stockPrefix.stockId, filmStock.id))
    .where(and(eq(stockPrefix.prefix, prefix), isNull(filmStock.deletedAt)))
    .get()
  return row ?? null
}

/** 记录一次未知前缀的出现（不阻塞建档，供事后在型号库消化） */
export function recordPending(db: Db, prefix: string, rawCode: string) {
  const existing = db.select().from(pendingStock).where(eq(pendingStock.prefix, prefix)).get()
  if (existing) {
    db.update(pendingStock)
      .set({ seenCount: existing.seenCount + 1 })
      .where(eq(pendingStock.id, existing.id))
      .run()
    return
  }
  db.insert(pendingStock)
    .values({
      prefix,
      rawCode,
      seenCount: 1,
      createdAt: new Date().toISOString(),
    })
    .run()
}

export type ResolvedScan =
  | ({ kind: 'roll' } & Extract<RollCodeParse, { ok: true }> & { stock: StockWithPrefix })
  | ({ kind: 'unknown_prefix'; stock: null } & Extract<RollCodeParse, { ok: true }>)
  | { kind: 'invalid'; reason: string; raw: string }
  | { kind: 'barcode'; barcode: string }

/** 判断 8-14 位纯数字是否 EAN/UPC */
export function isBarcode(s: string): boolean {
  return /^\d{8,14}$/.test(s.trim())
}

/**
 * 扫码分流：编号 / 未知前缀 / 包装条码 / 无法识别。
 * 不判断该卷是否已建档，那是路由层的事。
 */
export function resolveScan(db: Db, raw: string): ResolvedScan {
  const trimmed = raw.trim()

  if (isBarcode(trimmed)) {
    return { kind: 'barcode', barcode: trimmed }
  }

  const parsed = parseRollCode(raw)
  if (!parsed.ok) {
    return { kind: 'invalid', reason: parsed.detail, raw }
  }

  const stock = findStockByPrefix(db, parsed.prefix)
  if (!stock) {
    recordPending(db, parsed.prefix, parsed.code)
    return { kind: 'unknown_prefix', stock: null, ...parsed }
  }

  return { kind: 'roll', stock, ...parsed }
}
