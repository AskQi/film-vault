<script setup lang="ts">
/** 标签打印：选模板 → 预览 → 打印 */
import { onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../lib/api.js'

interface LabelData {
  id: number
  code: string
  name: string
  svg: string
}

interface LabelResponse {
  template: { key: string; name: string; widthMm: number; heightMm: number; perRow: number }
  labels: LabelData[]
}

const route = useRoute()
const data = ref<LabelResponse | null>(null)
const error = ref<string | null>(null)
const loading = ref(true)
const templateKey = ref('thermal-40x12')

const templates = [
  { key: 'thermal-40x12', label: '热敏 40×12mm' },
  { key: 'thermal-50x15', label: '热敏 50×15mm' },
  { key: 'a4-3x8', label: 'A4 不干胶 3×8' },
]

const rollIds = computed(() => (typeof route.query.rollIds === 'string' ? route.query.rollIds : ''))

async function load() {
  if (!rollIds.value) {
    error.value = '没有指定要打印的胶卷'
    loading.value = false
    return
  }
  loading.value = true
  error.value = null
  try {
    data.value = await api.get<LabelResponse>(
      `?rollIds=${rollIds.value}&template=${templateKey.value}&scale=2`,
    )
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function switchTemplate(key: string) {
  templateKey.value = key
  await load()
}

function printLabels() {
  window.print()
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <div class="no-print">
      <h1 class="mb-4 text-2xl font-semibold">打印标签</h1>

      <div class="mb-4 flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="t in templates"
          :key="t.key"
          class="shrink-0 rounded-full px-3 py-1.5 text-xs"
          :class="templateKey === t.key ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'"
          @click="switchTemplate(t.key)"
        >
          {{ t.label }}
        </button>
      </div>

      <p v-if="error" class="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
        {{ error }}
      </p>
    </div>

    <div v-if="loading" class="no-print py-16 text-center text-slate-500">生成中…</div>

    <template v-else-if="data">
      <div :class="data.template.perRow > 1 ? 'grid grid-cols-3 gap-2' : 'space-y-2'">
        <div
          v-for="label in data.labels"
          :key="label.id"
          class="flex flex-col items-center justify-center bg-white p-2"
          :style="{
            width: `${data.template.widthMm}mm`,
            height: `${data.template.heightMm}mm`,
            breakInside: 'avoid',
          }"
          v-html="label.svg"
        />
      </div>

      <div class="no-print mt-6">
        <button
          class="w-full rounded-2xl bg-amber-500 py-4 text-lg font-medium text-slate-950"
          @click="printLabels"
        >
          打印
        </button>
        <p class="mt-2 text-center text-xs text-slate-500">
          共 {{ data.labels.length }} 张 · 打印前请在系统对话框里关闭页眉页脚与边距
        </p>
      </div>
    </template>
  </div>
</template>
