import { describe, expect, it } from 'vitest'
import {
  buildRollCode,
  codeToIso,
  headIndex,
  isoToCode,
  parseRollCode,
  seqFromSerial,
  serialFromSeq,
  validatePrefix,
} from '@film-vault/shared'

describe('序号与 seq 互转', () => {
  it('数字序号', () => {
    expect(seqFromSerial('001')).toBe(1)
    expect(seqFromSerial('099')).toBe(99)
    expect(seqFromSerial('999')).toBe(999)
    expect(serialFromSeq(1)).toBe('001')
    expect(serialFromSeq(999)).toBe('999')
  })

  it('大写字母序号', () => {
    expect(seqFromSerial('A00')).toBe(1000)
    expect(seqFromSerial('A07')).toBe(1007)
    expect(seqFromSerial('A99')).toBe(1099)
    expect(seqFromSerial('Z99')).toBe(3599)
    expect(serialFromSeq(1000)).toBe('A00')
    expect(serialFromSeq(1007)).toBe('A07')
    expect(serialFromSeq(3599)).toBe('Z99')
  })

  it('小写字母序号（与大写相差 2600）', () => {
    expect(seqFromSerial('a00')).toBe(3600)
    expect(seqFromSerial('a07')).toBe(3607)
    expect(seqFromSerial('z99')).toBe(6199)
    expect(serialFromSeq(3600)).toBe('a00')
    expect(serialFromSeq(3607)).toBe('a07')
    expect(serialFromSeq(6199)).toBe('z99')
  })

  it('A07 与 a07 相差 2600 卷', () => {
    expect(seqFromSerial('a07') - seqFromSerial('A07')).toBe(2600)
  })

  it('位次映射', () => {
    expect(headIndex('0')).toBe(0)
    expect(headIndex('9')).toBe(9)
    expect(headIndex('A')).toBe(10)
    expect(headIndex('Z')).toBe(35)
    expect(headIndex('a')).toBe(36)
    expect(headIndex('z')).toBe(61)
    expect(headIndex('-')).toBe(-1)
  })

  it('全序列首尾衔接连续', () => {
    let prev = -1
    for (let seq = 1; seq <= 6199; seq++) {
      const serial = serialFromSeq(seq)
      expect(serial).toHaveLength(3)
      expect(seqFromSerial(serial)).toBe(seq)
      expect(seq).toBeGreaterThan(prev)
      prev = seq
    }
  })

  it('边界拒绝', () => {
    // 0 可还原为 '000'，但 '000' 是保留值，合法性由 parseRollCode 把关
    expect(serialFromSeq(0)).toBe('000')
    expect(seqFromSerial('000')).toBe(0)
    expect(() => serialFromSeq(6200)).toThrow()
    expect(() => serialFromSeq(-1)).toThrow()
    expect(() => serialFromSeq(1.5)).toThrow()
    expect(() => seqFromSerial('0A0')).toThrow()
    expect(() => seqFromSerial('00')).toThrow()
    expect(() => seqFromSerial('A0A')).toThrow()
  })
})

describe('ISO 码', () => {
  it('主规则', () => {
    expect(isoToCode(100)).toBe('1')
    expect(isoToCode(200)).toBe('2')
    expect(isoToCode(400)).toBe('4')
    expect(isoToCode(800)).toBe('8')
    expect(isoToCode(1000)).toBe('A')
    expect(isoToCode(1600)).toBe('G')
    expect(isoToCode(3200)).toBe('W')
    expect(isoToCode(3500)).toBe('Z')
  })

  it('例外码是小写', () => {
    expect(isoToCode(25)).toBe('a')
    expect(isoToCode(50)).toBe('b')
    expect(isoToCode(64)).toBe('c')
    expect(isoToCode(80)).toBe('g')
    expect(isoToCode(125)).toBe('f')
    expect(isoToCode(160)).toBe('d')
    expect(isoToCode(250)).toBe('h')
    expect(isoToCode(320)).toBe('e')
  })

  it('反向映射', () => {
    expect(codeToIso('1')).toBe(100)
    expect(codeToIso('G')).toBe(1600)
    expect(codeToIso('g')).toBe(80) // 小写是例外码，不是 1600
    expect(codeToIso('d')).toBe(160)
    expect(codeToIso('D')).toBe(1300)
  })

  it('大小写不可互换', () => {
    expect(codeToIso('d')).not.toBe(codeToIso('D'))
    expect(codeToIso('a')).toBe(25)
    expect(codeToIso('A')).toBe(1000)
  })

  it('无法表示的 ISO 返回 null', () => {
    expect(isoToCode(36)).toBeNull()
    expect(isoToCode(4000)).toBeNull()
    expect(isoToCode(0)).toBeNull()
    expect(codeToIso('I')).toBe(1800) // A-Z 全部被占用，'I' 是 ISO 1800
    expect(codeToIso('i')).toBeNull() // 小写只放例外码 a-h
    expect(codeToIso('0')).toBeNull()
  })

  it('全码表往返一致', () => {
    for (let v = 1; v <= 9; v++) expect(codeToIso(isoToCode(v * 100)!)).toBe(v * 100)
    for (let v = 10; v <= 35; v++) {
      const code = isoToCode(v * 100)!
      expect(codeToIso(code)).toBe(v * 100)
    }
  })
})

