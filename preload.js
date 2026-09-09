const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cairmDesktop", {
  getVersion: () => ipcRenderer.invoke("app:version"),
  loadDefaultDatabase: () => ipcRenderer.invoke("database:default"),
  openDatabase: () => ipcRenderer.invoke("database:open"),
  saveDatabase: (json) => ipcRenderer.invoke("database:save", json),
  copyDatabase: (json) => ipcRenderer.invoke("database:copy", json)
});
