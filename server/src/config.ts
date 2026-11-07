/**
 * 配置加载：环境变量优先，缺省值适合本地开发。
 * 生产由 docker-compose 注入 PIN 与 DATA_DIR。
 *
 * 本地开发时从仓库根目录的 .env 读取（docker-compose 直接注入环境变量，
 * 不依赖此文件）。用 Node 内置的 loadEnvFile，不引 dotenv 依赖。
 */
import { resolve, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { existsSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
/** server/ 目录（dev 时是 src/，build 后是 dist/，都上溯一层到 server/） */
const serverRoot = resolve(here, '..')

/** 仓库根目录 */
export const repoRoot = resolve(serverRoot, '..')

/**
 * 加载 .env。已存在的环境变量优先，不被文件覆盖
 * （Node 的 loadEnvFile 不覆盖已有值，符合 docker-compose 注入口径）。
 */
const envFile = resolve(repoRoot, '.env')
if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.length > 0 ? v : undefined
}

/**
 * 运行时数据目录：SQLite 库与 uploads。
 * 注意与 data/ 区分：data/ 是随仓库提交的型号库 seed 数据。
 */
export const dataDir = (() => {
  const raw = env('DATA_DIR') ?? resolve(repoRoot, 'storage')
  return isAbsolute(raw) ? raw : resolve(repoRoot, raw)
})()

/** 拼接数据目录下的路径 */
export function resolveStoragePath(...segments: string[]): string {
  return resolve(dataDir, ...segments)
}

export const config = {
  nodeEnv: env('NODE_ENV') ?? 'development',
  get isProd() {
    return this.nodeEnv === 'production'
  },
  host: env('HOST') ?? '0.0.0.0',
  port: Number(env('PORT') ?? 3300),

  dataDir,

  /** 单用户 PIN。生产环境必须显式设置。 */
  pin: env('PIN') ?? '1234',

  /** 会话 Cookie 名与有效期 */
  cookieName: 'fv_session',
  sessionMaxAgeSec: 60 * 60 * 24 * 30,

  /** seed 数据位置 */
  stocksTsv: resolve(repoRoot, 'data/film-stocks.tsv'),

  /** 前端构建产物（生产模式下由服务端托管） */
  webDist: resolve(repoRoot, 'web/dist'),
}

export function assertProdConfig() {
  if (!config.isProd) return
  const problems: string[] = []
  if (!env('PIN')) problems.push('生产环境必须设置 PIN 环境变量')
  if (env('PIN') === '1234') problems.push('生产环境的 PIN 不能使用默认值 1234')
  if (problems.length > 0) {
    throw new Error(`配置错误：\n- ${problems.join('\n- ')}`)
  }
}
