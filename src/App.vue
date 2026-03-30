<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const active = ref(0)

const tabs = [
  { name: '送洗', icon: 'edit', path: '/send' },
  { name: '批次', icon: 'bars', path: '/batches' },
  { name: '统计', icon: 'chart-trending-o', path: '/stats' },
  { name: '设置', icon: 'setting-o', path: '/settings' },
]

// 根据当前路由设置 tab
const currentPath = router.currentRoute.value.path
const idx = tabs.findIndex(t => currentPath.startsWith(t.path))
if (idx >= 0) active.value = idx

function onTabChange(index) {
  router.push(tabs[index].path)
}
</script>

<template>
  <router-view />
  <van-tabbar v-model="active" @change="onTabChange" placeholder>
    <van-tabbar-item v-for="tab in tabs" :key="tab.name" :icon="tab.icon">
      {{ tab.name }}
    </van-tabbar-item>
  </van-tabbar>
</template>
