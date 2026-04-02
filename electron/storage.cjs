const fs = require('node:fs/promises')
const path = require('node:path')

function normalizeSnapshot(payload = {}) {
  return {
    departments: Array.isArray(payload.departments) ? payload.departments : [],
    staff: Array.isArray(payload.staff) ? payload.staff : [],
    itemTypes: Array.isArray(payload.itemTypes) ? payload.itemTypes : [],
    batches: Array.isArray(payload.batches) ? payload.batches : [],
    records: Array.isArray(payload.records) ? payload.records : [],
    priceTables: Array.isArray(payload.priceTables) ? payload.priceTables : [],
    exportedAt: payload.exportedAt || new Date().toISOString(),
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

function resolveBaseDir(app) {
  if (app.isPackaged) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
    if (portableDir) {
      return path.join(portableDir, 'data')
    }
    return path.join(app.getPath('userData'), 'data')
  }

  return path.resolve(__dirname, '..', 'server', 'data')
}

function getStoragePaths(app) {
  const baseDir = resolveBaseDir(app)
  return {
    baseDir,
    dataFile: path.join(baseDir, 'laundry-data.json'),
    backupDir: path.join(baseDir, 'backups'),
  }
}

async function ensureStorageDirs(app) {
  const { baseDir, backupDir } = getStoragePaths(app)
  await fs.mkdir(baseDir, { recursive: true })
  await fs.mkdir(backupDir, { recursive: true })
}

async function readSnapshot(app) {
  const { dataFile } = getStoragePaths(app)
  const fileData = await readJsonIfExists(dataFile)
  if (!fileData) {
    return {
      snapshot: null,
      savedAt: '',
      dataFile,
    }
  }

  return {
    snapshot: normalizeSnapshot(fileData.snapshot || fileData),
    savedAt: fileData.savedAt || '',
    dataFile,
  }
}

async function createStartupBackup(app) {
  const { dataFile, backupDir } = getStoragePaths(app)
  await ensureStorageDirs(app)
  const current = await readJsonIfExists(dataFile)
  if (!current) return
  const now = new Date().toISOString()
  const backupPath = path.join(backupDir, `startup-${now.replace(/[:.]/g, '-')}.json`)
  await fs.writeFile(backupPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  await cleanOldBackups(backupDir, 30)
}

async function cleanOldBackups(backupDir, keepCount) {
  try {
    const files = await fs.readdir(backupDir)
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse()
    for (let i = keepCount; i < jsonFiles.length; i++) {
      await fs.unlink(path.join(backupDir, jsonFiles[i])).catch(() => {})
    }
  } catch {}
}

async function listBackups(app) {
  const { backupDir } = getStoragePaths(app)
  try {
    const files = await fs.readdir(backupDir)
    const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse()
    const result = []
    for (const file of jsonFiles.slice(0, 20)) {
      const stat = await fs.stat(path.join(backupDir, file))
      result.push({ file, size: stat.size, time: stat.mtime.toISOString() })
    }
    return result
  } catch { return [] }
}

async function restoreBackup(app, fileName) {
  const { dataFile, backupDir } = getStoragePaths(app)
  const backupPath = path.join(backupDir, fileName)
  const backupData = await readJsonIfExists(backupPath)
  if (!backupData) throw new Error('备份文件不存在或无法读取')

  // 先备份当前数据
  const current = await readJsonIfExists(dataFile)
  if (current) {
    const now = new Date().toISOString()
    const safePath = path.join(backupDir, `pre-restore-${now.replace(/[:.]/g, '-')}.json`)
    await fs.writeFile(safePath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
  }

  // 写入恢复的数据
  await fs.writeFile(dataFile, `${JSON.stringify(backupData, null, 2)}\n`, 'utf8')
  return { success: true, snapshot: normalizeSnapshot(backupData.snapshot || backupData) }
}

async function writeSnapshot(app, snapshot) {
  const { dataFile, backupDir } = getStoragePaths(app)
  const normalized = normalizeSnapshot(snapshot)
  const savedAt = new Date().toISOString()
  const payload = {
    snapshot: normalized,
    savedAt,
  }

  await ensureStorageDirs(app)

  const current = await readJsonIfExists(dataFile)
  if (current) {
    const backupPath = path.join(
      backupDir,
      `laundry-data-${savedAt.replace(/[:.]/g, '-')}.json`
    )
    await fs.writeFile(backupPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8')
    await cleanOldBackups(backupDir, 30)
  }

  const tempPath = `${dataFile}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, dataFile)

  return {
    savedAt,
    dataFile,
  }
}

async function getStatus(app) {
  await ensureStorageDirs(app)
  const snapshot = await readSnapshot(app)
  return {
    isDesktop: true,
    dataFile: snapshot.dataFile,
    savedAt: snapshot.savedAt || '',
  }
}

module.exports = {
  ensureStorageDirs,
  getStatus,
  readSnapshot,
  writeSnapshot,
  createStartupBackup,
  listBackups,
  restoreBackup,
}
