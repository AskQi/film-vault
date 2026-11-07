/**
 * 文本批量导入解析。
 *
 * 每行一条型号，例如：
 *   Kodak Portra 400 135 36张 C-41
 *   Fujifilm Velvia 50 120 E-6
 *   柯达 Gold 200 135
 *
 * 解析只做「尽量认出来」，认不出就报错让用户改。给出前缀建议，
 * 由用户确认后才真正入库——绝不猜测后直接写库。
 */
import {
  BRANDS,
  FORMATS,
  FORMAT_NAME,
  isoToCode,
  validatePrefix,
} from '@film-vault/shared'

/** 品牌别名（中文名与常见写法） */
const BRAND_ALIASES: Record<string, string> = {
  柯达: 'K',
  富士: 'F',
  依尔福: 'I',
  爱克发: 'A',
  乐魔: 'L',
  福马: 'Q',
  乐凯: 'Y',
  上海: 'Z',
  fuji: 'F',
  kodak: 'K',
  ilford: 'I',
  cine: 'C',
}

/** 常见 ISO 值。用于把「400」和「36」区分开。 */
const KNOWN_ISO = new Set([
  25, 50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1600, 3200,
])

/** 画幅别名 */
const FORMAT_ALIASES: Record<string, string> = {
  '135': 'T',
  '35mm': 'T',
  '120': 'M',
  '220': 'D',
  '4x5': 'S',
  '8x10': 'S',
  '110': 'P',
  页片: 'S',
  大画幅: 'S',
}

/** 工艺别名与推导出的色彩类型 */
const PROCESS_ALIASES: { pattern: RegExp; process: string; colorType: string }[] = [
  { pattern: /^c-?41$/i, process: 'C-41', colorType: 'color_negative' },
  { pattern: /^e-?6$/i, process: 'E-6', colorType: 'color_positive' },
  { pattern: /^ecn-?2$/i, process: 'ECN-2', colorType: 'color_negative' },
  { pattern: /^(bw|黑白)$/i, process: 'BW', colorType: 'bw' },
  { pattern: /^(反转|彩色反转)$/i, process: '反转', colorType: 'color_positive' },
  { pattern: /^彩负$/i, process: 'C-41', colorType: 'color_negative' },
]

