import type { ApiErrorBody, FieldError, LoginResult, PageMeta, User } from "@shikkhaos/types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors: FieldError[] = [], public requestId?: string, public details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
  }
  fieldMessage(field: string): string | undefined { return this.fieldErrors.find((f) => f.field === field)?.message; }
}

export interface TokenStore { load(): Promise<string | null>; save(refreshToken: string | null): Promise<void> }
export const memoryTokenStore = (): TokenStore => { let t: string | null = null; return { load: async () => t, save: async (v) => { t = v; } }; };

export interface ClientOptions {
  baseUrl: string; // e.g. "/api/v1" or "https://api.school.example/api/v1"
  platform: "web" | "desktop" | "android";
  deviceId: string;
  /** Web uses an HttpOnly cookie for the refresh token (no store). Desktop/mobile pass a secure store. */
  tokenStore?: TokenStore;
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
}

export type Query = Record<string, string | number | boolean | undefined | null>;
export interface ReqOpts { query?: Query; body?: unknown; headers?: Record<string, string>; idempotencyKey?: string; ifMatch?: number; signal?: AbortSignal; reauthToken?: string }
export interface Page<T> { data: T[]; meta: PageMeta }

const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 3) | 8).toString(16); }));
export const newId = uuid;

export class ApiClient {
  accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private f: typeof fetch;
  constructor(public opts: ClientOptions) { this.f = opts.fetchImpl ?? ((...a) => fetch(...a)); }
  private get isWeb() { return this.opts.platform === "web"; }

  private url(path: string, query?: Query): string {
    const u = this.opts.baseUrl.replace(/\/$/, "") + path;
    if (!query) return u;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
    const s = p.toString();
    return s ? `${u}?${s}` : u;
  }

  private headers(extra?: Record<string, string>, withAuth = true): Record<string, string> {
    const h: Record<string, string> = { "X-Client": this.isWeb ? "web" : this.opts.platform === "android" ? "mobile" : "desktop", "X-Device-Id": this.opts.deviceId, "X-Request-Id": uuid(), ...extra };
    if (withAuth && this.accessToken) h.Authorization = `Bearer ${this.accessToken}`;
    return h;
  }

