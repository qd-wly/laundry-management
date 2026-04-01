import historySeed from '../data/history-seed.json'
import { db } from '../db/index.js'

function createRecordId(batchId, rowIndex, itemIndex, pieceIndex = null) {
  const baseId = `${batchId}-r${String(rowIndex + 1).padStart(3, '0')}-i${String(itemIndex + 1).padStart(3, '0')}`
  if (pieceIndex === null) return baseId
  return `${baseId}-p${String(pieceIndex + 1).padStart(3, '0')}`
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
  const itemType = { id, name, category: 'personal', sortOrder }
  itemTypeMap.set(name, itemType)
  return itemType
}

function findStaffByName(name, staffMap) {
  for (const [key, id] of staffMap.entries()) {
    if (key.endsWith(`::${name}`)) return { id, departmentId: Number(key.split('::')[0]) }
  }
  return null
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

export async function importHistorySeed(filters = {}, { clearAll = false } = {}) {
  const batchesToImport = filterBatches(filters)
  const departmentMap = new Map((await db.departments.toArray()).map(item => [item.name, item.id]))
  const itemTypeMap = new Map((await db.itemTypes.toArray()).map(item => [item.name, item]))
  const staffMap = new Map(
    (await db.staff.toArray()).map(item => [`${item.departmentId}::${item.name}`, item.id])
  )

  let importedBatchCount = 0
  let importedRecordCount = 0

  await db.transaction('rw', db.departments, db.itemTypes, db.staff, db.batches, db.records, async () => {
    if (clearAll) {
      await db.records.clear()
      await db.batches.clear()
    }

    for (const batch of batchesToImport) {
      await db.batches.put({
        id: batch.id,
        sendDate: batch.sendDate,
        note: batch.note || '',
        sourceFile: batch.sourceFile || '',
        sourceKey: batch.sourceKey || '',
        lifecycleHint: batch.lifecycleHint || '',
        createdAt: batch.sendDate ? `${batch.sendDate}T00:00:00.000Z` : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      await db.records.where('batchId').equals(batch.id).delete()

      const records = []
      for (const [rowIndex, row] of batch.rows.entries()) {
        let departmentId
        let staffId

        if (row.departmentName) {
          departmentId = await ensureDepartmentId(row.departmentName, departmentMap)
          staffId = await ensureStaffId(row.staffName, departmentId, staffMap)
        } else {
          const existing = findStaffByName(row.staffName, staffMap)
          if (existing) {
            departmentId = existing.departmentId
            staffId = existing.id
          } else {
            departmentId = await ensureDepartmentId('未分组', departmentMap)
            staffId = await ensureStaffId(row.staffName, departmentId, staffMap)
          }
        }

        for (const [itemIndex, item] of row.items.entries()) {
          const itemType = await ensureItemTypeId(item.itemName, itemTypeMap)
          const isReceivedOnly = batch.lifecycleHint === 'received_only'
          const status = isReceivedOnly
            ? 'pending'
            : batch.receiveDate || batch.billingDate
              ? 'received'
              : 'washed'
          const createdAt = batch.sendDate ? `${batch.sendDate}T00:00:00.000Z` : new Date().toISOString()
          const baseRecord = {
            batchId: batch.id,
            departmentId,
            staffId,
            itemTypeId: itemType.id,
            note: '',
            photo: '',
            status,
            createdAt,
            sentAt: isReceivedOnly ? '' : batch.sendDate || '',
            receivedAt: isReceivedOnly ? '' : batch.receiveDate || batch.billingDate || '',
            distributedAt: '',
          }

          if (itemType.category === 'personal') {
            for (let pieceIndex = 0; pieceIndex < item.quantity; pieceIndex += 1) {
              records.push({
                ...baseRecord,
                id: createRecordId(batch.id, rowIndex, itemIndex, pieceIndex),
                quantity: 1,
                pieceNo: pieceIndex + 1,
              })
            }
            continue
          }

          records.push({
            ...baseRecord,
            id: createRecordId(batch.id, rowIndex, itemIndex),
            quantity: item.quantity,
            pieceNo: null,
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
