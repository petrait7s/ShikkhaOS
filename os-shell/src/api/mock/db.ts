import type { AuditLog, DB, PaperFile, Role, Session } from "../contracts";
import { DB_VERSION, buildSeed } from "@/data/seed";
import { sleep } from "@/lib/utils";

const DB_KEY = "shikkaos:v1:db";
const SESSION_KEY = "shikkaos:v1:session";
export const COOKIE = "shikkaos_session";

let mem: DB | null = null;

export function getDb(): DB {
  if (mem) return mem;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DB;
        if (parsed.version === DB_VERSION) {
          mem = parsed;
          return mem;
        }
      }
    } catch {
      /* reseed below */
    }
  }
  mem = buildSeed();
  persist();
  return mem;
}

export function persist(): void {
  if (typeof window === "undefined" || !mem) return;
  try {
    window.localStorage.setItem(DB_KEY, JSON.stringify(mem));
  } catch {
    /* storage full: keep in-memory */
  }
}

export function resetDb(): void {
  mem = buildSeed();
  papersMem = [];
  persistPapers();
  persist();
}

const PAPERS_KEY = "shikkaos:v1:papers";
let papersMem: PaperFile[] | null = null;

export function getPapers(): PaperFile[] {
  if (papersMem) return papersMem;
  papersMem = [];
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(PAPERS_KEY);
      if (raw) papersMem = JSON.parse(raw) as PaperFile[];
    } catch {
      papersMem = [];
    }
  }
  return papersMem;
}

export function setPapers(list: PaperFile[]): void {
  papersMem = list;
}

/** Papers live under their own storage key so large files cannot block saving the main DB. Returns false if storage is full. */
export function persistPapers(): boolean {
  if (typeof window === "undefined" || !papersMem) return true;
  try {
    window.localStorage.setItem(PAPERS_KEY, JSON.stringify(papersMem));
    return true;
  } catch {
    return false;
  }
}

export async function latency(): Promise<void> {
  await sleep(120 + Math.floor(Math.random() * 280));
}

export class ApiError extends Error {
  constructor(message: string, public code: string = "bad_request") {
    super(message);
  }
}

export function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function writeSession(s: Session | null): void {
  if (typeof window === "undefined") return;
  if (s) {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    document.cookie = `${COOKIE}=${s.role}; path=/; SameSite=Lax`;
  } else {
    window.localStorage.removeItem(SESSION_KEY);
    document.cookie = `${COOKIE}=; path=/; max-age=0`;
  }
}

export function need(...roles: Role[]): Session {
  const s = readSession();
  if (!s) throw new ApiError("Please sign in again.", "unauthenticated");
  if (roles.length && !roles.includes(s.role) && !(s.role === "headmaster" && roles.includes("registrar"))) throw new ApiError("You do not have permission for this action.", "forbidden");
  return s;
}

export function audit(s: Session, action: string, entity: string, summary: string): void {
  const db = getDb();
  const row: AuditLog = {
    id: `aud_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    schoolId: s.schoolId, actor: s.name, role: s.role, action, entity, summary, at: new Date().toISOString(),
  };
  db.audit.unshift(row);
}

export function notify(schoolId: string, role: Role | null, text: string): void {
  const db = getDb();
  db.notifications.unshift({ id: `nf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`, schoolId, userId: null, role, text, at: new Date().toISOString(), read: false });
}

export function maybeFail(p = 0.02): void {
  if (Math.random() < p) throw new ApiError("The server is busy. Please try again.", "busy");
}

export const isAdmin = (r: string | null | undefined): boolean => r === "registrar" || r === "headmaster";