  async raw<T>(method: string, path: string, o: ReqOpts = {}, retried = false): Promise<{ data: T; meta?: PageMeta }> {
    const headers = this.headers({ ...(o.body !== undefined ? { "Content-Type": "application/json" } : {}), ...(o.idempotencyKey ? { "Idempotency-Key": o.idempotencyKey } : {}), ...(o.ifMatch !== undefined ? { "If-Match": `"${o.ifMatch}"` } : {}), ...(o.reauthToken ? { "X-Reauth-Token": o.reauthToken } : {}), ...o.headers });
    let res: Response;
    try {
      res = await this.f(this.url(path, o.query), { method, headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined, signal: o.signal, credentials: this.isWeb ? "include" : "omit" });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ApiError(0, "NETWORK", "Cannot reach the server. Check your connection.");
    }
    if (res.status === 204) return { data: undefined as T };
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
    if (res.ok) {
      if (json === null || typeof json !== "object" || !("data" in json)) throw new ApiError(res.status, "BAD_GATEWAY", "The server did not return an API response. Check that the API is running and that API_PROXY_TARGET / the API base URL is configured.");
      return { data: json.data as T, meta: json.meta };
    }
    const err = (json as ApiErrorBody | null)?.error;
    if (res.status === 401 && err?.code === "TOKEN_EXPIRED" && !retried && (await this.refresh())) return this.raw<T>(method, path, o, true);
    if (res.status === 401 && (err?.code === "TOKEN_REVOKED" || err?.code === "UNAUTHENTICATED") && this.accessToken) { this.accessToken = null; this.opts.onSessionExpired?.(); }
    throw new ApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? `Request failed (${res.status})`, err?.fieldErrors ?? [], err?.requestId ?? res.headers.get("x-request-id") ?? undefined, err?.details);
  }

  async get<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> { return (await this.raw<T>("GET", path, { query, signal })).data; }
  async page<T>(path: string, query?: Query, signal?: AbortSignal): Promise<Page<T>> { const r = await this.raw<T[]>("GET", path, { query, signal }); return { data: r.data ?? [], meta: r.meta ?? { limit: 0, nextCursor: null, hasMore: false } }; }
  /** Follow cursors until exhausted (bounded). */
  async all<T>(path: string, query?: Query, max = 1000): Promise<T[]> {
    const out: T[] = []; let cursor: string | undefined;
    for (let i = 0; i < 50 && out.length < max; i++) { const p = await this.page<T>(path, { limit: 100, ...query, cursor }); out.push(...p.data); if (!p.meta.nextCursor) break; cursor = p.meta.nextCursor; }
    return out;
  }
  async post<T>(path: string, body?: unknown, o: Omit<ReqOpts, "body"> = {}): Promise<T> { return (await this.raw<T>("POST", path, { ...o, body: body ?? {} })).data; }
  async put<T>(path: string, body?: unknown, o: Omit<ReqOpts, "body"> = {}): Promise<T> { return (await this.raw<T>("PUT", path, { ...o, body })).data; }
  async patch<T>(path: string, body?: unknown, o: Omit<ReqOpts, "body"> = {}): Promise<T> { return (await this.raw<T>("PATCH", path, { ...o, body })).data; }
  async del<T>(path: string): Promise<T> { return (await this.raw<T>("DELETE", path)).data; }

  /** Single-flight refresh: concurrent 401s share one rotation. */
  refresh(): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        try {
          const stored = this.isWeb ? null : await this.opts.tokenStore?.load();
          if (!this.isWeb && !stored) return false;
          const r = await this.f(this.url("/auth/refresh"), { method: "POST", headers: this.headers({ "Content-Type": "application/json" }, false), body: JSON.stringify(this.isWeb ? {} : { refreshToken: stored }), credentials: this.isWeb ? "include" : "omit" });
          const j: any = await r.json().catch(() => null);
          if (!r.ok) { await this.opts.tokenStore?.save(null); this.accessToken = null; this.opts.onSessionExpired?.(); return false; }
          this.accessToken = j.data.accessToken;
          if (!this.isWeb && j.data.refreshToken) await this.opts.tokenStore?.save(j.data.refreshToken);
          return true;
        } catch { return false; } finally { this.refreshing = null; }
      })();
    }
    return this.refreshing;
  }

  async login(identifier: string, password: string): Promise<LoginResult> {
    const r = await this.raw<LoginResult>("POST", "/auth/login", { body: { identifier, password, deviceId: this.opts.deviceId, platform: this.opts.platform } });
    this.accessToken = r.data.accessToken;
    if (!this.isWeb && r.data.refreshToken) await this.opts.tokenStore?.save(r.data.refreshToken);
    return r.data;
  }
  /** Restore a session from the stored refresh token / cookie. */
  async restore(): Promise<{ user: User; permissions: string[] } | null> {
    if (!(await this.refresh())) return null;
    try { return await this.get<{ user: User; permissions: string[] }>("/auth/me"); } catch { return null; }
  }
  async logout(): Promise<void> {
    try { await this.post("/auth/logout"); } catch { /* already invalid */ }
    this.accessToken = null; await this.opts.tokenStore?.save(null);
  }
  async reauth(password: string): Promise<string> { return (await this.post<{ reauthToken: string }>("/auth/reauth", { password })).reauthToken; }

  /** Upload contract C14: presign -> PUT bytes -> complete. */
  async upload(file: { name: string; type: string; size: number; data: Blob | ArrayBuffer }, kind: string): Promise<{ id: string }> {
    const start = await this.post<{ fileId: string; uploadUrl: string }>("/files/uploads", { filename: file.name, mimeType: file.type, sizeBytes: file.size, kind });
    const put = await this.f(start.uploadUrl.startsWith("/api/v1") ? this.opts.baseUrl.replace(/\/api\/v1\/?$/, "") + start.uploadUrl : start.uploadUrl, { method: "PUT", headers: this.headers({ "Content-Type": file.type }), body: file.data as BodyInit, credentials: this.isWeb ? "include" : "omit" });
    if (!put.ok) throw new ApiError(put.status, "UPLOAD_FAILED", "Upload failed");
    return this.post<{ id: string }>(`/files/${start.fileId}/complete`);
  }
  async downloadUrl(fileId: string): Promise<string> {
    const r = await this.get<{ url: string }>(`/files/${fileId}/download-url`);
    return r.url.startsWith("/api/v1") ? this.opts.baseUrl.replace(/\/api\/v1\/?$/, "") + r.url : r.url;
  }

  wsUrl(ticket: string): string {
    const base = this.opts.baseUrl.replace(/\/$/, "");
    const abs = base.startsWith("http") ? base : `${globalThis.location?.origin ?? ""}${base}`;
    return abs.replace(/^http/, "ws") + `/ws?ticket=${encodeURIComponent(ticket)}`;
  }
}

