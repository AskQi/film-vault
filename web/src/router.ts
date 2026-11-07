import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from './stores/session.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./pages/LoginPage.vue'), meta: { public: true } },
    { path: '/', name: 'home', component: () => import('./pages/HomePage.vue') },
    { path: '/stocks', name: 'stocks', component: () => import('./pages/StocksPage.vue') },
    { path: '/stocks/:id', name: 'stock-detail', component: () => import('./pages/StockDetailPage.vue') },
    { path: '/rolls', name: 'rolls', component: () => import('./pages/RollsPage.vue') },
    { path: '/rolls/:id', name: 'roll-detail', component: () => import('./pages/RollDetailPage.vue') },
    { path: '/scan', name: 'scan', component: () => import('./pages/ScanPage.vue') },
    { path: '/new', name: 'new-roll', component: () => import('./pages/NewRollPage.vue') },
    { path: '/labels', name: 'labels', component: () => import('./pages/LabelsPage.vue') },
    { path: '/stats', name: 'stats', component: () => import('./pages/StatsPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach(async (to) => {
  const session = useSessionStore()
  await session.ensureLoaded()

  if (!to.meta.public && !session.authenticated) {
    return { name: 'login', query: { next: to.fullPath } }
  }
  if (to.name === 'login' && session.authenticated) {
    return { name: 'home' }
  }
})

export default router
