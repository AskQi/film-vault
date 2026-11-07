<script setup lang="ts">
/** 型号库：列表 + 字母占用表 + 待认领 */
import { computed, onMounted, ref } from 'vue'
import { api } from '../lib/api.js'
import type { ImportPreview, PrefixMapResponse, PendingStock, Stock } from '../lib/types.js'
import { BRANDS } from '@film-vault/shared/client'

const stocks = ref<Stock[]>([])
const prefixMap = ref<PrefixMapResponse | null>(null)
const keyword = ref('')
const brandFilter = ref('')
const loading = ref(true)
const error = ref<string | null>(null)
const tab = ref<'list' | 'map' | 'import'>('list')

// 文本导入
const importText = ref('')
const preview = ref<ImportPreview | null>(null)
const importing = ref(false)
const importError = ref<string | null>(null)

// 待认领
const pending = ref<PendingStock[]>([])
const claimingPrefix = ref<string | null>(null)
const claimName = ref('')
const claiming = ref(false)
const claimError = ref<string | null>(null)

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
    pending.value = await api.get<{ items: PendingStock[] }>('/stocks/pending').then((r) => r.items)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function runImport(commit: boolean) {
  importing.value = true
  importError.value = null
  try {
    preview.value = await api.post<ImportPreview>('/stocks/import/text', {
      text: importText.value,
      commit,
    })
    if (commit) {
      await load()
      if ((preview.value.inserted?.length ?? 0) > 0) importText.value = ''
    }
  } catch (e) {
    importError.value = (e as Error).message
  } finally {
    importing.value = false
  }
}

function openClaim(prefix: string) {
  claimingPrefix.value = prefix
  claimName.value = ''
  claimError.value = null
}

async function claimPending(prefix: string) {
  const item = pending.value.find((p) => p.prefix === prefix)
  if (!item) return
  claiming.value = true
  claimError.value = null
  try {
    await api.post(`/stocks/pending/${item.id}/claim`, {
      newStock: {
        // 系列字母取自前缀第 2 位，与编码保持一致
        seriesCode: prefix[1],
        name: claimName.value.trim(),
      },
    })
    claimingPrefix.value = null
    await load()
  } catch (e) {
    claimError.value = (e as Error).message
  } finally {
    claiming.value = false
  }
}

