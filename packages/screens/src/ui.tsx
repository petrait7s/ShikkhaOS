import * as React from "react";
import { ApiError } from "@shikkhaos/api-client";
import { SUBMISSION_STATUS_LABEL, type AnyResultStatus } from "@shikkhaos/types";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "ghost"; size?: "sm"; busy?: boolean };
export function Button({ variant, size, busy, className = "", children, disabled, ...p }: BtnProps) {
  return <button {...p} disabled={disabled || busy} className={`btn ${variant ?? ""} ${size ?? ""} ${className}`}>{busy ? "…" : null}{children}</button>;
}

export function Field({ label, error, hint, children, full }: { label: string; error?: string; hint?: string; children: React.ReactElement<any>; full?: boolean }) {
  const id = React.useId();
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-e` : undefined })}
      {error ? <span className="err" id={`${id}-e`} role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((p, r) => <input ref={r} {...p} className={`input ${p.className ?? ""}`} />);
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`input ${p.className ?? ""}`} />;
export const Textarea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={`input ${p.className ?? ""}`} />;

const STATUS_TONE: Record<string, string> = { DRAFT: "", SUBMITTED: "info", UNDER_REVIEW: "info", CORRECTION_REQUESTED: "warn", VERIFIED: "ok", APPROVED: "ok", PUBLISHED: "ok", AUTHORIZED: "info", IN_PROGRESS: "info", CLOSED: "", ACTIVE: "ok", SUSPENDED: "bad", ARCHIVED: "", PENDING_APPROVAL: "warn", OPEN: "warn", NOT_STARTED: "" };
const STATUS_MARK: Record<string, string> = { VERIFIED: "✓ ", APPROVED: "✓ ", PUBLISHED: "● ", CORRECTION_REQUESTED: "! ", DRAFT: "○ " };
export function StatusBadge({ status }: { status: string }) {
  const label = (SUBMISSION_STATUS_LABEL as Record<string, string>)[status as AnyResultStatus] ?? status.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
  return <span className={`badge ${STATUS_TONE[status] ?? ""}`}>{STATUS_MARK[status] ?? ""}{label}</span>;
}
export const Badge = ({ tone, children }: { tone?: "ok" | "warn" | "bad" | "info"; children: React.ReactNode }) => <span className={`badge ${tone ?? ""}`}>{children}</span>;

export function Card({ title, actions, children, pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; pad?: boolean }) {
  return <section className="card">{title ? <header><h2>{title}</h2><span className="spacer" />{actions}</header> : null}<div className={pad ? "pad" : ""} style={pad ? { padding: 16 } : undefined}>{children}</div></section>;
}
export const Stat = ({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) => <div className="card stat"><div className="v">{value}</div><div className="l">{label}</div>{hint ? <div className="faint">{hint}</div> : null}</div>;
export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{sub ? <div className="sub">{sub}</div> : null}</div><span className="spacer" />{actions}</div>;
}

export function Skeleton({ rows = 4 }: { rows?: number }) { return <div className="stack" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ width: `${90 - ((i * 13) % 40)}%` }} />)}</div>; }
export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) { return <div className="empty"><div className="big">{title}</div>{children}{action ? <div style={{ marginTop: 12 }}>{action}</div> : null}</div>; }
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error as ApiError;
  if (e instanceof ApiError && (e.status === 403)) return <Empty title="You don't have access to this">Your role is not permitted to view this area.</Empty>;
  if (e instanceof ApiError && e.status === 404) return <Empty title="Not found">It may have been removed, or you may not have access.</Empty>;
  return (
    <div className="empty" role="alert">
      <div className="big">{e instanceof ApiError && e.code === "NETWORK" ? "You appear to be offline" : "Something went wrong"}</div>
      <div>{e?.message ?? "Unexpected error"}</div>
      {e instanceof ApiError && e.requestId ? <div className="faint mono" style={{ marginTop: 4 }}>Request ID {e.requestId}</div> : null}
      {onRetry ? <div style={{ marginTop: 12 }}><Button onClick={onRetry}>Try again</Button></div> : null}
    </div>
  );
}

export interface Column<T> { key: string; header: string; render: (row: T) => React.ReactNode; align?: "r"; width?: number }
export function Table<T>({ rows, columns, rowKey, onRow, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRow?: (r: T) => void; empty?: React.ReactNode }) {
  if (!rows.length) return <>{empty ?? <Empty title="Nothing here yet" />}</>;
  return (
    <div className="table-wrap"><table className="t">
      <thead><tr>{columns.map((c) => <th key={c.key} className={c.align} style={c.width ? { width: c.width } : undefined} scope="col">{c.header}</th>)}</tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={rowKey(r)} className={onRow ? "clickable" : ""} onClick={onRow ? () => onRow(r) : undefined} tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => { if (e.key === "Enter") onRow(r); } : undefined}>
          {columns.map((c) => <td key={c.key} className={c.align}>{c.render(r)}</td>)}
        </tr>))}</tbody>
    </table></div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  React.useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><span className="spacer" /><Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">✕</Button></header>
        <div className="body">{children}</div>
        {footer ? <footer>{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;
}

// ---- toasts ----
type Toast = { id: number; text: string; tone?: "bad" };
const ToastCtx = React.createContext<(text: string, tone?: "bad") => void>(() => {});
export const useToast = () => React.useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((text: string, tone?: "bad") => { const id = Date.now() + Math.random(); setItems((s) => [...s, { id, text, tone }]); setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), tone ? 7000 : 3500); }, []);
  return <ToastCtx.Provider value={push}>{children}<div className="toasts" role="status" aria-live="polite">{items.map((t) => <div key={t.id} className={`toast ${t.tone ?? ""}`}>{t.text}</div>)}</div></ToastCtx.Provider>;
}
export function errText(e: unknown): string {
  if (e instanceof ApiError) return e.fieldErrors.length ? `${e.message}: ${e.fieldErrors.map((f) => f.message).join("; ")}` : e.message;
  return (e as Error)?.message ?? "Unexpected error";
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", danger, typed, onConfirm, onClose }: { title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; typed?: string; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [text, setText] = React.useState(""); const [busy, setBusy] = React.useState(false);
  return (
    <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant={danger ? "danger" : "primary"} busy={busy} disabled={typed ? text !== typed : false} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel}</Button></>}>
      <div className="stack"><div>{message}</div>{typed ? <Field label={`Type "${typed}" to confirm`}><Input value={text} onChange={(e) => setText(e.target.value)} autoFocus /></Field> : null}</div>
    </Modal>
  );
}

/** Asks for the account password and resolves a short-lived X-Reauth-Token (contract C10 sensitive actions). */
export function ReauthDialog({ onToken, onClose, reauth, title = "Confirm with your password" }: { onToken: (t: string) => Promise<void> | void; onClose: () => void; reauth: (pw: string) => Promise<string>; title?: string }) {
  const [pw, setPw] = React.useState(""); const [err, setErr] = React.useState<string>(); const [busy, setBusy] = React.useState(false);
  const submit = async () => { setBusy(true); setErr(undefined); try { await onToken(await reauth(pw)); onClose(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } };
  return (
    <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!pw} onClick={submit}>Confirm</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}><Field label="Password" error={err}><Input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field></form>
    </Modal>
  );
}

export const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");
export const fmtDateTime = (s?: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
export const todayIso = () => new Date().toISOString().slice(0, 10);
