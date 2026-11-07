<script setup lang="ts">
/** 胶卷详情：编号大字 → 型号卡 → 进度条 → 操作 → 时间线 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../lib/api.js'
import type { RollDetail, ProgressEntry } from '../lib/types.js'
import { ROLL_STATUS_LABEL, type RollStatus } from '@film-vault/shared'

const route = useRoute()
const roll = ref<RollDetail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)

const targetFrame = ref<number | null>(null)
const happenedAt = ref<string>('')
const note = ref('')
const recording = ref(false)

const percent = computed(() =>
  roll.value && roll.value.framesTotal > 0
    ? Math.min(100, Math.round((roll.value.reachedFrame / roll.value.framesTotal) * 100))
    : 0,
)

function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function load() {
  loading.value = true
  error.value = null
  try {
    roll.value = await api.get<RollDetail>(`/rolls/${route.params.id}`)
    happenedAt.value = nowLocal()
    targetFrame.value = roll.value.reachedFrame
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function record() {
  if (!roll.value || targetFrame.value === null) return
  recording.value = true
  error.value = null
  try {
    await api.post(`/rolls/${roll.value.id}/progress`, {
      // datetime-local 是本地时间，转成带时区的 ISO 字符串
      reachedFrame: targetFrame.value,
      happenedAt: happenedAt.value ? new Date(happenedAt.value).toISOString() : undefined,
      note: note.value.trim() || null,
    })
    note.value = ''
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    recording.value = false
  }
}

async function finish() {
  if (!roll.value) return
  await api.post(`/rolls/${roll.value.id}/finish`)
  await load()
}

async function changeStatus(status: RollStatus) {
  if (!roll.value) return
  await api.patch(`/rolls/${roll.value.id}`, { status })
  await load()
}

async function removeProgress(p: ProgressEntry) {
  await api.del(`/progress/${p.id}`)
  await load()
}

function fmt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <RouterLink to="/" class="mb-4 inline-block text-sm text-slate-400">← 返回</RouterLink>

    <div v-if="loading" class="py-16 text-center text-slate-500">加载中…</div>
    <p v-else-if="error && !roll" class="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {{ error }}
    </p>

    <template v-else-if="roll">
      <!-- 编号大字：截图友好 -->
      <header class="mb-6 text-center">
        <div class="code-text text-4xl text-amber-400">{{ roll.code }}</div>
        <h1 class="mt-3 text-lg">{{ roll.stockName }}</h1>
        <div class="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          <span class="rounded-full bg-slate-800 px-2.5 py-1">ISO {{ roll.iso }}</span>
          <span class="rounded-full bg-slate-800 px-2.5 py-1">{{ roll.format }}</span>
          <span class="rounded-full bg-slate-800 px-2.5 py-1">
            {{ ROLL_STATUS_LABEL[roll.status as RollStatus] ?? roll.status }}
          </span>
        </div>
      </header>

      <!-- 进度 -->
      <section class="mb-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 text-center">
        <div class="text-5xl font-semibold tabular-nums">
          {{ roll.reachedFrame }}
          <span class="text-2xl text-slate-500">/ {{ roll.framesTotal }}</span>
        </div>
        <div class="mt-1 text-xs text-slate-500">
          已拍 · 剩余 {{ roll.remaining }} 张
        </div>
        <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
          <div
            class="h-full rounded-full bg-amber-500 transition-[width] duration-300"
            :style="{ width: `${percent}%` }"
          />
        </div>
      </section>

      <!-- 记一笔 -->
      <section class="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 class="mb-3 text-sm font-medium text-slate-400">记一笔</h2>

        <div class="mb-3 flex gap-2">
          <button
            v-for="d in [1, 2, 5, 10]"
            :key="d"
            class="flex-1 rounded-xl bg-slate-800 py-2 text-sm"
            @click="targetFrame = Math.min(roll.framesTotal, (targetFrame ?? roll.reachedFrame) + d)"
          >
            +{{ d }}
          </button>
        </div>

        <div class="mb-3 flex gap-2">
          <input
            v-model.number="targetFrame"
            type="number"
            inputmode="numeric"
            min="0"
            :max="roll.framesTotal"
            class="w-24 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-center text-lg tabular-nums outline-none focus:border-amber-500"
          />
          <input
            v-model="happenedAt"
            type="datetime-local"
            class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <input
          v-model="note"
          placeholder="备注（可选）"
          class="mb-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
        />

        <button
          :disabled="recording || targetFrame === null"
          class="w-full rounded-xl bg-amber-500 py-3 font-medium text-slate-950 disabled:opacity-40"
          @click="record"
        >
          {{ recording ? '保存中…' : '保存' }}
        </button>

        <p v-if="error" class="mt-2 text-xs text-red-400">{{ error }}</p>
      </section>

      <!-- 状态操作 -->
      <section class="mb-6 flex flex-wrap gap-2">
        <button
          v-for="s in (['loaded', 'exposed', 'developed', 'archived'] as RollStatus[])"
          :key="s"
          class="rounded-xl bg-slate-800 px-4 py-2 text-sm"
          :class="roll.status === s ? 'ring-1 ring-amber-500' : ''"
          @click="changeStatus(s)"
        >
          {{ ROLL_STATUS_LABEL[s] }}
        </button>
        <button class="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-slate-950" @click="finish">
          拍完了
        </button>
      </section>

      <!-- 时间线 -->
      <section class="mb-10">
        <h2 class="mb-3 text-sm font-medium text-slate-400">时间线</h2>
        <div v-if="roll.progress.length === 0" class="text-sm text-slate-600">还没有记录</div>
        <ol v-else class="relative space-y-3 border-l border-slate-800 pl-5">
          <li v-for="p in [...roll.progress].reverse()" :key="p.id" class="relative">
            <span class="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500" />
            <div class="rounded-xl bg-slate-900 px-4 py-3">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-lg font-semibold tabular-nums">
                  第 {{ p.reachedFrame }} 张
                </span>
                <button class="text-xs text-slate-600 hover:text-red-400" @click="removeProgress(p)">
                  删除
                </button>
              </div>
              <div class="mt-1 text-xs text-slate-500">{{ fmt(p.happenedAt) }}</div>
              <p v-if="p.note" class="mt-1 text-sm text-slate-300">{{ p.note }}</p>
            </div>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>
