<script setup>
defineOptions({ name: 'Send' })
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { v4 as uuidv4 } from 'uuid'
import { showFailToast, showSuccessToast, showToast } from 'vant'
import { db } from '../db/index.js'
import { buildBatchCodeMap, getBatchDisplayLabel } from '../utils/batchDisplay.js'
import { saveToDesktopStorage } from '../utils/desktopStorage.js'
import { fireConfetti } from '../utils/confetti.js'
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
const unlockedItems = ref({})
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
const receivedTab = ref('batch')
const sortingExpanded = ref({})
const sortedItemIds = ref(new Set())
const showSortingPersonPopup = ref(false)
const sortingPersonDetail = ref(null)

const pendingTab = ref('batch')
const priceTables = ref([])
const selectedPriceTableId = ref(null)
const pendingSignIds = ref(new Set())
const showPendingSignPopup = ref(false)
const pendingSignCanvasRef = ref(null)
const pendingSignHasStroke = ref(false)
const pendingSignNoSign = ref(false)
let pendingSignCtx = null

const washedTab = ref('batch')
const washedSortExpanded = ref({})
const washedSignIds = ref(new Set())
const showWashedSignPopup = ref(false)
const washedSignCanvasRef = ref(null)
const washedSignHasStroke = ref(false)
const washedSignNoSign = ref(false)
let washedSignCtx = null


function drawSignWatermark(ctx, w, h) {
  ctx.save()
  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)'
  ctx.font = '28px "Microsoft YaHei UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('签字区', w / 2, h / 2)
  ctx.restore()
}

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
const editorDraftStorageKey = 'laundry-editor-draft-v1'

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

watch(currentRecords, () => {
  saveIntakeDraft()
}, { deep: true })


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
  priceTables.value = await db.priceTables.toArray()
  if (!selectedPriceTableId.value && priceTables.value.length > 0) {
    selectedPriceTableId.value = priceTables.value[0].id
  }
}

