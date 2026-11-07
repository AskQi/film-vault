/**
 * Fastify 应用装配。
 *
 * 单用户鉴权用全局 onRequest 钩子：白名单之外的路由一律要求已登录。
 * 返回 401 而不是重定向，前端据此跳登录页。
 */
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'

import { config } from './config.js'
import { isApiPath } from './lib/paths.js'
import type { Db } from './db/client.js'
import { isAuthenticated } from './lib/auth.js'
import { authRoutes } from './routes/auth.js'
import { stocksRoutes } from './routes/stocks.js'
import { scanRoutes } from './routes/scan.js'
import { rollRoutes } from './routes/rolls.js'
import { progressRoutes } from './routes/progress.js'
import { cameraRoutes } from './routes/cameras.js'
import { statsRoutes } from './routes/stats.js'
import { frameNoteRoutes } from './routes/frame-notes.js'
import { developmentRoutes } from './routes/developments.js'
import { backupRoutes } from './routes/backup.js'

/** 不需要登录的路径（/api 下） */
const PUBLIC_API_PATHS = new Set(['/api/auth/login', '/api/auth/session', '/api/health'])

export interface BuildAppOptions {
  db: Db
  logger?: boolean
}

export async function buildApp({ db, logger = false }: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger
      ? {
          level: config.isProd ? 'info' : 'debug',
          transport: config.isProd
            ? undefined
            : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
        }
      : false,
    bodyLimit: 4 * 1024 * 1024,
  })

  await app.register(cookie)

  app.decorate('db', db)

  // 鉴权：/api 下除白名单外全部要求登录
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url.split('?')[0] ?? ''
    if (!isApiPath(url)) return
    if (PUBLIC_API_PATHS.has(url)) return
    if (url.startsWith('/api/auth/')) return
    if (isAuthenticated(req)) return
    return reply.code(401).send({ error: '未登录' })
  })

  app.get('/api/health', async () => ({ ok: true }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(stocksRoutes, { prefix: '/api/stocks' })
  await app.register(scanRoutes, { prefix: '/api' })
  await app.register(rollRoutes, { prefix: '/api/rolls' })
  await app.register(progressRoutes, { prefix: '/api' })
  await app.register(cameraRoutes, { prefix: '/api' })
  await app.register(statsRoutes, { prefix: '/api' })
  await app.register(frameNoteRoutes, { prefix: '/api' })
  await app.register(developmentRoutes, { prefix: '/api' })
  await app.register(backupRoutes, { prefix: '/api' })

  // 统一错误处理
  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    const status = err.statusCode ?? 500
    if (status >= 500) app.log.error(err)
    return reply.code(status).send({ error: err.message })
  })

  // 生产模式托管前端静态文件（前端路由用 history 模式，未知路径回落到 index.html）
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false })
    app.setNotFoundHandler((req, reply) => {
      // 注意用 isApiPath：'/api' 本身没有结尾斜杠，若只判断 '/api/' 会被
      // 当成前端路由回落到 index.html，前端拿到 HTML 去 JSON.parse 就报
      // "Unexpected token '<'"——这类错误极难定位，所以按前缀统一拦成 404。
      if (isApiPath(req.url.split('?')[0] ?? '')) {
        return reply.code(404).send({ error: '接口不存在' })
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}

declare module 'fastify' {
  interface FastifyInstance {
    db: Db
  }
}
