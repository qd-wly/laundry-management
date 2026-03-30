<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showFailToast, showSuccessToast } from 'vant'
import { db } from '../db/index.js'
import { saveToDesktopStorage } from '../utils/desktopStorage.js'

const route = useRoute()
const router = useRouter()
const batch = ref(null)
const records = ref([])
const departments = ref([])
const staffList = ref([])
const itemTypes = ref([])
const showDatePicker = ref(false)
const datePickerField = ref('')

const statusMap = {
  washing: '待领取',
  received: '已领取',
  billed: '已开单',
}

const groupedRecords = computed(() => {
  const groups = {}

  records.value.forEach(record => {
    const key = `${record.departmentId}-${record.staffId}`
    if (!groups[key]) {
      groups[key] = {
        deptName: departments.value.find(item => item.id === record.departmentId)?.name || '',
        staffName: staffList.value.find(item => item.id === record.staffId)?.name || '',
        items: [],
      }
    }

    groups[key].items.push({
      name: itemTypes.value.find(item => item.id === record.itemTypeId)?.name || '',
      quantity: record.quantity,
    })
  })

  return Object.values(groups)
})

const totalItems = computed(() => {
  return records.value.reduce((sum, record) => sum + record.quantity, 0)
})

onMounted(async () => {
  const id = route.params.id
  batch.value = await db.batches.get(id)
  records.value = await db.records.where('batchId').equals(id).toArray()
  departments.value = await db.departments.toArray()
  staffList.value = await db.staff.toArray()
  itemTypes.value = await db.itemTypes.toArray()
})

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

  const result = await saveToDesktopStorage()
  if (result.success) {
    showSuccessToast('已更新本地数据库文件')
  } else {
    showFailToast(`已保存在当前页面缓存，${result.error || '未写入桌面数据文件'}`)
  }
}

async function deleteBatch() {
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: '删除后将从本地数据库文件中移除，且无法恢复。',
    })

    await db.records.where('batchId').equals(batch.value.id).delete()
    await db.batches.delete(batch.value.id)

    const result = await saveToDesktopStorage()
    if (result.success) {
      showSuccessToast('已删除并写入本地数据库文件')
    } else {
      showFailToast(`已从当前页面缓存删除，${result.error || '未写入桌面数据文件'}`)
    }

    router.back()
  } catch {
    // cancelled
  }
}
</script>

<template>
  <div class="page">
    <van-nav-bar title="批次详情" left-arrow @click-left="router.back()" />

    <template v-if="batch">
      <section class="hero-card" style="margin-top: 12px">
        <div class="hero-grid">
          <div class="hero-metric">
            <span class="hero-label">送洗日期</span>
            <strong>{{ batch.sendDate }}</strong>
          </div>
          <div class="hero-metric">
            <span class="hero-label">状态</span>
            <strong>{{ statusMap[batch.status] }}</strong>
          </div>
          <div class="hero-metric">
            <span class="hero-label">总件数</span>
            <strong>{{ totalItems }}</strong>
          </div>
        </div>
      </section>

      <div class="section-stack">
        <van-cell-group inset>
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

        <van-cell-group inset title="送洗明细">
          <div v-for="(group, index) in groupedRecords" :key="index">
            <van-cell :title="`${group.deptName} - ${group.staffName}`">
              <template #label>
                <van-tag
                  v-for="item in group.items"
                  :key="`${item.name}-${item.quantity}`"
                  plain
                  type="primary"
                  size="medium"
                  style="margin: 2px 6px 2px 0"
                >
                  {{ item.name }} x{{ item.quantity }}
                </van-tag>
              </template>
            </van-cell>
          </div>
        </van-cell-group>
      </div>

      <div class="bottom-actions">
        <van-button block plain type="danger" @click="deleteBatch">删除此批次</van-button>
      </div>
    </template>

    <van-empty v-else description="未找到批次记录" style="margin-top: 80px" />

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
