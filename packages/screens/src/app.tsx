import * as React from "react";
import { BrowserRouter, HashRouter, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { ApiClient, ApiError, Realtime } from "@shikkhaos/api-client";
import { navFor } from "@shikkhaos/permissions";
import { ROLE_LABEL, type LoginResult, type NotificationItem, type User } from "@shikkhaos/types";
import { changePasswordSchema, firstErrors, loginSchema } from "@shikkhaos/validation";
import { AppCtx, makeQueryClient, Providers, useApp, useGet, useList, useRealtimeInvalidate, useLocalState, useAction, type AuthState, type Platform } from "./context";
import { Button, Empty, ErrorState, Field, Input, Modal, Skeleton, ToastProvider, errText, fmtDateTime, useToast } from "./ui";
import { Dashboard } from "./pages/dashboard";
import { Students, StudentDetail } from "./pages/students";
import { Teachers } from "./pages/teachers";
import { Academics } from "./pages/academics";
import { Exams, ExamDetail } from "./pages/exams";
import { MarksList, MarksEditor } from "./pages/marks";
import { ReviewInbox, ReviewDetail } from "./pages/review";
import { Results, ResultDetail } from "./pages/results";
import { Attendance } from "./pages/attendance";
import { ClassTests } from "./pages/classtests";
import { Homework, MyHomework } from "./pages/homework";
import { Messages } from "./pages/messages";
import { Notices } from "./pages/notices";
import { Documents } from "./pages/documents";
import { Reports } from "./pages/reports";
import { Moderation } from "./pages/moderation";
import { Permissions } from "./pages/permissions";
import { Audit } from "./pages/audit";
import { Settings } from "./pages/settings";
import { MyResults, MyAttendance, MyClassTests, MyProfile } from "./pages/student";
import { NotificationsPage } from "./pages/notifications";

export interface AppProps { api: ApiClient; platform: Platform; router?: "browser" | "hash" }

const icon = (name: string) => { const key = name.split("-").map((p) => p[0]!.toUpperCase() + p.slice(1)).join(""); const I = (Icons as unknown as Record<string, React.ComponentType<{ size?: number }>>)[key] ?? Icons.Circle; return <I size={16} />; };

type Boot = { state: "loading" } | { state: "anon" } | { state: "ready"; auth: AuthState; mustChange: boolean };

export function App({ api, platform, router = "browser" }: AppProps) {
  const [qc] = React.useState(makeQueryClient);
  const [rt] = React.useState(() => new Realtime(api));
  const [boot, setBoot] = React.useState<Boot>({ state: "loading" });
  const [theme, setTheme] = useLocalState<"light" | "dark" | "system">("sos.theme", "system");
  React.useEffect(() => {
    const dark = theme === "dark" || (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [theme]);
  React.useEffect(() => { api.opts.onSessionExpired = () => { rt.stop(); qc.clear(); setBoot({ state: "anon" }); }; }, [api, rt, qc]);
  React.useEffect(() => { let alive = true; api.restore().then((me) => { if (!alive) return; setBoot(me ? { state: "ready", auth: { user: me.user, permissions: me.permissions, role: me.user.role }, mustChange: me.user.mustChangePassword } : { state: "anon" }); }); return () => { alive = false; }; }, [api]);
  const onLogin = (r: LoginResult) => setBoot({ state: "ready", auth: { user: r.user, permissions: r.permissions, role: r.user.role }, mustChange: r.mustChangePassword });
  const Router = router === "hash" ? HashRouter : BrowserRouter;
  return (
    <Providers qc={qc}><ToastProvider><Router>
      {boot.state === "loading" ? <div className="login"><div style={{ width: 240 }}><Skeleton rows={3} /></div></div>
        : boot.state === "anon" ? <Login api={api} onLogin={onLogin} />
        : <Authed key={boot.auth.user.id} api={api} rt={rt} platform={platform} auth={boot.auth} mustChange={boot.mustChange} theme={theme} setTheme={setTheme} setAuth={(a) => setBoot({ state: "ready", auth: a, mustChange: false })} onLogout={async () => { rt.stop(); await api.logout(); qc.clear(); setBoot({ state: "anon" }); }} />}
    </Router></ToastProvider></Providers>
  );
}

function Login({ api, onLogin }: { api: ApiClient; onLogin: (r: LoginResult) => void }) {
  const [identifier, setId] = React.useState(""); const [password, setPw] = React.useState("");
  const [err, setErr] = React.useState<string>(); const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = loginSchema.safeParse({ identifier, password });
    if (!v.success) { setErr(v.error.issues[0]!.message); return; }
    setBusy(true); setErr(undefined);
    try { onLogin(await api.login(identifier.trim(), password)); }
    catch (ex) { setErr(ex instanceof ApiError && ex.code === "ACCOUNT_LOCKED" ? "Too many attempts. Try again in a few minutes." : ex instanceof ApiError && ex.status === 401 ? "Incorrect username or password." : errText(ex)); }
    finally { setBusy(false); }
  };
  return (
    <div className="login"><form className="card" onSubmit={submit} aria-labelledby="t">
      <div className="stack">
        <div className="brand" style={{ width: "auto" }}><span className="logo">S</span><span id="t" style={{ fontSize: 18 }}>ShikkhaOS</span></div>
        <div className="muted">One School. One System. One Connected Community.</div>
        {err ? <div className="banner bad" role="alert">{err}</div> : null}
        <Field label="Username, email or student ID"><Input value={identifier} onChange={(e) => setId(e.target.value)} autoComplete="username" autoFocus /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
        <Button variant="primary" type="submit" busy={busy}>Sign in</Button>
        <div className="faint">Forgot your password? Ask the school office to reset it.</div>
      </div>
    </form></div>
  );
}

function ForcePasswordChange({ api, onDone }: { api: ApiClient; onDone: () => void }) {
  const [cur, setCur] = React.useState(""); const [next, setNext] = React.useState(""); const [errs, setErrs] = React.useState<Record<string, string>>({}); const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    const v = changePasswordSchema.safeParse({ currentPassword: cur, newPassword: next });
    if (!v.success) { setErrs(firstErrors(v.error.issues)); return; }
    setBusy(true); setErrs({});
    try { await api.post("/auth/change-password", { currentPassword: cur, newPassword: next }); onDone(); }
    catch (e) { if (e instanceof ApiError && e.fieldErrors.length) setErrs(Object.fromEntries(e.fieldErrors.map((f) => [f.field, f.message]))); else setErrs({ newPassword: errText(e) }); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Choose a new password" onClose={() => {}} footer={<Button variant="primary" busy={busy} onClick={submit}>Save password</Button>}>
      <div className="stack"><div className="banner info">You signed in with a temporary password. Set your own password to continue.</div>
        <Field label="Current (temporary) password" error={errs.currentPassword}><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="New password" error={errs.newPassword} hint="At least 10 characters, with a letter and a digit."><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field></div>
    </Modal>
  );
}

function Authed({ api, rt, platform, auth, mustChange, theme, setTheme, onLogout, setAuth }: { api: ApiClient; rt: Realtime; platform: Platform; auth: AuthState; mustChange: boolean; theme: string; setTheme: (t: "light" | "dark" | "system") => void; onLogout: () => Promise<void>; setAuth: (a: AuthState) => void }) {
  const [forcing, setForcing] = React.useState(mustChange);
  React.useEffect(() => { rt.start(); return () => rt.stop(); }, [rt]);
  const session = React.useMemo(() => ({ role: auth.role, permissions: auth.permissions }), [auth]);
  const refreshMe = React.useCallback(async () => { const me = await api.get<{ user: User; permissions: string[] }>("/auth/me"); setAuth({ user: me.user, permissions: me.permissions, role: me.user.role }); }, [api, setAuth]);
  React.useEffect(() => rt.on("permissions.changed", () => void refreshMe()), [rt, refreshMe]);
  const ctx = React.useMemo(() => ({ api, rt, auth, platform, logout: onLogout, session, refreshMe }), [api, rt, auth, platform, onLogout, session, refreshMe]);
  return <AppCtx.Provider value={ctx}>{forcing ? <ForcePasswordChange api={api} onDone={() => { setForcing(false); }} /> : null}<Shell theme={theme} setTheme={setTheme} /></AppCtx.Provider>;
}

function Shell({ theme, setTheme }: { theme: string; setTheme: (t: "light" | "dark" | "system") => void }) {
  const { auth, session, platform, rt, logout } = useApp();
  const nav = navFor(session); const navigate = useNavigate(); const loc = useLocation();
  const [palette, setPalette] = React.useState(false); const [menu, setMenu] = React.useState(false); const [notif, setNotif] = React.useState(false);
  const [compact, setCompact] = useLocalState("sos.compact", false);
  const [wsState, setWsState] = React.useState(rt.state);
  React.useEffect(() => rt.onState(setWsState), [rt]);
  const unread = useGet<{ count: number }>("/notifications/unread-count", undefined, { refetchInterval: wsState === "open" ? 120_000 : 30_000 });
  useRealtimeInvalidate(["notification.created"], ["/notifications"]);
  const toast = useToast();
  React.useEffect(() => rt.on("notification.created", (p) => { platform.notify?.(p.title, p.body); toast(p.title); }), [rt, platform, toast]);
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); setNotif((v) => !v); }
      else if (mod && e.key === ",") { e.preventDefault(); navigate("/profile"); }
      else if (mod && /^[1-9]$/.test(e.key)) { const t = nav[Number(e.key) - 1]; if (t) { e.preventDefault(); navigate(t.id === "dashboard" ? "/" : `/${t.id}`); } }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [navigate, nav]);
  const groups = [...new Set(nav.map((n) => n.group))];
  return (
    <div className={`shell ${compact ? "compact" : ""} ${platform.kind}`}>
      <div className="titlebar">
        <Button variant="ghost" size="sm" className="menu-btn" onClick={() => setMenu((m) => !m)} aria-label="Menu" style={{ display: "none" }}>☰</Button>
        <div className="brand"><span className="logo">S</span>ShikkhaOS</div>
        <button className="search-btn" onClick={() => setPalette(true)} aria-label="Search (Ctrl+K)"><Icons.Search size={14} /> Search students, notices, exams… <kbd>Ctrl K</kbd></button>
        <span className="spacer" />
        <div style={{ position: "relative" }}>
          <Button variant="ghost" className="icon" onClick={() => setNotif((v) => !v)} aria-label={`Notifications${unread.data?.count ? `, ${unread.data.count} unread` : ""}`} aria-expanded={notif}><Icons.Bell size={16} />{unread.data?.count ? <span className="badge-dot" style={{ background: "var(--bad)", color: "#fff", borderRadius: 10, fontSize: 11, padding: "0 6px", marginLeft: 2 }}>{unread.data.count}</span> : null}</Button>
          {notif ? <NotificationPopover onClose={() => setNotif(false)} /> : null}
        </div>
        <Button variant="ghost" className="icon" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Icons.Sun size={16} /> : <Icons.Moon size={16} />}</Button>
        <ProfileMenu name={auth.user.displayName} role={ROLE_LABEL[auth.role]} onLogout={logout} compact={compact} setCompact={setCompact} />
      </div>
      <nav className={`sidebar ${menu ? "open" : ""}`} aria-label="Main" onClick={() => setMenu(false)}>
        {groups.map((g) => <div key={g}><div className="nav-group">{g}</div>{nav.filter((n) => n.group === g).map((n) => (
          <NavLink key={n.id} to={n.id === "dashboard" ? "/" : `/${n.id}`} end={n.id === "dashboard"} className="nav-item" aria-current={(n.id === "dashboard" ? loc.pathname === "/" : loc.pathname.startsWith(`/${n.id}`)) ? "page" : undefined}>
            {icon(n.icon)}<span>{n.label}</span>{n.id === "messages" ? <MessagesBadge /> : null}</NavLink>))}</div>)}
      </nav>
      <main className="main" id="main"><div className="inner"><Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/students" element={<Students />} /><Route path="/students/:id" element={<StudentDetail />} />
        <Route path="/teachers" element={<Teachers />} /><Route path="/academics" element={<Academics />} /><Route path="/my-classes" element={<MarksList mode="classes" />} />
        <Route path="/attendance" element={<Attendance />} /><Route path="/class-tests" element={<ClassTests />} /><Route path="/homework" element={<Homework />} />
        <Route path="/exams" element={<Exams />} /><Route path="/exams/:id" element={<ExamDetail />} />
        <Route path="/marks" element={<MarksList mode="marks" />} /><Route path="/marks/:id" element={<MarksEditor />} />
        <Route path="/review" element={<ReviewInbox />} /><Route path="/review/:id" element={<ReviewDetail />} />
        <Route path="/results" element={<Results />} /><Route path="/results/:id" element={<ResultDetail />} />
        <Route path="/messages" element={<Messages />} /><Route path="/messages/:id" element={<Messages />} />
        <Route path="/notices" element={<Notices />} /><Route path="/documents" element={<Documents />} /><Route path="/reports" element={<Reports />} />
        <Route path="/moderation" element={<Moderation />} /><Route path="/permissions" element={<Permissions />} /><Route path="/audit" element={<Audit />} /><Route path="/settings" element={<Settings />} />
        <Route path="/my-results" element={<MyResults />} /><Route path="/my-attendance" element={<MyAttendance />} /><Route path="/my-class-tests" element={<MyClassTests />} /><Route path="/my-homework" element={<MyHomework />} />
        <Route path="/notifications" element={<NotificationsPage />} /><Route path="/profile" element={<MyProfile theme={theme} setTheme={setTheme} compact={compact} setCompact={setCompact} />} />
        <Route path="*" element={<Empty title="Page not found">This page does not exist.</Empty>} />
      </Routes></div></main>
      <div className="statusbar" role="status">
        <span><span className={`dot ${wsState === "open" ? "ok" : wsState === "connecting" ? "warn" : "bad"}`} />{wsState === "open" ? "Live" : wsState === "connecting" ? "Connecting…" : "Offline — refreshing every 30 s"}</span>
        <span>{platform.kind === "desktop" ? "Desktop" : "Web"} {platform.version ? `v${platform.version}` : ""}</span>
        <span className="spacer" /><span>{ROLE_LABEL[auth.role]} · {auth.user.username}</span>
      </div>
      {palette ? <CommandPalette onClose={() => setPalette(false)} /> : null}
    </div>
  );
}

