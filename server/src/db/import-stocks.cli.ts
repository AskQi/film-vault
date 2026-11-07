#!/usr/bin/env tsx
/**
 * 手工触发型号库导入（等价于 db:seed 中的型号部分）。
 *   pnpm db:import-stocks
 */
import { readFileSync } from 'node:fs'
import { config, dataDir } from '../config.js'
import { createDb } from './client.js'
import { parseStocksTsv } from './stocks-tsv.js'
import { importStocks } from './import-stocks.js'

const db = createDb(`${dataDir}/film-vault.db`)
const { rows, errors } = parseStocksTsv(readFileSync(config.stocksTsv, 'utf8'))

if (errors.length > 0) {
  console.error(`✗ 解析出错：`)
  for (const e of errors) console.error(`  第 ${e.line} 行：${e.message}`)
  process.exit(1)
}

const result = importStocks(db, rows)
console.log(`✓ 型号库：新增 ${result.inserted}，更新 ${result.updated}，系列 ${result.seriesInserted}`)
