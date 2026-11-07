<script setup lang="ts">
/**
 * 胶卷详情：编号大字 → 型号卡 → 进度条 → 操作 → 时间线 → 冲洗。
 * 留白足、字号大，适合直接手机截图。
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../lib/api.js'
import type { RollDetail, ProgressEntry, FrameNote, Development, TimelineEntry } from '../lib/types.js'
import { ROLL_STATUS_LABEL, type RollStatus } from '@film-vault/shared/client'
import RecordSheet from '../components/RecordSheet.vue'
import ScanSheet from '../components/ScanSheet.vue'

const route = useRoute()
const roll = ref<RollDetail | null>(null)
const frameNotes = ref<FrameNote[]>([])
const developments = ref<Development[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const sheetOpen = ref(false)

// 单张注解表单
const addingFrame = ref(false)
const frameDraft = ref({
  frameNo: '' as number | '',
  aperture: '',
  shutter: '',
  ei: '' as number | '',
  evOffset: '',
  location: '',
  note: '',
})

// 冲洗表单
const addingDev = ref(false)
const devDraft = ref({
  method: 'lab' as 'self' | 'lab',
  process: '',
  developer: '',
  dilution: '',
  tempC: '' as number | '',
  durationSec: '' as number | '',
  labName: '',
  notes: '',
})

const percent = computed(() =>
  roll.value && roll.value.framesTotal > 0
    ? Math.min(100, Math.round((roll.value.reachedFrame / roll.value.framesTotal) * 100))
    : 0,
)

/** 进度、单张注解、冲洗按时间交错成一条线（新的在上） */
const timeline = computed<TimelineEntry[]>(() => {
  const entries: TimelineEntry[] = []

  for (const p of roll.value?.progress ?? []) {
    entries.push({ kind: 'progress', at: p.happenedAt, data: p })
  }
  for (const f of frameNotes.value) {
    entries.push({ kind: 'frame', at: f.happenedAt ?? f.createdAt, data: f })
  }
  for (const d of developments.value) {
    entries.push({ kind: 'development', at: d.devAt ?? d.createdAt, data: d })
  }

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
})

