import * as React from "react";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { ApiClient, Query, Realtime } from "@shikkhaos/api-client";
import type { User } from "@shikkhaos/types";
import { type Session } from "@shikkhaos/permissions";
import { errText, useToast } from "./ui";

export interface Platform { kind: "web" | "desktop"; notify?: (title: string, body: string) => void; version?: string; mode?: string }
export interface AuthState { user: User; permissions: string[]; role: User["role"] }
export interface Ctx { api: ApiClient; rt: Realtime; auth: AuthState; platform: Platform; logout: () => Promise<void>; session: Session; refreshMe: () => Promise<void> }

export const AppCtx = React.createContext<Ctx | null>(null);
export function useApp(): Ctx { const c = React.useContext(AppCtx); if (!c) throw new Error("AppCtx missing"); return c; }
export const useApi = () => useApp().api;
export const useSession = () => useApp().session;
export const can = (s: Session, p: string) => s.permissions.includes(p);

export function makeQueryClient() { return new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: (n, e: any) => n < 2 && e?.status !== 401 && e?.status !== 403 && e?.status !== 404 && e?.status !== 422, refetchOnWindowFocus: true } } }); }
export const Providers = ({ qc, children }: { qc: QueryClient; children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

/** GET a single resource/array (`data`) */
export function useGet<T>(path: string | null, query?: Query, o: { enabled?: boolean; refetchInterval?: number } = {}) {
  const api = useApi();
  const q = useQuery<T>({ queryKey: ["g", path, query ?? null], queryFn: ({ signal }) => api.get<T>(path!, query, signal), enabled: path !== null && o.enabled !== false, refetchInterval: o.refetchInterval });
  return { ...q, isLoading: q.isPending };
}
/** GET a paginated list; fetches all pages up to `max` (reference data and bounded lists). */
export function useList<T>(path: string | null, query?: Query, o: { enabled?: boolean; max?: number; refetchInterval?: number } = {}) {
  const api = useApi();
  const q = useQuery<T[]>({ queryKey: ["l", path, query ?? null], queryFn: () => api.all<T>(path!, query, o.max ?? 500), enabled: path !== null && o.enabled !== false, refetchInterval: o.refetchInterval });
  return { ...q, isLoading: q.isPending };
}
/** Infinite-ish list with explicit "load more" cursor, for big tables. */
export function usePagedList<T>(path: string, query?: Query) {
  const api = useApi();
  const [cursor, setCursor] = React.useState<string[]>([]);
  const [acc, setAcc] = React.useState<T[]>([]);
  const key = JSON.stringify(query ?? {});
  React.useEffect(() => { setCursor([]); setAcc([]); }, [path, key]);
  const last = cursor[cursor.length - 1];
  const q = useQuery({ queryKey: ["p", path, query ?? null, last ?? null], queryFn: ({ signal }) => api.page<T>(path, { limit: 50, ...query, cursor: last }, signal) });
  const rows = React.useMemo(() => { const base = acc; if (!q.data) return base; const ids = new Set(base.map((r: any) => r.id)); return [...base, ...q.data.data.filter((r: any) => !ids.has(r.id))]; }, [acc, q.data]);
  return { ...q, rows, hasMore: !!q.data?.meta.nextCursor, loadMore: () => { if (q.data?.meta.nextCursor) { setAcc(rows); setCursor((c) => [...c, q.data!.meta.nextCursor!]); } } };
}

export function useAction<A, R = unknown>(fn: (a: A) => Promise<R>, o: { invalidate?: string[]; success?: string; onSuccess?: (r: R) => void } = {}) {
  const qc = useQueryClient(); const toast = useToast();
  return useMutation({ mutationFn: fn, onSuccess: (r) => { if (o.success) toast(o.success); qc.invalidateQueries({ predicate: (q: { queryKey: QueryKey }) => !o.invalidate || o.invalidate.some((p) => String(q.queryKey[1] ?? "").startsWith(p)) }); o.onSuccess?.(r); }, onError: (e) => toast(errText(e), "bad") });
}

export function useRealtimeInvalidate(types: string[], prefixes: string[]) {
  const { rt } = useApp(); const qc = useQueryClient();
  React.useEffect(() => { const offs = types.map((t) => rt.on(t, () => qc.invalidateQueries({ predicate: (q) => prefixes.some((p) => String(q.queryKey[1] ?? "").startsWith(p)) }))); return () => offs.forEach((f) => f()); }, [rt, qc, types.join(","), prefixes.join(",")]);
}

export function useDebounced<T>(v: T, ms = 250): T { const [d, setD] = React.useState(v); React.useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]); return d; }
export function useLocalState<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = React.useState<T>(() => { try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : init; } catch { return init; } });
  return [v, (n) => { setV(n); try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* storage unavailable */ } }];
}
