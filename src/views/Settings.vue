<script setup>
defineOptions({ name: 'Settings' })
import { onActivated, onMounted, ref } from 'vue'
import { showConfirmDialog, showFailToast, showSuccessToast, showToast } from 'vant'
import { db } from '../db/index.js'
import { exportToExcel } from '../utils/export.js'
import { exportBackupJson, importBackupJson, replaceLocalSnapshot } from '../utils/localData.js'
import { getStorageStatus, saveToDesktopStorage } from '../utils/desktopStorage.js'
import { devMode, enterDevMode, exitDevMode } from '../utils/devMode.js'

const isFullScreen = ref(false)
const syncing = ref(false)
const githubSyncing = ref(false)
const showBackupList = ref(false)
const backupList = ref([])
const backupInput = ref(null)
const showStaffPopup = ref(false)
const showItemTypePopup = ref(false)
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])
const newStaffName = ref('')
const newStaffDeptId = ref(null)
const newItemName = ref('')
const newItemCategory = ref('personal')
const localStatus = ref({
  ok: false,
  savedAt: '',
  dataFile: '',
  error: '',
})

const categoryLabels = {
  personal: '个人衣物',
  bedding: '床上用品',
  banquet: '宴会布草',
}

onMounted(async () => {
  await loadBaseData()
  await refreshLocalStatus()
})

onActivated(async () => {
  await loadBaseData()
  await refreshLocalStatus()
})

async function loadBaseData() {
  departments.value = await db.departments.orderBy('sortOrder').toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.orderBy('sortOrder').toArray()
  if (window.laundryDesktop?.getFullScreen) {
    isFullScreen.value = await window.laundryDesktop.getFullScreen()
  }
}

async function toggleFullScreen() {
  const api = window.laundryDesktop
  if (!api?.setFullScreen) {
    showFailToast('仅桌面端支持全屏')
    return
  }
  const next = !isFullScreen.value
  await api.setFullScreen(next)
  isFullScreen.value = next
}

async function refreshLocalStatus() {
  const result = await getStorageStatus()
  if (result.success) {
    localStatus.value = {
      ok: true,
      savedAt: result.data?.savedAt || '',
      dataFile: result.data?.dataFile || '',
      error: '',
    }
    return
  }

  localStatus.value = {
    ok: false,
    savedAt: '',
    dataFile: '',
    error: result.error || '桌面存储未连接',
  }
}

async function persistLocalDatabase(successMessage, fallbackPrefix) {
  syncing.value = true
  const result = await saveToDesktopStorage()
  syncing.value = false
  await refreshLocalStatus()

  if (result.success) {
    showSuccessToast(successMessage)
    return true
  }

  showFailToast(`${fallbackPrefix}，${result.error || '未写入项目目录数据文件'}`)
  return false
}

async function openBackupList() {
  const api = window.laundryDesktop
  if (!api?.listBackups) { showFailToast('仅桌面端支持'); return }
  backupList.value = await api.listBackups()
  showBackupList.value = true
}

async function doRestoreBackup(backup) {
  const api = window.laundryDesktop
  if (!api?.restoreBackup) return
  try {
    await showConfirmDialog({
      title: '恢复历史数据',
      message: `确认恢复到 ${new Date(backup.time).toLocaleString('zh-CN')} 的备份？当前数据会先自动备份。`,
    })
    const result = await api.restoreBackup(backup.file)
    if (result.success && result.snapshot) {
      await replaceLocalSnapshot(result.snapshot)
      await loadBaseData()
      showBackupList.value = false
      showSuccessToast('数据已恢复')
    }
  } catch {}
}

async function writeSnapshotNow() {
  await persistLocalDatabase('已写入桌面数据文件', '已保存在当前页面缓存')
}

async function syncToGitHub() {
  if (devMode.value) {
    showFailToast('开发模式下不可同步')
    return
  }
  const api = window.laundryDesktop
  if (!api?.syncToGitHub) {
    showFailToast('仅桌面端支持此功能')
    return
  }

  githubSyncing.value = true
  try {
    await persistLocalDatabase('数据已保存', '保存失败')
    const result = await api.syncToGitHub()
    if (result.success) {
      showSuccessToast(result.message)
    } else {
      showFailToast(result.message)
    }
  } catch (error) {
    showFailToast(error.message || '同步失败')
  } finally {
    githubSyncing.value = false
  }
}

async function doExportAll() {
  await exportToExcel()
  showSuccessToast('Excel 已导出')
}

async function doExportBackup() {
  await exportBackupJson()
  showSuccessToast('JSON 备份已导出')
}

function chooseBackupFile() {
  backupInput.value?.click()
}

async function onBackupFileChange(event) {
  const file = event.target.files?.[0]
  if (!file) return

  try {
    const result = await importBackupJson(file)
    await loadBaseData()
    await persistLocalDatabase(
      `已导入备份，共 ${result.batchCount} 个批次`,
      `已导入备份，共 ${result.batchCount} 个批次到当前页面缓存`
    )
  } catch (error) {
    showFailToast(error.message || '导入本地备份失败')
  } finally {
    event.target.value = ''
  }
}

