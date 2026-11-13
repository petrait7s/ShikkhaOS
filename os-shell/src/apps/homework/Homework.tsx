"use client";
import { useQuery } from "@tanstack/react-query";
import { Plus, Send } from "lucide-react";
import { useState } from "react";
import { useMut } from "@/api/hooks";
import { Btn, Empty, ErrorBox, Modal, SkeletonRows } from "@/components/ui";
import { useUI } from "@/store/ui";
import { createHomework, gradeSubmission, homeworkList, homeworkSubs, myAssignments, names, publishHomework, submitHomework, type Homework as Hw } from "../live/api";

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Homework() {
  const role = useUI((s) => s.session?.role);
  const nm = useQuery({ queryKey: ["hw", "names"], queryFn: names });
  const list = useQuery({ queryKey: ["hw", "list"], queryFn: homeworkList });
  const [selId, setSelId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (list.isLoading || nm.isLoading) return <SkeletonRows />;
  if (list.error) return <ErrorBox error={list.error} retry={() => void list.refetch()} />;
  const rows = list.data ?? [];
  const sel = rows.find((r) => r.id === selId) ?? null;
  const teacher = role === "teacher";
  return (
    <div className="flex h-full flex-col sm:flex-row">
      <div className="scroll-thin min-w-0 flex-1 overflow-auto p-3">
        <div className="mb-3 flex items-center gap-2">
          <div className="section-title">{teacher ? "My homework" : "Homework"}</div>
          <div className="flex-1" />
          {teacher ? <Btn variant="primary" onClick={() => setCreating(true)}><Plus size={14} />New homework</Btn> : null}
        </div>
        {rows.length === 0 ? <Empty title="No homework yet" hint={teacher ? "Create homework for one of your classes." : "Your teachers' homework will appear here."} /> : (
          <ul className="grid gap-2">{rows.map((h) => (
            <li key={h.id}><button type="button" onClick={() => setSelId(h.id)} className="hair w-full p-3 text-left" style={sel?.id === h.id ? { outline: "2px solid var(--glow)" } : undefined}>
              <div className="flex items-center gap-2"><span className="font-bold">{h.title}</span>
                {h.status === "DRAFT" ? <span className="chip">Draft</span> : null}
                {role === "student" && h.mySubmission ? <span className={`status ${h.mySubmission.grade ? "status-ok" : "status-info"}`}>{h.mySubmission.grade ? `Grade ${h.mySubmission.grade}` : "Submitted"}</span> : null}
              </div>
              <div className="faint text-[12px]">{h.subjectName ?? "—"} · {nm.data?.secLabel(h.sectionId)} · due {fmt(h.dueAt)}</div></button></li>))}</ul>
        )}
      </div>
      {sel ? <aside className="scroll-thin max-h-[55%] shrink-0 overflow-auto border-t p-4 sm:max-h-none sm:w-[360px] sm:border-l sm:border-t-0" style={{ borderColor: "var(--line)" }}>
        {teacher ? <TeacherDetail h={sel} /> : <StudentDetail h={sel} />}
      </aside> : null}
      {creating ? <CreateModal onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const nm = useQuery({ queryKey: ["hw", "names"], queryFn: names });
  const asg = useQuery({ queryKey: ["hw", "assignments"], queryFn: myAssignments });
  const [aid, setAid] = useState(""), [title, setTitle] = useState(""), [desc, setDesc] = useState(""), [due, setDue] = useState("");
  const make = useMut(() => createHomework({ teacherAssignmentId: aid || asg.data![0].id, title, description: desc, dueAt: new Date(due).toISOString() }), [["hw"]], "Homework saved as draft");
  const ok = title.trim().length > 0 && !!due && (aid || asg.data?.length);
  return (
    <Modal open onClose={onClose} title="New homework" footer={<><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" disabled={!ok || make.isPending} onClick={() => void make.mutateAsync(undefined).then(onClose).catch(() => undefined)}>Save draft</Btn></>}>
      <div className="grid gap-3">
        <div><label className="label" htmlFor="hw-class">Class and subject</label>
          <select id="hw-class" className="select" value={aid || asg.data?.[0]?.id || ""} onChange={(e) => setAid(e.target.value)}>
            {(asg.data ?? []).map((a) => <option key={a.id} value={a.id}>{nm.data?.secLabel(a.sectionId)} · {nm.data?.subj(a.subjectId) || "Class teacher"}</option>)}</select></div>
        <div><label className="label" htmlFor="hw-title">Title</label><input id="hw-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><label className="label" htmlFor="hw-desc">Instructions</label><textarea id="hw-desc" className="textarea" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        <div><label className="label" htmlFor="hw-due">Due</label><input id="hw-due" className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

function TeacherDetail({ h }: { h: Hw }) {
  const subs = useQuery({ queryKey: ["hw", "subs", h.id], queryFn: () => homeworkSubs(h.id), enabled: h.status !== "DRAFT" });
  const publish = useMut(() => publishHomework(h.id), [["hw"]], "Published to students");
  const [grading, setGrading] = useState<string | null>(null), [grade, setGrade] = useState(""), [fb, setFb] = useState("");
  const gr = useMut((s: { id: string; version: number | null }) => gradeSubmission(s.id, { grade, feedback: fb, version: s.version }), [["hw"]], "Graded");
  return (
    <div>
      <div className="section-title">{h.title}</div>
      <p className="muted mt-1 whitespace-pre-wrap text-[13px]">{h.description || "No instructions."}</p>
      {h.status === "DRAFT" ? <Btn className="mt-3" variant="primary" disabled={publish.isPending} onClick={() => void publish.mutateAsync(undefined).catch(() => undefined)}><Send size={14} />Publish to students</Btn> : (
        <div className="mt-3">
          <div className="label">Submissions ({(subs.data ?? []).filter((s) => s.submitted).length}/{(subs.data ?? []).length})</div>
          {subs.isLoading ? <SkeletonRows rows={3} /> : (
            <ul className="grid gap-1.5">{(subs.data ?? []).map((s) => (
              <li key={s.studentId} className="hair p-2 text-[13px]">
                <div className="flex items-center gap-2"><span className="num faint w-6">{s.rollNo}</span><span className="flex-1 font-semibold">{s.fullName}</span>
                  {s.submitted ? <span className={`status ${s.grade ? "status-ok" : s.late ? "status-warn" : "status-info"}`}>{s.grade ? `Grade ${s.grade}` : s.late ? "Late" : "Submitted"}</span> : <span className="status status-muted">Not yet</span>}</div>
                {s.submitted && s.text ? <div className="muted mt-1 whitespace-pre-wrap">{s.text}</div> : null}
                {s.submitted && s.submissionId ? (grading === s.submissionId ? (
                  <div className="mt-2 grid gap-2"><input className="input" aria-label="Grade" placeholder="Grade (e.g. A, 8/10)" value={grade} onChange={(e) => setGrade(e.target.value)} /><input className="input" aria-label="Feedback" placeholder="Feedback (optional)" value={fb} onChange={(e) => setFb(e.target.value)} />
                    <div className="flex gap-2"><Btn size="sm" variant="primary" disabled={!grade.trim() || gr.isPending} onClick={() => void gr.mutateAsync({ id: s.submissionId!, version: s.version }).then(() => setGrading(null)).catch(() => undefined)}>Save grade</Btn><Btn size="sm" onClick={() => setGrading(null)}>Cancel</Btn></div></div>
                ) : <Btn size="sm" className="mt-2" onClick={() => { setGrading(s.submissionId); setGrade(s.grade ?? ""); setFb(s.feedback ?? ""); }}>{s.grade ? "Edit grade" : "Grade"}</Btn>) : null}
              </li>))}</ul>)}
        </div>)}
    </div>
  );
}

function StudentDetail({ h }: { h: Hw }) {
  const [text, setText] = useState("");
  const send = useMut(() => submitHomework(h.id, text), [["hw"]], "Submitted");
  const mine = h.mySubmission;
  return (
    <div>
      <div className="section-title">{h.title}</div>
      <div className="faint text-[12px]">{h.subjectName} · due {fmt(h.dueAt)}</div>
      <p className="muted mt-2 whitespace-pre-wrap text-[13px]">{h.description || "No instructions."}</p>
      {mine ? (
        <div className="hair mt-3 p-3 text-[13px]"><div className="font-semibold">Submitted {fmt(mine.submittedAt)}{mine.late ? " · late" : ""}</div>
          {mine.grade ? <div className="mt-1">Grade: <b>{mine.grade}</b>{mine.feedback ? ` — ${mine.feedback}` : ""}</div> : <div className="faint mt-1">Waiting for your teacher to grade.</div>}</div>
      ) : (
        <div className="mt-3 grid gap-2"><label className="label" htmlFor="hw-answer">Your answer</label><textarea id="hw-answer" className="textarea" value={text} onChange={(e) => setText(e.target.value)} />
          <Btn variant="primary" disabled={!text.trim() || send.isPending} onClick={() => send.mutate(undefined)}><Send size={14} />Submit homework</Btn></div>
      )}
    </div>
  );
}