async function loadData() {
  await refreshData()
  restoreIntakeDraft()
  restoreEditorDraft()
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

const editorRecords = ref([])

watch(editorRecords, () => {
  try { window.localStorage.setItem('laundry-editor-draft-v1', JSON.stringify(editorRecords.value)) } catch {}
}, { deep: true })

const editorSummary = computed(() => {
  return editorRecords.value.map((record, index) => {
    const staff = staffList.value.find(s => s.id === record.staffId)
    const dept = departments.value.find(d => d.id === record.departmentId)
    const itemsText = record.items
      .map(item => {
        const type = itemTypes.value.find(t => t.id === item.itemTypeId)
        const name = type?.name || ''
        // Count how many records this person has for the same itemType
        const sameTypeCount = record.items.filter(i => i.itemTypeId === item.itemTypeId).length
        const piece = sameTypeCount > 1 && item.pieceNo ? `（第${item.pieceNo}件）` : ''
        const qty = !item.pieceNo && item.quantity > 1 ? ` x${item.quantity}` : ''
        return `${name}${piece}${qty}`
      })
      .join('；')
    const totalQty = record.items.reduce((s, i) => s + i.quantity, 0)
    return {
      ...record,
      index,
      staffName: staff?.name || '',
      deptName: dept?.name || '',
      itemsText,
      totalQty,
      hasSignature: !!record.intakeSignature,
      isNoSign: record.intakeSignature === 'NO_SIGNATURE',
      intakeSignedLabel: record.intakeSignedAt ? new Date(record.intakeSignedAt).toLocaleString('zh-CN', {
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
      }) : '',
    }
  })
})

function addAllToBatch() {
  if (editorRecords.value.length === 0) {
    showToast('编辑台没有记录')
    return
  }
  currentRecords.value.push(...editorRecords.value)
  editorRecords.value = []
  showSuccessToast(`已全部加入本批次`)
}

function addOneToBatch(index) {
  const record = editorRecords.value[index]
  if (!record) return
  currentRecords.value.push(record)
  editorRecords.value.splice(index, 1)
  showSuccessToast('已加入本批次')
}

function removeEditorRecord(index) {
  editorRecords.value.splice(index, 1)
}

function toggleItemLock(itemId) {
  unlockedItems.value[itemId] = !unlockedItems.value[itemId]
}

function clearEditor() {
  selectedDeptId.value = null
  selectedStaffId.value = null
  selectedItems.value = {}
  itemNotes.value = {}
  unlockedItems.value = {}
  itemPhotos.value = {}
  personalPieceDetails.value = {}
  draftIntakeSignature.value = ''
  draftIntakeSignedAt.value = ''
}

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
        const name = type?.name || ''
        const sameTypeCount = record.items.filter(i => i.itemTypeId === item.itemTypeId).length
        const piece = sameTypeCount > 1 && item.pieceNo ? `（第${item.pieceNo}件）` : ''
        const qty = !item.pieceNo && item.quantity > 1 ? ` x${item.quantity}` : ''
        const extras = []
        if (item.photo) extras.push('有照片')
        if (item.note) extras.push('有备注')
        const suffix = extras.length > 0 ? ` [${extras.join('/')}]` : ''
        return `${name}${piece}${qty}${suffix}`
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
        label: `${itemTypes.value.find(t => t.id === item.itemTypeId)?.name || ''}`,
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
    hint: draftPeopleCount.value > 0 ? `${draftItemCount.value} 件草稿` : '登记衣物',
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

const sortingGroups = computed(() => {
  const typeMap = new Map()
  receivedGroups.value.forEach(group => {
    group.people.forEach(person => {
      person.items.forEach(item => {
        const key = item.itemName || '未知'
        if (!typeMap.has(key)) typeMap.set(key, [])
        typeMap.get(key).push({
          ...item,
          staffName: person.staffName,
          deptName: person.deptName,
        })
      })
    })
  })
  return Array.from(typeMap.entries())
    .map(([typeName, items]) => ({
      typeName,
      count: items.length,
      items: items.sort((a, b) => (a.staffName || '').localeCompare(b.staffName || '', 'zh-Hans-CN')),
      allSorted: items.length > 0 && items.every(i => sortedItemIds.value.has(i.id)),
    }))
    .sort((a, b) => b.count - a.count)
})

function toggleSortingGroup(typeName) {
  sortingExpanded.value[typeName] = !sortingExpanded.value[typeName]
}

function toggleSorted(itemId) {
  const s = new Set(sortedItemIds.value)
  if (s.has(itemId)) {
    s.delete(itemId)
  } else {
    s.add(itemId)
  }
  sortedItemIds.value = s

  // Check if any person just became fully sorted
  sortingPersons.value.forEach(p => {
    if (p.allSorted && p.items.some(i => i.id === itemId)) {
      showSuccessToast(`${p.staffName} 布草已全部分拣`)
    }
  })
}

function resetSorting() {
  sortedItemIds.value = new Set()
  showSuccessToast('已重置分拣状态')
}

const sortingPersons = computed(() => {
  const personMap = new Map()
  receivedGroups.value.forEach(group => {
    group.people.forEach(person => {
      person.items.forEach(item => {
        const key = item.staffId
        if (!personMap.has(key)) {
          personMap.set(key, { staffId: key, staffName: person.staffName, deptName: person.deptName, items: [] })
        }
        personMap.get(key).items.push({ ...item, staffName: person.staffName, deptName: person.deptName })
      })
    })
  })
  return Array.from(personMap.values())
    .map(p => ({
      ...p,
      totalQty: p.items.length,
      sortedQty: p.items.filter(i => sortedItemIds.value.has(i.id)).length,
      allSorted: p.items.length > 0 && p.items.every(i => sortedItemIds.value.has(i.id)),
    }))
    .sort((a, b) => a.staffName.localeCompare(b.staffName, 'zh-Hans-CN'))
})

const pendingSignPersons = computed(() => {
  return sortingPersons.value.filter(p => p.allSorted)
})

const pendingSignByDept = computed(() => {
  const deptOrder = new Map(departments.value.map((d, i) => [d.name, i]))
  const deptMap = new Map()
  pendingSignPersons.value.forEach(p => {
    const deptName = p.deptName || '未知部门'
    if (!deptMap.has(deptName)) deptMap.set(deptName, [])
    deptMap.get(deptName).push(p)
  })
  return Array.from(deptMap.entries())
    .map(([deptName, persons]) => ({ deptName, persons }))
    .sort((a, b) => (deptOrder.get(a.deptName) ?? 999) - (deptOrder.get(b.deptName) ?? 999))
})

function openSortingPerson(person) {
  sortingPersonDetail.value = person
  showSortingPersonPopup.value = true
}

function addPersonToSign(person) {
  const s = new Set(sortedItemIds.value)
  person.items.forEach(i => s.add(i.id))
  sortedItemIds.value = s
  showSortingPersonPopup.value = false
  showSuccessToast(`${person.staffName} 已全部加入签字确认`)
}

// --- 待领取分拣 ---
const washedSortGroups = computed(() => {
  const staffMap = new Map(staffList.value.map(s => [s.id, s.name]))
  const deptMap = new Map(departments.value.map(d => [d.id, d.name]))
  const itemNameMap = new Map(itemTypes.value.map(t => [t.id, t.name]))
  const typeMap = new Map()
  records.value.forEach(r => {
    if (r.status !== 'washed') return
    const name = itemNameMap.get(r.itemTypeId) || '未知'
    if (!typeMap.has(name)) typeMap.set(name, [])
    typeMap.get(name).push({
      ...r,
      itemName: name,
      staffName: staffMap.get(r.staffId) || '未知',
      deptName: deptMap.get(r.departmentId) || '',
    })
  })
  return Array.from(typeMap.entries())
    .map(([typeName, items]) => ({
      typeName,
      count: items.length,
      items: items.sort((a, b) => (a.staffName || '').localeCompare(b.staffName || '', 'zh-Hans-CN')),
    }))
    .sort((a, b) => b.count - a.count)
})

function toggleWashedSortGroup(typeName) {
  washedSortExpanded.value[typeName] = !washedSortExpanded.value[typeName]
}

function toggleWashedSign(itemId) {
  const s = new Set(washedSignIds.value)
  if (s.has(itemId)) s.delete(itemId)
  else s.add(itemId)
  washedSignIds.value = s
}

const washedSignItems = computed(() => {
  if (washedSignIds.value.size === 0) return []
  const staffMap = new Map(staffList.value.map(s => [s.id, s.name]))
  const deptMap = new Map(departments.value.map(d => [d.id, d.name]))
  const itemNameMap = new Map(itemTypes.value.map(t => [t.id, t.name]))
  return records.value
    .filter(r => r.status === 'washed' && washedSignIds.value.has(r.id))
    .map(r => ({
      ...r,
      itemName: itemNameMap.get(r.itemTypeId) || '未知',
      staffName: staffMap.get(r.staffId) || '未知',
      deptName: deptMap.get(r.departmentId) || '',
    }))
})

function resetWashedSign() {
  washedSignIds.value = new Set()
}

async function confirmWashedSign(signatureData) {
  const ids = Array.from(washedSignIds.value)
  if (ids.length === 0) return

  const today = getToday()
  const now = new Date().toISOString()
  const n = new Date()
  const hhmmss = String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0') + String(n.getSeconds()).padStart(2, '0')
  const pickupId = `LQ${today.replace(/-/g, '')}-${hhmmss}`
  const recordList = await db.records.where('id').anyOf(ids).toArray()
  const batchIds = Array.from(new Set(recordList.map(r => r.batchId)))

  await db.transaction('rw', db.records, db.batches, async () => {
    await db.records.where('id').anyOf(ids).modify(record => {
      record.status = 'received'
      record.receivedAt = today
      record.pickupId = pickupId
      record.pickupSignature = signatureData
      record.pickupSignedAt = now
      if (!record.sentAt) record.sentAt = today
    })
    await db.batches.where('id').anyOf(batchIds).modify(batch => {
      batch.updatedAt = now
    })
  })

  washedSignIds.value = new Set()
  showWashedSignPopup.value = false
  await persistSnapshot('', '已更新')
  await loadData()
}

function addWashedSelectedToSign() {
  const ids = selectedWashedIds.value
  if (ids.length === 0) {
    showToast('请先勾选布草')
    return
  }
  const s = new Set(washedSignIds.value)
  ids.forEach(id => s.add(id))
  washedSignIds.value = s
  selectedWashedIds.value = []
  showSuccessToast(`已加入签字确认 (${ids.length})`)
}

function openWashedSignPopup() {
  if (washedSignIds.value.size === 0) {
    showToast('请先在分拣模式或批次情况中选择布草')
    return
  }
  washedSignNoSign.value = false
  washedSignHasStroke.value = false
  showWashedSignPopup.value = true
}

function onWashedSignOpen() {
  nextTick(() => {
    const canvas = washedSignCanvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * ratio))
    canvas.height = Math.max(1, Math.floor(rect.height * ratio))
    washedSignCtx = canvas.getContext('2d')
    if (!washedSignCtx) return
    washedSignCtx.scale(ratio, ratio)
    washedSignCtx.lineCap = 'round'
    washedSignCtx.lineJoin = 'round'
    washedSignCtx.lineWidth = 2.6
    washedSignCtx.strokeStyle = '#edf2f7'
    washedSignCtx.fillStyle = 'rgba(18, 26, 35, 1)'
    washedSignCtx.fillRect(0, 0, rect.width, rect.height)
    drawSignWatermark(washedSignCtx, rect.width, rect.height)
    washedSignHasStroke.value = false
  })
}

