import { db } from '../db/index.js'

function normalizeSnapshot(payload = {}) {
  return {
    departments: Array.isArray(payload.departments) ? payload.departments : [],
    staff: Array.isArray(payload.staff) ? payload.staff : [],
    itemTypes: Array.isArray(payload.itemTypes) ? payload.itemTypes : [],
    batches: Array.isArray(payload.batches) ? payload.batches : [],
    records: Array.isArray(payload.records) ? payload.records : [],
    exportedAt: payload.exportedAt || new Date().toISOString(),
  }
}

function buildDownloadName(prefix, extension) {
  const now = new Date()
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')

  return `${prefix}_${stamp}.${extension}`
}

function triggerDownload(blob, fileName) {
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function collectLocalSnapshot() {
  return normalizeSnapshot({
    departments: await db.departments.toArray(),
    staff: await db.staff.toArray(),
    itemTypes: await db.itemTypes.toArray(),
    batches: await db.batches.toArray(),
    records: await db.records.toArray(),
    exportedAt: new Date().toISOString(),
  })
}

export async function replaceLocalSnapshot(snapshot) {
  const normalized = normalizeSnapshot(snapshot)

  await db.transaction('rw', db.departments, db.staff, db.itemTypes, db.batches, db.records, async () => {
    await db.departments.clear()
    if (normalized.departments.length > 0) {
      await db.departments.bulkAdd(normalized.departments)
    }

    await db.staff.clear()
    if (normalized.staff.length > 0) {
      await db.staff.bulkAdd(normalized.staff)
    }

    await db.itemTypes.clear()
    if (normalized.itemTypes.length > 0) {
      await db.itemTypes.bulkAdd(normalized.itemTypes)
    }

    await db.batches.clear()
    if (normalized.batches.length > 0) {
      await db.batches.bulkAdd(normalized.batches)
    }

    await db.records.clear()
    if (normalized.records.length > 0) {
      await db.records.bulkAdd(normalized.records)
    }
  })

  return normalized
}

export async function exportBackupJson() {
  const snapshot = await collectLocalSnapshot()
  const payload = {
    version: 1,
    snapshot,
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })

  triggerDownload(blob, buildDownloadName('布草送洗本地备份', 'json'))
}

export async function importBackupJson(file) {
  const raw = await file.text()
  const parsed = JSON.parse(raw)
  const snapshot = parsed.snapshot || parsed
  const normalized = await replaceLocalSnapshot(snapshot)

  return {
    success: true,
    batchCount: normalized.batches.length,
    recordCount: normalized.records.length,
  }
}
