<script setup>
import { computed, onMounted, ref } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { showFailToast, showSuccessToast, showToast } from 'vant'
import { db } from '../db/index.js'
import { saveToDesktopStorage } from '../utils/desktopStorage.js'

const sendDate = ref(new Date().toISOString().slice(0, 10))
const showDatePicker = ref(false)
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])
const currentRecords = ref([])
const note = ref('')
const saving = ref(false)

const showAddForm = ref(false)
const showNotePopup = ref(false)
const noteDraft = ref('')
const selectedDeptId = ref(null)
const selectedStaffId = ref(null)
const selectedItems = ref({})

const filteredStaff = computed(() => {
  if (!selectedDeptId.value) return []
  return staffList.value.filter(item => item.departmentId === selectedDeptId.value && item.isActive !== false)
})

const groupedItemTypes = computed(() => {
  const groups = { personal: [], bedding: [], banquet: [] }
  const labels = { personal: '个人衣物', bedding: '床品', banquet: '宴会布草' }

  itemTypes.value.forEach(item => {
    if (groups[item.category]) {
      groups[item.category].push(item)
    }
  })

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({ label: labels[key], items }))
})

const totalItemCount = computed(() => {
  return currentRecords.value.reduce(
    (sum, record) => sum + record.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  )
})

const recordsSummary = computed(() => {
  return currentRecords.value.map(record => {
    const dept = departments.value.find(item => item.id === record.departmentId)
    const staff = staffList.value.find(item => item.id === record.staffId)
    const itemsText = record.items
      .map(item => {
        const type = itemTypes.value.find(typeItem => typeItem.id === item.itemTypeId)
        return `${type?.name || ''} x${item.quantity}`
      })
      .join('、')

    return {
      ...record,
      deptName: dept?.name || '',
      staffName: staff?.name || '',
      itemsText,
    }
  })
})

onMounted(async () => {
  departments.value = await db.departments.orderBy('sortOrder').toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.orderBy('sortOrder').toArray()
})

function onDateConfirm({ selectedValues }) {
  sendDate.value = selectedValues.join('-')
  showDatePicker.value = false
}

function openAddForm() {
  selectedDeptId.value = null
  selectedStaffId.value = null
  selectedItems.value = {}
  showAddForm.value = true
}

function openNoteEditor() {
  noteDraft.value = note.value
  showNotePopup.value = true
}

function saveNote() {
  note.value = noteDraft.value.trim()
  showNotePopup.value = false
}

function addRecord() {
  if (!selectedDeptId.value || !selectedStaffId.value) {
    showToast('请选择部门和人员')
    return
  }

  const items = Object.entries(selectedItems.value)
    .filter(([, qty]) => Number(qty) > 0)
    .map(([id, qty]) => ({
      itemTypeId: Number(id),
      quantity: Number(qty),
    }))

  if (items.length === 0) {
    showToast('请至少填写一项物品数量')
    return
  }

  currentRecords.value.push({
    departmentId: selectedDeptId.value,
    staffId: selectedStaffId.value,
    items,
  })

  showAddForm.value = false
  showSuccessToast('已加入本批次')
}

function removeRecord(index) {
  currentRecords.value.splice(index, 1)
}

async function submitBatch() {
  if (currentRecords.value.length === 0) {
    showToast('请先添加送洗记录')
    return
  }

  const batchId = uuidv4()
  const now = new Date().toISOString()
  const batch = {
    id: batchId,
    sendDate: sendDate.value,
    receiveDate: '',
    billingDate: '',
    status: 'washing',
    note: note.value,
    createdAt: now,
    updatedAt: now,
  }

  const records = []
  for (const record of currentRecords.value) {
    for (const item of record.items) {
      records.push({
        id: uuidv4(),
        batchId,
        departmentId: record.departmentId,
        staffId: record.staffId,
        itemTypeId: item.itemTypeId,
        quantity: item.quantity,
        note: '',
      })
    }
  }

  await db.batches.add(batch)
  await db.records.bulkAdd(records)

  saving.value = true
  const result = await saveToDesktopStorage()
  saving.value = false

  if (result.success) {
    showSuccessToast('已写入本地数据库文件')
  } else {
    showFailToast(`已保存在当前页面缓存，${result.error || '未写入桌面数据文件'}`)
  }

  currentRecords.value = []
  note.value = ''
}
</script>

