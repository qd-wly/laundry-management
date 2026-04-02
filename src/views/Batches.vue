<script setup>
defineOptions({ name: 'Batches' })
import { computed, nextTick, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showSuccessToast, showFailToast } from 'vant'
import { db } from '../db/index.js'
import { buildBatchCodeMap, getBatchDisplayLabel } from '../utils/batchDisplay.js'
import { computeBatchProgress, summarizeRecordStatus } from '../utils/recordStatus.js'
import { saveToDesktopStorage } from '../utils/desktopStorage.js'
import { fireConfetti } from '../utils/confetti.js'

const router = useRouter()
const batches = ref([])
const records = ref([])
const staffList = ref([])
const itemTypes = ref([])

const activeTab = ref('batch')
const activeFilter = ref('all')
const expandedDeliveryId = ref(new Set())
const expandedPickupId = ref(new Set())

const showLedgerDetail = ref(false)
const ledgerDetailData = ref(null)
const showPhotoViewer = ref(false)
const viewerPhoto = ref('')

function openPhotoViewer(src) {
  viewerPhoto.value = src
  showPhotoViewer.value = true
}

const showSignPopup = ref(false)
const signTarget = ref(null) // { type: 'delivery'|'pickup', id, recordIds }
const signCanvasRef = ref(null)
const signHasStroke = ref(false)
const signNoSign = ref(false)
let signCtx = null

onMounted(loadData)
onActivated(loadData)

const priceTablesData = ref([])

async function loadData() {
  batches.value = await db.batches.orderBy('sendDate').reverse().toArray()
  records.value = await db.records.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.toArray()
  priceTablesData.value = await db.priceTables.toArray()
}

const itemTypeMap = computed(() => new Map(itemTypes.value.map(t => [t.id, t.name])))
const priceTableMap = computed(() => new Map(priceTablesData.value.map(pt => [pt.id, pt])))

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

const batchesByDate = computed(() => {
  const map = new Map()
  filteredBatches.value.forEach(batch => {
    const date = batch.sendDate || '未知日期'
    if (!map.has(date)) map.set(date, [])
    map.get(date).push(batch)
  })
  return Array.from(map.entries()).map(([date, batches]) => ({ date, batches }))
})

function formatPreciseTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  if (isNaN(d)) return isoStr
  return d.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
}

function goDetail(batch) {
  router.push(`/batch/${batch.id}`)
}

function openLedgerDetail(group, type) {
  const staffMap = new Map(staffList.value.map(s => [s.id, s.name]))
  const deptMap = new Map()
  // Build dept lookup from batches+records
  const batchMap = new Map(batches.value.map(b => [b.id, b]))

  // Count per-person per-itemType to determine showPieceNo
  const personTypeCounts = new Map()
  group.items.forEach(r => {
    const key = `${r.staffId}-${r.itemTypeId}`
    personTypeCounts.set(key, (personTypeCounts.get(key) || 0) + 1)
  })

  const enriched = group.items.map(r => {
    const batch = batchMap.get(r.batchId)
    const sameTypeCount = personTypeCounts.get(`${r.staffId}-${r.itemTypeId}`) || 0
    return {
      ...r,
      itemName: itemTypeMap.value.get(r.itemTypeId) || '未知',
      staffName: staffMap.get(r.staffId) || '未知',
      batchLabel: batch ? (batchCodeMap.value.get(r.batchId) ? `${batch.sendDate}(${batchCodeMap.value.get(r.batchId)})` : batch.sendDate) : '',
      showPieceNo: sameTypeCount > 1 && !!r.pieceNo,
    }
  })

  const typeLabels = { delivery: '送洗', pickup: '领取', distribution: '发放' }

  ledgerDetailData.value = {
    id: group.id,
    type,
    typeLabel: typeLabels[type] || type,
    date: group.date,
    preciseTime: formatPreciseTime(group.time),
    totalQty: group.totalQty,
    signed: group.signed,
    signature: group.signature,
    priceTableName: getGroupPriceTableName(group.items),
    items: enriched,
  }
  showLedgerDetail.value = true
}

