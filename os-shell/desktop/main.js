// Electron main process. Serves the exported site from ../out (dev) or resources/web (packaged)
// through a custom app:// protocol so absolute /_next/... URLs and trailing-slash routes work.
const { app, BrowserWindow, protocol, net, shell, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const webRoot = app.isPackaged ? path.join(process.resourcesPath, "web") : path.join(__dirname, "..", "out");

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

function resolveFile(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const candidates = [path.join(webRoot, clean), path.join(webRoot, clean, "index.html"), path.join(webRoot, `${clean}.html`)];
  for (const c of candidates) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* try next */ }
  }
  return path.join(webRoot, "404.html");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 900, minHeight: 600, backgroundColor: "#efe9f4", title: "ShikkaOS",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: "deny" }; });
  void win.loadURL("app://shikkaos/login/");
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle("app", (request) => {
    const { pathname } = new URL(request.url);
    return net.fetch(pathToFileURL(resolveFile(pathname)).toString());
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
