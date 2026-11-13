"use client";
import { Plus, Save } from "lucide-react";
import { useState } from "react";
import type { Grading } from "@/api/contracts";
import { repos } from "@/api/factory";
import { keys, useExamsQ, useGradingQ, useMut, useStudentsQ, useSubjectsQ } from "@/api/hooks";
import { Btn, ErrorBox, Field, Modal, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Tab = "classes" | "exams" | "grading";

export default function ClassesExams() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("classes");
  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
        <span className="chip">{t("ce.year")} 2026</span>
        <div className="flex rounded-lg p-0.5" style={{ background: "var(--paper-2)" }} role="tablist">
          {(["classes", "exams", "grading"] as Tab[]).map((k) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cn("h-7 rounded-md px-3 text-[12px] font-semibold")} style={{ background: tab === k ? "var(--card)" : "transparent" }}>{t(`ce.tab.${k}`)}</button>)}
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">{tab === "classes" ? <Classes /> : tab === "exams" ? <Exams /> : <GradingEditor />}</div>
    </div>
  );
}

function Classes() {
  const { t, n, lang } = useT();
  const subjects = useSubjectsQ();
  const students = useStudentsQ();
  const [cls, setCls] = useState(1);
  const [edit, setEdit] = useState<Record<string, { full: number; pass: number }>>({});
  const save = useMut((v: { subject: string; full: number; pass: number }) => repos.klass.updateSubject(cls, v.subject, { full: v.full, pass: v.pass }), [keys.subjects], t("ce.saved"));
  if (subjects.isLoading) return <SkeletonRows rows={6} />;
  if (subjects.isError) return <ErrorBox error={subjects.error} />;
  const defs = (subjects.data ?? []).filter((d) => d.classNo === cls);
  const count = (c: number, s: string) => (students.data ?? []).filter((x) => x.classNo === c && x.section === s).length;
  return (
    <div className="p-3">
      <div className="mb-3 flex flex-wrap gap-1.5">{Array.from({ length: 10 }, (_, i) => i + 1).map((c) => <button key={c} type="button" onClick={() => setCls(c)} aria-pressed={cls === c} className="btn btn-sm" style={cls === c ? { background: "var(--accent)", color: "#fff" } : undefined}>{t("rc.class", { c, s: "" }).replace(/-$/, "")}</button>)}</div>
      <div className="muted mb-2 text-[13px]">{t("ce.sections")}: {["A", "B"].filter((s) => count(cls, s) > 0).map((s) => `${s} (${n(count(cls, s))})`).join(", ")}</div>
      <table className="table"><thead><tr><th>{t("col.subject")}</th><th>{t("ce.components")}</th><th style={{ width: 110 }}>{t("ce.full")}</th><th style={{ width: 110 }}>{t("ce.pass")}</th><th /></tr></thead>
        <tbody>{defs.map((d) => {
          const e = edit[d.subject] ?? { full: d.full, pass: d.pass };
          const changed = e.full !== d.full || e.pass !== d.pass;
          return (
            <tr key={d.subject}><td className="font-semibold">{lang === "bn" ? d.subjectBn : d.subject}</td><td className="muted">{d.components.join(" + ")}</td>
              <td><input className="input !h-8" type="number" min={1} value={e.full} aria-label={t("ce.full")} onChange={(ev) => setEdit({ ...edit, [d.subject]: { ...e, full: Number(ev.target.value) } })} /></td>
              <td><input className="input !h-8" type="number" min={0} value={e.pass} aria-label={t("ce.pass")} onChange={(ev) => setEdit({ ...edit, [d.subject]: { ...e, pass: Number(ev.target.value) } })} /></td>
              <td><Btn size="sm" disabled={!changed || save.isPending} onClick={() => save.mutate({ subject: d.subject, ...e })}><Save size={13} />{t("save")}</Btn></td></tr>
          );
        })}</tbody></table>
    </div>
  );
}

