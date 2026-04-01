<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { db } from '../db/index.js'
import { saveToDesktopStorage } from '../utils/desktopStorage.js'
import { buildBatchCodeMap, getBatchDisplayLabel } from '../utils/batchDisplay.js'
import { computeBatchProgress, getStatusMeta, summarizeRecordStatus } from '../utils/recordStatus.js'

const route = useRoute()
const router = useRouter()

const batch = ref(null)
const batches = ref([])
const records = ref([])
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])
const showNotePopup = ref(false)
const noteDraft = ref('')
const showPhotoViewer = ref(false)
const viewerPhoto = ref('')

function openPhotoViewer(src) {
  viewerPhoto.value = src
  showPhotoViewer.value = true
}

onMounted(loadData)

async function loadData() {
  const id = route.params.id
  batches.value = await db.batches.toArray()
  batch.value = await db.batches.get(id)
  records.value = await db.records.where('batchId').equals(id).toArray()
  departments.value = await db.departments.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.toArray()
}

const summary = computed(() => summarizeRecordStatus(records.value))
const progress = computed(() => computeBatchProgress(records.value))
const totalItems = computed(() => records.value.reduce((sum, record) => sum + record.quantity, 0))
const batchCodeMap = computed(() => buildBatchCodeMap(batches.value))
const batchLabel = computed(() => {
  if (!batch.value) return ''
  return getBatchDisplayLabel(batch.value, batchCodeMap.value)
})