describe('前缀校验', () => {
  it('合法前缀', () => {
    expect(validatePrefix('KG2T').ok).toBe(true)
    expect(validatePrefix('KPdT').ok).toBe(true)
    expect(validatePrefix('FC2T').ok).toBe(true)
  })

  it('大小写敏感', () => {
    const kpdt = validatePrefix('KPDT')
    expect(kpdt.ok).toBe(true)
    if (kpdt.ok) expect(kpdt.iso).toBe(1300)

    const kpdtLower = validatePrefix('KPdT')
    if (kpdtLower.ok) expect(kpdtLower.iso).toBe(160)
  })

  it('拒绝非法前缀', () => {
    expect(validatePrefix('kg2T').ok).toBe(false) // 品牌位小写
    expect(validatePrefix('Kg2T').ok).toBe(false) // 系列位小写
    expect(validatePrefix('KG2t').ok).toBe(false) // 画幅位小写
    expect(validatePrefix('KG0T').ok).toBe(false) // '0' 不是合法 ISO 码
    expect(validatePrefix('KGIT').ok).toBe(true) // 'I' = ISO 1800，结构合法
    expect(validatePrefix('KG2Y').ok).toBe(false) // 'Y' 不是画幅码
    expect(validatePrefix('KG2').ok).toBe(false) // 长度
  })
})

describe('编码解析', () => {
  it('KG2T001', () => {
    const r = parseRollCode('KG2T001')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.code).toBe('KG2T001')
    expect(r.prefix).toBe('KG2T')
    expect(r.serialTxt).toBe('001')
    expect(r.seq).toBe(1)
    expect(r.brand).toBe('K')
    expect(r.series).toBe('G')
    expect(r.isoCode).toBe('2')
    expect(r.iso).toBe(200)
    expect(r.formatCode).toBe('T')
    expect(r.format).toBe('135')
  })

  it('KG2M002 → 120 画幅', () => {
    const r = parseRollCode('KG2M002')
    expect(r.ok && r.format).toBe('120')
    expect(r.ok && r.seq).toBe(2)
  })

  it('KPdT010 小写不被吞', () => {
    const r = parseRollCode('KPdT010')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.isoCode).toBe('d')
    expect(r.iso).toBe(160)
    expect(r.seq).toBe(10)
  })

  it('KPDT010 是另一个型号（ISO 1300）', () => {
    const r = parseRollCode('KPDT010')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.iso).toBe(1300) // 结构合法，但库里不存在该前缀
  })

  it('序号首位大写与小写是不同的卷', () => {
    const upper = parseRollCode('KG2TA07')
    const lower = parseRollCode('KG2Ta07')
    expect(upper.ok && upper.seq).toBe(1007)
    expect(lower.ok && lower.seq).toBe(3607)
    expect(upper.ok && lower.ok && upper.code).not.toBe(lower.ok && lower.code)
  })

  it('000 保留', () => {
    const r = parseRollCode('KG2T000')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('serial')
  })

  it('A00 不是 0', () => {
    const r = parseRollCode('KG2TA00')
    expect(r.ok && r.seq).toBe(1000)
  })

  it('长度超限与不足', () => {
    expect(parseRollCode('KG2T1000').ok).toBe(false)
    expect(parseRollCode('KG2T').ok).toBe(false)
    expect(parseRollCode('').ok).toBe(false)
  })

  it('容忍空格与连字符、全角字符', () => {
    expect(parseRollCode(' KG2T001 ').ok).toBe(true)
    expect(parseRollCode('KG2T-001').ok).toBe(true)
    expect(parseRollCode('KG2T 001').ok).toBe(true)
    expect(parseRollCode('ＫＧ２Ｔ００１').ok).toBe(true)
  })

  it('全小写前缀非法', () => {
    const r = parseRollCode('kg2t001')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('prefix')
  })

  it('序号后两位非数字', () => {
    const r = parseRollCode('KG2TA0B')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('serial')
  })
})

describe('buildRollCode', () => {
  it('跨 999 与 Z99 时自动进位', () => {
    expect(buildRollCode('KG2T', 999)).toBe('KG2T999')
    expect(buildRollCode('KG2T', 1000)).toBe('KG2TA00')
    expect(buildRollCode('KG2T', 3600)).toBe('KG2Ta00')
    expect(buildRollCode('KG2T', 6199)).toBe('KG2Tz99')
  })

  it('build 与 parse 往返一致', () => {
    for (const seq of [1, 2, 99, 100, 999, 1000, 1007, 3599, 3600, 6199]) {
      const code = buildRollCode('KPdT', seq)
      const parsed = parseRollCode(code)
      expect(parsed.ok && parsed.seq).toBe(seq)
      expect(parsed.ok && parsed.isoCode).toBe('d')
    }
  })
})

describe('有效期格式', () => {
  it('接受年月 6 位', async () => {
    const { expirySchema } = await import('@film-vault/shared')
    expect(expirySchema.parse('202808')).toBe('202808')
    expect(expirySchema.parse(' 202801 ')).toBe('202801')
  })

  it('拒绝非法月份与年份', async () => {
    const { expirySchema } = await import('@film-vault/shared')
    expect(expirySchema.safeParse('202813').success).toBe(false)
    expect(expirySchema.safeParse('202800').success).toBe(false)
    expect(expirySchema.safeParse('189912').success).toBe(false)
    expect(expirySchema.safeParse('2028008').success).toBe(false)
    expect(expirySchema.safeParse('20-08').success).toBe(false)
    expect(expirySchema.safeParse('').success).toBe(false)
  })
})