function openStaffManager() {
  showStaffPopup.value = true
}

async function addStaff() {
  if (!newStaffName.value || !newStaffDeptId.value) {
    showToast('请填写姓名并选择部门')
    return
  }

  await db.staff.add({
    name: newStaffName.value.trim(),
    departmentId: newStaffDeptId.value,
    isActive: true,
  })

  newStaffName.value = ''
  await loadBaseData()
  await persistLocalDatabase('人员已写入桌面数据文件', '人员已保存到当前页面缓存')
}

async function removeStaff(id) {
  try {
    await showConfirmDialog({ title: '确认删除', message: '删除后将立刻写入本地数据库文件。' })
    await db.staff.delete(id)
    await loadBaseData()
    await persistLocalDatabase('人员已从桌面数据文件删除', '人员已从当前页面缓存删除')
  } catch {
    // cancelled
  }
}

function getStaffByDept(deptId) {
  return staffList.value.filter(item => item.departmentId === deptId)
}

function getItemsByCategory(category) {
  return itemTypes.value.filter(item => item.category === category)
}

async function addItemType() {
  if (!newItemName.value.trim()) {
    showToast('请填写布草名称')
    return
  }

  const maxSort = itemTypes.value.reduce((max, item) => Math.max(max, item.sortOrder || 0), 0)
  await db.itemTypes.add({
    name: newItemName.value.trim(),
    category: newItemCategory.value,
    sortOrder: maxSort + 1,
  })

  newItemName.value = ''
  await loadBaseData()
  await persistLocalDatabase('布草种类已写入桌面数据文件', '布草种类已保存到当前页面缓存')
}

async function removeItemType(id) {
  try {
    const usedCount = await db.records.where('itemTypeId').equals(id).count()
    const message = usedCount > 0
      ? `该布草已有 ${usedCount} 条使用记录，删除后记录中的布草类型将无法显示。`
      : '删除后将立刻写入本地数据库文件。'
    await showConfirmDialog({ title: '确认删除', message })
    await db.itemTypes.delete(id)
    await loadBaseData()
    await persistLocalDatabase('布草种类已从桌面数据文件删除', '布草种类已从当前页面缓存删除')
  } catch {
    // cancelled
  }
}

async function toggleDevMode() {
  if (devMode.value) {
    try {
      await showConfirmDialog({
        title: '退出开发模式',
        message: '将恢复进入开发模式之前的全部数据，当前测试数据会被清除。',
      })
      await exitDevMode()
      showSuccessToast('已退出开发模式，数据已恢复')
    } catch {
      // cancelled
    }
  } else {
    try {
      await showConfirmDialog({
        title: '进入开发模式',
        message: '进入后，所有新建、删除、修改操作均不会写入真实数据文件，退出后将自动恢复原始数据。',
      })
      await enterDevMode()
      showSuccessToast('已进入开发模式')
    } catch {
      // cancelled
    }
  }
}
</script>

