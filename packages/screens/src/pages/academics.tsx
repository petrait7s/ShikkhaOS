import * as React from "react";
import { can } from "@shikkhaos/permissions";
import type { SchoolClass, Section, Session, Subject, Teacher, TeacherAssignment } from "@shikkhaos/types";
import { ApiError } from "@shikkhaos/api-client";
import { useApp, useAction, useList, useSession } from "../context";
import { Badge, Button, Card, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Table, Tabs, useToast } from "../ui";

type Tab = "sessions" | "classes" | "sections" | "subjects" | "assignments";

export function Academics() {
  const [tab, setTab] = React.useState<Tab>("classes");
  return <>
    <PageHeader title="Academics" sub="Sessions, classes, subjects and teacher assignments" />
    <Tabs value={tab} onChange={setTab} tabs={[{ id: "sessions", label: "Sessions" }, { id: "classes", label: "Classes" }, { id: "sections", label: "Sections" }, { id: "subjects", label: "Subjects" }, { id: "assignments", label: "Teacher assignments" }]} />
    {tab === "sessions" ? <Sessions /> : tab === "classes" ? <Classes /> : tab === "sections" ? <Sections /> : tab === "subjects" ? <Subjects /> : <Assignments />}
  </>;
}

function useCreate(path: string, invalidate: string[], onDone: () => void) {
  const { api } = useApp(); const [errs, setErrs] = React.useState<Record<string, string>>({});
  const m = useAction(async (body: unknown) => { setErrs({}); try { return await api.post(path, body); } catch (e) { if (e instanceof ApiError) setErrs(Object.fromEntries(e.fieldErrors.map((f) => [f.field, f.message]))); throw e; } }, { invalidate, success: "Saved", onSuccess: onDone });
  return { m, errs };
}

function Sessions() {
  const s = useSession(); const { api } = useApp(); const q = useList<Session>("/academic-sessions"); const [open, setOpen] = React.useState(false);
  const setCur = useAction((id: string) => api.post(`/academic-sessions/${id}/set-current`), { invalidate: ["/academic-sessions", "/sections"], success: "Current session changed" });
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  return <Card title="Academic sessions" actions={can(s, "academic.sessions.manage") ? <Button variant="primary" size="sm" onClick={() => setOpen(true)}>New session</Button> : null}>
    <Table rows={q.data!} rowKey={(r) => r.id} columns={[{ key: "n", header: "Session", render: (r) => <strong>{r.name}</strong> }, { key: "d", header: "Dates", render: (r) => `${r.startDate} → ${r.endDate}` }, { key: "c", header: "", render: (r) => r.isCurrent ? <Badge tone="ok">Current</Badge> : can(s, "academic.sessions.manage") ? <Button size="sm" onClick={() => setCur.mutate(r.id)}>Make current</Button> : null }]} />
    {open ? <SimpleForm title="New session" path="/academic-sessions" invalidate={["/academic-sessions"]} onClose={() => setOpen(false)} fields={[["name", "Name", "text", "2027"], ["startDate", "Start date", "date"], ["endDate", "End date", "date"]]} /> : null}</Card>;
}

