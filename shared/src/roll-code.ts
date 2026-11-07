/**
 * 胶卷编号解析 —— 纯函数，不碰数据库，方便单测。
 *
 * 编码恒为 7 字符：4 位前缀 + 3 位序号
 *
 *   K G 2 T 0 0 1
 *   │ │ │ │ └──┬┘
 *   │ │ │ │    └── 序号：首位 0-9/A-Z/a-z（62 值），后两位恒为数字
 *   │ │ │ └─────── 画幅：T/M/D/S/P/X
 *   │ │ └───────── 感光度码：1-9 / A-Z，例外 a-h（小写）
 *   │ └─────────── 系列：品牌内唯一，1 个大写字母
 *   └───────────── 品牌：1 个大写字母
 *
 * 铁律：绝不全局 toUpperCase/toLowerCase。
 *   - ISO 位：'d'(160) ≠ 'D'(1300)
 *   - 序号首位：'A07'(seq 1007) ≠ 'a07'(seq 3607)
 */

import { FORMAT_NAME, codeToIso } from './constants.js'

export const CODE_LENGTH = 7
export const PREFIX_LENGTH = 4
export const SERIAL_LENGTH = 3

/**
 * 序号首位 → 位次：'0'-'9' → 0-9，'A'-'Z' → 10-35，'a'-'z' → 36-61。
 * 返回 -1 表示非法字符。
 */
export function headIndex(ch: string): number {
  if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48
  if (ch >= 'A' && ch <= 'Z') return ch.charCodeAt(0) - 65 + 10
  if (ch >= 'a' && ch <= 'z') return ch.charCodeAt(0) - 97 + 36
  return -1
}

/** 位次 → 序号首位字符 */
export function headChar(index: number): string {
  if (index >= 0 && index <= 9) return String(index)
  if (index >= 10 && index <= 35) return String.fromCharCode(65 + index - 10)
  if (index >= 36 && index <= 61) return String.fromCharCode(97 + index - 36)
  throw new RangeError(`位次超出范围：${index}`)
}

/**
 * 3 字符序号 → 可排序整数。
 * '001' → 1，'999' → 999，'A00' → 1000，'z99' → 6199。
 * 注意 '000' 返回 0，是否合法由调用方判断（0 是保留值）。
 */
export function seqFromSerial(serial: string): number {
  if (serial.length !== SERIAL_LENGTH) {
    throw new RangeError(`序号必须是 ${SERIAL_LENGTH} 字符：${serial}`)
  }
  const head = headIndex(serial[0]!)
  const tailText = serial.slice(1)
  if (head < 0) throw new RangeError(`序号首位非法：${serial}`)
  if (!/^\d{2}$/.test(tailText)) throw new RangeError(`序号后两位必须是数字：${serial}`)
  return head * 100 + Number(tailText)
}

/**
 * 可排序整数 → 3 字符序号。
 * 1 → '001'，1000 → 'A00'，6199 → 'z99'。
 */
export function serialFromSeq(seq: number): string {
  if (!Number.isInteger(seq) || seq < 0 || seq > 6199) {
    throw new RangeError(`seq 超出范围 0..6199：${seq}`)
  }
  const head = headChar(Math.floor(seq / 100))
  const tail = String(seq % 100).padStart(2, '0')
  return head + tail
}

/** 前缀拆解结果 */
export interface PrefixParts {
  prefix: string
  /** 品牌位 */
  brand: string
  /** 系列位 */
  series: string
  /** 感光度码，保留原始大小写 */
  isoCode: string
  /** 感光度码对应的 ISO 值 */
  iso: number
  /** 画幅码 */
  formatCode: string
  /** 画幅名，如 '135' */
  format: string
}

export type PrefixValidation =
  | ({ ok: true } & PrefixParts)
  | { ok: false; reason: string }

/**
 * 校验 4 位前缀的结构合法性（不查数据库，不判断前缀是否已被占用）。
 *
 * 逐位判断，不做任何大小写归一化：
 *   - 品牌位、系列位、画幅位必须大写
 *   - ISO 位按 codeToIso 精确匹配（小写 a-h 是例外码）
 */
export function validatePrefix(prefix: string): PrefixValidation {
  if (prefix.length !== PREFIX_LENGTH) {
    return { ok: false, reason: `前缀必须是 ${PREFIX_LENGTH} 位：${prefix}` }
  }

  const brand = prefix[0]!
  const series = prefix[1]!
  const isoCode = prefix[2]!
  const formatCode = prefix[3]!

  if (!/^[A-Z]$/.test(brand)) {
    return { ok: false, reason: `品牌位必须是大写字母：${brand}` }
  }
  if (!/^[A-Z]$/.test(series)) {
    return { ok: false, reason: `系列位必须是大写字母：${series}` }
  }
  const iso = codeToIso(isoCode)
  if (iso === null) {
    return { ok: false, reason: `感光度码非法：${isoCode}` }
  }
  const format = FORMAT_NAME[formatCode]
  if (!format) {
    return { ok: false, reason: `画幅码非法：${formatCode}` }
  }

  return { ok: true, prefix, brand, series, isoCode, iso, formatCode, format }
}

/** 由前缀与整数 seq 拼出 7 字符编码 */
export function buildRollCode(prefix: string, seq: number): string {
  return prefix + serialFromSeq(seq)
}

export type ParseFailureReason =
  /** 长度不是 7 */
  | 'length'
  /** 前缀结构非法（非大写、ISO 码或画幅码不认识） */
  | 'prefix'
  /** 序号非法（后两位不是数字，或为保留的 000） */
  | 'serial'

export type RollCodeParse =
  | ({ ok: true; code: string; serialTxt: string; seq: number } & PrefixParts)
  | { ok: false; reason: ParseFailureReason; detail: string; raw: string }

/**
 * 全角 → 半角（数字、大写字母、小写字母、连字符）。
 * 中文输入法在手机会打出全角字符，不转换会白白报错。
 */
function toHalfWidth(input: string): string {
  return input.replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  )
}

/**
 * 解析一段可能来自扫码、手输的文本。
 * 只做结构解析与校验，是否已在库中属于上层（数据库）的判断。
 */
export function parseRollCode(raw: string): RollCodeParse {
  // 去掉中断符与空白；手输时常带连字符分隔
  const s = toHalfWidth(raw).trim().replace(/[\s\-]/g, '')

  if (s.length !== CODE_LENGTH) {
    return {
      ok: false,
      reason: 'length',
      detail: `编码必须是 ${CODE_LENGTH} 位，收到 ${s.length} 位`,
      raw,
    }
  }

  const prefix = s.slice(0, PREFIX_LENGTH)
  const serialTxt = s.slice(PREFIX_LENGTH)

  const prefixCheck = validatePrefix(prefix)
  if (!prefixCheck.ok) {
    return { ok: false, reason: 'prefix', detail: prefixCheck.reason, raw }
  }

  const head = headIndex(serialTxt[0]!)
  if (head < 0 || !/^\d{2}$/.test(serialTxt.slice(1))) {
    return {
      ok: false,
      reason: 'serial',
      detail: `序号非法：${serialTxt}`,
      raw,
    }
  }

  const seq = head * 100 + Number(serialTxt.slice(1))
  if (seq < 1) {
    return {
      ok: false,
      reason: 'serial',
      detail: '000 为保留序号，不可用',
      raw,
    }
  }

  const { ok: _ok, ...parts } = prefixCheck
  return { ok: true, ...parts, code: prefix + serialTxt, serialTxt, seq }
}
