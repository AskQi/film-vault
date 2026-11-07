/**
 * 状态流转：用内存库跑真实迁移，验证 recordProgress 的规则。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, runMigrations, type Db } from '../src/db/client.js'
import { filmStock, roll, rollProgress, stockPrefix } from '../src/db/schema/index.js'
import { ProgressError, recordProgress } from '../src/lib/progress.js'

let db: Db
let rollId: number

function getRoll() {
  return db.select().from(roll).where(eq(roll.id, rollId)).get()!
}

function rec(input: Partial<Parameters<typeof recordProgress>[2]>) {
  return recordProgress(db, getRoll(), { event: 'progress', reachedFrame: 0, ...input })
}

beforeEach(() => {
  db = createDb(':memory:')
  runMigrations(db)
  const now = new Date().toISOString()
  const s = db
    .insert(filmStock)
    .values({
      brandCode: 'K', seriesCode: 'G', isoCode: '2', iso: 200, formatCode: 'T', format: '135',
      name: 'Kodak Gold 200', status: 'active', createdAt: now, updatedAt: now,
    })
    .returning()
    .get()!
  db.insert(stockPrefix).values({ prefix: 'KG2T', stockId: s.id, isPrimary: 1, seqMax: 1 }).run()
  rollId = db
    .insert(roll)
    .values({
      code: 'KG2T001', prefix: 'KG2T', serialTxt: '001', seq: 1, stockId: s.id,
      framesTotal: 36, status: 'unopened', createdAt: now, updatedAt: now,
    })
    .returning()
    .get()!.id
})

describe('recordProgress 状态流转', () => {
  it('装机 → loaded，记录装机时间', () => {
    rec({ event: 'load', happenedAt: '2026-11-01T08:00:00.000Z' })
    const r = getRoll()
    expect(r.status).toBe('loaded')
    expect(r.loadedAt).toBe('2026-11-01T08:00:00.000Z')
  })

  it('记张数 → partial；未装机时补记装机时间', () => {
    rec({ reachedFrame: 10, happenedAt: '2026-11-02T08:00:00.000Z' })
    const r = getRoll()
    expect(r.status).toBe('partial')
    expect(r.loadedAt).toBe('2026-11-02T08:00:00.000Z')
  })

  it('已有装机时间时记张数不覆盖它', () => {
    rec({ event: 'load', happenedAt: '2026-11-01T08:00:00.000Z' })
    rec({ reachedFrame: 5, happenedAt: '2026-11-03T08:00:00.000Z' })
    expect(getRoll().loadedAt).toBe('2026-11-01T08:00:00.000Z')
  })

  it('拍满 → exposed，记录完成时间', () => {
    rec({ reachedFrame: 36, happenedAt: '2026-11-05T08:00:00.000Z' })
    const r = getRoll()
    expect(r.status).toBe('exposed')
    expect(r.finishedAt).toBe('2026-11-05T08:00:00.000Z')
  })

  it('超过总张数拒绝', () => {
    expect(() => rec({ reachedFrame: 37 })).toThrow(ProgressError)
  })

  it('已拍完的卷拒绝再记录', () => {
    rec({ reachedFrame: 36 })
    expect(() => rec({ reachedFrame: 10 })).toThrow(/不能再记录/)
  })

  it('位置随记录保存', () => {
    const p = rec({ reachedFrame: 3, lat: 31.2304, lng: 121.4737, address: '上海市黄浦区外滩' })
    const row = db.select().from(rollProgress).where(eq(rollProgress.id, p!.id)).get()!
    expect(row.lat).toBe(31.2304)
    expect(row.lng).toBe(121.4737)
    expect(row.address).toBe('上海市黄浦区外滩')
  })

  it('空地址存为 null', () => {
    const p = rec({ reachedFrame: 3, address: '' })
    expect(p!.address).toBeNull()
  })
})