function Exams() {
  const { t, lang } = useT();
  const exams = useExamsQ();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [nameBn, setNameBn] = useState("");
  const create = useMut(() => repos.klass.createExam(name.trim(), nameBn.trim()), [keys.exams, ["matrix"]], t("ce.exam.created"));
  if (exams.isLoading) return <SkeletonRows rows={4} />;
  return (
    <div className="p-3">
      <div className="mb-3 flex justify-end"><Btn variant="primary" onClick={() => setOpen(true)}><Plus size={14} />{t("ce.exam.new")}</Btn></div>
      <ul className="grid gap-2">{(exams.data ?? []).map((e) => <li key={e.id} className="card flex items-center justify-between p-3"><div><div className="font-bold">{lang === "bn" ? e.nameBn : e.name}</div><div className="faint text-[12px]">{e.year}</div></div><span className="chip">{t(e.kind === "term" ? "ce.exam.term" : "ce.exam.test")}</span></li>)}</ul>
      <Modal open={open} onClose={() => setOpen(false)} title={t("ce.exam.new")} footer={<><Btn onClick={() => setOpen(false)}>{t("cancel")}</Btn><Btn variant="primary" disabled={name.trim().length < 3 || create.isPending} onClick={() => void create.mutateAsync(undefined).then(() => { setOpen(false); setName(""); setNameBn(""); }).catch(() => undefined)}>{t("create")}</Btn></>}>
        <Field label={t("ce.exam.name")}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("ce.exam.namebn")}><input className="input" value={nameBn} onChange={(e) => setNameBn(e.target.value)} /></Field>
      </Modal>
    </div>
  );
}

function GradingEditor() {
  const { t } = useT();
  const g = useGradingQ();
  const [draft, setDraft] = useState<Grading | null>(null);
  const save = useMut((v: Grading) => repos.klass.setGrading(v), [keys.grading, ["matrix"]], t("ce.saved"));
  if (g.isLoading || !g.data) return <SkeletonRows rows={4} />;
  const cur = draft ?? g.data;
  const setBand = (i: number, k: "min" | "grade" | "point", v: string) => setDraft({ ...cur, scale: cur.scale.map((b, j) => (j === i ? { ...b, [k]: k === "grade" ? v : Number(v) } : b)) });
  const sorted = [...cur.scale].every((b, i, a) => i === 0 || (a[i - 1] as { min: number }).min > b.min);
  const hasZero = cur.scale.some((b) => b.min === 0);
  const valid = sorted && hasZero;
  return (
    <div className="p-3">
      <Field label={t("ce.passmark")}><input className="input !w-[120px]" type="number" min={0} max={100} value={cur.passMark} onChange={(e) => setDraft({ ...cur, passMark: Number(e.target.value) })} /></Field>
      <table className="table"><thead><tr><th>{t("ce.min")}</th><th>{t("ce.grade")}</th><th>{t("ce.point")}</th></tr></thead>
        <tbody>{cur.scale.map((b, i) => <tr key={i}>
          <td><input className="input !h-8 !w-24" type="number" value={b.min} aria-label={t("ce.min")} onChange={(e) => setBand(i, "min", e.target.value)} /></td>
          <td><input className="input !h-8 !w-24" value={b.grade} aria-label={t("ce.grade")} onChange={(e) => setBand(i, "grade", e.target.value)} /></td>
          <td><input className="input !h-8 !w-24" type="number" step="0.25" value={b.point} aria-label={t("ce.point")} onChange={(e) => setBand(i, "point", e.target.value)} /></td></tr>)}</tbody></table>
      {!valid ? <div className="field-error mt-2" role="alert">{t("ce.grading.invalid")}</div> : null}
      <div className="mt-3 flex gap-2"><Btn variant="primary" disabled={!draft || !valid || save.isPending} onClick={() => draft && save.mutate(draft)}><Save size={14} />{t("save")}</Btn><Btn disabled={!draft} onClick={() => setDraft(null)}>{t("ce.reset")}</Btn></div>
      <p className="muted mt-3 text-[12px]">{t("ce.grading.note")}</p>
    </div>
  );
}
