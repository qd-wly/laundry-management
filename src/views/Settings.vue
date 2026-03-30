<script setup>
import { ref, onMounted } from 'vue'
import { db } from '../db/index.js'
import {
  pushToServer,
  importFromServer,
  saveServerConfig,
  readServerSettings,
  checkServerHealth,
} from '../utils/serverSync.js'
import { exportToExcel } from '../utils/export.js'
import { showSuccessToast, showFailToast, showConfirmDialog, showToast } from 'vant'
import { getHistorySeedSummary, importHistorySeed } from '../utils/historyImport.js'

const serverBaseUrl = ref('')
const serverApiKey = ref('')
const syncing = ref(false)
const testingServer = ref(false)
const importingHistory = ref(false)
const marchHistorySummary = getHistorySeedSummary({ year: 2026, month: 3 })

// 人员管理
const showStaffPopup = ref(false)
const departments = ref([])
const staffList = ref([])
const newStaffName = ref('')
const newStaffDeptId = ref(null)

onMounted(async () => {
  const serverConfig = await readServerSettings()
  serverBaseUrl.value = serverConfig.baseUrl
  serverApiKey.value = serverConfig.apiKey

  departments.value = await db.departments.orderBy('sortOrder').toArray()
  staffList.value = await db.staff.toArray()
})

async function syncAfterMutation(successMessage, fallbackMessage) {
  const result = await pushToServer()
  if (result.success) {
    showSuccessToast(successMessage)
    return true
  }

  showFailToast(`${fallbackMessage}，${result.error || '服务器同步失败'}`)
  return false
}

async function saveServerSettingsAction() {
  await saveServerConfig({
    baseUrl: serverBaseUrl.value,
    apiKey: serverApiKey.value,
  })
  showSuccessToast('服务器配置已保存')
}

async function testServer() {
  testingServer.value = true
  const result = await checkServerHealth(serverBaseUrl.value)
  testingServer.value = false

  if (result.success) {
    showSuccessToast('服务器连接正常')
  } else {
    showFailToast(result.error || '服务器连接失败')
  }
}

async function syncToCloud() {
  syncing.value = true
  const result = await pushToServer()
  syncing.value = false
  if (result.success) {
    showSuccessToast('已推送到服务器')
  } else {
    showFailToast(result.error || '同步失败')
  }
}

async function syncFromCloud() {
  try {
    await showConfirmDialog({ title: '确认', message: '将用服务器数据覆盖本地，确定吗？' })
    syncing.value = true
    const result = await importFromServer()
    syncing.value = false
    if (result.success) {
      showSuccessToast(result.message || '导入成功')
      staffList.value = await db.staff.toArray()
    } else {
      showFailToast(result.error || '导入失败')
    }
  } catch {
    // cancelled
  }
}

async function doExportAll() {
  await exportToExcel()
  showSuccessToast('导出成功')
}

async function doImportHistory() {
  try {
    await showConfirmDialog({
      title: '导入 2026年3月',
      message: `将导入 2026 年 3 月的 ${marchHistorySummary.batchCount} 个历史批次，重复导入会按同一历史批次覆盖更新，继续吗？`,
    })

    importingHistory.value = true
    const result = await importHistorySeed({ year: 2026, month: 3 })
    staffList.value = await db.staff.toArray()
    await syncAfterMutation(
      `已导入 2026年3月 ${result.importedBatchCount} 个批次，并同步到服务器`,
      `已导入 2026年3月 ${result.importedBatchCount} 个批次到本地`
    )
    importingHistory.value = false
  } catch (error) {
    importingHistory.value = false
    if (error?.message) {
      showFailToast(error.message)
    }
  }
}

// 人员管理
function openStaffManager() {
  showStaffPopup.value = true
}

async function addStaff() {
  if (!newStaffName.value || !newStaffDeptId.value) {
    showToast('请填写姓名并选择部门')
    return
  }
  await db.staff.add({
    name: newStaffName.value,
    departmentId: newStaffDeptId.value,
    isActive: true,
  })
  staffList.value = await db.staff.toArray()
  newStaffName.value = ''
  await syncAfterMutation('已添加人员并同步到服务器', '已添加人员到本地')
}

