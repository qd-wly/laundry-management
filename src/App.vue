<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()

const tabs = [
  { name: '送洗', icon: 'edit', path: '/send' },
  { name: '批次', icon: 'bars', path: '/batches' },
  { name: '统计', icon: 'chart-trending-o', path: '/stats' },
  { name: '设置', icon: 'setting-o', path: '/settings' },
]

const active = computed({
  get() {
    const index = tabs.findIndex(tab => route.path.startsWith(tab.path))
    return index >= 0 ? index : 0
  },
  set(index) {
    router.push(tabs[index].path)
  },
})
</script>

<template>
  <div class="app-shell">
    <router-view />
  </div>
  <van-tabbar v-model="active" placeholder>
    <van-tabbar-item v-for="tab in tabs" :key="tab.name" :icon="tab.icon">
      {{ tab.name }}
    </van-tabbar-item>
  </van-tabbar>
</template>