function openSignPage(type, group) {
  signTarget.value = { type, id: group.id, recordIds: group.recordIds }
  signNoSign.value = false
  signHasStroke.value = false
  showSignPopup.value = true
}

function onSignPopupOpen() {
  nextTick(() => initSignCanvas())
}

function initSignCanvas() {
  const canvas = signCanvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * ratio))
  canvas.height = Math.max(1, Math.floor(rect.height * ratio))
  signCtx = canvas.getContext('2d')
  if (!signCtx) return
  signCtx.scale(ratio, ratio)
  signCtx.lineCap = 'round'
  signCtx.lineJoin = 'round'
  signCtx.lineWidth = 2.6
  signCtx.strokeStyle = '#edf2f7'
  signCtx.fillStyle = 'rgba(18, 26, 35, 1)'
  signCtx.fillRect(0, 0, rect.width, rect.height)
  drawSignWatermark(signCtx, rect.width, rect.height)
  signHasStroke.value = false
}

function drawSignWatermark(ctx, w, h) {
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
  ctx.font = '28px "Microsoft YaHei UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('签字区', w / 2, h / 2)
  ctx.restore()
}

function startSign(e) {
  if (!signCtx) return
  e.preventDefault()
  const rect = signCanvasRef.value.getBoundingClientRect()
  signCtx.beginPath()
  signCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  signCanvasRef.value.setPointerCapture(e.pointerId)
}

function moveSign(e) {
  if (!signCtx || e.buttons === 0) return
  e.preventDefault()
  const rect = signCanvasRef.value.getBoundingClientRect()
  signCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
  signCtx.stroke()
  signHasStroke.value = true
}

function endSign() {
  if (signCtx) signCtx.closePath()
}

function clearSign() {
  signNoSign.value = false
  nextTick(() => initSignCanvas())
}

function markNoSign() {
  signNoSign.value = true
  signHasStroke.value = false
}

async function confirmSign() {
  if (!signHasStroke.value && !signNoSign.value) {
    showFailToast('请先签字或选择无签字')
    return
  }
  const sigData = signNoSign.value ? 'NO_SIGNATURE' : signCanvasRef.value.toDataURL('image/png')
  const target = signTarget.value
  if (!target) return

  const field = target.type === 'delivery' ? 'deliverySignature' : 'pickupSignature'
  const timeField = target.type === 'delivery' ? 'deliverySignedAt' : 'pickupSignedAt'
  const now = new Date().toISOString()

  await db.records.where('id').anyOf(target.recordIds).modify(record => {
    record[field] = sigData
    record[timeField] = now
  })

  await saveToDesktopStorage()
  await loadData()
  showSignPopup.value = false
  fireConfetti()
}

function calcGroupAmount(items) {
  let total = 0
  items.forEach(r => {
    const pt = priceTableMap.value.get(r.priceTableId)
    if (!pt?.prices) return
    const name = itemTypeMap.value.get(r.itemTypeId) || ''
    const price = pt.prices[name] || 0
    total += price * r.quantity
  })
  return total
}

function getGroupPriceTableName(items) {
  const ptId = items[0]?.priceTableId
  if (!ptId) return ''
  return priceTableMap.value.get(ptId)?.name || ''
}

