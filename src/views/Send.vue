<script setup>
import { ref, computed, onMounted } from 'vue'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/index.js'
import { pushToServer } from '../utils/serverSync.js'
import { showToast, showSuccessToast, showFailToast } from 'vant'

const sendDate = ref(new Date().toISOString().slice(0, 10))
const showDatePicker = ref(false)
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])
const currentRecords = ref([])
const note = ref('')
const syncing = ref(false)

// 添加记录表单
const showAddForm = ref(false)
const selectedDeptId = ref(null)
const selectedStaffId = ref(null)
const selectedItems = ref({})

const filteredStaff = computed(() => {
  if (!selectedDeptId.value) return []
  return staffList.value.filter(s => s.departmentId === selectedDeptId.value && s.isActive !== false)
})

const deptName = computed(() => {
  const d = departments.value.find(d => d.id === selectedDeptId.value)
  return d ? d.name : ''
})

const staffName = computed(() => {
  const s = staffList.value.find(s => s.id === selectedStaffId.value)
  return s ? s.name : ''
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

const recordsSummary = computed(() => {
  return currentRecords.value.map(rec => {
    const dept = departments.value.find(d => d.id === rec.departmentId)
    const staff = staffList.value.find(s => s.id === rec.staffId)
    const items = rec.items
      .map(i => {
        const type = itemTypes.value.find(t => t.id === i.itemTypeId)
        return `${type?.name || ''}x${i.quantity}`
      })
      .join('、')
    return {
      ...rec,
      deptName: dept?.name || '',
      staffName: staff?.name || '',
      itemsText: items,
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

function addRecord() {
  if (!selectedDeptId.value || !selectedStaffId.value) {
    showToast('请选择部门和人员')
    return
  }

  const items = Object.entries(selectedItems.value)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => ({ itemTypeId: Number(id), quantity: Number(qty) }))

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
  showSuccessToast('已添加')
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
  const batch = {
    id: batchId,
    sendDate: sendDate.value,
    receiveDate: '',
    billingDate: '',
    status: 'washing',
    note: note.value,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const records = []
  for (const rec of currentRecords.value) {
    for (const item of rec.items) {
      records.push({
        id: uuidv4(),
        batchId,
        departmentId: rec.departmentId,
        staffId: rec.staffId,
        itemTypeId: item.itemTypeId,
        quantity: item.quantity,
        note: '',
      })
    }
  }

  await db.batches.add(batch)
  await db.records.bulkAdd(records)

  // 自动同步到服务器
  syncing.value = true
  const result = await pushToServer()
  syncing.value = false

  if (result.success) {
    showSuccessToast('已提交并同步到服务器')
  } else {
    showFailToast(`已保存本地，${result.error || '服务器同步失败'}`)
  }

  // 重置
  currentRecords.value = []
  note.value = ''
}
</script>

<template>
  <div class="page">
    <div class="page-title">送洗登记</div>

    <van-cell-group inset>
      <van-cell title="送洗日期" :value="sendDate" is-link @click="showDatePicker = true" />
      <van-cell title="备注" :value="note || '无'" is-link @click="note = prompt('输入备注', note) || note" />
    </van-cell-group>

    <van-popup v-model:show="showDatePicker" position="bottom" round>
      <van-date-picker
        title="选择日期"
        :min-date="new Date(2025, 0, 1)"
        :max-date="new Date(2030, 11, 31)"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </van-popup>

    <!-- 已添加的记录 -->
    <div v-if="recordsSummary.length > 0" style="margin-top: 12px">
      <van-cell-group inset title="本批次记录">
        <van-swipe-cell v-for="(rec, idx) in recordsSummary" :key="idx">
          <van-cell :title="`${rec.deptName} - ${rec.staffName}`" :label="rec.itemsText" />
          <template #right>
            <van-button square type="danger" text="删除" style="height: 100%" @click="removeRecord(idx)" />
          </template>
        </van-swipe-cell>
      </van-cell-group>
    </div>

    <!-- 添加记录按钮 -->
    <div style="margin: 16px">
      <van-button block plain type="primary" icon="plus" @click="openAddForm">
        添加人员物品
      </van-button>
    </div>

    <!-- 提交按钮 -->
    <div style="margin: 0 16px" v-if="currentRecords.length > 0">
      <van-button block type="primary" :loading="syncing" loading-text="同步中..." @click="submitBatch">
        提交送洗批次（{{ currentRecords.length }}条记录）
      </van-button>
    </div>

    <!-- 添加记录弹窗 -->
    <van-popup v-model:show="showAddForm" position="bottom" round :style="{ height: '85%' }" closeable>
      <div style="padding: 16px; padding-top: 40px">
        <div class="page-title">添加送洗物品</div>

        <!-- 选部门 -->
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

        <!-- 选人员 -->
        <van-cell-group v-if="selectedDeptId" inset title="选择人员" style="margin-top: 12px">
          <van-radio-group v-model="selectedStaffId">
            <van-cell
              v-for="s in filteredStaff"
              :key="s.id"
              :title="s.name"
              clickable
              @click="selectedStaffId = s.id"
            >
              <template #right-icon>
                <van-radio :name="s.id" />
              </template>
            </van-cell>
          </van-radio-group>
          <van-cell v-if="filteredStaff.length === 0" title="该部门暂无人员，请在设置中添加" />
        </van-cell-group>

        <!-- 填物品数量 -->
        <div v-if="selectedStaffId" style="margin-top: 12px">
          <van-cell-group
            v-for="group in groupedItemTypes"
            :key="group.label"
            inset
            :title="group.label"
            style="margin-top: 8px"
          >
            <van-cell v-for="item in group.items" :key="item.id" :title="item.name">
              <template #right-icon>
                <van-stepper
                  v-model="selectedItems[item.id]"
                  min="0"
                  :default-value="0"
                  input-width="50px"
                  button-size="28px"
                />
              </template>
            </van-cell>
          </van-cell-group>
        </div>

        <!-- 确认添加 -->
        <div v-if="selectedStaffId" style="margin: 16px">
          <van-button block type="primary" @click="addRecord">确认添加</van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>
