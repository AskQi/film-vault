/**
 * 服务端打包：esbuild 打成单文件 ESM。
 * better-sqlite3 是原生模块，保持 external 由 node_modules 提供。
 */
import { build } from 'esbuild'
import { rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'dist/index.js',
  sourcemap: true,
  external: ['better-sqlite3'],
  conditions: ['node'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
})

console.log('✓ server 已打包到 dist/index.js')
