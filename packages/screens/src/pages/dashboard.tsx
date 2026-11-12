import { Link } from "react-router-dom";
import type { Exam, Homework, MarkSubmissionRow, Notice, PublishedResult, ResultSetRow, Student } from "@shikkhaos/types";
import { ROLE_LABEL } from "@shikkhaos/types";
import { useApp, useGet, useList } from "../context";
import { Card, Empty, ErrorState, PageHeader, Skeleton, Stat, StatusBadge, fmtDate, fmtDateTime } from "../ui";

export function Dashboard() {
  const { auth } = useApp();
  return (
    <>
      <PageHeader title={`Welcome, ${auth.user.displayName.split(" ")[0]}`} sub={`${ROLE_LABEL[auth.role]} dashboard`} />
      {auth.role === "STUDENT" ? <StudentHome /> : auth.role === "TEACHER" ? <TeacherHome /> : auth.role === "REGISTRAR" ? <RegistrarHome /> : <HeadmasterHome />}
    </>
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
  return (
    <div className="stack">
      <Block q={subs}>{(rows) => { const c = countBy(rows, (r) => r.status); return (
        <>
          {c.CORRECTION_REQUESTED ? <div className="banner" role="alert"><strong>{c.CORRECTION_REQUESTED} correction request{c.CORRECTION_REQUESTED > 1 ? "s" : ""}</strong> — the Register asked you to fix submitted marks. <Link to="/marks">Open marks entry</Link></div> : null}
          <div className="grid cols-4">
            <Stat label="To enter" value={c.DRAFT ?? 0} /><Stat label="Needs correction" value={c.CORRECTION_REQUESTED ?? 0} /><Stat label="With the Register" value={(c.SUBMITTED ?? 0) + (c.UNDER_REVIEW ?? 0)} /><Stat label="Verified" value={c.VERIFIED ?? 0} />
          </div></>); }}</Block>
      <div className="grid cols-2">
        <Card title="Marks entry" actions={<Link to="/marks">All</Link>}><Block q={subs}>{(rows) => rows.length === 0 ? <Empty title="No exam marks to enter" /> : <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.slice(0, 6).map((r) => <li key={r.id}><Link to={`/marks/${r.id}`}>{r.examName} · {r.subjectName} {r.className}-{r.sectionName}</Link> <StatusBadge status={r.status} /></li>)}</ul>}</Block></Card>
        <Card title="Homework to review" actions={<Link to="/homework">All</Link>}><Block q={hw}>{(rows) => { const open = rows.filter((h) => h.status === "PUBLISHED"); return open.length === 0 ? <Empty title="No open homework" /> : <ul style={{ margin: 0, paddingLeft: 18 }}>{open.slice(0, 6).map((h) => <li key={h.id}>{h.title} <span className="faint">due {fmtDateTime(h.dueAt)}</span></li>)}</ul>; }}</Block></Card>
      </div>
      <Card title="Latest notices" actions={<Link to="/notices">All</Link>}><NoticeList q={notices} /></Card>
    </div>
  );
}

function NoticeList({ q }: { q: ReturnType<typeof useList<Notice>> }) {
  return <Block q={q}>{(rows) => rows.length === 0 ? <Empty title="No notices" /> : <div className="stack">{rows.map((n) => <div key={n.id}><strong>{n.title}</strong> <span className="faint">{fmtDate(n.publishedAt)}</span><div className="muted">{n.body.slice(0, 160)}</div></div>)}</div>}</Block>;
}

function RegistrarHome() {
  const subs = useList<MarkSubmissionRow>("/mark-submissions");
  const sets = useList<ResultSetRow>("/result-sets");
  const exams = useList<Exam>("/exams", undefined, { max: 100 });
  return (
    <div className="stack">
      <Block q={subs}>{(rows) => { const c = countBy(rows, (r) => r.status); return <div className="grid cols-4">
        <Stat label="Awaiting review" value={c.SUBMITTED ?? 0} hint="Submitted by teachers" /><Stat label="Under review" value={c.UNDER_REVIEW ?? 0} /><Stat label="Corrections outstanding" value={c.CORRECTION_REQUESTED ?? 0} /><Stat label="Verified" value={c.VERIFIED ?? 0} /></div>; }}</Block>
      <div className="grid cols-2">
        <Card title="Submissions inbox" actions={<Link to="/review">Open inbox</Link>}><Block q={subs}>{(rows) => { const w = rows.filter((r) => r.status === "SUBMITTED" || r.status === "UNDER_REVIEW"); return w.length === 0 ? <Empty title="Inbox is clear" /> : <ul style={{ margin: 0, paddingLeft: 18 }}>{w.slice(0, 8).map((r) => <li key={r.id}><Link to={`/review/${r.id}`}>{r.subjectName} {r.className}-{r.sectionName}</Link> <span className="faint">{r.teacherName}</span> <StatusBadge status={r.status} /></li>)}</ul>; }}</Block></Card>
        <Card title="Results pipeline" actions={<Link to="/results">Open results</Link>}><Block q={sets}>{(rows) => rows.length === 0 ? <Empty title="No result sets yet">Compile one once all papers are verified.</Empty> : <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.slice(0, 8).map((r) => <li key={r.id}><Link to={`/results/${r.id}`}>{r.examName} · {r.className}</Link> <StatusBadge status={r.status} /></li>)}</ul>}</Block></Card>
      </div>
      <Card title="Exams"><Block q={exams}>{(rows) => <div className="row">{Object.entries(countBy(rows, (e) => e.status)).map(([k, v]) => <span key={k}><StatusBadge status={k} /> {v}</span>)}{rows.length === 0 ? <span className="muted">No exams created yet.</span> : null}</div>}</Block></Card>
    </div>
  );
}

