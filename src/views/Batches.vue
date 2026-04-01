<script setup>
defineOptions({ name: 'Batches' })
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { db } from '../db/index.js'
import { buildBatchCodeMap, getBatchDisplayLabel } from '../utils/batchDisplay.js'
import { computeBatchProgress, summarizeRecordStatus } from '../utils/recordStatus.js'

const router = useRouter()
const batches = ref([])
const records = ref([])
const staffList = ref([])

const activeFilter = ref('all')

onMounted(loadData)
onActivated(loadData)

async function loadData() {
  batches.value = await db.batches.orderBy('sendDate').reverse().toArray()
  records.value = await db.records.toArray()
  staffList.value = await db.staff.toArray()
}

const batchCodeMap = computed(() => buildBatchCodeMap(batches.value))

const batchCards = computed(() => {
  return batches.value.map(batch => {
    const batchRecords = records.value.filter(record => record.batchId === batch.id)
    const people = Array.from(
      new Set(
        batchRecords
          .map(record => staffList.value.find(staff => staff.id === record.staffId)?.name || '')
          .filter(Boolean)
      )
    )

    const summary = summarizeRecordStatus(batchRecords)
    const progress = computeBatchProgress(batchRecords)

    return {
      ...batch,
      progress,
      summary,
      batchCode: batchCodeMap.value.get(batch.id) || '',
      batchLabel: getBatchDisplayLabel(batch, batchCodeMap.value),
      totalItems: batchRecords.reduce((sum, record) => sum + record.quantity, 0),
      peopleText: people.join('、') || '未关联人员',
      peopleCount: people.length,
    }
  })
})

const overview = computed(() => ({
  total: batchCards.value.length,
  pending: batchCards.value.filter(item => item.progress.key === 'pending').length,
  processing: batchCards.value.filter(item => ['washing', 'received'].includes(item.progress.key)).length,
  completed: batchCards.value.filter(item => item.progress.key === 'completed').length,
}))

const filteredBatches = computed(() => {
  if (activeFilter.value === 'all') return batchCards.value
  if (activeFilter.value === 'pending') return batchCards.value.filter(item => item.progress.key === 'pending')
  if (activeFilter.value === 'processing') {
    return batchCards.value.filter(item => ['washing', 'received'].includes(item.progress.key))
  }
  return batchCards.value.filter(item => item.progress.key === 'completed')
})

function goDetail(batch) {
  router.push(`/batch/${batch.id}`)
}
</script>

<template>
  <div class="page">
    <div class="page-title">批次台账</div>

    <div class="section-stack">
      <div class="filter-row">
        <button type="button" class="filter-chip" :class="{ 'is-active': activeFilter === 'all' }" @click="activeFilter = 'all'">
          全部 <span class="filter-chip__count">{{ overview.total }}</span>
        </button>
        <button type="button" class="filter-chip" :class="{ 'is-active': activeFilter === 'pending' }" @click="activeFilter = 'pending'">
          待送洗 <span class="filter-chip__count">{{ overview.pending }}</span>
        </button>
        <button type="button" class="filter-chip" :class="{ 'is-active': activeFilter === 'processing' }" @click="activeFilter = 'processing'">
          处理中 <span class="filter-chip__count">{{ overview.processing }}</span>
        </button>
        <button type="button" class="filter-chip" :class="{ 'is-active': activeFilter === 'completed' }" @click="activeFilter = 'completed'">
          已完成 <span class="filter-chip__count">{{ overview.completed }}</span>
        </button>
      </div>

      <van-empty v-if="filteredBatches.length === 0" description="当前筛选下没有批次" />

      <div v-else class="batch-list">
        <article
          v-for="batch in filteredBatches"
          :key="batch.id"
          class="batch-card"
          @click="goDetail(batch)"
        >
          <div class="batch-card__head">
            <div>
              <div class="batch-card__title">{{ batch.batchLabel }}</div>
              <div class="batch-card__meta">{{ batch.peopleCount }} 人 · {{ batch.peopleText }}</div>
            </div>
            <van-tag :type="batch.progress.tag" round>{{ batch.progress.label }}</van-tag>
          </div>

          <van-progress :percentage="batch.progress.percent" :show-pivot="false" stroke-width="6" />

          <div class="batch-card__stats">
            <span>{{ batch.totalItems }} 件</span>
            <span v-if="batch.summary.pending">待送洗 {{ batch.summary.pending }}</span>
            <span v-if="batch.summary.washed">待领取 {{ batch.summary.washed }}</span>
            <span v-if="batch.summary.received">待发放 {{ batch.summary.received }}</span>
            <span v-if="batch.summary.distributed">已发放 {{ batch.summary.distributed }}</span>
          </div>

          <div v-if="batch.note" class="batch-card__note">{{ batch.note }}</div>
        </article>
      </div>
    </div>
  </div>
</template>
