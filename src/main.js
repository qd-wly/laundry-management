import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import 'vant/lib/index.css'
import './style.css'
import App from './App.vue'
import { initDB } from './db/index.js'
import { hydrateFromDesktopStorage } from './utils/desktopStorage.js'

const routes = [
  { path: '/', redirect: '/send' },
  { path: '/send', component: () => import('./views/Send.vue'), meta: { title: '送洗登记' } },
  { path: '/batches', component: () => import('./views/Batches.vue'), meta: { title: '批次列表' } },
  { path: '/batch/:id', component: () => import('./views/BatchDetail.vue'), meta: { title: '批次详情' } },
  { path: '/stats', component: () => import('./views/Stats.vue'), meta: { title: '统计查询' } },
  { path: '/settings', component: () => import('./views/Settings.vue'), meta: { title: '设置' } },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.afterEach(to => {
  document.title = `布草送洗管理 - ${to.meta?.title || '主页'}`
})

async function bootstrap() {
  await initDB()
  const result = await hydrateFromDesktopStorage()
  if (!result.success) {
    console.warn('[Laundry] desktop storage bootstrap skipped:', result.error)
  }

  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

bootstrap()
