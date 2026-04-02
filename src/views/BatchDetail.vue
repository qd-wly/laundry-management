<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { db } from '../db/index.js'
import { saveToDesktopStorage } from '../utils/desktopStorage.js'
import { buildBatchCodeMap, getBatchDisplayLabel } from '../utils/batchDisplay.js'
import { computeBatchProgress, getStatusMeta, resizeImageToBase64, summarizeRecordStatus } from '../utils/recordStatus.js'

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

const showCameraPopup = ref(false)
const cameraVideoRef = ref(null)
const cameraTarget = ref(null)
const cameraBusy = ref(false)
const cameraStatus = ref('')
let cameraStream = null

function openPhotoViewer(src) {
  viewerPhoto.value = src
  showPhotoViewer.value = true
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop())
    cameraStream = null
  }
  if (cameraVideoRef.value) {
    cameraVideoRef.value.srcObject = null
  }
}

function scoreCameraLabel(label = '') {
  const normalized = label.toLowerCase()
  let score = 0
  if (/rear|back|environment|world|后/.test(normalized)) score += 5
  if (/front|user|前|ir/.test(normalized)) score -= 4
  return score
}

async function findRearCameraDevice() {
  if (!navigator.mediaDevices?.enumerateDevices) return null
  const devices = await navigator.mediaDevices.enumerateDevices()
  const videoInputs = devices.filter(device => device.kind === 'videoinput')
  if (videoInputs.length === 0) return null
  return [...videoInputs].sort((left, right) => scoreCameraLabel(right.label) - scoreCameraLabel(left.label))[0]
}

async function requestCamera(constraints) {
  return navigator.mediaDevices.getUserMedia({ video: constraints, audio: false })
}

async function bindCameraStream(stream) {
  cameraStream = stream
  const video = cameraVideoRef.value
  if (!video) return
  video.srcObject = stream
  await video.play().catch(() => {})
}

async function startCameraStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showFailToast('当前设备不支持直接调用摄像头，请改用上传照片')
    showCameraPopup.value = false
    return
  }

  cameraBusy.value = true
  cameraStatus.value = '正在启动后摄...'
  stopCameraStream()

  try {
    let stream = null
    try {
      stream = await requestCamera({ facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } })
    } catch {
      try {
        stream = await requestCamera({ facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } })
      } catch {
        stream = await requestCamera({ width: { ideal: 1920 }, height: { ideal: 1080 } })
      }
    }

    const preferredDevice = await findRearCameraDevice()
    const currentTrack = stream.getVideoTracks()[0]
    const currentLabel = currentTrack?.label || ''

    if (preferredDevice && scoreCameraLabel(preferredDevice.label) > scoreCameraLabel(currentLabel)) {
      stream.getTracks().forEach(track => track.stop())
      stream = await requestCamera({ deviceId: { exact: preferredDevice.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } })
      cameraStatus.value = `已连接后摄：${preferredDevice.label || '后置摄像头'}`
    } else {
      cameraStatus.value = currentLabel ? `当前摄像头：${currentLabel}` : '摄像头已启动，可以直接拍照'
    }

    await bindCameraStream(stream)
  } catch (error) {
    showFailToast(error?.message || '无法打开摄像头，请检查 Windows 摄像头权限')
    showCameraPopup.value = false
  } finally {
    cameraBusy.value = false
  }
}

async function openCamera(recordId) {
  cameraTarget.value = recordId
  showCameraPopup.value = true
  await nextTick()
  await startCameraStream()
}

function closeCameraPopup() {
  showCameraPopup.value = false
}

function captureCameraPhoto() {
  const video = cameraVideoRef.value
  if (!video || !video.videoWidth || !video.videoHeight) {
    showFailToast('摄像头还没准备好，请稍后再拍')
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    showFailToast('拍照失败，请重试')
    return
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  const base64 = canvas.toDataURL('image/jpeg', 0.9)

  db.records.update(cameraTarget.value, { photo: base64 }).then(() => {
    saveToDesktopStorage()
    loadData()
    showSuccessToast('照片已保存')
    closeCameraPopup()
  })
}

async function handleFilePhoto(recordId, event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const base64 = await resizeImageToBase64(file, 1280)
    await db.records.update(recordId, { photo: base64 })
    await saveToDesktopStorage()
    await loadData()
    showSuccessToast('照片已保存')
  } catch {
    showFailToast('照片处理失败')
  } finally {
    event.target.value = ''
  }
}

