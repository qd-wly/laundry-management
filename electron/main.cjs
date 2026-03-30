const path = require('node:path')
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
    backgroundColor: '#edf1f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.loadFile(getIndexPath())
}

function registerIpc() {
  ipcMain.handle('laundry:get-status', async () => storage.getStatus(app))
  ipcMain.handle('laundry:read-snapshot', async () => storage.readSnapshot(app))
  ipcMain.handle('laundry:write-snapshot', async (_event, snapshot) => storage.writeSnapshot(app, snapshot))
}

app.whenReady().then(async () => {
  await storage.ensureStorageDirs(app)
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
