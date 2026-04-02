const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('laundryDesktop', {
  isDesktop: true,
  getStatus: () => ipcRenderer.invoke('laundry:get-status'),
  readSnapshot: () => ipcRenderer.invoke('laundry:read-snapshot'),
  writeSnapshot: snapshot => ipcRenderer.invoke('laundry:write-snapshot', snapshot),
  setTitle: title => ipcRenderer.invoke('laundry:set-title', title),
  listBackups: () => ipcRenderer.invoke('laundry:list-backups'),
  restoreBackup: fileName => ipcRenderer.invoke('laundry:restore-backup', fileName),
  syncToGitHub: () => ipcRenderer.invoke('laundry:sync-to-github'),
  getFullScreen: () => ipcRenderer.invoke('laundry:get-fullscreen'),
  setFullScreen: (flag) => ipcRenderer.invoke('laundry:set-fullscreen', flag),
})
