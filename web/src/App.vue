<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from './stores/session.js'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

/** 登录页不显示底部导航 */
const showNav = computed(() => route.name !== 'login')

const tabs = [
  { name: 'home', path: '/', label: '首页', icon: '◉' },
  { name: 'rolls', path: '/rolls', label: '胶卷库', icon: '▤' },
  { name: 'scan', path: '/scan', label: '扫码', icon: '▣' },
  { name: 'stocks', path: '/stocks', label: '型号库', icon: '☰' },
  { name: 'stats', path: '/stats', label: '统计', icon: '◔' },
]

function isActive(name: string) {
  if (name === 'home') return route.name === 'home'
  return route.path.startsWith(`/${name}`)
}

async function handleLogout() {
  await session.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-dvh bg-slate-950 text-slate-100">
    <!-- 主内容区：底部留出导航高度 -->
    <main :class="showNav ? 'pb-20' : ''">
      <RouterView />
    </main>

    <nav
      v-if="showNav"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div class="mx-auto flex max-w-3xl">
        <RouterLink
          v-for="tab in tabs"
          :key="tab.name"
          :to="tab.path"
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors"
          :class="isActive(tab.name) ? 'text-amber-400' : 'text-slate-400 hover:text-slate-200'"
        >
          <span class="text-lg leading-none">{{ tab.icon }}</span>
          <span>{{ tab.label }}</span>
        </RouterLink>
        <button
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-slate-500 hover:text-slate-300"
          @click="handleLogout"
        >
          <span class="text-lg leading-none">⎋</span>
          <span>退出</span>
        </button>
      </div>
    </nav>
  </div>
</template>
