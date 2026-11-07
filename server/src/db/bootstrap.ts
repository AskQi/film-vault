/**
 * 数据库初始化：迁移 + 码表 + 型号库 + 机身镜头预置。全部幂等。
 *
 * 服务启动时自动调用，所以生产镜像首次启动即有 139 条型号，不需要单独跑 seed。
 * 型号库导入只覆盖客观层，个人层（昵称、评价、注意事项等）不会被改动。
 */
import { readFileSync } from 'node:fs'
import { config } from '../config.js'
import { type Db, runMigrations } from './client.js'
import { seedCodebook } from './seed-codebook.js'
import { parseStocksTsv } from './stocks-tsv.js'
import { importStocks, type ImportResult } from './import-stocks.js'
import { seedCameras } from './seed-cameras.js'

export function bootstrapDb(db: Db): ImportResult {
  runMigrations(db)
  seedCodebook(db)

  const { rows, errors } = parseStocksTsv(readFileSync(config.stocksTsv, 'utf8'))
  if (errors.length > 0) {
    const detail = errors.map((e) => `  第 ${e.line} 行：${e.message}`).join('\n')
    throw new Error(`${config.stocksTsv} 解析出错：\n${detail}`)
  }

  const result = importStocks(db, rows)
  seedCameras(db)
  return result
}
