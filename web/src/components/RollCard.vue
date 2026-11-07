<script setup lang="ts">
/**
 * 首页/胶卷库的胶卷卡片：编号、型号、进度条、记一笔。
 *
 * 移动端要点：主操作只有「记一笔」一块大按钮，不再在卡片上排 +1/+2/+5/+10
 * 一排小按钮——手指极易点到相邻的那个。精确加 N 放到抽屉里做。
 */
import { computed } from 'vue'
import type { RollListItem } from '../lib/types.js'

const props = defineProps<{ roll: RollListItem }>()
const emit = defineEmits<{ record: [] }>()

const percent = computed(() =>
  props.roll.framesTotal > 0
    ? Math.min(100, Math.round((props.roll.reachedFrame / props.roll.framesTotal) * 100))
    : 0,
)

const statusText = computed(() => {
  const left = props.roll.framesTotal - props.roll.reachedFrame
  if (left <= 0) return '已拍满'
  return `还剩 ${left} 张`
})
</script>

<template>
  <article class="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
    <!-- 上半：信息，点整块进详情 -->
    <RouterLink :to="`/rolls/${roll.id}`" class="block px-4 pt-4 pb-3 active:bg-slate-800/50">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="code-text text-xl text-amber-400">{{ roll.code }}</div>
          <p class="mt-1 truncate text-sm text-slate-400">{{ roll.stockName }}</p>
        </div>
        <div class="shrink-0 text-right">
          <div class="text-3xl font-semibold tabular-nums leading-none">
            {{ roll.reachedFrame }}<span class="text-base text-slate-500">/{{ roll.framesTotal }}</span>
          </div>
          <div class="mt-1 text-xs text-slate-500">{{ statusText }}</div>
        </div>
      </div>

      <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          class="h-full rounded-full bg-amber-500 transition-[width] duration-300"
          :style="{ width: `${percent}%` }"
        />
      </div>
    </RouterLink>

    <!-- 下半：整块大按钮。只有一个主操作，不存在误触相邻键 -->
    <button
      class="flex w-full items-center justify-center gap-1.5 border-t border-slate-800 bg-slate-800/40 py-4 text-base font-medium text-amber-400 active:bg-slate-800"
      @click="emit('record')"
    >
      记一笔
      <span class="text-slate-500">›</span>
    </button>
  </article>
</template>
