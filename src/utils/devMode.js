import { devMode } from './devModeState.js'
import { collectLocalSnapshot, replaceLocalSnapshot } from './localData.js'
import { saveToDesktopStorage } from './desktopStorage.js'

const DEV_SNAPSHOT_KEY = 'laundry-dev-snapshot'

export { devMode }

export async function enterDevMode() {
  const snapshot = await collectLocalSnapshot()
  sessionStorage.setItem(DEV_SNAPSHOT_KEY, JSON.stringify(snapshot))
  devMode.value = true
}

export async function exitDevMode() {
  const raw = sessionStorage.getItem(DEV_SNAPSHOT_KEY)
  if (raw) {
    try {
      const snapshot = JSON.parse(raw)
      await replaceLocalSnapshot(snapshot)
    } catch (e) {
      console.error('[DevMode] restore failed', e)
    }
    sessionStorage.removeItem(DEV_SNAPSHOT_KEY)
  }
  devMode.value = false
  await saveToDesktopStorage()
}
