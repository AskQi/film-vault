<script setup lang="ts">
/**
 * 在拍页的快速录入：输入或扫码编号 → 自动读出胶卷 → 装机 / 记张数 → 保存。
 *
 * 不需要先进详情页。编号识别出来之前，下面的表单不展开。
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../lib/api.js'
import type { ScanResult } from '../lib/types.js'
import { ROLL_STATUS_LABEL, type RollStatus } from '@film-vault/shared/client'
import ScanSheet from './ScanSheet.vue'
import LocationField from './LocationField.vue'
import type { LocationValue } from '../lib/geo.js'

const emit = defineEmits<{ saved: [] }>()
const router = useRouter()

interface RollInfo {
  id: number
  code: string
  status: string
  framesTotal: number
  reachedFrame: number
  stockName: string
  cameraId: number | null
  lensId: number | null
}

const codeInput = ref('')
const scannerOpen = ref(false)
const looking = ref(false)
const lookupError = ref<string | null>(null)
/** 编号合法但没有建档 */
const notFoundCode = ref<string | null>(null)
const rollInfo = ref<RollInfo | null>(null)

const action = ref<'load' | 'progress'>('progress')
const frame = ref(0)
const happenedAt = ref('')
const location = ref<LocationValue>({ lat: null, lng: null, address: '' })
const note = ref('')
const cameraId = ref<number | null>(null)
const lensId = ref<number | null>(null)
const cameras = ref<{ id: number; model: string }[]>([])
const lenses = ref<{ id: number; model: string }[]>([])

const saving = ref(false)
const saveError = ref<string | null>(null)
const savedHint = ref<string | null>(null)

/** 这些状态下不能再装机或记张数 */
const closed = computed(() =>
  rollInfo.value ? ['exposed', 'developed', 'archived', 'void', 'lost'].includes(rollInfo.value.status) : false,
)

function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 识别编号：调用扫码分流，拿到已建档的卷后再取详情（当前进度） */
async function lookup(raw: string) {
  const text = raw.trim()
  if (!text) return
  looking.value = true
  lookupError.value = null
  notFoundCode.value = null
  rollInfo.value = null
  savedHint.value = null

  try {
    const res = await api.post<ScanResult>('/scan', { raw: text })
    if (res.kind === 'roll' && res.existing) {
      const d = await api.get<RollInfo & { stock: { name: string } }>(`/rolls/${res.existing.id}`)
      rollInfo.value = { ...d, stockName: d.stock.name }
      codeInput.value = d.code
      resetForm()
    } else if (res.kind === 'roll' || res.kind === 'unknown_prefix') {
      notFoundCode.value = res.code ?? text
    } else if (res.kind === 'barcode') {
      lookupError.value = '这是包装盒条码。在拍页请输入或扫胶卷上的 7 位编号'
    }
  } catch (e) {
    lookupError.value = e instanceof ApiError ? e.message : (e as Error).message
  } finally {
    looking.value = false
  }
}

/** 根据卷状态给出默认动作：未装机 → 装机，否则 → 记张数 */
function resetForm() {
  const r = rollInfo.value
  if (!r) return
  action.value = r.status === 'unopened' ? 'load' : 'progress'
  frame.value = action.value === 'load' ? 0 : r.reachedFrame
  happenedAt.value = nowLocal()
  note.value = ''
  cameraId.value = r.cameraId
  lensId.value = r.lensId
  saveError.value = null
}

function bump(delta: number) {
  if (!rollInfo.value) return
  frame.value = Math.min(rollInfo.value.framesTotal, Math.max(0, frame.value + delta))
}

function onScanned(raw: string) {
  scannerOpen.value = false
  codeInput.value = raw.trim()
  void lookup(raw)
}

function reset() {
  codeInput.value = ''
  rollInfo.value = null
  notFoundCode.value = null
  lookupError.value = null
  savedHint.value = null
}

