/**
 * 前端入口：只导出不依赖 zod 的常量与纯函数。
 * 前端从 '@film-vault/shared/client' 引入，避免把 zod（开发模式下约 2.3 MB）加载进手机页面。
 * 服务端继续用 '@film-vault/shared'，可以拿到完整的 Zod schema。
 */
export * from './constants.js'
export * from './roll-code.js'
export * from './enums.js'
