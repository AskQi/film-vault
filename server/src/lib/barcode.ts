/**
 * 包装条码归一化。
 *
 * 同一个物理条码在扫码器眼里可能有两种写法：
 *   UPC-A  12 位：041771880804   ← 包装盒上印的
 *   EAN-13 13 位：0041771880804  ← 扫码器补前导零后给的
 * 二者指向同一商品。如果按字符串精确比对，绑定时报 13 位、扫码时给 12 位，
 * 就会出现「明明绑过却提示未绑定」。所以库内统一存 13 位，查询时把两种写法都试一遍。
 */

/** 去掉非数字字符（扫码器偶尔会带空格或连字符） */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '')
}

/**
 * 归一化后的存储值：12 位的 UPC-A 补前导零成 13 位，其余原样。
 * 8 位 EAN-8 保持不变——它不是 UPC-A 的截断，补零没有意义。
 */
export function normalizeBarcode(raw: string): string {
  const d = digitsOnly(raw)
  if (d.length === 12) return `0${d}`
  return d
}

/**
 * 查询时用的候选写法，按优先级排列。
 * 既能命中新写入的归一化值，也能命中历史数据里按原始位数存的记录。
 */
export function barcodeCandidates(raw: string): string[] {
  const d = digitsOnly(raw)
  if (!d) return []

  const out = new Set<string>([d])

  if (d.length === 12) out.add(`0${d}`)
  // 13 位但前导零是补出来的：同时试 12 位，兼容早期按 12 位存的记录
  if (d.length === 13 && d.startsWith('0')) out.add(d.slice(1))

  return [...out]
}

/** 是否像一个包装条码：8-14 位纯数字（EAN-8 / UPC-A / EAN-13 / EAN-14） */
export function looksLikeBarcode(raw: string): boolean {
  return /^\d{8,14}$/.test(digitsOnly(raw))
}
