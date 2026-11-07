/** 型号库：列表、详情、新建/编辑、字母占用表、条码绑定、下一个编号 */
import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq, isNull, like, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  BRANDS,
  FORMATS,
  STOCK_STATUSES,
  stockInputSchema,
  stockPersonalSchema,
  isoToCode,
  validatePrefix,
} from '@film-vault/shared'
import {
  filmStock,
  stockPrefix,
  stockBarcode,
  roll,
  pendingStock,
} from '../db/schema/index.js'
import { allocateSeq, peekNext, AllocationError } from '../lib/allocate.js'
import { parseImportText, suggestFreeLetters } from '../lib/text-import.js'

const listQuerySchema = z.object({
  q: z.string().optional(),
  brand: z.string().optional(),
  format: z.string().optional(),
  process: z.string().optional(),
  status: z.enum(STOCK_STATUSES).optional(),
})

/** 由品牌/系列/ISO/画幅拼前缀 */
function composePrefix(brand: string, series: string, iso: number, formatCode: string) {
  const isoCode = isoToCode(iso)
  if (!isoCode) {
    throw new Error(`ISO ${iso} 无法用单字符表示，请改用例外码覆盖的值`)
  }
  const prefix = `${brand}${series}${isoCode}${formatCode}`
  const check = validatePrefix(prefix)
  if (!check.ok) throw new Error(check.reason)
  return prefix
}

