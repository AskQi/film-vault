<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '../stores/session.js'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

const pin = ref('')
const submitting = ref(false)

async function submit() {
  if (!pin.value || submitting.value) return
  submitting.value = true
  try {
    const ok = await session.login(pin.value)
    if (ok) {
      const next = typeof route.query.next === 'string' ? route.query.next : '/'
      await router.push(next)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center px-6">
    <div class="w-full max-w-sm">
      <div class="mb-10 text-center">
        <div class="mb-3 text-5xl">✦</div>
        <h1 class="text-2xl font-semibold tracking-wide">胶片库</h1>
        <p class="mt-2 text-sm text-slate-400">输入 PIN 继续</p>
      </div>

      <form @submit.prevent="submit">
        <input
          v-model="pin"
          type="password"
          inputmode="numeric"
          autocomplete="current-password"
          autofocus
          placeholder="PIN"
          class="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-4 text-center text-2xl tracking-[0.4em] outline-none focus:border-amber-500"
        />

        <p v-if="session.error" class="mt-3 text-center text-sm text-red-400">
          {{ session.error }}
        </p>

        <button
          type="submit"
          :disabled="!pin || submitting"
          class="mt-6 w-full rounded-2xl bg-amber-500 py-4 text-lg font-medium text-slate-950 transition-opacity disabled:opacity-40"
        >
          {{ submitting ? '登录中…' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>
