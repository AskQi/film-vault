<script setup lang="ts">
/**
 * 记一笔底部抽屉。
 *
 * 设计目标：单手两步完成——打开 → 敲数字 / 点增量 → 保存。
 * 默认时间 = 现在，时间输入框直接展开（要回填过去时间直接改即可）；去掉了折叠开关。
 */
import { computed, ref, watch } from 'vue'
import { api } from '../lib/api.js'
import type { RollListItem } from '../lib/types.js'
import type { LocationValue } from '../lib/geo.js'
import LocationField from './LocationField.vue'

const props = defineProps<{ open: boolean; roll: RollListItem | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const target = ref<number>(0)
const happenedAt = ref('')
const note = ref('')
const location = ref<LocationValue>({ lat: null, lng: null, address: '' })
const cameraId = ref<number | null>(null)
const lensId = ref<number | null>(null)
const saving = ref(false)
const error = ref<string | null>(null)

const cameras = ref<{ id: number; brand: string; model: string }[]>([])
const lenses = ref<{ id: number; brand: string; model: string }[]>([])

const remaining = computed(() => (props.roll ? Math.max(0, props.roll.framesTotal - target.value) : 0))

/** datetime-local 需要的本地时间格式 */
function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return
    error.value = null
    note.value = ''
    location.value = { lat: null, lng: null, address: '' }
    happenedAt.value = nowLocal()
    target.value = props.roll?.reachedFrame ?? 0

    try {
      const [c, l] = await Promise.all([
        api.get<{ items: typeof cameras.value }>('/cameras'),
        api.get<{ items: typeof lenses.value }>('/lenses'),
      ])
      cameras.value = c.items
      lenses.value = l.items
      // 只有一个机身/镜头时自动选上，省一步操作
      if (c.items.length === 1) cameraId.value = c.items[0]!.id
      if (l.items.length === 1) lensId.value = l.items[0]!.id
    } catch {
      // 机身镜头是可选信息，取不到不影响记录
    }
  },
)

function bump(delta: number) {
  if (!props.roll) return
  target.value = Math.min(props.roll.framesTotal, Math.max(0, target.value + delta))
}

async function save() {
  if (!props.roll) return
  saving.value = true
  error.value = null
  try {
    await api.post(`/rolls/${props.roll.id}/progress`, {
      reachedFrame: target.value,
      // 时间框始终可见且默认填当前时间，用户可能改过，所以总是传值
      happenedAt: happenedAt.value ? new Date(happenedAt.value).toISOString() : undefined,
      note: note.value.trim() || null,
      lat: location.value.lat,
      lng: location.value.lng,
      address: location.value.address.trim() || null,
      cameraId: cameraId.value,
      lensId: lensId.value,
    })
    emit('saved')
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Transition name="sheet">
    <div v-if="open && roll" class="fixed inset-0 z-50 flex flex-col justify-end">
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/60" @click="emit('close')" />

      <div
        class="relative max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-slate-900 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3"
      >
        <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-700" />

        <div class="mb-4 text-center">
          <div class="code-text text-sm text-slate-400">{{ roll.code }}</div>
          <div class="mt-0.5 truncate text-xs text-slate-500">{{ roll.stockName }}</div>
        </div>

        <!-- 目标张数：大字 + 数字键盘 -->
        <div class="mb-4 flex items-baseline justify-center gap-2">
          <input
            v-model.number="target"
            type="number"
            inputmode="numeric"
            min="0"
            :max="roll.framesTotal"
            autofocus
            class="w-32 rounded-2xl border border-slate-700 bg-slate-950 py-3 text-center text-4xl font-semibold tabular-nums outline-none focus:border-amber-500"
          />
          <span class="text-2xl text-slate-600">/ {{ roll.framesTotal }}</span>
        </div>
        <p class="mb-4 text-center text-xs text-slate-500">还剩 {{ remaining }} 张</p>

        <!-- 快捷增量 -->
        <div class="mb-4 flex gap-2">
          <button
            v-for="d in [1, 2, 5, 10]"
            :key="d"
            class="flex-1 rounded-xl bg-slate-800 py-4 text-lg font-medium active:bg-slate-700"
            @click="bump(d)"
          >
            +{{ d }}
          </button>
        </div>

        <input
          v-model="note"
          placeholder="备注（可选）"
          class="mb-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
        />

        <!-- 时间：默认现在，要回填过去时间直接改 -->
        <div class="mb-3">
          <label class="mb-1.5 block text-xs text-slate-400">时间（默认现在，可改）</label>
          <input
            v-model="happenedAt"
            type="datetime-local"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <!-- 地点 / 机身 / 镜头：直接展开，全部可选，不做校验 -->
        <LocationField v-model="location" auto-locate class="mb-3" />
        <div class="mb-3 grid grid-cols-2 gap-2">
          <select
            v-model.number="cameraId"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-2 py-3 text-sm outline-none"
          >
            <option :value="null">机身（可选）</option>
            <option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.model }}</option>
          </select>
          <select
            v-model.number="lensId"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-2 py-3 text-sm outline-none"
          >
            <option :value="null">镜头（可选）</option>
            <option v-for="l in lenses" :key="l.id" :value="l.id">{{ l.model }}</option>
          </select>
        </div>

        <p v-if="error" class="mb-3 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {{ error }}
          <span class="block text-xs text-slate-400">
            重试前先去详情页看一眼时间线，避免重复记录
          </span>
        </p>

        <button
          :disabled="saving"
          class="w-full rounded-2xl bg-amber-500 py-4 text-lg font-medium text-slate-950 disabled:opacity-40"
          @click="save"
        >
          {{ saving ? '保存中…' : '保存' }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-active > div:last-child,
.sheet-leave-active > div:last-child {
  transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-enter-from > div:last-child,
.sheet-leave-to > div:last-child {
  transform: translateY(100%);
}
</style>
