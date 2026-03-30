import { collectLocalSnapshot, replaceLocalSnapshot } from './localData.js'

async function requestLocalSite(path, options = {}) {
  try {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) : null

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `请求失败（${response.status}）`,
      }
    }

    return { success: true, data }
  } catch (error) {
    return {
      success: false,
      error: error.message || '本地站点未连接，请使用启动脚本打开项目',
    }
  }
}

export async function getLocalSiteStatus() {
  return requestLocalSite('/api/health', { method: 'GET' })
}

export async function loadFromLocalSite() {
  const result = await requestLocalSite('/api/local-data', { method: 'GET' })
  if (!result.success) {
    return result
  }

  return {
    success: true,
    data: result.data?.snapshot || null,
    savedAt: result.data?.savedAt || '',
  }
}

export async function saveToLocalSite() {
  const snapshot = await collectLocalSnapshot()
  const result = await requestLocalSite('/api/local-data', {
    method: 'PUT',
    body: JSON.stringify({ snapshot }),
  })

  if (!result.success) {
    return result
  }

  return {
    success: true,
    savedAt: result.data?.savedAt || '',
  }
}

export async function hydrateFromLocalSite() {
  const result = await loadFromLocalSite()
  if (!result.success) {
    return result
  }

  if (!result.data) {
    return saveToLocalSite()
  }

  await replaceLocalSnapshot(result.data)
  return {
    success: true,
    savedAt: result.savedAt || '',
  }
}
