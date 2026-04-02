<script setup>
defineOptions({ name: 'Stats' })
import { computed, onActivated, onMounted, ref } from 'vue'
import { showSuccessToast } from 'vant'
import { db } from '../db/index.js'
import { exportToExcel } from '../utils/export.js'
import { summarizeRecordStatus } from '../utils/recordStatus.js'

const batches = ref([])
const records = ref([])
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])

const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)

onMounted(loadData)
onActivated(loadData)

async function loadData() {
  batches.value = await db.batches.toArray()
  records.value = await db.records.toArray()
  departments.value = await db.departments.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.orderBy('sortOrder').toArray()
}

const filteredData = computed(() => {
  const prefix = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`
  const monthBatches = batches.value.filter(batch => batch.sendDate.startsWith(prefix))
  const batchIds = new Set(monthBatches.map(batch => batch.id))
  const monthRecords = records.value.filter(record => batchIds.has(record.batchId))

  const itemSummary = {}
  const deptSummary = {}
  const staffSummary = {}
  const statusSummary = summarizeRecordStatus(monthRecords)

  monthRecords.forEach(record => {
    const itemName = itemTypes.value.find(item => item.id === record.itemTypeId)?.name || '未知'
    const deptName = departments.value.find(dept => dept.id === record.departmentId)?.name || '未知'
    const staffName = staffList.value.find(staff => staff.id === record.staffId)?.name || '未知'

    itemSummary[itemName] = (itemSummary[itemName] || 0) + record.quantity
    deptSummary[deptName] = (deptSummary[deptName] || 0) + record.quantity
    staffSummary[staffName] = (staffSummary[staffName] || 0) + record.quantity
  })

  return {
    batchCount: monthBatches.length,
    totalItems: monthRecords.reduce((sum, record) => sum + record.quantity, 0),
    statusSummary,
    itemSummary: Object.entries(itemSummary).sort((a, b) => b[1] - a[1]),
    deptSummary: Object.entries(deptSummary).sort((a, b) => b[1] - a[1]),
    staffSummary: Object.entries(staffSummary).sort((a, b) => b[1] - a[1]),
  }
})

const years = computed(() => {
  const currentYear = new Date().getFullYear()
  return [currentYear]
})

const inactiveMonths = computed(() => {
  const s = new Set([1, 2])
  for (let m = 1; m <= 12; m++) {
    const prefix = `${selectedYear.value}-${String(m).padStart(2, '0')}`
    const has = batches.value.some(b => b.sendDate.startsWith(prefix))
    if (!has) s.add(m)
  }
  return s
})

async function doExport() {
  await exportToExcel(selectedYear.value, selectedMonth.value)
  showSuccessToast('Excel 已导出')
}
</script>

<template>
  <div class="page">
    <div class="page-title">统计查询</div>

    <div class="section-stack">
      <div class="stats-date-row">
        <div class="stats-year-group">
          <button
            v-for="year in years"
            :key="year"
            type="button"
            class="filter-chip"
            :class="{ 'is-active': selectedYear === year }"
            @click="selectedYear = year"
          >
            {{ year }}
          </button>
        </div>
        <div class="stats-month-group">
          <button
            v-for="month in 12"
            :key="month"
            type="button"
            class="month-chip"
            :class="{ 'month-chip--active': selectedMonth === month, 'month-chip--inactive': inactiveMonths.has(month) }"
            @click="selectedMonth = month"
          >
            {{ month }}月
          </button>
        </div>
      </div>

      <div class="intake-bar">
        <div class="intake-bar__cell">
          <span>批次 / 总件数</span>
          <strong>{{ filteredData.batchCount }} / {{ filteredData.totalItems }}</strong>
        </div>
        <div class="intake-bar__cell">
          <span>待送洗</span>
          <strong>{{ filteredData.statusSummary.pending }}</strong>
        </div>
        <div class="intake-bar__cell">
          <span>待取回</span>
          <strong>{{ filteredData.statusSummary.washed }}</strong>
        </div>
        <div class="intake-bar__cell">
          <span>待发放</span>
          <strong>{{ filteredData.statusSummary.received }}</strong>
        </div>
        <div class="intake-bar__cell">
          <span>已完成</span>
          <strong>{{ filteredData.statusSummary.distributed }}</strong>
        </div>
      </div>

      <template v-if="filteredData.itemSummary.length > 0 || filteredData.deptSummary.length > 0 || filteredData.staffSummary.length > 0">
        <div v-if="filteredData.itemSummary.length > 0" class="stat-group">
          <div class="stat-group__title">衣物</div>
          <div class="stat-group__list">
            <div v-for="[name, count] in filteredData.itemSummary" :key="name" class="stat-row">
              <span class="stat-row__name">{{ name }}</span>
              <span class="stat-row__value">{{ count }} 件</span>
            </div>
          </div>
        </div>

        <div v-if="filteredData.deptSummary.length > 0" class="stat-group">
          <div class="stat-group__title">部门</div>
          <div class="stat-group__list">
            <div v-for="[name, count] in filteredData.deptSummary" :key="name" class="stat-row">
              <span class="stat-row__name">{{ name }}</span>
              <span class="stat-row__value">{{ count }} 件</span>
            </div>
          </div>
        </div>

        <div v-if="filteredData.staffSummary.length > 0" class="stat-group">
          <div class="stat-group__title">人员</div>
          <div class="stat-group__list">
            <div v-for="[name, count] in filteredData.staffSummary" :key="name" class="stat-row">
              <span class="stat-row__name">{{ name }}</span>
              <span class="stat-row__value">{{ count }} 件</span>
            </div>
          </div>
        </div>
      </template>

      <van-empty v-else description="当前月份暂无数据" />
    </div>

  </div>
</template>