async function save() {
  const r = rollInfo.value
  if (!r) return
  saving.value = true
  saveError.value = null
  try {
    await api.post('/quick-record', {
      code: r.code,
      event: action.value,
      reachedFrame: frame.value,
      // datetime-local 是本地时间，转成带时区的 ISO
      happenedAt: happenedAt.value ? new Date(happenedAt.value).toISOString() : undefined,
      lat: location.value.lat,
      lng: location.value.lng,
      address: location.value.address.trim() || null,
      note: note.value.trim() || null,
      cameraId: cameraId.value,
      lensId: lensId.value,
    })
    savedHint.value =
      action.value === 'load' ? `${r.code} 已装机` : `${r.code} 已记到第 ${frame.value} 张`
    rollInfo.value = null
    codeInput.value = ''
    emit('saved')
  } catch (e) {
    saveError.value = (e as Error).message
  } finally {
    saving.value = false
  }
}

// 首次展开表单时才拉机身镜头
watch(rollInfo, async (r) => {
  if (!r || cameras.value.length) return
  try {
    const [c, l] = await Promise.all([
      api.get<{ items: typeof cameras.value }>('/cameras'),
      api.get<{ items: typeof lenses.value }>('/lenses'),
    ])
    cameras.value = c.items
    lenses.value = l.items
  } catch {
    // 可选信息，取不到不影响记录
  }
})
</script>

