/** 鉴权路由：PIN 登录 / 登出 / 会话状态 */
import type { FastifyPluginAsync } from 'fastify'
import { loginSchema } from '@film-vault/shared'
import { checkPin, clearSessionCookie, isAuthenticated, setSessionCookie } from '../lib/auth.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post('/login', async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.code(400).send({ error: '请输入 PIN' })
    }
    if (!checkPin(parsed.data.pin)) {
      return reply.code(401).send({ error: 'PIN 不正确' })
    }
    setSessionCookie(reply)
    return { ok: true }
  })

  app.post('/logout', async (_req, reply) => {
    clearSessionCookie(reply)
    return { ok: true }
  })

  app.get('/session', async (req) => {
    return { authenticated: isAuthenticated(req) }
  })
}
