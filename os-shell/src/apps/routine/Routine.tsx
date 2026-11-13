"use client";
import { isAdmin } from "@/lib/roles";
import { Plus, Printer, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { repos } from "@/api/factory";
import type { ExamSlot, RoutineSlot } from "@/api/contracts";
import { keys, useExamSlotsQ, useExamsQ, useMut, useRoutineQ, useSubjectsQ, useTeachersQ } from "@/api/hooks";
import { Btn, Empty, ErrorBox, Field, Modal, SkeletonRows } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { BREAK_AFTER, DAYS, PERIODS, PERIOD_COUNT, dhakaSchoolDay } from "@/lib/routine";
import { useUI } from "@/store/ui";

const sectionsOf = (c: number): string[] => (c >= 6 ? ["A", "B"] : ["A"]);

type Edit = { day: number; period: number; subject: string; teacherId: string };

function Weekly({ classNo, section }: { classNo: number; section: string }) {
  const { t, lang, n } = useT();
  const role = useUI((s) => s.session?.role);
  const routine = useRoutineQ();
  const subjects = useSubjectsQ();
  const teachers = useTeachersQ();
  const [edit, setEdit] = useState<Edit | null>(null);
  const canEdit = isAdmin(role);
  const save = useMut((e: Edit) => repos.routine.setSlot({ classNo, section, day: e.day, period: e.period, subject: e.subject, teacherId: e.teacherId || null }), [keys.routine], () => t("rt.saved"));
  const clear = useMut((e: { day: number; period: number }) => repos.routine.clearSlot(classNo, section, e.day, e.period), [keys.routine], () => t("rt.cleared"));

  const slots = useMemo(() => (routine.data ?? []).filter((s) => role === "teacher" || (s.classNo === classNo && s.section === section)), [routine.data, role, classNo, section]);
  const today = dhakaSchoolDay(Date.now());
  const subjBn = (s: string): string => (subjects.data ?? []).find((x) => x.subject === s)?.subjectBn ?? s;
  const classSubjects = (subjects.data ?? []).filter((x) => x.classNo === classNo);
  const teacherName = (id: string | null): string => {
    const tt = (teachers.data ?? []).find((x) => x.id === id);
    return tt ? (lang === "bn" ? tt.nameBn : tt.name) : "";
  };
  const teachersFor = (subject: string) => {
    const active = (teachers.data ?? []).filter((x) => x.status === "active");
    const mine = active.filter((x) => x.assignments.some((a) => a.classNo === classNo && a.section === section && a.subject === subject));
    return [...mine, ...active.filter((x) => !mine.includes(x))];
  };

  if (routine.isLoading) return <SkeletonRows rows={7} />;
  if (routine.isError) return <ErrorBox error={routine.error} retry={() => void routine.refetch()} />;
  if (!canEdit && slots.length === 0) return <Empty title={t("rt.empty")} hint={t("rt.empty.hint")} />;

  const cell = (day: number, period: number): RoutineSlot | undefined => slots.find((s) => s.day === day && s.period === period);

  return (
    <>
      <div className="print-area overflow-auto">
        <table className="w-full border-separate text-[12.5px]" style={{ borderSpacing: 6 }}>
          <thead>
            <tr>
              <th className="faint w-[92px] text-left text-[11px] uppercase">{t("rt.period")}</th>
              {DAYS.map((d, i) => <th key={d.en} className="rounded-lg px-2 py-1.5 text-left text-[12px]" style={{ background: i === today ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "var(--paper-2)" }}>{lang === "bn" ? d.bn : d.en}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <>
                <tr key={p.n}>
                  <td className="align-top"><div className="font-bold">{n(p.n)}</div><div className="faint text-[11px]">{p.start}–{p.end}</div></td>
                  {DAYS.map((d, di) => {
                    const c = cell(di, p.n);
                    const inner = c ? (
                      <>
                        <div className="font-bold leading-tight">{lang === "bn" ? subjBn(c.subject) : c.subject}</div>
                        <div className="faint truncate text-[11px]">{role === "teacher" ? t("rc.class", { c: c.classNo, s: c.section }) : teacherName(c.teacherId)}</div>
                      </>
                    ) : <span className="faint">{t("rt.free")}</span>;
                    const style = { background: c ? "color-mix(in srgb, var(--accent) 12%, var(--card))" : "transparent", border: c ? "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" : "1px dashed var(--line)" };
                    return (
                      <td key={d.en} className="p-0 align-top">
                        {canEdit ? (
                          <button type="button" className="h-[52px] w-full rounded-lg px-2 py-1 text-left transition hover:brightness-95" style={style} aria-label={`${d.en} ${t("rt.period")} ${p.n}`} onClick={() => setEdit({ day: di, period: p.n, subject: c?.subject ?? classSubjects[0]?.subject ?? "", teacherId: c?.teacherId ?? "" })}>{inner}</button>
                        ) : <div className="h-[52px] rounded-lg px-2 py-1" style={style}>{inner}</div>}
                      </td>
                    );
                  })}
                </tr>
                {p.n === BREAK_AFTER ? <tr key={`b${p.n}`}><td colSpan={6} className="faint rounded-lg py-1 text-center text-[11px] uppercase tracking-widest" style={{ background: "var(--paper-2)" }}>{t("rt.break")}</td></tr> : null}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <p className="faint no-print px-1 pt-1 text-[11px]">{canEdit ? t("rt.conflictTip") : ""}</p>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={t("rt.edit")} width={420}
        footer={edit ? (
          <>
            {cell(edit.day, edit.period) ? <Btn variant="danger" onClick={() => { clear.mutate({ day: edit.day, period: edit.period }, { onSuccess: () => setEdit(null) }); }}><Trash2 size={14} />{t("rt.clear")}</Btn> : null}
            <Btn variant="primary" disabled={save.isPending || !edit.subject} onClick={() => { save.mutate(edit, { onSuccess: () => setEdit(null) }); }}>{t("save")}</Btn>
          </>
        ) : null}>
        {edit ? (
          <div className="grid gap-3">
            <div className="muted text-[13px]">{lang === "bn" ? DAYS[edit.day]?.bn : DAYS[edit.day]?.en} · {t("rt.period")} {n(edit.period)} / {n(PERIOD_COUNT)}</div>
            <Field label={t("rt.subject")}>
              <select className="select" value={edit.subject} onChange={(e) => { const sub = e.target.value; setEdit({ ...edit, subject: sub, teacherId: teachersFor(sub)[0]?.id ?? "" }); }}>
                {classSubjects.map((s) => <option key={s.subject} value={s.subject}>{lang === "bn" ? s.subjectBn : s.subject}</option>)}
              </select>
            </Field>
            <Field label={t("rt.teacher")}>
              <select className="select" value={edit.teacherId} onChange={(e) => setEdit({ ...edit, teacherId: e.target.value })}>
                <option value="">{t("rt.noTeacher")}</option>
                {teachersFor(edit.subject).map((x) => <option key={x.id} value={x.id}>{lang === "bn" ? x.nameBn : x.name}</option>)}
              </select>
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

type ExamEdit = { id?: string; subject: string; date: string; start: string; end: string; room: string };

function ExamRoutine({ classNo }: { classNo: number }) {
  const { t, lang, n } = useT();
  const role = useUI((s) => s.session?.role);
  const exams = useExamsQ();
  const subjects = useSubjectsQ();
  const [examPick, setExamPick] = useState("");
  const examId = examPick || (exams.data ?? []).find((e) => e.name === "Annual")?.id || (exams.data ?? [])[0]?.id || "";
  const slots = useExamSlotsQ(examId);
  const [edit, setEdit] = useState<ExamEdit | null>(null);
  const canEdit = isAdmin(role);
  const save = useMut((e: ExamEdit) => repos.routine.saveExamSlot({ ...e, examId, classNo }), [keys.examSlots(examId)], () => t("rt.saved"));
  const remove = useMut((id: string) => repos.routine.removeExamSlot(id), [keys.examSlots(examId)], () => t("rt.cleared"));
  const rows = (slots.data ?? []).filter((x: ExamSlot) => role === "teacher" ? true : x.classNo === classNo).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  const subjBn = (s: string): string => (subjects.data ?? []).find((x) => x.subject === s)?.subjectBn ?? s;
  const classSubjects = (subjects.data ?? []).filter((x) => x.classNo === classNo);

  if (exams.isLoading || slots.isLoading) return <SkeletonRows rows={6} />;
  if (slots.isError) return <ErrorBox error={slots.error} retry={() => void slots.refetch()} />;

  return (
    <div className="grid gap-3">
      <div className="no-print flex flex-wrap items-center gap-2">
        <select className="select !w-auto" aria-label={t("rc.exam")} value={examId} onChange={(e) => setExamPick(e.target.value)}>
          {(exams.data ?? []).map((e) => <option key={e.id} value={e.id}>{lang === "bn" ? e.nameBn : e.name}</option>)}
        </select>
        {canEdit ? <Btn variant="primary" size="sm" onClick={() => setEdit({ subject: classSubjects[0]?.subject ?? "", date: "2026-12-01", start: "10:00", end: "13:00", room: "" })}><Plus size={14} />{t("rt.add")}</Btn> : null}
      </div>
      {rows.length === 0 ? <Empty title={t("rt.examEmpty")} /> : (
        <div className="print-area">
          <table className="table">
            <thead><tr><th>{t("rt.date")}</th>{role === "teacher" ? <th>{t("col.class")}</th> : null}<th>{t("rt.subject")}</th><th>{t("rt.start")}–{t("rt.end")}</th><th>{t("rt.room")}</th>{canEdit ? <th className="no-print" /> : null}</tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id}>
                  <td className="font-semibold">{fmtDate(x.date, lang)}</td>
                  {role === "teacher" ? <td>{x.classNo}</td> : null}
                  <td>{lang === "bn" ? subjBn(x.subject) : x.subject}</td>
                  <td>{n(x.start)}–{n(x.end)}</td>
                  <td>{x.room}</td>
                  {canEdit ? <td className="no-print text-right"><Btn size="sm" onClick={() => setEdit({ id: x.id, subject: x.subject, date: x.date, start: x.start, end: x.end, room: x.room })}>{t("rt.edit")}</Btn> <Btn size="sm" variant="ghost" aria-label={t("rt.remove")} onClick={() => remove.mutate(x.id)}><Trash2 size={13} /></Btn></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={t("rt.add")} width={440}
        footer={edit ? <Btn variant="primary" disabled={save.isPending || !edit.subject || !edit.date} onClick={() => { save.mutate(edit, { onSuccess: () => setEdit(null) }); }}>{t("save")}</Btn> : null}>
        {edit ? (
          <div className="grid gap-3">
            <Field label={t("rt.subject")}>
              <select className="select" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })}>
                {classSubjects.map((s) => <option key={s.subject} value={s.subject}>{lang === "bn" ? s.subjectBn : s.subject}</option>)}
              </select>
            </Field>
            <Field label={t("rt.date")}><input className="input" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("rt.start")}><input className="input" type="time" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} /></Field>
              <Field label={t("rt.end")}><input className="input" type="time" value={edit.end} onChange={(e) => setEdit({ ...edit, end: e.target.value })} /></Field>
            </div>
            <Field label={t("rt.room")}><input className="input" value={edit.room} onChange={(e) => setEdit({ ...edit, room: e.target.value })} /></Field>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default function Routine() {
  const { t, n } = useT();
  const role = useUI((s) => s.session?.role);
  const [tab, setTab] = useState<"week" | "exam">("week");
  const [classNo, setClassNo] = useState(8);
  const [section, setSection] = useState("A");
  const routine = useRoutineQ();
  const own = role === "student" ? (routine.data ?? [])[0] : undefined;
  const cNo = role === "student" && own ? own.classNo : classNo;
  const sec = role === "student" && own ? own.section : section;
  const showPicker = isAdmin(role);

  return (
    <div className="flex h-full flex-col">
      <div className="no-print flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
        <div className="seg" role="tablist">
          {(["week", "exam"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{k === "week" ? (role === "teacher" ? t("rt.mine") : t("rt.week")) : t("rt.exam")}</button>
          ))}
        </div>
        {showPicker ? (
          <>
            <select className="select !w-auto" aria-label={t("col.class")} value={classNo} onChange={(e) => { const c = Number(e.target.value); setClassNo(c); if (!sectionsOf(c).includes(section)) setSection("A"); }}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{t("col.class")} {n(c)}</option>)}
            </select>
            {tab === "week" ? (
              <select className="select !w-auto" aria-label={t("col.section")} value={section} onChange={(e) => setSection(e.target.value)}>
                {sectionsOf(classNo).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : null}
          </>
        ) : null}
        <div className="flex-1" />
        <Btn size="sm" onClick={() => window.print()}><Printer size={14} />{t("rt.print")}</Btn>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
        {tab === "week" ? <Weekly classNo={cNo} section={sec} /> : <ExamRoutine classNo={cNo} />}
      </div>
    </div>
  );
}
