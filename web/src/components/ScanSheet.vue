<script setup lang="ts">
/**
 * 扫码取景组件：作为「编码输入」的辅助手段使用。
 *
 * 不做独立页面——由调用方在输入框旁边放一个按钮，点开后弹层取景，
 * 识别到内容就 emit 出去，由调用方决定回填输入框还是直接分流。
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { canUseCamera, detectorKind, getDetector } from '../lib/scanner.js'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; scanned: [raw: string] }>()

const videoEl = ref<HTMLVideoElement | null>(null)
const message = ref<string | null>(null)
const busy = ref(false)

let stream: MediaStream | null = null
let rafId: number | null = null
let stopped = false

function stop() {
  stopped = true
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
}

async function start() {
  stopped = false
  message.value = null
  busy.value = true

  const env = canUseCamera()
  if (!env.ok) {
    message.value = env.reason ?? '无法调用摄像头'
    busy.value = false
    return
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })

    const video = videoEl.value
    if (!video) return
    video.srcObject = stream
    await video.play()

    let detector: ReturnType<typeof getDetector>
    try {
      detector = getDetector()
    } catch (e) {
      message.value = `条码识别初始化失败：${(e as Error).message}`
      return
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const tick = async () => {
      if (stopped) return
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        try {
          const codes = await detector.detect(canvas)
          const first = codes[0]
          if (first && !stopped) {
            stop()
            busy.value = false
            emit('scanned', first.rawValue)
            return
          }
        } catch {
          // 单帧识别失败是常态，继续下一帧
        }
      }
      rafId = requestAnimationFrame(() => void tick())
    }
    void tick()
  } catch (e) {
    const err = e as Error
    message.value =
      err.name === 'NotAllowedError'
        ? '摄像头权限被拒绝。可在浏览器设置里允许后重试，或直接手动输入。'
        : `无法打开摄像头：${err.message}`
  } finally {
    busy.value = false
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) void start()
    else stop()
  },
)

onBeforeUnmount(stop)

function close() {
  stop()
  emit('close')
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex flex-col bg-black">
    <div class="flex items-center justify-between px-4 py-3">
      <span class="text-sm text-slate-300">
        对准条码
        <span class="ml-1 text-xs text-slate-500">
          （{{ detectorKind() === 'native' ? '原生识别' : 'WASM 识别' }}）
        </span>
      </span>
      <button class="rounded-lg bg-slate-800 px-4 py-2 text-sm" @click="close">关闭</button>
    </div>

    <div class="relative flex-1">
      <video ref="videoEl" class="h-full w-full object-cover" muted playsinline />
      <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div class="h-24 w-4/5 rounded-lg border-2 border-amber-500/80" />
      </div>
    </div>

    <div class="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
      <p v-if="message" class="rounded-xl bg-slate-900 p-3 text-sm text-amber-300">{{ message }}</p>
      <p v-else class="text-center text-xs text-slate-500">
        {{ busy ? '正在启动摄像头…' : '把条码放进框内，识别成功后自动回填' }}
      </p>
    </div>
  </div>
</template>