function MessagesBadge() {
  const q = useList<{ unread: number }>("/conversations", undefined, { refetchInterval: 60_000 });
  useRealtimeInvalidate(["message.created"], ["/conversations"]);
  const n = (q.data ?? []).reduce((a, c) => a + (c.unread ?? 0), 0);
  return n ? <span className="badge-dot" aria-label={`${n} unread messages`}>{n}</span> : null;
}

function ProfileMenu({ name, role, onLogout, compact, setCompact }: { name: string; role: string; onLogout: () => Promise<void>; compact: boolean; setCompact: (v: boolean) => void }) {
  const [open, setOpen] = React.useState(false); const navigate = useNavigate();
  return (
    <div style={{ position: "relative" }}>
      <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Icons.CircleUser size={16} /> {name}</Button>
      {open ? <div className="popover" style={{ width: 240 }} role="menu" onClick={() => setOpen(false)}>
        <div style={{ padding: 12 }}><strong>{name}</strong><div className="muted">{role}</div></div>
        <button className="nav-item" role="menuitem" onClick={() => navigate("/profile")}><Icons.Settings size={14} /> Profile & settings</button>
        <button className="nav-item" role="menuitem" onClick={() => setCompact(!compact)}><Icons.Rows3 size={14} /> {compact ? "Comfortable density" : "Compact density"}</button>
        <button className="nav-item" role="menuitem" onClick={() => void onLogout()}><Icons.LogOut size={14} /> Sign out</button>
      </div> : null}
    </div>
  );
}

