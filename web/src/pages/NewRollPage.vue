<script setup lang="ts">
/** 建档：单卷 / 批量。型号选择后自动带出前缀与下一个编号。 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '../lib/api.js'
import type { Stock } from '../lib/types.js'
import ScanSheet from '../components/ScanSheet.vue'

const route = useRoute()

const stocks = ref<Stock[]>([])
const stockId = ref<number | null>(null)
const mode = ref<'single' | 'batch'>('single')
const serial = ref('')
const count = ref(5)
const framesTotal = ref(36)
const error = ref<string | null>(null)
/** 批量建档撞号时服务端返回的重复编号 */
const conflicts = ref<{ serialTxt?: string; code: string }[]>([])
const submitting = ref(false)
const created = ref<{ code: string; id: number }[]>([])
const scannerOpen = ref(false)
/** 建档成功后的编号结果面板 */
const showResult = ref(false)
const copied = ref(false)
/** 扫到的原始内容：可能是 7 位编号，也可能是包装盒条码 */
const scannedRaw = ref<string | null>(null)

const selected = computed(() => stocks.value.find((s) => s.id === stockId.value) ?? null)

/** 收藏的型号：最近收藏 / 最近建档的在前 */
const favorites = computed(() =>
  stocks.value
    .filter((s) => s.favoritedAt)
    .sort((a, b) => (b.favoritedAt ?? '').localeCompare(a.favoritedAt ?? '')),
)
const prefix = computed(() => selected.value?.prefix ?? '')

/** 该型号已分配到的最大序号，用于提示 */
const nextHint = ref<{ code: string; seq: number; serialTxt: string } | null>(null)

/** 批量预览：从 serial 起按 seq 连续展开 */
const preview = computed(() => {
  if (mode.value !== 'batch' || !prefix.value) return []
  const start = parseSerialLocal(serial.value)
  if (start === null) return []
  return Array.from({ length: Math.min(count.value, 50) }, (_, i) => {
    const seq = start + i
    if (seq > 6199) return null
    return prefix.value + serialFromSeqLocal(seq)
  }).filter((v): v is string => v !== null)
})

/**
 * 扫到内容后的回填：
 *   7 位 → 视为编号，拆出前缀定位型号，序号回填
 *   纯数字 8-14 位 → 视为包装条码，走 /api/scan 查型号
 */
async function handleScanned(raw: string) {
  scannerOpen.value = false
  scannedRaw.value = raw
  error.value = null

  const text = raw.trim()

  if (/^[A-Za-z0-9]{7}$/.test(text)) {
    const codePrefix = text.slice(0, 4)
    const hit = stocks.value.find((s) => s.prefix === codePrefix)
    if (hit) {
      stockId.value = hit.id
      serial.value = text.slice(4)
      return
    }
    error.value = `前缀 ${codePrefix} 不在型号库中，请先到型号库补齐型号`
    return
  }

  // 包装条码：查已绑定的型号
  try {
    const res = await api.post<{ kind: string; stock: { id: number; name: string } | null }>(
      '/scan',
      { raw: text },
    )
    if (res.kind === 'barcode' && res.stock) {
      const hit = stocks.value.find((s) => s.id === res.stock!.id)
      if (hit) {
        stockId.value = hit.id
        error.value = null
        return
      }
    }
    error.value = `条码 ${text} 尚未绑定到任何型号`
  } catch (e) {
    error.value = (e as Error).message
  }
}

function headIndexLocal(ch: string): number {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 65 + 10
  if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 97 + 36
  return -1
}

function parseSerialLocal(s: string): number | null {
  if (!/^[0-9A-Za-z]\d{2}$/.test(s)) return null
  const h = headIndexLocal(s[0]!)
  if (h < 0) return null
  const seq = h * 100 + Number(s.slice(1))
  return seq >= 1 ? seq : null
}

function serialFromSeqLocal(seq: number): string {
  const h = Math.floor(seq / 100)
  const head =
    h <= 9 ? String(h) : h <= 35 ? String.fromCharCode(65 + h - 10) : String.fromCharCode(97 + h - 36)
  return head + String(seq % 100).padStart(2, '0')
}

async function loadStocks() {
  const res = await api.get<{ items: Stock[] }>('/stocks')
  stocks.value = res.items

  // 从扫码页带过来的前缀，直接定位型号
  const qPrefix = typeof route.query.prefix === 'string' ? route.query.prefix : ''
  if (qPrefix) {
    const hit = stocks.value.find((s) => s.prefix === qPrefix)
    if (hit) stockId.value = hit.id
  }
  if (typeof route.query.serial === 'string' && route.query.serial) {
    serial.value = route.query.serial
  }
}

