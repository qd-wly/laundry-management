<script setup>
import { ref, onMounted } from 'vue'
import { db } from '../db/index.js'
import { pushToGitHub, importFromGitHub } from '../utils/github.js'
import { exportToExcel } from '../utils/export.js'
import { showSuccessToast, showFailToast, showConfirmDialog, showToast } from 'vant'
import { getHistorySeedSummary, importHistorySeed } from '../utils/historyImport.js'

const githubRepo = ref('')
const githubToken = ref('')
const syncing = ref(false)
const importingHistory = ref(false)
const marchHistorySummary = getHistorySeedSummary({ year: 2026, month: 3 })

// 人员管理
const showStaffPopup = ref(false)
const departments = ref([])
const staffList = ref([])
const newStaffName = ref('')
const newStaffDeptId = ref(null)

onMounted(async () => {
  const repo = await db.settings.get('github_repo')
  const token = await db.settings.get('github_token')
  if (repo) githubRepo.value = repo.value
  if (token) githubToken.value = token.value

  departments.value = await db.departments.orderBy('sortOrder').toArray()
  staffList.value = await db.staff.toArray()
})

async function saveGitHub() {
  await db.settings.put({ key: 'github_repo', value: githubRepo.value })
  await db.settings.put({ key: 'github_token', value: githubToken.value })
  showSuccessToast('已保存')
}

async function syncToCloud() {
  syncing.value = true
  const result = await pushToGitHub()
  syncing.value = false
  if (result.success) {
    showSuccessToast('同步成功')
  } else {
    showFailToast(result.error || '同步失败')
  }
}

async function syncFromCloud() {
  try {
    await showConfirmDialog({ title: '确认', message: '将用云端数据覆盖本地，确定吗？' })
    syncing.value = true
    const result = await importFromGitHub()
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
    importingHistory.value = false
    staffList.value = await db.staff.toArray()
    showSuccessToast(`已导入 2026年3月 ${result.importedBatchCount} 个批次`)
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
  showSuccessToast('已添加')
}

async function removeStaff(id) {
  try {
    await showConfirmDialog({ title: '确认删除' })
    await db.staff.delete(id)
    staffList.value = await db.staff.toArray()
    showSuccessToast('已删除')
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

    <!-- GitHub 配置 -->
    <van-cell-group inset title="GitHub 同步">
      <van-field v-model="githubRepo" label="仓库" placeholder="如 qd-wly/laundry-management" />
      <van-field v-model="githubToken" label="Token" type="password" placeholder="Personal Access Token" />
      <van-cell>
        <van-button size="small" type="primary" @click="saveGitHub">保存配置</van-button>
      </van-cell>
    </van-cell-group>

    <!-- 数据操作 -->
    <van-cell-group inset title="数据管理" style="margin-top: 12px">
      <van-cell title="推送到云端" is-link :loading="syncing" @click="syncToCloud" />
      <van-cell title="从云端拉取" is-link @click="syncFromCloud" />
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
