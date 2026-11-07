/**
 * 扫码策略：优先用浏览器原生 BarcodeDetector（安卓 Chrome 性能最好），
 * 不支持时回退到 barcode-detector 的 WASM polyfill（iOS Safari / 鸿蒙）。
 *
 * 两者接口一致，都是 `detect(canvas) -> Promise<result[]>`。
 */
import { BarcodeDetector as WasmBarcodeDetector, type DetectedBarcode } from 'barcode-detector'

/** 我们要认的条码类型：自己的标签是 Code 128，包装盒是 EAN/UPC，二维码留作备选 */
export const SCAN_FORMATS = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'qr_code'] as const

type DetectorLike = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }

let cached: DetectorLike | null = null

export function getDetector(): DetectorLike {
  if (cached) return cached

  const Native = (
    globalThis as unknown as {
      BarcodeDetector?: new (opts: { formats: string[] }) => DetectorLike
    }
  ).BarcodeDetector

  cached = Native
    ? new Native({ formats: [...SCAN_FORMATS] })
    : // WASM polyfill：接口与原生一致，但要显式传 formats
      (new WasmBarcodeDetector({ formats: [...SCAN_FORMATS] }) as unknown as DetectorLike)

  return cached
}

/** 当前走的是原生还是 WASM，用于在界面上给个提示 */
export function detectorKind(): 'native' | 'wasm' {
  return (globalThis as unknown as { BarcodeDetector?: unknown }).BarcodeDetector ? 'native' : 'wasm'
}

/**
 * 判断当前环境能不能开摄像头。
 * 浏览器要求安全上下文：https 或 localhost，否则 getUserMedia 直接不可用。
 */
export function canUseCamera(): { ok: boolean; reason?: string } {
  if (!globalThis.isSecureContext) {
    return { ok: false, reason: '浏览器要求在 HTTPS 或 localhost 下才能调用摄像头' }
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: '当前浏览器不支持摄像头调用' }
  }
  return { ok: true }
}
