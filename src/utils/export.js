import * as XLSX from 'xlsx'
import { db } from '../db/index.js'

export async function exportToExcel(year, month) {
  const departments = await db.departments.orderBy('sortOrder').toArray()
  const itemTypes = await db.itemTypes.orderBy('sortOrder').toArray()
  const staff = await db.staff.toArray()

  let batches = await db.batches.orderBy('sendDate').toArray()
  if (year && month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`
    batches = batches.filter(b => b.sendDate.startsWith(prefix))
  }

  const records = await db.records.toArray()

  const deptMap = Object.fromEntries(departments.map(d => [d.id, d.name]))
  const staffMap = Object.fromEntries(staff.map(s => [s.id, s.name]))
  const itemMap = Object.fromEntries(itemTypes.map(i => [i.id, i.name]))

  const rows = []
  for (const batch of batches) {
    const batchRecords = records.filter(r => r.batchId === batch.id)
    for (const rec of batchRecords) {
      rows.push({
        '送洗日期': batch.sendDate,
        '领取日期': batch.receiveDate || '',
        '开单日期': batch.billingDate || '',
        '状态': batch.status === 'washing' ? '待领取' : batch.status === 'received' ? '已领取' : '已开单',
        '部门': deptMap[rec.departmentId] || '',
        '姓名': staffMap[rec.staffId] || '',
        '物品': itemMap[rec.itemTypeId] || '',
        '数量': rec.quantity,
        '备注': rec.note || '',
      })
    }
  }

  if (rows.length === 0) {
    rows.push({ '送洗日期': '暂无数据' })
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  const sheetName = year && month ? `${year}年${month}月` : '全部数据'
  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const fileName = year && month
    ? `布草送洗记录_${year}年${month}月.xlsx`
    : `布草送洗记录_全部.xlsx`

  XLSX.writeFile(wb, fileName)
}
