<script setup>
defineOptions({ name: 'Settings' })
import { onActivated, onMounted, ref } from 'vue'
import { showConfirmDialog, showFailToast, showSuccessToast, showToast } from 'vant'
import { db } from '../db/index.js'
import { exportToExcel } from '../utils/export.js'
import { exportBackupJson, importBackupJson } from '../utils/localData.js'
import { getStorageStatus, saveToDesktopStorage } from '../utils/desktopStorage.js'
import { devMode, enterDevMode, exitDevMode } from '../utils/devMode.js'

const syncing = ref(false)
const backupInput = ref(null)
const showStaffPopup = ref(false)
const departments = ref([])
const staffList = ref([])
const newStaffName = ref('')
const newStaffDeptId = ref(null)
const localStatus = ref({
  ok: false,
  savedAt: '',
  dataFile: '',
  error: '',
})

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

async function writeSnapshotNow() {
  await persistLocalDatabase('已写入桌面数据文件', '已保存在当前页面缓存')
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
    </div>

    <div class="section-stack">
      <div class="settings-group">
        <div class="settings-group__title">数据</div>
        <div class="settings-group__body">
          <button class="settings-row" :class="{ 'is-loading': syncing }" @click="writeSnapshotNow">
            <span class="settings-row__label">立即保存</span>
            <span class="settings-row__meta">{{ localStatus.savedAt ? `上次：${localStatus.savedAt}` : '尚未保存' }}</span>
            <van-icon name="arrow" size="14" class="settings-row__arrow" />
          </button>
          <button class="settings-row" @click="doExportAll">
            <span class="settings-row__label">导出 Excel</span>
            <van-icon name="arrow" size="14" class="settings-row__arrow" />
          </button>
          <button class="settings-row" @click="doExportBackup">
            <span class="settings-row__label">导出备份</span>
            <van-icon name="arrow" size="14" class="settings-row__arrow" />
          </button>
          <button class="settings-row" @click="chooseBackupFile">
            <span class="settings-row__label">导入备份</span>
            <van-icon name="arrow" size="14" class="settings-row__arrow" />
          </button>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group__title">开发模式</div>
        <div class="settings-group__body">
          <button class="settings-row" :class="{ 'is-active': devMode }" @click="toggleDevMode">
            <span class="settings-row__label">{{ devMode ? '开发模式运行中' : '进入开发模式' }}</span>
            <span class="settings-row__meta">{{ devMode ? '点击退出并恢复数据' : '操作不写入真实数据库' }}</span>
            <van-icon :name="devMode ? 'close' : 'arrow'" size="14" class="settings-row__arrow" />
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
  </div>
</template>