function NotificationPopover({ onClose }: { onClose: () => void }) {
  const { api } = useApp(); const navigate = useNavigate();
  const q = useList<NotificationItem>("/notifications", { limit: 15 }, { max: 15 });
  const readAll = useAction(() => api.post("/notifications/read-all"), { invalidate: ["/notifications"] });
  const open = async (n: NotificationItem) => { await api.post(`/notifications/${n.id}/read`).catch(() => {}); onClose(); const link = n.data?.deepLink?.replace("shikkhaos://", "") ?? ""; navigate(deepLinkToRoute(link)); };
  return (
    <div className="popover" role="dialog" aria-label="Notifications">
      <div className="row" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}><h3>Notifications</h3><span className="spacer" /><Button size="sm" variant="ghost" onClick={() => readAll.mutate(undefined)}>Mark all read</Button><Button size="sm" variant="ghost" onClick={() => { onClose(); navigate("/notifications"); }}>See all</Button></div>
      {q.isLoading ? <div style={{ padding: 14 }}><Skeleton rows={3} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? <Empty title="You're all caught up" /> :
        q.data.map((n) => <button key={n.id} className="nav-item" style={{ display: "block", borderBottom: "1px solid var(--border)", borderRadius: 0, fontWeight: n.readAt ? 400 : 600 }} onClick={() => void open(n)}><div>{n.title}</div><div className="muted" style={{ fontWeight: 400 }}>{n.body}</div><div className="faint">{fmtDateTime(n.createdAt)}</div></button>)}
    </div>
  );
}

