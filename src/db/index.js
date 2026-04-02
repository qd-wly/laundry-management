import Dexie from 'dexie'

export const db = new Dexie('LaundryDB')

db.version(1).stores({
  departments: '++id, name, sortOrder',
  staff: '++id, name, departmentId, isActive',
  itemTypes: '++id, name, category, sortOrder',
  batches: 'id, sendDate, receiveDate, billingDate, status, createdAt',
  records: 'id, batchId, departmentId, staffId, itemTypeId',
  settings: 'key',
})

db.version(2).stores({
  departments: '++id, name, sortOrder',
  staff: '++id, name, departmentId, isActive',
  itemTypes: '++id, name, category, sortOrder',
  batches: 'id, sendDate, createdAt',
  records: 'id, batchId, departmentId, staffId, itemTypeId, status',
  settings: 'key',
})

db.version(3).stores({
  departments: '++id, name, sortOrder',
  staff: '++id, name, departmentId, isActive',
  itemTypes: '++id, name, category, sortOrder',
  batches: 'id, sendDate, createdAt',
  records: 'id, batchId, departmentId, staffId, itemTypeId, status, sentAt, receivedAt, distributedAt',
  settings: 'key',
})

db.version(4).stores({
  departments: '++id, name, sortOrder',
  staff: '++id, name, departmentId, isActive',
  itemTypes: '++id, name, category, sortOrder',
  batches: 'id, sendDate, createdAt',
  records: 'id, batchId, departmentId, staffId, itemTypeId, status, sentAt, receivedAt, distributedAt, deliveryId, pickupId',
  settings: 'key',
})

db.version(5).stores({
  departments: '++id, name, sortOrder',
  staff: '++id, name, departmentId, isActive',
  itemTypes: '++id, name, category, sortOrder',
  batches: 'id, sendDate, createdAt',
  records: 'id, batchId, departmentId, staffId, itemTypeId, status, sentAt, receivedAt, distributedAt, deliveryId, pickupId, distributionId, priceTableId',
  settings: 'key',
  priceTables: '++id, name',
})

const defaultDepartments = [
  { name: '领导', sortOrder: 1 },
  { name: '运行中心', sortOrder: 2 },
  { name: '营销部', sortOrder: 3 },
  { name: '展览项目运营部', sortOrder: 4 },
  { name: '综合办公室', sortOrder: 5 },
  { name: '采购部', sortOrder: 6 },
  { name: '综合服务部', sortOrder: 7 },
  { name: '财务部', sortOrder: 8 },
]

const defaultStaffSeed = [
  { departmentName: '领导', name: '田海超', isActive: true },
  { departmentName: '领导', name: '何威', isActive: true },
  { departmentName: '领导', name: '马新枝', isActive: true },

  { departmentName: '运行中心', name: '张涛', isActive: true },
  { departmentName: '运行中心', name: '侯迪', isActive: true },
  { departmentName: '运行中心', name: '赵文风', isActive: true },
  { departmentName: '运行中心', name: '孙贺超', isActive: true },
  { departmentName: '运行中心', name: '杨银银', isActive: true },
  { departmentName: '运行中心', name: '刘宁_运行', isActive: true },
  { departmentName: '运行中心', name: '郭岩森', isActive: true },
  { departmentName: '运行中心', name: '王林懿', isActive: true },
  { departmentName: '运行中心', name: '荣锴鑫', isActive: true },
  { departmentName: '运行中心', name: '郭磊磊', isActive: false },

  { departmentName: '营销部', name: '曲渤', isActive: true },
  { departmentName: '营销部', name: '程少华', isActive: true },
  { departmentName: '营销部', name: '侯研', isActive: true },
  { departmentName: '营销部', name: '梁艺', isActive: true },
  { departmentName: '营销部', name: '刘云', isActive: true },
  { departmentName: '营销部', name: '任文源', isActive: true },
  { departmentName: '营销部', name: '孙博伟', isActive: true },
  { departmentName: '营销部', name: '于佳伦', isActive: true },
  { departmentName: '营销部', name: '芦潇', isActive: true },
  { departmentName: '营销部', name: '刘阳', isActive: true },
  { departmentName: '营销部', name: '管雨晴', isActive: true },

  { departmentName: '展览项目运营部', name: '段然', isActive: true },
  { departmentName: '展览项目运营部', name: '彭淼', isActive: true },
  { departmentName: '展览项目运营部', name: '侯磊', isActive: true },

  { departmentName: '综合办公室', name: '于丽亚', isActive: true },
  { departmentName: '综合办公室', name: '艾星羽', isActive: true },
  { departmentName: '综合办公室', name: '王炜', isActive: true },
  { departmentName: '综合办公室', name: '夏芳', isActive: true },
  { departmentName: '综合办公室', name: '邓佳', isActive: true },
  { departmentName: '综合办公室', name: '张悦', isActive: false },

  { departmentName: '采购部', name: '孙婷婷', isActive: true },
  { departmentName: '采购部', name: '苏燕麟', isActive: true },

  { departmentName: '综合服务部', name: '马晨', isActive: true },
  { departmentName: '综合服务部', name: '高海阔', isActive: true },
  { departmentName: '综合服务部', name: '腾菲', isActive: true },
  { departmentName: '综合服务部', name: '汪旭', isActive: true },
  { departmentName: '综合服务部', name: '周笛音', isActive: true },
  { departmentName: '综合服务部', name: '张启平', isActive: true },

  { departmentName: '财务部', name: '蒋聪慧', isActive: true },
  { departmentName: '财务部', name: '胡青璇', isActive: true },
  { departmentName: '财务部', name: '蒋睿', isActive: true },
  { departmentName: '财务部', name: '刘宁_财务', isActive: true },
  { departmentName: '财务部', name: '王微', isActive: true },
]

