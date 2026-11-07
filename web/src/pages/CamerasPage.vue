<script setup lang="ts">
/** 机身与镜头库 CRUD */
import { onMounted, ref } from 'vue'
import { api } from '../lib/api.js'

interface Camera {
  id: number
  brand: string
  model: string
  mount: string | null
  notes: string | null
}

interface Lens {
  id: number
  brand: string
  model: string
  mount: string | null
  focalMm: number | null
  maxAperture: number | null
  notes: string | null
}

const cameras = ref<Camera[]>([])
const lenses = ref<Lens[]>([])
const error = ref<string | null>(null)
const loading = ref(true)

const tab = ref<'camera' | 'lens'>('camera')

const cameraDraft = ref({ brand: '', model: '', mount: '', notes: '' })
const lensDraft = ref({ brand: '', model: '', mount: '', focalMm: '' as number | '', maxAperture: '' as number | '', notes: '' })

async function load() {
  loading.value = true
  error.value = null
  try {
    const [c, l] = await Promise.all([
      api.get<{ items: Camera[] }>('/cameras'),
      api.get<{ items: Lens[] }>('/lenses'),
    ])
    cameras.value = c.items
    lenses.value = l.items
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function addCamera() {
  if (!cameraDraft.value.brand.trim() || !cameraDraft.value.model.trim()) return
  try {
    await api.post('/cameras', {
      brand: cameraDraft.value.brand.trim(),
      model: cameraDraft.value.model.trim(),
      mount: cameraDraft.value.mount.trim() || null,
      notes: cameraDraft.value.notes.trim() || null,
    })
    cameraDraft.value = { brand: '', model: '', mount: '', notes: '' }
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function addLens() {
  if (!lensDraft.value.brand.trim() || !lensDraft.value.model.trim()) return
  try {
    await api.post('/lenses', {
      brand: lensDraft.value.brand.trim(),
      model: lensDraft.value.model.trim(),
      mount: lensDraft.value.mount.trim() || null,
      focalMm: lensDraft.value.focalMm === '' ? null : Number(lensDraft.value.focalMm),
      maxAperture: lensDraft.value.maxAperture === '' ? null : Number(lensDraft.value.maxAperture),
      notes: lensDraft.value.notes.trim() || null,
    })
    lensDraft.value = { brand: '', model: '', mount: '', focalMm: '', maxAperture: '', notes: '' }
    await load()
  } catch (e) {
    error.value = (e as Error).message
  }
}

async function removeCamera(id: number) {
  await api.del(`/cameras/${id}`)
  await load()
}

async function removeLens(id: number) {
  await api.del(`/lenses/${id}`)
  await load()
}

onMounted(load)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <h1 class="mb-4 text-2xl font-semibold">机身与镜头</h1>

    <div class="mb-4 flex rounded-xl bg-slate-900 p-1">
      <button
        class="flex-1 rounded-lg py-2 text-sm"
        :class="tab === 'camera' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
        @click="tab = 'camera'"
      >
        机身（{{ cameras.length }}）
      </button>
      <button
        class="flex-1 rounded-lg py-2 text-sm"
        :class="tab === 'lens' ? 'bg-slate-800 text-slate-100' : 'text-slate-400'"
        @click="tab = 'lens'"
      >
        镜头（{{ lenses.length }}）
      </button>
    </div>

    <p v-if="error" class="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {{ error }}
    </p>

    <div v-if="loading" class="py-16 text-center text-slate-500">加载中…</div>

    <!-- 机身 -->
    <template v-else-if="tab === 'camera'">
      <div class="mb-4 space-y-2">
        <div
          v-for="c in cameras"
          :key="c.id"
          class="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
        >
          <div>
            <div class="text-sm">{{ c.brand }} {{ c.model }}</div>
            <div v-if="c.mount" class="mt-0.5 text-xs text-slate-500">{{ c.mount }} 卡口</div>
          </div>
          <button class="text-xs text-slate-600 hover:text-red-400" @click="removeCamera(c.id)">删除</button>
        </div>
      </div>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 class="mb-3 text-sm font-medium text-slate-400">新增机身</h2>
        <div class="space-y-2">
          <div class="flex gap-2">
            <input
              v-model="cameraDraft.brand"
              placeholder="品牌"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
            <input
              v-model="cameraDraft.model"
              placeholder="型号"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <input
            v-model="cameraDraft.mount"
            placeholder="卡口（如 EF）"
            class="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
          />
          <button class="w-full rounded-xl bg-slate-800 py-2.5 text-sm" @click="addCamera">添加</button>
        </div>
      </section>
    </template>

    <!-- 镜头 -->
    <template v-else>
      <div class="mb-4 space-y-2">
        <div
          v-for="l in lenses"
          :key="l.id"
          class="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
        >
          <div>
            <div class="text-sm">{{ l.brand }} {{ l.model }}</div>
            <div class="mt-0.5 text-xs text-slate-500">
              <span v-if="l.focalMm">{{ l.focalMm }}mm</span>
              <span v-if="l.maxAperture" class="ml-1">F{{ l.maxAperture }}</span>
              <span v-if="l.mount" class="ml-1">· {{ l.mount }}</span>
            </div>
          </div>
          <button class="text-xs text-slate-600 hover:text-red-400" @click="removeLens(l.id)">删除</button>
        </div>
      </div>

      <section class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 class="mb-3 text-sm font-medium text-slate-400">新增镜头</h2>
        <div class="space-y-2">
          <div class="flex gap-2">
            <input
              v-model="lensDraft.brand"
              placeholder="品牌"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
            <input
              v-model="lensDraft.model"
              placeholder="型号"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <div class="flex gap-2">
            <input
              v-model.number="lensDraft.focalMm"
              type="number"
              placeholder="焦段 mm"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
            <input
              v-model.number="lensDraft.maxAperture"
              type="number"
              step="0.1"
              placeholder="最大光圈"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
            <input
              v-model="lensDraft.mount"
              placeholder="卡口"
              class="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-amber-500"
            />
          </div>
          <button class="w-full rounded-xl bg-slate-800 py-2.5 text-sm" @click="addLens">添加</button>
        </div>
      </section>
    </template>
  </div>
</template>
