<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'
import { showSuccessToast } from 'vant'
import { db } from '../db/index.js'
import { exportToExcel } from '../utils/export.js'

const batches = ref([])
const records = ref([])
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])

const selectedYear = ref(new Date().getFullYear())
const selectedMonth = ref(new Date().getMonth() + 1)

async function loadData() {
  batches.value = await db.batches.toArray()
  records.value = await db.records.toArray()
  departments.value = await db.departments.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.orderBy('sortOrder').toArray()
}

onMounted(loadData)
onActivated(loadData)

const filteredData = computed(() => {
  const prefix = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`
  const monthBatches = batches.value.filter(batch => batch.sendDate.startsWith(prefix))
  const batchIds = new Set(monthBatches.map(batch => batch.id))
  const monthRecords = records.value.filter(record => batchIds.has(record.batchId))

  const itemSummary = {}
  const deptSummary = {}
  const staffSummary = {}

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
    itemSummary: Object.entries(itemSummary).sort((a, b) => b[1] - a[1]),
    deptSummary: Object.entries(deptSummary).sort((a, b) => b[1] - a[1]),
    staffSummary: Object.entries(staffSummary).sort((a, b) => b[1] - a[1]),
  }
})

const years = computed(() => {
  const currentYear = new Date().getFullYear()
  return [currentYear - 1, currentYear, currentYear + 1]
})

async function doExport() {
  await exportToExcel(selectedYear.value, selectedMonth.value)
  showSuccessToast('本月 Excel 已导出')
}
</script>

<template>
  <div class="page">
    <div class="page-title">统计查询</div>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">当月批次</span>
        <strong>{{ filteredData.batchCount }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">当月总件数</span>
        <strong>{{ filteredData.totalItems }}</strong>
      </article>
    </section>

    <div class="section-stack">
      <van-cell-group inset>
        <van-cell title="年份">
          <template #right-icon>
            <van-radio-group v-model="selectedYear" direction="horizontal">
              <van-radio v-for="year in years" :key="year" :name="year">{{ year }}</van-radio>
            </van-radio-group>
          </template>
        </van-cell>
        <van-cell title="月份">
          <template #right-icon>
            <div class="month-picker">
              <van-tag
                v-for="month in 12"
                :key="month"
                :type="selectedMonth === month ? 'primary' : 'default'"
                size="medium"
                @click="selectedMonth = month"
              >
                {{ month }}月
              </van-tag>
            </div>
          </template>
        </van-cell>
      </van-cell-group>

      <van-cell-group v-if="filteredData.itemSummary.length > 0" inset title="物品统计">
        <van-cell
          v-for="[name, count] in filteredData.itemSummary"
          :key="name"
          :title="name"
          :value="`${count} 件`"
        />
      </van-cell-group>

      <van-cell-group v-if="filteredData.deptSummary.length > 0" inset title="部门统计">
        <van-cell
          v-for="[name, count] in filteredData.deptSummary"
          :key="name"
          :title="name"
          :value="`${count} 件`"
        />
      </van-cell-group>

      <van-cell-group v-if="filteredData.staffSummary.length > 0" inset title="人员统计">
        <van-cell
          v-for="[name, count] in filteredData.staffSummary"
          :key="name"
          :title="name"
          :value="`${count} 件`"
        />
      </van-cell-group>

      <van-empty
        v-if="filteredData.itemSummary.length === 0 && filteredData.deptSummary.length === 0 && filteredData.staffSummary.length === 0"
        description="当前月份暂无数据"
      />
    </div>

    <div class="bottom-actions">
      <van-button block plain type="primary" icon="down" @click="doExport">
        导出本月 Excel
      </van-button>
    </div>
  </div>
</template>
