<script setup lang="ts">
/** 统计：月度、型号分布、机身频次、成本 */
import { computed, onMounted, ref } from 'vue'
import { api } from '../lib/api.js'

interface Stats {
  byStock: { stockId: number; name: string; count: number }[]
  byMonth: { month: string; count: number }[]
  byCamera: { cameraId: number | null; model: string | null; count: number }[]
  frames: number
  spendTotal: number
}

const stats = ref<Stats | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const maxStock = computed(() => Math.max(1, ...(stats.value?.byStock.map((s) => s.count) ?? [1])))

async function load() {
  loading.value = true
  error.value = null
  try {
    stats.value = await api.get<Stats>('/stats')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <header class="mb-6 flex items-center justify-between">
      <h1 class="text-2xl font-semibold">统计</h1>
      <RouterLink to="/cameras" class="rounded-xl bg-slate-800 px-4 py-2 text-sm">机身镜头</RouterLink>
    </header>

    <div v-if="loading" class="py-16 text-center text-slate-500">加载中…</div>
    <p v-else-if="error" class="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {{ error }}
    </p>

    <template v-else-if="stats">
      <div class="mb-6 grid grid-cols-2 gap-3">
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div class="text-xs text-slate-400">累计记录笔数</div>
          <div class="mt-1 text-3xl font-semibold tabular-nums">{{ stats.frames }}</div>
        </div>
        <div class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div class="text-xs text-slate-400">累计花费</div>
          <div class="mt-1 text-3xl font-semibold tabular-nums">¥{{ stats.spendTotal }}</div>
        </div>
      </div>

      <section class="mb-6">
        <h2 class="mb-2 text-sm font-medium text-slate-400">型号分布</h2>
        <div v-if="stats.byStock.length === 0" class="text-sm text-slate-600">暂无数据</div>
        <div v-else class="space-y-2">
          <div v-for="s in stats.byStock" :key="s.stockId">
            <div class="mb-1 flex justify-between text-xs">
              <span class="truncate text-slate-300">{{ s.name }}</span>
              <span class="ml-2 shrink-0 tabular-nums text-slate-500">{{ s.count }}</span>
            </div>
            <div class="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div class="h-full rounded-full bg-amber-500" :style="{ width: `${(s.count / maxStock) * 100}%` }" />
            </div>
          </div>
        </div>
      </section>

      <section class="mb-6">
        <h2 class="mb-2 text-sm font-medium text-slate-400">月度建档</h2>
        <div v-if="stats.byMonth.length === 0" class="text-sm text-slate-600">暂无数据</div>
        <div v-else class="flex flex-wrap gap-2">
          <div
            v-for="m in stats.byMonth"
            :key="m.month"
            class="rounded-xl bg-slate-900 px-3 py-2 text-center"
          >
            <div class="text-xs text-slate-500">{{ m.month }}</div>
            <div class="text-lg font-semibold tabular-nums">{{ m.count }}</div>
          </div>
        </div>
      </section>

      <section>
        <h2 class="mb-2 text-sm font-medium text-slate-400">机身使用频次</h2>
        <div v-if="stats.byCamera.length === 0" class="text-sm text-slate-600">暂无数据</div>
        <div v-else class="space-y-2">
          <div
            v-for="c in stats.byCamera"
            :key="String(c.cameraId)"
            class="flex justify-between rounded-xl bg-slate-900 px-4 py-2.5 text-sm"
          >
            <span>{{ c.model ?? '未指定' }}</span>
            <span class="tabular-nums text-slate-400">{{ c.count }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