export const stocksRoutes: FastifyPluginAsync = async (app) => {
  // 列表：带每型号已有卷数、在拍卷数
  app.get('/', async (req) => {
    const query = listQuerySchema.parse(req.query)
    const db = app.db

    const where = [isNull(filmStock.deletedAt)]
    if (query.brand) where.push(eq(filmStock.brandCode, query.brand))
    if (query.format) where.push(eq(filmStock.formatCode, query.format))
    if (query.process) where.push(eq(filmStock.process, query.process))
    if (query.status) where.push(eq(filmStock.status, query.status))
    if (query.q) {
      const kw = `%${query.q}%`
      const cond = or(
        like(filmStock.name, kw),
        like(filmStock.nickname, kw),
        like(filmStock.brandCode, kw),
        like(filmStock.seriesCode, kw),
      )
      if (cond) where.push(cond)
    }

    const stocks = db
      .select()
      .from(filmStock)
      .where(and(...where))
      .orderBy(asc(filmStock.brandCode), asc(filmStock.seriesCode), asc(filmStock.iso))
      .all()

    const prefixes = db.select().from(stockPrefix).all()
    const prefixByStock = new Map<number, string>()
    for (const p of prefixes) {
      if (p.isPrimary === 1) prefixByStock.set(p.stockId, p.prefix)
    }

    const counts = db
      .select({
        stockId: roll.stockId,
        total: sql<number>`count(*)`,
        active: sql<number>`sum(case when ${roll.status} in ('loaded','partial') then 1 else 0 end)`,
      })
      .from(roll)
      .where(isNull(roll.deletedAt))
      .groupBy(roll.stockId)
      .all()
    const countByStock = new Map(counts.map((c) => [c.stockId, c]))

    return {
      items: stocks.map((s) => {
        const c = countByStock.get(s.id)
        return {
          ...s,
          prefix: prefixByStock.get(s.id) ?? null,
          rollCount: c?.total ?? 0,
          activeCount: c?.active ?? 0,
        }
      }),
    }
  })

  // 字母占用表：按品牌展示 A-Z 的占用情况
  app.get('/prefix-map', async () => {
    const db = app.db
    const rows = db
      .select({
        prefix: stockPrefix.prefix,
        isPrimary: stockPrefix.isPrimary,
        stockId: filmStock.id,
        name: filmStock.name,
        iso: filmStock.iso,
        formatCode: filmStock.formatCode,
        seriesCode: filmStock.seriesCode,
      })
      .from(stockPrefix)
      .innerJoin(filmStock, eq(stockPrefix.stockId, filmStock.id))
      .where(isNull(filmStock.deletedAt))
      .all()

    const pending = db.select().from(pendingStock).all()

    return {
      brands: BRANDS.map((b) => {
        const occupied = new Map<string, { stockId: number; name: string; iso: number; formatCode: string }>()
        for (const r of rows) {
          if (r.prefix[0] !== b.code || r.isPrimary !== 1) continue
          occupied.set(r.seriesCode, {
            stockId: r.stockId,
            name: r.name,
            iso: r.iso,
            formatCode: r.formatCode,
          })
        }
        return {
          brandCode: b.code,
          brandName: b.name,
          letters: Array.from({ length: 26 }, (_, i) => {
            const letter = String.fromCharCode(65 + i)
            const hit = occupied.get(letter)
            return {
              letter,
              stock: hit ?? null,
            }
          }),
        }
      }),
      formats: FORMATS,
      pending: pending.map((p) => ({ prefix: p.prefix, rawCode: p.rawCode, seenCount: p.seenCount })),
    }
  })

  // 详情
  app.get('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    if (!Number.isInteger(id)) return reply.code(400).send({ error: 'id 非法' })

    const db = app.db
    const stock = db
      .select()
      .from(filmStock)
      .where(and(eq(filmStock.id, id), isNull(filmStock.deletedAt)))
      .get()
    if (!stock) return reply.code(404).send({ error: '型号不存在' })

    const prefixes = db.select().from(stockPrefix).where(eq(stockPrefix.stockId, id)).all()
    const barcodes = db.select().from(stockBarcode).where(eq(stockBarcode.stockId, id)).all()
    const rolls = db
      .select()
      .from(roll)
      .where(and(eq(roll.stockId, id), isNull(roll.deletedAt)))
      .orderBy(desc(roll.seq))
      .all()

    const primary = prefixes.find((p) => p.isPrimary === 1) ?? null

    return {
      ...stock,
      prefixes,
      barcodes,
      rolls,
      next: primary ? peekNext(db, primary.prefix) : null,
    }
  })

  // 新建
  app.post('/', async (req, reply) => {
    const input = stockInputSchema.parse(req.body)
    const db = app.db

    let prefix: string
    try {
      prefix = composePrefix(input.brandCode, input.seriesCode, input.iso, input.formatCode)
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }

    const clash = db.select().from(stockPrefix).where(eq(stockPrefix.prefix, prefix)).get()
    if (clash) {
      return reply.code(409).send({
        error: `前缀 ${prefix} 已被占用，请换一个系列字母`,
        prefix,
      })
    }

    const now = new Date().toISOString()
    const isoCode = prefix[2]!
    const format = FORMATS.find((f) => f.code === input.formatCode)?.name ?? input.formatCode

    const created = db.transaction((tx) => {
      const stock = tx
        .insert(filmStock)
        .values({
          brandCode: input.brandCode,
          seriesCode: input.seriesCode,
          isoCode,
          iso: input.iso,
          formatCode: input.formatCode,
          format,
          name: input.name,
          nominalFrames: input.nominalFrames ?? null,
          defaultFrames: input.defaultFrames ?? input.nominalFrames ?? null,
          process: input.process ?? null,
          colorType: input.colorType ?? null,
          status: input.status ?? 'active',
          description: input.description ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()

      tx.insert(stockPrefix)
        .values({ prefix, stockId: stock!.id, isPrimary: 1, seqMax: 0 })
        .run()

      return stock
    })

    return reply.code(201).send({ ...created, prefix })
  })

  // 编辑客观层 + 个人层
  app.patch('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const stock = db.select().from(filmStock).where(eq(filmStock.id, id)).get()
    if (!stock) return reply.code(404).send({ error: '型号不存在' })

    const body = req.body as Record<string, unknown>
    const patch: Record<string, unknown> = {}

    // 个人层字段
    const personal = stockPersonalSchema.partial().safeParse(body)
    if (personal.success) {
      const map: Record<string, string> = {
        nickname: 'nickname',
        usualEi: 'usualEi',
        pushPullPref: 'pushPullPref',
        myRating: 'myRating',
        myNotes: 'myNotes',
        refPrice: 'refPrice',
      }
      for (const [k, v] of Object.entries(personal.data)) {
        if (v !== undefined) patch[map[k]!] = v
      }
    }

    // 客观层字段（name / description / status / process 等）
    const objective = stockInputSchema.partial().safeParse(body)
    if (objective.success) {
      const d = objective.data
      if (d.name !== undefined) patch.name = d.name
      if (d.description !== undefined) patch.description = d.description
      if (d.status !== undefined) patch.status = d.status
      if (d.process !== undefined) patch.process = d.process
      if (d.colorType !== undefined) patch.colorType = d.colorType
      if (d.nominalFrames !== undefined) patch.nominalFrames = d.nominalFrames
      if (d.defaultFrames !== undefined) patch.defaultFrames = d.defaultFrames
    }

    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: '没有可更新的字段' })
    }

    patch.updatedAt = new Date().toISOString()
    const updated = db
      .update(filmStock)
      .set(patch)
      .where(eq(filmStock.id, id))
      .returning()
      .get()

    return updated
  })

  // 软删除
  app.delete('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const has = db.select().from(filmStock).where(eq(filmStock.id, id)).get()
    if (!has) return reply.code(404).send({ error: '型号不存在' })

    db.update(filmStock)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(filmStock.id, id))
      .run()
    return { ok: true }
  })

  // 下一个可用编号
  app.get('/:id/next-serial', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const primary = db
      .select()
      .from(stockPrefix)
      .where(and(eq(stockPrefix.stockId, id), eq(stockPrefix.isPrimary, 1)))
      .get()
    if (!primary) return reply.code(404).send({ error: '该型号没有主前缀' })

    try {
      const next = peekNext(db, primary.prefix)
      return { prefix: primary.prefix, ...next }
    } catch (e) {
      if (e instanceof AllocationError) return reply.code(409).send({ error: e.message })
      throw e
    }
  })

  // 批量预留（供建档页预览）
  app.post('/:id/reserve', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({ count: z.number().int().min(1).max(50), onConflict: z.enum(['skip', 'append']).default('append') })
      .parse(req.body)

    const db = app.db
    const primary = db
      .select()
      .from(stockPrefix)
      .where(and(eq(stockPrefix.stockId, id), eq(stockPrefix.isPrimary, 1)))
      .get()
    if (!primary) return reply.code(404).send({ error: '该型号没有主前缀' })

    try {
      const allocated = allocateSeq(db, {
        prefix: primary.prefix,
        count: body.count,
        onConflict: body.onConflict,
      })
      return { prefix: primary.prefix, rolls: allocated }
    } catch (e) {
      if (e instanceof AllocationError) return reply.code(409).send({ error: e.message })
      throw e
    }
  })

  // 条码绑定
  app.post('/:id/barcodes', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = z.object({ barcode: z.string().regex(/^\d{6,14}$/), source: z.string().optional() }).parse(req.body)

    const db = app.db
    const stock = db.select().from(filmStock).where(eq(filmStock.id, id)).get()
    if (!stock) return reply.code(404).send({ error: '型号不存在' })

    const existing = db.select().from(stockBarcode).where(eq(stockBarcode.barcode, body.barcode)).get()
    if (existing) {
      if (existing.stockId === id) return { ok: true }
      return reply.code(409).send({ error: '该条码已绑定到其他型号' })
    }

    db.insert(stockBarcode)
      .values({
        barcode: body.barcode,
        stockId: id,
        source: body.source ?? 'manual',
        createdAt: new Date().toISOString(),
      })
      .run()
    return reply.code(201).send({ ok: true })
  })

  app.delete('/barcodes/:barcode', async (req) => {
    const barcode = (req.params as { barcode: string }).barcode
    app.db.delete(stockBarcode).where(eq(stockBarcode.barcode, barcode)).run()
    return { ok: true }
  })

  // 待认领列表
  app.get('/pending', async () => {
    const rows = app.db.select().from(pendingStock).orderBy(desc(pendingStock.seenCount)).all()
    return { items: rows }
  })

  // 认领：把一个待认领前缀挂到已有型号，或新建型号
  app.post('/pending/:id/claim', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({
        stockId: z.number().int().positive().optional(),
        newStock: z
          .object({
            seriesCode: z.string().length(1).regex(/^[A-Z]$/),
            name: z.string().min(1),
            nominalFrames: z.number().int().min(1).max(200).nullable().optional(),
            process: z.string().max(20).nullable().optional(),
            colorType: z.enum(['color_negative', 'color_positive', 'bw']).nullable().optional(),
          })
          .optional(),
      })
      .parse(req.body)

    const db = app.db
    const pending = db.select().from(pendingStock).where(eq(pendingStock.id, id)).get()
    if (!pending) return reply.code(404).send({ error: '待认领记录不存在' })

    const check = validatePrefix(pending.prefix)
    if (!check.ok) {
      return reply.code(400).send({ error: `该前缀不合法：${check.reason}` })
    }

    const now = new Date().toISOString()

    try {
      const result = db.transaction((tx) => {
        let stockId: number

        if (body.stockId) {
          const stock = tx.select().from(filmStock).where(eq(filmStock.id, body.stockId)).get()
          if (!stock) throw new Error('目标型号不存在')
          if (
            stock.brandCode !== check.brand ||
            stock.seriesCode !== check.series ||
            stock.iso !== check.iso ||
            stock.formatCode !== check.formatCode
          ) {
            throw new Error('该前缀与目标型号的品牌/系列/感光度/画幅不一致')
          }
          stockId = stock.id
        } else if (body.newStock) {
          const existingPrefix = tx
            .select()
            .from(stockPrefix)
            .where(eq(stockPrefix.prefix, pending.prefix))
            .get()
          if (existingPrefix) throw new Error(`前缀 ${pending.prefix} 已被占用`)

          const created = tx
            .insert(filmStock)
            .values({
              brandCode: check.brand,
              seriesCode: body.newStock.seriesCode,
              isoCode: check.isoCode,
              iso: check.iso,
              formatCode: check.formatCode,
              format: check.format,
              name: body.newStock.name,
              nominalFrames: body.newStock.nominalFrames ?? null,
              defaultFrames: body.newStock.nominalFrames ?? null,
              process: body.newStock.process ?? null,
              colorType: body.newStock.colorType ?? null,
              status: 'active',
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: filmStock.id })
            .get()
          stockId = created!.id
        } else {
          throw new Error('请指定 stockId 或 newStock')
        }

        // 挂上前缀（若该前缀尚未登记）
        const existingPrefix = tx
          .select()
          .from(stockPrefix)
          .where(eq(stockPrefix.prefix, pending.prefix))
          .get()
        if (!existingPrefix) {
          const hasPrimary = tx
            .select()
            .from(stockPrefix)
            .where(and(eq(stockPrefix.stockId, stockId), eq(stockPrefix.isPrimary, 1)))
            .get()
          tx.insert(stockPrefix)
            .values({
              prefix: pending.prefix,
              stockId,
              isPrimary: hasPrimary ? 0 : 1,
              seqMax: 0,
              note: '由待认领转入',
            })
            .run()
        }

        tx.delete(pendingStock).where(eq(pendingStock.id, id)).run()
        return { stockId, prefix: pending.prefix }
      })

      return result
    } catch (e) {
      return reply.code(400).send({ error: (e as Error).message })
    }
  })

  // 忽略待认领（比如误扫）
  app.delete('/pending/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    app.db.delete(pendingStock).where(eq(pendingStock.id, id)).run()
    return { ok: true }
  })

  // 文本批量导入：先解析预览，确认后再落库
  app.post('/import/text', async (req, reply) => {
    const body = z.object({ text: z.string().min(1), commit: z.boolean().default(false) }).parse(req.body)
    const db = app.db

    const parsed = parseImportText(body.text)
    const taken = new Set(db.select({ prefix: stockPrefix.prefix }).from(stockPrefix).all().map((r) => r.prefix))

    const results = parsed.map((line) => {
      if (!line.ok || !line.draft) return line

      const prefix = line.suggestedPrefix!
      if (taken.has(prefix)) {
        const candidates = suggestFreeLetters(
          line.draft.brandCode,
          prefix[2]!,
          line.draft.formatCode,
          taken,
        )
        return {
          ...line,
          ok: false,
          error: `前缀 ${prefix} 已被占用`,
          candidates,
          prefixNote: candidates.length
            ? `可改用系列字母：${candidates.join(' / ')}`
            : '该品牌在此 ISO 与画幅下已无空闲字母',
        }
      }
      taken.add(prefix)
      return line
    })

    if (!body.commit) {
      return {
        committed: false,
        total: results.length,
        okCount: results.filter((r) => r.ok).length,
        lines: results,
      }
    }

    const now = new Date().toISOString()
    const inserted: { id: number; prefix: string; name: string }[] = []

    db.transaction((tx) => {
      for (const line of results) {
        if (!line.ok || !line.draft) continue
        const d = line.draft
        const prefix = line.suggestedPrefix!
        const stock = tx
          .insert(filmStock)
          .values({
            brandCode: d.brandCode,
            seriesCode: d.seriesCode,
            isoCode: prefix[2]!,
            iso: d.iso,
            formatCode: d.formatCode,
            format: d.format,
            name: d.name,
            nominalFrames: d.nominalFrames,
            defaultFrames: d.nominalFrames,
            process: d.process,
            colorType: d.colorType,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: filmStock.id })
          .get()
        tx.insert(stockPrefix)
          .values({ prefix, stockId: stock!.id, isPrimary: 1, seqMax: 0 })
          .run()
        inserted.push({ id: stock!.id, prefix, name: d.name })
      }
    })

    return {
      committed: true,
      total: results.length,
      okCount: results.filter((r) => r.ok).length,
      inserted,
      lines: results,
    }
  })

  // CSV 导出：客观层 + 个人层，UTF-8 带 BOM 便于 Excel 打开中文
  app.get('/export.csv', async (_req, reply) => {
    const db = app.db
    const rows = db
      .select({
        prefix: stockPrefix.prefix,
        stock: filmStock,
      })
      .from(stockPrefix)
      .innerJoin(filmStock, eq(stockPrefix.stockId, filmStock.id))
      .where(and(eq(stockPrefix.isPrimary, 1), isNull(filmStock.deletedAt)))
      .all()

    const header = [
      'prefix',
      'brand_code',
      'series_code',
      'iso_code',
      'iso',
      'format_code',
      'format',
      'name',
      'nominal_frames',
      'process',
      'color_type',
      'status',
      'nickname',
      'usual_ei',
      'push_pull_pref',
      'my_rating',
      'my_notes',
      'ref_price',
    ]

    const esc = (v: unknown): string => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }

    const lines = [header.join(',')]
    for (const { prefix, stock } of rows) {
      lines.push(
        [
          prefix,
          stock.brandCode,
          stock.seriesCode,
          stock.isoCode,
          stock.iso,
          stock.formatCode,
          stock.format,
          stock.name,
          stock.nominalFrames,
          stock.process,
          stock.colorType,
          stock.status,
          stock.nickname,
          stock.usualEi,
          stock.pushPullPref,
          stock.myRating,
          stock.myNotes,
          stock.refPrice,
        ]
          .map(esc)
          .join(','),
      )
    }

    reply
      .type('text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="film-stocks-${new Date().toISOString().slice(0, 10)}.csv"`)
    return '﻿' + lines.join('\r\n')
  })

}
