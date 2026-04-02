<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showSuccessToast } from 'vant'
import { devMode } from './utils/devModeState.js'
import { enterDevMode, exitDevMode } from './utils/devMode.js'

const router = useRouter()
const route = useRoute()

const tabs = [
  { name: '流程中心', icon: 'todo-list-o', path: '/send' },
  { name: '批次台账', icon: 'bars', path: '/batches' },
  { name: '统计查询', icon: 'chart-trending-o', path: '/stats' },
  { name: '系统设置', icon: 'setting-o', path: '/settings' },
]

const activeTabPath = computed(() => {
  const match = tabs.find(tab => route.path.startsWith(tab.path))
  return match?.path || ''
})

let longPressTimer = null

function onTabDown(tab) {
  if (tab.path !== '/settings') return
  longPressTimer = setTimeout(async () => {
    longPressTimer = null
    try {
      if (devMode.value) {
        await showConfirmDialog({
          title: '退出开发模式',
          message: '退出后将恢复进入开发模式前的原始数据。',
        })
        await exitDevMode()
        showSuccessToast('已退出开发模式')
      } else {
        await showConfirmDialog({
          title: '进入开发模式',
          message: '进入后，所有操作均不会写入真实数据文件，退出后自动恢复原始数据。',
        })
        await enterDevMode()
        showSuccessToast('已进入开发模式')
      }
    } catch {}
  }, 800)
}

function onTabUp() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}
</script>

<template>
  <div v-if="devMode" class="dev-mode-banner">
    <van-icon name="warning-o" size="14" />
    开发模式 · 所有操作不写入真实数据库
  </div>
  <div v-if="devMode" class="dev-mode-spacer"></div>
  <div class="app-shell">
    <router-view v-slot="{ Component }">
      <keep-alive :include="['Send', 'Batches', 'Stats', 'Settings']">
        <component :is="Component" />
      </keep-alive>
    </router-view>
  </div>

  <div class="bottom-dock-wrap">
    <nav class="bottom-dock">
      <button
        v-for="tab in tabs"
        :key="tab.path"
        type="button"
        class="dock-tab"
        :class="{ 'is-active': activeTabPath === tab.path }"
        @click="router.push(tab.path)"
        @pointerdown="onTabDown(tab)"
        @pointerup="onTabUp"
        @pointerleave="onTabUp"
        @pointercancel="onTabUp"
        @contextmenu.prevent
      >
        <van-icon :name="tab.icon" size="20" />
        <span>{{ tab.name }}</span>
      </button>
    </nav>
  </div>
</template>
