/** 冲洗记录：自冲与送店两套字段，全部可空 */
import type { FastifyPluginAsync } from 'fastify'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { development, roll } from '../db/schema/index.js'

const developmentSchema = z.object({
  method: z.enum(['self', 'lab']),
  process: z.string().max(20).nullable().optional(),
  developer: z.string().max(60).nullable().optional(),
  dilution: z.string().max(30).nullable().optional(),
  tempC: z.number().min(-5).max(60).nullable().optional(),
  durationSec: z.number().int().min(1).nullable().optional(),
  agitation: z.string().max(60).nullable().optional(),
  pushPull: z.number().int().min(-3).max(3).nullable().optional(),
  labName: z.string().max(120).nullable().optional(),
  devAt: z.string().nullable().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  issues: z.string().max(2000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export const developmentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/rolls/:id/developments', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const r = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!r) return reply.code(404).send({ error: '胶卷不存在' })

    return {
      items: db
        .select()
        .from(development)
        .where(eq(development.rollId, id))
        .orderBy(desc(development.devAt))
        .all(),
    }
  })

  app.post('/rolls/:id/developments', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const input = developmentSchema.parse(req.body)
    const db = app.db

    const r = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!r) return reply.code(404).send({ error: '胶卷不存在' })

    const now = new Date().toISOString()
    const created = db.transaction((tx) => {
      const d = tx
        .insert(development)
        .values({
          rollId: id,
          method: input.method,
          process: input.process ?? null,
          developer: input.developer ?? null,
          dilution: input.dilution ?? null,
          tempC: input.tempC ?? null,
          durationSec: input.durationSec ?? null,
          agitation: input.agitation ?? null,
          pushPull: input.pushPull ?? null,
          labName: input.labName ?? null,
          devAt: input.devAt ?? now,
          rating: input.rating ?? null,
          issues: input.issues ?? null,
          notes: input.notes ?? null,
          createdAt: now,
        })
        .returning()
        .get()

      // 冲洗完成即推进状态，但不覆盖更靠后的状态（已归档等）
      if (r.status !== 'archived') {
        tx.update(roll).set({ status: 'developed', updatedAt: now }).where(eq(roll.id, id)).run()
      }
      return d
    })

    return reply.code(201).send(created)
  })

  app.patch('/developments/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = developmentSchema.partial().parse(req.body)
    const db = app.db
    const existing = db.select().from(development).where(eq(development.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '冲洗记录不存在' })

    return db.update(development).set(body).where(eq(development.id, id)).returning().get()
  })

  app.delete('/developments/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const existing = db.select().from(development).where(eq(development.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '冲洗记录不存在' })

    db.delete(development).where(eq(development.id, id)).run()
    return { ok: true }
  })
}
