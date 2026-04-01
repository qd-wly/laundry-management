<script setup>
defineOptions({ name: 'Send' })
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { v4 as uuidv4 } from 'uuid'
import { showFailToast, showSuccessToast, showToast } from 'vant'
import { db } from '../db/index.js'
import { buildBatchCodeMap, getBatchDisplayLabel } from '../utils/batchDisplay.js'
import { saveToDesktopStorage } from '../utils/desktopStorage.js'
import {
  computeBatchProgress,
  getStatusMeta,
  getToday,
  resizeImageToBase64,
  summarizeRecordStatus,
} from '../utils/recordStatus.js'

const router = useRouter()

const receivedDate = ref(getToday())
const showDatePicker = ref(false)
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])
const batches = ref([])
const records = ref([])
const currentRecords = ref([])
const batchNote = ref('')
const saving = ref(false)

const showAddForm = ref(false)
const showNotePopup = ref(false)
const noteDraft = ref('')
const selectedDeptId = ref(null)
const selectedStaffId = ref(null)
const selectedItems = ref({})
const itemNotes = ref({})
const itemPhotos = ref({})
const personalPieceDetails = ref({})
const draftIntakeSignature = ref('')
const draftIntakeSignedAt = ref('')

const selectedPendingIds = ref([])
const selectedWashedIds = ref([])
const selectedReceivedIds = ref([])
const draftSavedAt = ref('')
const showDraftDetailPopup = ref(false)
const selectedDraftRecord = ref(null)
const showSlipPopup = ref(false)
const slipMode = ref('intake')
const slipRecord = ref(null)

const showSignaturePopup = ref(false)
const signatureTitle = ref('')
const signatureHint = ref('')
const signatureMode = ref('intake')
const signatureTarget = ref(null)
const signatureCanvasRef = ref(null)
const signatureHasStroke = ref(false)
const intakeCanvasRef = ref(null)
const intakeHasStroke = ref(false)
let intakeCtx = null
const intakeNoSign = ref(false)
const distCanvasRef = ref(null)
const distHasStroke = ref(false)
let distCtx = null
const distNoSign = ref(false)
const showPhotoViewer = ref(false)
const viewerPhoto = ref('')

function openPhotoViewer(src) {
  viewerPhoto.value = src
  showPhotoViewer.value = true
}
const showCameraPopup = ref(false)
const cameraVideoRef = ref(null)
const cameraTarget = ref({ itemId: null, pieceIndex: null })
const cameraBusy = ref(false)
const cameraStatus = ref('')
const activeSection = ref(sessionStorage.getItem('send-active-section') || 'create')
const viewportHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 0)

const categoryLabels = {
  personal: '个人衣物',
  bedding: '床品布草',
  banquet: '宴会布草',
}

const intakeDraftStorageKey = 'laundry-intake-draft-v1'

let signatureCtx = null
let signatureDrawing = false
let cameraStream = null

onMounted(loadData)
onActivated(refreshData)
onMounted(() => {
  updateViewportHeight()
  window.addEventListener('resize', updateViewportHeight)
})
onBeforeUnmount(() => {
  stopCameraStream()
  window.removeEventListener('resize', updateViewportHeight)
})

watch(showCameraPopup, value => {
  if (!value) {
    stopCameraStream()
  }
})

watch(selectedStaffId, (val) => {
  if (val) {
    nextTick(() => {
      const el = document.querySelector('.add-form-popup')
      if (el) el.scrollTop = 0
    })
  }
})

async function refreshData() {
  departments.value = await db.departments.orderBy('sortOrder').toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.orderBy('sortOrder').toArray()
  batches.value = await db.batches.orderBy('sendDate').reverse().toArray()
  records.value = await db.records.toArray()
}

async function loadData() {
  await refreshData()
  restoreIntakeDraft()
}

const itemTypeMap = computed(() => {
  return new Map(itemTypes.value.map(item => [item.id, item]))
})

const selectedStaffName = computed(() => {
  return staffList.value.find(item => item.id === selectedStaffId.value)?.name || ''
})

const filteredStaff = computed(() => {
  if (!selectedDeptId.value) return []
  return staffList.value.filter(item => item.departmentId === selectedDeptId.value && item.isActive !== false)
})

const staffByDept = computed(() => {
  const deptMap = new Map(departments.value.map(d => [d.id, d]))
  const groups = []
  departments.value.forEach(dept => {
    const members = staffList.value.filter(s => s.departmentId === dept.id && s.isActive !== false)
    if (members.length > 0) {
      groups.push({ dept, members })
    }
  })
  return groups
})

// 拼音首字母边界：每个字母段的起始汉字（基于 Unicode 拼音排序）
const pinyinBoundaries = [
  ['A', '啊'], ['B', '芭'], ['C', '擦'], ['D', '搭'], ['E', '蛾'],
  ['F', '发'], ['G', '噶'], ['H', '哈'], ['J', '击'], ['K', '喀'],
  ['L', '垃'], ['M', '妈'], ['N', '拿'], ['O', '哦'], ['P', '啪'],
  ['Q', '期'], ['R', '然'], ['S', '撒'], ['T', '塌'], ['W', '挖'],
  ['X', '昔'], ['Y', '压'], ['Z', '匝'],
]

function getPinyinInitial(name) {
  if (!name) return '#'
  const char = name[0]
  // 非汉字直接取首字符大写
  if (!/[\u4e00-\u9fa5]/.test(char)) return char.toUpperCase()
  const collator = new Intl.Collator('zh-Hans-CN')
  let result = '#'
  for (const [letter, boundary] of pinyinBoundaries) {
    if (collator.compare(char, boundary) >= 0) result = letter
    else break
  }
  return result
}

const staffByInitial = computed(() => {
  const active = staffList.value.filter(s => s.isActive !== false)
  const sorted = [...active].sort((a, b) =>
    a.name.localeCompare(b.name, 'zh-Hans-CN', { sensitivity: 'base' })
  )
  const map = new Map()
  sorted.forEach(s => {
    const initial = getPinyinInitial(s.name)
    if (!map.has(initial)) map.set(initial, [])
    map.get(initial).push(s)
  })
  return Array.from(map.entries()).map(([initial, members]) => ({ initial, members }))
})

const groupedItemTypes = computed(() => {
  const groups = { personal: [], bedding: [], banquet: [] }
  itemTypes.value.forEach(item => {
    if (groups[item.category]) {
      groups[item.category].push(item)
    }
  })

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({
      key,
      label: categoryLabels[key],
      items,
    }))
})

const draftPeopleCount = computed(() => currentRecords.value.length)

const draftItemCount = computed(() => {
  return currentRecords.value.reduce((sum, record) => {
    return sum + record.items.reduce((itemSum, item) => itemSum + item.quantity, 0)
  }, 0)
})

const recordsSummary = computed(() => {
  return [...currentRecords.value]
    .map((record, rawIndex) => ({
      record,
      rawIndex,
    }))
    .reverse()
    .map(({ record, rawIndex }) => {
    const dept = departments.value.find(item => item.id === record.departmentId)
    const staff = staffList.value.find(item => item.id === record.staffId)
    const itemsText = record.items
      .map(item => {
        const type = itemTypes.value.find(t => t.id === item.itemTypeId)
        const labels = []
        if (item.photo) labels.push('有照片')
        if (item.note) labels.push('有备注')
        if (item.quantity === 1 && item.pieceNo) labels.unshift(`第${item.pieceNo}件`)
        const suffix = labels.length > 0 ? `（${labels.join(' / ')}）` : ''
        return `${type?.name || ''} x${item.quantity}${suffix}`
      })
      .join('；')

    return {
      ...record,
      rawIndex,
      deptName: dept?.name || '',
      staffName: staff?.name || '',
      itemsText,
      photos: record.items.filter(item => item.photo).map(item => ({
        src: item.photo,
        label: `${itemTypes.value.find(t => t.id === item.itemTypeId)?.name || ''}${item.pieceNo ? ` 第${item.pieceNo}件` : ''}`,
      })),
      intakeSignature: record.intakeSignature || '',
      intakeSignedAt: record.intakeSignedAt || '',
      intakeSignedLabel: record.intakeSignedAt ? new Date(record.intakeSignedAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }) : '',
    }
  })
})