async function refreshNext() {
  if (!stockId.value) {
    nextHint.value = null
    return
  }
  try {
    nextHint.value = await api.get<{ code: string; seq: number; serialTxt: string }>(
      `/stocks/${stockId.value}/next-serial`,
    )
    if (!serial.value) serial.value = nextHint.value.serialTxt
  } catch {
    nextHint.value = null
  }
}

watch(stockId, async () => {
  // 先清空，refreshNext 会把「下一个可用」直接填进序号框：
  // 不想要就手动改，想用直接提交，不必再复制粘贴
  serial.value = ''
  await refreshNext()
  if (nextHint.value && !serial.value) serial.value = nextHint.value.serialTxt
  const s = selected.value
  if (s?.defaultFrames) framesTotal.value = s.defaultFrames
  else if (s?.format === '120') framesTotal.value = 12
  else framesTotal.value = 36
})

async function submit() {
  if (!stockId.value || !prefix.value) {
    error.value = '请先选择型号'
    return
  }
  submitting.value = true
  error.value = null
  conflicts.value = []
  try {
    if (mode.value === 'single') {
      const code = prefix.value + serial.value
      const roll = await api.post<{ id: number; code: string }>('/rolls', {
        code,
        framesTotal: framesTotal.value,
      })
      created.value = [roll]
    } else {
      const startSeq = parseSerialLocal(serial.value)
      if (startSeq === null) throw new Error('起始序号不合法')
      // strict：从起始序号起连续 N 个，只要有一个已存在就报错，绝不自动顺延
      const res = await api.post<{ rolls: { id: number; code: string }[]; conflicts?: { code: string }[] }>(
        '/rolls/batch',
        {
          prefix: prefix.value,
          startSeq,
          count: count.value,
          framesTotal: framesTotal.value,
          onConflict: 'strict',
          box: { label: new Date().toISOString().slice(0, 10) },
        },
      )
      created.value = res.rolls
    }

    if (created.value.length > 0) {
      // 建档完成：展示编号，供复制到其他 app 生成标签
      // 本系统不再内置标签打印
      showResult.value = true
      copied.value = false
      await nextTick()
      await refreshNext()
    }
  } catch (e) {
    error.value = (e as Error).message
    conflicts.value = e instanceof ApiError ? (e.conflicts ?? []) : []
  } finally {
    submitting.value = false
  }
}

/** 复制刚生成的编号，一行一个 */
async function copyCodes() {
  const text = created.value.map((r) => r.code).join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    error.value = '复制失败，请长按选择编号手动复制'
  }
}

/** 继续建下一批 */
function restart() {
  showResult.value = false
  created.value = []
  serial.value = ''
  void refreshNext()
  // 建档会自动收藏该型号，重新拉列表让收藏分组同步
  void api.get<{ items: Stock[] }>('/stocks').then((r) => (stocks.value = r.items))
}

