import * as React from "react";
import { can } from "@shikkhaos/permissions";
import type { Section, SchoolClass } from "@shikkhaos/types";
import { useApp, useAction, useList, useSession } from "../context";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageHeader, Select, Skeleton, Table, Textarea, todayIso, useToast } from "../ui";

type Rec = { studentId: string; fullName: string; rollNo: number; status: string | null; note?: string | null };
interface Sess { id: string; date: string; records: Rec[] }
const STATUSES = [["PRESENT", "P"], ["ABSENT", "A"], ["LATE", "L"], ["EXCUSED", "E"]] as const;

export function Attendance() {
  const s = useSession(); const { api } = useApp(); const toast = useToast();
  const classes = useList<SchoolClass>("/classes"); const sections = useList<Section>("/sections");
  const assignments = useList<{ sectionId: string }>("/teacher-assignments", undefined, { enabled: !can(s, "academic.assignments.manage") });
  const allowed = can(s, "academic.assignments.manage") || s.role !== "TEACHER" ? sections.data : sections.data?.filter((x) => assignments.data?.some((a) => a.sectionId === x.id));
  const [sectionId, setSection] = React.useState(""); const [date, setDate] = React.useState(todayIso());
  const [sess, setSess] = React.useState<Sess | null>(null); const [loading, setLoading] = React.useState(false); const [err, setErr] = React.useState<unknown>(null);
  const [recs, setRecs] = React.useState<Record<string, string>>({}); const [reason, setReason] = React.useState(""); const [needReason, setNeedReason] = React.useState(false);
  const load = React.useCallback(async () => {
    if (!sectionId) return; setLoading(true); setErr(null);
    try { const r = await api.post<Sess>("/attendance-sessions", { sectionId, date }); setSess(r); setRecs(Object.fromEntries(r.records.map((x) => [x.studentId, x.status ?? "PRESENT"]))); setNeedReason(false); } catch (e) { setErr(e); setSess(null); } finally { setLoading(false); }
  }, [api, sectionId, date]);
  React.useEffect(() => { void load(); }, [load]);
  const save = useAction(async () => { try { await api.put(`/attendance-sessions/${sess!.id}/records`, { records: Object.entries(recs).map(([studentId, status]) => ({ studentId, status })), ...(reason ? { reason } : {}) }); setReason(""); void load(); } catch (e: any) { if (e?.fieldErrors?.some((f: any) => f.field === "reason")) setNeedReason(true); throw e; } }, { invalidate: ["/attendance"], success: "Attendance saved" });
  const cname = (sec: Section) => `${classes.data?.find((c) => c.id === sec.classId)?.name ?? ""}-${sec.name}`;
  const counts = Object.values(recs).reduce<Record<string, number>>((a, v) => { a[v] = (a[v] ?? 0) + 1; return a; }, {});
  const set = (id: string, st: string) => setRecs({ ...recs, [id]: st });
  return <>
    <PageHeader title="Attendance" sub="Daily roll call" />
    <div className="row" style={{ marginBottom: 12 }}>
      <Select aria-label="Section" value={sectionId} onChange={(e) => setSection(e.target.value)} style={{ width: 200 }}><option value="">Choose section…</option>{allowed?.map((x) => <option key={x.id} value={x.id}>{cname(x)}</option>)}</Select>
      <Input aria-label="Date" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
      {sess ? <><Button size="sm" onClick={() => setRecs(Object.fromEntries(Object.keys(recs).map((k) => [k, "PRESENT"])))}>Mark all present</Button><span className="spacer" />{STATUSES.map(([k]) => <Badge key={k} tone={k === "ABSENT" ? "bad" : k === "PRESENT" ? "ok" : undefined}>{k.toLowerCase()} {counts[k] ?? 0}</Badge>)}</> : null}
    </div>
    {!sectionId ? <Empty title="Choose a section">Pick a section and date to take or review attendance.</Empty> : loading ? <Skeleton rows={6} /> : err ? <ErrorState error={err} onRetry={() => void load()} /> : sess ? <>
      <div className="card"><Table rows={sess.records} rowKey={(r) => r.studentId} columns={[{ key: "r", header: "Roll", render: (r) => r.rollNo, width: 60 }, { key: "n", header: "Student", render: (r) => <strong>{r.fullName}</strong> },
        { key: "s", header: "Status", render: (r) => <div className="row" role="radiogroup" aria-label={`Attendance for ${r.fullName}`}>{STATUSES.map(([k, l]) => <button key={k} role="radio" aria-checked={recs[r.studentId] === k} className={`btn sm ${recs[r.studentId] === k ? (k === "ABSENT" ? "danger" : "primary") : ""}`} onClick={() => set(r.studentId, k)} title={k.toLowerCase()}>{l}</button>)}</div> }]} /></div>
      {needReason || sess.records.some((r) => r.status) ? <div style={{ marginTop: 12, maxWidth: 520 }}><Field label={needReason ? "Reason for correction (required)" : "Reason (needed only when correcting past records)"}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div> : null}
      <div className="row" style={{ marginTop: 12 }}><Button variant="primary" busy={save.isPending} onClick={() => save.mutate(undefined)}>Save attendance</Button><span className="faint">Students marked absent are notified.</span></div></> : null}
    <Summary />
  </>;
  void toast; void Card;
}

function Summary() {
  const q = useList<{ sectionId: string; className: string; sectionName: string; days: number; present: number; absent: number; percentage: number | null }>("/attendance/summary", undefined, { max: 100 });
  if (!q.data?.length) return null;
  return <Card title="Attendance summary (all recorded days)"><Table rows={q.data} rowKey={(r) => r.sectionId} columns={[{ key: "c", header: "Section", render: (r) => `${r.className}-${r.sectionName}` }, { key: "d", header: "Days", align: "r", render: (r) => r.days }, { key: "p", header: "Present", align: "r", render: (r) => r.present }, { key: "a", header: "Absent", align: "r", render: (r) => r.absent }, { key: "x", header: "Attendance", align: "r", render: (r) => `${r.percentage ?? 0}%` }]} /></Card>;
}
