/**
 * 码表常量 —— 前后端共用。
 *
 * 这里的每一项都是编号体系的一部分，改动会直接影响已打印的标签，
 * 因此任何修改都必须同步 docs/01-需求说明.md §5 与单测。
 */

/** 品牌位：1 个大写字母 */
export const BRANDS = [
  { code: 'A', name: 'Agfa' },
  { code: 'B', name: 'Bergger' },
  { code: 'C', name: 'CineStill' },
  { code: 'F', name: 'Fujifilm' },
  { code: 'H', name: 'Harman' },
  { code: 'I', name: 'Ilford' },
  { code: 'K', name: 'Kodak' },
  { code: 'L', name: 'Lomography' },
  { code: 'O', name: 'ORWO' },
  { code: 'Q', name: 'Foma' },
  { code: 'R', name: 'Rollei' },
  { code: 'S', name: 'Silberra' },
  { code: 'V', name: 'Svema' },
  { code: 'W', name: 'Washi' },
  { code: 'Y', name: 'Lucky' },
  { code: 'Z', name: 'Shanghai' },
] as const

export type BrandCode = (typeof BRANDS)[number]['code']

/** 画幅位：1 个大写字母 */
export const FORMATS = [
  { code: 'T', name: '135', sort: 1 },
  { code: 'M', name: '120', sort: 2 },
  { code: 'D', name: '220', sort: 3 },
  { code: 'S', name: '页片', sort: 4 },
  { code: 'P', name: '110', sort: 5 },
  { code: 'X', name: '其他', sort: 6 },
] as const

export type FormatCode = (typeof FORMATS)[number]['code']

export const FORMAT_NAME: Record<string, string> = Object.fromEntries(
  FORMATS.map((f) => [f.code, f.name]),
)

/**
 * 感光度例外码（小写，与主规则大小写区分）。
 * 主规则 v = ISO / 100：1-9 用数字，10-35 用 A-Z 顺延。
 * 这 8 个 ISO 无法整除 100，单独指派小写字母。
 */
export const ISO_EXCEPTIONS = [
  { code: 'a', iso: 25 },
  { code: 'b', iso: 50 },
  { code: 'c', iso: 64 },
  { code: 'd', iso: 160 },
  { code: 'e', iso: 320 },
  { code: 'f', iso: 125 },
  { code: 'g', iso: 80 },
  { code: 'h', iso: 250 },
] as const

/** ISO 值 → 例外码（仅对例外 ISO 有效） */
const ISO_TO_EXCEPTION = new Map<number, string>(
  ISO_EXCEPTIONS.map((e) => [e.iso, e.code]),
)

/** 例外码 → ISO 值 */
const EXCEPTION_TO_ISO = new Map<string, number>(
  ISO_EXCEPTIONS.map((e) => [e.code, e.iso]),
)

/**
 * ISO 值 → 感光度码。
 * 例外 ISO 优先匹配小写码；其余按 v = ISO / 100 换算。
 * 返回 null 表示该 ISO 无法用 1 位表示（例如 ISO 36、ISO 4000）。
 */
export function isoToCode(iso: number): string | null {
  const exception = ISO_TO_EXCEPTION.get(iso)
  if (exception) return exception

  if (iso % 100 !== 0) return null
  const v = iso / 100
  if (v >= 1 && v <= 9) return String(v)
  // v=10 → 'A'，v=35 → 'Z'
  if (v >= 10 && v <= 35) return String.fromCharCode(65 + v - 10)
  return null
}

/**
 * 感光度码 → ISO 值。
 * 注意：这里按位精确判断大小写，不做任何归一化。
 */
export function codeToIso(code: string): number | null {
  const exception = EXCEPTION_TO_ISO.get(code)
  if (exception) return exception

  if (/^[1-9]$/.test(code)) return Number(code) * 100
  if (/^[A-Z]$/.test(code)) {
    const v = code.charCodeAt(0) - 64 + 9 // 'A'→10, 'Z'→35
    if (v >= 10 && v <= 35) return v * 100
  }
  return null
}

/** 序号：固定 3 字符，首位 62 个值，后两位恒为数字 */
export const SERIAL_HEAD_DIGITS = '0123456789'
export const SERIAL_HEAD_UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
export const SERIAL_HEAD_LOWER = 'abcdefghijklmnopqrstuvwxyz'

/** 单前缀容量：62 × 100 − 1（000 保留） */
export const MAX_SEQ = 6199
