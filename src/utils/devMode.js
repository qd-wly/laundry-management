import { devMode } from './devModeState.js'
import { collectLocalSnapshot, replaceLocalSnapshot } from './localData.js'
import { saveToDesktopStorage } from './desktopStorage.js'

const DEV_SNAPSHOT_KEY = 'laundry-dev-snapshot'
const DEV_DRAFT_KEY = 'laundry-dev-draft-backup'
const DEV_EDITOR_KEY = 'laundry-dev-editor-backup'
const INTAKE_DRAFT_KEY = 'laundry-intake-draft-v1'
const EDITOR_DRAFT_KEY = 'laundry-editor-draft-v1'

export { devMode }

export async function enterDevMode() {
  const snapshot = await collectLocalSnapshot()
  window.localStorage.setItem(DEV_SNAPSHOT_KEY, JSON.stringify(snapshot))
  const draftBackup = window.localStorage.getItem(INTAKE_DRAFT_KEY)
  if (draftBackup) { window.localStorage.setItem(DEV_DRAFT_KEY, draftBackup) }
  else { window.localStorage.removeItem(DEV_DRAFT_KEY) }
  const editorBackup = window.localStorage.getItem(EDITOR_DRAFT_KEY)
  if (editorBackup) { window.localStorage.setItem(DEV_EDITOR_KEY, editorBackup) }
  else { window.localStorage.removeItem(DEV_EDITOR_KEY) }
  devMode.value = true
}

export async function exitDevMode() {
  await restoreFromDevSnapshot()
  devMode.value = false
  await saveToDesktopStorage()
}

async function restoreFromDevSnapshot() {
  const raw = window.localStorage.getItem(DEV_SNAPSHOT_KEY)
  if (raw) {
    try {
      const snapshot = JSON.parse(raw)
      await replaceLocalSnapshot(snapshot)
    } catch (e) {
      console.error('[DevMode] restore failed', e)
    }
    window.localStorage.removeItem(DEV_SNAPSHOT_KEY)
  }
  const draftBackup = window.localStorage.getItem(DEV_DRAFT_KEY)
  if (draftBackup) { window.localStorage.setItem(INTAKE_DRAFT_KEY, draftBackup) }
  else { window.localStorage.removeItem(INTAKE_DRAFT_KEY) }
  window.localStorage.removeItem(DEV_DRAFT_KEY)
  const editorBackup = window.localStorage.getItem(DEV_EDITOR_KEY)
  if (editorBackup) { window.localStorage.setItem(EDITOR_DRAFT_KEY, editorBackup) }
  else { window.localStorage.removeItem(EDITOR_DRAFT_KEY) }
  window.localStorage.removeItem(DEV_EDITOR_KEY)
}

export async function autoRestoreIfNeeded() {
  const hasSnapshot = window.localStorage.getItem(DEV_SNAPSHOT_KEY)
  if (hasSnapshot) {
    console.log('[DevMode] Found leftover dev snapshot, restoring...')
    await restoreFromDevSnapshot()
    await saveToDesktopStorage()
  }
}
