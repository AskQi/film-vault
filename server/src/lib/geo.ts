/**
 * 坐标与逆地理编码。
 *
 * 浏览器 Geolocation 返回 WGS-84；高德使用 GCJ-02（国测局加偏坐标）。
 * 数据库存 WGS-84 原始值，只在调用高德前转换——这样将来换地图服务不用迁移数据。
 */
import { config } from '../config.js'

const A = 6378245.0
const EE = 0.00669342162296594323

/** 中国大陆范围外不加偏（粗略矩形，足够个人使用） */
function outOfChina(lat: number, lng: number): boolean {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(x: number, y: number): number {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3
  return r
}

function transformLng(x: number, y: number): number {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3
  return r
}

/** WGS-84 → GCJ-02 */
export function wgs84ToGcj02(lat: number, lng: number): { lat: number; lng: number } {
  if (outOfChina(lat, lng)) return { lat, lng }
  let dLat = transformLat(lng - 105, lat - 35)
  let dLng = transformLng(lng - 105, lat - 35)
  const radLat = (lat / 180) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * Math.PI)
  dLng = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * Math.PI)
  return { lat: lat + dLat, lng: lng + dLng }
}

export interface AddressCandidate {
  /** 供用户选择的完整地址 */
  label: string
  /** 简短名称：POI 名或街道 */
  name: string
  /** 距离定位点（米），POI 才有 */
  distance: number | null
}

export class GeoError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

interface AmapRegeo {
  status: string
  info: string
  regeocode?: {
    formatted_address: string | string[]
    addressComponent?: {
      province?: string | string[]
      city?: string | string[]
      district?: string | string[]
      township?: string | string[]
      streetNumber?: { street?: string | string[]; number?: string | string[] }
    }
    pois?: { name: string; address: string | string[]; distance: string }[]
  }
}

/** 高德在字段缺失时返回空数组而不是空串，统一成字符串 */
function str(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

/**
 * 逆地理编码：返回一个主地址 + 附近 POI 候选。
 * 只在服务端调用，key 不下发给浏览器。
 */
export async function reverseGeocode(lat: number, lng: number): Promise<AddressCandidate[]> {
  if (!config.amapKey) {
    throw new GeoError(503, '服务端未配置 AMAP_KEY，无法解析地址。可直接手动填写。')
  }

  const gcj = wgs84ToGcj02(lat, lng)
  const url = new URL('https://restapi.amap.com/v3/geocode/regeo')
  url.searchParams.set('key', config.amapKey)
  // 高德要求 经度,纬度，最多 6 位小数
  url.searchParams.set('location', `${gcj.lng.toFixed(6)},${gcj.lat.toFixed(6)}`)
  url.searchParams.set('extensions', 'all')
  url.searchParams.set('radius', '300')
  url.searchParams.set('output', 'json')

  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  } catch {
    throw new GeoError(502, '地址服务连接超时，可手动填写')
  }
  if (!res.ok) throw new GeoError(502, `地址服务返回 ${res.status}`)

  const data = (await res.json()) as AmapRegeo
  if (data.status !== '1' || !data.regeocode) {
    throw new GeoError(502, `地址解析失败：${data.info}`)
  }

  const r = data.regeocode
  const formatted = str(r.formatted_address)
  const out: AddressCandidate[] = []

  if (formatted) {
    const street = str(r.addressComponent?.streetNumber?.street)
    const number = str(r.addressComponent?.streetNumber?.number)
    out.push({
      label: formatted,
      name: street ? `${street}${number}` : str(r.addressComponent?.township) || formatted,
      distance: null,
    })
  }

  // 附近 POI：高德返回的顺序不保证按距离，这里自己排序后取前 8 个。
  // 地址前缀用 省+市+区（直辖市 city 为空数组，省即市，去重即可）
  const c = r.addressComponent
  const region = [...new Set([str(c?.province), str(c?.city), str(c?.district)].filter(Boolean))].join('')
  const seen = new Set(out.map((x) => x.label))
  const pois = [...(r.pois ?? [])].sort((a, b) => (Number(a.distance) || 0) - (Number(b.distance) || 0))
  for (const p of pois.slice(0, 8)) {
    if (!p.name) continue
    const label = `${region}${p.name}`
    if (seen.has(label)) continue
    seen.add(label)
    out.push({ label, name: p.name, distance: Number(p.distance) || null })
  }

  return out
}
