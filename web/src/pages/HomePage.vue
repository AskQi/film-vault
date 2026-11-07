<script setup lang="ts">
/**
 * 首页「在拍」：顶部快速录入（输入/扫码编号 → 装机或记张数），下方是在拍卷列表。
 */
import { onMounted, ref } from 'vue'
import { api } from '../lib/api.js'
import type { RollListItem } from '../lib/types.js'
import RollCard from '../components/RollCard.vue'
import RecordSheet from '../components/RecordSheet.vue'
import QuickRecord from '../components/QuickRecord.vue'

const rolls = ref<RollListItem[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
/** 当前打开「记一笔」的胶卷 */
const recording = ref<RollListItem | null>(null)

async function load() {
  loading.value = true
  error.value = null
  try {
    const res = await api.get<{ items: RollListItem[] }>('/rolls?status=loaded,partial')
    rolls.value = res.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <header class="mb-6">
      <h1 class="text-2xl font-semibold">在拍</h1>
      <p class="mt-1 text-sm text-slate-400">输入或扫码编号，装机或记录拍到第几张</p>
    </header>

    <QuickRecord class="mb-6" @saved="load" />

    <h2 v-if="!loading && rolls.length" class="mb-3 text-sm font-medium text-slate-400">
      在拍 {{ rolls.length }} 卷
    </h2>

    <div v-if="loading" class="py-16 text-center text-slate-500">加载中…</div>

    <div v-else-if="error" class="rounded-2xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300">
      {{ error }}
      <button class="ml-2 underline" @click="load">重试</button>
    </div>

    <div v-else-if="rolls.length === 0" class="rounded-3xl border border-dashed border-slate-800 p-10 text-center">
      <div class="mb-3 text-4xl">◎</div>
      <p class="text-slate-300">还没有在拍的胶卷</p>
      <p class="mt-1 text-xs text-slate-500">在上面输入编号并「装机」，就会出现在这里</p>
      <RouterLink to="/new" class="mt-4 inline-block text-sm text-amber-500">还没建档？去建档 ›</RouterLink>
    </div>

    <div v-else class="space-y-3">
      <RollCard
        v-for="roll in rolls"
        :key="roll.id"
        :roll="roll"
        @updated="load"
        @record="recording = roll"
      />
    </div>

    <RecordSheet
      :open="recording !== null"
      :roll="recording"
      @close="recording = null"
      @saved="load"
    />
  </div>
</template>
