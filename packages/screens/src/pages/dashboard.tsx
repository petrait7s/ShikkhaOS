import * as React from "react";
import { Link } from "react-router-dom";
import type { Exam, Homework, MarkSubmissionRow, Notice, PublishedResult, ResultSetRow, Student } from "@shikkhaos/types";
import { ROLE_LABEL } from "@shikkhaos/types";
import { useApp, useGet, useList, useLocalState } from "../context";
import { t } from "../i18n";
import { Button, Card, Empty, ErrorState, Modal, PageHeader, Skeleton, Stat, StatusBadge, fmtDate, fmtDateTime } from "../ui";

export function Dashboard() {
  const { auth } = useApp();
  return (
    <>
      <PageHeader title={`${t("Welcome,")} ${auth.user.displayName.split(" ")[0]}`} sub={`${t(ROLE_LABEL[auth.role])} — ${t("Dashboard")}`} />
      {auth.role === "STUDENT" ? <StudentHome /> : auth.role === "TEACHER" ? <TeacherHome /> : auth.role === "REGISTRAR" ? <RegistrarHome /> : <HeadmasterHome />}
    </>
  );
}


interface Widget { id: string; label: string; node: React.ReactNode }

/** Role dashboards are made of widgets the user can hide, show and reorder; the layout is remembered per user and role. */
function Board({ widgets }: { widgets: Widget[] }) {
  const { auth } = useApp();
  const [layout, setLayout] = useLocalState<{ order: string[]; hidden: string[] }>(`sos.widgets.${auth.user.id}.${auth.role}`, { order: [], hidden: [] });
  const [editing, setEditing] = React.useState(false);
  const ids = widgets.map((w) => w.id);
  const order = [...layout.order.filter((i) => ids.includes(i)), ...ids.filter((i) => !layout.order.includes(i))];
  const byId = new Map(widgets.map((w) => [w.id, w]));
  const move = (id: string, d: -1 | 1) => { const i = order.indexOf(id); const j = i + d; if (j < 0 || j >= order.length) return; const n = [...order]; [n[i], n[j]] = [n[j]!, n[i]!]; setLayout({ ...layout, order: n }); };
  const toggle = (id: string) => setLayout({ ...layout, order, hidden: layout.hidden.includes(id) ? layout.hidden.filter((h) => h !== id) : [...layout.hidden, id] });
  const visible = order.filter((id) => !layout.hidden.includes(id));
  return (
    <div className="stack">
      <div className="row"><span className="spacer" /><Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("Customize")}</Button></div>
      {visible.map((id) => <React.Fragment key={id}>{byId.get(id)!.node}</React.Fragment>)}
      {visible.length === 0 ? <Empty title="All widgets are hidden">Use Customize to show them again.</Empty> : null}
      {editing ? <Modal title={t("Customize")} onClose={() => setEditing(false)} footer={<Button variant="primary" onClick={() => setEditing(false)}>Done</Button>}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>{order.map((id) => <li key={id} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
          <label className="row"><input type="checkbox" checked={!layout.hidden.includes(id)} onChange={() => toggle(id)} /> {byId.get(id)!.label}</label><span className="spacer" />
          <Button size="sm" aria-label={`Move ${byId.get(id)!.label} up`} disabled={order.indexOf(id) === 0} onClick={() => move(id, -1)}>↑</Button>
          <Button size="sm" aria-label={`Move ${byId.get(id)!.label} down`} disabled={order.indexOf(id) === order.length - 1} onClick={() => move(id, 1)}>↓</Button></li>)}</ul></Modal> : null}
    </div>
  );
}

