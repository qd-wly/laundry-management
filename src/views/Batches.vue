<script setup>
import { ref, computed, onActivated, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../db/index.js'

const router = useRouter()
const batches = ref([])
const records = ref([])
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])
const activeTab = ref('all')

const statusMap = { washing: '待领取', received: '已领取', billed: '已开单' }
const statusTagType = { washing: 'warning', received: 'success', billed: 'primary' }

async function loadData() {
  batches.value = await db.batches.orderBy('sendDate').reverse().toArray()
  records.value = await db.records.toArray()
  departments.value = await db.departments.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.toArray()
}

onMounted(loadData)

const filteredBatches = computed(() => {
  if (activeTab.value === 'all') return batches.value
  return batches.value.filter(b => b.status === activeTab.value)
})

function getBatchSummary(batch) {
  const batchRecords = records.value.filter(r => r.batchId === batch.id)
  const deptMap = Object.fromEntries(departments.value.map(d => [d.id, d.name]))
  const staffMap = Object.fromEntries(staffList.value.map(s => [s.id, s.name]))
  const itemMap = Object.fromEntries(itemTypes.value.map(i => [i.id, i.name]))

  const people = new Set()
  let totalItems = 0

  batchRecords.forEach(r => {
    const name = staffMap[r.staffId]
    if (name) people.add(name)
    totalItems += r.quantity
  })

  return {
    people: Array.from(people).join('、'),
    totalItems,
    recordCount: batchRecords.length,
  }
}

function goDetail(batch) {
  router.push(`/batch/${batch.id}`)
}
</script>

<template>
  <div class="page">
    <div class="page-title">批次列表</div>

    <van-tabs v-model:active="activeTab" shrink sticky>
      <van-tab title="全部" name="all" />
      <van-tab title="待领取" name="washing" />
      <van-tab title="已领取" name="received" />
      <van-tab title="已开单" name="billed" />
    </van-tabs>

    <div v-if="filteredBatches.length === 0" style="text-align: center; color: #999; padding: 40px">
      暂无记录
    </div>

    <van-cell-group v-else inset style="margin-top: 12px">
      <van-cell
        v-for="batch in filteredBatches"
        :key="batch.id"
        is-link
        @click="goDetail(batch)"
      >
        <template #title>
          <div style="display: flex; align-items: center; gap: 8px">
            <span>{{ batch.sendDate }}</span>
            <van-tag :type="statusTagType[batch.status]" size="medium">
              {{ statusMap[batch.status] }}
            </van-tag>
          </div>
        </template>
        <template #label>
          <div>{{ getBatchSummary(batch).people }}</div>
          <div>共 {{ getBatchSummary(batch).totalItems }} 件</div>
        </template>
      </van-cell>
    </van-cell-group>
  </div>
</template>