function buildSignatureGroups(items, fieldPrefix) {
  const groups = new Map()

  items.forEach(item => {
    const signature = item[`${fieldPrefix}Signature`]
    const signedAt = item[`${fieldPrefix}SignedAt`] || ''
    if (!signature) return

    const key = `${signature}::${signedAt}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        signature,
        signedAt,
        items: [],
      })
    }

    groups.get(key).items.push(item)
  })

  return Array.from(groups.values())
    .map(group => ({
      ...group,
      itemText: group.items.map(item => getItemDisplayName(item)).join('、'),
      photos: group.items.filter(item => item.photo).map(item => item.photo),
    }))
    .sort((left, right) => String(left.signedAt || '').localeCompare(String(right.signedAt || '')))
}

function getItemDisplayName(item) {
  const pieceText = item.showPieceNo ? `第${item.pieceNo}件` : ''
  return `${item.itemName}${pieceText ? `·${pieceText}` : ''} x${item.quantity}`
}

function formatSignedAt(value) {
  if (!value) return '未记录时间'
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const groupedRecords = computed(() => {
  const deptMap = new Map(departments.value.map(item => [item.id, item.name]))
  const staffMap = new Map(staffList.value.map(item => [item.id, item.name]))
  const itemTypeMap = new Map(itemTypes.value.map(item => [item.id, item.name]))
  const groups = new Map()

  records.value.forEach(record => {
    const key = `${record.departmentId}-${record.staffId}`
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        deptName: deptMap.get(record.departmentId) || '',
        staffName: staffMap.get(record.staffId) || '',
        items: [],
      })
    }

    groups.get(key).items.push({
      ...record,
      itemName: itemTypeMap.get(record.itemTypeId) || '未命名物品',
      statusMeta: getStatusMeta(record.status),
    })
  })

  return Array.from(groups.values())
    .map(group => {
      const itemTypeCounts = {}
      group.items.forEach(item => {
        itemTypeCounts[item.itemTypeId] = (itemTypeCounts[item.itemTypeId] || 0) + 1
      })
      const itemsWithMeta = group.items.map(item => ({
        ...item,
        showPieceNo: itemTypeCounts[item.itemTypeId] > 1 && !!item.pieceNo,
      }))
      const unsignedIntakeItems = itemsWithMeta.filter(item => !item.intakeSignature)

      // Merge same-type items into one display row
      const typeGroups = new Map()
      itemsWithMeta.forEach(item => {
        if (!typeGroups.has(item.itemTypeId)) {
          typeGroups.set(item.itemTypeId, { itemName: item.itemName, statusMeta: item.statusMeta, pieces: [], records: [] })
        }
        const tg = typeGroups.get(item.itemTypeId)
        tg.records.push(item)
        if (item.pieceNo) tg.pieces.push(item.pieceNo)
      })
      const mergedItems = Array.from(typeGroups.values()).flatMap(tg => {
        // Personal items (with pieceNo): one row per piece
        if (tg.pieces.length > 0) {
          return tg.records.map(r => ({
            itemName: `${tg.itemName}（第${r.pieceNo}件）`,
            quantity: r.quantity,
            pieceLabel: '',
            statusMeta: r.statusMeta,
            sentAt: r.sentAt,
            receivedAt: r.receivedAt,
            distributedAt: r.distributedAt,
            notes: r.note ? [r.note] : [],
            photos: r.photo ? [r.photo] : [],
          }))
        }
        // Non-personal items: merge into one row
        const totalQty = tg.records.reduce((s, r) => s + r.quantity, 0)
        const notes = tg.records.filter(r => r.note).map(r => r.note)
        const photos = tg.records.filter(r => r.photo).map(r => r.photo)
        const latestStatus = tg.records.reduce((best, r) => r.statusMeta.order > best.statusMeta.order ? r : best, tg.records[0])
        return [{
          itemName: tg.itemName,
          quantity: totalQty,
          pieceLabel: '',
          statusMeta: latestStatus.statusMeta,
          sentAt: tg.records[0].sentAt,
          receivedAt: tg.records[0].receivedAt,
          distributedAt: tg.records[0].distributedAt,
          notes,
          photos,
        }]
      })

      return {
        ...group,
        intakeSignatures: buildSignatureGroups(itemsWithMeta, 'intake'),
        distributionSignatures: buildSignatureGroups(itemsWithMeta, 'distribution'),
        hasUnsignedIntake: unsignedIntakeItems.length > 0,
        unsignedIntakeText: unsignedIntakeItems.map(item => getItemDisplayName(item)).join('、'),
        mergedItems,
        items: [...itemsWithMeta].sort((left, right) => {
          if ((left.distributedAt || '') !== (right.distributedAt || '')) {
            return String(left.distributedAt || '').localeCompare(String(right.distributedAt || ''))
          }
          return getItemDisplayName(left).localeCompare(getItemDisplayName(right), 'zh-Hans-CN')
        }),
      }
    })
    .sort((left, right) => left.staffName.localeCompare(right.staffName, 'zh-Hans-CN'))
})

function openNoteEditor() {
  noteDraft.value = batch.value?.note || ''
  showNotePopup.value = true
}

async function saveBatchNote() {
  if (!batch.value) return

  const nextNote = noteDraft.value.trim()
  const updatedAt = new Date().toISOString()

  await db.batches.update(batch.value.id, {
    note: nextNote,
    updatedAt,
  })

  batch.value = {
    ...batch.value,
    note: nextNote,
    updatedAt,
  }

  const result = await saveToDesktopStorage()
  if (result.success) {
    showSuccessToast('批次备注已更新')
  } else {
    showFailToast(`备注已更新到当前页面缓存，${result.error || '未写入桌面数据文件'}`)
  }

  showNotePopup.value = false
}

async function deleteBatch() {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: '删除后该批次及全部衣物记录都会移除，无法恢复。',
    })

    await db.transaction('rw', db.records, db.batches, async () => {
      await db.records.where('batchId').equals(batch.value.id).delete()
      await db.batches.delete(batch.value.id)
    })

    const result = await saveToDesktopStorage()
    if (result.success) {
      showSuccessToast('批次已删除')
    } else {
      showFailToast(`批次已从当前页面缓存删除，${result.error || '未写入桌面数据文件'}`)
    }

    router.back()
  } catch {
    // cancelled
  }
}

const timelineNodes = computed(() => {
  const s = summary.value
  const total = totalItems.value

  return [
    {
      label: '接收建批',
      text: total,
      active: true,
    },
    {
      label: '待送洗',
      text: s.pending,
      active: s.pending === 0 && total > 0,
    },
    {
      label: '待领取',
      text: s.washed,
      active: s.pending === 0 && s.washed === 0 && total > 0,
    },
    {
      label: '待发放',
      text: s.received,
      active: s.pending === 0 && s.washed === 0 && s.received === 0 && total > 0,
    },
    {
      label: '已完成',
      text: s.distributed,
      active: s.distributed > 0 && s.pending === 0 && s.washed === 0 && s.received === 0,
    },
  ]
})
</script>

<template>
  <div class="page">
    <template v-if="batch">
      <div class="batch-page-header">
        <button type="button" class="batch-page-header__back" @click="router.back()">
          <van-icon name="arrow-left" size="18" />
          <span>返回</span>
        </button>
        <div class="batch-page-header__body">
          <div class="batch-page-header__title">{{ batchLabel }}</div>
        </div>
        <button type="button" class="batch-page-header__note" @click="openNoteEditor">
          <van-icon name="edit-o" size="15" />
          <span>{{ batch.note || '添加备注' }}</span>
        </button>
      </div>

      <div class="section-stack">
        <div class="timeline-strip">
          <div
            v-for="(node, index) in timelineNodes"
            :key="index"
            class="timeline-node"
            :class="{ 'is-active': node.active }"
          >
            <div class="timeline-node__dot"></div>
            <span>{{ node.label }}</span>
            <strong>{{ node.text }}</strong>
          </div>
        </div>

        <div v-for="group in groupedRecords" :key="group.key" class="detail-group">
          <article class="staff-panel">
            <div class="staff-panel__head">
              <div>
                <div class="staff-panel__title">{{ group.staffName }}</div>
                <div class="staff-panel__meta">{{ group.deptName }} · {{ group.items.length }} 条记录</div>
              </div>
            </div>

            <div class="staff-panel__list">
              <div class="detail-item-list">
                <div
                  v-for="(item, idx) in group.mergedItems"
                  :key="idx"
                  class="detail-item-row"
                >
                  <div class="detail-item-row__head">
                    <span class="detail-item-row__name">{{ item.itemName }}{{ item.quantity > 1 ? ` x${item.quantity}` : '' }}{{ item.pieceLabel }}</span>
                    <van-tag :type="item.statusMeta.tag" plain size="medium">{{ item.statusMeta.label }}</van-tag>
                  </div>
                  <div class="detail-item__meta">
                    <span v-if="item.sentAt">送洗 {{ item.sentAt }}</span>
                    <span v-if="item.receivedAt">领取 {{ item.receivedAt }}</span>
                    <span v-if="item.distributedAt">发放 {{ item.distributedAt }}</span>
                    <span v-if="!item.sentAt && !item.receivedAt && !item.distributedAt">待送洗</span>
                  </div>
                  <div v-for="(note, ni) in item.notes" :key="`n${ni}`" class="detail-item-row__note">{{ note }}</div>
                  <img v-for="(photo, pi) in item.photos" :key="`p${pi}`" :src="photo" class="detail-item-row__photo zoomable-photo" @click="openPhotoViewer(photo)" />
                </div>
              </div>

              <div v-for="signatureGroup in group.intakeSignatures" :key="`intake-${signatureGroup.key}`" class="draft-signature-section">
                <div class="draft-signature-section__label">接收签字 · {{ formatSignedAt(signatureGroup.signedAt) }}</div>
                <div class="draft-signature-section__items">{{ signatureGroup.itemText }}</div>
                <img v-for="(photo, pi) in signatureGroup.photos" :key="`ip${pi}`" :src="photo" class="detail-item-row__photo zoomable-photo" @click="openPhotoViewer(photo)" />
                <img v-if="signatureGroup.signature !== 'NO_SIGNATURE'" :src="signatureGroup.signature" class="signature-preview" />
                <div v-else class="signature-no-sign">无签字</div>
              </div>
              <div v-if="group.hasUnsignedIntake" class="draft-signature-section">
                <div class="draft-signature-section__label">接收签字</div>
                <div class="draft-signature-section__items">{{ group.unsignedIntakeText }}</div>
                <div class="signature-no-sign">无签字</div>
              </div>
              <div v-for="signatureGroup in group.distributionSignatures" :key="`distribution-${signatureGroup.key}`" class="draft-signature-section">
                <div class="draft-signature-section__label">发放签字 · {{ formatSignedAt(signatureGroup.signedAt) }}</div>
                <div class="draft-signature-section__items">{{ signatureGroup.itemText }}</div>
                <img v-for="(photo, pi) in signatureGroup.photos" :key="`dp${pi}`" :src="photo" class="detail-item-row__photo zoomable-photo" @click="openPhotoViewer(photo)" />
                <img v-if="signatureGroup.signature !== 'NO_SIGNATURE'" :src="signatureGroup.signature" class="signature-preview" />
                <div v-else class="signature-no-sign">无签字</div>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div class="bottom-actions">
        <van-button block plain type="danger" @click="deleteBatch">删除此批次</van-button>
      </div>
    </template>

    <div v-else>
      <div class="batch-page-header">
        <button type="button" class="batch-page-header__back" @click="router.back()">
          <van-icon name="arrow-left" size="18" />
          <span>返回</span>
        </button>
      </div>
      <van-empty description="未找到批次记录" style="margin-top: 80px" />
    </div>

    <van-popup v-model:show="showNotePopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showNotePopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">批次备注</div>
        </div>
        <van-field
          v-model="noteDraft"
          rows="6"
          autosize
          type="textarea"
          maxlength="120"
          placeholder="输入本批次说明"
          show-word-limit
        />
        <div class="bottom-actions">
          <van-button block type="primary" @click="saveBatchNote">保存备注</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showPhotoViewer" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall photo-viewer">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showPhotoViewer = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">查看图片</div>
        </div>
        <div class="photo-viewer__body">
          <img :src="viewerPhoto" class="photo-viewer__image" />
        </div>
      </div>
    </van-popup>
  </div>
</template>
