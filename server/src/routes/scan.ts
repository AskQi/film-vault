/** 扫码分流：编号 / 未知前缀 / 包装条码 / 无法识别 */
import type { FastifyPluginAsync } from 'fastify'
import { scanInputSchema } from '@film-vault/shared'
import { eq, inArray } from 'drizzle-orm'
import { resolveScan } from '../lib/stocks.js'
import { stockBarcode, filmStock, roll } from '../db/schema/index.js'
import { barcodeCandidates, normalizeBarcode } from '../lib/barcode.js'

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.post('/scan', async (req, reply) => {
    const input = scanInputSchema.safeParse(req.body)
    if (!input.success) {
      return reply.code(400).send({ error: '请输入或扫描内容' })
    }

    const db = app.db
    const result = resolveScan(db, input.data.raw)

    switch (result.kind) {
      case 'barcode': {
        // UPC-A(12) 与 EAN-13(13) 是同一个商品，扫码器给哪种都可能，
        // 因此把两种写法都查一遍，才能命中按任一形式绑定的记录
        const candidates = barcodeCandidates(result.barcode)
        const hit = db
          .select({
            stockId: filmStock.id,
            name: filmStock.name,
            brandCode: filmStock.brandCode,
            format: filmStock.format,
          })
          .from(stockBarcode)
          .innerJoin(filmStock, eq(stockBarcode.stockId, filmStock.id))
          .where(inArray(stockBarcode.barcode, candidates))
          .get()

        return hit
          ? { kind: 'barcode', barcode: normalizeBarcode(result.barcode), stock: hit, known: true }
          : { kind: 'barcode', barcode: normalizeBarcode(result.barcode), stock: null, known: false }
      }

      case 'roll': {
        const existing = db.select().from(roll).where(eq(roll.code, result.code)).get()
        return {
          kind: 'roll',
          code: result.code,
          prefix: result.prefix,
          seq: result.seq,
          serialTxt: result.serialTxt,
          stock: result.stock,
          /** 该卷是否已建档 */
          existing: existing
            ? { id: existing.id, status: existing.status, framesTotal: existing.framesTotal }
            : null,
        }
      }

      case 'unknown_prefix':
        return {
          kind: 'unknown_prefix',
          code: result.code,
          prefix: result.prefix,
          seq: result.seq,
          serialTxt: result.serialTxt,
          hint: '该前缀在型号库中不存在，已记为待认领。可先建档，事后再在型号库补齐型号。',
        }

      case 'invalid':
        return reply.code(422).send({
          kind: 'invalid',
          error: result.reason,
          raw: result.raw,
        })
    }
  })
}
