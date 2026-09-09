const { app, BrowserWindow, clipboard, dialog, ipcMain } = require("electron");
const { assertDatabaseContent, readDatabaseFile, writeDatabaseFile } = require("./database-files.cjs");
const path = require("path");

const databasePath = () => path.join(app.getAppPath(), "cairm-full-database.json");
const appIconPath = () => path.join(__dirname, "src", "icons", process.platform === "win32" ? "app-icon.ico" : "app-icon.png");
function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: "CairmDB Manager",
    icon: appIconPath(),
    autoHideMenuBar: true,
    backgroundColor: "#151719",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });
  // The renderer is local-only; imported content must never navigate this window.
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, "src", "renderer", "index.html"));
}

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) app.dock.setIcon(appIconPath());
  ipcMain.handle("app:version", () => app.getVersion());
  ipcMain.handle("database:default", () => readDatabaseFile(databasePath()));
  ipcMain.handle("database:open", async () => {
    const result = await dialog.showOpenDialog({
      title: "Open a CairmDB database",
      properties: ["openFile"],
      filters: [{ name: "CairmDB JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, content: await readDatabaseFile(result.filePaths[0]) };
  });
  ipcMain.handle("database:save", async (_event, json) => {
    assertDatabaseContent(json);
    const result = await dialog.showSaveDialog({
      title: "Save the CairmDB database",
      defaultPath: "CairmDB.json",
      filters: [{ name: "CairmDB JSON", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await writeDatabaseFile(result.filePath, json);
    return { saved: true };
  });
  ipcMain.handle("database:copy", (_event, json) => {
    assertDatabaseContent(json);
    clipboard.writeText(json);
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
