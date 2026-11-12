import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, safeStorage, session, shell, type MenuItemConstructorOptions } from "electron";
import { autoUpdater } from "electron-updater";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

const DEV_URL = process.env.SHIKKHAOS_DEV_URL; // set by `pnpm dev`
const isDev = !!DEV_URL;
let win: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ---------- secure token storage (DPAPI on Windows via safeStorage). Never falls back to plaintext. ----------
const storeFile = () => path.join(app.getPath("userData"), "session.bin");
ipcMain.handle("secure-store:get", () => {
  try { if (!safeStorage.isEncryptionAvailable() || !existsSync(storeFile())) return null; return safeStorage.decryptString(readFileSync(storeFile())); } catch { return null; }
});
ipcMain.handle("secure-store:set", (_e, v: string | null) => {
  try {
    if (v === null || v === undefined) { if (existsSync(storeFile())) unlinkSync(storeFile()); return; }
    if (typeof v !== "string" || v.length > 4096 || !safeStorage.isEncryptionAvailable()) return;
    writeFileSync(storeFile(), safeStorage.encryptString(v), { mode: 0o600 });
  } catch { /* storage unavailable: user signs in again next launch */ }
});
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.on("notify", (_e, title: string, body: string) => { if (Notification.isSupported()) new Notification({ title: String(title).slice(0, 120), body: String(body).slice(0, 300) }).show(); });

// ---------- auto update: HTTPS, sha512 from latest.yml, Authenticode publisher check when configured. Packaged installer builds only. ----------
type UState = { status: string; version?: string; percent?: number; message?: string };
const send = (s: UState) => win?.webContents.send("updater:state", s);
function setupUpdater() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR || process.env.SHIKKHAOS_DISABLE_UPDATES === "1") return;
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true; autoUpdater.allowPrerelease = false; autoUpdater.allowDowngrade = false;
  autoUpdater.on("checking-for-update", () => send({ status: "checking" }));
  autoUpdater.on("update-available", (i) => send({ status: "available", version: i.version }));
  autoUpdater.on("update-not-available", () => send({ status: "none" }));
  autoUpdater.on("download-progress", (p) => send({ status: "downloading", percent: p.percent }));
  autoUpdater.on("update-downloaded", (i) => send({ status: "ready", version: i.version }));
  autoUpdater.on("error", (e) => send({ status: "error", message: String(e?.message ?? e).slice(0, 200) }));
  const check = () => void autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15_000); setInterval(check, 4 * 3600_000);
  ipcMain.handle("updater:check", () => { check(); });
  ipcMain.handle("updater:install", () => { autoUpdater.quitAndInstall(); });
}
if (!app.isPackaged) { ipcMain.handle("updater:check", () => undefined); ipcMain.handle("updater:install", () => undefined); }

function menu(): Menu {
  const go = (label: string, route: string, accel?: string): MenuItemConstructorOptions => ({ label, accelerator: accel, click: () => win?.webContents.send("menu", `go:${route}`) });
  const t: MenuItemConstructorOptions[] = [
    { label: "File", submenu: [go("Dashboard", "/", "CmdOrCtrl+Home"), go("Profile & settings", "/profile", "CmdOrCtrl+,"), { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "togglefullscreen" }, ...(isDev ? [{ role: "toggleDevTools" } as MenuItemConstructorOptions] : [])] },
    { label: "Go", submenu: [go("Messages", "/messages"), go("Notices", "/notices"), go("Notifications", "/notifications"), go("Results", "/results")] },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "close" }] },
    { label: "Help", submenu: [
      { label: "Keyboard shortcuts", click: () => win?.webContents.send("menu", "go:/profile") },
      { label: "Check for updates", click: () => { if (app.isPackaged) void autoUpdater.checkForUpdates().catch(() => {}); else void dialog.showMessageBox({ message: "Updates are checked only in installed builds." }); } },
      { label: "About ShikkhaOS", click: () => void dialog.showMessageBox({ title: "ShikkhaOS", message: `ShikkhaOS ${app.getVersion()}`, detail: "One School. One System. One Connected Community." }) },
    ] },
  ];
  return Menu.buildFromTemplate(t);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 980, minHeight: 640, backgroundColor: "#f5f5f7", title: "ShikkhaOS", show: false,
    titleBarStyle: "hidden", titleBarOverlay: { color: "#f5f5f7", symbolColor: "#1d1d1f", height: 44 },
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, spellcheck: false },
  });
  win.once("ready-to-show", () => win?.show());
  win.setMenu(menu());
  // Lock navigation: the app never leaves its own origin; external https links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { const ok = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith("file://"); if (!ok) { e.preventDefault(); if (/^https:\/\//.test(url)) void shell.openExternal(url); } });
  win.webContents.on("will-attach-webview", (e) => e.preventDefault());
  if (DEV_URL) void win.loadURL(DEV_URL); else void win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  win.on("closed", () => { win = null; });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "notifications"));
  createWindow(); setupUpdater();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
