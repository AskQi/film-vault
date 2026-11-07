/** 建档：单卷 / 批量 / 列表 / 详情 / 编辑 / 状态流转 */
import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq, isNull, like, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  ROLL_STATUSES,
  batchRollInputSchema,
  rollCodeSchema,
  parseRollCode,
  serialFromSeq,
  type RollStatus,
} from '@film-vault/shared'
import { roll, box, filmStock, stockPrefix, rollProgress } from '../db/schema/index.js'
import { allocateSeq, AllocationError } from '../lib/allocate.js'
import { findStockByPrefix, recordPending } from '../lib/stocks.js'

const createRollSchema = z.object({
  code: rollCodeSchema,
  framesTotal: z.number().int().min(1).max(200).optional(),
  boxId: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  purchasedAt: z.string().nullable().optional(),
  unitPrice: z.number().min(0).nullable().optional(),
  source: z.string().max(120).nullable().optional(),
  storage: z.string().max(120).nullable().optional(),
})

const listQuerySchema = z.object({
  status: z.string().optional(),
  stock: z.coerce.number().int().positive().optional(),
  prefix: z.string().optional(),
  camera: z.coerce.number().int().positive().optional(),
  q: z.string().optional(),
  /** 时间区间：按建档时间过滤，闭区间 */
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export const rollRoutes: FastifyPluginAsync = async (app) => {
  // 列表：附当前进度（MAX(reached_frame)）
  app.get('/', async (req) => {
    const q = listQuerySchema.parse(req.query)
    const db = app.db

    const where = [isNull(roll.deletedAt)]
    if (q.status) {
      const statuses = q.status.split(',') as RollStatus[]
      where.push(sql`${roll.status} in ${statuses}`)
    }
    if (q.stock) where.push(eq(roll.stockId, q.stock))
    if (q.prefix) where.push(eq(roll.prefix, q.prefix))
    if (q.camera) where.push(eq(roll.cameraId, q.camera))
    if (q.q) where.push(like(roll.code, `%${q.q}%`))
    if (q.from) where.push(sql`${roll.createdAt} >= ${q.from}`)
    if (q.to) where.push(sql`${roll.createdAt} <= ${q.to}`)

    const rows = db
      .select({
        id: roll.id,
        code: roll.code,
        prefix: roll.prefix,
        serialTxt: roll.serialTxt,
        seq: roll.seq,
        framesTotal: roll.framesTotal,
        status: roll.status,
        stockId: roll.stockId,
        stockName: filmStock.name,
        format: filmStock.format,
        iso: filmStock.iso,
        loadedAt: roll.loadedAt,
        finishedAt: roll.finishedAt,
        updatedAt: roll.updatedAt,
        reachedFrame: sql<number>`coalesce((select max(${rollProgress.reachedFrame}) from ${rollProgress} where ${rollProgress.rollId} = ${roll.id}), 0)`,
      })
      .from(roll)
      .innerJoin(filmStock, eq(roll.stockId, filmStock.id))
      .where(and(...where))
      .orderBy(desc(roll.updatedAt))
      .limit(q.limit)
      .all()

    return { items: rows }
  })

  // 单卷建档
  app.post('/', async (req, reply) => {
    const input = createRollSchema.parse(req.body)
    const db = app.db

    const parsed = parseRollCode(input.code)
    if (!parsed.ok) {
      return reply.code(400).send({ error: parsed.detail })
    }

    const existing = db.select().from(roll).where(eq(roll.code, parsed.code)).get()
    if (existing) {
      return reply.code(409).send({ error: `编号 ${parsed.code} 已建档`, rollId: existing.id })
    }

    const stock = findStockByPrefix(db, parsed.prefix)
    if (!stock) {
      // 未知前缀不阻塞建档：先落待认领，型号留空由事后补齐
      recordPending(db, parsed.prefix, parsed.code)
      return reply.code(422).send({
        error: `型号前缀 ${parsed.prefix} 尚未入库，已记为待认领。请先在型号库补齐该型号。`,
        prefix: parsed.prefix,
        pending: true,
      })
    }

    const framesTotal = input.framesTotal ?? stock.framesTotal ?? 36
    const now = new Date().toISOString()

    const created = db.transaction((tx) => {
      let boxId = input.boxId ?? null
      if (!boxId && (input.purchasedAt || input.unitPrice || input.source || input.storage)) {
        const b = tx
          .insert(box)
          .values({
            stockId: stock.id,
            purchasedAt: input.purchasedAt ?? null,
            unitPrice: input.unitPrice ?? null,
            source: input.source ?? null,
            storage: input.storage ?? null,
            createdAt: now,
          })
          .returning({ id: box.id })
          .get()
        boxId = b!.id
      }

      const r = tx
        .insert(roll)
        .values({
          code: parsed.code,
          prefix: parsed.prefix,
          serialTxt: parsed.serialTxt,
          seq: parsed.seq,
          stockId: stock.id,
          boxId,
          framesTotal,
          status: 'unopened',
          notes: input.notes ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get()

      // 手动建档也要推进 seq_max，避免后续批量分配到已占用的号
      const p = tx.select().from(stockPrefix).where(eq(stockPrefix.prefix, parsed.prefix)).get()
      if (p && parsed.seq > p.seqMax) {
        tx.update(stockPrefix).set({ seqMax: parsed.seq }).where(eq(stockPrefix.prefix, parsed.prefix)).run()
      }

      // 建档即收藏：刷新收藏时间，让常用型号在建档页排在最前
      tx.update(filmStock).set({ favoritedAt: now }).where(eq(filmStock.id, stock.id)).run()

      return r
    })

    return reply.code(201).send(created)
  })

  // 批量建档：一盒多卷，编号递增
  app.post('/batch', async (req, reply) => {
    const input = batchRollInputSchema.parse(req.body)
    const db = app.db

    const stock = findStockByPrefix(db, input.prefix)
    if (!stock) {
      recordPending(db, input.prefix, input.prefix)
      return reply.code(422).send({
        error: `型号前缀 ${input.prefix} 尚未入库，已记为待认领。`,
        pending: true,
      })
    }

    const now = new Date().toISOString()

    try {
      const result = db.transaction((tx) => {
        // 建档即收藏（同单卷建档）
        tx.update(filmStock).set({ favoritedAt: now }).where(eq(filmStock.id, stock.id)).run()

        const allocated = allocateSeq(tx, {
          prefix: input.prefix,
          startSeq: input.startSeq,
          count: input.count,
          onConflict: input.onConflict,
        })

        let boxId: number | null = null
        if (input.box) {
          const b = tx
            .insert(box)
            .values({
              stockId: stock.id,
              label: input.box.label ?? null,
              purchasedAt: input.box.purchasedAt ?? null,
              unitPrice: input.box.unitPrice ?? null,
              source: input.box.source ?? null,
              storage: input.box.storage ?? null,
              notes: input.box.notes ?? null,
              createdAt: now,
            })
            .returning({ id: box.id })
            .get()
          boxId = b!.id
        }

        const inserted = allocated.map((a) =>
          tx
            .insert(roll)
            .values({
              code: a.code,
              prefix: input.prefix,
              serialTxt: a.serialTxt,
              seq: a.seq,
              stockId: stock.id,
              boxId,
              framesTotal: input.framesTotal,
              status: 'unopened',
              createdAt: now,
              updatedAt: now,
            })
            .returning()
            .get()!,
        )

        return { boxId, rolls: inserted }
      })

      return reply.code(201).send({
        stock: { id: stock.id, name: stock.name, prefix: input.prefix },
        boxId: result.boxId,
        rolls: result.rolls,
      })
    } catch (e) {
      if (e instanceof AllocationError) return reply.code(409).send({ error: e.message })
      throw e
    }
  })

  // 详情：型号 + 当前进度 + 时间线
  app.get('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db

    const r = db.select().from(roll).where(and(eq(roll.id, id), isNull(roll.deletedAt))).get()
    if (!r) return reply.code(404).send({ error: '胶卷不存在' })

    const stock = db.select().from(filmStock).where(eq(filmStock.id, r.stockId)).get()
    const progress = db
      .select()
      .from(rollProgress)
      .where(eq(rollProgress.rollId, id))
      .orderBy(asc(rollProgress.happenedAt))
      .all()

    const reachedFrame = progress.reduce((max, p) => Math.max(max, p.reachedFrame), 0)

    return { ...r, stock, reachedFrame, remaining: Math.max(0, r.framesTotal - reachedFrame), progress }
  })

  // 编辑
  app.patch('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({
        framesTotal: z.number().int().min(1).max(200).optional(),
        status: z.enum(ROLL_STATUSES).optional(),
        cameraId: z.number().int().positive().nullable().optional(),
        lensId: z.number().int().positive().nullable().optional(),
        ei: z.number().int().min(1).nullable().optional(),
        pushPull: z.number().int().min(-3).max(3).optional(),
        notes: z.string().max(2000).nullable().optional(),
        expiryDate: z.string().nullable().optional(),
        loadedAt: z.string().nullable().optional(),
        finishedAt: z.string().nullable().optional(),
      })
      .parse(req.body)

    const db = app.db
    const existing = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '胶卷不存在' })

    const updated = db
      .update(roll)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(roll.id, id))
      .returning()
      .get()

    return updated
  })

  // 拍完
  app.post('/:id/finish', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const existing = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '胶卷不存在' })

    const now = new Date().toISOString()
    return db
      .update(roll)
      .set({ status: 'exposed', finishedAt: now, updatedAt: now })
      .where(eq(roll.id, id))
      .returning()
      .get()
  })

  // 软删除
  app.delete('/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const existing = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '胶卷不存在' })

    db.update(roll)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(roll.id, id))
      .run()
    return { ok: true }
  })
}
