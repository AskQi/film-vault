import { describe, expect, it } from 'vitest'
import { parseImportLine, parseImportText, suggestFreeLetters } from '../src/lib/text-import.js'

describe('文本导入解析', () => {
  it('标准写法：品牌 系列 ISO 画幅 张数 工艺', () => {
    const r = parseImportLine('Kodak Portra 400 135 36张 C-41', 1)
    expect(r.ok).toBe(true)
    expect(r.draft).toMatchObject({
      brandCode: 'K',
      seriesCode: 'P',
      seriesName: 'Portra',
      iso: 400,
      formatCode: 'T',
      format: '135',
      nominalFrames: 36,
      process: 'C-41',
      colorType: 'color_negative',
    })
    expect(r.suggestedPrefix).toBe('KP4T')
  })

  it('不带张数与工艺', () => {
    const r = parseImportLine('Ilford HP5 Plus 400 135', 1)
    expect(r.ok).toBe(true)
    expect(r.draft).toMatchObject({ brandCode: 'I', iso: 400, formatCode: 'T' })
    expect(r.draft?.nominalFrames).toBeNull()
    expect(r.suggestedPrefix).toBe('IH4T')
  })

  it('120 画幅不印张数', () => {
    const r = parseImportLine('Fujifilm Velvia 50 120 E-6', 1)
    expect(r.ok).toBe(true)
    expect(r.draft).toMatchObject({ formatCode: 'M', format: '120', colorType: 'color_positive' })
    expect(r.draft?.name).toBe('Fujifilm Velvia 50 120')
    expect(r.suggestedPrefix).toBe('FVbM')
  })

  it('中文品牌名', () => {
    const r = parseImportLine('柯达 Gold 200 135 36张 C-41', 1)
    expect(r.ok).toBe(true)
    expect(r.draft?.brandCode).toBe('K')
    expect(r.suggestedPrefix).toBe('KG2T')
  })

  it('ISO 例外码走小写', () => {
    const r = parseImportLine('Kodak Portra 160 135 C-41', 1)
    expect(r.ok).toBe(true)
    expect(r.suggestedPrefix).toBe('KPdT')
  })

  it('ISO 与张数不混淆', () => {
    const r = parseImportLine('Kodak Gold 200 135 36张', 1)
    expect(r.draft?.iso).toBe(200)
    expect(r.draft?.nominalFrames).toBe(36)
  })

  it('4x5 页片', () => {
    const r = parseImportLine('Ilford FP4 Plus 125 4x5', 1)
    expect(r.ok).toBe(true)
    expect(r.draft).toMatchObject({ formatCode: 'S', format: '页片' })
  })

  it('缺 ISO 报错', () => {
    const r = parseImportLine('Kodak Gold 135', 1)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ISO')
  })

  it('缺画幅报错', () => {
    const r = parseImportLine('Kodak Gold 200', 1)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('画幅')
  })

  it('认不出品牌报错', () => {
    const r = parseImportLine('SomeUnknownBrand 400 135', 1)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('品牌')
  })

  it('无法用单字符表示的 ISO', () => {
    const r = parseImportLine('Kodak Gold 300 135', 1) // 300 不在已知 ISO 里，会被当成系列词
    expect(r.ok).toBe(false)
  })

  it('整段文本跳过空行与注释', () => {
    const text = ['# 注释', '', 'Kodak Gold 200 135', 'Fujifilm C200 200 135'].join('\n')
    const lines = parseImportText(text)
    expect(lines).toHaveLength(2)
    expect(lines.map((l) => l.line)).toEqual([3, 4])
    expect(lines.every((l) => l.ok)).toBe(true)
  })
})

describe('空闲字母建议', () => {
  it('跳过已被占用的前缀', () => {
    const taken = new Set(['KG2T', 'KA2T', 'KB2T'])
    expect(suggestFreeLetters('K', '2', 'T', taken, 3)).toEqual(['C', 'D', 'E'])
  })

  it('限制返回数量', () => {
    expect(suggestFreeLetters('K', '2', 'T', new Set(), 5)).toHaveLength(5)
  })
})