const leaderStaffNames = ['田海超', '何威', '马新枝']

const legacyLeaderNameMap = new Map([
  ['田总', '田海超'],
  ['何总', '何威'],
  ['马总', '马新枝'],
])

const legacyDepartmentAliases = new Map([
  ['公司领导', '领导'],
  ['办公室', '综合办公室'],
  ['销售部', '营销部'],
])

const defaultItemTypes = [
  { name: '西服', category: 'personal', sortOrder: 1 },
  { name: '西裤', category: 'personal', sortOrder: 2 },
  { name: '领带', category: 'personal', sortOrder: 3 },
  { name: '衬衫', category: 'personal', sortOrder: 4 },
  { name: 'T恤', category: 'personal', sortOrder: 5 },
  { name: '羽绒服', category: 'personal', sortOrder: 6 },
  { name: '防晒衣', category: 'personal', sortOrder: 7 },
  { name: '床单', category: 'bedding', sortOrder: 8 },
  { name: '被罩', category: 'bedding', sortOrder: 9 },
  { name: '枕袋', category: 'bedding', sortOrder: 10 },
  { name: '工作服夏装', category: 'personal', sortOrder: 11 },
  { name: '工作服冬装', category: 'personal', sortOrder: 12 },
  { name: '冲锋衣三合一羽绒款', category: 'personal', sortOrder: 13 },
  { name: '冲锋衣三合一抓绒款', category: 'personal', sortOrder: 14 },
  { name: '白方台', category: 'banquet', sortOrder: 15 },
  { name: '方桌呢', category: 'banquet', sortOrder: 16 },
  { name: '单人BQ桌套（1.2m*0.9m）', category: 'banquet', sortOrder: 17 },
  { name: 'BQ桌套（1.8m*0.9m）', category: 'banquet', sortOrder: 18 },
  { name: '单人IB桌套（1.2m*0.6m）', category: 'banquet', sortOrder: 19 },
  { name: 'IB桌套（1.8m*0.6m）', category: 'banquet', sortOrder: 20 },
  { name: '白弹力椅套', category: 'banquet', sortOrder: 21 },
  { name: '小毛巾（0.32m*0.32m）', category: 'banquet', sortOrder: 22 },
  { name: '圆桌桌布（3.5m、4.5m、5.3m）', category: 'banquet', sortOrder: 23 },
  { name: '台裙', category: 'banquet', sortOrder: 24 },
]

