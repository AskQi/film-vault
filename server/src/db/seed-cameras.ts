/**
 * 机身与镜头预置。
 *
 * 只在表为空时插入，避免覆盖用户后来改过的记录。
 */
import type { Db } from './client.js'
import { camera, lens } from './schema/index.js'

export function seedCameras(db: Db) {
  const existingCameras = db.select().from(camera).all()
  if (existingCameras.length === 0) {
    const now = new Date().toISOString()
    db.insert(camera)
      .values({ brand: 'Canon', model: 'EOS 30V', mount: 'EF', createdAt: now })
      .run()
  }

  const existingLenses = db.select().from(lens).all()
  if (existingLenses.length === 0) {
    const now = new Date().toISOString()
    db.insert(lens)
      .values({
        brand: 'Canon',
        model: 'EF 50mm F1.8',
        mount: 'EF',
        focalMm: 50,
        maxAperture: 1.8,
        createdAt: now,
      })
      .run()
  }
}
