import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { can } from "@shikkhaos/permissions";
import type { MarkEntry, MarkSubmissionDetail, MarkSubmissionRow } from "@shikkhaos/types";
import { useApp, useAction, useGet, useList, useRealtimeInvalidate, useSession } from "../context";
import { Button, Card, Empty, ErrorState, Field, Modal, PageHeader, Select, Skeleton, StatusBadge, Table, Tabs, Textarea, fmtDateTime } from "../ui";

export function ReviewInbox() {
  const navigate = useNavigate(); const [status, setStatus] = React.useState("SUBMITTED");
  useRealtimeInvalidate(["mark-submission.status_changed"], ["/mark-submissions"]);
  const q = useList<MarkSubmissionRow>("/mark-submissions", { status: status === "ALL" ? undefined : status });
  return <>
    <PageHeader title="Submissions inbox" sub="Review marks submitted by teachers" />
    <Tabs value={status} onChange={setStatus} tabs={[{ id: "SUBMITTED", label: "Awaiting review" }, { id: "UNDER_REVIEW", label: "Under review" }, { id: "CORRECTION_REQUESTED", label: "Corrections" }, { id: "VERIFIED", label: "Verified" }, { id: "DRAFT", label: "Not submitted" }, { id: "ALL", label: "All" }]} />
    <div className="card">{q.isLoading ? <div style={{ padding: 16 }}><Skeleton rows={5} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> :
      <Table rows={q.data!} rowKey={(r) => r.id} onRow={(r) => navigate(`/review/${r.id}`)} empty={<Empty title="Nothing here">No submissions in this state.</Empty>}
        columns={[{ key: "e", header: "Exam", render: (r) => <strong>{r.examName}</strong> }, { key: "p", header: "Paper", render: (r) => `${r.subjectName} · ${r.className}-${r.sectionName}` }, { key: "t", header: "Teacher", render: (r) => r.teacherName }, { key: "r", header: "Rev", align: "r", render: (r) => r.currentRevision }, { key: "w", header: "Submitted", render: (r) => fmtDateTime(r.submittedAt) }, { key: "s", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />}</div></>;
}

interface Hist { history: { id: string; fromStatus: string | null; toStatus: string; revision: number; actorName: string; note: string | null; createdAt: string }[]; revisions: { revision: number; locked: boolean; entries: MarkEntry[] }[] }

export function ReviewDetail() {
  const { id } = useParams(); const s = useSession(); const { api } = useApp();
  const q = useGet<MarkSubmissionDetail>(`/mark-submissions/${id}`); const hist = useGet<Hist>(`/mark-submissions/${id}/history`);
  const [correction, setCorrection] = React.useState(false);
  const act = (path: string, success: string) => useAction(() => api.post(`/mark-submissions/${id}/${path}`), { invalidate: ["/mark-submissions"], success });
  const start = act("start-review", "Review started"); const verify = act("verify", "Verified");
  if (q.isLoading) return <Skeleton rows={8} />; if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const m = q.data!;
  const prev = hist.data?.revisions.find((r) => r.revision === m.currentRevision - 1);
  const changed = (e: MarkEntry) => { const p = prev?.entries.find((x) => x.studentId === e.studentId); return p && (p.marksObtained !== e.marksObtained || p.absent !== e.absent) ? p : null; };
  const stats = (() => { const marks = m.entries.filter((e) => !e.absent && e.marksObtained !== null).map((e) => Number(e.marksObtained)); const n = marks.length; return { n, avg: n ? marks.reduce((a, b) => a + b, 0) / n : 0, min: n ? Math.min(...marks) : 0, max: n ? Math.max(...marks) : 0, absent: m.entries.filter((e) => e.absent).length, failing: marks.filter((x) => x < m.passMarks).length }; })();
  return <>
    <PageHeader title={`${m.subjectName} · ${m.className}-${m.sectionName}`} sub={`${m.examName} · ${m.teacherName} · revision ${m.currentRevision}`} actions={<><Link className="btn" to="/review">Back</Link><StatusBadge status={m.status} />
      {can(s, "marks.review") && m.status === "SUBMITTED" ? <Button variant="primary" busy={start.isPending} onClick={() => start.mutate(undefined)}>Start review</Button> : null}
      {m.status === "UNDER_REVIEW" && can(s, "marks.request_correction") ? <Button onClick={() => setCorrection(true)}>Request correction</Button> : null}
      {m.status === "UNDER_REVIEW" && can(s, "marks.verify") ? <Button variant="primary" busy={verify.isPending} onClick={() => verify.mutate(undefined)}>Verify</Button> : null}</>} />
    <div className="grid cols-4" style={{ marginBottom: 16 }}>{[["Students", stats.n + stats.absent], ["Average", stats.avg.toFixed(1)], ["Highest / lowest", `${stats.max} / ${stats.min}`], ["Absent / below pass", `${stats.absent} / ${stats.failing}`]].map(([l, v]) => <div key={String(l)} className="card stat"><div className="v" style={{ fontSize: 20 }}>{v}</div><div className="l">{l}</div></div>)}</div>
    <div className="card"><Table rows={m.entries} rowKey={(e) => e.studentId} columns={[{ key: "r", header: "Roll", render: (e) => e.rollNo, width: 60 }, { key: "n", header: "Student", render: (e) => <strong>{e.fullName}</strong> },
      { key: "m", header: "Marks", align: "r", render: (e) => { const p = changed(e); return <span className="num">{e.absent ? "Absent" : e.marksObtained}{p ? <span className="faint"> (was {p.absent ? "Absent" : p.marksObtained})</span> : null}{!e.absent && e.marksObtained !== null && Number(e.marksObtained) < m.passMarks ? <span style={{ color: "var(--bad)" }}> ▼</span> : null}</span>; } }, { key: "f", header: "Flag", render: (e) => (e.flagged ? `⚑ ${e.flagNote ?? ""}` : "") }, { key: "k", header: "Remark", render: (e) => e.remark ?? "" }]} /></div>
    {hist.data ? <Card title="History"><ul style={{ margin: 0, paddingLeft: 18 }}>{hist.data.history.map((h) => <li key={h.id}><StatusBadge status={h.toStatus} /> rev {h.revision} · {h.actorName} <span className="faint">{fmtDateTime(h.createdAt)}</span>{h.note ? <div className="muted">{h.note}</div> : null}</li>)}</ul></Card> : null}
    {correction ? <CorrectionDialog m={m} onClose={() => setCorrection(false)} /> : null}
  </>;
}

function CorrectionDialog({ m, onClose }: { m: MarkSubmissionDetail; onClose: () => void }) {
  const { api } = useApp(); const [reason, setReason] = React.useState(""); const [flags, setFlags] = React.useState<Record<string, string>>({}); const [err, setErr] = React.useState<string>();
  const send = useAction(() => api.post(`/mark-submissions/${m.id}/request-correction`, { reason, items: Object.entries(flags).map(([studentId, note]) => ({ studentId, note })) }).catch((e) => { setErr(e.message); throw e; }), { invalidate: ["/mark-submissions"], success: "Correction requested", onSuccess: onClose });
  return <Modal wide title="Request correction" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={send.isPending} disabled={!reason.trim()} onClick={() => send.mutate(undefined)}>Send to teacher</Button></>}>
    <div className="stack">{err ? <div className="banner bad" role="alert">{err}</div> : null}<Field label="Reason (required)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <div><h3>Flag specific students (optional)</h3><div className="table-wrap" style={{ maxHeight: 260 }}><table className="t"><tbody>{m.entries.map((e) => <tr key={e.studentId}><td style={{ width: 30 }}><input type="checkbox" aria-label={`Flag ${e.fullName}`} checked={e.studentId in flags} onChange={(ev) => { const n = { ...flags }; if (ev.target.checked) n[e.studentId] = ""; else delete n[e.studentId]; setFlags(n); }} /></td><td>{e.rollNo}. {e.fullName}</td><td className="r num">{e.absent ? "Absent" : e.marksObtained}</td><td>{e.studentId in flags ? <input className="input" placeholder="Note" value={flags[e.studentId]} onChange={(ev) => setFlags({ ...flags, [e.studentId]: ev.target.value })} aria-label={`Note for ${e.fullName}`} /> : null}</td></tr>)}</tbody></table></div></div></div></Modal>;
}
void Select;
