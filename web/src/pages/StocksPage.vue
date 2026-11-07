<script setup lang="ts">
/** 型号库：列表 + 字母占用表 + 待认领 */
import { computed, onMounted, ref } from 'vue'
import { api } from '../lib/api.js'
import type { PrefixMapResponse, Stock } from '../lib/types.js'
import { BRANDS } from '@film-vault/shared'

const stocks = ref<Stock[]>([])
const prefixMap = ref<PrefixMapResponse | null>(null)
const keyword = ref('')
const brandFilter = ref('')
const loading = ref(true)
const error = ref<string | null>(null)
const tab = ref<'list' | 'map'>('list')

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return stocks.value.filter((s) => {
    if (brandFilter.value && s.brandCode !== brandFilter.value) return false
    if (!kw) return true
    return (
      s.name.toLowerCase().includes(kw) ||
      (s.prefix ?? '').toLowerCase().includes(kw) ||
      String(s.iso).includes(kw)
    )
  })
})

const grouped = computed(() => {
  const map = new Map<string, Stock[]>()
  for (const s of filtered.value) {
    const list = map.get(s.brandCode) ?? []
    list.push(s)
    map.set(s.brandCode, list)
  }
  return [...map.entries()].map(([code, items]) => ({
    code,
    name: BRANDS.find((b) => b.code === code)?.name ?? code,
    items,
  }))
})

async function load() {
  loading.value = true
  error.value = null
  try {
    const [a, b] = await Promise.all([
      api.get<{ items: Stock[] }>('/stocks'),
      api.get<PrefixMapResponse>('/stocks/prefix-map'),
    ])
    stocks.value = a.items
    prefixMap.value = b
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 pt-6">
    <header class="mb-5 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-semibold">型号库</h1>
        <p class="mt-1 text-sm text-slate-400">共 {{ stocks.length }} 个型号</p>
      </div>
    </header>

    <div class="mb-4 flex rounded-xl bg-slate-900 p-1">
      <button
        class="flex-1 rounded-lg py-2 text-sm"
        :class="tab === 'list' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
        @click="tab = 'list'"
      >
        列表
      </button>
      <button
        class="flex-1 rounded-lg py-2 text-sm"
        :class="tab === 'map' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
        @click="tab = 'map'"
      >
        字母占用
      </button>
    </div>

    <p v-if="error" class="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {{ error }}
    </p>

    <!-- 列表 -->
    <template v-if="tab === 'list'">
      <div class="mb-4 flex gap-2">
        <input
          v-model="keyword"
          placeholder="搜索名称、前缀、ISO"
          class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-500"
        />
        <select
          v-model="brandFilter"
          class="rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none"
        >
          <option value="">全部品牌</option>
          <option v-for="b in BRANDS" :key="b.code" :value="b.code">{{ b.name }}</option>
        </select>
      </div>

      <div v-if="loading" class="py-16 text-center text-slate-500">加载中…</div>

      <div v-else class="space-y-6">
        <section v-for="group in grouped" :key="group.code">
          <h2 class="mb-2 text-sm font-medium text-slate-400">{{ group.name }}</h2>
          <div class="grid gap-2 md:grid-cols-2">
            <RouterLink
              v-for="s in group.items"
              :key="s.id"
              :to="`/stocks/${s.id}`"
              class="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
            >
              <div class="min-w-0">
                <div class="flex items-baseline gap-2">
                  <span class="code-text text-amber-400">{{ s.prefix ?? '—' }}</span>
                  <span class="truncate text-sm">{{ s.name }}</span>
                </div>
                <div class="mt-1 text-xs text-slate-500">
                  ISO {{ s.iso }} · {{ s.format }} · {{ s.process ?? '—' }}
                  <span v-if="s.status === 'discontinued'" class="ml-1 text-slate-600">停产</span>
                </div>
              </div>
              <div class="shrink-0 text-right text-xs text-slate-500">
                <div>{{ s.rollCount ?? 0 }} 卷</div>
                <div v-if="s.activeCount">{{ s.activeCount }} 在拍</div>
              </div>
            </RouterLink>
          </div>
        </section>
      </div>
    </template>

    <!-- 字母占用表 -->
    <template v-else-if="prefixMap">
      <div class="space-y-6">
        <section v-for="brand in prefixMap.brands" :key="brand.brandCode">
          <h2 class="mb-2 text-sm font-medium text-slate-400">
            {{ brand.brandName }}
            <span class="ml-1 code-text text-slate-600">{{ brand.brandCode }}</span>
          </h2>
          <div class="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-9">
            <template v-for="slot in brand.letters" :key="slot.letter">
              <RouterLink
                v-if="slot.stock"
                :to="`/stocks/${slot.stock.stockId}`"
                class="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5"
              >
                <div class="code-text text-sm text-amber-400">{{ slot.letter }}</div>
                <div class="truncate text-[11px] text-slate-400">{{ slot.stock.name }}</div>
              </RouterLink>
              <div
                v-else
                class="rounded-lg border border-slate-800/60 px-2 py-1.5 text-slate-700"
              >
                <div class="code-text text-sm">{{ slot.letter }}</div>
                <div class="text-[11px]">空闲</div>
              </div>
            </template>
          </div>
        </section>
      </div>

      <section v-if="prefixMap.pending.length" class="mt-8">
        <h2 class="mb-2 text-sm font-medium text-slate-400">待认领</h2>
        <div class="space-y-2">
          <div
            v-for="p in prefixMap.pending"
            :key="p.prefix"
            class="flex items-center justify-between rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3"
          >
            <span class="code-text text-amber-400">{{ p.prefix }}</span>
            <span class="text-xs text-slate-400">出现 {{ p.seenCount }} 次</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
