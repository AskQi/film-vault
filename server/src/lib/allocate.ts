/**
 * 序号分配器。
 *
 * 单前缀容量 6199（z99）。分配以 stock_prefix.seq_max 为准：
 *   - seq_max 只增不减，删除卷后编号不会被回收重用
 *   - 批量建档一次预留 N 个
 *
 * 三种冲突策略：
 *   strict — 从指定 startSeq 起连续 N 个，任何一个已被占用就报错并列出（默认）
 *   skip   — 从指定 startSeq 起取 N 个可用号，跳过已被占用的
 *   append — 忽略 startSeq，从 seq_max+1 起连续取 N 个
 */
import { and, eq, gte, lte } from 'drizzle-orm'
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
  onConflict: 'strict' | 'skip' | 'append'
}

/** 严格模式下撞号的详情，路由层用它告诉用户具体是哪几个 */
export interface ConflictDetail {
  serialTxt: string
  code: string
}

export class ConflictError extends AllocationError {
  constructor(
    message: string,
    readonly conflicts: ConflictDetail[],
  ) {
    super(message)
  }
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

  // 不排除软删除：roll.code 是全局唯一索引，软删除的记录仍占着编号，
  // 当成空闲会在插入时撞索引。
  const taken = (from: number, to: number): Set<number> => {
    const rows = db
      .select({ seq: roll.seq })
      .from(roll)
      .where(and(eq(roll.prefix, prefix), gte(roll.seq, from), lte(roll.seq, to)))
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
  } else if (onConflict === 'strict') {
    if (start + count - 1 > MAX_SEQ) {
      throw new AllocationError(
        `从 ${serialFromSeq(start)} 起连续 ${count} 个号超出上限 ${serialFromSeq(MAX_SEQ)}`,
      )
    }
    const occupied = taken(start, start + count - 1)
    if (occupied.size > 0) {
      const conflicts: ConflictDetail[] = [...occupied]
        .sort((a, b) => a - b)
        .map((seq) => ({ serialTxt: serialFromSeq(seq), code: buildRollCode(prefix, seq) }))
      throw new ConflictError(
        `编号已存在：${conflicts.map((c) => c.code).join('、')}`,
        conflicts,
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

export interface NextSerialSuggestion extends AllocatedRoll {
  /** 推断依据，用于界面上说明为什么是这个号 */
  basis: 'empty' | 'stock' | 'counter'
  /** 该前缀已建档的卷数 */
  rollCount: number
  /** 其中还没拍完的（未拆封 / 已装机 / 部分使用） */
  unexposedCount: number
  seqMax: number
}

/**
 * 推测下一个编号，不写库。
 *
 * 按实际库存推断，而不是死跟 seq_max：删掉一卷之后 seq_max 不会回退，
 * 但库存确实少了，这时推测值应当落在空缺上。
 *
 *   counter — 取 seq_max + 1，保证不撞已分配过的号
 *   stock   — 若存在「空缺」（已用号之间没被占用的号），取最小的那个
 *   empty   — 该前缀下还没有任何卷，从 001 开始
 *
 * 两种取法都不会产生已存在的编号，所以默认值可以直接提交。
 * 删卷后留下的空号属于「库存缺口」，优先回填能保持编号连续。
 */
export function peekNext(db: Db, prefix: string): NextSerialSuggestion {
  const row = db.select().from(stockPrefix).where(eq(stockPrefix.prefix, prefix)).get()
  if (!row) throw new AllocationError(`前缀 ${prefix} 不存在`)

  // 注意这里不排除软删除的卷：roll.code 是全局唯一索引，软删除的记录仍然占着编号，
  // 若把它们当成空缺，推测值会撞上索引直接建档失败。
  const existing = db
    .select({ seq: roll.seq, status: roll.status, deletedAt: roll.deletedAt })
    .from(roll)
    .where(eq(roll.prefix, prefix))
    .all()

  const used = new Set(existing.map((r) => r.seq))
  const live = existing.filter((r) => r.deletedAt === null)
  const rollCount = live.length
  const unexposedCount = live.filter(
    (r) => r.status === 'unopened' || r.status === 'loaded' || r.status === 'partial',
  ).length

  const pick = (seq: number, basis: NextSerialSuggestion['basis']): NextSerialSuggestion => ({
    seq,
    serialTxt: serialFromSeq(seq),
    code: buildRollCode(prefix, seq),
    basis,
    rollCount,
    unexposedCount,
    seqMax: row.seqMax,
  })

  if (rollCount === 0) return pick(1, 'empty')

  // 找最小空缺：1..seq_max 之间未被占用的号
  for (let seq = 1; seq <= row.seqMax; seq++) {
    if (!used.has(seq)) return pick(seq, 'stock')
  }

  // 没有空缺：接在最大号之后
  const seq = row.seqMax + 1
  if (seq > MAX_SEQ) {
    throw new AllocationError(`前缀 ${prefix} 已用满 ${MAX_SEQ} 个序号，请追加备用前缀`)
  }
  return pick(seq, 'counter')
}

/** 从用户输入的起始序号推出 seq；非法时抛错 */
export function parseStartSerial(serial: string): number {
  return seqFromSerial(serial)
}
