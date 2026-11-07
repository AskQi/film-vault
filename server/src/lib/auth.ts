/**
 * 单用户 PIN 鉴权。
 *
 * PIN 来自环境变量，登录成功后签发 HttpOnly Cookie。
 * 单用户场景不做用户表、不做密码哈希存储——PIN 只在环境变量里，
 * 用 timingSafeEqual 做定长比较避免计时侧信道。
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.js'

/** Cookie 值：HMAC 签名，篡改无效。重启进程会换 secret，需要重新登录。 */
const sessionSecret = process.env.SESSION_SECRET ?? randomBytes(32).toString('hex')

function sign(payload: string): string {
  return createHmac('sha256', sessionSecret).update(payload).digest('base64url')
}

export function issueSession(): string {
  const issuedAt = Date.now().toString(36)
  return `${issuedAt}.${sign(issuedAt)}`
}

export function verifySession(token: string | undefined): boolean {
  if (!token) return false
  const [issuedAt, mac] = token.split('.')
  if (!issuedAt || !mac) return false

  const expected = sign(issuedAt)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  const ageMs = Date.now() - parseInt(issuedAt, 36)
  return ageMs >= 0 && ageMs < config.sessionMaxAgeSec * 1000
}

/** PIN 比较：定长比较，避免按字符提前返回泄露长度信息 */
export function checkPin(input: string): boolean {
  const a = Buffer.from(input)
  const b = Buffer.from(config.pin)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function setSessionCookie(reply: FastifyReply) {
  reply.setCookie(config.cookieName, issueSession(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.sessionMaxAgeSec,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(config.cookieName, { path: '/' })
}

/** 是否已登录 */
export function isAuthenticated(req: FastifyRequest): boolean {
  return verifySession(req.cookies[config.cookieName])
}