function Block<T>({ q, children }: { q: { isLoading: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; children: (d: T) => React.ReactNode }) {
  if (q.isLoading) return <Skeleton rows={3} />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  return <>{children(q.data as T)}</>;
}

function countBy<T>(rows: T[], f: (r: T) => string) { const m: Record<string, number> = {}; rows.forEach((r) => { const k = f(r); m[k] = (m[k] ?? 0) + 1; }); return m; }

function TeacherHome() {
  const subs = useList<MarkSubmissionRow>("/mark-submissions");
  const hw = useList<Homework>("/homework", undefined, { max: 100 });
  const notices = useList<Notice>("/notices", { limit: 5 }, { max: 5 });
  const stats = <Block q={subs}>{(rows) => { const c = countBy(rows, (r) => r.status); return (
    <>
      {c.CORRECTION_REQUESTED ? <div className="banner" role="alert"><strong>{c.CORRECTION_REQUESTED} correction request{c.CORRECTION_REQUESTED > 1 ? "s" : ""}</strong> — the Register asked you to fix submitted marks. <Link to="/marks">Open marks entry</Link></div> : null}
      <div className="grid cols-4"><Stat label={t("To enter")} value={c.DRAFT ?? 0} /><Stat label={t("Needs correction")} value={c.CORRECTION_REQUESTED ?? 0} /><Stat label={t("With the Register")} value={(c.SUBMITTED ?? 0) + (c.UNDER_REVIEW ?? 0)} /><Stat label={t("Verified")} value={c.VERIFIED ?? 0} /></div></>); }}</Block>;
  return <Board widgets={[
    { id: "summary", label: "Marks summary", node: stats },
    { id: "marks", label: "Marks entry list", node: <Card key="m" title="Marks entry" actions={<Link to="/marks">All</Link>}><Block q={subs}>{(rows) => rows.length === 0 ? <Empty title="No exam marks to enter" /> : <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.slice(0, 6).map((r) => <li key={r.id}><Link to={`/marks/${r.id}`}>{r.examName} · {r.subjectName} {r.className}-{r.sectionName}</Link> <StatusBadge status={r.status} /></li>)}</ul>}</Block></Card> },
    { id: "homework", label: "Homework to review", node: <Card title="Homework to review" actions={<Link to="/homework">All</Link>}><Block q={hw}>{(rows) => { const open = rows.filter((h) => h.status === "PUBLISHED"); return open.length === 0 ? <Empty title="No open homework" /> : <ul style={{ margin: 0, paddingLeft: 18 }}>{open.slice(0, 6).map((h) => <li key={h.id}>{h.title} <span className="faint">due {fmtDateTime(h.dueAt)}</span></li>)}</ul>; }}</Block></Card> },
    { id: "notices", label: "Latest notices", node: <Card title={t("Latest notices")} actions={<Link to="/notices">All</Link>}><NoticeList q={notices} /></Card> },
  ]} />;
}

function NoticeList({ q }: { q: ReturnType<typeof useList<Notice>> }) {
  return <Block q={q}>{(rows) => rows.length === 0 ? <Empty title="No notices" /> : <div className="stack">{rows.map((n) => <div key={n.id}><strong>{n.title}</strong> <span className="faint">{fmtDate(n.publishedAt)}</span><div className="muted">{n.body.slice(0, 160)}</div></div>)}</div>}</Block>;
}

