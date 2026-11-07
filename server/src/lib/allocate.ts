/**
 * 序号分配器。
 *
 * 单前缀容量 6199（z99）。分配以 stock_prefix.seq_max 为准：
 *   - seq_max 只增不减，删除卷后编号不会被回收重用
 *   - 批量建档一次预留 N 个
 *
 * 两种冲突策略：
 *   append — 从 seq_max+1 起连续取 N 个（默认，最常用）
 *   skip   — 从指定 startSeq 起取 N 个可用号，跳过已被占用的
 */
import { and, eq, gte, lte, isNull } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { roll, stockPrefix } from '../db/schema/index.js'
import { MAX_SEQ, seqFromSerial, serialFromSeq, buildRollCode } from '@film-vault/shared'

export interface AllocatedRoll {
  seq: number
  serialTxt: string
  code: string
}

export class AllocationError extends Error {}

export interface AllocateOptions {
  prefix: string
  /** append 策略下忽略 */
  startSeq?: number
  count: number
  onConflict: 'skip' | 'append'
}

/**
 * 预留 N 个序号并同步 seq_max。
 * 调用方负责在同一事务里插入 roll，避免并发重复。
 */
export function allocateSeq(db: Db, opts: AllocateOptions): AllocatedRoll[] {
  const { prefix, count, onConflict } = opts

  if (count < 1) throw new AllocationError('数量必须大于 0')
  if (count > 50) throw new AllocationError('单次最多 50 卷')

  const row = db.select().from(stockPrefix).where(eq(stockPrefix.prefix, prefix)).get()
  if (!row) throw new AllocationError(`前缀 ${prefix} 不存在`)

  const taken = (from: number, to: number): Set<number> => {
    const rows = db
      .select({ seq: roll.seq })
      .from(roll)
      .where(and(eq(roll.prefix, prefix), gte(roll.seq, from), lte(roll.seq, to), isNull(roll.deletedAt)))
      .all()
    return new Set(rows.map((r) => r.seq))
  }

  let start: number
  if (onConflict === 'append') {
    start = row.seqMax + 1
  } else {
    start = opts.startSeq ?? row.seqMax + 1
  }

  const picked: number[] = []

  if (onConflict === 'append') {
    if (start + count - 1 > MAX_SEQ) {
      throw new AllocationError(
        `前缀 ${prefix} 剩余容量不足（当前 ${row.seqMax}，需再分配 ${count}）。请为该型号追加备用前缀。`,
      )
    }
    for (let i = 0; i < count; i++) picked.push(start + i)
  } else {
    const occupied = taken(start, Math.min(start + count * 2, MAX_SEQ))
    let cursor = start
    while (picked.length < count) {
      if (cursor > MAX_SEQ) {
        throw new AllocationError(`前缀 ${prefix} 从 ${start} 起可用号不足，需要 ${count} 个`)
      }
      if (cursor >= 1 && !occupied.has(cursor)) picked.push(cursor)
      cursor++
    }
  }

  const newMax = Math.max(row.seqMax, picked[picked.length - 1]!)

  db.transaction((tx) => {
    tx.update(stockPrefix).set({ seqMax: newMax }).where(eq(stockPrefix.prefix, prefix)).run()
  })

  return picked.map((seq) => {
    const serialTxt = serialFromSeq(seq)
    return { seq, serialTxt, code: buildRollCode(prefix, seq) }
  })
}

/** 预览下一个可用编号，不写库 */
export function peekNext(db: Db, prefix: string): AllocatedRoll {
  const row = db.select().from(stockPrefix).where(eq(stockPrefix.prefix, prefix)).get()
  if (!row) throw new AllocationError(`前缀 ${prefix} 不存在`)
  const seq = row.seqMax + 1
  if (seq > MAX_SEQ) {
    throw new AllocationError(`前缀 ${prefix} 已用满 ${MAX_SEQ} 个序号，请追加备用前缀`)
  }
  return { seq, serialTxt: serialFromSeq(seq), code: buildRollCode(prefix, seq) }
}

/** 从用户输入的起始序号推出 seq；非法时抛错 */
export function parseStartSerial(serial: string): number {
  return seqFromSerial(serial)
}
