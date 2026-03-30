import historySeed from '../data/history-seed.json'
import { db } from '../db/index.js'

function createRecordId(batchId, rowIndex, itemIndex) {
  return `${batchId}-r${String(rowIndex + 1).padStart(3, '0')}-i${String(itemIndex + 1).padStart(3, '0')}`
}

function filterBatches(filters = {}) {
  const { year, month } = filters
  const monthPrefix = year && month ? `${year}-${String(month).padStart(2, '0')}` : ''

  return historySeed.batches.filter(batch => {
    if (monthPrefix && !batch.sendDate.startsWith(monthPrefix)) {
      return false
    }
    return true
  })
}

async function ensureDepartmentId(name, departmentMap) {
  if (departmentMap.has(name)) {
    return departmentMap.get(name)
  }

  const sortOrder = departmentMap.size + 1
  const id = await db.departments.add({ name, sortOrder })
  departmentMap.set(name, id)
  return id
}

async function ensureItemTypeId(name, itemTypeMap) {
  if (itemTypeMap.has(name)) {
    return itemTypeMap.get(name)
  }

  const sortOrder = itemTypeMap.size + 1
  const id = await db.itemTypes.add({ name, category: 'personal', sortOrder })
  itemTypeMap.set(name, id)
  return id
}

async function ensureStaffId(name, departmentId, staffMap) {
  const key = `${departmentId}::${name}`
  if (staffMap.has(key)) {
    return staffMap.get(key)
  }

  const id = await db.staff.add({
    name,
    departmentId,
    isActive: true,
  })

  staffMap.set(key, id)
  return id
}

export function getHistorySeedSummary(filters = {}) {
  const batches = filterBatches(filters)
  return {
    fileCount: historySeed.summary.fileCount,
    batchCount: batches.length,
    recordCount: batches.reduce((sum, batch) => sum + batch.rows.length, 0),
    itemRecordCount: batches.reduce(
      (sum, batch) => sum + batch.rows.reduce((rowSum, row) => rowSum + row.items.length, 0),
      0
    ),
  }
}

export async function importHistorySeed(filters = {}) {
  const batchesToImport = filterBatches(filters)
  const departmentMap = new Map((await db.departments.toArray()).map(item => [item.name, item.id]))
  const itemTypeMap = new Map((await db.itemTypes.toArray()).map(item => [item.name, item.id]))
  const staffMap = new Map(
    (await db.staff.toArray()).map(item => [`${item.departmentId}::${item.name}`, item.id])
  )

  let importedBatchCount = 0
  let importedRecordCount = 0

  await db.transaction('rw', db.departments, db.itemTypes, db.staff, db.batches, db.records, async () => {
    for (const batch of batchesToImport) {
      const status = batch.billingDate
        ? 'billed'
        : batch.receiveDate
          ? 'received'
          : 'washing'

      await db.batches.put({
        id: batch.id,
        sendDate: batch.sendDate,
        receiveDate: batch.receiveDate || '',
        billingDate: batch.billingDate || '',
        status,
        note: batch.note || '',
        createdAt: batch.sendDate ? `${batch.sendDate}T00:00:00.000Z` : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      await db.records.where('batchId').equals(batch.id).delete()

      const records = []
      for (const [rowIndex, row] of batch.rows.entries()) {
        const departmentId = await ensureDepartmentId(row.departmentName, departmentMap)
        const staffId = await ensureStaffId(row.staffName, departmentId, staffMap)

        for (const [itemIndex, item] of row.items.entries()) {
          const itemTypeId = await ensureItemTypeId(item.itemName, itemTypeMap)
          records.push({
            id: createRecordId(batch.id, rowIndex, itemIndex),
            batchId: batch.id,
            departmentId,
            staffId,
            itemTypeId,
            quantity: item.quantity,
            note: '',
          })
        }
      }

      if (records.length > 0) {
        await db.records.bulkPut(records)
      }

      importedBatchCount += 1
      importedRecordCount += records.length
    }
  })

  return {
    success: true,
    importedBatchCount,
    importedRecordCount,
    summary: getHistorySeedSummary(filters),
  }
}