function HeadmasterHome() {
  const sets = useList<ResultSetRow>("/result-sets");
  const exams = useList<Exam>("/exams", undefined, { max: 100 });
  const reports = useGet<{ id: string }[]>("/moderation/reports", { status: "OPEN" });
  const enrol = useGet<{ rows: { students: number }[] }>("/reports/enrollment-summary");
  return (
    <div className="stack">
      <Block q={sets}>{(rows) => { const c = countBy(rows, (r) => r.status); return (
        <>
          {c.VERIFIED ? <div className="banner" role="alert"><strong>{c.VERIFIED} result set{c.VERIFIED > 1 ? "s" : ""} awaiting your approval.</strong> <Link to="/results">Review now</Link></div> : null}
          <div className="grid cols-4">
            <Stat label="Awaiting approval" value={c.VERIFIED ?? 0} /><Stat label="Approved, to publish" value={c.APPROVED ?? 0} /><Stat label="Published" value={c.PUBLISHED ?? 0} />
            <Stat label="Students enrolled" value={enrol.data ? enrol.data.rows.reduce((a, r) => a + Number(r.students), 0) : "—"} /></div></>); }}</Block>
      <div className="grid cols-2">
        <Card title="Exam pipeline" actions={<Link to="/exams">Exams</Link>}><Block q={exams}>{(rows) => rows.length === 0 ? <Empty title="No exams yet" /> : <div className="stack">{rows.slice(0, 6).map((e) => <div key={e.id} className="row"><Link to={`/exams/${e.id}`}>{e.name}</Link><span className="spacer" /><StatusBadge status={e.status} /></div>)}</div>}</Block></Card>
        <Card title="Needs attention"><div className="stack"><div className="row"><span>Open moderation reports</span><span className="spacer" /><strong>{reports.data?.length ?? "—"}</strong></div><Link to="/moderation">Open moderation</Link><Link to="/audit">View audit log</Link></div></Card>
      </div>
    </div>
  );
}

function StudentHome() {
  const me = useGet<Student>("/students/me");
  const id = me.data?.id ?? null;
  const results = useGet<PublishedResult[]>(id ? `/students/${id}/results` : null);
  const att = useGet<{ summary: { percentage: number; total: number; absent: number } }>(id ? `/students/${id}/attendance` : null);
  const hw = useList<Homework>("/homework", undefined, { max: 50 });
  const notices = useList<Notice>("/notices", { limit: 4 }, { max: 4 });
  return (
    <div className="stack">
      <div className="grid cols-3">
        <Stat label="Attendance" value={att.data?.summary ? `${att.data.summary.percentage}%` : "—"} hint={att.data?.summary ? `${att.data.summary.absent} absent of ${att.data.summary.total} days` : undefined} />
        <Stat label="Homework due" value={hw.data ? hw.data.filter((h) => h.status === "PUBLISHED" && !h.mySubmission).length : "—"} />
        <Stat label="Published results" value={results.data?.length ?? "—"} />
      </div>
      <div className="grid cols-2">
        <Card title="Latest result" actions={<Link to="/my-results">All results</Link>}><Block q={results}>{(rows) => rows.length === 0 ? <Empty title="No published results yet" /> : <div className="stack"><strong>{rows[0]!.examName}</strong><div className="row"><span>GPA <strong className="num">{Number(rows[0]!.gpa).toFixed(2)}</strong></span><span>Grade <strong>{rows[0]!.grade}</strong></span><span>{rows[0]!.passed ? "Passed" : "Not passed"}</span></div></div>}</Block></Card>
        <Card title="Notices" actions={<Link to="/notices">All</Link>}><NoticeList q={notices} /></Card>
      </div>
    </div>
  );
}
