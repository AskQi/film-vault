<script setup lang="ts">
/** 型号详情：客观信息 + 个人笔记 + 条码 + 该型号所有卷 + 下一个编号 */
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../lib/api.js'
import type { Stock, StockPrefix, RollListItem } from '../lib/types.js'
import { COLOR_TYPE_LABEL, STOCK_STATUS_LABEL, type ColorType } from '@film-vault/shared'

interface Detail extends Stock {
  prefixes: StockPrefix[]
  barcodes: { barcode: string; source: string | null; createdAt: string }[]
  rolls: RollListItem[]
  next: { seq: number; serialTxt: string; code: string } | null
}

const route = useRoute()
const detail = ref<Detail | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const barcodeInput = ref('')
const savingPersonal = ref(false)
const personalDraft = ref({ nickname: '', myNotes: '', myRating: 0, refPrice: '' })

const primaryPrefix = computed(
  () => detail.value?.prefixes.find((p) => p.isPrimary === 1)?.prefix ?? null,
)

async function load() {
  loading.value = true
  error.value = null
  try {
    const d = await api.get<Detail>(`/stocks/${route.params.id}`)
    detail.value = d
    personalDraft.value = {
      nickname: d.nickname ?? '',
      myNotes: d.myNotes ?? '',
      myRating: d.myRating ?? 0,
      refPrice: d.refPrice === null ? '' : String(d.refPrice),
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function savePersonal() {
  if (!detail.value) return
  savingPersonal.value = true
  try {
    await api.patch(`/stocks/${detail.value.id}`, {
      nickname: personalDraft.value.nickname || null,
      myNotes: personalDraft.value.myNotes || null,
      myRating: personalDraft.value.myRating || null,
      refPrice: personalDraft.value.refPrice === '' ? null : Number(personalDraft.value.refPrice),
    })
    await load()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    savingPersonal.value = false
  }
}

async function bindBarcode() {
  if (!detail.value || !barcodeInput.value.trim()) return
  try {
    await api.post(`/stocks/${detail.value.id}/barcodes`, { barcode: barcodeInput.value.trim() })
    barcodeInput.value = ''
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function removeBarcode(barcode: string) {
  await api.del(`/stocks/barcodes/${barcode}`)
  await load()
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <RouterLink to="/stocks" class="mb-4 inline-block text-sm text-slate-400">← 型号库</RouterLink>

    <div v-if="loading" class="py-16 text-center text-slate-500">加载中…</div>
    <p v-else-if="error" class="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {{ error }}
    </p>

    <template v-else-if="detail">
      <header class="mb-6">
        <div class="code-text text-3xl text-amber-400">{{ primaryPrefix ?? '—' }}</div>
        <h1 class="mt-2 text-xl font-semibold">{{ detail.name }}</h1>
        <div class="mt-2 flex flex-wrap gap-2 text-xs">
          <span class="rounded-full bg-slate-800 px-2.5 py-1">ISO {{ detail.iso }}</span>
          <span class="rounded-full bg-slate-800 px-2.5 py-1">{{ detail.format }}</span>
          <span v-if="detail.process" class="rounded-full bg-slate-800 px-2.5 py-1">{{ detail.process }}</span>
          <span v-if="detail.colorType" class="rounded-full bg-slate-800 px-2.5 py-1">
            {{ COLOR_TYPE_LABEL[detail.colorType as ColorType] ?? detail.colorType }}
          </span>
          <span
            class="rounded-full px-2.5 py-1"
            :class="detail.status === 'active' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-800 text-slate-400'"
          >
            {{ STOCK_STATUS_LABEL[detail.status as keyof typeof STOCK_STATUS_LABEL] ?? detail.status }}
          </span>
        </div>
      </header>

      <!-- 下一个可用编号 -->
      <section v-if="detail.next" class="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div class="text-xs text-slate-400">下一个可用编号</div>
        <div class="mt-1 flex items-center justify-between">
          <span class="code-text text-2xl text-amber-400">{{ detail.next.code }}</span>
          <RouterLink
            :to="{ name: 'new-roll', query: { prefix: primaryPrefix, serial: detail.next.serialTxt } }"
            class="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950"
          >
            建档
          </RouterLink>
        </div>
      </section>

      <!-- 已建档的卷 -->
      <section class="mb-6">
        <h2 class="mb-2 text-sm font-medium text-slate-400">已建档 {{ detail.rolls.length }} 卷</h2>
        <div v-if="detail.rolls.length === 0" class="text-sm text-slate-600">还没有建档</div>
        <div v-else class="flex flex-wrap gap-2">
          <RouterLink
            v-for="r in detail.rolls.slice(0, 40)"
            :key="r.id"
            :to="`/rolls/${r.id}`"
            class="code-text rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-sm text-slate-300"
          >
            {{ r.code }}
          </RouterLink>
        </div>
      </section>

      <!-- 个人层 -->
      <section class="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 class="mb-3 text-sm font-medium text-slate-400">我的记录（导入不会覆盖）</h2>
        <div class="space-y-3">
          <input
            v-model="personalDraft.nickname"
            placeholder="昵称"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
          <textarea
            v-model="personalDraft.myNotes"
            placeholder="注意事项，如：阴天偏黄，+1/3 档"
            rows="3"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="mb-1 block text-xs text-slate-500">我的评分（1-5）</label>
              <input
                v-model.number="personalDraft.myRating"
                type="number"
                min="0"
                max="5"
                class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div class="flex-1">
              <label class="mb-1 block text-xs text-slate-500">参考价</label>
              <input
                v-model="personalDraft.refPrice"
                inputmode="decimal"
                class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </div>
          <button
            :disabled="savingPersonal"
            class="w-full rounded-xl bg-slate-800 py-2.5 text-sm disabled:opacity-40"
            @click="savePersonal"
          >
            {{ savingPersonal ? '保存中…' : '保存' }}
          </button>
        </div>
      </section>

      <!-- 条码绑定 -->
      <section class="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 class="mb-3 text-sm font-medium text-slate-400">包装条码</h2>
        <div class="mb-3 flex gap-2">
          <input
            v-model="barcodeInput"
            inputmode="numeric"
            placeholder="扫描或输入 EAN/UPC"
            class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
          <button class="rounded-xl bg-slate-800 px-4 py-2.5 text-sm" @click="bindBarcode">绑定</button>
        </div>
        <div v-if="detail.barcodes.length === 0" class="text-sm text-slate-600">尚未绑定</div>
        <div v-else class="space-y-2">
          <div
            v-for="b in detail.barcodes"
            :key="b.barcode"
            class="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2"
          >
            <span class="code-text text-sm">{{ b.barcode }}</span>
            <button class="text-xs text-red-400" @click="removeBarcode(b.barcode)">解绑</button>
          </div>
        </div>
      </section>

      <p v-if="detail.description" class="mb-6 rounded-2xl bg-slate-900 p-4 text-sm text-slate-400">
        {{ detail.description }}
      </p>
    </template>
  </div>
</template>