const dashboard = computed(() => {
  const summary = summarizeRecordStatus(records.value)
  const activeBatchIds = new Set(
    records.value
      .filter(item => item.status !== 'distributed')
      .map(item => item.batchId)
  )

  return {
    batchCount: batches.value.length,
    activeBatchCount: activeBatchIds.size,
    ...summary,
  }
})

const workflowMetrics = computed(() => [
  {
    key: 'create',
    title: '接收建批',
    value: draftPeopleCount.value,
    hint: draftPeopleCount.value ? `${draftItemCount.value} 件草稿` : '登记衣物',
  },
  {
    key: 'pending',
    title: '待送洗',
    value: dashboard.value.pending,
    hint: '确认送洗',
  },
  {
    key: 'washed',
    title: '待领取',
    value: dashboard.value.washed,
    hint: '确认领取',
  },
  {
    key: 'received',
    title: '待发放',
    value: dashboard.value.received,
    hint: '签字发放',
  },
])

const pendingGroups = computed(() => buildStageGroups('pending'))
const washedGroups = computed(() => buildStageGroups('washed'))
const receivedGroups = computed(() => buildStageGroups('received'))
const batchCodeMap = computed(() => buildBatchCodeMap(batches.value))
const canSubmitDraft = computed(() => currentRecords.value.length > 0)
const navDensityClass = computed(() => {
  if (viewportHeight.value <= 820) return 'is-dense'
  if (viewportHeight.value <= 940) return 'is-compact'
  return ''
})

function buildStageGroups(status) {
  const deptMap = new Map(departments.value.map(item => [item.id, item.name]))
  const staffMap = new Map(staffList.value.map(item => [item.id, item.name]))
  const itemNameMap = new Map(itemTypes.value.map(item => [item.id, item.name]))
  const batchRecordMap = new Map()

  records.value.forEach(record => {
    if (!batchRecordMap.has(record.batchId)) {
      batchRecordMap.set(record.batchId, [])
    }
    batchRecordMap.get(record.batchId).push(record)
  })

  return batches.value
    .map(batch => {
      const allRecords = batchRecordMap.get(batch.id) || []
      const stageRecords = allRecords.filter(record => record.status === status)
      if (stageRecords.length === 0) return null

      const peopleMap = new Map()
      stageRecords.forEach(record => {
        const key = `${record.departmentId}-${record.staffId}`
        if (!peopleMap.has(key)) {
          peopleMap.set(key, {
            key,
            deptName: deptMap.get(record.departmentId) || '',
            staffName: staffMap.get(record.staffId) || '',
            items: [],
          })
        }

        peopleMap.get(key).items.push({
          ...record,
          itemName: itemNameMap.get(record.itemTypeId) || '未命名物品',
          statusMeta: getStatusMeta(record.status),
        })
      })

      return {
        batchId: batch.id,
        batchDate: batch.sendDate,
        batchCode: batchCodeMap.value.get(batch.id) || '',
        batchLabel: getBatchDisplayLabel(batch, batchCodeMap.value),
        batchNote: batch.note || '',
        progress: computeBatchProgress(allRecords),
        totalCount: stageRecords.reduce((sum, item) => sum + item.quantity, 0),
        people: Array.from(peopleMap.values())
          .sort((left, right) => {
            const leftTime = Math.max(...left.items.map(item => Date.parse(item.createdAt || item.updatedAt || `${batch.sendDate}T00:00:00`)))
            const rightTime = Math.max(...right.items.map(item => Date.parse(item.createdAt || item.updatedAt || `${batch.sendDate}T00:00:00`)))
            if (leftTime !== rightTime) return rightTime - leftTime
            return left.staffName.localeCompare(right.staffName, 'zh-Hans-CN')
          })
          .map(person => {
            const itemTypeCounts = {}
            person.items.forEach(item => {
              itemTypeCounts[item.itemTypeId] = (itemTypeCounts[item.itemTypeId] || 0) + 1
            })
            return {
              ...person,
              totalCount: person.items.reduce((sum, item) => sum + item.quantity, 0),
              items: person.items
                .sort((left, right) => {
                  if (Boolean(right.photo) !== Boolean(left.photo)) {
                    return Number(Boolean(right.photo)) - Number(Boolean(left.photo))
                  }
                  return (left.itemName || '').localeCompare(right.itemName || '', 'zh-Hans-CN')
                })
                .map(item => ({
                  ...item,
                  showPieceNo: itemTypeCounts[item.itemTypeId] > 1 && !!item.pieceNo,
                })),
            }
          }),
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.batchDate.localeCompare(left.batchDate))
}

const datePickerModel = computed({
  get: () => receivedDate.value.split('-'),
  set: (val) => { receivedDate.value = val.join('-') },
})

function onDateConfirm({ selectedValues }) {
  receivedDate.value = selectedValues.join('-')
  showDatePicker.value = false
}

function updateViewportHeight() {
  viewportHeight.value = window.innerHeight
}

function restoreIntakeDraft() {
  try {
    const raw = window.localStorage.getItem(intakeDraftStorageKey)
    if (!raw) return

    const draft = JSON.parse(raw)
    receivedDate.value = draft.receivedDate || getToday()
    batchNote.value = draft.batchNote || ''
    currentRecords.value = Array.isArray(draft.currentRecords) ? draft.currentRecords : []
    draftSavedAt.value = draft.savedAt || ''
  } catch {
    draftSavedAt.value = ''
  }
}

function saveIntakeDraft() {
  const payload = {
    receivedDate: receivedDate.value,
    batchNote: batchNote.value.trim(),
    currentRecords: currentRecords.value,
    savedAt: new Date().toISOString(),
  }

  window.localStorage.setItem(intakeDraftStorageKey, JSON.stringify(payload))
  draftSavedAt.value = payload.savedAt
  showSuccessToast('接收草稿已保存')
}

function clearIntakeDraftStorage() {
  window.localStorage.removeItem(intakeDraftStorageKey)
  draftSavedAt.value = ''
}

function formatDraftSavedAt(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function openAddForm() {
  selectedDeptId.value = null
  selectedStaffId.value = null
  selectedItems.value = {}
  itemNotes.value = {}
  itemPhotos.value = {}
  personalPieceDetails.value = {}
  draftIntakeSignature.value = ''
  draftIntakeSignedAt.value = ''
  showAddForm.value = true
}

function selectStaffDirect(staff) {
  selectedDeptId.value = staff.departmentId
  selectedStaffId.value = staff.id
}

function openNoteEditor() {
  noteDraft.value = batchNote.value
  showNotePopup.value = true
}

function saveNote() {
  batchNote.value = noteDraft.value.trim()
  showNotePopup.value = false
}

function getQuantity(itemId) {
  return Number(selectedItems.value[itemId] || 0)
}

function syncPersonalPieceDetails(itemId, count) {
  const existing = personalPieceDetails.value[itemId] || []
  const next = Array.from({ length: count }, (_, index) => ({
    note: existing[index]?.note || '',
    photo: existing[index]?.photo || '',
  }))
  personalPieceDetails.value[itemId] = next
}

function onItemQuantityChange(item, value) {
  selectedItems.value[item.id] = Number(value)
  if (item.category === 'personal') {
    syncPersonalPieceDetails(item.id, Number(value))
  }
}

function getPieceDetail(itemId, pieceIndex) {
  return personalPieceDetails.value[itemId]?.[pieceIndex] || { note: '', photo: '' }
}

function updatePieceNote(itemId, pieceIndex, value) {
  const list = personalPieceDetails.value[itemId] || []
  if (!list[pieceIndex]) {
    list[pieceIndex] = { note: '', photo: '' }
  }
  list[pieceIndex].note = value
  personalPieceDetails.value[itemId] = [...list]
}

function setPhotoData(itemId, base64, pieceIndex = null) {
  if (pieceIndex === null) {
    itemPhotos.value[itemId] = base64
    return
  }

  const list = personalPieceDetails.value[itemId] || []
  if (!list[pieceIndex]) {
    list[pieceIndex] = { note: '', photo: '' }
  }
  list[pieceIndex].photo = base64
  personalPieceDetails.value[itemId] = [...list]
}

async function handlePhoto(itemId, event, pieceIndex = null) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  try {
    const base64 = await resizeImageToBase64(file, 1280)
    setPhotoData(itemId, base64, pieceIndex)
  } catch {
    showToast('图片处理失败，请重试')
  }
}

function removePhoto(itemId, pieceIndex = null) {
  if (pieceIndex === null) {
    delete itemPhotos.value[itemId]
    return
  }

  const list = personalPieceDetails.value[itemId] || []
  if (!list[pieceIndex]) return
  list[pieceIndex].photo = ''
  personalPieceDetails.value[itemId] = [...list]
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
  return navigator.mediaDevices.getUserMedia({
    video: constraints,
    audio: false,
  })
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
      stream = await requestCamera({
        facingMode: { exact: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      })
    } catch {
      try {
        stream = await requestCamera({
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        })
      } catch {
        stream = await requestCamera({
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        })
      }
    }

    const preferredDevice = await findRearCameraDevice()
    const currentTrack = stream.getVideoTracks()[0]
    const currentLabel = currentTrack?.label || ''

    if (preferredDevice && scoreCameraLabel(preferredDevice.label) > scoreCameraLabel(currentLabel)) {
      stream.getTracks().forEach(track => track.stop())
      stream = await requestCamera({
        deviceId: { exact: preferredDevice.deviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      })
      cameraStatus.value = `已连接后摄：${preferredDevice.label || '后置摄像头'}`
    } else {
      cameraStatus.value = currentLabel
        ? `当前摄像头：${currentLabel}`
        : '摄像头已启动，可以直接拍照'
    }

    await bindCameraStream(stream)
  } catch (error) {
    showFailToast(error?.message || '无法打开摄像头，请检查 Windows 摄像头权限')
    showCameraPopup.value = false
  } finally {
    cameraBusy.value = false
  }
}

async function openCameraCapture(itemId, pieceIndex = null) {
  cameraTarget.value = { itemId, pieceIndex }
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
    showToast('摄像头还没准备好，请稍后再拍')
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
  setPhotoData(cameraTarget.value.itemId, base64, cameraTarget.value.pieceIndex)
  showSuccessToast('照片已保存')
  closeCameraPopup()
}

function hasAnySelectedItem() {
  return itemTypes.value.some(item => getQuantity(item.id) > 0)
}

function openIntakeSignaturePad() {
  openSignaturePad({
    mode: 'intake',
    title: `${selectedStaffName.value} 接收签字`,
    hint: '员工确认已交来本次衣物后，在这里手写签字。',
    target: null,
  })
}

function openDistributionSignaturePad(group, person) {
  const fallbackIds = slipRecord.value?.target?.ids || []
  const ids = person?.items ? getPersonSelectedIds('received', person) : fallbackIds
  if (ids.length === 0) {
    showToast('请先勾选这个人名下要发放的衣物')
    return
  }

  openSignaturePad({
    mode: 'distribution',
    title: `${person.staffName} 发放签字`,
    hint: '员工确认已领回勾选衣物后，在这里手写签字。',
    target: {
      ids,
      batchId: group.batchId,
      staffName: person.staffName,
    },
  })
}

function openDistributionSlip(group, person) {
  const ids = person.items.map(item => item.id)

  slipMode.value = 'distribution'
  slipRecord.value = {
    deptName: person.deptName,
    staffName: person.staffName,
    items: person.items,
    target: {
      ids,
      batchId: group.batchId,
      staffName: person.staffName,
    },
  }
  showSlipPopup.value = true
}

function openSignaturePad({ mode, title, hint, target }) {
  signatureMode.value = mode
  signatureTitle.value = title
  signatureHint.value = hint
  signatureTarget.value = target
  showSignaturePopup.value = true

  nextTick(() => {
    initializeSignatureCanvas()
  })
}

function initializeSignatureCanvas() {
  const canvas = signatureCanvasRef.value
  if (!canvas) return

  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * ratio))
  canvas.height = Math.max(1, Math.floor(rect.height * ratio))

  signatureCtx = canvas.getContext('2d')
  if (!signatureCtx) return

  signatureCtx.scale(ratio, ratio)
  signatureCtx.lineCap = 'round'
  signatureCtx.lineJoin = 'round'
  signatureCtx.lineWidth = 2.6
  signatureCtx.strokeStyle = '#edf2f7'
  signatureCtx.fillStyle = 'rgba(18, 26, 35, 1)'
  signatureCtx.fillRect(0, 0, rect.width, rect.height)
  signatureHasStroke.value = false
}

