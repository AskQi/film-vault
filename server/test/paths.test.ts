import { describe, expect, it } from 'vitest'
import { isApiPath } from '../src/lib/paths.js'

describe('isApiPath', () => {
  it('/api 本身也算接口路径（否则会被 SPA 回退成 HTML）', () => {
    expect(isApiPath('/api')).toBe(true)
  })
  it('/api/ 下的路径', () => {
    expect(isApiPath('/api/')).toBe(true)
    expect(isApiPath('/api/stocks')).toBe(true)
  })
  it('前端路由与相似前缀不算', () => {
    expect(isApiPath('/')).toBe(false)
    expect(isApiPath('/rolls/1')).toBe(false)
    expect(isApiPath('/apis')).toBe(false)
    expect(isApiPath('/api-docs')).toBe(false)
  })
})
