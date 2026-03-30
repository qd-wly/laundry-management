<script setup>
import { ref, computed, onMounted } from 'vue'
import { db } from '../db/index.js'
import { exportToExcel } from '../utils/export.js'
import { showSuccessToast } from 'vant'

const batches = ref([])
const records = ref([])
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])

const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)

onMounted(async () => {
  batches.value = await db.batches.toArray()
  records.value = await db.records.toArray()
  departments.value = await db.departments.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.orderBy('sortOrder').toArray()
})

const filteredData = computed(() => {
  const prefix = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`
  const monthBatches = batches.value.filter(b => b.sendDate.startsWith(prefix))
  const batchIds = new Set(monthBatches.map(b => b.id))
  const monthRecords = records.value.filter(r => batchIds.has(r.batchId))

  // 按物品汇总
  const itemSummary = {}
  monthRecords.forEach(r => {
    const name = itemTypes.value.find(i => i.id === r.itemTypeId)?.name || '未知'
    itemSummary[name] = (itemSummary[name] || 0) + r.quantity
  })

  // 按部门汇总
  const deptSummary = {}
  monthRecords.forEach(r => {
    const name = departments.value.find(d => d.id === r.departmentId)?.name || '未知'
    deptSummary[name] = (deptSummary[name] || 0) + r.quantity
  })

  // 按人员汇总
  const staffSummary = {}
  monthRecords.forEach(r => {
    const name = staffList.value.find(s => s.id === r.staffId)?.name || '未知'
    staffSummary[name] = (staffSummary[name] || 0) + r.quantity
  })

  const totalItems = monthRecords.reduce((sum, r) => sum + r.quantity, 0)

  return {
    batchCount: monthBatches.length,
    totalItems,
    itemSummary: Object.entries(itemSummary).sort((a, b) => b[1] - a[1]),
    deptSummary: Object.entries(deptSummary).sort((a, b) => b[1] - a[1]),
    staffSummary: Object.entries(staffSummary).sort((a, b) => b[1] - a[1]),
  }
})

const years = computed(() => {
  const curr = new Date().getFullYear()
  return [curr - 1, curr, curr + 1]
})

async function doExport() {
  await exportToExcel(selectedYear.value, selectedMonth.value)
  showSuccessToast('导出成功')
}
</script>

<template>
  <div class="page">
    <div class="page-title">统计查询</div>

    <!-- 年月选择 -->
    <van-cell-group inset>
      <van-cell title="年份">
        <template #right-icon>
          <van-radio-group v-model="selectedYear" direction="horizontal">
            <van-radio v-for="y in years" :key="y" :name="y">{{ y }}</van-radio>
          </van-radio-group>
        </template>
      </van-cell>
      <van-cell title="月份">
        <template #right-icon>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; max-width: 200px; justify-content: flex-end">
            <van-tag
              v-for="m in 12"
              :key="m"
              :type="selectedMonth === m ? 'primary' : 'default'"
              size="medium"
              style="cursor: pointer"
              @click="selectedMonth = m"
            >
              {{ m }}月
            </van-tag>
          </div>
        </template>
      </van-cell>
    </van-cell-group>

    <!-- 概览 -->
    <van-cell-group inset title="概览" style="margin-top: 12px">
      <van-cell title="批次数" :value="filteredData.batchCount" />
      <van-cell title="总件数" :value="filteredData.totalItems" />
    </van-cell-group>

    <!-- 按物品 -->
    <van-cell-group v-if="filteredData.itemSummary.length > 0" inset title="物品统计" style="margin-top: 12px">
      <van-cell v-for="[name, count] in filteredData.itemSummary" :key="name" :title="name" :value="`${count} 件`" />
    </van-cell-group>

    <!-- 按部门 -->
    <van-cell-group v-if="filteredData.deptSummary.length > 0" inset title="部门统计" style="margin-top: 12px">
      <van-cell v-for="[name, count] in filteredData.deptSummary" :key="name" :title="name" :value="`${count} 件`" />
    </van-cell-group>

    <!-- 按人员 -->
    <van-cell-group v-if="filteredData.staffSummary.length > 0" inset title="人员统计" style="margin-top: 12px">
      <van-cell v-for="[name, count] in filteredData.staffSummary" :key="name" :title="name" :value="`${count} 件`" />
    </van-cell-group>

    <!-- 导出 -->
    <div style="margin: 16px">
      <van-button block plain type="primary" icon="down" @click="doExport">
        导出本月 Excel
      </van-button>
    </div>
  </div>
</template>