function RegistrarHome() {
  const subs = useList<MarkSubmissionRow>("/mark-submissions");
  const sets = useList<ResultSetRow>("/result-sets");
  const exams = useList<Exam>("/exams", undefined, { max: 100 });
  return <Board widgets={[
    { id: "summary", label: "Review counts", node: <Block q={subs}>{(rows) => { const c = countBy(rows, (r) => r.status); return <div className="grid cols-4"><Stat label={t("Awaiting review")} value={c.SUBMITTED ?? 0} hint="Submitted by teachers" /><Stat label="Under review" value={c.UNDER_REVIEW ?? 0} /><Stat label="Corrections outstanding" value={c.CORRECTION_REQUESTED ?? 0} /><Stat label={t("Verified")} value={c.VERIFIED ?? 0} /></div>; }}</Block> },
    { id: "inbox", label: "Submissions inbox", node: <Card title="Submissions inbox" actions={<Link to="/review">Open inbox</Link>}><Block q={subs}>{(rows) => { const w = rows.filter((r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"); return w.length === 0 ? <Empty title="Inbox is clear" /> : <ul style={{ margin: 0, paddingLeft: 18 }}>{w.slice(0, 8).map((r) => <li key={r.id}><Link to={`/review/${r.id}`}>{r.subjectName} {r.className}-{r.sectionName}</Link> <span className="faint">{r.teacherName}</span> <StatusBadge status={r.status} /></li>)}</ul>; }}</Block></Card> },
    { id: "pipeline", label: "Results pipeline", node: <Card title="Results pipeline" actions={<Link to="/results">Open results</Link>}><Block q={sets}>{(rows) => rows.length === 0 ? <Empty title="No result sets yet">Compile one once all papers are verified.</Empty> : <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.slice(0, 8).map((r) => <li key={r.id}><Link to={`/results/${r.id}`}>{r.examName} · {r.className}</Link> <StatusBadge status={r.status} /></li>)}</ul>}</Block></Card> },
    { id: "exams", label: "Exams by status", node: <Card title="Exams"><Block q={exams}>{(rows) => <div className="row">{Object.entries(countBy(rows, (e) => e.status)).map(([k, v]) => <span key={k}><StatusBadge status={k} /> {v}</span>)}{rows.length === 0 ? <span className="muted">No exams created yet.</span> : null}</div>}</Block></Card> },
  ]} />;
}

function HeadmasterHome() {
  const sets = useList<ResultSetRow>("/result-sets");
  const exams = useList<Exam>("/exams", undefined, { max: 100 });
  const reports = useGet<{ id: string }[]>("/moderation/reports", { status: "OPEN" });
  const enrol = useGet<{ rows: { students: number }[] }>("/reports/enrollment-summary");
  return <Board widgets={[
    { id: "approvals", label: "Approvals and counts", node: <Block q={sets}>{(rows) => { const c = countBy(rows, (r) => r.status); return (
      <>
        {c.VERIFIED ? <div className="banner" role="alert"><strong>{c.VERIFIED} result set{c.VERIFIED > 1 ? "s" : ""} awaiting your approval.</strong> <Link to="/results">Review now</Link></div> : null}
        <div className="grid cols-4"><Stat label={t("Awaiting approval")} value={c.VERIFIED ?? 0} /><Stat label={t("Approved, to publish")} value={c.APPROVED ?? 0} /><Stat label={t("Published")} value={c.PUBLISHED ?? 0} /><Stat label={t("Students enrolled")} value={enrol.data ? enrol.data.rows.reduce((a, r) => a + Number(r.students), 0) : "—"} /></div></>); }}</Block> },
    { id: "pipeline", label: "Exam pipeline", node: <Card title="Exam pipeline" actions={<Link to="/exams">Exams</Link>}><Block q={exams}>{(rows) => rows.length === 0 ? <Empty title="No exams yet" /> : <div className="stack">{rows.slice(0, 6).map((e) => <div key={e.id} className="row"><Link to={`/exams/${e.id}`}>{e.name}</Link><span className="spacer" /><StatusBadge status={e.status} /></div>)}</div>}</Block></Card> },
    { id: "attention", label: "Needs attention", node: <Card title="Needs attention"><div className="stack"><div className="row"><span>Open moderation reports</span><span className="spacer" /><strong>{reports.data?.length ?? "—"}</strong></div><Link to="/moderation">Open moderation</Link><Link to="/audit">View audit log</Link></div></Card> },
  ]} />;
}

function StudentHome() {
  const me = useGet<Student>("/students/me");
  const id = me.data?.id ?? null;
  const results = useGet<PublishedResult[]>(id ? `/students/${id}/results` : null);
  const att = useGet<{ summary: { percentage: number; total: number; absent: number } }>(id ? `/students/${id}/attendance` : null);
  const hw = useList<Homework>("/homework", undefined, { max: 50 });
  const notices = useList<Notice>("/notices", { limit: 4 }, { max: 4 });
  return <Board widgets={[
    { id: "stats", label: "Attendance, homework, results", node: <div className="grid cols-3">
      <Stat label={t("Attendance")} value={att.data?.summary ? `${att.data.summary.percentage}%` : "—"} hint={att.data?.summary ? `${att.data.summary.absent} absent of ${att.data.summary.total} days` : undefined} />
      <Stat label={t("Homework due")} value={hw.data ? hw.data.filter((h) => h.status === "PUBLISHED" && !h.mySubmission).length : "—"} />
      <Stat label={t("Published results")} value={results.data?.length ?? "—"} /></div> },
    { id: "result", label: "Latest result", node: <Card title={t("Latest result")} actions={<Link to="/my-results">All results</Link>}><Block q={results}>{(rows) => rows.length === 0 ? <Empty title={t("No published results yet")} /> : <div className="stack"><strong>{rows[0]!.examName}</strong><div className="row"><span>GPA <strong className="num">{Number(rows[0]!.gpa).toFixed(2)}</strong></span><span>{t("Grade")} <strong>{rows[0]!.grade}</strong></span><span>{rows[0]!.passed ? t("Passed") : t("Not passed")}</span></div></div>}</Block></Card> },
    { id: "notices", label: "Notices", node: <Card title="Notices" actions={<Link to="/notices">All</Link>}><NoticeList q={notices} /></Card> },
  ]} />;
}
