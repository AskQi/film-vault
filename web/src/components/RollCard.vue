<script setup lang="ts">
/** 首页/胶卷库的胶卷卡片：编号、型号、进度条、快捷记一笔 */
import { computed, ref } from 'vue'
import { api } from '../lib/api.js'
import type { RollListItem } from '../lib/types.js'

const props = defineProps<{ roll: RollListItem }>()
const emit = defineEmits<{ updated: [] }>()

const busy = ref(false)
const error = ref<string | null>(null)

const percent = computed(() =>
  props.roll.framesTotal > 0
    ? Math.min(100, Math.round((props.roll.reachedFrame / props.roll.framesTotal) * 100))
    : 0,
)

async function record(delta: number) {
  if (busy.value) return
  busy.value = true
  error.value = null
  try {
    const target = Math.min(props.roll.framesTotal, props.roll.reachedFrame + delta)
    await api.post(`/rolls/${props.roll.id}/progress`, { reachedFrame: target })
    emit('updated')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <article class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <RouterLink :to="`/rolls/${roll.id}`" class="code-text text-xl text-amber-400">
          {{ roll.code }}
        </RouterLink>
        <p class="mt-1 truncate text-sm text-slate-400">{{ roll.stockName }}</p>
      </div>
      <div class="shrink-0 text-right">
        <div class="text-2xl font-semibold tabular-nums">
          {{ roll.reachedFrame }}<span class="text-base text-slate-500">/{{ roll.framesTotal }}</span>
        </div>
        <div class="text-xs text-slate-500">已拍张数</div>
      </div>
    </div>

    <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
      <div
        class="h-full rounded-full bg-amber-500 transition-[width] duration-300"
        :style="{ width: `${percent}%` }"
      />
    </div>

    <div class="mt-3 flex gap-2">
      <button
        v-for="d in [1, 2, 5, 10]"
        :key="d"
        :disabled="busy"
        class="flex-1 rounded-xl bg-slate-800 py-2 text-sm font-medium text-slate-200 active:bg-slate-700 disabled:opacity-40"
        @click="record(d)"
      >
        +{{ d }}
      </button>
    </div>

    <p v-if="error" class="mt-2 text-xs text-red-400">{{ error }}</p>
  </article>
</template>