function getCanvasPoint(event) {
  const canvas = signatureCanvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function startSignature(event) {
  if (!signatureCtx) return
  event.preventDefault()
  signatureDrawing = true
  signatureHasStroke.value = true
  const point = getCanvasPoint(event)
  signatureCtx.beginPath()
  signatureCtx.moveTo(point.x, point.y)
}

function moveSignature(event) {
  if (!signatureDrawing || !signatureCtx) return
  event.preventDefault()
  const point = getCanvasPoint(event)
  signatureCtx.lineTo(point.x, point.y)
  signatureCtx.stroke()
}

function endSignature() {
  signatureDrawing = false
}

function clearSignature() {
  initializeSignatureCanvas()
}

async function confirmSignature() {
  const canvas = signatureCanvasRef.value
  if (!canvas || !signatureHasStroke.value) {
    showToast('请先手写签名')
    return
  }

  const signatureData = canvas.toDataURL('image/png')

  if (signatureMode.value === 'intake') {
    draftIntakeSignature.value = signatureData
    draftIntakeSignedAt.value = new Date().toISOString()
    showSignaturePopup.value = false
    showSuccessToast('接收签字已保存')
    return
  }

  await applyDistributionSignature(signatureData)
  showSignaturePopup.value = false
  showSlipPopup.value = false
  slipRecord.value = null
}

async function applyDistributionSignature(signatureData) {
  const target = signatureTarget.value || slipRecord.value?.target
  if (!target?.ids?.length) return

  const today = getToday()
  const now = new Date().toISOString()
  const ids = target.ids
  const batchIds = Array.from(new Set(records.value.filter(item => ids.includes(item.id)).map(item => item.batchId)))

  await db.transaction('rw', db.records, db.batches, async () => {
    await db.records.where('id').anyOf(ids).modify(record => {
      record.status = 'distributed'
      record.distributedAt = today
      record.distributionSignature = signatureData
      record.distributionSignedAt = now
      if (!record.sentAt) record.sentAt = today
      if (!record.receivedAt) record.receivedAt = today
    })

    await db.batches.where('id').anyOf(batchIds).modify(batch => {
      batch.updatedAt = now
    })
  })

  selectedReceivedIds.value = selectedReceivedIds.value.filter(id => !ids.includes(id))
  await persistSnapshot('已签字并完成发放', '发放已更新到当前页面缓存')
  await loadData()
}

function buildDraftItems() {
  const items = []

  itemTypes.value.forEach(itemType => {
    const quantity = getQuantity(itemType.id)
    if (quantity <= 0) return

    if (itemType.category === 'personal') {
      const pieceDetails = personalPieceDetails.value[itemType.id] || []
      for (let index = 0; index < quantity; index += 1) {
        const piece = pieceDetails[index] || { note: '', photo: '' }
        items.push({
          itemTypeId: itemType.id,
          quantity: 1,
          note: (piece.note || '').trim(),
          photo: piece.photo || '',
          pieceNo: index + 1,
        })
      }
      return
    }

    items.push({
      itemTypeId: itemType.id,
      quantity,
      note: (itemNotes.value[itemType.id] || '').trim(),
      photo: itemPhotos.value[itemType.id] || '',
      pieceNo: null,
    })
  })

  return items
}

function openIntakeSlip() {
  if (!selectedDeptId.value || !selectedStaffId.value) {
    showToast('请先选择部门和人员')
    return
  }
  const items = buildDraftItems()

  if (items.length === 0) {
    showToast('请至少录入一项衣物')
    return
  }

  const itemTypeCounts = {}
  items.forEach(item => {
    itemTypeCounts[item.itemTypeId] = (itemTypeCounts[item.itemTypeId] || 0) + 1
  })

  slipMode.value = 'intake'
  slipRecord.value = {
    deptName: departments.value.find(item => item.id === selectedDeptId.value)?.name || '',
    staffName: selectedStaffName.value,
    items: items.map(item => ({
      ...item,
      itemName: itemTypes.value.find(type => type.id === item.itemTypeId)?.name || '',
      showPieceNo: itemTypeCounts[item.itemTypeId] > 1 && !!item.pieceNo,
    })),
  }
  showSlipPopup.value = true
}

function initIntakeCanvas() {
  const canvas = intakeCanvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * ratio))
  canvas.height = Math.max(1, Math.floor(rect.height * ratio))
  intakeCtx = canvas.getContext('2d')
  if (!intakeCtx) return
  intakeCtx.scale(ratio, ratio)
  intakeCtx.lineCap = 'round'
  intakeCtx.lineJoin = 'round'
  intakeCtx.lineWidth = 2.6
  intakeCtx.strokeStyle = '#edf2f7'
  intakeCtx.fillStyle = 'rgba(18, 26, 35, 1)'
  intakeCtx.fillRect(0, 0, rect.width, rect.height)
  intakeHasStroke.value = false
}

