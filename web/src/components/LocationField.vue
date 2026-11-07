<script setup lang="ts">
/**
 * 位置字段：定位 → 选地址 → 可编辑 / 清除。
 *
 * v-model 绑定 { lat, lng, address }，三项都可以为空。
 * autoLocate 为 true 时挂载即定位（在拍页默认开启）。
 */
import { onMounted, ref } from 'vue'
import { api } from '../lib/api.js'
import { getCurrentPosition, type AddressCandidate, type LocationValue } from '../lib/geo.js'

const model = defineModel<LocationValue>({ required: true })
const props = withDefaults(defineProps<{ autoLocate?: boolean }>(), { autoLocate: false })

const locating = ref(false)
const accuracy = ref<number | null>(null)
const candidates = ref<AddressCandidate[]>([])
const message = ref<string | null>(null)

async function locate() {
  locating.value = true
  message.value = null
  candidates.value = []
  try {
    const pos = await getCurrentPosition()
    model.value = { ...model.value, lat: pos.lat, lng: pos.lng }
    accuracy.value = pos.accuracy

    try {
      const res = await api.get<{ candidates: AddressCandidate[] }>(
        `/geo/reverse?lat=${pos.lat}&lng=${pos.lng}`,
      )
      candidates.value = res.candidates
      // 地址为空时默认填第一个，用户已手动填过的不覆盖
      if (!model.value.address && res.candidates[0]) {
        model.value = { ...model.value, address: res.candidates[0].label }
      }
    } catch (e) {
      // 坐标已拿到，地址解析失败不影响保存
      message.value = (e as Error).message
    }
  } catch (e) {
    message.value = (e as Error).message
  } finally {
    locating.value = false
  }
}

function pick(c: AddressCandidate) {
  model.value = { ...model.value, address: c.label }
  candidates.value = []
}

function clear() {
  model.value = { lat: null, lng: null, address: '' }
  accuracy.value = null
  candidates.value = []
  message.value = null
}

onMounted(() => {
  if (props.autoLocate) void locate()
})
</script>

<template>
  <div>
    <div class="mb-1.5 flex items-center justify-between">
      <label class="text-xs text-slate-400">地点</label>
      <div class="flex gap-3 text-xs">
        <button class="text-amber-500 disabled:opacity-40" :disabled="locating" @click="locate">
          {{ locating ? '定位中…' : model.lat != null ? '重新定位' : '定位' }}
        </button>
        <button
          v-if="model.lat != null || model.address"
          class="text-slate-500 hover:text-red-400"
          @click="clear"
        >
          清除
        </button>
      </div>
    </div>

    <input
      v-model="model.address"
      placeholder="地址（可手动填写或编辑）"
      class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
    />

    <p v-if="model.lat != null && model.lng != null" class="mt-1 text-[11px] text-slate-600 tabular-nums">
      {{ model.lat.toFixed(5) }}, {{ model.lng.toFixed(5) }}
      <span v-if="accuracy !== null">· 精度约 {{ accuracy }} 米</span>
    </p>
    <p v-if="message" class="mt-1 text-xs text-amber-400">{{ message }}</p>

    <!-- 候选地址：主地址 + 附近 POI -->
    <div v-if="candidates.length > 1" class="mt-2 max-h-48 space-y-1 overflow-y-auto">
      <button
        v-for="c in candidates"
        :key="c.label"
        class="flex w-full items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm"
        :class="c.label === model.address ? 'bg-amber-500/15 text-amber-300' : 'bg-slate-950 text-slate-300'"
        @click="pick(c)"
      >
        <span class="min-w-0 truncate">{{ c.label }}</span>
        <span v-if="c.distance !== null" class="shrink-0 text-[11px] text-slate-500">{{ c.distance }}m</span>
      </button>
    </div>
  </div>
</template>
