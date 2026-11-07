/** 进度快照：新增 / 编辑 / 删除 / 按时间线查询 */
import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { progressInputSchema } from '@film-vault/shared'
import { roll, rollProgress } from '../db/schema/index.js'

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

    const r = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!r) return reply.code(404).send({ error: '胶卷不存在' })

    if (input.reachedFrame > r.framesTotal) {
      return reply.code(400).send({
        error: `拍到了第 ${input.reachedFrame} 张，超过该卷总张数 ${r.framesTotal}`,
      })
    }

    const now = new Date().toISOString()
    const created = db.transaction((tx) => {
      const p = tx
        .insert(rollProgress)
        .values({
          rollId: id,
          reachedFrame: input.reachedFrame,
          happenedAt: input.happenedAt ?? now,
          cameraId: input.cameraId ?? null,
          lensId: input.lensId ?? null,
          note: input.note ?? null,
          createdAt: now,
        })
        .returning()
        .get()

      // 状态自动推进：有进度且未拍完 → partial
      if (r.status === 'unopened' || r.status === 'loaded') {
        tx.update(roll).set({ status: 'partial', updatedAt: now }).where(eq(roll.id, id)).run()
      } else {
        tx.update(roll).set({ updatedAt: now }).where(eq(roll.id, id)).run()
      }

      return p
    })

    return reply.code(201).send(created)
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