<template>
  <div class="page">
    <div class="page-title">系统设置</div>

    <div class="intake-bar" style="margin-bottom: 18px">
      <div class="intake-bar__cell">
        <span>数据状态</span>
        <strong>{{ localStatus.ok ? '正常' : '未连接' }}</strong>
      </div>
      <div class="intake-bar__cell">
        <span>人员</span>
        <strong>{{ staffList.length }} 人</strong>
      </div>
      <div class="intake-bar__cell">
        <span>布草</span>
        <strong>{{ itemTypes.length }} 种</strong>
      </div>
    </div>

    <div class="section-stack">
      <div class="settings-group">
        <div class="settings-group__title">数据</div>
        <div class="settings-group__body">
          <button class="settings-row" :class="{ 'is-loading': syncing }" @click="writeSnapshotNow">
            <span class="settings-row__label">立即保存</span>
            <span class="settings-row__meta">{{ localStatus.savedAt ? `上次：${localStatus.savedAt}` : '尚未保存' }}</span>
            <span class="settings-row__dot"></span>
          </button>
          <button class="settings-row" :class="{ 'is-loading': githubSyncing }" @click="syncToGitHub">
            <span class="settings-row__label">同步到 GitHub</span>
            <span class="settings-row__meta">{{ githubSyncing ? '同步中...' : '保存数据并推送到远程仓库' }}</span>
            <span class="settings-row__dot"></span>
          </button>
          <button class="settings-row" @click="doExportAll">
            <span class="settings-row__label">导出 Excel</span>
            <span class="settings-row__dot"></span>
          </button>
          <button class="settings-row" @click="doExportBackup">
            <span class="settings-row__label">导出备份</span>
            <span class="settings-row__dot"></span>
          </button>
          <button class="settings-row" @click="chooseBackupFile">
            <span class="settings-row__label">导入备份</span>
            <span class="settings-row__dot"></span>
          </button>
          <button class="settings-row" @click="openBackupList">
            <span class="settings-row__label">恢复历史数据</span>
            <span class="settings-row__meta">从自动备份中恢复</span>
            <van-icon name="arrow" size="14" class="settings-row__arrow" />
          </button>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group__title">显示</div>
        <div class="settings-group__body">
          <button class="settings-row" :class="{ 'is-active': isFullScreen }" @click="toggleFullScreen">
            <span class="settings-row__label">全屏显示</span>
            <span class="settings-row__meta">{{ isFullScreen ? '当前全屏，点击退出' : '点击进入全屏模式' }}</span>
            <span class="settings-row__dot"></span>
          </button>
        </div>
      </div>

      <div v-if="devMode" class="settings-group">
        <div class="settings-group__title">开发模式</div>
        <div class="settings-group__body">
          <button class="settings-row is-active" @click="toggleDevMode">
            <span class="settings-row__label">开发模式运行中</span>
            <span class="settings-row__meta">点击退出并恢复数据</span>
            <span class="settings-row__dot"></span>
          </button>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group__title">人员管理</div>
        <div class="settings-group__body">
          <button class="settings-row" @click="openStaffManager">
            <span class="settings-row__label">管理人员名单</span>
            <span class="settings-row__meta">{{ staffList.length }} 人</span>
            <van-icon name="arrow" size="14" class="settings-row__arrow" />
          </button>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group__title">布草管理</div>
        <div class="settings-group__body">
          <button class="settings-row" @click="showItemTypePopup = true">
            <span class="settings-row__label">管理布草种类</span>
            <span class="settings-row__meta">{{ itemTypes.length }} 种</span>
            <van-icon name="arrow" size="14" class="settings-row__arrow" />
          </button>
        </div>
      </div>
    </div>

    <input
      ref="backupInput"
      type="file"
      accept=".json,application/json"
      style="display: none"
      @change="onBackupFileChange"
    />

    <van-popup v-model:show="showStaffPopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showStaffPopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">人员管理</div>
        </div>

        <div class="form-card">
          <div class="form-card__title">新增人员</div>
          <input v-model="newStaffName" class="dark-input" placeholder="请输入姓名" />
          <select v-model="newStaffDeptId" class="touch-select" style="width: 100%">
            <option :value="null" disabled>选择部门</option>
            <option v-for="dept in departments" :key="dept.id" :value="dept.id">
              {{ dept.name }}
            </option>
          </select>
          <van-button size="small" type="primary" round @click="addStaff">添加人员</van-button>
        </div>

        <div v-for="dept in departments" :key="dept.id" class="staff-dept-group">
          <div class="staff-dept-group__title">{{ dept.name }}</div>
          <div class="staff-dept-group__list">
            <div v-for="staff in getStaffByDept(dept.id)" :key="staff.id" class="staff-item-row">
              <span>{{ staff.name }}</span>
              <van-button size="small" plain type="danger" round @click="removeStaff(staff.id)">删除</van-button>
            </div>
            <div v-if="getStaffByDept(dept.id).length === 0" class="staff-dept-empty">暂无人员</div>
          </div>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showItemTypePopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showItemTypePopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">布草管理</div>
        </div>

        <div class="form-card">
          <div class="form-card__title">新增布草</div>
          <input v-model="newItemName" class="dark-input" placeholder="请输入布草名称" />
          <select v-model="newItemCategory" class="touch-select" style="width: 100%">
            <option value="personal">个人衣物</option>
            <option value="bedding">床上用品</option>
            <option value="banquet">宴会布草</option>
          </select>
          <van-button size="small" type="primary" round @click="addItemType">添加布草</van-button>
        </div>

        <div v-for="cat in ['personal', 'bedding', 'banquet']" :key="cat" class="staff-dept-group">
          <div class="staff-dept-group__title">{{ categoryLabels[cat] }}</div>
          <div class="staff-dept-group__list">
            <div v-for="item in getItemsByCategory(cat)" :key="item.id" class="staff-item-row">
              <span>{{ item.name }}</span>
              <van-button size="small" plain type="danger" round @click="removeItemType(item.id)">删除</van-button>
            </div>
            <div v-if="getItemsByCategory(cat).length === 0" class="staff-dept-empty">暂无布草</div>
          </div>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showBackupList" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showBackupList = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">恢复历史数据</div>
        </div>

        <van-empty v-if="backupList.length === 0" description="暂无备份记录" />
        <div v-else class="backup-list">
          <article
            v-for="backup in backupList"
            :key="backup.file"
            class="backup-item"
            @click="doRestoreBackup(backup)"
          >
            <div class="backup-item__time">{{ new Date(backup.time).toLocaleString('zh-CN') }}</div>
            <div class="backup-item__meta">{{ backup.file }} · {{ (backup.size / 1024).toFixed(1) }} KB</div>
          </article>
        </div>
      </div>
    </van-popup>
  </div>
</template>
