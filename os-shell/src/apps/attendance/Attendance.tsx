"use client";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMut } from "@/api/hooks";
import { Btn, Empty, ErrorBox, SkeletonRows } from "@/components/ui";
import { useUI } from "@/store/ui";
import { attendanceSessions, myAssignments, myAttendance, names, openAttendance, saveAttendance, type AttSession, type AttStatus } from "../live/api";

const OPTS: { v: AttStatus; label: string; key: string }[] = [
  { v: "PRESENT", label: "Present", key: "P" }, { v: "ABSENT", label: "Absent", key: "A" }, { v: "LATE", label: "Late", key: "L" }, { v: "EXCUSED", label: "Excused", key: "E" },
];
const today = () => new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const role = useUI((s) => s.session?.role);
  if (role === "teacher") return <TeacherView />;
  if (role === "student") return <StudentView />;
  return <AdminView />;
}

function TeacherView() {
  const nm = useQuery({ queryKey: ["att", "names"], queryFn: names });
  const asg = useQuery({ queryKey: ["att", "assignments"], queryFn: myAssignments });
  const sections = useMemo(() => [...new Set((asg.data ?? []).map((a) => a.sectionId))], [asg.data]);
  const [sectionId, setSection] = useState("");
  const [date, setDate] = useState(today());
  const [session, setSession] = useState<AttSession | null>(null);
  const [marks, setMarks] = useState<Record<string, AttStatus | null>>({});
  const [reason, setReason] = useState("");
  useEffect(() => { if (!sectionId && sections[0]) setSection(sections[0]); }, [sections, sectionId]);

  const open = useMut(() => openAttendance(sectionId, date), [], undefined);
  const load = () => open.mutateAsync(undefined).then((s) => { setSession(s); setMarks(Object.fromEntries(s.records.map((r) => [r.studentId, r.status]))); });
  const save = useMut(() => saveAttendance(session!.id, Object.entries(marks).filter(([, v]) => v).map(([studentId, status]) => ({ studentId, status: status as AttStatus })), date !== today() ? reason : undefined), [["att"]], "Attendance saved");

  if (nm.isLoading || asg.isLoading) return <SkeletonRows />;
  if (nm.error || asg.error) return <ErrorBox error={nm.error ?? asg.error} retry={() => { void nm.refetch(); void asg.refetch(); }} />;
  if (!sections.length) return <Empty title="No classes assigned" hint="Ask the registrar to assign your classes." />;
  const unmarked = session ? session.records.filter((r) => !marks[r.studentId]).length : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
        <select className="select !w-auto" aria-label="Section" value={sectionId} onChange={(e) => { setSection(e.target.value); setSession(null); }}>
          {sections.map((id) => <option key={id} value={id}>{nm.data?.secLabel(id)}</option>)}
        </select>
        <input className="input !w-auto" type="date" aria-label="Date" max={today()} value={date} onChange={(e) => { setDate(e.target.value); setSession(null); }} />
        <Btn variant="primary" disabled={!sectionId || open.isPending} onClick={() => void load()}>{session ? "Reload" : "Open roll call"}</Btn>
        <div className="flex-1" />
        {session ? <><Btn onClick={() => setMarks(Object.fromEntries(session.records.map((r) => [r.studentId, "PRESENT"])))}>Mark all present</Btn>
          <Btn variant="primary" disabled={save.isPending || unmarked > 0 || (date !== today() && reason.trim().length < 3)} onClick={() => save.mutate(undefined)}><Check size={14} />Save</Btn></> : null}
      </div>
      {!session ? <Empty title="Choose a section and date" hint="Open the roll call to mark students present, absent or late." /> : (
        <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
          {date !== today() ? <div className="mb-3"><input className="input" placeholder="Reason for editing a past day (required)" aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div> : null}
          <table className="table"><thead><tr><th style={{ width: 64 }}>Roll</th><th>Name</th><th>Status</th></tr></thead>
            <tbody>{session.records.map((r) => (
              <tr key={r.studentId}><td className="num">{r.rollNo}</td><td className="font-semibold">{r.fullName}</td>
                <td><div className="seg" role="group" aria-label={`${r.fullName} attendance`}>{OPTS.map((o) => (
                  <button key={o.v} type="button" aria-pressed={marks[r.studentId] === o.v} onClick={() => setMarks((m) => ({ ...m, [r.studentId]: o.v }))} title={o.label}>{o.key}</button>))}</div></td></tr>))}</tbody></table>
          <div className="faint mt-2 text-[12px]">{unmarked ? `${unmarked} not marked yet. P present · A absent · L late · E excused.` : "Everyone is marked. Save to finish."}</div>
        </div>
      )}
    </div>
  );
}

function AdminView() {
  const nm = useQuery({ queryKey: ["att", "names"], queryFn: names });
  const q = useQuery({ queryKey: ["att", "sessions"], queryFn: attendanceSessions });
  if (q.isLoading || nm.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const rows = q.data ?? [];
  return rows.length === 0 ? <Empty title="No attendance taken yet" hint="Teachers take attendance from their Attendance app." /> : (
    <div className="scroll-thin h-full overflow-auto p-3">
      <table className="table"><thead><tr><th>Date</th><th>Section</th><th className="text-right">Marked</th><th className="text-right">Absent</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}><td className="num">{r.date}</td><td className="font-semibold">{nm.data?.secLabel(r.sectionId)}</td><td className="num text-right">{r.markedCount}</td><td className="num text-right">{r.absentCount > 0 ? <span className="status status-warn">{r.absentCount}</span> : 0}</td></tr>)}</tbody></table>
    </div>
  );
}

function StudentView() {
  const q = useQuery({ queryKey: ["att", "mine"], queryFn: myAttendance });
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const s = q.data!.summary;
  const tone = (st: string) => (st === "PRESENT" ? "status-ok" : st === "ABSENT" ? "status-danger" : st === "LATE" ? "status-warn" : "status-muted");
  return (
    <div className="scroll-thin h-full overflow-auto p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Attendance", `${Math.round(s.percentage)}%`], ["Present", s.present], ["Absent", s.absent], ["Late", s.late]].map(([k, v]) => (
          <div key={String(k)} className="hair p-3"><div className="faint text-[11px] font-bold uppercase tracking-wider">{k}</div><div className="mt-1 text-2xl font-extrabold">{v}</div></div>))}
      </div>
      {q.data!.records.length === 0 ? <div className="mt-4"><Empty title="No records yet" hint="Your attendance will appear here once your teacher takes it." /></div> : (
        <table className="table mt-4"><thead><tr><th>Date</th><th>Status</th></tr></thead>
          <tbody>{q.data!.records.map((r) => <tr key={r.date}><td className="num">{r.date}</td><td><span className={`status ${tone(r.status)}`}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span></td></tr>)}</tbody></table>
      )}
    </div>
  );
}

