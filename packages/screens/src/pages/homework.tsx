import * as React from "react";
import type { Homework as HW, Section, SchoolClass, Subject, TeacherAssignment } from "@shikkhaos/types";
import { useApp, useAction, useGet, useList, usePagedList } from "../context";
import { t } from "../i18n";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Table, Textarea, fmtDateTime } from "../ui";

export function Homework() {
  const q = useList<HW>("/homework"); const [creating, setCreating] = React.useState(false); const [open, setOpen] = React.useState<HW | null>(null);
  return <>
    <PageHeader title="Homework" sub="Assign, collect and grade" actions={<Button variant="primary" onClick={() => setCreating(true)}>New homework</Button>} />
    <div className="card">{q.isLoading ? <div style={{ padding: 16 }}><Skeleton /></div> : q.error ? <ErrorState error={q.error} /> :
      <Table rows={q.data!} rowKey={(r) => r.id} onRow={setOpen} empty={<Empty title="No homework yet" />} columns={[{ key: "t", header: "Title", render: (r) => <strong>{r.title}</strong> }, { key: "s", header: "Subject", render: (r) => r.subjectName ?? "—" }, { key: "d", header: "Due", render: (r) => fmtDateTime(r.dueAt) }, { key: "st", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />}</div>
    {creating ? <NewHw onClose={() => setCreating(false)} /> : null}{open ? <HwDetail hw={open} onClose={() => setOpen(null)} /> : null}</>;
}

function NewHw({ onClose }: { onClose: () => void }) {
  const { api } = useApp(); const a = useList<TeacherAssignment>("/teacher-assignments"); const classes = useList<SchoolClass>("/classes"); const sections = useList<Section>("/sections"); const subjects = useList<Subject>("/subjects");
  const [f, setF] = React.useState({ teacherAssignmentId: "", title: "", description: "", dueAt: "" }); const [err, setErr] = React.useState<string>();
  const label = (x: TeacherAssignment) => `${classes.data?.find((c) => c.id === x.classId)?.name}-${sections.data?.find((c) => c.id === x.sectionId)?.name} · ${subjects.data?.find((c) => c.id === x.subjectId)?.name ?? "Class teacher"}`;
  const go = useAction(() => api.post("/homework", { teacherAssignmentId: f.teacherAssignmentId, title: f.title, description: f.description, dueAt: new Date(f.dueAt).toISOString() }).catch((e) => { setErr(e.message); throw e; }), { invalidate: ["/homework"], success: "Saved as draft", onSuccess: onClose });
  return <Modal title="New homework" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={go.isPending} disabled={!f.teacherAssignmentId || !f.title || !f.dueAt} onClick={() => go.mutate(undefined)}>Save draft</Button></>}>
    <div className="form-grid">{err ? <div className="banner bad full">{err}</div> : null}<Field label="Class & subject" full><Select value={f.teacherAssignmentId} onChange={(e) => setF({ ...f, teacherAssignmentId: e.target.value })}><option value="">Choose…</option>{a.data?.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></Field>
      <Field label="Title" full><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Instructions" full><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field><Field label="Due"><Input type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field></div></Modal>;
}

interface SubRow { studentId: string; fullName: string; rollNo: number; submissionId: string | null; text: string | null; submittedAt: string | null; late: boolean | null; grade: string | null; feedback: string | null; version: number | null; submitted: boolean }

function HwDetail({ hw, onClose }: { hw: HW; onClose: () => void }) {
  const { api } = useApp(); const subs = useList<SubRow>(`/homework/${hw.id}/submissions`, undefined, { enabled: hw.status !== "DRAFT" }); const [g, setG] = React.useState<Record<string, { grade: string; feedback: string }>>({});
  const publish = useAction(() => api.post(`/homework/${hw.id}/publish`), { invalidate: ["/homework"], success: "Published — students notified", onSuccess: onClose });
  const close = useAction(() => api.patch(`/homework/${hw.id}`, { status: "CLOSED" }), { invalidate: ["/homework"], success: "Closed", onSuccess: onClose });
  const grade = useAction((r: SubRow) => api.patch(`/homework-submissions/${r.submissionId}`, { grade: g[r.studentId]?.grade, feedback: g[r.studentId]?.feedback }, { ifMatch: r.version ?? undefined }), { invalidate: ["/homework"], success: "Graded" });
  return <Modal wide title={hw.title} onClose={onClose} footer={<>{hw.status === "DRAFT" ? <Button variant="primary" busy={publish.isPending} onClick={() => publish.mutate(undefined)}>Publish to students</Button> : null}{hw.status === "PUBLISHED" ? <Button onClick={() => close.mutate(undefined)}>Close submissions</Button> : null}</>}>
    <div className="stack"><div className="muted">{hw.description || "No instructions."}</div><div>Due {fmtDateTime(hw.dueAt)}</div>
      {hw.status === "DRAFT" ? <div className="banner info">Draft — students cannot see this yet.</div> : subs.isLoading ? <Skeleton /> : subs.error ? <ErrorState error={subs.error} /> :
        <Table rows={subs.data!} rowKey={(r) => r.studentId} columns={[{ key: "r", header: "Roll", render: (r) => r.rollNo, width: 56 }, { key: "n", header: "Student", render: (r) => r.fullName }, { key: "s", header: "Submission", render: (r) => (r.submitted ? <div>{r.text ? r.text.slice(0, 80) : "File"} {r.late ? <Badge tone="warn">Late</Badge> : null}</div> : <span className="faint">Not submitted</span>) },
          { key: "g", header: "Grade / feedback", render: (r) => r.submitted ? (r.grade ? <span><strong>{r.grade}</strong> {r.feedback}</span> : <div className="row"><Input aria-label={`Grade for ${r.fullName}`} placeholder="Grade" style={{ width: 80 }} value={g[r.studentId]?.grade ?? ""} onChange={(e) => setG({ ...g, [r.studentId]: { grade: e.target.value, feedback: g[r.studentId]?.feedback ?? "" } })} /><Input aria-label={`Feedback for ${r.fullName}`} placeholder="Feedback" value={g[r.studentId]?.feedback ?? ""} onChange={(e) => setG({ ...g, [r.studentId]: { grade: g[r.studentId]?.grade ?? "", feedback: e.target.value } })} /><Button size="sm" disabled={!g[r.studentId]?.grade} onClick={() => grade.mutate(r)}>Save</Button></div>) : null }]} />}</div></Modal>;
}

export function MyHomework() {
  const { api } = useApp(); const q = usePagedList<HW>("/homework"); const [open, setOpen] = React.useState<HW | null>(null);
  void api;
  return <>
    <PageHeader title={t("Homework")} sub={t("Your assignments")} />
    <div className="card">{q.isLoading && !q.rows.length ? <div style={{ padding: 16 }}><Skeleton /></div> : q.error ? <ErrorState error={q.error} /> :
      <Table rows={q.rows} rowKey={(r) => r.id} onRow={setOpen} empty={<Empty title={t("No homework")}>{t("You're all caught up.")}</Empty>} columns={[{ key: "t", header: "Title", render: (r) => <strong>{r.title}</strong> }, { key: "s", header: "Subject", render: (r) => r.subjectName ?? "—" }, { key: "d", header: "Due", render: (r) => fmtDateTime(r.dueAt) }, { key: "m", header: "Status", render: (r) => r.mySubmission ? (r.mySubmission.grade ? <Badge tone="ok">Graded {r.mySubmission.grade}</Badge> : <Badge tone="info">{t("Submitted")}</Badge>) : new Date(r.dueAt) < new Date() ? <Badge tone="bad">{t("Overdue")}</Badge> : <Badge tone="warn">{t("To do")}</Badge> }]} />}</div>
    {open ? <SubmitHw hw={open} onClose={() => setOpen(null)} /> : null}</>;
}

function SubmitHw({ hw, onClose }: { hw: HW; onClose: () => void }) {
  const { api } = useApp(); const q = useGet<HW & { mySubmission: { text: string | null; grade: string | null; feedback: string | null } | null }>(`/homework/${hw.id}`); const [text, setText] = React.useState(""); const [files, setFiles] = React.useState<string[]>([]); const [up, setUp] = React.useState(false); const [err, setErr] = React.useState<string>();
  React.useEffect(() => { if (q.data?.mySubmission?.text) setText(q.data.mySubmission.text); }, [q.data]);
  const send = useAction(() => api.post(`/homework/${hw.id}/submissions`, { text, fileIds: files }).catch((e) => { setErr(e.message); throw e; }), { invalidate: ["/homework"], success: "Submitted", onSuccess: onClose });
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; setUp(true); setErr(undefined); try { const r = await api.upload({ name: f.name, type: f.type || "application/octet-stream", size: f.size, data: f }, "HOMEWORK"); setFiles((x) => [...x, r.id]); } catch (ex) { setErr((ex as Error).message); } finally { setUp(false); e.target.value = ""; } };
  const graded = !!q.data?.mySubmission?.grade;
  return <Modal title={hw.title} onClose={onClose} footer={graded ? null : <><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={send.isPending} disabled={!text.trim() && !files.length} onClick={() => send.mutate(undefined)}>{q.data?.mySubmission ? t("Resubmit") : t("Submit")}</Button></>}>
    <div className="stack">{err ? <div className="banner bad" role="alert">{err}</div> : null}<div className="muted">{hw.description}</div><div>Due {fmtDateTime(hw.dueAt)}</div>
      {graded ? <div className="banner info">Graded <strong>{q.data!.mySubmission!.grade}</strong>. {q.data!.mySubmission!.feedback}</div> : <>
        <Field label={t("Your answer")}><Textarea value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <Field label="Attach a file or photo" hint={up ? "Uploading…" : files.length ? `${files.length} attached` : "PDF, image or document up to 15 MB"}><input type="file" accept="image/*,.pdf,.docx,.xlsx,.txt" onChange={(e) => void pick(e)} /></Field></>}</div></Modal>;
}
void Card;
