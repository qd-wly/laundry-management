import fs from 'node:fs'
import path from 'node:path'

const departments = [
  { id: 1, name: '领导', sortOrder: 1 },
  { id: 2, name: '运行中心', sortOrder: 2 },
  { id: 3, name: '营销部', sortOrder: 3 },
  { id: 4, name: '展览项目运营部', sortOrder: 4 },
  { id: 5, name: '综合办公室', sortOrder: 5 },
  { id: 6, name: '采购部', sortOrder: 6 },
  { id: 7, name: '综合服务部', sortOrder: 7 },
  { id: 8, name: '财务部', sortOrder: 8 },
]

const staff = [
  { id: 1, name: '田海超', departmentId: 1, isActive: true },
  { id: 2, name: '何威', departmentId: 1, isActive: true },
  { id: 3, name: '马新枝', departmentId: 1, isActive: true },
  { id: 4, name: '赵文风', departmentId: 2, isActive: true },
  { id: 5, name: '郭岩森', departmentId: 2, isActive: true },
  { id: 6, name: '杨银银', departmentId: 2, isActive: true },
  { id: 7, name: '张涛', departmentId: 2, isActive: true },
  { id: 8, name: '高海阔', departmentId: 7, isActive: true },
  { id: 9, name: '王微', departmentId: 8, isActive: true },
  { id: 10, name: '侯迪', departmentId: 2, isActive: true },
  { id: 11, name: '孙贺超', departmentId: 2, isActive: true },
  { id: 12, name: '刘宁_运行', departmentId: 2, isActive: true },
  { id: 13, name: '王林懿', departmentId: 2, isActive: true },
  { id: 14, name: '荣锴鑫', departmentId: 2, isActive: true },
  { id: 15, name: '郭磊磊', departmentId: 2, isActive: false },
  { id: 16, name: '曲渤', departmentId: 3, isActive: true },
  { id: 17, name: '程少华', departmentId: 3, isActive: true },
  { id: 18, name: '侯研', departmentId: 3, isActive: true },
  { id: 19, name: '梁艺', departmentId: 3, isActive: true },
  { id: 20, name: '刘云', departmentId: 3, isActive: true },
  { id: 21, name: '任文源', departmentId: 3, isActive: true },
  { id: 22, name: '孙博伟', departmentId: 3, isActive: true },
  { id: 23, name: '于佳伦', departmentId: 3, isActive: true },
  { id: 24, name: '芦潇', departmentId: 3, isActive: true },
  { id: 25, name: '刘阳', departmentId: 3, isActive: true },
  { id: 26, name: '管雨晴', departmentId: 3, isActive: true },
  { id: 27, name: '段然', departmentId: 4, isActive: true },
  { id: 28, name: '彭淼', departmentId: 4, isActive: true },
  { id: 29, name: '侯磊', departmentId: 4, isActive: true },
  { id: 30, name: '于丽亚', departmentId: 5, isActive: true },
  { id: 31, name: '艾星羽', departmentId: 5, isActive: true },
  { id: 32, name: '王炜', departmentId: 5, isActive: true },
  { id: 33, name: '夏芳', departmentId: 5, isActive: true },
  { id: 34, name: '邓佳', departmentId: 5, isActive: true },
  { id: 35, name: '张悦', departmentId: 5, isActive: false },
  { id: 36, name: '孙婷婷', departmentId: 6, isActive: true },
  { id: 37, name: '苏燕麟', departmentId: 6, isActive: true },
  { id: 38, name: '马晨', departmentId: 7, isActive: true },
  { id: 39, name: '腾菲', departmentId: 7, isActive: true },
  { id: 40, name: '汪旭', departmentId: 7, isActive: true },
  { id: 41, name: '周笛音', departmentId: 7, isActive: true },
  { id: 42, name: '张启平', departmentId: 7, isActive: true },
  { id: 43, name: '蒋聪慧', departmentId: 8, isActive: true },
  { id: 44, name: '胡青璇', departmentId: 8, isActive: true },
  { id: 45, name: '蒋睿', departmentId: 8, isActive: true },
  { id: 46, name: '刘宁_财务', departmentId: 8, isActive: true },
]

const targetFiles = [
  'C:/Users/linyi/AppData/Roaming/laundry-management/data/laundry-data.json',
  path.join(process.cwd(), 'release', 'data', 'laundry-data.json'),
]

for (const file of targetFiles) {
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  payload.snapshot.departments = departments
  payload.snapshot.staff = staff
  payload.snapshot.exportedAt = new Date().toISOString()
  payload.savedAt = payload.snapshot.exportedAt
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log(`synced: ${file}`)
}