const itemTypeRenames = new Map([
  ['台呢', '方桌呢'],
  ['单人BQ桌套', '单人BQ桌套（1.2m*0.9m）'],
  ['BQ桌套', 'BQ桌套（1.8m*0.9m）'],
  ['单人IB桌套', '单人IB桌套（1.2m*0.6m）'],
  ['IB桌套', 'IB桌套（1.8m*0.6m）'],
  ['小毛巾（32*32）', '小毛巾（0.32m*0.32m）'],
  ['冲锋衣', '冲锋衣三合一抓绒款'],
  ['抓绒衣', '冲锋衣三合一抓绒款'],
  ['冲锋衣两件套', '冲锋衣三合一抓绒款'],
  ['冲锋衣抓绒款', '冲锋衣三合一抓绒款'],
])

const retiredItemTypes = new Set(['白色桌布'])

async function seedDefaultStaff() {
  const departments = await db.departments.toArray()
  const departmentIdMap = new Map(departments.map(item => [item.name, item.id]))
  const staffRows = defaultStaffSeed
    .map(item => ({
      name: item.name,
      departmentId: departmentIdMap.get(item.departmentName),
      isActive: item.isActive,
    }))
    .filter(item => item.departmentId)

  if (staffRows.length > 0) {
    await db.staff.bulkAdd(staffRows)
  }
}

async function normalizeDepartments() {
  const departments = await db.departments.toArray()
  const departmentMap = new Map(departments.map(item => [item.name, item]))

  for (const department of departments) {
    const targetName = legacyDepartmentAliases.get(department.name)
    if (!targetName) continue

    const existingTarget = departmentMap.get(targetName)
    if (existingTarget && existingTarget.id !== department.id) {
      await db.staff.where('departmentId').equals(department.id).modify({ departmentId: existingTarget.id })
      await db.records.where('departmentId').equals(department.id).modify({ departmentId: existingTarget.id })
      await db.departments.delete(department.id)
      departmentMap.delete(department.name)
      continue
    }

    await db.departments.update(department.id, { name: targetName })
    departmentMap.delete(department.name)
    departmentMap.set(targetName, { ...department, name: targetName })
  }

  for (const item of defaultDepartments) {
    const existing = departmentMap.get(item.name)
    if (existing) {
      await db.departments.update(existing.id, { sortOrder: item.sortOrder })
      continue
    }

    const id = await db.departments.add(item)
    departmentMap.set(item.name, { ...item, id })
  }
}

async function normalizeDefaultStaff() {
  const departments = await db.departments.toArray()
  const departmentIdMap = new Map(departments.map(item => [item.name, item.id]))
  const existingStaff = await db.staff.toArray()

  if (existingStaff.length === 0) {
    await seedDefaultStaff()
    return
  }

  const seedByName = new Map(defaultStaffSeed.map(item => [item.name, item]))
  const existingByKey = new Map(existingStaff.map(item => [`${item.name}::${item.departmentId}`, item]))

  for (const seed of defaultStaffSeed) {
    const departmentId = departmentIdMap.get(seed.departmentName)
    if (!departmentId) continue

    const exactKey = `${seed.name}::${departmentId}`
    const exactMatch = existingByKey.get(exactKey)

    if (exactMatch) {
      await db.staff.update(exactMatch.id, { isActive: seed.isActive })
      continue
    }

    const sameName = existingStaff.find(item => item.name === seed.name)
    if (sameName) {
      await db.staff.update(sameName.id, {
        departmentId,
        isActive: seed.isActive,
      })
      continue
    }

    await db.staff.add({
      name: seed.name,
      departmentId,
      isActive: seed.isActive,
    })
  }

  const currentStaff = await db.staff.toArray()
  for (const staff of currentStaff) {
    const seed = seedByName.get(staff.name)
    if (!seed) continue

    const departmentId = departmentIdMap.get(seed.departmentName)
    if (!departmentId) continue

    await db.staff.update(staff.id, {
      departmentId,
      isActive: seed.isActive,
    })
  }
}

