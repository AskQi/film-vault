/**
 * 统一的 API 调用封装。
 *
 * 401 时清空会话并跳登录页——单用户场景不需要 token 刷新逻辑。
 */
import router from '../router.js'
import { useSessionStore } from '../stores/session.js'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })

  if (res.status === 401 && !path.startsWith('/auth/')) {
    useSessionStore().markLoggedOut()
    void router.push({ name: 'login', query: { next: router.currentRoute.value.fullPath } })
    throw new ApiError(401, '未登录')
  }

  const text = await res.text()
  const data = text ? (JSON.parse(text) as unknown) : null

  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `请求失败（${res.status}）`
    throw new ApiError(res.status, message)
  }

  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}
