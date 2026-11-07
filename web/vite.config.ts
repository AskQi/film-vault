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
    // 开发期经 nginx 用域名访问本机 dev server（HTTPS 下才能调摄像头与定位）。
    // Vite 默认拒绝非 localhost 的 Host，这里只放行这一个域名，不用 true 全开
    allowedHosts: ['film.ddns.sharepeople.cn'],
    // 经 nginx 用域名访问时，浏览器看到的是 wss://域名:8443，不是 localhost:5173。
    // 不告诉 Vite 的话，HMR 会回落去连手机自己的 localhost，连不上就反复轮询并整页刷新，
    // 刷新若恰好打断登录后的跳转，按钮就会停在「登录中…」。
    // 只在设置了 VITE_HMR_HOST 时生效，本机 localhost 开发不受影响。
    hmr: process.env.VITE_HMR_HOST
      ? {
          host: process.env.VITE_HMR_HOST,
          clientPort: Number(process.env.VITE_HMR_PORT ?? 443),
          protocol: 'wss',
        }
      : undefined,
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
