<script setup lang="ts">
/**
 * 新建型号：前缀由系统拼装，不让人手输 4 位。
 * 品牌 + 系列字母 + ISO + 画幅 → 实时显示拼出的前缀与冲突状态。
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api.js'
import { BRANDS, FORMATS, isoToCode } from '@film-vault/shared/client'
import type { PrefixMapResponse } from '../lib/types.js'

const router = useRouter()

const brandCode = ref('K')
const seriesCode = ref('')
const iso = ref<number>(200)
const formatCode = ref('T')
const name = ref('')
const nominalFrames = ref<number | null>(null)
const process = ref('')
const colorType = ref<'' | 'color_negative' | 'color_positive' | 'bw'>('')
const description = ref('')

const submitting = ref(false)
const error = ref<string | null>(null)
const taken = ref<Set<string>>(new Set())

const isoOptions = [
  25, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 800, 1000, 1600, 3200,
]

/** 实时拼出的前缀 */
const prefix = computed(() => {
  const isoCode = isoToCode(iso.value)
  if (!isoCode || !seriesCode.value || seriesCode.value.length !== 1) return null
  return `${brandCode.value}${seriesCode.value.toUpperCase()}${isoCode}${formatCode.value}`
})

const isTaken = computed(() => (prefix.value ? taken.value.has(prefix.value) : false))

/** 该品牌在当前 ISO + 画幅下还有哪些字母可用 */
const freeLetters = computed(() => {
  const isoCode = isoToCode(iso.value)
  if (!isoCode) return []
  return Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).filter(
    (l) => !taken.value.has(`${brandCode.value}${l}${isoCode}${formatCode.value}`),
  )
})

async function loadPrefixes() {
  const map = await api.get<PrefixMapResponse>('/stocks/prefix-map')
  const set = new Set<string>()
  for (const b of map.brands) {
    for (const slot of b.letters) {
      if (slot.stock) {
        // prefix-map 只返回了系列字母，这里用 stockId 反推不划算，
        // 直接以「字母 + 当前品牌/ISO/画幅」组合判断即可
        set.add(`${b.brandCode}${slot.letter}`)
      }
    }
  }
  // 注意：prefix-map 不含 ISO 与画幅，占位表只能判断「品牌+字母」是否出现过，
  // 真正的前缀占用以服务端 409 为准。这里仅用于给出视觉提示。
  taken.value = set
}

function letterTaken(letter: string): boolean {
  const isoCode = isoToCode(iso.value)
  if (!isoCode) return false
  return taken.value.has(`${brandCode.value}${letter}`)
}

async function submit() {
  if (!prefix.value) return
  if (!name.value.trim()) {
    error.value = '请填写型号名称'
    return
  }
  submitting.value = true
  error.value = null
  try {
    const created = await api.post<{ id: number }>('/stocks', {
      brandCode: brandCode.value,
      seriesCode: seriesCode.value.toUpperCase(),
      iso: iso.value,
      formatCode: formatCode.value,
      name: name.value.trim(),
      nominalFrames: nominalFrames.value,
      defaultFrames: nominalFrames.value,
      process: process.value || null,
      colorType: colorType.value || null,
      description: description.value || null,
    })
    await router.push(`/stocks/${created.id}`)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void loadPrefixes()
})
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <RouterLink to="/stocks" class="mb-4 inline-block text-sm text-slate-400">← 型号库</RouterLink>
    <h1 class="mb-6 text-2xl font-semibold">新建型号</h1>

    <section class="mb-5 space-y-4">
      <div>
        <label class="mb-1.5 block text-xs text-slate-400">品牌</label>
        <select
          v-model="brandCode"
          class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
        >
          <option v-for="b in BRANDS" :key="b.code" :value="b.code">
            {{ b.code }} · {{ b.name }}
          </option>
        </select>
      </div>

      <div>
        <label class="mb-1.5 block text-xs text-slate-400">
          系列字母（品牌内唯一，空闲：{{ freeLetters.slice(0, 8).join(' ') || '无' }}）
        </label>
        <div class="mb-2 flex flex-wrap gap-1.5">
          <button
            v-for="letter in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')"
            :key="letter"
            class="code-text h-9 w-9 rounded-lg text-sm"
            :class="
              seriesCode.toUpperCase() === letter
                ? 'bg-amber-500 text-slate-950'
                : letterTaken(letter)
                  ? 'bg-slate-800/40 text-slate-700'
                  : 'bg-slate-800 text-slate-300'
            "
            @click="seriesCode = letter"
          >
            {{ letter }}
          </button>
        </div>
      </div>

      <div class="flex gap-3">
        <div class="flex-1">
          <label class="mb-1.5 block text-xs text-slate-400">ISO</label>
          <select
            v-model.number="iso"
            class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
          >
            <option v-for="v in isoOptions" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>
        <div class="flex-1">
          <label class="mb-1.5 block text-xs text-slate-400">画幅</label>
          <select
            v-model="formatCode"
            class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
          >
            <option v-for="f in FORMATS" :key="f.code" :value="f.code">
              {{ f.code }} · {{ f.name }}
            </option>
          </select>
        </div>
      </div>

      <!-- 前缀预览 -->
      <div class="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-center">
        <div class="text-xs text-slate-400">前缀（前 4 位 = 型号唯一键）</div>
        <div class="code-text mt-1 text-3xl" :class="prefix ? 'text-amber-400' : 'text-slate-700'">
          {{ prefix ?? '————' }}
        </div>
      </div>

      <div>
        <label class="mb-1.5 block text-xs text-slate-400">型号名称</label>
        <input
          v-model="name"
          placeholder="Kodak Gold 200 135"
          class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
        />
      </div>

      <div class="flex gap-3">
        <div class="flex-1">
          <label class="mb-1.5 block text-xs text-slate-400">标称张数（可空）</label>
          <input
            v-model.number="nominalFrames"
            type="number"
            min="1"
            max="200"
            class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
          />
        </div>
        <div class="flex-1">
          <label class="mb-1.5 block text-xs text-slate-400">工艺（可空）</label>
          <input
            v-model="process"
            placeholder="C-41 / E-6 / BW"
            class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
          />
        </div>
      </div>

      <div>
        <label class="mb-1.5 block text-xs text-slate-400">色彩类型（可空）</label>
        <select
          v-model="colorType"
          class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
        >
          <option value="">—</option>
          <option value="color_negative">彩色负片</option>
          <option value="color_positive">彩色反转</option>
          <option value="bw">黑白</option>
        </select>
      </div>

      <div>
        <label class="mb-1.5 block text-xs text-slate-400">描述（可空）</label>
        <textarea
          v-model="description"
          rows="3"
          class="w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-3 text-sm outline-none focus:border-amber-500"
        />
      </div>
    </section>

    <p v-if="error" class="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {{ error }}
    </p>
    <p v-if="isTaken" class="mb-4 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-300">
      该前缀看起来已被占用，请换一个系列字母（换字母不升位）
    </p>

    <button
      :disabled="submitting || !prefix || !name"
      class="w-full rounded-2xl bg-amber-500 py-4 text-lg font-medium text-slate-950 disabled:opacity-40"
      @click="submit"
    >
      {{ submitting ? '创建中…' : '创建型号' }}
    </button>
    <p class="mt-2 text-center text-xs text-slate-500">
      前缀冲突时服务端会拒绝，改用其他系列字母即可
    </p>
  </div>
</template>
