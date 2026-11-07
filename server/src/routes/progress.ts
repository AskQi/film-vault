/** 进度快照：新增 / 编辑 / 删除 / 按时间线查询 */
import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { parseRollCode, progressInputSchema } from '@film-vault/shared'
import { roll, rollProgress } from '../db/schema/index.js'
import { ProgressError, recordProgress } from '../lib/progress.js'

export const progressRoutes: FastifyPluginAsync = async (app) => {
  // 某卷的进度时间线
  app.get('/rolls/:id/progress', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db

    const r = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!r) return reply.code(404).send({ error: '胶卷不存在' })

    const items = db
      .select()
      .from(rollProgress)
      .where(eq(rollProgress.rollId, id))
      .orderBy(desc(rollProgress.happenedAt))
      .all()

    const reachedFrame = items.reduce((m, p) => Math.max(m, p.reachedFrame), 0)
    return { items, reachedFrame, framesTotal: r.framesTotal }
  })

  // 记一笔
  app.post('/rolls/:id/progress', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const input = progressInputSchema.parse(req.body)
    const db = app.db

    const r = db.select().from(roll).where(and(eq(roll.id, id), isNull(roll.deletedAt))).get()
    if (!r) return reply.code(404).send({ error: '胶卷不存在' })

    try {
      return reply.code(201).send(recordProgress(db, r, input))
    } catch (e) {
      if (e instanceof ProgressError) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })

  /**
   * 快速记录：按 7 位编号定位胶卷，一步完成装机或记张数。
   * 在拍页的主入口——不需要先进详情页。
   */
  app.post('/quick-record', async (req, reply) => {
    const body = z.object({ code: z.string().min(1) }).passthrough().parse(req.body)
    const input = progressInputSchema.parse(req.body)
    const db = app.db

    const parsed = parseRollCode(body.code)
    if (!parsed.ok) return reply.code(400).send({ error: parsed.detail })

    const r = db
      .select()
      .from(roll)
      .where(and(eq(roll.code, parsed.code), isNull(roll.deletedAt)))
      .get()
    if (!r) {
      return reply.code(404).send({ error: `${parsed.code} 尚未建档`, code: parsed.code, notFound: true })
    }

    try {
      const p = recordProgress(db, r, input)
      const updated = db.select().from(roll).where(eq(roll.id, r.id)).get()
      return reply.code(201).send({ progress: p, roll: updated })
    } catch (e) {
      if (e instanceof ProgressError) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })

  // 编辑
  app.patch('/progress/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = z
      .object({
        reachedFrame: z.number().int().min(0).optional(),
        happenedAt: z.string().min(1).optional(),
        cameraId: z.number().int().positive().nullable().optional(),
        lensId: z.number().int().positive().nullable().optional(),
        note: z.string().max(500).nullable().optional(),
        lat: z.number().min(-90).max(90).nullable().optional(),
        lng: z.number().min(-180).max(180).nullable().optional(),
        address: z.string().trim().max(200).nullable().optional(),
      })
      .parse(req.body)

    const db = app.db
    const existing = db.select().from(rollProgress).where(eq(rollProgress.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '记录不存在' })

    const updated = db
      .update(rollProgress)
      .set(body)
      .where(eq(rollProgress.id, id))
      .returning()
      .get()

    db.update(roll).set({ updatedAt: new Date().toISOString() }).where(eq(roll.id, existing.rollId)).run()
    return updated
  })

  // 删除（不做审计留痕）
  app.delete('/progress/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const existing = db.select().from(rollProgress).where(eq(rollProgress.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '记录不存在' })

    db.delete(rollProgress).where(eq(rollProgress.id, id)).run()
    db.update(roll)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(roll.id, existing.rollId))
      .run()
    return { ok: true }
  })
}
