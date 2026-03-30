<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../db/index.js'

const router = useRouter()
const batches = ref([])
const records = ref([])
const staffList = ref([])
const activeTab = ref('all')

const statusMap = {
  washing: '待领取',
  received: '已领取',
  billed: '已开单',
}

const statusTagType = {
  washing: 'warning',
  received: 'success',
  billed: 'primary',
}

async function loadData() {
  batches.value = await db.batches.orderBy('sendDate').reverse().toArray()
  records.value = await db.records.toArray()
  staffList.value = await db.staff.toArray()
}

onMounted(loadData)
onActivated(loadData)

const overview = computed(() => ({
  total: batches.value.length,
  washing: batches.value.filter(item => item.status === 'washing').length,
  received: batches.value.filter(item => item.status === 'received').length,
  billed: batches.value.filter(item => item.status === 'billed').length,
}))

const displayedBatches = computed(() => {
  const batchList = activeTab.value === 'all'
    ? batches.value
    : batches.value.filter(item => item.status === activeTab.value)

  return batchList.map(batch => {
    const batchRecords = records.value.filter(record => record.batchId === batch.id)
    const people = Array.from(
      new Set(
        batchRecords
          .map(record => staffList.value.find(staff => staff.id === record.staffId)?.name || '')
          .filter(Boolean)
      )
    )

    return {
      ...batch,
      summary: {
        people: people.join('、') || '未命名人员',
        totalItems: batchRecords.reduce((sum, record) => sum + record.quantity, 0),
        recordCount: batchRecords.length,
      },
    }
  })
})

function goDetail(batch) {
  router.push(`/batch/${batch.id}`)
}
</script>

<template>
  <div class="page">
    <div class="page-title">批次列表</div>

    <section class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">全部批次</span>
        <strong>{{ overview.total }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">待领取</span>
        <strong>{{ overview.washing }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">已领取</span>
        <strong>{{ overview.received }}</strong>
      </article>
      <article class="summary-card">
        <span class="summary-label">已开单</span>
        <strong>{{ overview.billed }}</strong>
      </article>
    </section>

    <div class="section-stack">
      <van-tabs v-model:active="activeTab" shrink sticky>
        <van-tab title="全部" name="all" />
        <van-tab title="待领取" name="washing" />
        <van-tab title="已领取" name="received" />
        <van-tab title="已开单" name="billed" />
      </van-tabs>

      <van-empty v-if="displayedBatches.length === 0" description="暂无记录" style="padding: 64px 0" />

      <van-cell-group v-else inset>
        <van-cell
          v-for="batch in displayedBatches"
          :key="batch.id"
          is-link
          @click="goDetail(batch)"
        >
          <template #title>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
              <span>{{ batch.sendDate }}</span>
              <van-tag :type="statusTagType[batch.status]" size="medium">
                {{ statusMap[batch.status] }}
              </van-tag>
            </div>
          </template>
          <template #label>
            <div>{{ batch.summary.people }}</div>
            <div>{{ batch.summary.totalItems }} 件，{{ batch.summary.recordCount }} 条明细</div>
          </template>
        </van-cell>
      </van-cell-group>
    </div>
  </div>
</template>
