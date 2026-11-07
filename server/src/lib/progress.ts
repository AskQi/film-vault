/**
 * 写入一条进度记录并推进胶卷状态。
 * 记一笔接口与快速记录共用，保证两处的状态流转规则一致。
 */
import { eq } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { roll, rollProgress } from '../db/schema/index.js'
import { ROLL_STATUS_LABEL, type ProgressInput, type RollStatus } from '@film-vault/shared'

type RollRow = typeof roll.$inferSelect

export class ProgressError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message)
  }
}

/** 这些状态下胶卷已离开相机，不能再装机或记张数 */
const CLOSED_STATUSES = new Set(['exposed', 'developed', 'archived', 'void', 'lost'])

/**
 * 状态流转：
 *   load     → loaded，并写 loaded_at / camera_id / lens_id
 *   progress → reached_frame > 0 时进入 partial；拍满即 exposed
 */
export function recordProgress(db: Db, r: RollRow, input: ProgressInput) {
  if (CLOSED_STATUSES.has(r.status)) {
    const label = ROLL_STATUS_LABEL[r.status as RollStatus] ?? r.status
    throw new ProgressError(409, `该卷已「${label}」，不能再记录拍摄`)
  }
  if (input.reachedFrame > r.framesTotal) {
    throw new ProgressError(400, `第 ${input.reachedFrame} 张超过该卷总张数 ${r.framesTotal}`)
  }

  const now = new Date().toISOString()
  const happenedAt = input.happenedAt ?? now

  return db.transaction((tx) => {
    const p = tx
      .insert(rollProgress)
      .values({
        rollId: r.id,
        event: input.event,
        reachedFrame: input.reachedFrame,
        happenedAt,
        cameraId: input.cameraId ?? null,
        lensId: input.lensId ?? null,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        address: input.address || null,
        note: input.note ?? null,
        createdAt: now,
      })
      .returning()
      .get()

    const patch: Partial<RollRow> = { updatedAt: now }

    if (input.event === 'load') {
      patch.status = input.reachedFrame > 0 ? 'partial' : 'loaded'
      patch.loadedAt = happenedAt
      if (input.cameraId !== undefined) patch.cameraId = input.cameraId
      if (input.lensId !== undefined) patch.lensId = input.lensId
    } else if (input.reachedFrame >= r.framesTotal) {
      patch.status = 'exposed'
      patch.finishedAt = happenedAt
      if (!r.loadedAt) patch.loadedAt = happenedAt
    } else if (input.reachedFrame > 0) {
      patch.status = 'partial'
      // 跳过装机直接记张数：把这次时间当作装机时间
      if (!r.loadedAt) patch.loadedAt = happenedAt
    }

    tx.update(roll).set(patch).where(eq(roll.id, r.id)).run()
    return p
  })
}