// 送洗台账：按 deliveryId 分组
const deliveryGroups = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    if (!r.deliveryId) return
    if (!map.has(r.deliveryId)) {
      map.set(r.deliveryId, { id: r.deliveryId, date: r.sentAt || '', time: r.deliverySignedAt || '', items: [] })
    }
    map.get(r.deliveryId).items.push(r)
  })
  return Array.from(map.values())
    .sort((a, b) => b.id.localeCompare(a.id))
    .map(group => {
      const merged = new Map()
      group.items.forEach(r => {
        const name = itemTypeMap.value.get(r.itemTypeId) || '未知'
        merged.set(name, (merged.get(name) || 0) + r.quantity)
      })
      const hasSig = group.items.some(r => r.deliverySignature)
      return {
        ...group,
        totalQty: group.items.reduce((s, r) => s + r.quantity, 0),
        mergedItems: Array.from(merged.entries()).map(([name, qty]) => ({ name, qty })),
        signed: hasSig,
        signature: hasSig ? group.items.find(r => r.deliverySignature)?.deliverySignature : null,
        recordIds: group.items.map(r => r.id),
        priceTableName: getGroupPriceTableName(group.items),
        amount: calcGroupAmount(group.items),
      }
    })
})

// 领取台账：按 pickupId 分组
const pickupGroups = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    if (!r.pickupId) return
    if (!map.has(r.pickupId)) {
      map.set(r.pickupId, { id: r.pickupId, date: r.receivedAt || '', time: r.pickupSignedAt || '', items: [] })
    }
    map.get(r.pickupId).items.push(r)
  })
  return Array.from(map.values())
    .sort((a, b) => b.id.localeCompare(a.id))
    .map(group => {
      const merged = new Map()
      group.items.forEach(r => {
        const name = itemTypeMap.value.get(r.itemTypeId) || '未知'
        merged.set(name, (merged.get(name) || 0) + r.quantity)
      })
      const hasSig = group.items.some(r => r.pickupSignature)
      return {
        ...group,
        totalQty: group.items.reduce((s, r) => s + r.quantity, 0),
        mergedItems: Array.from(merged.entries()).map(([name, qty]) => ({ name, qty })),
        signed: hasSig,
        signature: hasSig ? group.items.find(r => r.pickupSignature)?.pickupSignature : null,
        recordIds: group.items.map(r => r.id),
        priceTableName: getGroupPriceTableName(group.items),
        amount: calcGroupAmount(group.items),
      }
    })
})

// 发放台账：按 distributionId 分组
const distributionGroups = computed(() => {
  const map = new Map()
  records.value.forEach(r => {
    if (!r.distributionId) return
    if (!map.has(r.distributionId)) {
      map.set(r.distributionId, { id: r.distributionId, date: r.distributedAt || '', time: r.distributionSignedAt || '', items: [] })
    }
    map.get(r.distributionId).items.push(r)
  })
  return Array.from(map.values())
    .sort((a, b) => b.id.localeCompare(a.id))
    .map(group => {
      const merged = new Map()
      group.items.forEach(r => {
        const name = itemTypeMap.value.get(r.itemTypeId) || '未知'
        merged.set(name, (merged.get(name) || 0) + r.quantity)
      })
      const hasSig = group.items.some(r => r.distributionSignature)
      return {
        ...group,
        totalQty: group.items.reduce((s, r) => s + r.quantity, 0),
        mergedItems: Array.from(merged.entries()).map(([name, qty]) => ({ name, qty })),
        signed: hasSig,
        signature: hasSig ? group.items.find(r => r.distributionSignature)?.distributionSignature : null,
        recordIds: group.items.map(r => r.id),
      }
    })
})

const expandedDistributionId = ref(new Set())