function startIntakeSignature(event) {
  if (!intakeCtx) return
  event.preventDefault()
  const canvas = intakeCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  intakeCtx.beginPath()
  intakeCtx.moveTo(event.clientX - rect.left, event.clientY - rect.top)
  canvas.setPointerCapture(event.pointerId)
}

function moveIntakeSignature(event) {
  if (!intakeCtx || event.buttons === 0) return
  event.preventDefault()
  const rect = intakeCanvasRef.value.getBoundingClientRect()
  intakeCtx.lineTo(event.clientX - rect.left, event.clientY - rect.top)
  intakeCtx.stroke()
  intakeHasStroke.value = true
}

function endIntakeSignature(event) {
  if (!intakeCtx) return
  intakeCtx.closePath()
}

function clearIntakeCanvas() {
  if (!intakeCtx) return
  const canvas = intakeCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  intakeCtx.fillRect(0, 0, rect.width, rect.height)
  intakeHasStroke.value = false
}

function initDistCanvas() {
  const canvas = distCanvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.floor(rect.width * ratio))
  canvas.height = Math.max(1, Math.floor(rect.height * ratio))
  distCtx = canvas.getContext('2d')
  if (!distCtx) return
  distCtx.scale(ratio, ratio)
  distCtx.lineCap = 'round'
  distCtx.lineJoin = 'round'
  distCtx.lineWidth = 2.6
  distCtx.strokeStyle = '#edf2f7'
  distCtx.fillStyle = 'rgba(18, 26, 35, 1)'
  distCtx.fillRect(0, 0, rect.width, rect.height)
  distHasStroke.value = false
}

function startDistSignature(event) {
  if (!distCtx) return
  event.preventDefault()
  const canvas = distCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  distCtx.beginPath()
  distCtx.moveTo(event.clientX - rect.left, event.clientY - rect.top)
  canvas.setPointerCapture(event.pointerId)
}

function moveDistSignature(event) {
  if (!distCtx || event.buttons === 0) return
  event.preventDefault()
  const rect = distCanvasRef.value.getBoundingClientRect()
  distCtx.lineTo(event.clientX - rect.left, event.clientY - rect.top)
  distCtx.stroke()
  distHasStroke.value = true
}

function endDistSignature() {
  if (!distCtx) return
  distCtx.closePath()
}

function clearDistCanvas() {
  if (!distCtx) return
  const canvas = distCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  distCtx.fillRect(0, 0, rect.width, rect.height)
  distHasStroke.value = false
}

function markDistNoSign() {
  distNoSign.value = true
  distHasStroke.value = false
}

function resetDistToCanvas() {
  distNoSign.value = false
  nextTick(() => initDistCanvas())
}

async function confirmDistribution() {
  if (!distHasStroke.value && !distNoSign.value) {
    showToast('请先签字或选择无签字')
    return
  }
  const signatureData = distNoSign.value ? 'NO_SIGNATURE' : distCanvasRef.value.toDataURL('image/png')
  await applyDistributionSignature(signatureData)
  showSlipPopup.value = false
  slipRecord.value = null
}

function onSlipPopupOpen() {
  intakeNoSign.value = false
  distNoSign.value = false
  if (slipMode.value === 'intake') {
    nextTick(() => initIntakeCanvas())
  } else {
    nextTick(() => initDistCanvas())
  }
}

function markIntakeNoSign() {
  intakeNoSign.value = true
  intakeHasStroke.value = false
}

function resetIntakeToCanvas() {
  intakeNoSign.value = false
  nextTick(() => {
    initIntakeCanvas()
  })
}

function confirmAndAddRecord() {
  if (!intakeHasStroke.value && !intakeNoSign.value) {
    showToast('请先签字或选择无签字')
    return
  }
  if (intakeNoSign.value) {
    draftIntakeSignature.value = 'NO_SIGNATURE'
    draftIntakeSignedAt.value = new Date().toISOString()
  } else {
    const canvas = intakeCanvasRef.value
    draftIntakeSignature.value = canvas.toDataURL('image/png')
    draftIntakeSignedAt.value = new Date().toISOString()
  }
  addRecord()
}

function addRecord() {
  if (!draftIntakeSignature.value && !intakeNoSign.value) {
    showToast('请先在面单上签字')
    return
  }

  const items = slipRecord.value?.items?.map(item => ({
    itemTypeId: item.itemTypeId,
    quantity: item.quantity,
    note: item.note || '',
    photo: item.photo || '',
    pieceNo: item.pieceNo || null,
  })) || []

  if (items.length === 0) {
    showToast('请先生成面单')
    return
  }

  currentRecords.value.push({
    departmentId: selectedDeptId.value,
    staffId: selectedStaffId.value,
    intakeSignature: draftIntakeSignature.value,
    intakeSignedAt: draftIntakeSignedAt.value || new Date().toISOString(),
    items,
  })

  showAddForm.value = false
  showSlipPopup.value = false
  slipRecord.value = null
  showSuccessToast('已加入当前批次草稿')
}

function removeRecord(index) {
  currentRecords.value.splice(index, 1)
}

