/** 与后端响应对应的前端类型 */

export interface RollListItem {
  id: number
  code: string
  prefix: string
  serialTxt: string
  seq: number
  framesTotal: number
  status: string
  stockId: number
  stockName: string
  format: string
  iso: number
  loadedAt: string | null
  finishedAt: string | null
  updatedAt: string
  reachedFrame: number
}

export interface Stock {
  id: number
  brandCode: string
  seriesCode: string
  isoCode: string
  iso: number
  formatCode: string
  format: string
  name: string
  nominalFrames: number | null
  defaultFrames: number | null
  process: string | null
  colorType: string | null
  status: string
  description: string | null
  nickname: string | null
  usualEi: number | null
  pushPullPref: string | null
  myRating: number | null
  myNotes: string | null
  refPrice: number | null
  prefix?: string | null
  rollCount?: number
  activeCount?: number
}

export interface StockPrefix {
  prefix: string
  stockId: number
  isPrimary: number
  seqMax: number
  note: string | null
}

export interface FrameSlot {
  letter: string
  stock: { stockId: number; name: string; iso: number; formatCode: string } | null
}

export interface PrefixMapResponse {
  brands: { brandCode: string; brandName: string; letters: FrameSlot[] }[]
  pending: { prefix: string; rawCode: string | null; seenCount: number }[]
}

export interface ProgressEntry {
  id: number
  rollId: number
  event: 'progress' | 'load'
  lat: number | null
  lng: number | null
  address: string | null
  reachedFrame: number
  happenedAt: string
  cameraId: number | null
  lensId: number | null
  note: string | null
  createdAt: string
}

export interface RollDetail extends RollListItem {
  stock: Stock
  remaining: number
  progress: ProgressEntry[]
  notes: string | null
  ei: number | null
  pushPull: number
  cameraId: number | null
  lensId: number | null
}

export interface ScanResult {
  kind: 'roll' | 'unknown_prefix' | 'barcode' | 'invalid'
  code?: string
  prefix?: string
  seq?: number
  serialTxt?: string
  stock?: { id: number; name: string } | null
  existing?: { id: number; status: string; framesTotal: number } | null
  known?: boolean
  hint?: string
  error?: string
}

export interface PendingStock {
  id: number
  prefix: string
  rawCode: string | null
  barcode: string | null
  seenCount: number
  createdAt: string
}

export interface ImportLine {
  line: number
  raw: string
  ok: boolean
  error?: string
  draft?: {
    brandCode: string
    brandName: string
    seriesCode: string
    seriesName: string
    iso: number
    formatCode: string
    format: string
    name: string
    nominalFrames: number | null
    process: string | null
    colorType: string | null
  }
  suggestedPrefix?: string
  prefixNote?: string
  candidates?: string[]
}

export interface ImportPreview {
  committed: boolean
  total: number
  okCount: number
  lines: ImportLine[]
  inserted?: { id: number; prefix: string; name: string }[]
}

export interface FrameNote {
  id: number
  rollId: number
  frameNo: number
  aperture: string | null
  shutter: string | null
  ei: number | null
  evOffset: string | null
  lensId: number | null
  location: string | null
  note: string | null
  photoPath: string | null
  happenedAt: string | null
  createdAt: string
}

export interface Development {
  id: number
  rollId: number
  method: 'self' | 'lab'
  process: string | null
  developer: string | null
  dilution: string | null
  tempC: number | null
  durationSec: number | null
  agitation: string | null
  pushPull: number | null
  labName: string | null
  devAt: string | null
  rating: number | null
  issues: string | null
  notes: string | null
  createdAt: string
}

/** 时间线条目：进度快照与单张注解按时间交错 */
export type TimelineEntry =
  | { kind: 'progress'; at: string; data: ProgressEntry }
  | { kind: 'frame'; at: string; data: FrameNote }
  | { kind: 'development'; at: string; data: Development }
