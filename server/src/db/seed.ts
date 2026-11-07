#!/usr/bin/env tsx
/**
 * 建档数据库并写入码表与型号库。
 *
 *   pnpm db:seed          建表（若无）+ 码表 + 型号库
 *
 * 幂等：重复执行不会产生重复数据，个人层字段不会被覆盖。
 */
import { readFileSync } from 'node:fs'
import { config, dataDir } from '../config.js'
import { createDb, runMigrations } from './client.js'
import { seedCodebook } from './seed-codebook.js'
import { parseStocksTsv } from './stocks-tsv.js'
import { importStocks } from './import-stocks.js'

const dbPath = `${dataDir}/film-vault.db`

const db = createDb(dbPath)
runMigrations(db)
console.log('✓ 迁移已应用')

seedCodebook(db)
console.log('✓ 码表已写入')

const text = readFileSync(config.stocksTsv, 'utf8')
const { rows, errors } = parseStocksTsv(text)

if (errors.length > 0) {
  console.error(`✗ ${config.stocksTsv} 解析出错：`)
  for (const e of errors) console.error(`  第 ${e.line} 行：${e.message}`)
  process.exit(1)
}

const result = importStocks(db, rows)
console.log(
  `✓ 型号库：新增 ${result.inserted}，更新 ${result.updated}，系列 ${result.seriesInserted}`,
)
console.log(`  数据库：${dbPath}`)