async function load() {
  loading.value = true
  error.value = null
  const id = route.params.id
  try {
    const [detail, frames, devs] = await Promise.all([
      api.get<RollDetail>(`/rolls/${id}`),
      api.get<{ items: FrameNote[] }>(`/rolls/${id}/frame-notes`),
      api.get<{ items: Development[] }>(`/rolls/${id}/developments`),
    ])
    roll.value = detail
    frameNotes.value = frames.items
    developments.value = devs.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
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

async function removeFrame(f: FrameNote) {
  await api.del(`/frame-notes/${f.id}`)
  await load()
}

async function removeDev(d: Development) {
  await api.del(`/developments/${d.id}`)
  await load()
}

async function saveFrame() {
  if (!roll.value || frameDraft.value.frameNo === '') return
  error.value = null
  try {
    await api.post(`/rolls/${roll.value.id}/frame-notes`, {
      frameNo: Number(frameDraft.value.frameNo),
      aperture: frameDraft.value.aperture || null,
      shutter: frameDraft.value.shutter || null,
      ei: frameDraft.value.ei === '' ? null : Number(frameDraft.value.ei),
      evOffset: frameDraft.value.evOffset || null,
      location: frameDraft.value.location || null,
      note: frameDraft.value.note || null,
    })
    frameDraft.value = { frameNo: '', aperture: '', shutter: '', ei: '', evOffset: '', location: '', note: '' }
    addingFrame.value = false
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function saveDev() {
  if (!roll.value) return
  error.value = null
  try {
    await api.post(`/rolls/${roll.value.id}/developments`, {
      method: devDraft.value.method,
      process: devDraft.value.process || null,
      developer: devDraft.value.developer || null,
      dilution: devDraft.value.dilution || null,
      tempC: devDraft.value.tempC === '' ? null : Number(devDraft.value.tempC),
      durationSec: devDraft.value.durationSec === '' ? null : Number(devDraft.value.durationSec),
      labName: devDraft.value.labName || null,
      notes: devDraft.value.notes || null,
    })
    devDraft.value = {
      method: 'lab',
      process: '',
      developer: '',
      dilution: '',
      tempC: '',
      durationSec: '',
      labName: '',
      notes: '',
    }
    addingDev.value = false
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

// 有效期编辑
const editingExpiry = ref(false)
const expiryDraft = ref('')
const savingExpiry = ref(false)
/** 扫码目标：有效期 */
const expiryScanOpen = ref(false)

function startEditExpiry() {
  expiryDraft.value = roll.value?.expiryDate ?? ''
  editingExpiry.value = true
  error.value = null
}

async function saveExpiry() {
  if (!roll.value) return
  const v = expiryDraft.value.trim()
  if (v && (!/^\d{6}$/.test(v) || Number(v.slice(4)) < 1 || Number(v.slice(4)) > 12)) {
    error.value = '有效期格式应为年月 6 位数字，如 202808'
    return
  }
  savingExpiry.value = true
  error.value = null
  try {
    await api.patch(`/rolls/${roll.value.id}`, { expiryDate: v || null })
    editingExpiry.value = false
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    savingExpiry.value = false
  }
}

/** 扫到有效期：填进草稿，不直接提交，留给用户确认 */
function onExpiryScanned(raw: string) {
  expiryScanOpen.value = false
  const parsed = parseExpiryText(raw)
  if (parsed) {
    expiryDraft.value = parsed
    editingExpiry.value = true
  } else {
    error.value = `从「${raw}」里没认出有效期，可手动填写，格式如 202808`
  }
}

/**
 * 从扫码内容里解析年月。与建档页保持同一套规则：
 * 202808 / 2028-08 / 08/2028 / 0828 / 2808
 */
function parseExpiryText(raw: string): string | null {
  const t = raw.trim()
  const valid = (y: number, m: number) =>
    y >= 1900 && y <= 2100 && m >= 1 && m <= 12 ? `${y}${String(m).padStart(2, '0')}` : null

  let m = /^(\d{4})(\d{2})$/.exec(t)
  if (m) return valid(Number(m[1]), Number(m[2]))
  m = /^(\d{4})[-/.](\d{1,2})$/.exec(t)
  if (m) return valid(Number(m[1]), Number(m[2]))
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(t)
  if (m) return valid(Number(m[2]), Number(m[1]))
  m = /^(\d{2})(\d{2})$/.exec(t)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a >= 1 && a <= 12) return valid(2000 + b, a)
    if (b >= 1 && b <= 12) return valid(2000 + a, b)
  }
  return null
}

/** 202808 → 2028-08 */
function fmtExpiry(v: string): string {
  return /^\d{6}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4)}` : v
}

/** 剩余不足 6 个月标红提示 */
function isExpiringSoon(v: string): boolean {
  if (!/^\d{6}$/.test(v)) return false
  const d = new Date()
  const nowMonths = d.getFullYear() * 12 + d.getMonth() + 1
  const expMonths = Number(v.slice(0, 4)) * 12 + Number(v.slice(4))
  return expMonths - nowMonths <= 6
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6 pb-10">
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
          <button
            v-if="roll.expiryDate"
            class="rounded-full px-2.5 py-1"
            :class="isExpiringSoon(roll.expiryDate) ? 'bg-red-900/60 text-red-300' : 'bg-slate-800'"
            title="点一下修改有效期"
            @click="startEditExpiry"
          >
            有效期 {{ fmtExpiry(roll.expiryDate) }}
          </button>
          <button
            v-else
            class="rounded-full border border-dashed border-slate-700 px-2.5 py-1 text-slate-500"
            title="添加有效期"
            @click="startEditExpiry"
          >
            ＋ 有效期
          </button>
          <span class="rounded-full bg-slate-800 px-2.5 py-1">
            {{ ROLL_STATUS_LABEL[roll.status as RollStatus] ?? roll.status }}
          </span>
        </div>
      </header>

      <!-- 修改有效期 -->
      <section v-if="editingExpiry" class="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <label class="mb-1.5 block text-xs text-slate-400">有效期（年月 6 位）</label>
        <div class="flex items-center gap-2">
          <input
            v-model="expiryDraft"
            maxlength="6"
            inputmode="numeric"
            placeholder="202808"
            class="code-text w-32 rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-center text-lg outline-none focus:border-amber-500"
          />
          <button
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-xl active:bg-slate-700"
            title="扫包装上的有效期"
            @click="expiryScanOpen = true"
          >
            ⌗
          </button>
          <span v-if="expiryDraft.length === 6 && /^\d{6}$/.test(expiryDraft)" class="text-xs text-slate-500">
            {{ expiryDraft.slice(0, 4) }} 年 {{ Number(expiryDraft.slice(4)) }} 月
          </span>
        </div>
        <div class="mt-3 flex gap-2">
          <button class="rounded-xl bg-slate-800 px-4 py-2.5 text-sm" @click="editingExpiry = false">
            取消
          </button>
          <button
            class="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-medium text-slate-950 disabled:opacity-40"
            :disabled="savingExpiry"
            @click="saveExpiry"
          >
            {{ savingExpiry ? '保存中…' : '保存' }}
          </button>
          <button
            v-if="roll.expiryDate"
            class="rounded-xl px-3 py-2.5 text-sm text-red-400"
            :disabled="savingExpiry"
            @click="expiryDraft = ''; saveExpiry()"
          >
            清除
          </button>
        </div>
      </section>

      <!-- 进度 -->
      <section class="mb-6 rounded-3xl border border-slate-800 bg-slate-900 p-5 text-center">
        <div class="text-5xl font-semibold tabular-nums">
          {{ roll.reachedFrame }}
          <span class="text-2xl text-slate-500">/ {{ roll.framesTotal }}</span>
        </div>
        <div class="mt-1 text-xs text-slate-500">已拍 · 剩余 {{ roll.remaining }} 张</div>
        <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
          <div
            class="h-full rounded-full bg-amber-500 transition-[width] duration-300"
            :style="{ width: `${percent}%` }"
          />
        </div>
        <button
          class="mt-4 w-full rounded-xl bg-amber-500 py-3 font-medium text-slate-950"
          @click="sheetOpen = true"
        >
          记一笔
        </button>
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

      <p v-if="error" class="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        {{ error }}
      </p>

      <!-- 时间线 -->
      <section class="mb-8">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-medium text-slate-400">时间线</h2>
          <button class="text-xs text-slate-500" @click="addingFrame = !addingFrame">
            {{ addingFrame ? '取消' : '＋ 单张注解' }}
          </button>
        </div>

        <!-- 单张注解表单 -->
        <div v-if="addingFrame" class="mb-4 space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div class="flex gap-2">
            <input
              v-model.number="frameDraft.frameNo"
              type="number"
              inputmode="numeric"
              min="1"
              placeholder="第几张"
              class="w-24 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-center text-sm tabular-nums outline-none focus:border-amber-500"
            />
            <input
              v-model="frameDraft.aperture"
              placeholder="光圈"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
            <input
              v-model="frameDraft.shutter"
              placeholder="快门"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <div class="flex gap-2">
            <input
              v-model.number="frameDraft.ei"
              type="number"
              placeholder="EI"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
            <input
              v-model="frameDraft.evOffset"
              placeholder="曝光补偿"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
            <input
              v-model="frameDraft.location"
              placeholder="地点"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <textarea
            v-model="frameDraft.note"
            rows="2"
            placeholder="备注（所有字段都可以不填）"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
          <button
            class="w-full rounded-xl bg-slate-800 py-2.5 text-sm disabled:opacity-40"
            :disabled="frameDraft.frameNo === ''"
            @click="saveFrame"
          >
            保存注解
          </button>
        </div>

        <div v-if="timeline.length === 0" class="text-sm text-slate-600">还没有记录</div>
        <ol v-else class="relative space-y-3 border-l border-slate-800 pl-5">
          <li v-for="entry in timeline" :key="`${entry.kind}-${entry.data.id}`" class="relative">
            <span
              class="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full"
              :class="{
                'bg-amber-500': entry.kind === 'progress',
                'bg-sky-500': entry.kind === 'frame',
                'bg-emerald-500': entry.kind === 'development',
              }"
            />

            <!-- 进度快照 -->
            <div v-if="entry.kind === 'progress'" class="rounded-xl bg-slate-900 px-4 py-3">
              <div class="flex items-baseline justify-between gap-2">
                <span v-if="entry.data.event === 'load'" class="text-lg font-semibold">装机</span>
                <span v-else class="text-lg font-semibold tabular-nums">
                  第 {{ entry.data.reachedFrame }} 张
                </span>
                <button class="text-xs text-slate-600 hover:text-red-400" @click="removeProgress(entry.data)">
                  删除
                </button>
              </div>
              <div class="mt-1 text-xs text-slate-500">{{ fmt(entry.at) }}</div>
              <p v-if="entry.data.address" class="mt-1 text-xs text-slate-400">📍 {{ entry.data.address }}</p>
              <p v-if="entry.data.note" class="mt-1 text-sm text-slate-300">{{ entry.data.note }}</p>
            </div>

            <!-- 单张注解 -->
            <div v-else-if="entry.kind === 'frame'" class="rounded-xl bg-slate-900 px-4 py-3">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-semibold text-sky-300">第 {{ entry.data.frameNo }} 张注解</span>
                <button class="text-xs text-slate-600 hover:text-red-400" @click="removeFrame(entry.data)">
                  删除
                </button>
              </div>
              <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span v-if="entry.data.aperture">{{ entry.data.aperture }}</span>
                <span v-if="entry.data.shutter">{{ entry.data.shutter }}</span>
                <span v-if="entry.data.ei">EI {{ entry.data.ei }}</span>
                <span v-if="entry.data.evOffset">{{ entry.data.evOffset }}</span>
                <span v-if="entry.data.location">{{ entry.data.location }}</span>
              </div>
              <p v-if="entry.data.note" class="mt-1 text-sm text-slate-300">{{ entry.data.note }}</p>
              <div class="mt-1 text-xs text-slate-600">{{ fmt(entry.at) }}</div>
            </div>

            <!-- 冲洗 -->
            <div v-else class="rounded-xl bg-slate-900 px-4 py-3">
              <div class="flex items-baseline justify-between gap-2">
                <span class="text-sm font-semibold text-emerald-300">
                  {{ entry.data.method === 'self' ? '自冲' : '送店冲洗' }}
                </span>
                <button class="text-xs text-slate-600 hover:text-red-400" @click="removeDev(entry.data)">
                  删除
                </button>
              </div>
              <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                <span v-if="entry.data.process">{{ entry.data.process }}</span>
                <span v-if="entry.data.developer">{{ entry.data.developer }}</span>
                <span v-if="entry.data.dilution">{{ entry.data.dilution }}</span>
                <span v-if="entry.data.tempC">{{ entry.data.tempC }}°C</span>
                <span v-if="entry.data.durationSec">{{ entry.data.durationSec }}s</span>
                <span v-if="entry.data.labName">{{ entry.data.labName }}</span>
              </div>
              <p v-if="entry.data.notes" class="mt-1 text-sm text-slate-300">{{ entry.data.notes }}</p>
              <div class="mt-1 text-xs text-slate-600">{{ fmt(entry.at) }}</div>
            </div>
          </li>
        </ol>
      </section>

      <!-- 冲洗记录 -->
      <section>
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-sm font-medium text-slate-400">冲洗记录</h2>
          <button class="text-xs text-slate-500" @click="addingDev = !addingDev">
            {{ addingDev ? '取消' : '＋ 添加' }}
          </button>
        </div>

        <div v-if="addingDev" class="space-y-2 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div class="flex rounded-xl bg-slate-950 p-1">
            <button
              class="flex-1 rounded-lg py-2 text-sm"
              :class="devDraft.method === 'lab' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
              @click="devDraft.method = 'lab'"
            >
              送店
            </button>
            <button
              class="flex-1 rounded-lg py-2 text-sm"
              :class="devDraft.method === 'self' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
              @click="devDraft.method = 'self'"
            >
              自冲
            </button>
          </div>

          <input
            v-model="devDraft.process"
            placeholder="工艺，如 C-41"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />

          <template v-if="devDraft.method === 'lab'">
            <input
              v-model="devDraft.labName"
              placeholder="店铺名"
              class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
          </template>
          <template v-else>
            <div class="flex gap-2">
              <input
                v-model="devDraft.developer"
                placeholder="显影液"
                class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
              />
              <input
                v-model="devDraft.dilution"
                placeholder="稀释"
                class="w-24 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
              />
            </div>
            <div class="flex gap-2">
              <input
                v-model.number="devDraft.tempC"
                type="number"
                step="0.1"
                placeholder="温度 °C"
                class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
              />
              <input
                v-model.number="devDraft.durationSec"
                type="number"
                placeholder="时长 秒"
                class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
              />
            </div>
          </template>

          <textarea
            v-model="devDraft.notes"
            rows="2"
            placeholder="备注（可空）"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
          <button class="w-full rounded-xl bg-slate-800 py-2.5 text-sm" @click="saveDev">保存</button>
        </div>

        <p v-if="developments.length === 0" class="text-sm text-slate-600">还没有冲洗记录</p>
      </section>

      <RecordSheet :open="sheetOpen" :roll="roll" @close="sheetOpen = false" @saved="load" />
      <ScanSheet :open="expiryScanOpen" @close="expiryScanOpen = false" @scanned="onExpiryScanned" />
    </template>
  </div>
</template>