function SimpleForm({ title, path, invalidate, onClose, fields, extra }: { title: string; path: string; invalidate: string[]; onClose: () => void; fields: [string, string, "text" | "number" | "date", string?][]; extra?: Record<string, unknown> }) {
  const [v, setV] = React.useState<Record<string, string>>({}); const { m, errs } = useCreate(path, invalidate, onClose);
  const submit = () => m.mutate({ ...Object.fromEntries(fields.map(([k, , t]) => [k, t === "number" ? (v[k] === undefined || v[k] === "" ? undefined : Number(v[k])) : v[k] ?? ""])), ...extra });
  return <Modal title={title} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={m.isPending} onClick={submit}>Save</Button></>}>
    <div className="form-grid">{fields.map(([k, l, t, ph]) => <Field key={k} label={l} error={errs[k]}><Input type={t} placeholder={ph} value={v[k] ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}</div></Modal>;
}

function Classes() {
  const s = useSession(); const q = useList<SchoolClass>("/classes"); const [open, setOpen] = React.useState(false);
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  return <Card title="Classes" actions={can(s, "academic.classes.manage") ? <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Add class</Button> : null}>
    <Table rows={q.data!} rowKey={(r) => r.id} columns={[{ key: "n", header: "Class", render: (r) => <strong>{r.name}</strong> }, { key: "l", header: "Level", render: (r) => r.level }, { key: "o", header: "Order", render: (r) => r.order }]} />
    {open ? <SimpleForm title="Add class" path="/classes" invalidate={["/classes"]} onClose={() => setOpen(false)} fields={[["name", "Name", "text", "Class 7"], ["level", "Level", "number"], ["order", "Display order", "number"]]} /> : null}</Card>;
}

function Sections() {
  const s = useSession(); const q = useList<Section>("/sections"); const classes = useList<SchoolClass>("/classes"); const [open, setOpen] = React.useState(false); const [classId, setClassId] = React.useState("");
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  const cname = (id: string) => classes.data?.find((c) => c.id === id)?.name ?? "";
  return <Card title="Sections" actions={can(s, "academic.sections.manage") ? <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Add section</Button> : null}>
    <Table rows={q.data!} rowKey={(r) => r.id} columns={[{ key: "c", header: "Class", render: (r) => cname(r.classId) }, { key: "n", header: "Section", render: (r) => <strong>{r.name}</strong> }, { key: "s", header: "Students", align: "r", render: (r) => `${r.studentCount} / ${r.capacity}` }]} />
    {open ? <div><Modal title="Add section" onClose={() => setOpen(false)} footer={null}><div className="stack"><Field label="Class"><Select value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">Choose…</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>{classId ? <SectionFormInline classId={classId} onClose={() => setOpen(false)} /> : null}</div></Modal></div> : null}</Card>;
}
function SectionFormInline({ classId, onClose }: { classId: string; onClose: () => void }) {
  const [name, setName] = React.useState(""); const [cap, setCap] = React.useState("40"); const { m, errs } = useCreate("/sections", ["/sections"], onClose);
  return <div className="stack"><Field label="Name" error={errs.name}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="A" /></Field><Field label="Capacity" error={errs.capacity}><Input type="number" value={cap} onChange={(e) => setCap(e.target.value)} /></Field><Button variant="primary" busy={m.isPending} onClick={() => m.mutate({ classId, name, capacity: Number(cap) })}>Save</Button></div>;
}

function Subjects() {
  const s = useSession(); const q = useList<Subject>("/subjects"); const [open, setOpen] = React.useState(false);
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  return <Card title="Subjects" actions={can(s, "academic.subjects.manage") ? <Button variant="primary" size="sm" onClick={() => setOpen(true)}>Add subject</Button> : null}>
    <Table rows={q.data!} rowKey={(r) => r.id} columns={[{ key: "c", header: "Code", render: (r) => <span className="mono">{r.code}</span> }, { key: "n", header: "Subject", render: (r) => <strong>{r.name}</strong> }, { key: "o", header: "Type", render: (r) => (r.isOptional ? <Badge>Optional</Badge> : "Compulsory") }, { key: "f", header: "Default marks", align: "r", render: (r) => r.fullMarksDefault }]} />
    {open ? <SimpleForm title="Add subject" path="/subjects" invalidate={["/subjects"]} onClose={() => setOpen(false)} fields={[["code", "Code", "text", "SCI"], ["name", "Name", "text", "Science"]]} /> : null}</Card>;
}

function Assignments() {
  const s = useSession(); const toast = useToast(); const { api } = useApp();
  const q = useList<TeacherAssignment>("/teacher-assignments"); const teachers = useList<Teacher>("/teachers"); const classes = useList<SchoolClass>("/classes"); const sections = useList<Section>("/sections"); const subjects = useList<Subject>("/subjects"); const sessions = useList<Session>("/academic-sessions");
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ teacherId: "", classId: "", sectionId: "", subjectId: "", isClassTeacher: false }); const [err, setErr] = React.useState<string>();
  const cur = sessions.data?.find((x) => x.isCurrent);
  const create = useAction(() => api.post("/teacher-assignments", { teacherId: f.teacherId, sessionId: cur!.id, classId: f.classId, sectionId: f.sectionId, ...(f.subjectId ? { subjectId: f.subjectId } : {}), isClassTeacher: f.isClassTeacher }).catch((e) => { setErr(e.message); throw e; }), { invalidate: ["/teacher-assignments"], onSuccess: () => { toast("Assignment saved"); setOpen(false); } });
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  const t = (id: string) => teachers.data?.find((x) => x.id === id)?.fullName ?? "—"; const c = (id: string) => classes.data?.find((x) => x.id === id)?.name ?? ""; const sec = (id: string) => sections.data?.find((x) => x.id === id)?.name ?? ""; const sub = (id: string | null) => subjects.data?.find((x) => x.id === id)?.name ?? "—";
  return <Card title="Teacher assignments" actions={can(s, "academic.assignments.manage") ? <Button variant="primary" size="sm" onClick={() => setOpen(true)} disabled={!cur}>Assign teacher</Button> : null}>
    <Table rows={q.data!} rowKey={(r) => r.id} columns={[{ key: "t", header: "Teacher", render: (r) => <strong>{t(r.teacherId)}</strong> }, { key: "c", header: "Class", render: (r) => `${c(r.classId)}-${sec(r.sectionId)}` }, { key: "s", header: "Subject", render: (r) => sub(r.subjectId) }, { key: "ct", header: "", render: (r) => (r.isClassTeacher ? <Badge tone="info">Class teacher</Badge> : null) }]} />
    {open ? <Modal title="Assign teacher" onClose={() => setOpen(false)} footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" busy={create.isPending} disabled={!f.teacherId || !f.classId || !f.sectionId} onClick={() => create.mutate(undefined)}>Save</Button></>}>
      <div className="form-grid">{err ? <div className="banner bad full" role="alert">{err}</div> : null}
        <Field label="Teacher"><Select value={f.teacherId} onChange={(e) => setF({ ...f, teacherId: e.target.value })}><option value="">Choose…</option>{teachers.data?.map((x) => <option key={x.id} value={x.id}>{x.fullName}</option>)}</Select></Field>
        <Field label="Subject"><Select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}><option value="">— none (class teacher only) —</option>{subjects.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Class"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value, sectionId: "" })}><option value="">Choose…</option>{classes.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <Field label="Section"><Select value={f.sectionId} onChange={(e) => setF({ ...f, sectionId: e.target.value })} disabled={!f.classId}><option value="">Choose…</option>{sections.data?.filter((x) => x.classId === f.classId).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
        <label className="row full"><input type="checkbox" checked={f.isClassTeacher} onChange={(e) => setF({ ...f, isClassTeacher: e.target.checked })} /> Class teacher for this section</label></div></Modal> : null}</Card>;
}