function startWashedSign(e) {
  if (!washedSignCtx) return
  e.preventDefault()
  const rect = washedSignCanvasRef.value.getBoundingClientRect()
  washedSignCtx.beginPath()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  washedSignCtx.moveTo(x, y)
  washedSignCanvasRef.value.setPointerCapture(e.pointerId)
}

function moveWashedSign(e) {
  if (!washedSignCtx || e.buttons === 0) return
  e.preventDefault()
  const rect = washedSignCanvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left, y = e.clientY - rect.top
  washedSignCtx.lineTo(x, y)
  washedSignCtx.stroke()
  washedSignHasStroke.value = true
}

function endWashedSign() { if (washedSignCtx) { washedSignCtx.closePath() } }

function confirmWashedSignAction() {
  if (!washedSignHasStroke.value && !washedSignNoSign.value) {
    showToast('请先签字或选择无签字')
    return
  }
  const sig = washedSignNoSign.value ? 'NO_SIGNATURE' : washedSignCanvasRef.value.toDataURL('image/png')
  fireConfetti()
  confirmWashedSign(sig)
}

// --- 待送洗签字确认 ---
const pendingSignItems = computed(() => {
  if (pendingSignIds.value.size === 0) return []
  const staffMap = new Map(staffList.value.map(s => [s.id, s.name]))
  const deptMap = new Map(departments.value.map(d => [d.id, d.name]))
  const itemNameMap = new Map(itemTypes.value.map(t => [t.id, t.name]))
  return records.value
    .filter(r => r.status === 'pending' && pendingSignIds.value.has(r.id))
    .map(r => ({
      ...r,
      itemName: itemNameMap.get(r.itemTypeId) || '未知',
      staffName: staffMap.get(r.staffId) || '未知',
      deptName: deptMap.get(r.departmentId) || '',
    }))
})

function addPendingSelectedToSign() {
  const ids = selectedPendingIds.value
  if (ids.length === 0) { showToast('请先勾选布草'); return }
  const s = new Set(pendingSignIds.value)
  ids.forEach(id => s.add(id))
  pendingSignIds.value = s
  selectedPendingIds.value = []
  showSuccessToast(`已加入签字确认 (${ids.length})`)
}

function resetPendingSign() { pendingSignIds.value = new Set() }

function openPendingSignPopup() {
  if (pendingSignIds.value.size === 0) { showToast('请先选择布草'); return }
  pendingSignNoSign.value = false
  pendingSignHasStroke.value = false
  showPendingSignPopup.value = true
}

function onPendingSignOpen() {
  nextTick(() => {
    const canvas = pendingSignCanvasRef.value
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.floor(rect.width * ratio))
    canvas.height = Math.max(1, Math.floor(rect.height * ratio))
    pendingSignCtx = canvas.getContext('2d')
    if (!pendingSignCtx) return
    pendingSignCtx.scale(ratio, ratio)
    pendingSignCtx.lineCap = 'round'
    pendingSignCtx.lineJoin = 'round'
    pendingSignCtx.lineWidth = 2.6
    pendingSignCtx.strokeStyle = '#edf2f7'
    pendingSignCtx.fillStyle = 'rgba(18, 26, 35, 1)'
    pendingSignCtx.fillRect(0, 0, rect.width, rect.height)
    drawSignWatermark(pendingSignCtx, rect.width, rect.height)
    pendingSignHasStroke.value = false
  })
}

function startPendingSign(e) { if (!pendingSignCtx) return; e.preventDefault(); const r = pendingSignCanvasRef.value.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; pendingSignCtx.beginPath(); pendingSignCtx.moveTo(x, y); pendingSignCanvasRef.value.setPointerCapture(e.pointerId) }
function movePendingSign(e) { if (!pendingSignCtx || e.buttons === 0) return; e.preventDefault(); const r = pendingSignCanvasRef.value.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; pendingSignCtx.lineTo(x, y); pendingSignCtx.stroke(); pendingSignHasStroke.value = true }
function endPendingSign() { if (pendingSignCtx) { pendingSignCtx.closePath() } }