onBeforeUnmount(() => {
  stopCameraStream()
})

onMounted(async () => {
  await loadData()
  scrollToTargetStaff()
})

async function loadData() {
  const id = route.params.id
  batches.value = await db.batches.toArray()
  batch.value = await db.batches.get(id)
  records.value = await db.records.where('batchId').equals(id).toArray()
  departments.value = await db.departments.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.toArray()
}

function scrollToTargetStaff() {
  const staffId = route.query.staff
  if (!staffId) return
  nextTick(() => {
    const el = document.getElementById(`staff-${staffId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el.classList.add('staff-panel--highlight')
      setTimeout(() => el.classList.remove('staff-panel--highlight'), 2000)
    }
  })
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
  const piece = item.showPieceNo ? `（第${item.pieceNo}件）` : ''
  const qty = !item.pieceNo && item.quantity > 1 ? ` x${item.quantity}` : ''
  return `${item.itemName}${piece}${qty}`
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
        staffId: record.staffId,
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
            itemName: tg.itemName,
            quantity: r.quantity,
            pieceNo: r.pieceNo,
            showPieceNo: tg.pieces.length > 1 && !!r.pieceNo,
            pieceLabel: '',
            statusMeta: r.statusMeta,
            sentAt: r.sentAt,
            receivedAt: r.receivedAt,
            distributedAt: r.distributedAt,
            deliveryId: r.deliveryId || '',
            pickupId: r.pickupId || '',
            distributionId: r.distributionId || '',
            notes: r.note ? [r.note] : [],
            photos: r.photo ? [r.photo] : [],
            recordIds: [r.id],
            hasNoPhoto: !r.photo,
          }))
        }
        // Non-personal items: merge into one row
        const totalQty = tg.records.reduce((s, r) => s + r.quantity, 0)
        const notes = tg.records.filter(r => r.note).map(r => r.note)
        const photos = tg.records.filter(r => r.photo).map(r => r.photo)
        const noPhotoRecords = tg.records.filter(r => !r.photo)
        const latestStatus = tg.records.reduce((best, r) => r.statusMeta.order > best.statusMeta.order ? r : best, tg.records[0])
        const deliveryIds = [...new Set(tg.records.map(r => r.deliveryId).filter(Boolean))]
        const pickupIds = [...new Set(tg.records.map(r => r.pickupId).filter(Boolean))]
        return [{
          itemName: tg.itemName,
          quantity: totalQty,
          pieceLabel: '',
          statusMeta: latestStatus.statusMeta,
          sentAt: tg.records[0].sentAt,
          receivedAt: tg.records[0].receivedAt,
          distributedAt: tg.records[0].distributedAt,
          deliveryId: deliveryIds.join('、'),
          pickupId: pickupIds.join('、'),
          distributionId: [...new Set(tg.records.map(r => r.distributionId).filter(Boolean))].join('、'),
          notes,
          photos,
          recordIds: noPhotoRecords.length > 0 ? [noPhotoRecords[0].id] : [],
          hasNoPhoto: noPhotoRecords.length > 0,
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
      label: '待取回',
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
          <article :id="`staff-${group.staffId}`" class="staff-panel">
            <div class="staff-panel__head">
              <div>
                <div class="staff-panel__title">{{ group.staffName }}</div>
                <div class="staff-panel__meta">{{ group.deptName }} · {{ group.items.length }} 条记录</div>
              </div>
            </div>

            <div class="staff-panel__list">
              <div class="detail-item-list">
                <div v-for="sig in group.intakeSignatures" :key="`intake-${sig.key}`" class="detail-item-row detail-item-row--sig">
                  <div class="detail-sig-inline">
                    <span class="detail-sig-inline__label">接收签字</span>
                    <span class="detail-sig-inline__time">{{ formatSignedAt(sig.signedAt) }}</span>
                  </div>
                  <img v-if="sig.signature !== 'NO_SIGNATURE'" :src="sig.signature" class="signature-preview signature-preview--sm" />
                  <div v-else class="signature-no-sign signature-no-sign--sm">无签字</div>
                </div>

                <div
                  v-for="(item, idx) in group.mergedItems"
                  :key="idx"
                  class="detail-item-row"
                >
                  <div class="detail-item-row__head">
                    <span class="detail-item-row__name">{{ item.itemName }}{{ item.showPieceNo ? `（第${item.pieceNo}件）` : '' }}{{ !item.pieceNo && item.quantity > 1 ? ` x${item.quantity}` : '' }}</span>
                    <div class="detail-item-row__tools">
                      <template v-if="item.hasNoPhoto && item.recordIds.length > 0">
                        <button type="button" class="detail-icon-btn" @click="openCamera(item.recordIds[0])"><van-icon name="photograph" size="16" /></button>
                        <label class="detail-icon-btn"><van-icon name="photo-o" size="16" /><input type="file" accept="image/*" style="display:none" @change="handleFilePhoto(item.recordIds[0], $event)" /></label>
                      </template>
                      <van-tag :type="item.statusMeta.tag" plain size="medium">{{ item.statusMeta.label }}</van-tag>
                    </div>
                  </div>
                  <div class="detail-item__ids">
                    <span v-if="item.deliveryId">送洗 {{ item.deliveryId }}</span>
                    <span v-if="item.pickupId">取回 {{ item.pickupId }}</span>
                    <span v-if="item.distributionId">发放 {{ item.distributionId }}</span>
                  </div>
                  <div v-for="(note, ni) in item.notes" :key="`n${ni}`" class="detail-item-row__note">{{ note }}</div>
                  <div v-if="item.photos.length > 0" class="detail-photo-thumbs">
                    <img v-for="(photo, pi) in item.photos" :key="`p${pi}`" :src="photo" class="detail-photo-thumb zoomable-photo" @click="openPhotoViewer(photo)" />
                  </div>
                </div>
              </div>

              <div v-if="group.distributionSignatures.length > 0" class="detail-dist-list">
                <div
                  v-for="(sig, si) in group.distributionSignatures"
                  :key="`dist-${sig.key}`"
                  class="detail-dist-block"
                >
                  <div class="detail-dist-block__id">{{ sig.items[0]?.distributionId || '发放' }}</div>
                  <div class="detail-dist-block__sign">
                    <img v-if="sig.signature !== 'NO_SIGNATURE'" :src="sig.signature" class="signature-preview signature-preview--dist zoomable-photo" @click="openPhotoViewer(sig.signature)" />
                    <div v-else class="signature-no-sign signature-no-sign--dist">无签字</div>
                  </div>
                  <div class="detail-dist-block__items">
                    <div v-for="(item, ii) in sig.items" :key="ii" class="detail-dist-block__item">
                      <span>{{ getItemDisplayName(item) }}</span>
                      <img v-if="item.photo" :src="item.photo" class="detail-dist-block__thumb zoomable-photo" @click.stop="openPhotoViewer(item.photo)" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
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

    <van-popup v-model:show="showCameraPopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }" @closed="stopCameraStream">
      <div class="popup-sheet popup-sheet--tall camera-sheet">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="closeCameraPopup">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">拍照</div>
          <button type="button" class="popup-page-header__action" @click="startCameraStream">重开相机</button>
        </div>

        <div class="camera-sheet__meta">优先调用 Surface 后摄；如果系统不支持，再用上传照片兜底。</div>

        <div class="camera-preview">
          <video ref="cameraVideoRef" class="camera-preview__video" autoplay playsinline muted />
          <div v-if="cameraStatus" class="camera-preview__status">{{ cameraStatus }}</div>
        </div>

        <div class="bottom-actions">
          <van-button block type="primary" :loading="cameraBusy" @click="captureCameraPhoto">拍照保存</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>