async function normalizeLeaderStaff() {
  const leadershipDepartment = await db.departments.filter(item => item.name === '领导').first()
  if (!leadershipDepartment) return

  for (const [legacyName, fullName] of legacyLeaderNameMap.entries()) {
    const legacyStaff = await db.staff
      .filter(item => item.name === legacyName && item.departmentId === leadershipDepartment.id)
      .first()

    if (!legacyStaff) continue

    const fullNameStaff = await db.staff
      .filter(item => item.name === fullName && item.departmentId === leadershipDepartment.id)
      .first()

    if (fullNameStaff && fullNameStaff.id !== legacyStaff.id) {
      await db.records.where('staffId').equals(legacyStaff.id).modify({ staffId: fullNameStaff.id })
      await db.staff.delete(legacyStaff.id)
      continue
    }

    await db.staff.update(legacyStaff.id, { name: fullName, isActive: true })
  }

  const leadershipStaff = await db.staff.where('departmentId').equals(leadershipDepartment.id).toArray()
  for (const staff of leadershipStaff) {
    if (leaderStaffNames.includes(staff.name)) {
      await db.staff.update(staff.id, { isActive: true })
    }
  }
}

async function normalizeItemTypes() {
  const existing = await db.itemTypes.toArray()
  const existingMap = new Map(existing.map(item => [item.name, item]))

  for (const [oldName, newName] of itemTypeRenames.entries()) {
    const oldItem = existingMap.get(oldName)
    if (!oldItem) continue

    const conflict = existingMap.get(newName)
    if (conflict) {
      await db.records.where('itemTypeId').equals(oldItem.id).modify({ itemTypeId: conflict.id })
      await db.itemTypes.delete(oldItem.id)
      existingMap.delete(oldName)
    } else {
      await db.itemTypes.update(oldItem.id, { name: newName })
      existingMap.delete(oldName)
      existingMap.set(newName, { ...oldItem, name: newName })
    }
  }

  for (const retiredName of retiredItemTypes) {
    const item = existingMap.get(retiredName)
    if (!item) continue

    const recordCount = await db.records.where('itemTypeId').equals(item.id).count()
    if (recordCount === 0) {
      await db.itemTypes.delete(item.id)
      existingMap.delete(retiredName)
    }
  }

  for (const defaultItem of defaultItemTypes) {
    const item = existingMap.get(defaultItem.name)
    if (item) {
      await db.itemTypes.update(item.id, {
        sortOrder: defaultItem.sortOrder,
        category: defaultItem.category,
      })
    } else {
      await db.itemTypes.add(defaultItem)
    }
  }
}

function buildLocalDateFromBatch(batch) {
  if (batch?.sendDate) return batch.sendDate
  if (batch?.createdAt) return String(batch.createdAt).slice(0, 10)
  return new Date().toISOString().slice(0, 10)
}

async function migrateRecordLifecycle() {
  const batches = await db.batches.toArray()
  const batchMap = new Map(batches.map(batch => [batch.id, batch]))
  const records = await db.records.toArray()

  for (const record of records) {
    const batch = batchMap.get(record.batchId)
    const patch = {}

    if (!record.status) {
      let status = 'washed'
      if (batch?.status === 'received' || batch?.status === 'billed' || batch?.receiveDate) {
        status = 'received'
      }
      patch.status = status
    }

    const nextStatus = patch.status || record.status || 'pending'
    const createdAt = record.createdAt || batch?.createdAt || `${buildLocalDateFromBatch(batch)}T00:00:00.000Z`

    if (!record.createdAt) patch.createdAt = createdAt
    if (record.note == null) patch.note = ''
    if (record.photo == null) patch.photo = ''
    if (!record.sentAt && nextStatus !== 'pending') patch.sentAt = buildLocalDateFromBatch(batch)
    if (!record.receivedAt && (nextStatus === 'received' || nextStatus === 'distributed')) {
      patch.receivedAt = batch?.receiveDate || buildLocalDateFromBatch(batch)
    }
    if (!record.distributedAt && nextStatus === 'distributed') {
      patch.distributedAt = record.receivedAt || patch.receivedAt || buildLocalDateFromBatch(batch)
    }

    if (Object.keys(patch).length > 0) {
      await db.records.update(record.id, patch)
    }
  }

  for (const batch of batches) {
    const patch = {}
    if (!batch.createdAt) {
      patch.createdAt = `${buildLocalDateFromBatch(batch)}T00:00:00.000Z`
    }
    if (!batch.updatedAt) {
      patch.updatedAt = patch.createdAt || batch.createdAt || new Date().toISOString()
    }
    if (Object.keys(patch).length > 0) {
      await db.batches.update(batch.id, patch)
    }
  }
}

