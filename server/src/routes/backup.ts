/**
 * 备份：打包 SQLite + uploads 成 zip 流式返回。
 *
 * SQLite 不能直接复制正在写入的文件，官方做法是先 checkpoint 再 `.backup`。
 * 单用户场景数据量小，直接在内存里生成 zip 即可。
 */
import type { FastifyPluginAsync } from 'fastify'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { dataDir, resolveStoragePath } from '../config.js'

/** 极简 zip 写入器：只支持 deflate 与方法 8，够打包用 */
interface ZipEntry {
  name: string
  data: Buffer
}

function crc32(buf: Buffer): number {
  let table = crcTable
  if (!table) {
    table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[i] = c >>> 0
    }
    crcTable = table
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

let crcTable: Uint32Array | null = null

function compress(data: Buffer): Buffer {
  return deflateRawSync(data, { level: 6 })
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const compressed = compress(entry.data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // 本地文件头签名
    local.writeUInt16LE(20, 4) // 版本
    local.writeUInt16LE(0, 6) // 标志
    local.writeUInt16LE(8, 8) // 方法：deflate
    local.writeUInt16LE(0, 10) // 时间
    local.writeUInt16LE(0, 12) // 日期
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)

    localParts.push(local, nameBuf, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)

    centralParts.push(central, nameBuf)
    offset += local.length + nameBuf.length + compressed.length
  }

  const centralBuf = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...localParts, centralBuf, end])
}

/** 递归收集目录下的文件 */
function collectFiles(dir: string, base = dir): ZipEntry[] {
  if (!existsSync(dir)) return []
  const out: ZipEntry[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...collectFiles(full, base))
    } else {
      out.push({ name: relative(base, full).split('\\').join('/'), data: readFileSync(full) })
    }
  }
  return out
}

export const backupRoutes: FastifyPluginAsync = async (app) => {
  app.get('/backup', async (_req, reply) => {
    const dbPath = resolveStoragePath('film-vault.db')
    if (!existsSync(dbPath)) {
      return reply.code(404).send({ error: '数据库不存在' })
    }

    // 先把 WAL checkpoint 进主库，保证复制出来的主库文件是完整的。
    // drizzle 在 better-sqlite3 驱动下用 $client 暴露底层连接，类型未导出，此处按其运行时形状断言。
    const sqlite = (app.db as unknown as { $client: { pragma: (s: string) => unknown } }).$client
    sqlite.pragma('wal_checkpoint(TRUNCATE)')

    const entries: ZipEntry[] = [
      { name: 'film-vault.db', data: readFileSync(dbPath) },
      // WAL 与 SHM 一并带上，恢复时更稳妥
      ...['film-vault.db-wal', 'film-vault.db-shm']
        .filter((f) => existsSync(resolveStoragePath(f)))
        .map((f) => ({ name: f, data: readFileSync(resolveStoragePath(f)) })),
      { name: 'README.txt', data: Buffer.from(backupReadme(), 'utf8') },
      ...collectFiles(join(dataDir, 'uploads')).map((e) => ({
        name: `uploads/${e.name}`,
        data: e.data,
      })),
    ]

    const zip = buildZip(entries)
    const stamp = new Date().toISOString().slice(0, 10)

    reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="film-vault-backup-${stamp}.zip"`)
    return zip
  })
}

function backupReadme(): string {
  return [
    'film-vault 备份',
    `导出时间：${new Date().toISOString()}`,
    '',
    '内容：',
    '  film-vault.db       SQLite 主库',
    '  film-vault.db-wal   写前日志（如有）',
    '  uploads/            附件目录（如有）',
    '',
    '恢复方法：',
    '  1. 停掉服务（docker compose stop app）',
    '  2. 把 film-vault.db 放回 storage/ 目录，移除旧的 -wal 与 -shm',
    '  3. 启动服务（docker compose start app）',
    '  启动时会自动应用缺失的迁移。',
    '',
  ].join('\n')
}
