/**
 * 浏览器定位。返回 WGS-84 坐标（Geolocation API 的标准坐标系）。
 * 与摄像头一样，需要 HTTPS 或 localhost 才能使用。
 */

export interface Coords {
  lat: number
  lng: number
  /** 精度，米 */
  accuracy: number
}

export function getCurrentPosition(timeoutMs = 10000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!globalThis.isSecureContext) {
      reject(new Error('浏览器要求在 HTTPS 或 localhost 下才能定位'))
      return
    }
    if (!navigator.geolocation) {
      reject(new Error('当前浏览器不支持定位'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }),
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? '定位权限被拒绝，可在浏览器设置里允许，或直接手动填写地址'
            : err.code === err.TIMEOUT
              ? '定位超时，可重试或手动填写'
              : '无法获取位置'
        reject(new Error(message))
      },
      // 拍照现场要的是当下位置，不用缓存太久的结果
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

export interface AddressCandidate {
  label: string
  name: string
  distance: number | null
}

/** 位置字段的值：三项都可空 */
export interface LocationValue {
  lat: number | null
  lng: number | null
  address: string
}