async function persistSnapshot(successMessage, fallbackMessage) {
  const result = await saveToDesktopStorage()
  if (result.success) {
    showSuccessToast(successMessage)
    return true
  }

  showFailToast(`${fallbackMessage}，${result.error || '未写入桌面数据文件'}`)
  return false
}

async function submitBatch() {
  if (currentRecords.value.length === 0) {
    showToast('请先添加批次内容')
    return
  }

  saving.value = true
  const batchId = uuidv4()
  const now = new Date().toISOString()
  const batch = {
    id: batchId,
    sendDate: receivedDate.value,
    note: batchNote.value.trim(),
    createdAt: now,
    updatedAt: now,
  }

  const batchRecords = []
  currentRecords.value.forEach(record => {
    record.items.forEach(item => {
      batchRecords.push({
        id: uuidv4(),
        batchId,
        departmentId: record.departmentId,
        staffId: record.staffId,
        itemTypeId: item.itemTypeId,
        quantity: item.quantity,
        note: item.note || '',
        photo: item.photo || '',
        pieceNo: item.pieceNo || null,
        intakeSignature: record.intakeSignature || '',
        intakeSignedAt: record.intakeSignedAt || '',
        distributionSignature: '',
        distributionSignedAt: '',
        status: 'pending',
        createdAt: now,
        sentAt: '',
        receivedAt: '',
        distributedAt: '',
      })
    })
  })

  await db.transaction('rw', db.batches, db.records, async () => {
    await db.batches.add(batch)
    await db.records.bulkAdd(batchRecords)
  })

  saving.value = false
  await persistSnapshot('批次已创建，当前处于待送洗', '批次已保存在当前页面缓存')

  currentRecords.value = []
  batchNote.value = ''
  receivedDate.value = getToday()
  clearIntakeDraftStorage()
  await loadData()
  scrollToSection('pending')
}

async function advanceRecords(sourceStatus, ids) {
  if (ids.length === 0) {
    showToast('请先勾选要处理的衣物')
    return
  }

  const today = getToday()
  const now = new Date().toISOString()
  const recordList = await db.records.where('id').anyOf(ids).toArray()
  const batchIds = Array.from(new Set(recordList.map(item => item.batchId)))

  await db.transaction('rw', db.records, db.batches, async () => {
    await db.records.where('id').anyOf(ids).modify(record => {
      if (sourceStatus === 'pending') {
        record.status = 'washed'
        record.sentAt = today
      }

      if (sourceStatus === 'washed') {
        record.status = 'received'
        record.receivedAt = today
        if (!record.sentAt) record.sentAt = today
      }

    })

    await db.batches.where('id').anyOf(batchIds).modify(batch => {
      batch.updatedAt = now
    })
  })

  await persistSnapshot('流程状态已更新', '状态已更新到当前页面缓存')

  if (sourceStatus === 'pending') selectedPendingIds.value = []
  if (sourceStatus === 'washed') selectedWashedIds.value = []

  await loadData()
}

function goBatchDetail(batchId) {
  sessionStorage.setItem('send-active-section', activeSection.value)
  router.push(`/batch/${batchId}`)
}

function toggleSelection(listRef, id) {
  if (listRef.value.includes(id)) {
    listRef.value = listRef.value.filter(item => item !== id)
    return
  }
  listRef.value = [...listRef.value, id]
}

function getSelectionCount(status) {
  if (status === 'pending') return selectedPendingIds.value.length
  if (status === 'washed') return selectedWashedIds.value.length
  return selectedReceivedIds.value.length
}

function hasStageContent(status) {
  return getStageGroups(status).length > 0
}

function canAdvanceStage(status) {
  return hasStageContent(status) && getSelectionCount(status) > 0
}

function getPersonSelectedIds(status, person) {
  const selectedSet = new Set(getSelectionListRef(status).value)
  return person.items.filter(item => selectedSet.has(item.id)).map(item => item.id)
}

function getPersonSelectedCount(status, person) {
  return getPersonSelectedIds(status, person).length
}

function getGroupSelectedCount(status, group) {
  const selectedSet = new Set(getSelectionListRef(status).value)
  return group.people.flatMap(person => person.items).filter(item => selectedSet.has(item.id)).length
}

function isPersonFullySelected(status, person) {
  return person.items.length > 0 && getPersonSelectedCount(status, person) === person.items.length
}

function isGroupFullySelected(status, group) {
  const total = group.people.reduce((sum, person) => sum + person.items.length, 0)
  return total > 0 && getGroupSelectedCount(status, group) === total
}

function togglePersonSelection(status, person) {
  const listRef = getSelectionListRef(status)
  const selectedSet = new Set(listRef.value)
  const ids = person.items.map(item => item.id)
  const shouldSelectAll = ids.some(id => !selectedSet.has(id))

  if (shouldSelectAll) {
    ids.forEach(id => selectedSet.add(id))
  } else {
    ids.forEach(id => selectedSet.delete(id))
  }

  listRef.value = Array.from(selectedSet)
}

function toggleGroupSelection(status, group) {
  const listRef = getSelectionListRef(status)
  const selectedSet = new Set(listRef.value)
  const ids = group.people.flatMap(person => person.items.map(item => item.id))
  const shouldSelectAll = ids.some(id => !selectedSet.has(id))

  if (shouldSelectAll) {
    ids.forEach(id => selectedSet.add(id))
  } else {
    ids.forEach(id => selectedSet.delete(id))
  }

  listRef.value = Array.from(selectedSet)
}

function selectAllStage(status) {
  const groups = getStageGroups(status)
  const allIds = groups.flatMap(group => group.people.flatMap(person => person.items.map(item => item.id)))
  const listRef = getSelectionListRef(status)
  const currentSet = new Set(listRef.value)
  const allSelected = allIds.length > 0 && allIds.every(id => currentSet.has(id))

  if (allSelected) {
    listRef.value = []
  } else {
    listRef.value = allIds
  }
}

function isAllStageSelected(status) {
  const groups = getStageGroups(status)
  const allIds = groups.flatMap(group => group.people.flatMap(person => person.items.map(item => item.id)))
  if (allIds.length === 0) return false
  const currentSet = new Set(getSelectionListRef(status).value)
  return allIds.every(id => currentSet.has(id))
}

function openDraftDetail(record) {
  selectedDraftRecord.value = {
    ...record,
    enrichedItems: record.items.map(item => ({
      ...item,
      itemName: itemTypes.value.find(t => t.id === item.itemTypeId)?.name || '未知',
    })),
  }
  showDraftDetailPopup.value = true
}

function getStageTitle(status) {
  if (status === 'pending') return '待送洗'
  if (status === 'washed') return '待领取'
  return '待发放'
}

function getStageDescription(status) {
  if (status === 'pending') return '按批次、按人勾选送洗。'
  if (status === 'washed') return '按照片和备注核对领取。'
  return '按人签字后逐件发放。'
}

function getActionText(status) {
  if (status === 'pending') return '确认送洗'
  if (status === 'washed') return '确认领取'
  return '签字发放'
}

function getLedgerTitle(status) {
  if (status === 'pending') return '送洗台账'
  if (status === 'washed') return '领取台账'
  return '发放台账'
}

function getSelectionListRef(status) {
  if (status === 'pending') return selectedPendingIds
  if (status === 'washed') return selectedWashedIds
  return selectedReceivedIds
}

function getStageGroups(status) {
  if (status === 'pending') return pendingGroups.value
  if (status === 'washed') return washedGroups.value
  return receivedGroups.value
}

function getStageDateLabel(status, item) {
  if (status === 'pending') return ''
  if (status === 'washed') return `送洗日期：${item.sentAt || '未记录'}`
  return `领取日期：${item.receivedAt || '未记录'}`
}

