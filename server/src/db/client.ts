/**
 * SQLite 连接。WAL 模式，单进程写入。
 * 数据库文件路径来自配置，默认 storage/film-vault.db。
 */
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import * as schema from './schema/index.js'
import { serverRoot } from '../config.js'

export type Db = BetterSQLite3Database<typeof schema>

/** server/drizzle/ 迁移目录 */
const MIGRATIONS_DIR = resolve(serverRoot, 'drizzle')

/** 打开数据库连接并设置 pragma。测试时传 ':memory:' 即可。 */
export function createDb(file: string): Db {
  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true })
  }

  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  return drizzle(sqlite, { schema })
}

/** 应用所有未执行的迁移。幂等。 */
export function runMigrations(db: Db) {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR })
}

