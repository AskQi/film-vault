<script setup lang="ts">
/** 胶卷库：按状态筛选的卷列表 */
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../lib/api.js'
import type { RollListItem } from '../lib/types.js'
import RollCard from '../components/RollCard.vue'
import { ROLL_STATUSES, ROLL_STATUS_LABEL } from '@film-vault/shared/client'

const rolls = ref<RollListItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const status = ref<string>('')
const keyword = ref('')
const from = ref('')
const to = ref('')
const showAdvanced = ref(false)

const filters = computed(() => [
  { value: '', label: '全部' },
  ...ROLL_STATUSES.map((s) => ({ value: s, label: ROLL_STATUS_LABEL[s] })),
])

async function load() {
  loading.value = true
  error.value = null
  try {
    const params = new URLSearchParams()
    if (status.value) params.set('status', status.value)
    if (keyword.value.trim()) params.set('q', keyword.value.trim())
    // 时间区间按建档时间过滤；补足时分秒，保证「当天」也算进来
    if (from.value) params.set('from', `${from.value}T00:00:00.000Z`)
    if (to.value) params.set('to', `${to.value}T23:59:59.999Z`)
    const res = await api.get<{ items: RollListItem[] }>(`/rolls?${params}`)
    rolls.value = res.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(status, load)
onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <header class="mb-4">
      <h1 class="text-2xl font-semibold">胶卷库</h1>
    </header>

    <div class="mb-3 flex gap-2">
      <input
        v-model="keyword"
        placeholder="输入编号搜索"
        class="code-text min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-amber-500"
        @keyup.enter="load"
      />
      <button class="rounded-xl bg-slate-800 px-4 py-3 text-sm" @click="load">搜索</button>
    </div>

    <button class="mb-3 text-xs text-slate-500" @click="showAdvanced = !showAdvanced">
      {{ showAdvanced ? '收起筛选' : '时间区间筛选' }}
    </button>
    <div v-if="showAdvanced" class="mb-4 flex items-center gap-2">
      <input
        v-model="from"
        type="date"
        class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
        @change="load"
      />
      <span class="text-xs text-slate-600">至</span>
      <input
        v-model="to"
        type="date"
        class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
        @change="load"
      />
      <button
        v-if="from || to"
        class="shrink-0 text-xs text-slate-500"
        @click="from = ''; to = ''; load()"
      >
        清除
      </button>
    </div>

    <div class="mb-4 flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="f in filters"
        :key="f.value"
        class="shrink-0 rounded-full px-3 py-1.5 text-xs"
        :class="status === f.value ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'"
        @click="status = f.value"
      >
        {{ f.label }}
      </button>
    </div>

    <div v-if="loading" class="py-16 text-center text-slate-500">加载中…</div>
    <p v-else-if="error" class="rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {{ error }}
    </p>
    <p v-else-if="rolls.length === 0" class="py-16 text-center text-slate-500">没有符合条件的胶卷</p>
    <div v-else class="space-y-3">
      <RollCard v-for="roll in rolls" :key="roll.id" :roll="roll" @updated="load" />
    </div>
  </div>
</template>
