/** 统计：月度卷数与张数、型号分布、机身频次、成本 */
import type { FastifyPluginAsync } from 'fastify'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { roll, filmStock, rollProgress, camera, box } from '../db/schema/index.js'

export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/stats', async (req) => {
    const q = req.query as { from?: string; to?: string }
    const db = app.db

    const where = [isNull(roll.deletedAt)]
    if (q.from) where.push(sql`${roll.createdAt} >= ${q.from}`)
    if (q.to) where.push(sql`${roll.createdAt} <= ${q.to}`)
    const cond = and(...where)

    const byStock = db
      .select({
        stockId: roll.stockId,
        name: filmStock.name,
        count: sql<number>`count(*)`,
      })
      .from(roll)
      .innerJoin(filmStock, eq(roll.stockId, filmStock.id))
      .where(cond)
      .groupBy(roll.stockId, filmStock.name)
      .all()

    const byMonth = db
      .select({
        month: sql<string>`substr(${roll.createdAt}, 1, 7)`,
        count: sql<number>`count(*)`,
      })
      .from(roll)
      .where(cond)
      .groupBy(sql`substr(${roll.createdAt}, 1, 7)`)
      .all()

    const byCamera = db
      .select({
        cameraId: roll.cameraId,
        model: camera.model,
        count: sql<number>`count(*)`,
      })
      .from(roll)
      .leftJoin(camera, eq(roll.cameraId, camera.id))
      .where(cond)
      .groupBy(roll.cameraId, camera.model)
      .all()

    const frames = db
      .select({
        total: sql<number>`coalesce(count(*), 0)`,
      })
      .from(rollProgress)
      .innerJoin(roll, eq(rollProgress.rollId, roll.id))
      .where(cond)
      .get()

    const spend = db
      .select({ total: sql<number>`coalesce(sum(${box.unitPrice}), 0)` })
      .from(box)
      .get()

    return {
      byStock,
      byMonth,
      byCamera,
      frames: frames?.total ?? 0,
      spendTotal: spend?.total ?? 0,
    }
  })

  // 首页仪表盘
  app.get('/dashboard', async () => {
    const db = app.db
    const active = db
      .select()
      .from(roll)
      .where(and(isNull(roll.deletedAt), sql`${roll.status} in ('loaded','partial')`))
      .all()
    return { active }
  })
}
