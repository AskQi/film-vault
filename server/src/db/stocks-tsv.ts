/**
 * 解析 data/film-stocks.tsv（型号库客观层）。
 *
 * 格式：TSV，首行表头，# 开头为注释行。
 * 按表头列名取值，不认识的列忽略——将来加列不会破坏导入。
 */

export interface StockRow {
  prefix: string
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
  status: string
  notes: string | null
}

/** 必需列，缺任何一列直接报错 */
const REQUIRED_COLUMNS = [
  'prefix',
  'brand_code',
  'brand_name',
  'series_code',
  'series_name',
  'iso',
  'format_code',
  'format',
  'name',
] as const

export interface ParsedStocks {
  rows: StockRow[]
  errors: { line: number; message: string }[]
}

export function parseStocksTsv(text: string): ParsedStocks {
  const rows: StockRow[] = []
  const errors: { line: number; message: string }[] = []
  const seenPrefix = new Map<string, number>()

  /** 列名 → 列下标 */
  let index: Map<string, number> | null = null

  const opt = (v: string | undefined): string | null => {
    const t = v?.trim()
    return t ? t : null
  }

  text.split(/\r?\n/).forEach((rawLine, idx) => {
    const lineNo = idx + 1
    const line = rawLine.replace(/\s+$/, '')
    if (line.trim() === '' || line.startsWith('#')) return

    const cells = line.split('\t')

    // 第一行非注释内容必须是表头
    if (!index) {
      if (cells[0]?.trim() !== 'prefix') {
        errors.push({ line: lineNo, message: '缺少表头行' })
        index = new Map()
        return
      }
      index = new Map(cells.map((name, i) => [name.trim(), i]))
      const missing = REQUIRED_COLUMNS.filter((c) => !index!.has(c))
      if (missing.length > 0) {
        errors.push({ line: lineNo, message: `表头缺少列：${missing.join(', ')}` })
      }
      return
    }

    const col = (name: string): string => {
      const i = index!.get(name)
      return i === undefined ? '' : (cells[i] ?? '').trim()
    }

    const prefix = col('prefix')
    const isoText = col('iso')

    if (prefix.length !== 4) {
      errors.push({ line: lineNo, message: `前缀长度不是 4：${prefix}` })
      return
    }
    if (!/^\d+$/.test(isoText)) {
      errors.push({ line: lineNo, message: `ISO 不是数字：${isoText}` })
      return
    }

    const prev = seenPrefix.get(prefix)
    if (prev !== undefined) {
      errors.push({ line: lineNo, message: `前缀 ${prefix} 与第 ${prev} 行重复` })
      return
    }
    seenPrefix.set(prefix, lineNo)

    const framesText = col('nominal_frames')

    rows.push({
      prefix,
      brandCode: col('brand_code'),
      brandName: col('brand_name'),
      seriesCode: col('series_code'),
      seriesName: col('series_name'),
      iso: Number(isoText),
      formatCode: col('format_code'),
      format: col('format'),
      name: col('name'),
      nominalFrames: /^\d+$/.test(framesText) ? Number(framesText) : null,
      process: opt(col('process')),
      colorType: opt(col('color_type')),
      status: col('status') || 'active',
      notes: opt(col('notes')),
    })
  })

  if (!index) {
    errors.push({ line: 1, message: '文件为空' })
  }

  return { rows, errors }
}
