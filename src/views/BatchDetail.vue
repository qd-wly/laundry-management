<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { db } from '../db/index.js'
import { pushToGitHub } from '../utils/github.js'
import { showSuccessToast, showConfirmDialog, showFailToast } from 'vant'

const route = useRoute()
const router = useRouter()
const batch = ref(null)
const records = ref([])
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])
const showDatePicker = ref(false)
const datePickerField = ref('')

const statusMap = { washing: '待领取', received: '已领取', billed: '已开单' }

onMounted(async () => {
  const id = route.params.id
  batch.value = await db.batches.get(id)
  records.value = await db.records.where('batchId').equals(id).toArray()
  departments.value = await db.departments.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.toArray()
})

function getDeptName(id) {
  return departments.value.find(d => d.id === id)?.name || ''
}
function getStaffName(id) {
  return staffList.value.find(s => s.id === id)?.name || ''
}
function getItemName(id) {
  return itemTypes.value.find(i => i.id === id)?.name || ''
}

function openDatePicker(field) {
  datePickerField.value = field
  showDatePicker.value = true
}

async function onDateConfirm({ selectedValues }) {
  const dateStr = selectedValues.join('-')
  if (datePickerField.value === 'receiveDate') {
    batch.value.receiveDate = dateStr
    batch.value.status = 'received'
  } else if (datePickerField.value === 'billingDate') {
    batch.value.billingDate = dateStr
    batch.value.status = 'billed'
  }
  batch.value.updatedAt = new Date().toISOString()
  await db.batches.put(batch.value)
  showDatePicker.value = false

  const result = await pushToGitHub()
  if (result.success) {
    showSuccessToast('已更新并同步到 GitHub')
  } else {
    showFailToast(`已更新本地，${result.error || 'GitHub 同步失败'}`)
  }
}

async function deleteBatch() {
  try {
    await showConfirmDialog({ title: '确认删除', message: '删除后无法恢复' })
    await db.records.where('batchId').equals(batch.value.id).delete()
    await db.batches.delete(batch.value.id)
    const result = await pushToGitHub()
    if (result.success) {
      showSuccessToast('已删除并同步到 GitHub')
    } else {
      showFailToast(`已删除本地，${result.error || 'GitHub 同步失败'}`)
    }
    router.back()
  } catch {
    // cancelled
  }
}

// 按部门+人员分组显示
function getGroupedRecords() {
  const groups = {}
  records.value.forEach(r => {
    const key = `${r.departmentId}-${r.staffId}`
    if (!groups[key]) {
      groups[key] = {
        deptName: getDeptName(r.departmentId),
        staffName: getStaffName(r.staffId),
        items: [],
      }
    }
    groups[key].items.push({
      name: getItemName(r.itemTypeId),
      quantity: r.quantity,
    })
  })
  return Object.values(groups)
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="批次详情" left-arrow @click-left="router.back()" />

    <template v-if="batch">
      <van-cell-group inset style="margin-top: 12px">
        <van-cell title="送洗日期" :value="batch.sendDate" />
        <van-cell
          title="领取日期"
          :value="batch.receiveDate || '未领取'"
          is-link
          @click="openDatePicker('receiveDate')"
        />
        <van-cell
          title="开单日期"
          :value="batch.billingDate || '未开单'"
          is-link
          @click="openDatePicker('billingDate')"
        />
        <van-cell title="状态" :value="statusMap[batch.status]" />
        <van-cell v-if="batch.note" title="备注" :value="batch.note" />
      </van-cell-group>

      <van-cell-group inset title="送洗明细" style="margin-top: 12px">
        <div v-for="(group, idx) in getGroupedRecords()" :key="idx">
          <van-cell :title="`${group.deptName} - ${group.staffName}`">
            <template #label>
              <van-tag
                v-for="item in group.items"
                :key="item.name"
                plain
                type="primary"
                size="medium"
                style="margin: 2px 4px 2px 0"
              >
                {{ item.name }} x{{ item.quantity }}
              </van-tag>
            </template>
          </van-cell>
        </div>
      </van-cell-group>

      <div style="margin: 24px 16px">
        <van-button block plain type="danger" @click="deleteBatch">删除此批次</van-button>
      </div>
    </template>

    <van-popup v-model:show="showDatePicker" position="bottom" round>
      <van-date-picker
        :title="datePickerField === 'receiveDate' ? '选择领取日期' : '选择开单日期'"
        :min-date="new Date(2025, 0, 1)"
        :max-date="new Date(2030, 11, 31)"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </van-popup>
  </div>
</template>
