import { describe, expect, it } from 'vitest'
import { barcodeCandidates, looksLikeBarcode, normalizeBarcode } from '../src/lib/barcode.js'

describe('包装条码归一化', () => {
  it('12 位 UPC-A 补前导零成 13 位', () => {
    expect(normalizeBarcode('041771880804')).toBe('0041771880804')
  })

  it('13 位原样保留', () => {
    expect(normalizeBarcode('0041771880804')).toBe('0041771880804')
  })

  it('剥掉扫码器带进来的空格与连字符', () => {
    expect(normalizeBarcode(' 0041771880804 ')).toBe('0041771880804')
    expect(normalizeBarcode('0-041771-880804')).toBe('0041771880804')
  })

  it('8 位 EAN-8 不补零', () => {
    expect(normalizeBarcode('12345678')).toBe('12345678')
  })

  it('查询候选同时覆盖 12/13 位', () => {
    expect(barcodeCandidates('041771880804')).toEqual(['041771880804', '0041771880804'])
    expect(barcodeCandidates('0041771880804')).toEqual(['0041771880804', '041771880804'])
  })

  it('非 UPC 长度只返回自身', () => {
    expect(barcodeCandidates('12345678')).toEqual(['12345678'])
  })

  it('识别常见条码位数', () => {
    expect(looksLikeBarcode('041771880804')).toBe(true)
    expect(looksLikeBarcode('0041771880804')).toBe(true)
    expect(looksLikeBarcode('12345678')).toBe(true)
    expect(looksLikeBarcode('KG2T001')).toBe(false)
    expect(looksLikeBarcode('123')).toBe(false)
  })
})