export interface ImportDraft {
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

export interface ParsedLine {
  line: number
  raw: string
  ok: boolean
  error?: string
  draft?: ImportDraft
  /** 建议前缀（尚未校验是否被占用） */
  suggestedPrefix?: string
  /** 前缀说明：冲突时会给出候选 */
  prefixNote?: string
  /** 与前缀冲突有关的候选字母 */
  candidates?: string[]
}

function matchBrand(text: string): { code: string; name: string; rest: string } | null {
  const lower = text.toLowerCase()

  // 先按完整品牌名匹配（长的优先，避免 'Foma' 被 'Fo' 之类截断）
  const byName = [...BRANDS].sort((a, b) => b.name.length - a.name.length)
  for (const b of byName) {
    if (lower.startsWith(b.name.toLowerCase())) {
      return { code: b.code, name: b.name, rest: text.slice(b.name.length).trim() }
    }
  }

  // 再按别名匹配（中文名等）
  const aliasKeys = Object.keys(BRAND_ALIASES).sort((a, b) => b.length - a.length)
  for (const key of aliasKeys) {
    if (lower.startsWith(key.toLowerCase())) {
      const code = BRAND_ALIASES[key]!
      const brand = BRANDS.find((b) => b.code === code)
      return { code, name: brand?.name ?? code, rest: text.slice(key.length).trim() }
    }
  }

  return null
}

/**
 * 解析一行文本。不查库，前缀占用由调用方判断。
 */
export function parseImportLine(raw: string, lineNo: number): ParsedLine {
  const text = raw.trim()
  if (!text) {
    return { line: lineNo, raw, ok: false, error: '空行' }
  }

  const brand = matchBrand(text)
  if (!brand) {
    return {
      line: lineNo,
      raw,
      ok: false,
      error: '认不出品牌。请以品牌名开头，如 Kodak / Fujifilm / Ilford',
    }
  }

  const tokens = brand.rest.split(/\s+/).filter(Boolean)

  let iso: number | null = null
  let formatCode: string | null = null
  let frames: number | null = null
  let process: string | null = null
  let colorType: string | null = null
  const seriesParts: string[] = []

  for (const token of tokens) {
    const t = token.replace(/[，,、]/g, '')

    if (!iso && /^\d+$/.test(t) && KNOWN_ISO.has(Number(t))) {
      iso = Number(t)
      continue
    }

    const fmt = FORMAT_ALIASES[t.toLowerCase()]
    if (!formatCode && fmt) {
      formatCode = fmt
      continue
    }

    const framesMatch = /^(\d+)\s*张?$/.exec(t)
    if (frames === null && framesMatch && !KNOWN_ISO.has(Number(framesMatch[1]))) {
      frames = Number(framesMatch[1])
      continue
    }

    if (!process) {
      const hit = PROCESS_ALIASES.find((p) => p.pattern.test(t))
      if (hit) {
        process = hit.process
        colorType = hit.colorType
        continue
      }
    }

    seriesParts.push(token)
  }

  // 「36张」被上面的数字分支吃掉时，token 已含「张」字，这里无需再处理
  if (!iso) {
    return { line: lineNo, raw, ok: false, error: '认不出 ISO。请写成 100 / 200 / 400 / 800 等' }
  }
  if (!formatCode) {
    return { line: lineNo, raw, ok: false, error: '认不出画幅。请写 135 / 120 / 220 / 4x5 / 110' }
  }

  const seriesName = seriesParts.join(' ').trim()
  if (!seriesName) {
    return { line: lineNo, raw, ok: false, error: '认不出系列名' }
  }

  const seriesCode = seriesName[0]!.toUpperCase()
  if (!/^[A-Z]$/.test(seriesCode)) {
    return {
      line: lineNo,
      raw,
      ok: false,
      error: `系列名首字符不能用作系列位：${seriesName[0]}`,
    }
  }

  const isoCode = isoToCode(iso)
  if (!isoCode) {
    return {
      line: lineNo,
      raw,
      ok: false,
      error: `ISO ${iso} 无法用单个字符表示（只支持整百或例外值 25/50/64/80/125/160/250/320）`,
    }
  }

  const suggestedPrefix = `${brand.code}${seriesCode}${isoCode}${formatCode}`
  const check = validatePrefix(suggestedPrefix)
  if (!check.ok) {
    return { line: lineNo, raw, ok: false, error: check.reason }
  }

  const format = FORMAT_NAME[formatCode] ?? formatCode
  const name =
    formatCode === 'T'
      ? `${brand.name} ${seriesName} ${iso}`
      : `${brand.name} ${seriesName} ${iso} ${format}`

  return {
    line: lineNo,
    raw,
    ok: true,
    draft: {
      brandCode: brand.code,
      brandName: brand.name,
      seriesCode,
      seriesName,
      iso,
      formatCode,
      format,
      name,
      nominalFrames: frames,
      process,
      colorType,
    },
    suggestedPrefix,
  }
}

/** 解析整段文本 */
export function parseImportText(text: string): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((line, i) => ({ line: line.trim(), no: i + 1 }))
    .filter((x) => x.line !== '' && !x.line.startsWith('#'))
    .map((x) => parseImportLine(x.line, x.no))
}

/** 在品牌内找一个未被占用的系列字母，用于前缀冲突时给候选 */
export function suggestFreeLetters(
  brandCode: string,
  isoCode: string,
  formatCode: string,
  taken: Set<string>,
  limit = 5,
): string[] {
  const out: string[] = []
  for (let i = 0; i < 26 && out.length < limit; i++) {
    const letter = String.fromCharCode(65 + i)
    const prefix = `${brandCode}${letter}${isoCode}${formatCode}`
    if (!taken.has(prefix)) out.push(letter)
  }
  return out
}

export { FORMATS }
