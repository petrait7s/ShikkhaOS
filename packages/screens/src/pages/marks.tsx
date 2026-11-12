import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { checkMarks } from "@shikkhaos/validation";
import type { MarkSubmissionDetail, MarkSubmissionRow, Section, SchoolClass, Subject, TeacherAssignment } from "@shikkhaos/types";
import { ApiError } from "@shikkhaos/api-client";
import { useApp, useAction, useGet, useList, useRealtimeInvalidate } from "../context";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorState, PageHeader, Skeleton, StatusBadge, Table, Input, useToast } from "../ui";

export function MarksList({ mode }: { mode: "marks" | "classes" }) {
  const navigate = useNavigate();
  useRealtimeInvalidate(["mark-submission.status_changed", "correction.requested"], ["/mark-submissions"]);
  if (mode === "classes") return <MyClasses />;
  const q = useList<MarkSubmissionRow>("/mark-submissions");
  return <>
    <PageHeader title="Marks entry" sub="Exam papers assigned to you" />
    <div className="card">{q.isLoading ? <div style={{ padding: 16 }}><Skeleton rows={5} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> :
      <Table rows={q.data!} rowKey={(r) => r.id} onRow={(r) => navigate(`/marks/${r.id}`)} empty={<Empty title="Nothing to enter">When the Headmaster authorizes an exam you teach, its papers appear here.</Empty>}
        columns={[{ key: "e", header: "Exam", render: (r) => <strong>{r.examName}</strong> }, { key: "p", header: "Paper", render: (r) => `${r.subjectName} · ${r.className}-${r.sectionName}` }, { key: "m", header: "Full marks", align: "r", render: (r) => r.fullMarks }, { key: "s", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />}</div></>;
}

function MyClasses() {
  const a = useList<TeacherAssignment>("/teacher-assignments"); const classes = useList<SchoolClass>("/classes"); const sections = useList<Section>("/sections"); const subjects = useList<Subject>("/subjects");
  if (a.isLoading) return <Skeleton rows={5} />; if (a.error) return <ErrorState error={a.error} />;
  const c = (id: string) => classes.data?.find((x) => x.id === id)?.name ?? ""; const s = (id: string) => sections.data?.find((x) => x.id === id)?.name ?? ""; const sub = (id: string | null) => subjects.data?.find((x) => x.id === id)?.name;
  return <>
    <PageHeader title="My classes" sub="Your assigned classes and subjects this session" />
    {a.data!.length === 0 ? <Empty title="No assignments yet">The Register or Headmaster assigns your classes and subjects.</Empty> : <div className="grid cols-3">{a.data!.map((x) => <Card key={x.id} title={`${c(x.classId)}-${s(x.sectionId)}`}><div className="stack"><div>{sub(x.subjectId) ?? "Class teacher"} {x.isClassTeacher ? <Badge tone="info">Class teacher</Badge> : null}</div><div className="row"><Link className="btn sm" to="/attendance">Attendance</Link><Link className="btn sm" to="/class-tests">Class tests</Link><Link className="btn sm" to="/homework">Homework</Link></div></div></Card>)}</div>}</>;
}

interface RowState { marks: string; absent: boolean; remark: string }

export function MarksEditor() {
  const { id } = useParams(); const { api } = useApp(); const toast = useToast();
  const q = useGet<MarkSubmissionDetail>(`/mark-submissions/${id}`);
  const hist = useGet<{ history: { id: string; fromStatus: string | null; toStatus: string; actorName: string; note: string | null; createdAt: string }[] }>(`/mark-submissions/${id}/history`);
  const [rows, setRows] = React.useState<Record<string, RowState>>({}); const [dirty, setDirty] = React.useState(false); const [errs, setErrs] = React.useState<Record<string, string>>({}); const [confirm, setConfirm] = React.useState(false);
  React.useEffect(() => { if (q.data) { setRows(Object.fromEntries(q.data.entries.map((e) => [e.studentId, { marks: e.marksObtained === null ? "" : String(e.marksObtained), absent: e.absent, remark: e.remark ?? "" }]))); setDirty(false); setErrs({}); } }, [q.data?.version, q.data?.currentRevision, q.data?.status]);
  React.useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, [dirty]);
  const sub = q.data;
  const validate = React.useCallback((r: Record<string, RowState>) => { const e: Record<string, string> = {}; if (!sub) return e; for (const [sid, v] of Object.entries(r)) { const c = checkMarks(v.marks, sub.fullMarks, v.absent); if (!c.ok) e[sid] = c.message!; } return e; }, [sub]);
  const save = useAction(async () => {
    if (!sub) return; const e = validate(rows); setErrs(e); if (Object.keys(e).length) throw new Error("Fix the highlighted marks before saving");
    try { await api.put(`/mark-submissions/${id}/entries`, { entries: sub.entries.map((en) => { const r = rows[en.studentId]!; return { studentId: en.studentId, marksObtained: r.absent || r.marks === "" ? null : Number(r.marks), absent: r.absent, remark: r.remark || null }; }) }, { ifMatch: sub.version }); }
    catch (ex) { if (ex instanceof ApiError && ex.code === "VERSION_CONFLICT") toast("This sheet was changed elsewhere. Reloading the latest version.", "bad"), void q.refetch(); throw ex; }
  }, { invalidate: ["/mark-submissions"], success: "Draft saved" });
  const submit = useAction(async () => { await save.mutateAsync(undefined); await api.post(`/mark-submissions/${id}/submit`); }, { invalidate: ["/mark-submissions"], success: "Submitted to the Register" });
  if (q.isLoading) return <Skeleton rows={8} />; if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const s = q.data!; const editable = s.editable; const flagged = s.entries.some((e) => e.flagged);
  const set = (sid: string, patch: Partial<RowState>) => { const next = { ...rows, [sid]: { ...rows[sid]!, ...patch } }; setRows(next); setDirty(true); setErrs(validate(next)); };
  const total = Object.values(rows).reduce((a, r) => a + (r.absent ? 0 : Number(r.marks) || 0), 0); const filled = Object.values(rows).filter((r) => r.absent || r.marks !== "").length;
  const move = (e: React.KeyboardEvent<HTMLInputElement>, i: number) => { if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); (document.querySelector(`[data-row="${i + 1}"] input[type=text]`) as HTMLInputElement | null)?.focus(); } else if (e.key === "ArrowUp") { e.preventDefault(); (document.querySelector(`[data-row="${i - 1}"] input[type=text]`) as HTMLInputElement | null)?.focus(); } };
  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>, i: number) => { const t = e.clipboardData.getData("text"); if (!t.includes("\n")) return; e.preventDefault(); const lines = t.split(/\r?\n/).filter((l) => l.trim() !== ""); const next = { ...rows }; lines.forEach((l, k) => { const en = s.entries[i + k]; if (en) next[en.studentId] = { ...next[en.studentId]!, marks: l.split("\t")[0]!.trim(), absent: false }; }); setRows(next); setDirty(true); setErrs(validate(next)); };
  return <>
    <PageHeader title={`${s.subjectName} · ${s.className}-${s.sectionName}`} sub={`${s.examName} · full marks ${s.fullMarks}, pass ${s.passMarks} · revision ${s.currentRevision}`} actions={<><Link className="btn" to="/marks">Back</Link><StatusBadge status={s.status} /></>} />
    {s.status === "CORRECTION_REQUESTED" ? <div className="banner" role="alert" style={{ marginBottom: 12 }}><strong>Correction requested.</strong> {s.note ?? ""} {flagged ? "Highlighted rows were flagged by the Register." : ""}</div> : null}
    {!editable && s.status !== "CORRECTION_REQUESTED" ? <div className="banner info" style={{ marginBottom: 12 }}>{s.status === "DRAFT" ? "This exam is not open for marks entry." : "This sheet is locked while the Register reviews it."}</div> : null}
    <div className="card"><div className="table-wrap marks-grid"><table className="t"><thead><tr><th scope="col" style={{ width: 60 }}>Roll</th><th scope="col">Student</th><th scope="col" className="r">Marks (/ {s.fullMarks})</th><th scope="col">Absent</th><th scope="col">Remark</th></tr></thead>
      <tbody>{s.entries.map((en, i) => { const r = rows[en.studentId]; if (!r) return null; const err = errs[en.studentId]; return (
        <tr key={en.studentId} data-row={i} className={en.flagged ? "flag" : ""}><td>{en.rollNo}</td><td><strong>{en.fullName}</strong> <span className="faint mono">{en.studentCode}</span>{en.flagged ? <div className="faint">⚑ {en.flagNote ?? "Flagged by Register"}</div> : null}</td>
          <td className="r"><Input type="text" inputMode="decimal" aria-label={`Marks for ${en.fullName}`} aria-invalid={err ? true : undefined} className={err ? "bad" : ""} disabled={!editable || r.absent} value={r.marks} onChange={(e) => set(en.studentId, { marks: e.target.value })} onKeyDown={(e) => move(e, i)} onPaste={(e) => onPaste(e, i)} />{err ? <div className="err" style={{ color: "var(--bad)", fontSize: 12 }} role="alert">{err}</div> : null}</td>
          <td><input type="checkbox" aria-label={`${en.fullName} absent`} disabled={!editable} checked={r.absent} onChange={(e) => set(en.studentId, { absent: e.target.checked, marks: e.target.checked ? "" : r.marks })} /></td>
          <td><Input disabled={!editable} value={r.remark} onChange={(e) => set(en.studentId, { remark: e.target.value })} style={{ minWidth: 140 }} aria-label={`Remark for ${en.fullName}`} /></td></tr>); })}</tbody></table></div>
      <div className="row" style={{ padding: 12, borderTop: "1px solid var(--border)" }}><span className="muted">{filled} of {s.entries.length} entered · total <strong className="num">{total}</strong></span><span className="spacer" />{dirty ? <Badge tone="warn">Unsaved changes</Badge> : null}
        {editable ? <><Button onClick={() => save.mutate(undefined)} busy={save.isPending} disabled={!dirty}>Save draft</Button><Button variant="primary" onClick={() => setConfirm(true)} disabled={filled < s.entries.length || Object.keys(errs).length > 0}>Submit to Register</Button></> : null}</div></div>
    {hist.data?.history?.length ? <Card title="Status history"><ul style={{ margin: 0, paddingLeft: 18 }}>{hist.data.history.map((h) => <li key={h.id}><StatusBadge status={h.toStatus} /> by {h.actorName} <span className="faint">{new Date(h.createdAt).toLocaleString()}</span>{h.note ? <div className="muted">{h.note}</div> : null}</li>)}</ul></Card> : null}
    {confirm ? <ConfirmDialog title="Submit marks" message={<>Submit {s.entries.length} marks to the Register? You will not be able to edit them unless a correction is requested.</>} confirmLabel="Submit" onConfirm={() => submit.mutateAsync(undefined).then(() => undefined)} onClose={() => setConfirm(false)} /> : null}
  </>;
}