async function confirmPendingSignAction() {
  if (!pendingSignHasStroke.value && !pendingSignNoSign.value) { showToast('请先签字或选择无签字'); return }
  const sig = pendingSignNoSign.value ? 'NO_SIGNATURE' : pendingSignCanvasRef.value.toDataURL('image/png')
  const ids = Array.from(pendingSignIds.value)
  if (ids.length === 0) return

  const today = getToday()
  const now = new Date().toISOString()
  const n = new Date()
  const hhmmss = String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0') + String(n.getSeconds()).padStart(2, '0')
  const deliveryId = generateTimestampId('SX')
  const recordList = await db.records.where('id').anyOf(ids).toArray()
  const batchIds = Array.from(new Set(recordList.map(r => r.batchId)))

  await db.transaction('rw', db.records, db.batches, async () => {
    await db.records.where('id').anyOf(ids).modify(record => {
      record.status = 'washed'
      record.sentAt = today
      record.deliveryId = deliveryId
      record.deliverySignature = sig
      record.deliverySignedAt = now
      if (selectedPriceTableId.value) record.priceTableId = selectedPriceTableId.value
    })
    await db.batches.where('id').anyOf(batchIds).modify(batch => { batch.updatedAt = now })
  })

  pendingSignIds.value = new Set()
  showPendingSignPopup.value = false
  fireConfetti()
  await persistSnapshot('', '已更新')
  await loadData()
}

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
      const signExclude = status === 'pending' ? pendingSignIds.value : (status === 'washed' ? washedSignIds.value : null)
      const stageRecords = allRecords.filter(record => record.status === status && (!signExclude || !signExclude.has(record.id)))
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
    .sort((left, right) => {
      if (status === 'washed') {
        return left.batchDate.localeCompare(right.batchDate)
      }
      return right.batchDate.localeCompare(left.batchDate)
    })
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
}

function saveEditorDraft() {
  window.localStorage.setItem(editorDraftStorageKey, JSON.stringify(editorRecords.value))
}

function restoreEditorDraft() {
  try {
    const raw = window.localStorage.getItem(editorDraftStorageKey)
    if (!raw) return
    const data = JSON.parse(raw)
    if (Array.isArray(data) && data.length > 0) {
      editorRecords.value = data
    }
  } catch {}
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
  clearEditor()
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
      batchId: group?.batchId || '',
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
  drawSignWatermark(signatureCtx, rect.width, rect.height)
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
    fireConfetti()
    return
  }

  await applyDistributionSignature(signatureData)
  showSignaturePopup.value = false
  fireConfetti()
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

  const n = new Date()
  const hhmmss = String(n.getHours()).padStart(2, '0') + String(n.getMinutes()).padStart(2, '0') + String(n.getSeconds()).padStart(2, '0')
  const staffName = target.staffName || ''
  const distributionId = `FF${today.replace(/-/g, '')}-${hhmmss}-${staffName}`

  await db.transaction('rw', db.records, db.batches, async () => {
    await db.records.where('id').anyOf(ids).modify(record => {
      record.status = 'distributed'
      record.distributedAt = today
      record.distributionSignature = signatureData
      record.distributionSignedAt = now
      record.distributionId = distributionId
      if (!record.sentAt) record.sentAt = today
      if (!record.receivedAt) record.receivedAt = today
    })

    await db.batches.where('id').anyOf(batchIds).modify(batch => {
      batch.updatedAt = now
    })
  })

  selectedReceivedIds.value = selectedReceivedIds.value.filter(id => !ids.includes(id))
  await persistSnapshot('', '发放已更新到当前页面缓存')
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
  drawSignWatermark(intakeCtx, rect.width, rect.height)
  intakeHasStroke.value = false
}

function startIntakeSignature(event) {
  if (!intakeCtx) return
  event.preventDefault()
  const canvas = intakeCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  intakeCtx.beginPath()
  const x = event.clientX - rect.left, y = event.clientY - rect.top
  intakeCtx.moveTo(x, y)
  canvas.setPointerCapture(event.pointerId)
}

function moveIntakeSignature(event) {
  if (!intakeCtx || event.buttons === 0) return
  event.preventDefault()
  const rect = intakeCanvasRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left, y = event.clientY - rect.top
  intakeCtx.lineTo(x, y)
  intakeCtx.stroke()
  intakeHasStroke.value = true
}

function endIntakeSignature() {
  if (!intakeCtx) return
  intakeCtx.closePath()
}

function clearIntakeCanvas() {
  if (!intakeCtx) return
  const canvas = intakeCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  intakeCtx.fillRect(0, 0, rect.width, rect.height)
  drawSignWatermark(intakeCtx, rect.width, rect.height)
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
  drawSignWatermark(distCtx, rect.width, rect.height)
  distHasStroke.value = false
}

function startDistSignature(event) {
  if (!distCtx) return
  event.preventDefault()
  const canvas = distCanvasRef.value
  const rect = canvas.getBoundingClientRect()
  distCtx.beginPath()
  const x = event.clientX - rect.left, y = event.clientY - rect.top
  distCtx.moveTo(x, y)
  canvas.setPointerCapture(event.pointerId)
}