async function removeStaff(id) {
  try {
    await showConfirmDialog({ title: '确认删除' })
    await db.staff.delete(id)
    staffList.value = await db.staff.toArray()
    await syncAfterMutation('已删除人员并同步到服务器', '已删除人员到本地')
  } catch {
    // cancelled
  }
}

function getDeptName(deptId) {
  return departments.value.find(d => d.id === deptId)?.name || ''
}

function getStaffByDept(deptId) {
  return staffList.value.filter(s => s.departmentId === deptId)
}
</script>

<template>
  <div class="page">
    <div class="page-title">设置</div>

    <!-- 服务器配置 -->
    <van-cell-group inset title="阿里云服务器同步">
      <van-field v-model="serverBaseUrl" label="服务器地址" placeholder="如 https://your-domain.com" />
      <van-field v-model="serverApiKey" label="访问密钥" type="password" placeholder="请输入服务器密钥" />
      <van-cell>
        <van-space>
          <van-button size="small" type="primary" @click="saveServerSettingsAction">保存配置</van-button>
          <van-button size="small" plain type="primary" :loading="testingServer" @click="testServer">测试连接</van-button>
        </van-space>
      </van-cell>
    </van-cell-group>

    <!-- 数据操作 -->
    <van-cell-group inset title="数据管理" style="margin-top: 12px">
      <van-cell title="推送到服务器" is-link :loading="syncing" @click="syncToCloud" />
      <van-cell title="从服务器拉取" is-link @click="syncFromCloud" />
      <van-cell title="导出全部 Excel" is-link @click="doExportAll" />
    </van-cell-group>

    <van-cell-group inset title="历史导入" style="margin-top: 12px">
      <van-cell
        :title="`导入 2026年3月历史记录（${marchHistorySummary.batchCount}批）`"
        :label="`来源：原始Markdown记录，约${marchHistorySummary.itemRecordCount}条物品明细`"
        is-link
        :loading="importingHistory"
        @click="doImportHistory"
      />
    </van-cell-group>

    <!-- 人员管理 -->
    <van-cell-group inset title="人员管理" style="margin-top: 12px">
      <van-cell title="管理人员名单" is-link @click="openStaffManager" />
    </van-cell-group>

    <van-popup v-model:show="showStaffPopup" position="bottom" round :style="{ height: '80%' }" closeable>
      <div style="padding: 16px; padding-top: 40px">
        <div class="page-title">人员管理</div>

        <!-- 添加人员 -->
        <van-cell-group inset title="添加人员">
          <van-field v-model="newStaffName" label="姓名" placeholder="请输入姓名" />
          <van-cell title="部门">
            <template #right-icon>
              <select v-model="newStaffDeptId" style="border: 1px solid #eee; padding: 4px 8px; border-radius: 4px">
                <option :value="null" disabled>选择部门</option>
                <option v-for="dept in departments" :key="dept.id" :value="dept.id">{{ dept.name }}</option>
              </select>
            </template>
          </van-cell>
          <van-cell>
            <van-button size="small" type="primary" @click="addStaff">添加</van-button>
          </van-cell>
        </van-cell-group>

        <!-- 现有人员列表 -->
        <div v-for="dept in departments" :key="dept.id" style="margin-top: 12px">
          <van-cell-group inset :title="dept.name">
            <van-swipe-cell v-for="s in getStaffByDept(dept.id)" :key="s.id">
              <van-cell :title="s.name" />
              <template #right>
                <van-button square type="danger" text="删除" style="height: 100%" @click="removeStaff(s.id)" />
              </template>
            </van-swipe-cell>
            <van-cell v-if="getStaffByDept(dept.id).length === 0" title="暂无人员" />
          </van-cell-group>
        </div>
      </div>
    </van-popup>
  </div>
</template>
