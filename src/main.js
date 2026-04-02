import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import 'vant/lib/index.css'
import './style.css'
import App from './App.vue'
import { initDB, runPostHydrateMigrations } from './db/index.js'
import { hydrateFromDesktopStorage, saveToDesktopStorage } from './utils/desktopStorage.js'
import { autoRestoreIfNeeded } from './utils/devMode.js'

const Send = () => import('./views/Send.vue')
const Batches = () => import('./views/Batches.vue')
const BatchDetail = () => import('./views/BatchDetail.vue')
const Stats = () => import('./views/Stats.vue')
const Settings = () => import('./views/Settings.vue')

const routes = [
  { path: '/', redirect: '/send' },
  { path: '/send', component: Send, meta: { title: '流程中心', keepAlive: true } },
  { path: '/batches', component: Batches, meta: { title: '批次台账', keepAlive: true } },
  { path: '/batch/:id', component: BatchDetail, meta: { title: '批次详情', keepAlive: false } },
  { path: '/stats', component: Stats, meta: { title: '统计查询', keepAlive: true } },
  { path: '/settings', component: Settings, meta: { title: '系统设置', keepAlive: true } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.afterEach(to => {
  document.title = `布草送洗管理 - ${to.meta?.title || '首页'}`
})

async function bootstrap() {
  try {
    await initDB()
    const result = await hydrateFromDesktopStorage()
    if (!result.success) {
      console.warn('[Laundry] desktop storage bootstrap skipped:', result.error)
    }
    await runPostHydrateMigrations()
    await autoRestoreIfNeeded()
  } catch (e) {
    console.error('[Laundry] bootstrap error:', e?.message || e, e?.stack || '', JSON.stringify(e))
  }

  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

bootstrap()