function getRecordDisplayTitle(item) {
  const pieceText = item.showPieceNo ? ` · 第${item.pieceNo}件` : ''
  return `${item.itemName}${pieceText}`
}

function buildStageLedgerText(status) {
  const groups = getStageGroups(status)
  if (groups.length === 0) return ''

  if (status === 'washed') {
    const dateMap = new Map()
    groups.forEach(group => {
      group.people.forEach(person => {
        person.items.forEach(item => {
          const date = item.sentAt || '未知日期'
          if (!dateMap.has(date)) dateMap.set(date, new Map())
          const itemMap = dateMap.get(date)
          itemMap.set(item.itemName, (itemMap.get(item.itemName) || 0) + item.quantity)
        })
      })
    })

    let totalQty = 0
    const lines = ['送洗对账单']
    Array.from(dateMap.keys()).sort().forEach(date => {
      lines.push(`送洗时间：${date}`)
      lines.push('')
      Array.from(dateMap.get(date).entries())
        .sort((a, b) => b[1] - a[1])
        .forEach(([name, qty]) => {
          lines.push(`${name} x${qty}`)
          totalQty += qty
        })
      lines.push('')
    })
    lines.push(`合计：${totalQty} 件`)
    return lines.join('\n').trim()
  }

  const lines = [`${getLedgerTitle(status)}（生成时间：${getToday()}）`, '']

  groups.forEach(group => {
    lines.push(group.batchCode ? `批次 ${group.batchCode}｜接收日期：${group.batchDate}` : `接收日期：${group.batchDate}`)
    if (group.batchNote) {
      lines.push(`备注：${group.batchNote}`)
    }

    group.people.forEach(person => {
      lines.push(`${person.deptName}｜${person.staffName}`)
      person.items.forEach(item => {
        const extras = []
        if (item.pieceNo) extras.push(`第${item.pieceNo}件`)
        if (item.note) extras.push(`备注：${item.note}`)
        if (item.photo) extras.push('有照片')
        const suffix = extras.length > 0 ? `（${extras.join('，')}）` : ''
        lines.push(`- ${item.itemName} x${item.quantity}${suffix}`)
      })
    })

    lines.push('')
  })

  return lines.join('\n').trim()
}

