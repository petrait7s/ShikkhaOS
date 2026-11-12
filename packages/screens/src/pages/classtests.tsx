import * as React from "react";
import type { Section, SchoolClass, Subject, TeacherAssignment } from "@shikkhaos/types";
import { checkMarks } from "@shikkhaos/validation";
import { useApp, useAction, useGet, useList } from "../context";
import { Badge, Button, Card, ConfirmDialog, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Table, todayIso, fmtDate } from "../ui";

interface CT { id: string; teacherAssignmentId: string; title: string; testDate: string; fullMarks: number; status: "DRAFT" | "SHARED"; classId: string; sectionId: string; subjectId: string | null; marks?: { studentId: string; fullName: string; rollNo: number; marks: number | null; absent: boolean }[] }

export function ClassTests() {
  const q = useList<CT>("/class-tests"); const [creating, setCreating] = React.useState(false); const [open, setOpen] = React.useState<string | null>(null);
  return <>
    <PageHeader title="Class tests" sub="Internal tests you share with your class group" actions={<Button variant="primary" onClick={() => setCreating(true)}>New class test</Button>} />
    <div className="banner info" style={{ marginBottom: 12 }}>Class tests are separate from official exam results. Sharing marks here never changes the official result sheets or report cards.</div>
    <div className="card">{q.isLoading ? <div style={{ padding: 16 }}><Skeleton /></div> : q.error ? <ErrorState error={q.error} /> :
      <Table rows={q.data!} rowKey={(r) => r.id} onRow={(r) => setOpen(r.id)} empty={<Empty title="No class tests yet" />} columns={[{ key: "t", header: "Title", render: (r) => <strong>{r.title}</strong> }, { key: "d", header: "Date", render: (r) => fmtDate(r.testDate) }, { key: "f", header: "Full marks", align: "r", render: (r) => r.fullMarks }, { key: "s", header: "", render: (r) => (r.status === "SHARED" ? <Badge tone="ok">Shared</Badge> : <StatusBadge status="DRAFT" />) }]} />}</div>
    {creating ? <NewTest onClose={() => setCreating(false)} onCreated={(id) => setOpen(id)} /> : null}{open ? <TestEditor id={open} onClose={() => setOpen(null)} /> : null}</>;
}

function NewTest({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { api } = useApp(); const a = useList<TeacherAssignment>("/teacher-assignments"); const classes = useList<SchoolClass>("/classes"); const sections = useList<Section>("/sections"); const subjects = useList<Subject>("/subjects");
  const [f, setF] = React.useState({ teacherAssignmentId: "", title: "", date: todayIso(), fullMarks: "20" }); const [err, setErr] = React.useState<string>();
  const label = (x: TeacherAssignment) => `${classes.data?.find((c) => c.id === x.classId)?.name}-${sections.data?.find((c) => c.id === x.sectionId)?.name} · ${subjects.data?.find((c) => c.id === x.subjectId)?.name ?? "Class teacher"}`;
  const go = useAction(() => api.post<CT>("/class-tests", { teacherAssignmentId: f.teacherAssignmentId, title: f.title, date: f.date, fullMarks: Number(f.fullMarks) }).catch((e) => { setErr(e.message); throw e; }), { invalidate: ["/class-tests"], onSuccess: (r) => { onClose(); onCreated(r.id); } });
  return <Modal title="New class test" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={go.isPending} disabled={!f.teacherAssignmentId || !f.title} onClick={() => go.mutate(undefined)}>Create</Button></>}>
    <div className="form-grid">{err ? <div className="banner bad full">{err}</div> : null}<Field label="Class & subject" full><Select value={f.teacherAssignmentId} onChange={(e) => setF({ ...f, teacherAssignmentId: e.target.value })}><option value="">Choose…</option>{a.data?.map((x) => <option key={x.id} value={x.id}>{label(x)}</option>)}</Select></Field>
      <Field label="Title" full><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field><Field label="Full marks"><Input type="number" value={f.fullMarks} onChange={(e) => setF({ ...f, fullMarks: e.target.value })} /></Field></div></Modal>;
}

function TestEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { api } = useApp(); const q = useGet<CT>(`/class-tests/${id}`); const [m, setM] = React.useState<Record<string, { v: string; abs: boolean }>>({}); const [share, setShare] = React.useState(false);
  React.useEffect(() => { if (q.data?.marks) setM(Object.fromEntries(q.data.marks.map((x) => [x.studentId, { v: x.marks === null ? "" : String(x.marks), abs: x.absent }]))); }, [q.data]);
  const save = useAction(() => api.put(`/class-tests/${id}/marks`, { marks: Object.entries(m).filter(([, x]) => x.abs || x.v !== "").map(([studentId, x]) => ({ studentId, marks: x.abs ? null : Number(x.v), absent: x.abs })) }), { invalidate: ["/class-tests"], success: "Marks saved" });
  const doShare = useAction(() => api.post(`/class-tests/${id}/share`), { invalidate: ["/class-tests", "/conversations"], success: "Shared with the class group", onSuccess: onClose });
  const t = q.data; const locked = t?.status === "SHARED";
  const invalid = t ? Object.values(m).some((x) => !checkMarks(x.v, t.fullMarks, x.abs).ok) : false;
  return <Modal wide title={t ? `${t.title} (/${t.fullMarks})` : "Class test"} onClose={onClose} footer={t ? <>{locked ? <Badge tone="ok">Shared — locked</Badge> : <><Button busy={save.isPending} disabled={invalid} onClick={() => save.mutate(undefined)}>Save marks</Button><Button variant="primary" disabled={invalid} onClick={() => setShare(true)}>Share with class</Button></>}</> : null}>
    {q.isLoading ? <Skeleton rows={6} /> : q.error ? <ErrorState error={q.error} /> : <div className="table-wrap marks-grid"><table className="t"><thead><tr><th>Roll</th><th>Student</th><th className="r">Marks</th><th>Absent</th></tr></thead><tbody>{t!.marks!.map((x) => { const s = m[x.studentId] ?? { v: "", abs: false }; const c = checkMarks(s.v, t!.fullMarks, s.abs); return <tr key={x.studentId}><td>{x.rollNo}</td><td>{x.fullName}</td><td className="r"><Input type="text" inputMode="decimal" disabled={locked || s.abs} className={c.ok ? "" : "bad"} value={s.v} aria-label={`Marks for ${x.fullName}`} onChange={(e) => setM({ ...m, [x.studentId]: { ...s, v: e.target.value } })} />{c.ok ? null : <div style={{ color: "var(--bad)", fontSize: 12 }}>{c.message}</div>}</td><td><input type="checkbox" disabled={locked} checked={s.abs} aria-label={`${x.fullName} absent`} onChange={(e) => setM({ ...m, [x.studentId]: { v: e.target.checked ? "" : s.v, abs: e.target.checked } })} /></td></tr>; })}</tbody></table></div>}
    {share ? <ConfirmDialog title="Share class test" message="Marks are posted to the class group and students are notified. After sharing, marks are locked." confirmLabel="Share" onConfirm={async () => { await save.mutateAsync(undefined); await doShare.mutateAsync(undefined); }} onClose={() => setShare(false)} /> : null}</Modal>;
}
