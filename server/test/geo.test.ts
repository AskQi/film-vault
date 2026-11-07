import { describe, expect, it } from 'vitest'
import { wgs84ToGcj02 } from '../src/lib/geo.js'

describe('WGS-84 → GCJ-02', () => {
  it('国内坐标会加偏，偏移量在几百米量级', () => {
    // 天安门附近
    const r = wgs84ToGcj02(39.9087, 116.3975)
    const dLat = r.lat - 39.9087
    const dLng = r.lng - 116.3975
    // 北京一带的典型偏移：纬度约 +0.0013，经度约 +0.0062
    expect(dLat).toBeGreaterThan(0.0005)
    expect(dLat).toBeLessThan(0.003)
    expect(dLng).toBeGreaterThan(0.004)
    expect(dLng).toBeLessThan(0.008)
  })

  it('国外坐标不加偏', () => {
    expect(wgs84ToGcj02(35.6812, 139.7671)).toEqual({ lat: 35.6812, lng: 139.7671 }) // 东京
    expect(wgs84ToGcj02(48.8584, 2.2945)).toEqual({ lat: 48.8584, lng: 2.2945 }) // 巴黎
  })
})

describe('reverseGeocode 解析高德返回', () => {
  it('主地址 + POI 候选，直辖市不重复「上海市」', async () => {
    const { config } = await import('../src/config.js')
    const { reverseGeocode } = await import('../src/lib/geo.js')
    const original = config.amapKey
    const realFetch = globalThis.fetch
    ;(config as { amapKey?: string }).amapKey = 'test-key'

    let calledUrl = ''
    globalThis.fetch = (async (url: URL) => {
      calledUrl = String(url)
      return new Response(
        JSON.stringify({
          status: '1',
          info: 'OK',
          regeocode: {
            formatted_address: '上海市黄浦区外滩街道中山东一路18号',
            addressComponent: {
              province: '上海市',
              city: [], // 直辖市：高德返回空数组
              district: '黄浦区',
              township: '外滩街道',
              streetNumber: { street: '中山东一路', number: '18号' },
            },
            // 故意乱序：高德实测返回的 POI 并不保证按距离排列
            pois: [
              { name: '和平饭店', address: [], distance: '120' },
              { name: '外滩', address: '中山东一路', distance: '35.2' },
              { name: '', address: [], distance: '5' },
            ],
          },
        }),
      )
    }) as typeof fetch

    try {
      const out = await reverseGeocode(31.2304, 121.4737)
      expect(out[0]).toEqual({ label: '上海市黄浦区外滩街道中山东一路18号', name: '中山东一路18号', distance: null })
      expect(out[1]).toEqual({ label: '上海市黄浦区外滩', name: '外滩', distance: 35.2 })
      expect(out[2]?.label).toBe('上海市黄浦区和平饭店')
      expect(out).toHaveLength(3) // 空名称 POI 被丢弃
      // 发给高德的是 GCJ-02（经度在前），不是原始 WGS-84
      const loc = new URL(calledUrl).searchParams.get('location')!
      const [lng, lat] = loc.split(',').map(Number)
      expect(lng).not.toBeCloseTo(121.4737, 3)
      expect(lat).not.toBeCloseTo(31.2304, 3)
    } finally {
      globalThis.fetch = realFetch
      ;(config as { amapKey?: string }).amapKey = original
    }
  })
})
