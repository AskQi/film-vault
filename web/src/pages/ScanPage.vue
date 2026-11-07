<script setup lang="ts">
/** 扫码：摄像头 + 手输兜底。HTTPS 或 localhost 下才能调摄像头。 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api.js'
import type { ScanResult } from '../lib/types.js'

const router = useRouter()
const manual = ref('')
const result = ref<ScanResult | null>(null)
const error = ref<string | null>(null)
const scanning = ref(false)
const cameraError = ref<string | null>(null)

let stream: MediaStream | null = null
let rafId: number | null = null
let detector: { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> } | null = null

async function startCamera(video: HTMLVideoElement) {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    video.srcObject = stream
    await video.play()
    scanning.value = true

    // 优先用原生 BarcodeDetector；iOS Safari 走 WASM polyfill（M2 接入）
    const Ctor = (window as unknown as { BarcodeDetector?: new (opts: unknown) => typeof detector }).BarcodeDetector
    if (!Ctor) {
      cameraError.value = '当前浏览器不支持条码识别，请手动输入编号'
      return
    }
    detector = new Ctor({ formats: ['code_128', 'ean_13', 'ean_8', 'upc_a', 'qr_code'] })

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const tick = async () => {
      if (!scanning.value) return
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        try {
          const codes = await detector!.detect(canvas)
          const first = codes[0]
          if (first) {
            manual.value = first.rawValue
            await submit()
            return
          }
        } catch {
          // 单帧识别失败是常态，忽略
        }
      }
      rafId = requestAnimationFrame(() => void tick())
    }
    void tick()
  } catch (e) {
    cameraError.value = `无法打开摄像头：${(e as Error).message}。可直接手动输入。`
  }
}

function stopCamera() {
  scanning.value = false
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

async function submit() {
  const raw = manual.value.trim()
  if (!raw) return
  error.value = null
  try {
    result.value = await api.post<ScanResult>('/scan', { raw })
  } catch (e) {
    error.value = (e as Error).message
    result.value = null
  }
}

function goCreate() {
  if (!result.value) return
  void router.push({
    name: 'new-roll',
    query: { code: result.value.code, prefix: result.value.prefix, serial: result.value.serialTxt },
  })
}

onMounted(() => {
  const video = document.getElementById('scan-video') as HTMLVideoElement | null
  if (video) void startCamera(video)
})

onBeforeUnmount(stopCamera)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 pt-6">
    <h1 class="mb-4 text-2xl font-semibold">扫码</h1>

    <div class="relative mb-4 aspect-[4/3] overflow-hidden rounded-2xl border border-slate-800 bg-black">
      <video id="scan-video" class="h-full w-full object-cover" muted playsinline />
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="h-1/3 w-4/5 rounded-lg border-2 border-amber-500/70" />
      </div>
    </div>

    <p v-if="cameraError" class="mb-4 rounded-xl border border-amber-900/60 bg-amber-950/20 p-3 text-sm text-amber-300">
      {{ cameraError }}
    </p>

    <div class="mb-4 flex gap-2">
      <input
        v-model="manual"
        placeholder="手动输入编号或条码"
        class="code-text min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 outline-none focus:border-amber-500"
        @keyup.enter="submit"
      />
      <button class="rounded-xl bg-amber-500 px-5 py-3 font-medium text-slate-950" @click="submit">
        识别
      </button>
    </div>

    <p v-if="error" class="mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
      {{ error }}
    </p>

    <div v-if="result" class="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div v-if="result.kind === 'roll'">
        <div class="code-text text-2xl text-amber-400">{{ result.code }}</div>
        <p class="mt-1 text-sm text-slate-400">{{ result.stock?.name }}</p>
        <RouterLink
          v-if="result.existing"
          :to="`/rolls/${result.existing.id}`"
          class="mt-4 block rounded-xl bg-slate-800 py-3 text-center text-sm"
        >
          已建档，查看详情
        </RouterLink>
        <button v-else class="mt-4 w-full rounded-xl bg-amber-500 py-3 font-medium text-slate-950" @click="goCreate">
          建档这一卷
        </button>
      </div>

      <div v-else-if="result.kind === 'unknown_prefix'">
        <div class="code-text text-2xl text-amber-400">{{ result.code }}</div>
        <p class="mt-2 text-sm text-amber-300">前缀 {{ result.prefix }} 尚未入库</p>
        <p class="mt-1 text-xs text-slate-500">{{ result.hint }}</p>
      </div>

      <div v-else-if="result.kind === 'barcode'">
        <div class="code-text text-xl">{{ result.known ? result.stock?.name ?? '' : '未知条码' }}</div>
        <p class="mt-1 text-xs text-slate-500">条码 {{ manual }}</p>
      </div>
    </div>
  </div>
</template>
