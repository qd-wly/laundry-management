<script setup>
import { onMounted, ref } from 'vue'
import { showConfirmDialog, showFailToast, showSuccessToast, showToast } from 'vant'
import { db } from '../db/index.js'
import { exportToExcel } from '../utils/export.js'
import { getHistorySeedSummary, importHistorySeed } from '../utils/historyImport.js'
import { exportBackupJson, importBackupJson } from '../utils/localData.js'
import { getStorageStatus, saveToDesktopStorage } from '../utils/desktopStorage.js'

const syncing = ref(false)
const importingHistory = ref(false)
const marchHistorySummary = getHistorySeedSummary({ year: 2026, month: 3 })
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

async function doImportHistory() {
  try {
    await showConfirmDialog({
      title: '导入 2026 年 3 月',
      message: `将导入 ${marchHistorySummary.batchCount} 个历史批次，重复导入会按同一历史批次覆盖更新，是否继续？`,
    })

    importingHistory.value = true
    const result = await importHistorySeed({ year: 2026, month: 3 })
    importingHistory.value = false
    await loadBaseData()
    await persistLocalDatabase(
      `已导入 2026 年 3 月 ${result.importedBatchCount} 个批次`,
      `已导入 2026 年 3 月 ${result.importedBatchCount} 个批次到当前页面缓存`
    )
  } catch (error) {
    importingHistory.value = false
    if (error?.message) {
      showFailToast(error.message)
    }
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
    await showConfirmDialog({ title: '确认删除', message: '删除后将立即写入本地数据库文件。' })
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
</script>

<template>
  <div class="page">
    <div class="page-title">设置</div>

    <section class="hero-card">
      <div class="hero-grid">
        <div class="hero-metric">
          <span class="hero-label">运行模式</span>
          <strong>{{ localStatus.ok ? '桌面程序数据文件' : '当前页面缓存' }}</strong>
        </div>
        <div class="hero-metric">
          <span class="hero-label">最近写入</span>
          <strong>{{ localStatus.savedAt || '尚未写入' }}</strong>
        </div>
        <div class="hero-metric">
          <span class="hero-label">人员数量</span>
          <strong>{{ staffList.length }}</strong>
        </div>
      </div>
    </section>

    <div class="section-stack">
      <van-cell-group inset title="桌面存储">
        <van-cell title="数据库文件" :label="localStatus.dataFile || '当前不是桌面程序环境，尚未连接桌面数据文件'" />
        <van-cell title="状态说明" :label="localStatus.ok ? '当前修改会写入桌面程序使用的 JSON 数据文件。' : localStatus.error" />
        <van-cell title="立即写入桌面数据文件" is-link :loading="syncing" @click="writeSnapshotNow" />
      </van-cell-group>

      <van-cell-group inset title="数据管理">
        <van-cell title="导出全部 Excel" is-link @click="doExportAll" />
        <van-cell title="导出本地备份 JSON" is-link @click="doExportBackup" />
        <van-cell title="导入本地备份 JSON" is-link @click="chooseBackupFile" />
      </van-cell-group>

      <van-cell-group inset title="历史导入">
        <van-cell
          :title="`导入 2026 年 3 月历史记录（${marchHistorySummary.batchCount} 批）`"
          :label="`来源：原始 Markdown 记录，约 ${marchHistorySummary.itemRecordCount} 条物品明细`"
          is-link
          :loading="importingHistory"
          @click="doImportHistory"
        />
      </van-cell-group>

      <van-cell-group inset title="人员管理">
        <van-cell title="管理人员名单" is-link @click="openStaffManager" />
      </van-cell-group>
    </div>

    <input
      ref="backupInput"
      type="file"
      accept=".json,application/json"
      style="display: none"
      @change="onBackupFileChange"
    />

    <van-popup v-model:show="showStaffPopup" position="bottom" round :style="{ height: '82%' }" closeable>
      <div class="popup-sheet popup-sheet--tall">
        <div class="page-title">人员管理</div>

        <van-cell-group inset title="新增人员">
          <van-field v-model="newStaffName" label="姓名" placeholder="请输入姓名" />
          <van-cell title="所属部门">
            <template #right-icon>
              <select v-model="newStaffDeptId" class="touch-select">
                <option :value="null" disabled>选择部门</option>
                <option v-for="dept in departments" :key="dept.id" :value="dept.id">
                  {{ dept.name }}
                </option>
              </select>
            </template>
          </van-cell>
          <van-cell>
            <van-button size="small" type="primary" @click="addStaff">添加人员</van-button>
          </van-cell>
        </van-cell-group>

        <div v-for="dept in departments" :key="dept.id" style="margin-top: 12px">
          <van-cell-group inset :title="dept.name">
            <van-swipe-cell v-for="staff in getStaffByDept(dept.id)" :key="staff.id">
              <van-cell :title="staff.name" />
              <template #right>
                <van-button square type="danger" text="删除" style="height: 100%" @click="removeStaff(staff.id)" />
              </template>
            </van-swipe-cell>
            <van-cell v-if="getStaffByDept(dept.id).length === 0" title="暂无人员" />
          </van-cell-group>
        </div>
      </div>
    </van-popup>
  </div>
</template>