function moveDistSignature(event) {
  if (!distCtx || event.buttons === 0) return
  event.preventDefault()
  const rect = distCanvasRef.value.getBoundingClientRect()
  const x = event.clientX - rect.left, y = event.clientY - rect.top
  distCtx.lineTo(x, y)
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
  drawSignWatermark(distCtx, rect.width, rect.height)
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
  const distributedIds = slipRecord.value?.target?.ids || []
  await applyDistributionSignature(signatureData)
  // Remove distributed items from sorting state
  if (distributedIds.length > 0) {
    const s = new Set(sortedItemIds.value)
    distributedIds.forEach(id => s.delete(id))
    sortedItemIds.value = s
  }
  showSlipPopup.value = false
  slipRecord.value = null
  fireConfetti()
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

function confirmIntakeSlip() {
  if (!intakeHasStroke.value && !intakeNoSign.value) {
    showToast('请先签字或选择无签字')
    return
  }
  const signatureData = intakeNoSign.value ? 'NO_SIGNATURE' : intakeCanvasRef.value.toDataURL('image/png')
  const signedAt = new Date().toISOString()

  const items = slipRecord.value?.items?.map(item => ({
    itemTypeId: item.itemTypeId,
    quantity: item.quantity,
    note: item.note || '',
    photo: item.photo || '',
    pieceNo: item.pieceNo || null,
  })) || []

  currentRecords.value.push({
    departmentId: selectedDeptId.value,
    staffId: selectedStaffId.value,
    intakeSignature: signatureData,
    intakeSignedAt: signedAt,
    items,
  })

  showSlipPopup.value = false
  showAddForm.value = false
  slipRecord.value = null
  clearEditor()
  fireConfetti()
}

function removeRecord(index) {
  currentRecords.value.splice(index, 1)
}

async function persistSnapshot(successMessage, fallbackMessage) {
  const result = await saveToDesktopStorage()
  if (result.success) {
    if (successMessage) showSuccessToast(successMessage)
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

function generateTimestampId(prefix) {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
  return `${prefix}${date}-${time}`
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

  const deliveryId = sourceStatus === 'pending' ? generateTimestampId('SX') : null
  const pickupId = sourceStatus === 'washed' ? generateTimestampId('LQ') : null

  await db.transaction('rw', db.records, db.batches, async () => {
    await db.records.where('id').anyOf(ids).modify(record => {
      if (sourceStatus === 'pending') {
        record.status = 'washed'
        record.sentAt = today
        record.deliveryId = deliveryId
      }

      if (sourceStatus === 'washed') {
        record.status = 'received'
        record.receivedAt = today
        record.pickupId = pickupId
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

function goBatchDetail(batchId, staffId) {
  sessionStorage.setItem('send-active-section', activeSection.value)
  if (staffId) {
    router.push(`/batch/${batchId}?staff=${staffId}`)
  } else {
    router.push(`/batch/${batchId}`)
  }
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
  const itemTypeCounts = {}
  record.items.forEach(item => {
    itemTypeCounts[item.itemTypeId] = (itemTypeCounts[item.itemTypeId] || 0) + 1
  })
  selectedDraftRecord.value = {
    ...record,
    enrichedItems: record.items.map(item => ({
      ...item,
      itemName: itemTypes.value.find(t => t.id === item.itemTypeId)?.name || '未知',
      showPieceNo: itemTypeCounts[item.itemTypeId] > 1 && !!item.pieceNo,
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

function getStageDateLabel() {
  return ''
}

function getRecordDisplayTitle(item) {
  const pieceText = item.showPieceNo ? `（第${item.pieceNo}件）` : ''
  const qtyText = !item.pieceNo && item.quantity > 1 ? ` x${item.quantity}` : ''
  return `${item.itemName}${pieceText}${qtyText}`
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
        const piece = item.showPieceNo ? `（第${item.pieceNo}件）` : ''
        const qty = !item.pieceNo && item.quantity > 1 ? ` x${item.quantity}` : ''
        const extras = []
        if (item.note) extras.push(`备注：${item.note}`)
        if (item.photo) extras.push('有照片')
        const suffix = extras.length > 0 ? ` [${extras.join('，')}]` : ''
        lines.push(`- ${item.itemName}${piece}${qty}${suffix}`)
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
            <div class="create-block__header">
              <div>
                <h3 class="create-block__title">接收建批
                  <span v-if="draftPeopleCount" class="create-block__count">{{ draftPeopleCount }} 人 / {{ draftItemCount }} 件</span>
                </h3>
              </div>
              <div class="create-block__toolbar">
                <button type="button" class="create-block__chip" @click="showDatePicker = true">{{ receivedDate }}</button>
                <button type="button" class="create-block__chip" @click="openNoteEditor">{{ batchNote || '备注' }}</button>
                <van-button type="primary" round size="small" icon="plus" @click="openAddForm">选人录入</van-button>
              </div>
            </div>

            <div v-if="recordsSummary.length > 0" class="create-block__list">
              <article
                v-for="(record, index) in recordsSummary"
                :key="`${record.staffId}-${index}`"
                class="person-row"
                @click="openDraftDetail(record)"
              >
                <div class="person-row__body">
                  <div class="person-row__name">{{ record.staffName }}</div>
                  <div class="person-row__detail">{{ record.items.reduce((s, i) => s + i.quantity, 0) }} 件 · {{ record.intakeSignature === 'NO_SIGNATURE' ? '无签字' : (record.intakeSignature ? '已签字' : '无签字') }}</div>
                </div>
                <button type="button" class="person-row__link person-row__link--danger" @click.stop="removeRecord(record.rawIndex)">移除</button>
              </article>
            </div>
            <div v-else class="create-block__empty">点击"选人录入"开始接收衣物</div>

            <div v-if="recordsSummary.length > 0" class="create-block__footer">
              <van-button
                plain
                round
                size="small"
                :loading="saving"
                @click="submitBatch"
              >提交待送洗</van-button>
            </div>
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
              <div v-if="stage === 'pending' && (getStageGroups(stage).length > 0 || pendingSignIds.size > 0)" class="section-heading__toggle">
                <button type="button" class="toggle-chip" :class="{ 'is-active': pendingTab === 'batch' }" @click="pendingTab = 'batch'">批次情况</button>
                <button type="button" class="toggle-chip" :class="{ 'is-active': pendingTab === 'sign' }" @click="pendingTab = 'sign'">签字确认<span v-if="pendingSignIds.size > 0"> ({{ pendingSignIds.size }})</span></button>
              </div>
              <div v-if="stage === 'washed' && (getStageGroups(stage).length > 0 || washedSignIds.size > 0)" class="section-heading__toggle">
                <button type="button" class="toggle-chip" :class="{ 'is-active': washedTab === 'batch' }" @click="washedTab = 'batch'">批次情况</button>
                <button type="button" class="toggle-chip" :class="{ 'is-active': washedTab === 'sort' }" @click="washedTab = 'sort'">分拣模式</button>
                <button type="button" class="toggle-chip" :class="{ 'is-active': washedTab === 'sign' }" @click="washedTab = 'sign'">签字确认<span v-if="washedSignIds.size > 0"> ({{ washedSignIds.size }})</span></button>
              </div>
              <div v-if="stage === 'received' && getStageGroups(stage).length > 0" class="section-heading__toggle">
                <button type="button" class="toggle-chip" :class="{ 'is-active': receivedTab === 'batch' }" @click="receivedTab = 'batch'">批次情况</button>
                <button type="button" class="toggle-chip" :class="{ 'is-active': receivedTab === 'sort' }" @click="receivedTab = 'sort'">分拣模式</button>
                <button type="button" class="toggle-chip" :class="{ 'is-active': receivedTab === 'sign' }" @click="receivedTab = 'sign'">签字确认</button>
              </div>
            </div>

            <!-- 待送洗签字确认视图 -->
            <div v-if="stage === 'pending' && pendingTab === 'sign'">
              <div v-if="pendingSignItems.length > 0" class="sign-confirm-view">
                <div class="sign-confirm-view__decor"></div>
                <div class="sign-confirm-view__header">
                  <div class="sign-confirm-view__count">{{ pendingSignItems.length }}</div>
                  <div class="sign-confirm-view__label">种类型布草待送洗确认</div>
                </div>
                <div v-if="priceTables.length > 0" class="sign-confirm-view__price-select">
                  <span class="sign-confirm-view__price-label">价格表</span>
                  <select v-model="selectedPriceTableId" class="sign-confirm-view__select">
                    <option v-for="pt in priceTables" :key="pt.id" :value="pt.id">{{ pt.name }}</option>
                  </select>
                </div>
                <div class="sign-confirm-view__list">
                  <div v-for="(item, i) in pendingSignItems" :key="i" class="sign-confirm-view__item">
                    <span class="sign-confirm-view__item-name">{{ item.itemName }}{{ item.quantity > 1 ? ` x${item.quantity}` : '' }}</span>
                    <span class="sign-confirm-view__item-person">{{ item.staffName }}</span>
                  </div>
                </div>
                <div class="sign-confirm-view__actions">
                  <button type="button" class="sign-confirm-view__clear" @click="resetPendingSign">清空列表</button>
                  <van-button type="primary" round @click="openPendingSignPopup">签字确认送洗</van-button>
                </div>
              </div>
              <div v-else class="sign-confirm-view sign-confirm-view--empty">
                <div class="sign-confirm-view__decor"></div>
                <div class="sign-confirm-view__empty-text">在批次情况中选择布草后<br>此处显示待确认列表</div>
              </div>
            </div>

            <!-- 待领取分拣视图 -->
            <div v-if="stage === 'washed' && washedTab === 'sort' && washedSortGroups.length > 0" class="sorting-view">
              <div class="sorting-list">
                <div v-for="group in washedSortGroups" :key="group.typeName" class="sorting-group">
                  <button type="button" class="sorting-group__head" @click="toggleWashedSortGroup(group.typeName)">
                    <span class="sorting-group__name">{{ group.typeName }}</span>
                    <span class="sorting-group__count">{{ group.count }} 件</span>
                    <van-icon :name="washedSortExpanded[group.typeName] ? 'arrow-up' : 'arrow-down'" size="14" class="sorting-group__arrow" />
                  </button>
                  <div v-if="washedSortExpanded[group.typeName]" class="sorting-group__body">
                    <div
                      v-for="(item, idx) in group.items"
                      :key="idx"
                      class="sorting-item"
                      :class="{ 'is-sorted': washedSignIds.has(item.id) }"
                      @click="toggleWashedSign(item.id)"
                    >
                      <img v-if="item.photo" :src="item.photo" class="sorting-item__photo zoomable-photo" @click.stop="openPhotoViewer(item.photo)" />
                      <div v-else class="sorting-item__no-photo"><van-icon name="photo-o" size="20" /></div>
                      <div class="sorting-item__info">
                        <div class="sorting-item__name">{{ getRecordDisplayTitle(item) }}</div>
                      </div>
                      <div class="sorting-item__person">
                        <strong>{{ item.staffName }}</strong>
                        <span>{{ item.deptName }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 待领取签字确认视图 -->
            <div v-if="stage === 'washed' && washedTab === 'sign'">
              <div v-if="washedSignItems.length > 0" class="sign-confirm-view">
                <div class="sign-confirm-view__decor"></div>
                <div class="sign-confirm-view__header">
                  <div class="sign-confirm-view__count">{{ washedSignItems.length }}</div>
                  <div class="sign-confirm-view__label">种类型布草待领取确认</div>
                </div>
                <div class="sign-confirm-view__list">
                  <div v-for="(item, i) in washedSignItems" :key="i" class="sign-confirm-view__item">
                    <span class="sign-confirm-view__item-name">{{ item.itemName }}{{ item.quantity > 1 ? ` x${item.quantity}` : '' }}</span>
                    <span class="sign-confirm-view__item-person">{{ item.staffName }}</span>
                  </div>
                </div>
                <div class="sign-confirm-view__actions">
                  <button type="button" class="sign-confirm-view__clear" @click="resetWashedSign">清空列表</button>
                  <van-button type="primary" round @click="openWashedSignPopup">签字确认领取</van-button>
                </div>
              </div>
              <div v-else class="sign-confirm-view sign-confirm-view--empty">
                <div class="sign-confirm-view__decor"></div>
                <div class="sign-confirm-view__empty-text">在分拣模式或批次情况中选择布草后<br>此处显示待确认列表</div>
              </div>
            </div>

            <!-- 待发放分拣视图 -->
            <div v-if="stage === 'received' && receivedTab === 'sort' && sortingGroups.length > 0" class="sorting-view">
              <!-- 人名快捷栏 -->
              <div class="sorting-persons">
                <button
                  v-for="p in sortingPersons"
                  :key="p.staffId"
                  type="button"
                  class="sorting-person-chip"
                  :class="{ 'is-done': p.allSorted }"
                  @click="openSortingPerson(p)"
                >
                  {{ p.staffName }}
                  <span>{{ p.sortedQty }}/{{ p.totalQty }}</span>
                </button>
                <button v-if="sortedItemIds.size > 0" type="button" class="sorting-reset-btn" @click="resetSorting">重新分拣</button>
              </div>

              <!-- 按类型分组 -->
              <div class="sorting-list">
                <div v-for="group in sortingGroups" :key="group.typeName" class="sorting-group">
                  <button type="button" class="sorting-group__head" :class="{ 'is-done': group.allSorted }" @click="toggleSortingGroup(group.typeName)">
                    <span class="sorting-group__name">{{ group.typeName }}</span>
                    <span class="sorting-group__count">{{ group.count }} 件</span>
                    <van-icon :name="sortingExpanded[group.typeName] ? 'arrow-up' : 'arrow-down'" size="14" class="sorting-group__arrow" />
                  </button>
                  <div v-if="sortingExpanded[group.typeName]" class="sorting-group__body">
                    <div
                      v-for="(item, idx) in group.items"
                      :key="idx"
                      class="sorting-item"
                      :class="{ 'is-sorted': sortedItemIds.has(item.id) }"
                      @click="toggleSorted(item.id)"
                    >
                      <img v-if="item.photo" :src="item.photo" class="sorting-item__photo zoomable-photo" @click.stop="openPhotoViewer(item.photo)" />
                      <div v-else class="sorting-item__no-photo"><van-icon name="photo-o" size="20" /></div>
                      <div class="sorting-item__info">
                        <div class="sorting-item__name">{{ getRecordDisplayTitle(item) }}</div>
                        <div v-if="item.note" class="sorting-item__note">{{ item.note }}</div>
                      </div>
                      <div class="sorting-item__person">
                        <strong>{{ item.staffName }}</strong>
                        <span>{{ item.deptName }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- 签字确认视图 -->
            <div v-if="stage === 'received' && receivedTab === 'sign'" class="signing-view">
              <div v-if="pendingSignByDept.length > 0">
                <div v-for="dept in pendingSignByDept" :key="dept.deptName" class="signing-dept-group">
                  <div class="signing-dept-group__label">{{ dept.deptName }}</div>
                  <div class="sorting-list">
                    <article
                      v-for="person in dept.persons"
                      :key="person.staffId"
                      class="signing-person-card"
                    >
                      <div class="signing-person-card__head">
                        <div>
                          <div class="signing-person-card__name">{{ person.staffName }}</div>
                          <div class="signing-person-card__meta">{{ person.totalQty }} 件</div>
                        </div>
                        <van-button type="primary" size="small" round @click="openDistributionSlip(null, person)">签字发放</van-button>
                      </div>
                      <div class="signing-person-card__items">
                        <span v-for="(item, i) in person.items" :key="i">{{ getRecordDisplayTitle(item) }}</span>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
              <div v-else class="create-block__empty">在分拣模式中完成某人的全部分拣后，此处自动出现签字入口</div>
            </div>

            <template v-if="(stage === 'pending' && pendingTab === 'batch') || (stage === 'washed' && washedTab === 'batch') || (stage === 'received' && receivedTab === 'batch')">
            <div v-if="getStageGroups(stage).length > 0 && stage !== 'received'" class="stage-action-bar">
              <van-button plain round size="small" type="primary" @click="selectAllStage(stage)">
                {{ isAllStageSelected(stage) ? '取消全选' : '全选' }}
              </van-button>
              <van-button
                round size="small"
                :type="canAdvanceStage(stage) ? 'primary' : 'default'"
                :plain="!canAdvanceStage(stage)"
                :disabled="!canAdvanceStage(stage)"
                @click="stage === 'pending' ? addPendingSelectedToSign() : (stage === 'washed' ? addWashedSelectedToSign() : advanceRecords(stage, getSelectionListRef(stage).value))"
              >{{ (stage === 'pending' || stage === 'washed') ? '加入签字确认' : getActionText(stage) }}{{ getSelectionCount(stage) ? ` (${getSelectionCount(stage)})` : '' }}</van-button>
            </div>

            <div v-if="getStageGroups(stage).length === 0 && ((stage === 'pending' && pendingSignIds.size > 0) || (stage === 'washed' && washedSignIds.size > 0))" class="stage-empty-hint">
              全部已加入签字确认，请切换到"签字确认"标签完成签字
            </div>
            <div v-else-if="getStageGroups(stage).length === 0" class="stage-empty-hint">暂无</div>

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
                        <button type="button" class="person-panel__title person-panel__title--link" @click.stop="goBatchDetail(group.batchId, person.items[0]?.staffId)">{{ person.staffName }}</button>
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
                            <div class="record-card__id-group">
                              <span v-if="item.deliveryId && (stage === 'washed' || stage === 'received')" class="record-card__id-tag">{{ item.deliveryId }}</span>
                              <span v-if="item.pickupId && stage === 'received'" class="record-card__id-tag">{{ item.pickupId }}</span>
                            </div>
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
                        <button type="button" class="person-panel__title person-panel__title--link" @click.stop="goBatchDetail(group.batchId, person.items[0]?.staffId)">{{ person.staffName }}</button>
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
                            <div class="record-card__id-group">
                              <span v-if="item.deliveryId" class="record-card__id-tag">{{ item.deliveryId }}</span>
                              <span v-if="item.pickupId" class="record-card__id-tag">{{ item.pickupId }}</span>
                            </div>
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
            </template>
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
                  <div v-if="unlockedItems[item.id]" class="item-row__stepper-wrap">
                    <van-stepper
                      :model-value="getQuantity(item.id)"
                      min="0"
                      :default-value="0"
                      input-width="42px"
                      button-size="28px"
                      @update:model-value="value => onItemQuantityChange(item, value)"
                    />
                    <button type="button" class="item-row__action" @click="toggleItemLock(item.id)">完成</button>
                  </div>
                  <div v-else class="item-row__locked">
                    <span v-if="getQuantity(item.id) > 0" class="item-row__qty-badge">{{ getQuantity(item.id) }}</span>
                    <button type="button" class="item-row__action" @click="toggleItemLock(item.id)">编辑</button>
                  </div>
                </div>

                <div v-if="item.category !== 'personal' && getQuantity(item.id) > 0" class="item-extra-block">
                  <div class="item-extra-row">
                    <van-button size="small" round type="primary" plain @click.stop="openCameraCapture(item.id)">
                      拍照
                    </van-button>
                    <label class="photo-btn">
                      <van-icon name="photograph" size="18" />
                      {{ itemPhotos[item.id] ? '重新上传' : '上传' }}
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
                        拍照
                      </van-button>
                      <label class="photo-btn">
                        <van-icon name="photograph" size="18" />
                        {{ getPieceDetail(item.id, pieceIndex - 1).photo ? '重新上传' : '上传' }}
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
      <div class="popup-sheet popup-sheet--tall sign-page">
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
                <strong>{{ item.itemName || getRecordDisplayTitle(item) }}{{ item.showPieceNo ? `（第${item.pieceNo}件）` : '' }}</strong>
                <span v-if="!item.pieceNo && item.quantity > 1">x{{ item.quantity }}</span>
                <span v-if="item.note">备注：{{ item.note }}</span>
              </div>
            </div>

            <!-- 接收模式：签字画板内嵌 -->
            <section v-if="slipMode === 'intake'" class="signature-panel">
              <div class="signature-panel__toolbar">
                <div class="signature-panel__title">签字区域</div>
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
                <div class="signature-panel__title">签字区域</div>
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
          <van-button v-if="slipMode === 'intake'" block type="primary" @click="confirmIntakeSlip">确认无误</van-button>
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
                <span class="detail-item-row__name">{{ item.itemName }}{{ item.showPieceNo ? `（第${item.pieceNo}件）` : '' }}</span>
                <span v-if="!item.pieceNo && item.quantity > 1" class="detail-item-row__qty">x{{ item.quantity }}</span>
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

    <van-popup v-model:show="showSortingPersonPopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }">
      <div class="popup-sheet popup-sheet--tall">
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showSortingPersonPopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">{{ sortingPersonDetail?.staffName }} · 待发放</div>
        </div>
        <template v-if="sortingPersonDetail">
          <div class="sorting-person-summary">
            {{ sortingPersonDetail.deptName }} · {{ sortingPersonDetail.sortedQty }}/{{ sortingPersonDetail.totalQty }} 已分拣
            <van-button v-if="!sortingPersonDetail.allSorted" plain round size="small" style="margin-left: 12px" @click="addPersonToSign(sortingPersonDetail)">加入签字确认</van-button>
          </div>
          <div class="sorting-list">
            <div
              v-for="(item, idx) in sortingPersonDetail.items"
              :key="idx"
              class="sorting-item"
              :class="{ 'is-sorted': sortedItemIds.has(item.id) }"
            >
              <img v-if="item.photo" :src="item.photo" class="sorting-item__photo zoomable-photo" @click.stop="openPhotoViewer(item.photo)" />
              <div v-else class="sorting-item__no-photo"><van-icon name="photo-o" size="20" /></div>
              <div class="sorting-item__info">
                <div class="sorting-item__name">{{ getRecordDisplayTitle(item) }}</div>
                <div v-if="item.note" class="sorting-item__note">{{ item.note }}</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </van-popup>

    <van-popup v-model:show="showPendingSignPopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }" @opened="onPendingSignOpen">
      <div class="popup-sheet popup-sheet--tall sign-page">
        <div class="sign-page__decor-tl"></div>
        <div class="sign-page__decor-br"></div>
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showPendingSignPopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">签字确认送洗</div>
        </div>

        <div class="sign-page__summary">
          <div class="sign-page__count">{{ pendingSignItems.length }}</div>
          <div class="sign-page__count-label">件布草</div>
        </div>

        <div class="sign-page__items">
          <span v-for="(item, i) in pendingSignItems" :key="i" class="sign-page__tag">{{ item.itemName }}{{ item.quantity > 1 ? ` x${item.quantity}` : '' }} · {{ item.staffName }}</span>
        </div>

        <section class="signature-panel">
          <div class="signature-panel__toolbar">
            <div class="signature-panel__title">签字区域</div>
            <div class="signature-panel__actions">
              <button type="button" class="signature-panel__link" @click="pendingSignNoSign = true">无签字</button>
              <button type="button" class="signature-panel__link" @click="pendingSignNoSign = false; onPendingSignOpen()">清空重签</button>
            </div>
          </div>
          <div class="signature-board">
            <div v-if="pendingSignNoSign" class="signature-board__no-sign-overlay">无签字</div>
            <canvas
              v-show="!pendingSignNoSign"
              ref="pendingSignCanvasRef"
              class="signature-board__canvas"
              @pointerdown="startPendingSign"
              @pointermove="movePendingSign"
              @pointerup="endPendingSign"
              @pointerleave="endPendingSign"
              @pointercancel="endPendingSign"
            />
          </div>
        </section>

        <div class="bottom-actions">
          <van-button block type="primary" round size="large" @click="confirmPendingSignAction">确认送洗</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showWashedSignPopup" position="bottom" class="popup-fullpage" :style="{ height: '100%' }" @opened="onWashedSignOpen">
      <div class="popup-sheet popup-sheet--tall sign-page">
        <div class="sign-page__decor-tl"></div>
        <div class="sign-page__decor-br"></div>
        <div class="popup-page-header">
          <button type="button" class="popup-page-header__back" @click="showWashedSignPopup = false">
            <van-icon name="arrow-left" size="18" /><span>返回</span>
          </button>
          <div class="popup-page-header__title">签字确认领取</div>
        </div>

        <div class="sign-page__summary">
          <div class="sign-page__count">{{ washedSignItems.length }}</div>
          <div class="sign-page__count-label">件布草</div>
        </div>

        <div class="sign-page__items">
          <span v-for="(item, i) in washedSignItems" :key="i" class="sign-page__tag">{{ item.itemName }}{{ item.quantity > 1 ? ` x${item.quantity}` : '' }} · {{ item.staffName }}</span>
        </div>

        <section class="signature-panel">
          <div class="signature-panel__toolbar">
            <div class="signature-panel__title">签字区域</div>
            <div class="signature-panel__actions">
              <button type="button" class="signature-panel__link" @click="washedSignNoSign = true">无签字</button>
              <button type="button" class="signature-panel__link" @click="washedSignNoSign = false; onWashedSignOpen()">清空重签</button>
            </div>
          </div>
          <div class="signature-board">
            <div v-if="washedSignNoSign" class="signature-board__no-sign-overlay">无签字</div>
            <canvas
              v-show="!washedSignNoSign"
              ref="washedSignCanvasRef"
              class="signature-board__canvas"
              @pointerdown="startWashedSign"
              @pointermove="moveWashedSign"
              @pointerup="endWashedSign"
              @pointerleave="endWashedSign"
              @pointercancel="endWashedSign"
            />
          </div>
        </section>

        <div class="bottom-actions">
          <van-button block type="primary" round size="large" @click="confirmWashedSignAction">确认领取</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>
