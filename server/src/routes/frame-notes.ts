/** 单张注解：辅助功能，所有业务字段可空，与进度快照完全解耦 */
import type { FastifyPluginAsync } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { frameNoteInputSchema } from '@film-vault/shared'
import { frameNote, roll } from '../db/schema/index.js'

const patchSchema = z.object({
  frameNo: z.number().int().min(1).optional(),
  aperture: z.string().max(20).nullable().optional(),
  shutter: z.string().max(20).nullable().optional(),
  ei: z.number().int().min(1).max(100000).nullable().optional(),
  evOffset: z.string().max(20).nullable().optional(),
  lensId: z.number().int().positive().nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  happenedAt: z.string().min(1).nullable().optional(),
})

export const frameNoteRoutes: FastifyPluginAsync = async (app) => {
  // 某卷的全部注解
  app.get('/rolls/:id/frame-notes', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const r = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!r) return reply.code(404).send({ error: '胶卷不存在' })

    return {
      items: db
        .select()
        .from(frameNote)
        .where(eq(frameNote.rollId, id))
        .orderBy(asc(frameNote.frameNo))
        .all(),
    }
  })

  // 新增
  app.post('/rolls/:id/frame-notes', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const input = frameNoteInputSchema.parse(req.body)
    const db = app.db

    const r = db.select().from(roll).where(eq(roll.id, id)).get()
    if (!r) return reply.code(404).send({ error: '胶卷不存在' })

    const now = new Date().toISOString()
    const created = db
      .insert(frameNote)
      .values({
        rollId: id,
        frameNo: input.frameNo,
        aperture: input.aperture ?? null,
        shutter: input.shutter ?? null,
        ei: input.ei ?? null,
        evOffset: input.evOffset ?? null,
        lensId: input.lensId ?? null,
        location: input.location ?? null,
        note: input.note ?? null,
        happenedAt: input.happenedAt ?? now,
        createdAt: now,
      })
      .returning()
      .get()

    db.update(roll).set({ updatedAt: now }).where(eq(roll.id, id)).run()
    return reply.code(201).send(created)
  })

  // 编辑（所有字段可空，允许只留一句备注）
  app.patch('/frame-notes/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const body = patchSchema.parse(req.body)
    const db = app.db

    const existing = db.select().from(frameNote).where(eq(frameNote.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '注解不存在' })

    return db.update(frameNote).set(body).where(eq(frameNote.id, id)).returning().get()
  })

  app.delete('/frame-notes/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const db = app.db
    const existing = db.select().from(frameNote).where(eq(frameNote.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '注解不存在' })

    db.delete(frameNote).where(eq(frameNote.id, id)).run()
    return { ok: true }
  })
}
