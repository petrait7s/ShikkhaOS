import * as React from "react";
import { createRoot } from "react-dom/client";
import "@shikkhaos/screens/styles.css";
import { ApiClient, memoryTokenStore, type TokenStore } from "@shikkhaos/api-client";
import { App } from "@shikkhaos/screens";

// Refresh token lives in the OS-protected store (Electron safeStorage / Windows DPAPI), never in localStorage.
const bridge = window.shikkhaos;
const tokenStore: TokenStore = bridge ? { load: () => bridge.secureStore.get(), save: (v) => bridge.secureStore.set(v) } : memoryTokenStore();
function deviceId(): string { try { let id = localStorage.getItem("sos.deviceId"); if (!id) { id = crypto.randomUUID(); localStorage.setItem("sos.deviceId", id); } return id; } catch { return crypto.randomUUID(); } }

const api = new ApiClient({ baseUrl: __API_BASE_URL__, platform: "desktop", deviceId: deviceId(), tokenStore });

function UpdateBanner() {
  const [s, setS] = React.useState<UpdaterState>({ status: "idle" });
  React.useEffect(() => bridge?.updater.onState(setS), []);
  if (!bridge || !["available", "downloading", "ready"].includes(s.status)) return null;
  return (
    <div role="status" style={{ position: "fixed", right: 16, bottom: 40, zIndex: 90, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow)", padding: "10px 14px", maxWidth: 360 }}>
      {s.status === "ready" ? <><strong>Update {s.version} ready</strong><div className="muted">Restart ShikkhaOS to finish updating.</div><button className="btn primary sm" style={{ marginTop: 8 }} onClick={() => void bridge.updater.install()}>Restart now</button></>
        : <><strong>Downloading update {s.version ?? ""}</strong><div className="muted">{s.percent ? `${Math.round(s.percent)}%` : "Starting…"}</div></>}
    </div>
  );
}

function Root() {
  const [version, setVersion] = React.useState<string>();
  React.useEffect(() => { void bridge?.version().then(setVersion); }, []);
  React.useEffect(() => bridge?.onMenu((a) => { if (a.startsWith("go:")) window.location.hash = `#${a.slice(3)}`; }), []);
  return <>
    <App api={api} router="hash" platform={{ kind: "desktop", version, mode: __API_MODE__, notify: (t, b) => bridge?.notify(t, b) }} />
    <UpdateBanner />
  </>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Root /></React.StrictMode>);
