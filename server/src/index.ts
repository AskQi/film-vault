/**
 * 服务端启动入口。
 *
 * 启动时自动应用迁移，保证容器首次启动即可用。
 */
import { buildApp } from './app.js'
import { assertProdConfig, config, resolveStoragePath } from './config.js'
import { createDb, runMigrations } from './db/client.js'

async function main() {
  assertProdConfig()

  const db = createDb(resolveStoragePath('film-vault.db'))
  runMigrations(db)

  const app = await buildApp({ db, logger: true })

  try {
    await app.listen({ host: config.host, port: config.port })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      app.log.info(`收到 ${signal}，正在关闭`)
      await app.close()
      process.exit(0)
    })
  }
}

main()
