const path = require('node:path')
const { execFile } = require('node:child_process')
const { app, BrowserWindow, ipcMain, screen, shell } = require('electron')
const storage = require('./storage.cjs')

let mainWindow = null

function getIndexPath() {
  return path.join(__dirname, '..', 'docs', 'index.html')
}

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay()
  const width = Math.min(1440, Math.max(1200, workAreaSize.width - 48))
  const height = Math.min(960, Math.max(760, workAreaSize.height - 56))

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1100,
    minHeight: 760,
    autoHideMenuBar: true,
    show: false,
    center: true,
    title: '布草送洗管理',
    backgroundColor: '#0f1318',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  mainWindow.webContents.session.setPermissionCheckHandler((_webContents, permission) => {
    return ['media', 'camera', 'microphone'].includes(permission)
  })

  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(['media', 'camera', 'microphone'].includes(permission))
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadFile(getIndexPath())
}

function getProjectRoot() {
  if (app.isPackaged) {
    // app.getAppPath() → release/win-unpacked/resources/app.asar
    // → resources → win-unpacked → release → project root
    return path.resolve(app.getAppPath(), '..', '..', '..', '..')
  }
  return path.resolve(__dirname, '..')
}

function runGit(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: getProjectRoot(), timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr.trim() || err.message))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}

async function syncToGitHub() {
  const fs = require('node:fs/promises')
  const dataFile = 'server/data/laundry-data.json'
  const projectRoot = getProjectRoot()
  const targetPath = path.join(projectRoot, dataFile)

  // In packaged mode, data lives in userData — copy it to project dir for git
  if (app.isPackaged) {
    const sourceDir = path.join(app.getPath('userData'), 'data')
    const sourcePath = path.join(sourceDir, 'laundry-data.json')
    try {
      await fs.access(sourcePath)
      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.copyFile(sourcePath, targetPath)
    } catch {
      return { success: false, message: '数据文件不存在，请先点击"立即保存"' }
    }
  }

  try {
    await fs.access(targetPath)
  } catch {
    return { success: false, message: '数据文件不存在，请先点击"立即保存"' }
  }

  const now = new Date()
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  await runGit(['add', dataFile])

  const status = await runGit(['status', '--porcelain', dataFile])
  if (!status) {
    return { success: true, message: '数据无变化，无需同步' }
  }

  await runGit(['commit', '-m', `data: 同步业务数据 ${stamp}`])
  await runGit(['push'])

  return { success: true, message: `已同步到 GitHub（${stamp}）` }
}

function registerIpc() {
  ipcMain.handle('laundry:list-backups', async () => storage.listBackups(app))
  ipcMain.handle('laundry:restore-backup', async (_event, fileName) => storage.restoreBackup(app, fileName))
  ipcMain.handle('laundry:get-status', async () => storage.getStatus(app))
  ipcMain.handle('laundry:read-snapshot', async () => storage.readSnapshot(app))
  ipcMain.handle('laundry:write-snapshot', async (_event, snapshot) => storage.writeSnapshot(app, snapshot))
  ipcMain.handle('laundry:set-title', async (_event, title) => {
    if (mainWindow) mainWindow.setTitle(title)
  })
  ipcMain.handle('laundry:get-fullscreen', async () => {
    return mainWindow ? mainWindow.isFullScreen() : false
  })
  ipcMain.handle('laundry:set-fullscreen', async (_event, flag) => {
    if (mainWindow) mainWindow.setFullScreen(!!flag)
  })
  ipcMain.handle('laundry:sync-to-github', async () => {
    try {
      return await syncToGitHub()
    } catch (error) {
      return { success: false, message: error.message || '同步失败' }
    }
  })
}

app.whenReady().then(async () => {
  await storage.ensureStorageDirs(app)
  await storage.createStartupBackup(app).catch(() => {})
  registerIpc()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
