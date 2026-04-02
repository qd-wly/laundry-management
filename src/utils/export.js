import * as XLSX from 'xlsx'
import { db } from '../db/index.js'
import { getStatusMeta } from './recordStatus.js'

export async function exportToExcel(year, month) {
  const departments = await db.departments.orderBy('sortOrder').toArray()
  const itemTypes = await db.itemTypes.orderBy('sortOrder').toArray()
  const staff = await db.staff.toArray()

  let batches = await db.batches.orderBy('sendDate').toArray()
  if (year && month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    batches = batches.filter(batch => batch.sendDate.startsWith(prefix))
  }

  const records = await db.records.toArray()
  const batchIds = new Set(batches.map(batch => batch.id))

  const deptMap = Object.fromEntries(departments.map(item => [item.id, item.name]))
  const staffMap = Object.fromEntries(staff.map(item => [item.id, item.name]))
  const itemMap = Object.fromEntries(itemTypes.map(item => [item.id, item.name]))
  const batchMap = Object.fromEntries(batches.map(item => [item.id, item]))

  const rows = records
    .filter(record => batchIds.has(record.batchId))
    .map(record => {
      const batch = batchMap[record.batchId] || {}
      return {
        接收日期: batch.sendDate || '',
        当前状态: getStatusMeta(record.status).label,
        送洗日期: record.sentAt || '',
        取回日期: record.receivedAt || '',
        发放日期: record.distributedAt || '',
        部门: deptMap[record.departmentId] || '',
        姓名: staffMap[record.staffId] || '',
        衣物: itemMap[record.itemTypeId] || '',
        数量: record.quantity,
        备注: record.note || '',
        有照片: record.photo ? '是' : '否',
        批次备注: batch.note || '',
      }
    })

  if (rows.length === 0) {
    rows.push({ 接收日期: '暂无数据' })
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  const sheetName = year && month ? `${year}年${month}月` : '全部数据'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const fileName = year && month
    ? `布草送洗记录_${year}年${month}月.xlsx`
    : '布草送洗记录_全部.xlsx'

  XLSX.writeFile(wb, fileName)
}
