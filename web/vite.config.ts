import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // 单用户私用站点，不需要 PWA 引导弹窗
      injectRegister: 'auto',
      manifest: {
        name: '胶片库',
        short_name: '胶片库',
        description: '个人胶卷管理',
        lang: 'zh-CN',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 页面与静态资源预缓存；接口一律走网络，不做离线缓存
        // 用户明确接受断网后补录，不需要离线同步引擎
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    // 开发时把 /api 转发到 Fastify，避免跨域与 Cookie 问题
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3300',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