// ---------------- Realtime (contract C11) ----------------
export type WsHandler = (payload: any, envelope: { id: string; type: string; ts: string }) => void;
export type WsState = "idle" | "connecting" | "open" | "closed";

export class Realtime {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<WsHandler>>();
  private stateHandlers = new Set<(s: WsState) => void>();
  private attempt = 0;
  private stopped = true;
  private timer: ReturnType<typeof setTimeout> | null = null;
  state: WsState = "idle";
  constructor(private api: ApiClient, private WS: typeof WebSocket = globalThis.WebSocket) {}
  on(type: string, h: WsHandler): () => void { const s = this.handlers.get(type) ?? new Set(); s.add(h); this.handlers.set(type, s); return () => s.delete(h); }
  onState(h: (s: WsState) => void): () => void { this.stateHandlers.add(h); h(this.state); return () => this.stateHandlers.delete(h); }
  private set(s: WsState) { this.state = s; this.stateHandlers.forEach((h) => h(s)); }
  start() { if (!this.stopped) return; this.stopped = false; void this.connect(); }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.ws?.close(); this.ws = null; this.set("idle"); }
  send(type: string, payload: unknown): boolean {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify({ id: newId(), type, ts: new Date().toISOString(), payload }));
    return true;
  }
  private async connect() {
    if (this.stopped || !this.api.accessToken) return;
    this.set("connecting");
    try {
      const { ticket } = await this.api.post<{ ticket: string }>("/ws/tickets");
      const ws = new this.WS(this.api.wsUrl(ticket));
      this.ws = ws;
      ws.onopen = () => { this.attempt = 0; this.set("open"); this.emit("ws.open", {}); };
      ws.onmessage = (ev) => { try { const m = JSON.parse(String(ev.data)); this.emit(m.type, m.payload, m); } catch { /* ignore malformed frames */ } };
      ws.onclose = () => { this.set("closed"); this.emit("ws.close", {}); this.schedule(); };
      ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
    } catch { this.set("closed"); this.schedule(); }
  }
  /** Exponential backoff with jitter; consumers re-fetch via REST on `ws.open` after a gap. */
  private schedule() {
    if (this.stopped) return;
    const delay = Math.min(30000, 1000 * 2 ** this.attempt++) * (0.5 + Math.random() / 2);
    this.timer = setTimeout(() => void this.connect(), delay);
  }
  private emit(type: string, payload: any, env: any = { id: "", type, ts: "" }) { this.handlers.get(type)?.forEach((h) => h(payload, env)); this.handlers.get("*")?.forEach((h) => h(payload, env)); }
}