async function copyText(text) {
  if (!text) return false

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

async function copyStageLedger(status) {
  const text = buildStageLedgerText(status)
  if (!text) {
    showToast(`当前没有${getStageTitle(status)}的内容可复制`)
    return
  }

  const success = await copyText(text)
  if (success) {
    showSuccessToast(`${getLedgerTitle(status)}已复制`)
  } else {
    showFailToast('复制失败，请重试')
  }
}

function scrollToSection(key) {
  activeSection.value = key
}
</script>

<template>
  <div class="page">
    <div class="workflow-layout">
      <aside class="workflow-nav" :class="navDensityClass">
        <div class="process-rail process-rail--side">
          <article
            v-for="metric in workflowMetrics"
            :key="metric.key"
            class="process-step"
            :class="{ 'is-active': activeSection === metric.key }"
          >
            <button type="button" class="process-step__jump" @click="scrollToSection(metric.key)">
              <span class="process-step__index">{{ metric.value }}</span>
              <span class="process-step__text">
                <strong>{{ metric.title }}</strong>
                <span>{{ metric.hint }}</span>
              </span>
            </button>

          </article>
        </div>
      </aside>

      <div class="workflow-main">
        <div class="section-stack">
          <section v-show="activeSection === 'create'" id="section-create" class="planner-shell">
            <div class="section-heading">
              <div>
                <h3 class="section-heading__title">接收建批</h3>
              </div>
            </div>

            <article class="planner-card planner-card--full">
              <div class="intake-bar">
                <button type="button" class="intake-bar__cell" @click="showDatePicker = true">
                  <span>日期</span>
                  <strong>{{ receivedDate }}</strong>
                </button>
                <div class="intake-bar__cell">
                  <span>人 / 件</span>
                  <strong>{{ draftPeopleCount }} / {{ draftItemCount }}</strong>
                </div>
                <button type="button" class="intake-bar__cell" @click="openNoteEditor">
                  <span>备注</span>
                  <strong :class="{ 'intake-bar__placeholder': !batchNote }">{{ batchNote || '添加' }}</strong>
                </button>
                <div class="intake-bar__actions">
                  <van-button type="primary" round size="small" @click="openAddForm">添加衣物</van-button>
                  <van-button plain type="primary" round size="small" @click="saveIntakeDraft">保存草稿</van-button>
                  <van-button
                    round
                    size="small"
                    :type="canSubmitDraft ? 'primary' : 'default'"
                    :plain="!canSubmitDraft"
                    :disabled="!canSubmitDraft"
                    :loading="saving"
                    @click="submitBatch"
                  >提交批次</van-button>
                </div>
              </div>

              <div v-if="draftSavedAt" class="planner-draft-meta">最近保存：{{ formatDraftSavedAt(draftSavedAt) }}</div>

              <div class="draft-preview-head">
                <strong>草稿明细</strong>
                <span>{{ recordsSummary.length ? `已加入 ${recordsSummary.length} 人` : '暂时还没有人员衣物' }}</span>
              </div>

              <div v-if="recordsSummary.length > 0" class="draft-preview-list">
                <article
                  v-for="(record, index) in recordsSummary"
                  :key="`${record.staffId}-${index}`"
                  class="draft-preview-item"
                  @click="openDraftDetail(record)"
                >
                  <div class="draft-preview-item__head">
                    <div>
                      <strong>{{ record.staffName }}</strong>
                      <span>{{ record.deptName }}</span>
                    </div>
                    <van-button plain size="small" type="danger" round @click.stop="removeRecord(record.rawIndex)">移除</van-button>
                  </div>
                  <div class="draft-preview-item__meta">{{ record.itemsText }}</div>
                  <div v-if="record.photos.length" class="draft-preview-item__photos">
                    <img v-for="photo in record.photos" :key="photo.src" :src="photo.src" :alt="photo.label" class="draft-preview-item__photo zoomable-photo" @click.stop="openPhotoViewer(photo.src)" />
                  </div>
                  <div v-if="record.intakeSignature === 'NO_SIGNATURE'" class="draft-preview-item__signature draft-preview-item__signature--none">无签字 · {{ record.intakeSignedLabel }}</div>
                  <div v-else-if="record.intakeSignature" class="draft-preview-item__signature">面单已签字 · {{ record.intakeSignedLabel }}</div>
                </article>
              </div>
              <van-empty v-else description="草稿里还没有人员衣物" />
            </article>
          </section>

          <section
            v-for="stage in ['pending', 'washed', 'received']"
            :id="`section-${stage}`"
            :key="stage"
            v-show="activeSection === stage"
            class="workflow-section"
            :class="{ 'workflow-section--empty': getStageGroups(stage).length === 0 }"
          >
            <div class="section-heading">
              <h3 class="section-heading__title">
                {{ getStageTitle(stage) }}
                <span class="section-heading__count">{{ getStageGroups(stage).reduce((s, g) => s + g.totalCount, 0) }} 件</span>
              </h3>
            </div>

            <div v-if="getStageGroups(stage).length > 0 && stage !== 'received'" class="stage-action-bar">
              <van-button plain round size="small" type="primary" @click="selectAllStage(stage)">
                {{ isAllStageSelected(stage) ? '取消全选' : '全选' }}
              </van-button>
              <van-button
                v-if="stage === 'washed'"
                plain round size="small"
                :type="hasStageContent(stage) ? 'primary' : 'default'"
                :disabled="!hasStageContent(stage)"
                @click="copyStageLedger(stage)"
              >复制台账</van-button>
              <van-button
                round size="small"
                :type="canAdvanceStage(stage) ? 'primary' : 'default'"
                :plain="!canAdvanceStage(stage)"
                :disabled="!canAdvanceStage(stage)"
                @click="advanceRecords(stage, getSelectionListRef(stage).value)"
              >{{ getActionText(stage) }}{{ getSelectionCount(stage) ? ` (${getSelectionCount(stage)})` : '' }}</van-button>
            </div>

            <div v-if="getStageGroups(stage).length === 0" class="stage-empty-hint">暂无</div>

            <div v-else class="lane-stack">
              <article v-for="group in getStageGroups(stage)" :key="group.batchId" class="lane-card">
                <div class="lane-card__head">
                  <div>
                    <button type="button" class="lane-card__title-button" @click="goBatchDetail(group.batchId)">{{ group.batchLabel }}</button>
                    <div v-if="group.batchNote" class="lane-card__note">{{ group.batchNote }}</div>
                  </div>
                  <div class="lane-card__actions">
                    <van-button
                      v-if="stage !== 'received'"
                      plain
                      round
                      size="small"
                      type="primary"
                      @click.stop="toggleGroupSelection(stage, group)"
                    >
                      {{ isGroupFullySelected(stage, group) ? '取消全选' : '全选此批' }}
                    </van-button>
                  </div>
                </div>

                <van-checkbox-group
                  v-if="stage !== 'received'"
                  :model-value="getSelectionListRef(stage).value"
                  class="lane-list"
                  @update:model-value="value => { getSelectionListRef(stage).value = value }"
                >
                  <article v-for="person in group.people" :key="person.key" class="person-panel">
                    <div class="person-panel__head">
                      <div>
                        <div class="person-panel__title">{{ person.staffName }}</div>
                        <div class="person-panel__meta">{{ person.deptName }}</div>
                      </div>
                      <div class="person-panel__actions">
                        <van-button
                          plain
                          size="small"
                          round
                          type="primary"
                          @click.stop="togglePersonSelection(stage, person)"
                        >
                          {{ isPersonFullySelected(stage, person) ? '取消' : '全选' }}
                        </van-button>
                      </div>
                    </div>

                    <div class="person-panel__items">
                      <div
                        v-for="item in person.items"
                        :key="item.id"
                        class="record-card"
                        @click="toggleSelection(getSelectionListRef(stage), item.id)"
                      >
                        <van-checkbox :name="item.id" @click.stop />
                        <div class="record-card__body">
                          <div class="record-card__title-row">
                            <strong>{{ getRecordDisplayTitle(item) }}</strong>
                          </div>
                          <div v-if="getStageDateLabel(stage, { ...item, batchDate: group.batchDate })" class="record-card__meta">
                            {{ getStageDateLabel(stage, { ...item, batchDate: group.batchDate }) }}
                          </div>
                          <div v-if="item.note" class="record-card__note">备注：{{ item.note }}</div>
                          <img v-if="item.photo" :src="item.photo" class="record-card__photo zoomable-photo" @click.stop="openPhotoViewer(item.photo)" />
                        </div>
                      </div>
                    </div>
                  </article>
                </van-checkbox-group>

                <div v-else class="lane-list">
                  <article v-for="person in group.people" :key="person.key" class="person-panel">
                    <div class="person-panel__head">
                      <div>
                        <div class="person-panel__title">{{ person.staffName }}</div>
                        <div class="person-panel__meta">{{ person.deptName }}</div>
                      </div>
                      <div class="person-panel__actions">
                        <van-button
                          type="primary"
                          size="small"
                          round
                          @click.stop="openDistributionSlip(group, person)"
                        >签字发放</van-button>
                      </div>
                    </div>

                    <div class="person-panel__items">
                      <div
                        v-for="item in person.items"
                        :key="item.id"
                        class="record-card"
                      >
                        <div class="record-card__body">
                          <div class="record-card__title-row">
                            <strong>{{ getRecordDisplayTitle(item) }}</strong>
                          </div>
                          <div v-if="item.note" class="record-card__note">备注：{{ item.note }}</div>
                          <img v-if="item.photo" :src="item.photo" class="record-card__photo zoomable-photo" @click.stop="openPhotoViewer(item.photo)" />
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>

    <van-popup v-model:show="showDatePicker" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showDatePicker = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">选择接收日期</div>
        </div>
        <van-date-picker
          v-model="datePickerModel"
          :min-date="new Date(2025, 0, 1)"
          :max-date="new Date(2030, 11, 31)"
          :show-toolbar="false"
        />
        <div class="bottom-actions" style="margin-top: 24px">
          <van-button block type="primary" @click="onDateConfirm({ selectedValues: datePickerModel })">确认选择</van-button>
        </div>
      </div>
    </van-popup>

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
          placeholder="输入本批次说明，比如只是接收、急件、私人衣物等"
          show-word-limit
        />
        <div class="bottom-actions">
          <van-button block type="primary" @click="saveNote">保存备注</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showAddForm" position="bottom" :style="{ height: '100%' }" class="add-form-popup popup-fullpage">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showAddForm = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">{{ selectedStaffId ? selectedStaffName : '添加接收衣物' }}</div>
          <button
            v-if="selectedStaffId"
            type="button"
            class="popup-page-header__action"
            @click="selectedStaffId = null; selectedDeptId = null; selectedItems = {}; itemNotes = {}; itemPhotos = {}; personalPieceDetails = {}"
          >换人</button>
        </div>

        <template v-if="!selectedStaffId">
          <div class="staff-picker">
            <div v-for="group in staffByInitial" :key="group.initial" class="staff-picker__group">
              <div class="staff-picker__dept">{{ group.initial }}</div>
              <div class="staff-picker__list">
                <button
                  v-for="staff in group.members"
                  :key="staff.id"
                  type="button"
                  class="staff-chip"
                  @click="selectStaffDirect(staff)"
                >
                  {{ staff.name }}
                </button>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div style="margin-top: 12px">
          <div
            v-for="group in groupedItemTypes"
            :key="group.key"
            class="item-type-group"
          >
            <div class="item-type-group__label">{{ group.label }}</div>
            <div class="item-type-group__body">
              <div v-for="item in group.items" :key="item.id" class="item-row">
                <div class="item-row__main">
                  <div class="item-row__name">{{ item.name }}</div>
                  <van-stepper
                    :model-value="getQuantity(item.id)"
                    min="0"
                    :default-value="0"
                    input-width="56px"
                    button-size="36px"
                    @update:model-value="value => onItemQuantityChange(item, value)"
                  />
                </div>

                <div v-if="item.category !== 'personal' && getQuantity(item.id) > 0" class="item-extra-block">
                  <div class="item-extra-row">
                    <van-button size="small" round type="primary" plain @click.stop="openCameraCapture(item.id)">
                      打开相机
                    </van-button>
                    <label class="photo-btn">
                      <van-icon name="photograph" size="18" />
                      {{ itemPhotos[item.id] ? '重新上传' : '上传照片' }}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        style="display: none"
                        @change="handlePhoto(item.id, $event)"
                      />
                    </label>
                    <span v-if="itemPhotos[item.id]" class="photo-remove" @click.stop="removePhoto(item.id)">删除</span>
                  </div>
                  <input
                    v-model="itemNotes[item.id]"
                    class="item-note-input"
                    placeholder="备注：补充说明"
                  />
                  <img v-if="itemPhotos[item.id]" :src="itemPhotos[item.id]" class="item-photo-preview" />
                </div>

                <div v-if="item.category === 'personal' && getQuantity(item.id) > 0" class="piece-editor">
                  <div class="piece-editor__tip">个人衣物按件登记，后续会按照片逐件处理。</div>
                  <div
                    v-for="pieceIndex in getQuantity(item.id)"
                    :key="`${item.id}-${pieceIndex}`"
                    class="piece-card"
                  >
                    <div class="piece-card__head">
                      <strong>第 {{ pieceIndex }} 件</strong>
                    </div>
                    <div class="item-extra-row">
                      <van-button size="small" round type="primary" plain @click.stop="openCameraCapture(item.id, pieceIndex - 1)">
                        打开相机
                      </van-button>
                      <label class="photo-btn">
                        <van-icon name="photograph" size="18" />
                        {{ getPieceDetail(item.id, pieceIndex - 1).photo ? '重新上传' : '上传照片' }}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          style="display: none"
                          @change="handlePhoto(item.id, $event, pieceIndex - 1)"
                        />
                      </label>
                      <span
                        v-if="getPieceDetail(item.id, pieceIndex - 1).photo"
                        class="photo-remove"
                        @click.stop="removePhoto(item.id, pieceIndex - 1)"
                      >
                        删除
                      </span>
                    </div>
                    <input
                      :value="getPieceDetail(item.id, pieceIndex - 1).note"
                      class="item-note-input"
                      placeholder="备注：颜色、品牌、位置、特征"
                      @input="updatePieceNote(item.id, pieceIndex - 1, $event.target.value)"
                    />
                    <img
                      v-if="getPieceDetail(item.id, pieceIndex - 1).photo"
                      :src="getPieceDetail(item.id, pieceIndex - 1).photo"
                      class="item-photo-preview"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>

          <div class="bottom-actions">
            <van-button block type="primary" @click="openIntakeSlip">生成面单</van-button>
          </div>
        </template>
      </div>
    </van-popup>

    <van-popup
      v-model:show="showSlipPopup"
      position="bottom"
      class="popup-fullpage"
      :style="{ height: '100%' }"
      @opened="onSlipPopupOpen"
    >
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showSlipPopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">{{ slipMode === 'intake' ? '接收面单' : '发放面单' }}</div>
        </div>
        <template v-if="slipRecord">
          <div class="slip-card">
            <div class="slip-card__head">
              <div>
                <div class="slip-card__name">{{ slipRecord.staffName }}</div>
                <div class="slip-card__meta">{{ slipRecord.deptName }}</div>
              </div>
              <div class="slip-card__badge">{{ slipMode === 'intake' ? '待接收确认' : '待发放确认' }}</div>
            </div>

            <div class="slip-card__list">
              <div v-for="(item, index) in slipRecord.items" :key="`${item.itemTypeId || item.id}-${index}`" class="slip-card__item">
                <strong>{{ item.itemName || getRecordDisplayTitle(item) }}</strong>
                <span v-if="item.showPieceNo">第{{ item.pieceNo }}件</span>
                <span>x{{ item.quantity }}</span>
                <span v-if="item.note">备注：{{ item.note }}</span>
              </div>
            </div>

            <!-- 接收模式：签字画板内嵌 -->
            <section v-if="slipMode === 'intake'" class="signature-panel">
              <div class="signature-panel__toolbar">
                <div class="signature-panel__title">员工签字确认</div>
                <div class="signature-panel__actions">
                  <button type="button" class="signature-panel__link" @click="markIntakeNoSign">无签字</button>
                  <button type="button" class="signature-panel__link" @click="resetIntakeToCanvas">清空重签</button>
                </div>
              </div>
              <div class="signature-board">
                <div v-if="intakeNoSign" class="signature-board__no-sign-overlay">无签字</div>
                <canvas
                  v-show="!intakeNoSign"
                  ref="intakeCanvasRef"
                  class="signature-board__canvas"
                  @pointerdown="startIntakeSignature"
                  @pointermove="moveIntakeSignature"
                  @pointerup="endIntakeSignature"
                  @pointerleave="endIntakeSignature"
                  @pointercancel="endIntakeSignature"
                />
              </div>
            </section>

            <!-- 发放模式：内嵌签字画板 -->
            <section v-else class="signature-panel">
              <div class="signature-panel__toolbar">
                <div class="signature-panel__title">员工签字确认</div>
                <div class="signature-panel__actions">
                  <button type="button" class="signature-panel__link" @click="markDistNoSign">无签字</button>
                  <button type="button" class="signature-panel__link" @click="resetDistToCanvas">清空重签</button>
                </div>
              </div>
              <div class="signature-board">
                <div v-if="distNoSign" class="signature-board__no-sign-overlay">无签字</div>
                <canvas
                  v-show="!distNoSign"
                  ref="distCanvasRef"
                  class="signature-board__canvas"
                  @pointerdown="startDistSignature"
                  @pointermove="moveDistSignature"
                  @pointerup="endDistSignature"
                  @pointerleave="endDistSignature"
                  @pointercancel="endDistSignature"
                />
              </div>
            </section>
          </div>
        </template>

        <div class="bottom-actions">
          <van-button v-if="slipMode === 'intake'" block type="primary" @click="confirmAndAddRecord">确认无误</van-button>
          <van-button v-if="slipMode !== 'intake'" block type="primary" @click="confirmDistribution">确认发放</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showDraftDetailPopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showDraftDetailPopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">草稿明细</div>
        </div>
        <template v-if="selectedDraftRecord">
          <div class="draft-person-header">
            <div class="draft-person-header__name">{{ selectedDraftRecord.staffName }}</div>
            <div class="draft-person-header__dept">{{ selectedDraftRecord.deptName }}</div>
          </div>

          <div class="detail-item-list">
            <div
              v-for="(item, i) in selectedDraftRecord.enrichedItems"
              :key="i"
              class="detail-item-row"
            >
              <div class="detail-item-row__head">
                <span class="detail-item-row__name">{{ item.itemName }}{{ item.pieceNo ? ` · 第${item.pieceNo}件` : '' }}</span>
                <span class="detail-item-row__qty">x{{ item.quantity }}</span>
              </div>
              <div v-if="item.note" class="detail-item-row__note">{{ item.note }}</div>
              <img v-if="item.photo" :src="item.photo" class="detail-item-row__photo zoomable-photo" @click="openPhotoViewer(item.photo)" />
            </div>
          </div>

          <div v-if="selectedDraftRecord.intakeSignature === 'NO_SIGNATURE'" class="draft-signature-section">
            <div class="draft-signature-section__label">接收签字{{ selectedDraftRecord.intakeSignedLabel ? ' · ' + selectedDraftRecord.intakeSignedLabel : '' }}</div>
            <div class="signature-no-sign">无签字</div>
          </div>
          <div v-else-if="selectedDraftRecord.intakeSignature" class="draft-signature-section">
            <div class="draft-signature-section__label">接收签字{{ selectedDraftRecord.intakeSignedLabel ? ' · ' + selectedDraftRecord.intakeSignedLabel : '' }}</div>
            <img :src="selectedDraftRecord.intakeSignature" class="signature-preview" />
          </div>
        </template>
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

    <van-popup v-model:show="showSignaturePopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showSignaturePopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">{{ signatureTitle }}</div>
        </div>

        <div class="signature-dialog">
          <div class="signature-dialog__desc">{{ signatureHint }}</div>

          <div class="signature-board">
            <canvas
              ref="signatureCanvasRef"
              class="signature-board__canvas"
              @pointerdown="startSignature"
              @pointermove="moveSignature"
              @pointerup="endSignature"
              @pointerleave="endSignature"
              @pointercancel="endSignature"
            />
          </div>

          <div class="bottom-actions">
            <van-button block plain type="primary" @click="clearSignature">清空重签</van-button>
            <van-button block type="primary" @click="confirmSignature">保存签字</van-button>
          </div>
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