<template>
  <section class="rounded-3xl border border-slate-800 bg-slate-900 p-4">
    <!-- 编号输入 -->
    <div class="flex gap-2">
      <input
        v-model="codeInput"
        maxlength="9"
        autocapitalize="off"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="输入或扫描编号，如 KG2T001"
        class="code-text min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-lg outline-none focus:border-amber-500"
        @keyup.enter="lookup(codeInput)"
      />
      <button
        class="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl bg-slate-800 text-xl active:bg-slate-700"
        title="扫码"
        @click="scannerOpen = true"
      >
        ⌗
      </button>
      <button
        class="shrink-0 rounded-xl bg-amber-500 px-4 font-medium text-slate-950 disabled:opacity-40"
        :disabled="!codeInput.trim() || looking"
        @click="lookup(codeInput)"
      >
        {{ looking ? '…' : '读取' }}
      </button>
    </div>

    <p v-if="savedHint" class="mt-3 rounded-xl bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
      ✓ {{ savedHint }}
    </p>
    <p v-if="lookupError" class="mt-3 text-sm text-red-400">{{ lookupError }}</p>

    <!-- 未建档 -->
    <div v-if="notFoundCode" class="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-sm">
      <p class="text-amber-300"><span class="code-text">{{ notFoundCode }}</span> 还没有建档</p>
      <button
        class="mt-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950"
        @click="router.push({ name: 'new-roll', query: { prefix: notFoundCode.slice(0, 4), serial: notFoundCode.slice(4) } })"
      >
        去建档
      </button>
    </div>

    <!-- 已识别：卷信息 + 录入表单 -->
    <div v-if="rollInfo" class="mt-4 space-y-4">
      <div class="flex items-start justify-between gap-3 rounded-2xl bg-slate-950 px-4 py-3">
        <div class="min-w-0">
          <RouterLink :to="`/rolls/${rollInfo.id}`" class="code-text text-xl text-amber-400">
            {{ rollInfo.code }}
          </RouterLink>
          <p class="mt-0.5 truncate text-sm text-slate-400">{{ rollInfo.stockName }}</p>
        </div>
        <div class="shrink-0 text-right">
          <div class="text-lg font-semibold tabular-nums">
            {{ rollInfo.reachedFrame }}<span class="text-sm text-slate-500">/{{ rollInfo.framesTotal }}</span>
          </div>
          <div class="text-xs text-slate-500">
            {{ ROLL_STATUS_LABEL[rollInfo.status as RollStatus] ?? rollInfo.status }}
          </div>
        </div>
      </div>

      <p v-if="closed" class="rounded-xl bg-slate-950 p-3 text-sm text-slate-400">
        这卷已经「{{ ROLL_STATUS_LABEL[rollInfo.status as RollStatus] }}」，不能再记录拍摄。
        <RouterLink :to="`/rolls/${rollInfo.id}`" class="text-amber-500">去详情页</RouterLink>
      </p>

      <template v-else>
        <!-- 动作 -->
        <div class="flex rounded-xl bg-slate-950 p-1">
          <button
            class="flex-1 rounded-lg py-2.5 text-sm"
            :class="action === 'load' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
            @click="action = 'load'; frame = 0"
          >
            装机
          </button>
          <button
            class="flex-1 rounded-lg py-2.5 text-sm"
            :class="action === 'progress' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
            @click="action = 'progress'; frame = rollInfo.reachedFrame"
          >
            拍到第几张
          </button>
        </div>

        <!-- 张数 -->
        <div v-if="action === 'progress'">
          <div class="flex items-center gap-2">
            <input
              v-model.number="frame"
              type="number"
              inputmode="numeric"
              min="0"
              :max="rollInfo.framesTotal"
              class="w-24 rounded-xl border border-slate-800 bg-slate-950 py-2.5 text-center text-2xl font-semibold tabular-nums outline-none focus:border-amber-500"
            />
            <span class="text-slate-500">/ {{ rollInfo.framesTotal }}</span>
            <div class="ml-auto flex gap-1.5">
              <button
                v-for="d in [1, 2, 5, 10]"
                :key="d"
                class="rounded-lg bg-slate-800 px-2.5 py-2 text-sm active:bg-slate-700"
                @click="bump(d)"
              >
                +{{ d }}
              </button>
            </div>
          </div>
          <p v-if="frame >= rollInfo.framesTotal" class="mt-1.5 text-xs text-amber-400">
            拍满后这卷会自动标记为「已拍完」
          </p>
        </div>

        <!-- 时间：默认现在，可改 -->
        <div>
          <div class="mb-1.5 flex items-center justify-between">
            <label class="text-xs text-slate-400">时间</label>
            <button class="text-xs text-amber-500" @click="happenedAt = nowLocal()">设为现在</button>
          </div>
          <input
            v-model="happenedAt"
            type="datetime-local"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
        </div>

        <!-- 地点：自动定位，可选地址 / 编辑 / 清除 -->
        <LocationField v-model="location" auto-locate />

        <!-- 机身镜头：装机时最常用 -->
        <div class="grid grid-cols-2 gap-2">
          <select
            v-model="cameraId"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-2 py-2.5 text-sm outline-none"
          >
            <option :value="null">机身</option>
            <option v-for="c in cameras" :key="c.id" :value="c.id">{{ c.model }}</option>
          </select>
          <select
            v-model="lensId"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-2 py-2.5 text-sm outline-none"
          >
            <option :value="null">镜头</option>
            <option v-for="l in lenses" :key="l.id" :value="l.id">{{ l.model }}</option>
          </select>
        </div>

        <input
          v-model="note"
          placeholder="备注（可选）"
          class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
        />

        <p v-if="saveError" class="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
          {{ saveError }}
        </p>

        <div class="flex gap-2">
          <button class="rounded-2xl bg-slate-800 px-5 py-3.5 text-sm" @click="reset">取消</button>
          <button
            :disabled="saving"
            class="flex-1 rounded-2xl bg-amber-500 py-3.5 text-base font-medium text-slate-950 disabled:opacity-40"
            @click="save"
          >
            {{ saving ? '保存中…' : action === 'load' ? '保存装机' : `保存：第 ${frame} 张` }}
          </button>
        </div>
      </template>
    </div>

    <ScanSheet :open="scannerOpen" @close="scannerOpen = false" @scanned="onScanned" />
  </section>
</template>
