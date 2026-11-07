/** 逆地理编码代理：浏览器只拿到地址，不接触高德 key */
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { GeoError, reverseGeocode } from '../lib/geo.js'

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
})

export const geoRoutes: FastifyPluginAsync = async (app) => {
  app.get('/geo/reverse', async (req, reply) => {
    const parsed = querySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: '坐标不合法' })

    try {
      const candidates = await reverseGeocode(parsed.data.lat, parsed.data.lng)
      return { candidates }
    } catch (e) {
      if (e instanceof GeoError) return reply.code(e.statusCode).send({ error: e.message })
      throw e
    }
  })
}
