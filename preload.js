const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cairmDesktop", {
  loadDefaultDatabase: () => ipcRenderer.invoke("database:default"),
  openDatabase: () => ipcRenderer.invoke("database:open"),
  saveDatabase: (json) => ipcRenderer.invoke("database:save", json),
  copyDatabase: (json) => ipcRenderer.invoke("database:copy", json)
});
