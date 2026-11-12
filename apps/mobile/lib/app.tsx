import * as React from "react";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiClient, Realtime, type Query, type TokenStore } from "@shikkhaos/api-client";
import type { LoginResult, User } from "@shikkhaos/types";

const KEY = "sos.refresh";
const tokenStore: TokenStore = {
  load: async () => { try { return await SecureStore.getItemAsync(KEY); } catch { return null; } },
  save: async (v) => { try { if (v === null) await SecureStore.deleteItemAsync(KEY); else await SecureStore.setItemAsync(KEY, v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }); } catch { /* secure storage unavailable */ } },
};
async function deviceId(): Promise<string> {
  const k = "sos.deviceId"; let id = await SecureStore.getItemAsync(k).catch(() => null);
  if (!id) { id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}-0000-4000-8000-000000000000`.slice(0, 36); await SecureStore.setItemAsync(k, id).catch(() => {}); }
  return id;
}

export interface Auth { user: User; permissions: string[] }
interface Ctx { api: ApiClient; rt: Realtime; auth: Auth | null; booting: boolean; login(id: string, pw: string): Promise<LoginResult>; logout(): Promise<void> }
const AppCtx = React.createContext<Ctx | null>(null);
export const useApp = () => { const c = React.useContext(AppCtx); if (!c) throw new Error("AppCtx"); return c; };
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: (n, e: any) => n < 2 && ![401, 403, 404, 422].includes(e?.status) } } });

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [api, setApi] = React.useState<ApiClient | null>(null); const rt = React.useMemo(() => (api ? new Realtime(api, WebSocket as never) : null), [api]);
  const [auth, setAuth] = React.useState<Auth | null>(null); const [booting, setBooting] = React.useState(true);
  React.useEffect(() => { void (async () => {
    const a = new ApiClient({ baseUrl: String(Constants.expoConfig?.extra?.apiBaseUrl), platform: "android", deviceId: await deviceId(), tokenStore, onSessionExpired: () => { setAuth(null); qc.clear(); } });
    setApi(a);
    const me = await a.restore(); if (me) setAuth(me); setBooting(false);
  })(); }, []);
  React.useEffect(() => { if (rt && auth) { rt.start(); return () => rt.stop(); } return undefined; }, [rt, auth]);
  if (!api || !rt) return null;
  const login = async (id: string, pw: string) => { const r = await api.login(id, pw); if (r.user.role !== "STUDENT") { await api.logout(); throw Object.assign(new Error("This app is for students. Staff should use the desktop or web app."), { code: "NOT_STUDENT" }); } setAuth({ user: r.user, permissions: r.permissions }); return r; };
  const logout = async () => { rt.stop(); await api.logout(); qc.clear(); setAuth(null); };
  return <QueryClientProvider client={qc}><AppCtx.Provider value={{ api, rt, auth, booting, login, logout }}>{children}</AppCtx.Provider></QueryClientProvider>;
}

export function useGet<T>(path: string | null, query?: Query, o: { refetchInterval?: number } = {}) {
  const { api } = useApp();
  const q = useQuery<T>({ queryKey: ["g", path, query ?? null], queryFn: ({ signal }) => api.get<T>(path!, query, signal), enabled: path !== null, refetchInterval: o.refetchInterval });
  return { ...q, isLoading: q.isPending };
}
export function useList<T>(path: string | null, query?: Query, max = 200) {
  const { api } = useApp();
  const q = useQuery<T[]>({ queryKey: ["l", path, query ?? null], queryFn: () => api.all<T>(path!, query, max), enabled: path !== null });
  return { ...q, isLoading: q.isPending };
}
export function useAction<A, R = unknown>(fn: (a: A) => Promise<R>, o: { invalidate?: string[]; onSuccess?: (r: R) => void } = {}) {
  const c = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (r) => { c.invalidateQueries({ predicate: (q) => !o.invalidate || o.invalidate.some((p) => String(q.queryKey[1] ?? "").startsWith(p)) }); o.onSuccess?.(r); } });
}
export function useRealtimeInvalidate(types: string[], prefixes: string[]) {
  const { rt } = useApp(); const c = useQueryClient();
  React.useEffect(() => { const offs = types.map((t) => rt.on(t, () => c.invalidateQueries({ predicate: (q) => prefixes.some((p) => String(q.queryKey[1] ?? "").startsWith(p)) }))); return () => offs.forEach((f) => f()); }, [rt, c]);
}