async function normalizeHistoricalReceivedOnlyBatches() {
  const targetBatches = await db.batches
    .filter(batch => {
      const isImportedMarch2026 = String(batch.id || '').startsWith('legacy-') && String(batch.sendDate || '').startsWith('2026-03')
      return batch.lifecycleHint === 'received_only' || batch.sourceFile === '26年3月.md' || isImportedMarch2026
    })
    .toArray()

  for (const batch of targetBatches) {
    await db.records.where('batchId').equals(batch.id).modify(record => {
      record.status = 'pending'
      record.sentAt = ''
      record.receivedAt = ''
      record.distributedAt = ''
    })
  }
}

async function backfillMissingIntakeSignatures() {
  const records = await db.records.toArray()
  const needsUpdate = records.filter(r => !r.intakeSignature && r.status !== 'pending')
  if (needsUpdate.length === 0) return

  await db.records.where('id').anyOf(needsUpdate.map(r => r.id)).modify(record => {
    record.intakeSignature = 'NO_SIGNATURE'
    if (!record.intakeSignedAt) {
      record.intakeSignedAt = record.sentAt || record.createdAt || new Date().toISOString()
    }
  })
}

async function backfillMissingDeliveryIds() {
  const records = await db.records.toArray()
  const needsUpdate = records.filter(r => !r.deliveryId && (r.status === 'washed' || r.status === 'received' || r.status === 'distributed'))
  if (needsUpdate.length === 0) return

  // 昨天下午三点的统一编号
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const y = yesterday.getFullYear()
  const m = String(yesterday.getMonth() + 1).padStart(2, '0')
  const d = String(yesterday.getDate()).padStart(2, '0')
  const deliveryId = `SX${y}${m}${d}-1500`
  const sentAt = `${y}-${m}-${d}`

  await db.records.where('id').anyOf(needsUpdate.map(r => r.id)).modify(record => {
    record.deliveryId = deliveryId
    if (!record.sentAt) record.sentAt = sentAt
  })
}

const defaultPriceTable = {
  name: '香格里拉酒店价格表',
  prices: {
    '西服': 15, '西裤': 10, '领带': 4, '衬衫': 7, 'T恤': 8,
    '羽绒服': 25, '防晒衣': 5, '床单': 4, '被罩': 4, '枕袋': 1,
    '工作服夏裤': 10, '工作服冬裤': 10, '冲锋衣三合一羽绒款': 25,
    '冲锋衣三合一抓绒款': 16, '白方台': 16, '方桌套': 10,
    '单人BQ桌套（1.2m*0.9m）': 10, 'BQ桌套（1.8m*0.9m）': 12,
    '单人IB桌套（1.2m*0.6m）': 10, 'IB桌套（1.8m*0.6m）': 12,
    '白弹力椅套': 4, '小毛巾（0.32m*0.32m）': 1, '圆桌桌布': 13, '桌裙': 15,
  },
}

async function ensurePriceTable() {
  const existing = await db.priceTables.where('name').equals(defaultPriceTable.name).first()
  if (!existing) {
    await db.priceTables.add(defaultPriceTable)
  }
}

async function backfillPriceTableId() {
  const table = await db.priceTables.where('name').equals('香格里拉酒店价格表').first()
  if (!table) return
  const records = await db.records.toArray()
  const needsUpdate = records.filter(r => !r.priceTableId)
  if (needsUpdate.length === 0) return
  await db.records.where('id').anyOf(needsUpdate.map(r => r.id)).modify(record => {
    record.priceTableId = table.id
  })
}

export async function runPostHydrateMigrations() {
  await normalizeItemTypes()
  await backfillMissingIntakeSignatures()
  await backfillMissingDeliveryIds()
  await ensurePriceTable()
  await backfillPriceTableId()
}

export async function initDB() {
  const deptCount = await db.departments.count()
  if (deptCount === 0) {
    await db.departments.bulkAdd(defaultDepartments)
  }

  await normalizeDepartments()
  await normalizeDefaultStaff()
  await normalizeLeaderStaff()

  const itemCount = await db.itemTypes.count()
  if (itemCount === 0) {
    await db.itemTypes.bulkAdd(defaultItemTypes)
  } else {
    await normalizeItemTypes()
  }

  await migrateRecordLifecycle()
  await ensurePriceTable()
}
