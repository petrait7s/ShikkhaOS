import { contextBridge, ipcRenderer } from "electron";

// Minimal, typed, validated surface. No Node or Electron objects are exposed to the page.
contextBridge.exposeInMainWorld("shikkhaos", {
  secureStore: { get: (): Promise<string | null> => ipcRenderer.invoke("secure-store:get"), set: (v: string | null): Promise<void> => ipcRenderer.invoke("secure-store:set", v) },
  notify: (title: string, body: string) => ipcRenderer.send("notify", String(title).slice(0, 120), String(body).slice(0, 300)),
  version: (): Promise<string> => ipcRenderer.invoke("app:version"),
  onMenu: (cb: (action: string) => void) => { const h = (_: unknown, a: string) => cb(a); ipcRenderer.on("menu", h); return () => ipcRenderer.removeListener("menu", h); },
  updater: {
    check: (): Promise<void> => ipcRenderer.invoke("updater:check"),
    install: (): Promise<void> => ipcRenderer.invoke("updater:install"),
    onState: (cb: (s: unknown) => void) => { const h = (_: unknown, s: unknown) => cb(s); ipcRenderer.on("updater:state", h); return () => ipcRenderer.removeListener("updater:state", h); },
  },
});