<template>
  <div class="page">
    <div class="page-title">送洗登记</div>

    <section class="hero-card">
      <div class="hero-grid">
        <div class="hero-metric">
          <span class="hero-label">送洗日期</span>
          <strong>{{ sendDate }}</strong>
        </div>
        <div class="hero-metric">
          <span class="hero-label">本批人数</span>
          <strong>{{ currentRecords.length }}</strong>
        </div>
        <div class="hero-metric">
          <span class="hero-label">总件数</span>
          <strong>{{ totalItemCount }}</strong>
        </div>
      </div>
    </section>

    <div class="section-stack">
      <van-cell-group inset>
        <van-cell title="送洗日期" :value="sendDate" is-link @click="showDatePicker = true" />
        <van-cell title="备注" :value="note || '点击填写'" is-link @click="openNoteEditor" />
      </van-cell-group>

      <van-cell-group v-if="recordsSummary.length > 0" inset title="本批次记录">
        <van-swipe-cell v-for="(record, index) in recordsSummary" :key="`${record.staffId}-${index}`">
          <van-cell :title="`${record.deptName} - ${record.staffName}`" :label="record.itemsText" />
          <template #right>
            <van-button square type="danger" text="删除" style="height: 100%" @click="removeRecord(index)" />
          </template>
        </van-swipe-cell>
      </van-cell-group>
    </div>

    <div class="bottom-actions">
      <van-button block plain type="primary" icon="plus" @click="openAddForm">
        添加人员物品
      </van-button>
      <van-button
        v-if="currentRecords.length > 0"
        block
        type="primary"
        :loading="saving"
        loading-text="写入本地数据库..."
        @click="submitBatch"
      >
        提交送洗批次（{{ currentRecords.length }}条记录）
      </van-button>
    </div>

    <van-popup v-model:show="showDatePicker" position="bottom" round>
      <van-date-picker
        title="选择日期"
        :min-date="new Date(2025, 0, 1)"
        :max-date="new Date(2030, 11, 31)"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </van-popup>

    <van-popup v-model:show="showNotePopup" position="bottom" round :style="{ height: '42%' }">
      <div class="popup-sheet">
        <div class="popup-title">备注</div>
        <van-field
          v-model="noteDraft"
          rows="4"
          autosize
          type="textarea"
          maxlength="120"
          placeholder="输入本批次的备注信息"
          show-word-limit
        />
        <div class="bottom-actions">
          <van-button block plain type="primary" @click="showNotePopup = false">取消</van-button>
          <van-button block type="primary" @click="saveNote">保存备注</van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showAddForm" position="bottom" round :style="{ height: '84%' }" closeable>
      <div class="popup-sheet popup-sheet--tall">
        <div class="page-title">添加送洗物品</div>

        <van-cell-group inset title="选择部门">
          <van-radio-group v-model="selectedDeptId">
            <van-cell
              v-for="dept in departments"
              :key="dept.id"
              :title="dept.name"
              clickable
              @click="selectedDeptId = dept.id; selectedStaffId = null"
            >
              <template #right-icon>
                <van-radio :name="dept.id" />
              </template>
            </van-cell>
          </van-radio-group>
        </van-cell-group>

        <van-cell-group v-if="selectedDeptId" inset title="选择人员" style="margin-top: 12px">
          <van-radio-group v-model="selectedStaffId">
            <van-cell
              v-for="staff in filteredStaff"
              :key="staff.id"
              :title="staff.name"
              clickable
              @click="selectedStaffId = staff.id"
            >
              <template #right-icon>
                <van-radio :name="staff.id" />
              </template>
            </van-cell>
          </van-radio-group>
          <van-cell v-if="filteredStaff.length === 0" title="该部门暂无人员，请先到设置页添加" />
        </van-cell-group>

        <div v-if="selectedStaffId" style="margin-top: 12px">
          <van-cell-group
            v-for="group in groupedItemTypes"
            :key="group.label"
            inset
            :title="group.label"
            style="margin-top: 10px"
          >
            <van-cell v-for="item in group.items" :key="item.id" :title="item.name">
              <template #right-icon>
                <van-stepper
                  v-model="selectedItems[item.id]"
                  min="0"
                  :default-value="0"
                  input-width="56px"
                  button-size="36px"
                />
              </template>
            </van-cell>
          </van-cell-group>
        </div>

        <div v-if="selectedStaffId" class="bottom-actions">
          <van-button block type="primary" @click="addRecord">确认添加</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>
