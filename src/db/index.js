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

const defaultDepartments = [
  { name: '公司领导', sortOrder: 1 },
  { name: '办公室', sortOrder: 2 },
  { name: '运行中心', sortOrder: 3 },
  { name: '营销部', sortOrder: 4 },
  { name: '综合服务部', sortOrder: 5 },
  { name: '财务部', sortOrder: 6 },
  { name: '展览项目运营部', sortOrder: 7 },
]

const defaultItemTypes = [
  { name: '羽绒服', category: 'personal', sortOrder: 1 },
  { name: '冲锋衣', category: 'personal', sortOrder: 2 },
  { name: '抓绒衣', category: 'personal', sortOrder: 3 },
  { name: '冲锋衣两件套', category: 'personal', sortOrder: 4 },
  { name: '防晒衣', category: 'personal', sortOrder: 5 },
  { name: 'T恤', category: 'personal', sortOrder: 6 },
  { name: '西服', category: 'personal', sortOrder: 7 },
  { name: '西裤', category: 'personal', sortOrder: 8 },
  { name: '领带', category: 'personal', sortOrder: 9 },
  { name: '衬衫', category: 'personal', sortOrder: 10 },
  { name: '床单', category: 'bedding', sortOrder: 11 },
  { name: '被罩', category: 'bedding', sortOrder: 12 },
  { name: '枕袋', category: 'bedding', sortOrder: 13 },
  { name: '台呢', category: 'banquet', sortOrder: 14 },
  { name: '台裙', category: 'banquet', sortOrder: 15 },
  { name: '白方台', category: 'banquet', sortOrder: 16 },
  { name: '白色桌布', category: 'banquet', sortOrder: 17 },
  { name: '单人BQ桌套', category: 'banquet', sortOrder: 18 },
  { name: '单人IB桌套', category: 'banquet', sortOrder: 19 },
  { name: 'IB桌套', category: 'banquet', sortOrder: 20 },
  { name: 'BQ桌套', category: 'banquet', sortOrder: 21 },
  { name: '白弹力椅套', category: 'banquet', sortOrder: 22 },
  { name: '小毛巾（32*32）', category: 'banquet', sortOrder: 23 },
]

export async function initDB() {
  const deptCount = await db.departments.count()
  if (deptCount === 0) {
    await db.departments.bulkAdd(defaultDepartments)
  }

  const itemCount = await db.itemTypes.count()
  if (itemCount === 0) {
    await db.itemTypes.bulkAdd(defaultItemTypes)
  }
}
