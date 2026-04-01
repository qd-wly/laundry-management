const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('laundryDesktop', {
  isDesktop: true,
  getStatus: () => ipcRenderer.invoke('laundry:get-status'),
  readSnapshot: () => ipcRenderer.invoke('laundry:read-snapshot'),
  writeSnapshot: snapshot => ipcRenderer.invoke('laundry:write-snapshot', snapshot),
  setTitle: title => ipcRenderer.invoke('laundry:set-title', title),
})