onMounted(loadStocks)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <h1 class="mb-4 text-2xl font-semibold">建档</h1>

    <!-- 建档结果：编号列表，供复制到其他 app 生成标签 -->
    <template v-if="showResult">
      <div class="mb-4 rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-4 text-center">
        <div class="text-2xl">✓</div>
        <p class="mt-1 text-sm text-emerald-300">已建档 {{ created.length }} 卷</p>
      </div>

      <div class="mb-4 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm text-slate-400">编号（一行一个，可直接复制）</span>
          <button class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs" @click="copyCodes">
            {{ copied ? '已复制 ✓' : '复制全部' }}
          </button>
        </div>
        <div class="select-all space-y-1">
          <div
            v-for="r in created"
            :key="r.id"
            class="code-text rounded-lg bg-slate-950 px-3 py-2 text-lg text-amber-400"
          >
            {{ r.code }}
          </div>
        </div>
      </div>

      <p class="mb-4 text-xs text-slate-500">
        标签在本系统之外生成即可。行距与字体请在打印 app 里按标签纸尺寸调整。
      </p>

      <div class="flex gap-2">
        <button class="flex-1 rounded-2xl bg-slate-800 py-4 text-base" @click="restart">
          继续建档
        </button>
        <RouterLink
          to="/rolls"
          class="flex-1 rounded-2xl bg-amber-500 py-4 text-center text-base font-medium text-slate-950"
        >
          去胶卷库
        </RouterLink>
      </div>
    </template>

    <template v-else>
      <section class="mb-4">
        <label class="mb-1.5 block text-xs text-slate-400">型号</label>
        <select
          v-model.number="stockId"
          class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
        >
          <option :value="null">选择型号</option>
          <!-- 收藏置顶；下面的完整列表里同样保留，便于按品牌顺序找 -->
          <optgroup v-if="favorites.length" label="★ 收藏">
            <option v-for="s in favorites" :key="`fav-${s.id}`" :value="s.id">
              ★ {{ s.prefix }} · {{ s.name }}
            </option>
          </optgroup>
          <optgroup label="全部型号">
            <option v-for="s in stocks" :key="s.id" :value="s.id">
              {{ s.favoritedAt ? '★ ' : '' }}{{ s.prefix }} · {{ s.name }}
            </option>
          </optgroup>
        </select>
        <p v-if="nextHint" class="mt-1.5 text-xs text-slate-500">
          下一个可用：<span class="code-text text-amber-400">{{ nextHint.code }}</span>
        </p>
      </section>

      <div class="mb-4 flex rounded-xl bg-slate-900 p-1">
        <button
          class="flex-1 rounded-lg py-2 text-sm"
          :class="mode === 'single' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
          @click="mode = 'single'"
        >
          单卷
        </button>
        <button
          class="flex-1 rounded-lg py-2 text-sm"
          :class="mode === 'batch' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
          @click="mode = 'batch'"
        >
          批量（一盒多卷）
        </button>
      </div>

      <section class="mb-4 space-y-3">
        <div>
          <label class="mb-1.5 block text-xs text-slate-400">
            {{ mode === 'batch' ? '起始序号' : '序号' }}
          </label>
          <div class="flex items-center gap-2">
            <span v-if="prefix" class="code-text text-lg text-amber-400">{{ prefix }}</span>
            <input
              v-model="serial"
              maxlength="3"
              placeholder="001"
              class="code-text w-28 rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-center text-lg outline-none focus:border-amber-500"
            />
            <button
              v-if="mode === 'single'"
              class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-xl active:bg-slate-700"
              title="扫编号或包装条码"
              @click="scannerOpen = true"
            >
              ⌗
            </button>
          </div>
          <p v-if="mode === 'single'" class="mt-1.5 text-xs text-slate-500">
            扫编号自动定位型号与序号，扫包装条码自动定位型号
          </p>
        </div>

        <div v-if="mode === 'batch'">
          <label class="mb-1.5 block text-xs text-slate-400">数量（最多 50）</label>
          <input
            v-model.number="count"
            type="number"
            min="1"
            max="50"
            class="w-28 rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-center tabular-nums outline-none focus:border-amber-500"
          />
          <div v-if="preview.length" class="mt-2 flex flex-wrap gap-1.5">
            <span
              v-for="code in preview"
              :key="code"
              class="code-text rounded-lg bg-slate-800 px-2 py-1 text-xs text-slate-300"
            >
              {{ code }}
            </span>
          </div>
        </div>

        <div>
          <label class="mb-1.5 block text-xs text-slate-400">每卷张数</label>
          <input
            v-model.number="framesTotal"
            type="number"
            min="1"
            max="200"
            class="w-28 rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-center tabular-nums outline-none focus:border-amber-500"
          />
        </div>
      </section>

      <div v-if="error" class="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        <p>{{ error }}</p>
        <div v-if="conflicts.length" class="mt-2">
          <p class="text-xs text-slate-400">以下编号已存在，未做任何改动：</p>
          <div class="mt-1 flex flex-wrap gap-1.5">
            <span
              v-for="c in conflicts"
              :key="c.code"
              class="code-text rounded-lg bg-red-900/40 px-2 py-1 text-xs"
            >
              {{ c.code }}
            </span>
          </div>
        </div>
      </div>

      <button
        :disabled="submitting || !stockId || !serial"
        class="w-full rounded-2xl bg-amber-500 py-4 text-lg font-medium text-slate-950 disabled:opacity-40"
        @click="submit"
      >
        {{ submitting ? '建档中…' : mode === 'batch' ? `建档 ${count} 卷` : '建档' }}
      </button>
    </template>

    <ScanSheet :open="scannerOpen" @close="scannerOpen = false" @scanned="handleScanned" />
  </div>
</template>
