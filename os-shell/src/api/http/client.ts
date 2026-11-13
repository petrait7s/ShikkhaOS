// Minimal fetch client for the ShikkhaOS Rust API (docs/api/openapi.yaml).
// Auth: login with platform "desktop" so the refresh token comes back in the body (works cross-origin, e.g. Vercel -> API host).
import { ApiError } from "../mock/db";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080/api/v1").replace(/\/$/, "");
const RT_KEY = "shikkaos:http:rt";
const SESSION_KEY = "shikkaos:http:session";

let access: string | null = null;
let refreshing: Promise<boolean> | null = null;

const ls = {
  get: (k: string) => { try { return typeof window === "undefined" ? null : window.localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string | null) => { try { if (typeof window === "undefined") return; if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};

export function deviceId(): string {
  const k = "shikkaos:http:device";
  let d = ls.get(k);
  if (!d) { d = crypto.randomUUID(); ls.set(k, d); }
  return d;
}

export const storedSession = <T,>(): T | null => { const s = ls.get(SESSION_KEY); try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
export const storeSession = (s: unknown | null) => ls.set(SESSION_KEY, s ? JSON.stringify(s) : null);
export const setTokens = (a: string | null, r?: string | null) => { access = a; if (r !== undefined) ls.set(RT_KEY, r); };

type Opts = { body?: unknown; query?: Record<string, string | number | undefined>; auth?: boolean; headers?: Record<string, string> };

async function raw(method: string, path: string, o: Opts = {}): Promise<Response> {
  const q = o.query ? "?" + Object.entries(o.query).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
  const headers: Record<string, string> = { Accept: "application/json", ...o.headers };
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  if (o.auth !== false && access) headers.Authorization = `Bearer ${access}`;
  try {
    return await fetch(`${API_BASE}${path}${q}`, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  } catch {
    throw new ApiError("Cannot reach the server. Check your connection.", "network");
  }
}

export async function refresh(): Promise<boolean> {
  const rt = ls.get(RT_KEY);
  if (!rt) return false;
  refreshing ??= (async () => {
    try {
      const r = await raw("POST", "/auth/refresh", { body: { refreshToken: rt }, auth: false });
      if (!r.ok) { setTokens(null, null); return false; }
      const j = await r.json();
      setTokens(j.data.accessToken, j.data.refreshToken ?? rt);
      return true;
    } catch { return false; } finally { refreshing = null; }
  })();
  return refreshing;
}

export async function call<T>(method: string, path: string, o: Opts = {}): Promise<{ data: T; meta?: { nextCursor: string | null; hasMore: boolean } }> {
  if (!access && o.auth !== false) await refresh();
  let r = await raw(method, path, o);
  if (r.status === 401 && o.auth !== false && (await refresh())) r = await raw(method, path, o);
  const text = await r.text();
  const j = text ? JSON.parse(text) : {};
  if (!r.ok) {
    const e = j?.error ?? {};
    throw new ApiError(e.message ?? `Request failed (${r.status})`, e.code ?? String(r.status));
  }
  return j;
}

/** Follow cursors until the list is exhausted (bounded). */
export async function listAll<T>(path: string, query: Record<string, string | number | undefined> = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const r = await call<T[]>("GET", path, { query: { ...query, limit: 100, cursor } });
    out.push(...r.data);
    if (!r.meta?.hasMore || !r.meta.nextCursor) break;
    cursor = r.meta.nextCursor;
  }
  return out;
}