function groupByDate(groups) {
  const map = new Map()
  groups.forEach(g => {
    const date = g.date || '未知日期'
    if (!map.has(date)) map.set(date, [])
    map.get(date).push(g)
  })
  return Array.from(map.entries())
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

const deliveryByDate = computed(() => groupByDate(deliveryGroups.value))
const pickupByDate = computed(() => groupByDate(pickupGroups.value))
const distributionByDate = computed(() => groupByDate(distributionGroups.value))

function toggleDistributionExpand(id) {
  const s = new Set(expandedDistributionId.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedDistributionId.value = s
}

function toggleDeliveryExpand(id) {
  const s = new Set(expandedDeliveryId.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedDeliveryId.value = s
}

function togglePickupExpand(id) {
  const s = new Set(expandedPickupId.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedPickupId.value = s
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  }
}

async function copyLedgerText(group, type) {
  const prefixMap = { delivery: '送洗对账单', pickup: '领取对账单', distribution: '发放对账单' }
  const dateLabelMap = { delivery: '送洗时间', pickup: '领取时间', distribution: '发放时间' }
  const prefix = prefixMap[type] || type
  const dateLabel = dateLabelMap[type] || '时间'
  const lines = [prefix, `编号：${group.id}`, `${dateLabel}：${group.date}`, '']
  group.mergedItems.forEach(item => {
    lines.push(`${item.name} x${item.qty}`)
  })
  lines.push('', `合计：${group.totalQty} 件`)
  const success = await copyText(lines.join('\n'))
  if (success) {
    showSuccessToast('对账单已复制')
  } else {
    showFailToast('复制失败')
  }
}
</script>

<template>
  <div class="page">
    <div class="page-title">台账</div>

    <div class="ledger-tabs">
      <button type="button" class="ledger-tab" :class="{ 'is-active': activeTab === 'batch' }" @click="activeTab = 'batch'">批次</button>
      <button type="button" class="ledger-tab" :class="{ 'is-active': activeTab === 'delivery' }" @click="activeTab = 'delivery'">送洗 <span v-if="deliveryGroups.length" class="ledger-tab__count">{{ deliveryGroups.length }}</span></button>
      <button type="button" class="ledger-tab" :class="{ 'is-active': activeTab === 'pickup' }" @click="activeTab = 'pickup'">领取 <span v-if="pickupGroups.length" class="ledger-tab__count">{{ pickupGroups.length }}</span></button>
      <button type="button" class="ledger-tab" :class="{ 'is-active': activeTab === 'distribution' }" @click="activeTab = 'distribution'">发放 <span v-if="distributionGroups.length" class="ledger-tab__count">{{ distributionGroups.length }}</span></button>
    </div>

    <!-- 批次子标签 -->
    <div v-show="activeTab === 'batch'" class="section-stack">
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
        <div v-for="group in batchesByDate" :key="group.date" class="batch-date-group">
          <div class="batch-date-group__label">{{ group.date }}</div>
          <article
            v-for="batch in group.batches"
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

    <!-- 送洗子标签 -->
    <div v-show="activeTab === 'delivery'" class="section-stack">
      <van-empty v-if="deliveryGroups.length === 0" description="暂无送洗记录" />
      <div v-else class="batch-list">
        <div v-for="dg in deliveryByDate" :key="dg.date" class="batch-date-group">
          <div class="batch-date-group__label">{{ dg.date }}</div>
          <article v-for="group in dg.items" :key="group.id" class="ledger-card" @click="toggleDeliveryExpand(group.id)">
            <div class="ledger-card__head">
              <div>
                <div class="ledger-card__id-row">
                  <div class="ledger-card__id">{{ group.id }}</div>
                  <span v-if="group.signed" class="ledger-card__sign-ok">已确认</span>
                  <span v-else class="ledger-card__sign-pending" @click.stop="openSignPage('delivery', group)">待确认</span>
                </div>
                <div class="ledger-card__meta">{{ group.totalQty }} 件 · ¥{{ group.amount }}<span v-if="group.priceTableName"> · {{ group.priceTableName }}</span></div>
              </div>
              <button type="button" class="person-row__link" @click.stop="copyLedgerText(group, 'delivery')">复制</button>
            </div>
            <div v-if="expandedDeliveryId.has(group.id)" class="ledger-card__detail">
              <div v-for="item in group.mergedItems" :key="item.name" class="ledger-card__item">
                <span>{{ item.name }}</span>
                <span>x{{ item.qty }}</span>
              </div>
              <div v-if="group.signed" class="ledger-card__sig">
                <img v-if="group.signature !== 'NO_SIGNATURE'" :src="group.signature" class="signature-preview" />
                <div v-else class="signature-no-sign">无签字</div>
              </div>
              <button type="button" class="ledger-card__detail-btn" @click.stop="openLedgerDetail(group, 'delivery')">查看详细数据</button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <!-- 领取子标签 -->
    <div v-show="activeTab === 'pickup'" class="section-stack">
      <van-empty v-if="pickupGroups.length === 0" description="暂无领取记录" />
      <div v-else class="batch-list">
        <div v-for="dg in pickupByDate" :key="dg.date" class="batch-date-group">
          <div class="batch-date-group__label">{{ dg.date }}</div>
          <article v-for="group in dg.items" :key="group.id" class="ledger-card" @click="togglePickupExpand(group.id)">
            <div class="ledger-card__head">
              <div>
                <div class="ledger-card__id-row">
                  <div class="ledger-card__id">{{ group.id }}</div>
                  <span v-if="group.signed" class="ledger-card__sign-ok">已确认</span>
                  <span v-else class="ledger-card__sign-pending" @click.stop="openSignPage('pickup', group)">待确认</span>
                </div>
                <div class="ledger-card__meta">{{ group.totalQty }} 件 · ¥{{ group.amount }}<span v-if="group.priceTableName"> · {{ group.priceTableName }}</span></div>
              </div>
              <button type="button" class="person-row__link" @click.stop="copyLedgerText(group, 'pickup')">复制</button>
            </div>
            <div v-if="expandedPickupId.has(group.id)" class="ledger-card__detail">
              <div v-for="item in group.mergedItems" :key="item.name" class="ledger-card__item">
                <span>{{ item.name }}</span>
                <span>x{{ item.qty }}</span>
              </div>
              <div v-if="group.signed" class="ledger-card__sig">
                <img v-if="group.signature !== 'NO_SIGNATURE'" :src="group.signature" class="signature-preview" />
                <div v-else class="signature-no-sign">无签字</div>
              </div>
              <button type="button" class="ledger-card__detail-btn" @click.stop="openLedgerDetail(group, 'pickup')">查看详细数据</button>
            </div>
          </article>
        </div>
      </div>
    </div>
    <!-- 发放子标签 -->
    <div v-show="activeTab === 'distribution'" class="section-stack">
      <van-empty v-if="distributionGroups.length === 0" description="暂无发放记录" />
      <div v-else class="batch-list">
        <div v-for="dg in distributionByDate" :key="dg.date" class="batch-date-group">
          <div class="batch-date-group__label">{{ dg.date }}</div>
          <article v-for="group in dg.items" :key="group.id" class="ledger-card" @click="toggleDistributionExpand(group.id)">
            <div class="ledger-card__head">
              <div>
                <div class="ledger-card__id-row">
                  <div class="ledger-card__id">{{ group.id }}</div>
                  <span v-if="group.signed" class="ledger-card__sign-ok">已确认</span>
                </div>
                <div class="ledger-card__meta">{{ group.totalQty }} 件</div>
              </div>
              <button type="button" class="person-row__link" @click.stop="copyLedgerText(group, 'distribution')">复制</button>
            </div>
            <div v-if="expandedDistributionId.has(group.id)" class="ledger-card__detail">
              <div v-for="item in group.mergedItems" :key="item.name" class="ledger-card__item">
                <span>{{ item.name }}</span>
                <span>x{{ item.qty }}</span>
              </div>
              <div v-if="group.signed" class="ledger-card__sig">
                <img v-if="group.signature !== 'NO_SIGNATURE'" :src="group.signature" class="signature-preview" />
                <div v-else class="signature-no-sign">无签字</div>
              </div>
              <button type="button" class="ledger-card__detail-btn" @click.stop="openLedgerDetail(group, 'distribution')">查看详细数据</button>
            </div>
          </article>
        </div>
      </div>
    </div>

    <van-popup v-model:show="showLedgerDetail" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showLedgerDetail = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">{{ ledgerDetailData?.typeLabel }}详情</div>
        </div>

        <template v-if="ledgerDetailData">
          <div class="ledger-detail-header">
            <div class="ledger-detail-header__id">{{ ledgerDetailData.id }}</div>
            <div class="ledger-detail-header__meta">
              <span>{{ ledgerDetailData.preciseTime || ledgerDetailData.date }}</span>
              <span>合计 {{ ledgerDetailData.totalQty }} 件</span>
              <span v-if="ledgerDetailData.priceTableName">{{ ledgerDetailData.priceTableName }}</span>
            </div>
          </div>

          <div v-if="ledgerDetailData.signed" class="ledger-detail-sig">
            <img v-if="ledgerDetailData.signature !== 'NO_SIGNATURE'" :src="ledgerDetailData.signature" class="signature-preview signature-preview--sm" />
            <div v-else class="signature-no-sign signature-no-sign--sm">无签字</div>
          </div>

          <div class="ledger-detail-list">
            <div
              v-for="(item, idx) in ledgerDetailData.items"
              :key="idx"
              class="ledger-detail-item"
            >
              <div class="ledger-detail-item__head">
                <span class="ledger-detail-item__name">{{ item.itemName }}{{ item.showPieceNo ? `（第${item.pieceNo}件）` : '' }}{{ !item.pieceNo && item.quantity > 1 ? ` x${item.quantity}` : '' }}</span>
                <span class="ledger-detail-item__person">{{ item.staffName }}</span>
              </div>
              <div class="ledger-detail-item__ids">
                <span v-if="item.batchLabel">批次 {{ item.batchLabel }}</span>
                <span v-if="item.deliveryId && ledgerDetailData.type !== 'delivery'">送洗 {{ item.deliveryId }}</span>
                <span v-if="item.pickupId && ledgerDetailData.type !== 'pickup'">领取 {{ item.pickupId }}</span>
                <span v-if="item.distributionId && ledgerDetailData.type !== 'distribution'">发放 {{ item.distributionId }}</span>
              </div>
              <div v-if="item.note" class="ledger-detail-item__note">{{ item.note }}</div>
              <img v-if="item.photo" :src="item.photo" class="ledger-detail-item__photo zoomable-photo" @click="openPhotoViewer(item.photo)" />
            </div>
          </div>
        </template>
      </div>
    </van-popup>

    <van-popup v-model:show="showSignPopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }" @opened="onSignPopupOpen">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showSignPopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">{{ signTarget?.type === 'delivery' ? '送洗签字确认' : '领取签字确认' }}</div>
        </div>

        <div v-if="signTarget" class="sign-info">
          <div class="sign-info__id">{{ signTarget.id }}</div>
          <div class="sign-info__hint">酒店方确认{{ signTarget.type === 'delivery' ? '收到布草' : '布草已领取' }}后签字</div>
        </div>

        <section class="signature-panel">
          <div class="signature-panel__toolbar">
            <div class="signature-panel__title">签字区域</div>
            <div class="signature-panel__actions">
              <button type="button" class="signature-panel__link" @click="markNoSign">无签字</button>
              <button type="button" class="signature-panel__link" @click="clearSign">清空重签</button>
            </div>
          </div>
          <div class="signature-board">
            <div v-if="signNoSign" class="signature-board__no-sign-overlay">无签字</div>
            <canvas
              v-show="!signNoSign"
              ref="signCanvasRef"
              class="signature-board__canvas"
              @pointerdown="startSign"
              @pointermove="moveSign"
              @pointerup="endSign"
              @pointerleave="endSign"
              @pointercancel="endSign"
            />
          </div>
        </section>

        <div class="bottom-actions">
          <van-button block type="primary" @click="confirmSign">确认</van-button>
        </div>
      </div>
    </van-popup>
    <van-popup v-model:show="showPhotoViewer" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showPhotoViewer = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">查看图片</div>
        </div>
        <div class="photo-viewer__body" @click="showPhotoViewer = false">
          <img :src="viewerPhoto" class="photo-viewer__image" @click.stop />
        </div>
      </div>
    </van-popup>
  </div>
</template>
