import { collectLocalSnapshot, replaceLocalSnapshot } from './localData.js'
import { devMode } from './devModeState.js'

function getDesktopApi() {
  return window.laundryDesktop || null
}

export function isDesktopRuntime() {
  return Boolean(getDesktopApi())
}

export async function getStorageStatus() {
  const api = getDesktopApi()
  if (!api) {
    return {
      success: false,
      error: '当前不是桌面程序环境',
    }
  }

  try {
    return {
      success: true,
      data: await api.getStatus(),
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || '读取桌面存储状态失败',
    }
  }
}

export async function loadFromDesktopStorage() {
  const api = getDesktopApi()
  if (!api) {
    return {
      success: false,
      error: '当前不是桌面程序环境',
    }
  }

  try {
    const data = await api.readSnapshot()
    return {
      success: true,
      data: data?.snapshot || null,
      savedAt: data?.savedAt || '',
      dataFile: data?.dataFile || '',
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || '读取桌面数据失败',
    }
  }
}

export async function saveToDesktopStorage() {
  if (devMode.value) {
    return { success: true, savedAt: '', dataFile: '' }
  }

  const api = getDesktopApi()
  if (!api) {
    return {
      success: false,
      error: '当前不是桌面程序环境',
    }
  }

  try {
    const snapshot = await collectLocalSnapshot()
    const data = await api.writeSnapshot(snapshot)
    return {
      success: true,
      savedAt: data?.savedAt || '',
      dataFile: data?.dataFile || '',
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || '写入桌面数据失败',
    }
  }
}

export async function hydrateFromDesktopStorage() {
  const result = await loadFromDesktopStorage()
  if (!result.success) {
    return result
  }

  if (!result.data) {
    return saveToDesktopStorage()
  }

  await replaceLocalSnapshot(result.data)
  return {
    success: true,
    savedAt: result.savedAt || '',
    dataFile: result.dataFile || '',
  }
}
