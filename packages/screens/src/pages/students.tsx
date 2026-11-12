import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { can } from "@shikkhaos/permissions";
import type { AttendanceSummary, PublishedResult, SchoolClass, Section, Student } from "@shikkhaos/types";
import { ApiError, newId } from "@shikkhaos/api-client";
import { studentCode as studentCodeRule, phoneBd } from "@shikkhaos/validation";
import { useApp, useAction, useDebounced, useGet, useList, usePagedList, useSession } from "../context";
import { Button, Card, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, StatusBadge, Table, Tabs, fmtDate, useToast } from "../ui";

export function Students() {
  const s = useSession(); const navigate = useNavigate();
  const [q, setQ] = React.useState(""); const dq = useDebounced(q);
  const [classId, setClass] = React.useState(""); const [sectionId, setSection] = React.useState(""); const [creating, setCreating] = React.useState(false);
  const classes = useList<SchoolClass>("/classes"); const sections = useList<Section>("/sections", classId ? { classId } : undefined);
  const list = usePagedList<Student>("/students", { q: dq, classId, sectionId });
  return (
    <>
      <PageHeader title="Students" sub="Registry of enrolled students" actions={can(s, "students.create") ? <Button variant="primary" onClick={() => setCreating(true)}>Admit student</Button> : null} />
      <div className="row" style={{ marginBottom: 12 }}>
        <Input placeholder="Search name or ID" aria-label="Search students" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260 }} />
        <Select aria-label="Class" value={classId} onChange={(e) => { setClass(e.target.value); setSection(""); }} style={{ width: 160 }}><option value="">All classes</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select aria-label="Section" value={sectionId} onChange={(e) => setSection(e.target.value)} style={{ width: 130 }} disabled={!classId}><option value="">All sections</option>{sections.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
      </div>
      <div className="card">{list.isLoading && !list.rows.length ? <div style={{ padding: 16 }}><Skeleton rows={6} /></div> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> :
        <Table rows={list.rows} rowKey={(r) => r.id} onRow={(r) => navigate(`/students/${r.id}`)} empty={<Empty title="No students found">{dq || classId ? "Try changing the filters." : "No students are enrolled yet."}</Empty>}
          columns={[{ key: "roll", header: "Roll", render: (r) => r.currentRollNo ?? "—", width: 60 }, { key: "name", header: "Name", render: (r) => <strong>{r.fullName}</strong> }, { key: "code", header: "Student ID", render: (r) => <span className="mono">{r.studentCode}</span> }, { key: "cls", header: "Class", render: (r) => r.className ? `${r.className}-${r.sectionName}` : "—" }, { key: "st", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} />}
        {list.hasMore ? <div style={{ padding: 12, textAlign: "center" }}><Button onClick={list.loadMore}>Load more</Button></div> : null}</div>
      {creating ? <AdmitStudent onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function AdmitStudent({ onClose }: { onClose: () => void }) {
  const { api } = useApp(); const toast = useToast();
  const [f, setF] = React.useState({ studentCode: "", fullName: "", dob: "", gender: "MALE", guardianName: "", guardianPhone: "", address: "", classId: "", sectionId: "", rollNo: "" });
  const [errs, setErrs] = React.useState<Record<string, string>>({}); const [temp, setTemp] = React.useState<string>();
  const classes = useList<SchoolClass>("/classes"); const sections = useList<Section>("/sections", f.classId ? { classId: f.classId } : undefined, { enabled: !!f.classId });
  const key = React.useMemo(() => newId(), []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const create = useAction(async () => {
    const e: Record<string, string> = {};
    const c = studentCodeRule.safeParse(f.studentCode); if (!c.success) e.studentCode = c.error.issues[0]!.message;
    if (!f.fullName.trim()) e.fullName = "Required"; if (!f.dob) e.dob = "Required";
    if (f.guardianPhone && !phoneBd.safeParse(f.guardianPhone).success) e.guardianPhone = "Use 01XXXXXXXXX";
    if (Object.keys(e).length) { setErrs(e); throw new Error("Fix the highlighted fields"); }
    setErrs({});
    try {
      return await api.post<{ student: Student; temporaryPassword: string }>("/students", { studentCode: f.studentCode, fullName: f.fullName, dob: f.dob, gender: f.gender, guardianName: f.guardianName, guardianPhone: f.guardianPhone, address: f.address, ...(f.classId && f.sectionId && f.rollNo ? { classId: f.classId, sectionId: f.sectionId, rollNo: Number(f.rollNo) } : {}) }, { idempotencyKey: key });
    } catch (ex) { if (ex instanceof ApiError) setErrs(Object.fromEntries(ex.fieldErrors.map((x) => [x.field, x.message]))); throw ex; }
  }, { invalidate: ["/students"], onSuccess: (r) => { setTemp(r.temporaryPassword); toast("Student admitted"); } });
  if (temp) return <Modal title="Student admitted" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}><div className="stack"><div>Give these sign-in details to the student. The password is shown once and must be changed at first sign-in.</div><div className="card pad" style={{ padding: 12 }}>Username: <strong className="mono">{f.studentCode.toLowerCase()}</strong><br />Temporary password: <strong className="mono">{temp}</strong></div></div></Modal>;
  return (
    <Modal title="Admit student" onClose={onClose} wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={create.isPending} onClick={() => create.mutate(undefined)}>Admit</Button></>}>
      <div className="form-grid">
        <Field label="Student ID" error={errs.studentCode} hint="e.g. S-2026-101"><Input value={f.studentCode} onChange={set("studentCode")} /></Field>
        <Field label="Full name" error={errs.fullName}><Input value={f.fullName} onChange={set("fullName")} /></Field>
        <Field label="Date of birth" error={errs.dob}><Input type="date" value={f.dob} onChange={set("dob")} /></Field>
        <Field label="Gender"><Select value={f.gender} onChange={set("gender")}><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></Select></Field>
        <Field label="Guardian name"><Input value={f.guardianName} onChange={set("guardianName")} /></Field>
        <Field label="Guardian phone" error={errs.guardianPhone}><Input value={f.guardianPhone} onChange={set("guardianPhone")} inputMode="tel" /></Field>
        <Field label="Address" full><Input value={f.address} onChange={set("address")} /></Field>
        <Field label="Class"><Select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value, sectionId: "" })}><option value="">— enrol later —</option>{classes.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Section" error={errs.sectionId}><Select value={f.sectionId} onChange={set("sectionId")} disabled={!f.classId}><option value="">—</option>{sections.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Roll number" error={errs.rollNo}><Input type="number" min={1} value={f.rollNo} onChange={set("rollNo")} /></Field>
      </div>
    </Modal>
  );
}

export function StudentDetail() {
  const { id } = useParams(); const s = useSession(); const [tab, setTab] = React.useState<"profile" | "attendance" | "results" | "history">("profile");
  const q = useGet<Student>(`/students/${id}`);
  if (q.isLoading) return <Skeleton rows={6} />; if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const st = q.data!;
  return (
    <>
      <PageHeader title={st.fullName} sub={`${st.studentCode} · ${st.className ? `${st.className}-${st.sectionName}, roll ${st.currentRollNo}` : "Not enrolled"}`} actions={<Link to="/students" className="btn">Back</Link>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: "profile", label: "Profile" }, { id: "attendance", label: "Attendance" }, { id: "results", label: "Published results" }, { id: "history", label: "Academic history" }]} />
      {tab === "profile" ? <Card><dl className="form-grid" style={{ margin: 0 }}>{([["Status", <StatusBadge status={st.status} />], ["Gender", st.gender], ["Date of birth", st.dob ? fmtDate(st.dob) : "Hidden"], ["Guardian", st.guardianName || "—"], ["Guardian phone", st.guardianPhone || "—"], ["Address", st.address || "—"]] as [string, React.ReactNode][]).map(([k, v]) => <div key={k}><dt className="faint">{k}</dt><dd style={{ margin: 0 }}>{v ?? "—"}</dd></div>)}</dl></Card> : null}
      {tab === "attendance" && can(s, "attendance.read") ? <AttendanceTab id={st.id} /> : tab === "attendance" ? <Empty title="Not available" /> : null}
      {tab === "results" ? <ResultsTab id={st.id} /> : null}
      {tab === "history" ? <HistoryTab id={st.id} /> : null}
    </>
  );
}
function AttendanceTab({ id }: { id: string }) {
  const q = useGet<{ summary: AttendanceSummary; records: { date: string; status: string }[] }>(`/students/${id}/attendance`);
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  const { summary: a, records } = q.data!;
  return <div className="stack"><div className="row"><Badge2 l="Attendance" v={`${a.percentage}%`} /><Badge2 l="Present" v={a.present} /><Badge2 l="Absent" v={a.absent} /><Badge2 l="Late" v={a.late} /></div><Card pad={false}><Table rows={records.slice(0, 60)} rowKey={(r) => r.date + r.status} columns={[{ key: "d", header: "Date", render: (r) => fmtDate(r.date) }, { key: "s", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} empty={<Empty title="No attendance recorded" />} /></Card></div>;
}
const Badge2 = ({ l, v }: { l: string; v: React.ReactNode }) => <div className="card stat" style={{ minWidth: 120 }}><div className="v">{v}</div><div className="l">{l}</div></div>;
function ResultsTab({ id }: { id: string }) {
  const q = useGet<PublishedResult[]>(`/students/${id}/results`);
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  return <div className="stack">{q.data!.length === 0 ? <Empty title="No published results" /> : q.data!.map((r) => <ResultCard key={r.resultSetId} r={r} />)}</div>;
}
export function ResultCard({ r }: { r: PublishedResult }) {
  return <Card title={<>{r.examName} {r.revision > 1 ? <span className="badge warn">Revised (rev {r.revision})</span> : null}</>}>
    <div className="row" style={{ marginBottom: 8 }}><span>GPA <strong className="num">{Number(r.gpa).toFixed(2)}</strong></span><span>Grade <strong>{r.grade}</strong></span><span>Total <strong className="num">{r.totalMarks}</strong></span>{r.position ? <span>Position <strong>{r.position}</strong></span> : null}<span className={`badge ${r.passed ? "ok" : "bad"}`}>{r.passed ? "Passed" : "Not passed"}</span></div>
    <Table rows={r.subjects ?? []} rowKey={(x) => x.subjectId} columns={[{ key: "s", header: "Subject", render: (x) => x.subjectName ?? x.subjectId }, { key: "m", header: "Marks", align: "r", render: (x) => (x.absent ? "Absent" : `${x.marks} / ${x.fullMarks}`) }, { key: "g", header: "Grade", render: (x) => x.grade }, { key: "p", header: "GP", align: "r", render: (x) => Number(x.gradePoint).toFixed(2) }]} /></Card>;
}
function HistoryTab({ id }: { id: string }) {
  const q = useGet<{ enrollments: { id: string; sessionName: string; className: string; sectionName: string; rollNo: number; status: string }[] }>(`/students/${id}/academic-history`);
  if (q.isLoading) return <Skeleton />; if (q.error) return <ErrorState error={q.error} />;
  return <Card pad={false}><Table rows={q.data!.enrollments} rowKey={(r) => r.id} columns={[{ key: "s", header: "Session", render: (r) => r.sessionName }, { key: "c", header: "Class", render: (r) => `${r.className}-${r.sectionName}` }, { key: "r", header: "Roll", render: (r) => r.rollNo }, { key: "st", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} empty={<Empty title="No enrolment history" />} /></Card>;
}
