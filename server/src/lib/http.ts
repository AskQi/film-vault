/** 统一错误响应 */
import type { FastifyReply } from 'fastify'

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export function sendError(reply: FastifyReply, statusCode: number, message: string) {
  return reply.code(statusCode).send({ error: message })
}
