/**
 * 码表 seed：品牌、画幅、ISO 码。幂等，可重复执行。
 */
import type { Db } from './client.js'
import { brand, formatCodeMap, isoCodeMap } from './schema/index.js'
import { BRANDS, FORMATS, ISO_EXCEPTIONS } from '@film-vault/shared'

/** 主规则 ISO 码：1-9 数字、10-35 字母 */
function primaryIsoRows(): { code: string; iso: number; isException: number }[] {
  const rows: { code: string; iso: number; isException: number }[] = []
  for (let v = 1; v <= 9; v++) rows.push({ code: String(v), iso: v * 100, isException: 0 })
  for (let v = 10; v <= 35; v++) {
    rows.push({ code: String.fromCharCode(65 + v - 10), iso: v * 100, isException: 0 })
  }
  for (const e of ISO_EXCEPTIONS) rows.push({ code: e.code, iso: e.iso, isException: 1 })
  return rows
}

export function seedCodebook(db: Db) {
  db.transaction((tx) => {
    tx.delete(brand).run()
    tx.delete(formatCodeMap).run()
    tx.delete(isoCodeMap).run()

    tx.insert(brand)
      .values(BRANDS.map((b, i) => ({ code: b.code, name: b.name, sort: i })))
      .run()

    tx.insert(formatCodeMap)
      .values(FORMATS.map((f) => ({ code: f.code, name: f.name, sort: f.sort })))
      .run()

    tx.insert(isoCodeMap).values(primaryIsoRows()).run()
  })
}
