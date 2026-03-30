import { db } from '../db/index.js'

const BASE_URL_KEY = 'server_base_url'
const API_KEY = 'server_api_key'

function normalizeBaseUrl(value = '') {
  return value.trim().replace(/\/+$/, '')
}

async function readSettingValue(key) {
  return (await db.settings.get(key))?.value || ''
}

async function requestServer(path, options = {}) {
  const config = await getServerConfig()
  if (!config) {
    return { success: false, error: '未配置服务器地址或访问密钥' }
  }

  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })

    const text = await response.text()
    let data = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      data = { message: text }
    }

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || data?.message || `请求失败（${response.status}）`,
      }
    }

    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export async function getServerConfig() {
  const baseUrl = normalizeBaseUrl(await readSettingValue(BASE_URL_KEY))
  const apiKey = (await readSettingValue(API_KEY)).trim()

  if (!baseUrl || !apiKey) {
    return null
  }

  return { baseUrl, apiKey }
}

export async function saveServerConfig({ baseUrl, apiKey }) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedApiKey = apiKey.trim()

  await db.settings.put({ key: BASE_URL_KEY, value: normalizedBaseUrl })
  await db.settings.put({ key: API_KEY, value: normalizedApiKey })

  return {
    baseUrl: normalizedBaseUrl,
    apiKey: normalizedApiKey,
  }
}

export async function readServerSettings() {
  return {
    baseUrl: normalizeBaseUrl(await readSettingValue(BASE_URL_KEY)),
    apiKey: await readSettingValue(API_KEY),
  }
}

export async function collectLocalData() {
  return {
    departments: await db.departments.toArray(),
    staff: await db.staff.toArray(),
    itemTypes: await db.itemTypes.toArray(),
    batches: await db.batches.toArray(),
    records: await db.records.toArray(),
    exportedAt: new Date().toISOString(),
  }
}

export async function replaceLocalData(snapshot) {
  await db.transaction('rw', db.departments, db.staff, db.itemTypes, db.batches, db.records, async () => {
    if (Array.isArray(snapshot.departments)) {
      await db.departments.clear()
      await db.departments.bulkAdd(snapshot.departments)
    }
    if (Array.isArray(snapshot.staff)) {
      await db.staff.clear()
      await db.staff.bulkAdd(snapshot.staff)
    }
    if (Array.isArray(snapshot.itemTypes)) {
      await db.itemTypes.clear()
      await db.itemTypes.bulkAdd(snapshot.itemTypes)
    }
    if (Array.isArray(snapshot.batches)) {
      await db.batches.clear()
      await db.batches.bulkAdd(snapshot.batches)
    }
    if (Array.isArray(snapshot.records)) {
      await db.records.clear()
      await db.records.bulkAdd(snapshot.records)
    }
  })
}

export async function pushToServer() {
  const snapshot = await collectLocalData()
  const result = await requestServer('/api/sync', {
    method: 'PUT',
    body: JSON.stringify(snapshot),
  })

  if (!result.success) {
    return result
  }

  return {
    success: true,
    savedAt: result.data?.savedAt || '',
  }
}

export async function pullFromServer() {
  const result = await requestServer('/api/sync', { method: 'GET' })
  if (!result.success) {
    return result
  }

  return {
    success: true,
    data: result.data?.snapshot || null,
    savedAt: result.data?.savedAt || '',
  }
}

export async function importFromServer() {
  const result = await pullFromServer()
  if (!result.success) {
    return result
  }

  if (!result.data) {
    return { success: true, message: '服务器暂无数据' }
  }

  await replaceLocalData(result.data)
  return {
    success: true,
    message: result.savedAt ? `数据已从服务器拉取（${result.savedAt}）` : '数据已从服务器拉取',
  }
}

export async function checkServerHealth(baseUrl) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) {
    return { success: false, error: '请先填写服务器地址' }
  }

  try {
    const response = await fetch(`${normalizedBaseUrl}/api/health`)
    const data = await response.json()
    if (!response.ok) {
      return { success: false, error: data?.error || '服务器不可用' }
    }

    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
