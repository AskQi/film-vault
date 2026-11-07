/**
 * 会话状态。单用户，只关心「是否已登录」。
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useSessionStore = defineStore('session', () => {
  const authenticated = ref(false)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  /** 首次导航前拉一次会话状态，避免刷新时闪登录页 */
  async function ensureLoaded() {
    if (loaded.value) return
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' })
      const data = (await res.json()) as { authenticated: boolean }
      authenticated.value = data.authenticated
    } catch {
      authenticated.value = false
    } finally {
      loaded.value = true
    }
  }

  async function login(pin: string) {
    error.value = null
    let res: Response
    try {
      res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
        credentials: 'same-origin',
        // 弱网下不要无限转圈：超时后提示重试
        signal: AbortSignal.timeout(15000),
      })
    } catch (e) {
      error.value =
        (e as Error).name === 'TimeoutError' ? '登录超时，网络较慢，请重试' : '网络错误，请检查连接后重试'
      return false
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      error.value = data.error ?? '登录失败'
      return false
    }
    authenticated.value = true
    loaded.value = true
    return true
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    markLoggedOut()
  }

  function markLoggedOut() {
    authenticated.value = false
    loaded.value = true
  }

  return { authenticated, loaded, error, ensureLoaded, login, logout, markLoggedOut }
})
