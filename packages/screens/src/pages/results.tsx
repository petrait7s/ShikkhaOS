import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { can } from "@shikkhaos/permissions";
import type { Exam, ExamPaper, ResultSetDetail, ResultSetRow, SchoolClass } from "@shikkhaos/types";
import { ApiError } from "@shikkhaos/api-client";
import { useApp, useAction, useGet, useList, useSession } from "../context";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorState, Field, Input, Modal, PageHeader, ReauthDialog, Select, Skeleton, StatusBadge, Table, Textarea, fmtDateTime } from "../ui";

export function Results() {
  const s = useSession(); const navigate = useNavigate(); const [compiling, setCompiling] = React.useState(false);
  const q = useList<ResultSetRow>("/result-sets");
  return <>
    <PageHeader title="Results" sub="Compile, approve and publish official results" actions={can(s, "marks.verify") ? <Button variant="primary" onClick={() => setCompiling(true)}>Compile results</Button> : null} />
    <div className="card">{q.isLoading ? <div style={{ padding: 16 }}><Skeleton rows={5} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> :
      <Table rows={q.data!} rowKey={(r) => r.id} onRow={(r) => navigate(`/results/${r.id}`)} empty={<Empty title="No result sets">Results appear here once every paper of a class is verified and compiled.</Empty>}
        columns={[{ key: "e", header: "Exam", render: (r) => <strong>{r.examName}</strong> }, { key: "c", header: "Class", render: (r) => r.className }, { key: "r", header: "Revision", align: "r", render: (r) => r.currentRevision }, { key: "p", header: "Published", render: (r) => fmtDateTime(r.publishedAt) }, { key: "s", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />}</div>
    {compiling ? <Compile onClose={() => setCompiling(false)} /> : null}</>;
}

function Compile({ onClose }: { onClose: () => void }) {
  const { api } = useApp(); const navigate = useNavigate(); const exams = useList<Exam>("/exams"); const classes = useList<SchoolClass>("/classes");
  const [examId, setExam] = React.useState(""); const [classId, setClass] = React.useState(""); const [pending, setPending] = React.useState<{ examPaperId: string; sectionId: string; status: string }[]>([]); const [err, setErr] = React.useState<string>();
  const papers = useList<ExamPaper>("/exam-papers", { examId }, { enabled: !!examId });
  const classIds = [...new Set((papers.data ?? []).map((p) => p.classId))];
  const go = useAction(async () => { setErr(undefined); setPending([]); try { return await api.post<{ id: string }>("/result-sets", { examId, classId }); } catch (e) { if (e instanceof ApiError) { setErr(e.message); setPending((e.details?.pending as never) ?? []); } throw e; } }, { invalidate: ["/result-sets"], onSuccess: (r) => { onClose(); navigate(`/results/${r.id}`); } });
  return <Modal title="Compile results" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={go.isPending} disabled={!examId || !classId} onClick={() => go.mutate(undefined)}>Compile</Button></>}>
    <div className="stack">{err ? <div className="banner bad" role="alert">{err}{pending.length ? <ul>{pending.map((p) => <li key={p.examPaperId + p.sectionId}>A paper section is {p.status.toLowerCase().replace(/_/g, " ")}</li>)}</ul> : null}</div> : null}
      <Field label="Exam"><Select value={examId} onChange={(e) => { setExam(e.target.value); setClass(""); }}><option value="">Choose…</option>{exams.data?.filter((e) => e.status !== "DRAFT").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
      <Field label="Class" hint="Every paper of every section must be verified."><Select value={classId} onChange={(e) => setClass(e.target.value)} disabled={!examId}><option value="">Choose…</option>{classIds.map((id) => <option key={id} value={id}>{classes.data?.find((c) => c.id === id)?.name ?? id}</option>)}</Select></Field></div></Modal>;
}

interface RevReq { id: string; status: string; reason: string; requestedBy: string; proposedChanges: { studentId: string; subjectId: string; newMarks: number | null; absent: boolean }[]; createdAt: string }

export function ResultDetail() {
  const { id } = useParams(); const s = useSession(); const { api } = useApp();
  const q = useGet<ResultSetDetail>(`/result-sets/${id}`); const revs = useGet<RevReq[]>(can(s, "marks.review") || can(s, "results.revise_published") || can(s, "results.approve") ? `/result-sets/${id}/revision-requests` : null);
  const [reauth, setReauth] = React.useState<{ title: string; run: (t: string) => Promise<unknown>; ok: string } | null>(null); const [typed, setTyped] = React.useState<"publish" | null>(null); const [revOpen, setRevOpen] = React.useState(false);
  const inv = { invalidate: ["/result-sets", "/result-revision", "/students"] };
  const reject = useAction(({ reason, t }: { reason: string; t: string }) => api.post(`/result-sets/${id}/reject`, { reason }, { reauthToken: t }), { ...inv, success: "Sent back to the Register" });
  const recompile = useAction(() => api.post("/result-sets", { examId: q.data!.examId, classId: q.data!.classId }), { ...inv, success: "Compiled again as a new revision" });
  const [rejecting, setRejecting] = React.useState(false);
  const approve = useAction((t: string) => api.post(`/result-sets/${id}/approve`, {}, { reauthToken: t }), { ...inv, success: "Results approved" });
  const publish = useAction((t: string) => api.post(`/result-sets/${id}/publish`, {}, { reauthToken: t }), { ...inv, success: "Results published — students notified" });
  const cards = useAction(() => api.post<{ generated: number }>(`/result-sets/${id}/report-cards`), { success: "Report cards generated" });
  const decide = useAction(({ rid, verb, t }: { rid: string; verb: string; t: string }) => api.post(`/result-revision-requests/${rid}/${verb}`, {}, { reauthToken: t }), { ...inv, success: "Done" });
  if (q.isLoading) return <Skeleton rows={8} />; if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const r = q.data!; const names = new Map<string, string>(); r.results.forEach((x) => x.subjects.forEach((sub) => names.set(sub.subjectId, sub.subjectName ?? sub.subjectId)));
  const subjectIds = [...names.keys()];
  return <>
    <PageHeader title={`${r.examName} · ${r.className}`} sub={`Revision ${r.revision}`} actions={<><Link className="btn" to="/results">Back</Link><StatusBadge status={r.status} />
      {r.status === "VERIFIED" && can(s, "results.approve") ? <><Button onClick={() => setRejecting(true)}>Send back to Register</Button><Button variant="primary" onClick={() => setReauth({ title: "Approve results", ok: "approve", run: (t) => approve.mutateAsync(t) })}>Approve</Button></> : null}
      {r.status === "REJECTED" && can(s, "marks.verify") ? <Button variant="primary" busy={recompile.isPending} onClick={() => recompile.mutate(undefined)}>Compile again</Button> : null}
      {r.status === "APPROVED" && can(s, "results.publish") ? <Button variant="primary" onClick={() => setTyped("publish")}>Publish</Button> : null}
      {r.status === "PUBLISHED" && can(s, "reportcards.generate") ? <Button busy={cards.isPending} onClick={() => cards.mutate(undefined)}>Generate report cards</Button> : null}
      {r.status === "PUBLISHED" && (can(s, "marks.review") || can(s, "results.revise_published")) ? <Button onClick={() => setRevOpen(true)}>Request revision</Button> : null}</>} />
    {r.status === "REJECTED" ? <div className="banner" role="alert" style={{ marginBottom: 12 }}><strong>Sent back by the Headmaster:</strong> {r.rejectionNote} {can(s, "marks.verify") ? <>Re-verify the reopened submissions in the <Link to="/review">inbox</Link> (request corrections if marks must change), then compile again.</> : null}</div> : null}
    {r.status === "VERIFIED" ? <div className="banner info" style={{ marginBottom: 12 }}>Compiled from verified marks. {can(s, "results.approve") ? "Review the figures, then approve." : "Waiting for the Headmaster's approval."}</div> : r.status === "APPROVED" ? <div className="banner info" style={{ marginBottom: 12 }}>Approved. Publishing makes results visible to students and cannot be undone; later changes need a revision with approval.</div> : null}
    <div className="grid cols-4" style={{ marginBottom: 16 }}>{[["Students", r.summary.students], ["Pass rate", `${r.summary.passRate.toFixed(0)}%`], ["Failed", r.summary.failed], ["With absence", r.summary.withAbsence]].map(([l, v]) => <div key={String(l)} className="card stat"><div className="v">{v}</div><div className="l">{l}</div></div>)}</div>
    <div className="card"><div className="table-wrap"><table className="t"><thead><tr><th>Pos</th><th>Roll</th><th>Student</th>{subjectIds.map((sid) => <th key={sid} className="r">{names.get(sid)}</th>)}<th className="r">Total</th><th className="r">GPA</th><th>Grade</th></tr></thead>
      <tbody>{r.results.map((x) => <tr key={x.studentId}><td>{x.position ?? "—"}</td><td>{x.rollNo ?? ""}</td><td><strong>{x.fullName}</strong> <span className="faint">{x.sectionName}</span></td>{subjectIds.map((sid) => { const sub = x.subjects.find((z) => z.subjectId === sid); return <td key={sid} className="r num" style={sub && !sub.passed ? { color: "var(--bad)" } : undefined}>{sub ? (sub.absent ? "ABS" : sub.marks) : "—"}</td>; })}<td className="r num">{x.totalMarks}</td><td className="r num">{x.gpa === null ? "—" : Number(x.gpa).toFixed(2)}</td><td>{x.passed ? x.grade : <Badge tone="bad">F</Badge>}</td></tr>)}</tbody></table></div></div>
    {revs.data?.length ? <Card title="Revision requests"><Table rows={revs.data} rowKey={(v) => v.id} columns={[{ key: "r", header: "Reason", render: (v) => v.reason }, { key: "c", header: "Changes", render: (v) => v.proposedChanges.length }, { key: "d", header: "Requested", render: (v) => fmtDateTime(v.createdAt) }, { key: "s", header: "Status", render: (v) => <StatusBadge status={v.status} /> },
      { key: "a", header: "", render: (v) => can(s, "results.revise_published") ? <div className="row">{v.status === "PENDING" ? <><Button size="sm" onClick={() => setReauth({ title: "Approve revision", ok: "approve", run: (t) => decide.mutateAsync({ rid: v.id, verb: "approve", t }) })}>Approve</Button><Button size="sm" onClick={() => setReauth({ title: "Reject revision", ok: "reject", run: (t) => decide.mutateAsync({ rid: v.id, verb: "reject", t }) })}>Reject</Button></> : null}{v.status === "APPROVED" ? <Button size="sm" variant="primary" onClick={() => setReauth({ title: "Apply revision", ok: "apply", run: (t) => decide.mutateAsync({ rid: v.id, verb: "apply", t }) })}>Apply → new revision</Button> : null}</div> : null }]} /></Card> : null}
    {reauth ? <ReauthDialog title={reauth.title} reauth={(pw) => api.reauth(pw)} onToken={async (t) => { await reauth.run(t); }} onClose={() => setReauth(null)} /> : null}
    {typed === "publish" ? <ConfirmDialog title="Publish results" typed="PUBLISH" danger={false} confirmLabel="Continue" message={<>Publishing notifies <strong>{r.summary.students}</strong> students and makes results visible. You will confirm with your password next.</>} onConfirm={() => { setReauth({ title: "Publish results", ok: "publish", run: (t) => publish.mutateAsync(t) }); }} onClose={() => setTyped(null)} /> : null}
    {revOpen ? <RevisionDialog r={r} onClose={() => setRevOpen(false)} /> : null}
    {rejecting ? <RejectDialog onClose={() => setRejecting(false)} onSend={(reason) => { setRejecting(false); setReauth({ title: "Send results back", ok: "reject", run: (t) => reject.mutateAsync({ reason, t }) }); }} /> : null}
  </>;
}

function RejectDialog({ onSend, onClose }: { onSend: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = React.useState("");
  return <Modal title="Send results back to the Register" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!reason.trim()} onClick={() => onSend(reason.trim())}>Continue</Button></>}>
    <div className="stack"><div className="banner info">The submissions for this exam and class return to review. The Register fixes them and compiles a new revision; this revision stays on record.</div><Field label="What needs to change? (required)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div></Modal>;
}

function RevisionDialog({ r, onClose }: { r: ResultSetDetail; onClose: () => void }) {
  const { api } = useApp(); const [reason, setReason] = React.useState(""); const [studentId, setStudent] = React.useState(""); const [subjectId, setSubject] = React.useState(""); const [marks, setMarks] = React.useState(""); const [err, setErr] = React.useState<string>();
  const st = r.results.find((x) => x.studentId === studentId);
  const send = useAction(() => api.post(`/result-sets/${r.id}/revision-requests`, { reason, changes: [{ studentId, subjectId, newMarks: Number(marks), absent: false }] }).catch((e) => { setErr(e.message); throw e; }), { invalidate: ["/result-sets"], success: "Revision requested — the Headmaster must approve it", onSuccess: onClose });
  return <Modal title="Request revision" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={send.isPending} disabled={!reason.trim() || !studentId || !subjectId || marks === ""} onClick={() => send.mutate(undefined)}>Submit request</Button></>}>
    <div className="stack">{err ? <div className="banner bad" role="alert">{err}</div> : null}<div className="banner info">Published results are never edited in place. An approved revision creates a new revision and keeps the old one on record.</div>
      <Field label="Reason (required)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div className="form-grid"><Field label="Student"><Select value={studentId} onChange={(e) => { setStudent(e.target.value); setSubject(""); }}><option value="">Choose…</option>{r.results.map((x) => <option key={x.studentId} value={x.studentId}>{x.fullName}</option>)}</Select></Field>
        <Field label="Subject"><Select value={subjectId} onChange={(e) => setSubject(e.target.value)} disabled={!st}><option value="">Choose…</option>{st?.subjects.map((x) => <option key={x.subjectId} value={x.subjectId}>{x.subjectName ?? x.subjectId} (now {x.absent ? "absent" : x.marks})</option>)}</Select></Field>
        <Field label="Corrected marks"><Input type="number" step="0.01" value={marks} onChange={(e) => setMarks(e.target.value)} /></Field></div></div></Modal>;
}