export function deepLinkToRoute(link: string): string {
  const [head, id] = link.split("/");
  const map: Record<string, string> = { "mark-submissions": "/marks", exams: "/exams", "result-sets": "/results", results: "/my-results", messages: "/messages", notices: "/notices", homework: "/homework", attendance: "/my-attendance", "class-tests": "/my-class-tests", moderation: "/moderation", settings: "/profile" };
  const base = map[head ?? ""] ?? "/notifications";
  return id && ["/exams", "/messages"].includes(base) ? `${base}/${id}` : base;
}

function CommandPalette({ onClose }: { onClose: () => void }) {
  const { api, session } = useApp(); const navigate = useNavigate();
  const [q, setQ] = React.useState(""); const [sel, setSel] = React.useState(0);
  const nav = navFor(session);
  const search = useGet<{ students: any[]; teachers: any[]; notices: any[]; documents: any[]; exams: any[] }>(q.trim().length >= 2 ? "/search" : null, { q: q.trim() });
  const items: { label: string; sub?: string; go: string }[] = [];
  const ql = q.toLowerCase();
  nav.filter((n) => !q || n.label.toLowerCase().includes(ql)).forEach((n) => items.push({ label: n.label, sub: "Go to", go: n.id === "dashboard" ? "/" : `/${n.id}` }));
  (search.data?.students ?? []).forEach((s) => items.push({ label: s.full_name ?? s.fullName, sub: `Student · ${s.student_code ?? s.studentCode}`, go: `/students/${s.id}` }));
  (search.data?.teachers ?? []).forEach((s) => items.push({ label: s.full_name ?? s.fullName, sub: "Teacher", go: "/teachers" }));
  (search.data?.exams ?? []).forEach((s) => items.push({ label: s.name, sub: "Exam", go: `/exams/${s.id}` }));
  (search.data?.notices ?? []).forEach((s) => items.push({ label: s.title, sub: "Notice", go: "/notices" }));
  (search.data?.documents ?? []).forEach((s) => items.push({ label: s.title, sub: "Document", go: "/documents" }));
  void api;
  const go = (i: number) => { const it = items[i]; if (it) { onClose(); navigate(it.go); } };
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal palette" role="dialog" aria-label="Command palette">
        <input autoFocus value={q} placeholder="Search or jump to…" aria-label="Search" onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); } else if (e.key === "Enter") go(sel); }} />
        <div className="res" role="listbox">{items.length === 0 ? <Empty title={search.isLoading ? "Searching…" : "No matches"} /> : items.slice(0, 30).map((it, i) => <button key={i} role="option" aria-selected={i === sel} onClick={() => go(i)}><span>{it.label}</span><span className="faint">{it.sub}</span></button>)}</div>
      </div>
    </div>
  );
}