async function ignorePending(prefix: string) {
  const item = pending.value.find((p) => p.prefix === prefix)
  if (!item) return
  await api.del(`/stocks/pending/${item.id}`)
  await load()
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 pt-6">
    <header class="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">型号库</h1>
        <p class="mt-1 text-sm text-slate-400">共 {{ stocks.length }} 个型号</p>
      </div>
      <div class="flex shrink-0 gap-2">
        <RouterLink
          to="/stocks/new"
          class="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950"
        >
          新建
        </RouterLink>
        <button class="rounded-xl bg-slate-800 px-4 py-2 text-sm" @click="tab = 'import'">
          导入
        </button>
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
      <button
        class="flex-1 rounded-lg py-2 text-sm"
        :class="tab === 'import' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
        @click="tab = 'import'"
      >
        导入
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

    </template>

    <!-- 文本批量导入 -->
    <template v-else-if="tab === 'import'">
      <div class="mb-4 rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs leading-relaxed text-slate-400">
        每行一条型号，例如<br />
        <span class="code-text text-slate-300">Kodak Portra 400 135 36张 C-41</span><br />
        <span class="code-text text-slate-300">Fujifilm Velvia 50 120 E-6</span><br />
        <span class="code-text text-slate-300">柯达 Gold 200 135</span><br />
        先预览，确认后再入库。前缀由系统拼装，冲突会给出可用字母。
      </div>

      <textarea
        v-model="importText"
        rows="8"
        placeholder="粘贴型号文本，一行一条"
        class="mb-3 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 font-mono text-sm outline-none focus:border-amber-500"
      />

      <div class="mb-4 flex gap-2">
        <button
          class="flex-1 rounded-xl bg-slate-800 py-3 text-sm disabled:opacity-40"
          :disabled="!importText.trim() || importing"
          @click="runImport(false)"
        >
          预览
        </button>
        <button
          class="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-medium text-slate-950 disabled:opacity-40"
          :disabled="!preview || preview.okCount === 0 || importing"
          @click="runImport(true)"
        >
          确认导入（{{ preview?.okCount ?? 0 }} 条）
        </button>
      </div>

      <p v-if="importError" class="mb-3 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        {{ importError }}
      </p>

      <div v-if="preview" class="space-y-2">
        <div
          v-for="line in preview.lines"
          :key="line.line"
          class="rounded-xl border px-4 py-3 text-sm"
          :class="line.ok ? 'border-emerald-900/60 bg-emerald-950/20' : 'border-red-900/60 bg-red-950/20'"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="code-text text-xs text-slate-500">第 {{ line.line }} 行</div>
              <div class="mt-0.5 truncate">{{ line.raw }}</div>
              <div v-if="line.ok" class="mt-1 text-xs text-slate-400">
                <span class="code-text text-amber-400">{{ line.suggestedPrefix }}</span>
                · {{ line.draft?.name }}
              </div>
              <div v-else class="mt-1 text-xs text-red-300">
                {{ line.error }}
                <div v-if="line.prefixNote" class="text-amber-300">{{ line.prefixNote }}</div>
              </div>
            </div>
            <span class="shrink-0 text-lg" :class="line.ok ? 'text-emerald-400' : 'text-red-400'">
              {{ line.ok ? '✓' : '✕' }}
            </span>
          </div>
        </div>

        <p v-if="preview.committed" class="rounded-xl bg-emerald-950/30 p-3 text-sm text-emerald-300">
          已导入 {{ preview.inserted?.length ?? 0 }} 条
        </p>
      </div>
    </template>

    <!-- 待认领：任何标签页下都可见 -->
    <section v-if="pending.length" class="mt-8">
      <h2 class="mb-2 text-sm font-medium text-slate-400">待认领（{{ pending.length }}）</h2>
      <p class="mb-2 text-xs text-slate-500">
        扫到但型号库里没有的前缀。不阻塞建档，这里补齐型号即可。
      </p>
      <div class="space-y-2">
        <div
          v-for="p in pending"
          :key="p.prefix"
          class="rounded-xl border border-amber-900/60 bg-amber-950/20 px-4 py-3"
        >
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="code-text text-amber-400">{{ p.prefix }}</span>
              <span class="ml-2 text-xs text-slate-500">出现 {{ p.seenCount }} 次</span>
            </div>
            <div class="flex shrink-0 gap-2">
              <button class="rounded-lg bg-slate-800 px-3 py-1.5 text-xs" @click="openClaim(p.prefix)">
                认领
              </button>
              <button class="rounded-lg px-3 py-1.5 text-xs text-red-400" @click="ignorePending(p.prefix)">
                忽略
              </button>
            </div>
          </div>

          <!-- 认领表单 -->
          <div v-if="claimingPrefix === p.prefix" class="mt-3 space-y-2 border-t border-amber-900/40 pt-3">
            <input
              v-model="claimName"
              :placeholder="`型号名称，如 Kodak ??? ${p.prefix.slice(2, 3)}`"
              class="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
            />
            <div class="flex gap-2">
              <button
                class="flex-1 rounded-lg bg-amber-500 py-2 text-sm font-medium text-slate-950 disabled:opacity-40"
                :disabled="!claimName.trim() || claiming"
                @click="claimPending(p.prefix)"
              >
                创建型号并挂上前缀
              </button>
              <button class="rounded-lg bg-slate-800 px-4 py-2 text-sm" @click="claimingPrefix = null">
                取消
              </button>
            </div>
            <p v-if="claimError" class="text-xs text-red-400">{{ claimError }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
