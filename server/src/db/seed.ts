#!/usr/bin/env tsx
/**
 * 手动建库：迁移 + 码表 + 型号库 + 机身镜头预置。
 *
 *   pnpm db:seed
 *
 * 服务启动时会自动做同样的事，这个脚本用于不启动服务、只想初始化或刷新型号库时。
 * 幂等：重复执行不会产生重复数据，个人层字段不会被覆盖。
 */
import { dataDir } from '../config.js'
import { createDb } from './client.js'
import { bootstrapDb } from './bootstrap.js'

const dbPath = `${dataDir}/film-vault.db`
const result = bootstrapDb(createDb(dbPath))
console.log(
  `✓ 型号库：新增 ${result.inserted}，更新 ${result.updated}，系列 ${result.seriesInserted}，条码 ${result.barcodesBound}`,
)
console.log(`  数据库：${dbPath}`)
