import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { can } from "@shikkhaos/permissions";
import type { Exam, ExamPaper, SchoolClass, Subject } from "@shikkhaos/types";
import { ApiError } from "@shikkhaos/api-client";
import { useApp, useAction, useGet, useList, useSession } from "../context";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Table, fmtDate, useToast } from "../ui";

export function Exams() {
  const s = useSession(); const navigate = useNavigate(); const q = useList<Exam>("/exams", undefined, { max: 200 }); const [open, setOpen] = React.useState(false);
  return <>
    <PageHeader title="Exams" sub="Create exams, set papers and authorize marks entry" actions={can(s, "exams.create") ? <Button variant="primary" onClick={() => setOpen(true)}>New exam</Button> : null} />
    <div className="card">{q.isLoading ? <div style={{ padding: 16 }}><Skeleton rows={5} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> :
      <Table rows={q.data!} rowKey={(r) => r.id} onRow={(r) => navigate(`/exams/${r.id}`)} empty={<Empty title="No exams yet">Create the first exam, then add papers for each class and subject.</Empty>}
        columns={[{ key: "n", header: "Exam", render: (r) => <strong>{r.name}</strong> }, { key: "t", header: "Type", render: (r) => r.type.replace("_", " ") }, { key: "d", header: "Window", render: (r) => `${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}` }, { key: "s", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />}</div>
    {open ? <NewExam onClose={() => setOpen(false)} /> : null}
  </>;
}

function NewExam({ onClose }: { onClose: () => void }) {
  const { api } = useApp(); const navigate = useNavigate(); const [f, setF] = React.useState({ name: "", type: "MID_TERM", startDate: "", endDate: "" }); const [errs, setErrs] = React.useState<Record<string, string>>({});
  const create = useAction(async () => { setErrs({}); try { return await api.post<Exam>("/exams", f); } catch (e) { if (e instanceof ApiError) setErrs(Object.fromEntries(e.fieldErrors.map((x) => [x.field, x.message]))); throw e; } }, { invalidate: ["/exams"], onSuccess: (e) => { onClose(); navigate(`/exams/${e.id}`); } });
  return <Modal title="New exam" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={create.isPending} onClick={() => create.mutate(undefined)}>Create</Button></>}>
    <div className="form-grid"><Field label="Name" error={errs.name} full><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Half Yearly 2026" /></Field>
      <Field label="Type" error={errs.type}><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{["TERM", "MID_TERM", "FINAL", "MODEL", "OTHER"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</Select></Field><span />
      <Field label="Start date" error={errs.startDate}><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field><Field label="End date" error={errs.endDate}><Input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></Field></div></Modal>;
}

interface Cell { paperId: string; subjectName: string; className: string; sectionId: string; sectionName: string; submissionId: string | null; status: string | null; teacherName: string | null }

export function ExamDetail() {
  const { id } = useParams(); const s = useSession(); const { api } = useApp(); const toast = useToast();
  const exam = useGet<Exam>(`/exams/${id}`); const papers = useList<ExamPaper>("/exam-papers", { examId: id }); const classes = useList<SchoolClass>("/classes"); const subjects = useList<Subject>("/subjects");
  const progress = useGet<{ cells: Cell[]; totals: { status: string; count: number }[] }>(can(s, "exams.create") || can(s, "marks.review") || can(s, "exams.authorize") ? `/exams/${id}/progress` : null);
  const [adding, setAdding] = React.useState(false); const [confirm, setConfirm] = React.useState<"authorize" | "close" | null>(null);
  const authorize = useAction(() => api.post<{ submissionsCreated: number; missingAssignments: unknown[] }>(`/exams/${id}/authorize`), { invalidate: ["/exams", "/mark-submissions"], onSuccess: (r) => toast(`Authorized — ${r.submissionsCreated} submission${r.submissionsCreated === 1 ? "" : "s"} opened${r.missingAssignments.length ? `; ${r.missingAssignments.length} section(s) have no assigned teacher` : ""}`) });
  const close = useAction(() => api.post(`/exams/${id}/close`), { invalidate: ["/exams"], success: "Exam closed" });
  const toggleReg = useAction((v: boolean) => api.patch(`/exams/${id}`, { registrarMayPublish: v }, { ifMatch: exam.data!.version }), { invalidate: ["/exams"], success: "Updated" });
  if (exam.isLoading) return <Skeleton rows={6} />; if (exam.error) return <ErrorState error={exam.error} />;
  const e = exam.data!; const cn = (cid: string) => classes.data?.find((c) => c.id === cid)?.name ?? ""; const sn = (sid: string) => subjects.data?.find((x) => x.id === sid)?.name ?? "";
  return <>
    <PageHeader title={e.name} sub={`${e.type.replace("_", " ")} · ${fmtDate(e.startDate)} – ${fmtDate(e.endDate)}`} actions={<><Link className="btn" to="/exams">Back</Link>{can(s, "exams.authorize") && e.status === "DRAFT" ? <Button variant="primary" onClick={() => setConfirm("authorize")} disabled={!papers.data?.length}>Authorize exam</Button> : null}{can(s, "exams.authorize") && (e.status === "AUTHORIZED" || e.status === "IN_PROGRESS") ? <Button onClick={() => setConfirm("close")}>Close exam</Button> : null}</>} />
    <div className="stack">
      <div className="row"><StatusBadge status={e.status} />{e.status === "DRAFT" ? <span className="muted">Only the Headmaster can authorize. Teachers can enter marks after authorization.</span> : null}</div>
      {can(s, "exams.authorize") ? <label className="row"><input type="checkbox" checked={e.registrarMayPublish} onChange={(ev) => toggleReg.mutate(ev.target.checked)} /> Allow the Register to publish this exam's results (also requires the school-wide delegation setting)</label> : null}
      <Card title="Papers" actions={can(s, "exams.create") && e.status === "DRAFT" ? <Button size="sm" variant="primary" onClick={() => setAdding(true)}>Add paper</Button> : null}>
        {papers.isLoading ? <Skeleton /> : <Table rows={papers.data ?? []} rowKey={(p) => p.id} empty={<Empty title="No papers yet">Add a paper for each class and subject.</Empty>} columns={[{ key: "c", header: "Class", render: (p) => cn(p.classId) }, { key: "s", header: "Subject", render: (p) => sn(p.subjectId) }, { key: "f", header: "Full marks", align: "r", render: (p) => p.fullMarks }, { key: "p", header: "Pass marks", align: "r", render: (p) => p.passMarks }, { key: "d", header: "Date", render: (p) => fmtDate(p.examDate) }]} />}</Card>
      {progress.data ? <Card title="Marks progress">
        <div className="row" style={{ marginBottom: 8 }}>{progress.data.totals.map((x) => <span key={x.status}><StatusBadge status={x.status} /> <strong>{x.count}</strong></span>)}</div>
        <Table rows={progress.data.cells} rowKey={(c) => `${c.paperId}-${c.sectionId}`} empty={<Empty title="No papers" />} columns={[{ key: "p", header: "Paper", render: (c) => `${c.subjectName} · ${c.className}-${c.sectionName}` }, { key: "t", header: "Teacher", render: (c) => c.teacherName ?? <Badge tone="warn">No teacher assigned</Badge> }, { key: "s", header: "Status", render: (c) => <StatusBadge status={c.status ?? "NOT_STARTED"} /> }]} /></Card> : null}
    </div>
    {adding ? <AddPaper examId={e.id} onClose={() => setAdding(false)} /> : null}
    {confirm === "authorize" ? <ConfirmDialog title="Authorize exam" message="Authorizing opens marks entry for the assigned teachers and locks the list of papers." confirmLabel="Authorize" onConfirm={() => authorize.mutateAsync(undefined).then(() => undefined)} onClose={() => setConfirm(null)} /> : null}
    {confirm === "close" ? <ConfirmDialog title="Close exam" danger message="No further marks can be entered once the exam is closed." confirmLabel="Close exam" onConfirm={() => close.mutateAsync(undefined).then(() => undefined)} onClose={() => setConfirm(null)} /> : null}
  </>;
}

function AddPaper({ examId, onClose }: { examId: string; onClose: () => void }) {
  const { api } = useApp(); const classes = useList<SchoolClass>("/classes"); const subjects = useList<Subject>("/subjects");
  const [f, setF] = React.useState({ classId: "", subjectId: "", fullMarks: "", passMarks: "", examDate: "" }); const [errs, setErrs] = React.useState<Record<string, string>>({});
  const add = useAction(async () => { setErrs({}); try { return await api.post("/exam-papers", { examId, classId: f.classId, subjectId: f.subjectId, ...(f.fullMarks ? { fullMarks: Number(f.fullMarks) } : {}), ...(f.passMarks ? { passMarks: Number(f.passMarks) } : {}), ...(f.examDate ? { examDate: f.examDate } : {}) }); } catch (e) { if (e instanceof ApiError) setErrs(Object.fromEntries(e.fieldErrors.map((x) => [x.field, x.message]))); throw e; } }, { invalidate: ["/exam-papers", "/exams"], success: "Paper added", onSuccess: onClose });
  return <Modal title="Add paper" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={add.isPending} disabled={!f.classId || !f.subjectId} onClick={() => add.mutate(undefined)}>Add</Button></>}>
    <div className="form-grid"><Field label="Class"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}><option value="">Choose…</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field label="Subject"><Select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">Choose…</option>{subjects.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
      <Field label="Full marks" error={errs.fullMarks} hint="Defaults from class subject setup"><Input type="number" value={f.fullMarks} onChange={(e) => setF({ ...f, fullMarks: e.target.value })} /></Field><Field label="Pass marks" error={errs.passMarks}><Input type="number" value={f.passMarks} onChange={(e) => setF({ ...f, passMarks: e.target.value })} /></Field>
      <Field label="Paper date" error={errs.examDate}><Input type="date" value={f.examDate} onChange={(e) => setF({ ...f, examDate: e.target.value })} /></Field></div></Modal>;
}
