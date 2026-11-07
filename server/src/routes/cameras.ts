/** 机身与镜头库 */
import type { FastifyPluginAsync } from 'fastify'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { camera, lens } from '../db/schema/index.js'

const cameraInput = z.object({
  brand: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  mount: z.string().max(30).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

const lensInput = z.object({
  brand: z.string().min(1).max(60),
  model: z.string().min(1).max(60),
  mount: z.string().max(30).nullable().optional(),
  focalMm: z.number().int().min(1).max(2000).nullable().optional(),
  maxAperture: z.number().min(0.7).max(64).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

export const cameraRoutes: FastifyPluginAsync = async (app) => {
  app.get('/cameras', async () => {
    return { items: app.db.select().from(camera).orderBy(asc(camera.brand), asc(camera.model)).all() }
  })

  app.post('/cameras', async (req, reply) => {
    const input = cameraInput.parse(req.body)
    const created = app.db
      .insert(camera)
      .values({ ...input, createdAt: new Date().toISOString() })
      .returning()
      .get()
    return reply.code(201).send(created)
  })

  app.patch('/cameras/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const input = cameraInput.partial().parse(req.body)
    const existing = app.db.select().from(camera).where(eq(camera.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '机身不存在' })
    return app.db.update(camera).set(input).where(eq(camera.id, id)).returning().get()
  })

  app.delete('/cameras/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    app.db.delete(camera).where(eq(camera.id, id)).run()
    return { ok: true }
  })

  app.get('/lenses', async () => {
    return { items: app.db.select().from(lens).orderBy(asc(lens.brand), asc(lens.model)).all() }
  })

  app.post('/lenses', async (req, reply) => {
    const input = lensInput.parse(req.body)
    const created = app.db
      .insert(lens)
      .values({ ...input, createdAt: new Date().toISOString() })
      .returning()
      .get()
    return reply.code(201).send(created)
  })

  app.patch('/lenses/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id)
    const input = lensInput.partial().parse(req.body)
    const existing = app.db.select().from(lens).where(eq(lens.id, id)).get()
    if (!existing) return reply.code(404).send({ error: '镜头不存在' })
    return app.db.update(lens).set(input).where(eq(lens.id, id)).returning().get()
  })

  app.delete('/lenses/:id', async (req) => {
    const id = Number((req.params as { id: string }).id)
    app.db.delete(lens).where(eq(lens.id, id)).run()
    return { ok: true }
  })
}
