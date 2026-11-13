"use client";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, UploadCloud, XCircle } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { repos } from "@/api/factory";
import { keys, RESULT_KEYS, useMut, useStudentsQ, useSubjectsQ, useTeachersQ } from "@/api/hooks";
import { Btn, Field, Modal } from "@/components/ui";
import { buildXlsx, readGrid, type Grid } from "@/lib/excel";
import { useT } from "@/lib/i18n";
import { cn, downloadBlob } from "@/lib/utils";
import { SUBJECT_MASTER } from "@/data/names";
import {
  detectHints, detectLayout, errorReport, validateMarks, validateRoster, validateTeachers, ROSTER_HEADERS, TEACHER_HEADERS,
  type Hints, type Layout, type Validation,
} from "./importLogic";

export type WizardMode = "marks" | "roster" | "teachers";
type Sheets = { sheet: string; grid: Grid }[];

const STEPS = ["wiz.upload", "wiz.detect", "wiz.validate", "wiz.preview", "wiz.confirm"];

function RowStatus({ status }: { status: "ok" | "warn" | "error" }) {
  const { t } = useT();
  return status === "ok" ? <span className="status status-ok !h-5"><CheckCircle2 size={12} />{t("wiz.row.ok")}</span>
    : status === "warn" ? <span className="status status-warn !h-5"><AlertTriangle size={12} />{t("wiz.row.warn")}</span>
    : <span className="status status-danger !h-5"><XCircle size={12} />{t("wiz.row.error")}</span>;
}

function StepBar({ step }: { step: number }) {
  const { t } = useT();
  return (
    <ol className="mb-4 flex flex-wrap gap-1.5 text-[12px]">
      {STEPS.map((s, i) => (
        <li key={s} className={cn("chip", i === step && "font-extrabold")} style={i === step ? { background: "var(--accent)", color: "#fff", borderColor: "transparent" } : i < step ? { color: "var(--ok)" } : undefined}>{i + 1}. {t(s)}</li>
      ))}
    </ol>
  );
}

export function ImportWizard({ open, onClose, mode, examId, initialFile, preset }: { open: boolean; onClose: () => void; mode: WizardMode; examId?: string; initialFile?: File | null; preset?: Partial<Hints> }) {
  const { t } = useT();
  const students = useStudentsQ();
  const subjects = useSubjectsQ();
  const teachers = useTeachersQ();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<Sheets>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [hints, setHints] = useState<Hints>({ classNo: null, section: null, subject: null });
  const [val, setVal] = useState<Validation | null>(null);
  const [genVal, setGenVal] = useState<ReturnType<typeof validateRoster> | ReturnType<typeof validateTeachers>>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyBad, setOnlyBad] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const loaded = useRef<File | null>(null);

  const subjectNames = useMemo(() => SUBJECT_MASTER, []);
  const defsAll = subjects.data ?? [];
  const classDefs = defsAll.filter((d) => d.classNo === hints.classNo);
  const classStudents = (students.data ?? []).filter((s) => s.classNo === hints.classNo && s.section === hints.section);

  const importMarks = useMut(async () => {
    if (!val || !examId || hints.classNo === null || !hints.section) return 0;
    let n = 0;
    for (const [subject, vals] of Object.entries(val.values)) {
      if (Object.keys(vals).length === 0) continue;
      await repos.marks.importMarks({ examId, classNo: hints.classNo, section: hints.section, subject }, vals);
      n += Object.keys(vals).length;
    }
    return n;
  }, [...RESULT_KEYS], (n) => t("wiz.imported", { n }));
  const importRoster = useMut(async () => {
    const g = genVal as ReturnType<typeof validateRoster>;
    if (!g) return { added: 0, updated: 0 };
    return repos.student.importRoster((g.ok as Parameters<typeof repos.student.importRoster>[0]));
  }, [keys.students]);
  const importTeachers = useMut(async () => {
    const g = genVal as ReturnType<typeof validateTeachers>;
    if (!g) return { added: 0 };
    return repos.teacher.importTeachers((g.ok as Parameters<typeof repos.teacher.importTeachers>[0]));
  }, [keys.teachers, keys.invites]);

  async function load(f: File) {
    setErr(null);
    try {
      const sh = await readGrid(f);
      setFile(f);
      setSheets(sh);
      if (mode === "marks") {
        const lay = detectLayout(sh, subjectNames);
        if (!lay) { setErr(t("wiz.err.nolayout")); return; }
        setLayout(lay);
        const sheet = sh.find((x) => x.sheet === lay.sheet);
        const pre = (sheet?.grid ?? []).slice(0, lay.headerRow).map((r) => r.join(" "));
        const h = detectHints(f.name, lay.sheet, pre, subjectNames.map((x) => x.en));
        setHints({ classNo: preset?.classNo ?? h.classNo, section: preset?.section ?? h.section, subject: lay.format === "A" ? (preset?.subject ?? h.subject) : null });
      }
      setStep(1);
    } catch {
      setErr(t("wiz.err.read"));
    }
  }
  if (open && initialFile && loaded.current !== initialFile && students.data && subjects.data) {
    loaded.current = initialFile;
    void load(initialFile);
  }

  function runValidate() {
    setErr(null);
    if (mode === "marks") {
      if (!layout || hints.classNo === null || !hints.section) { setErr(t("wiz.err.class")); return; }
      if (layout.format === "A" && !hints.subject) { setErr(t("wiz.err.subject")); return; }
      const grid = sheets.find((s) => s.sheet === layout.sheet)?.grid ?? [];
      setVal(validateMarks(layout, grid, { students: classStudents, defs: classDefs, hints }));
    } else {
      const grid = sheets[0]?.grid ?? [];
      const g = mode === "roster"
        ? validateRoster(grid, new Set((students.data ?? []).map((s) => s.studentId.toLowerCase())))
        : validateTeachers(grid, new Set((teachers.data ?? []).map((x) => x.phone)));
      if (!g) { setErr(t("wiz.err.nolayout")); return; }
      setGenVal(g);
    }
    setStep(2);
  }

  const bad = mode === "marks" ? (val?.counts.error ?? 0) : (genVal?.rows.filter((r) => r.status === "error").length ?? 0);
  const total = mode === "marks" ? (val?.rows.length ?? 0) : (genVal?.rows.length ?? 0);
  const good = mode === "marks" ? (val ? val.counts.ok + val.counts.warn : 0) : (genVal?.rows.filter((r) => r.status !== "error").length ?? 0);

  async function downloadErrors() {
    const issues = mode === "marks" ? (val ? errorReport(val) : []) : genVal ? [{ name: "Issues", rows: [["Row", "Message"], ...genVal.issues.map((i) => [i.row, i.message])], widths: [8, 60] }] : [];
    if (issues.length) downloadBlob(await buildXlsx(issues), "error-report.xlsx");
  }

  async function downloadTemplate() {
    if (mode === "roster") downloadBlob(await buildXlsx([{ name: "Roster", rows: [ROSTER_HEADERS, ["GC26-06A-31", 31, "Sample Student", 6, "A", "Sample Guardian", "01712345678"]], widths: [16, 8, 24, 8, 10, 22, 16] }]), "student-roster-template.xlsx");
    else downloadBlob(await buildXlsx([{ name: "Teachers", rows: [TEACHER_HEADERS, ["Sample Teacher", "01711223344", "sample@school.edu.bd", "Assistant Teacher"]], widths: [24, 16, 28, 22] }]), "teacher-list-template.xlsx");
  }

  function reset() {
    setStep(0); setFile(null); setSheets([]); setLayout(null); setVal(null); setGenVal(null); setErr(null); setDone(null); setOnlyBad(false); loaded.current = null;
  }
  const close = () => { reset(); onClose(); };

  async function confirm() {
    try {
      if (mode === "marks") await importMarks.mutateAsync(undefined);
      else if (mode === "roster") await importRoster.mutateAsync(undefined);
      else await importTeachers.mutateAsync(undefined);
      setDone(t("wiz.done"));
    } catch { /* toast shown by mutation */ }
  }
  const busy = importMarks.isPending || importRoster.isPending || importTeachers.isPending;

  const previewCols = mode === "marks" ? (val?.columns ?? []) : [];
  const title = mode === "marks" ? t("wiz.title.marks") : mode === "roster" ? t("wiz.title.roster") : t("wiz.title.teachers");

  return (
    <Modal open={open} onClose={close} title={title} width={820}
      footer={done ? <Btn variant="primary" onClick={close}>{t("close")}</Btn> : (
        <>
          {step > 0 ? <Btn onClick={() => setStep(Math.max(0, step - 1))}>{t("back")}</Btn> : null}
          {step === 1 ? <Btn variant="primary" onClick={runValidate}>{t("wiz.validate")}</Btn> : null}
          {step === 2 ? <Btn variant="primary" onClick={() => { setOnlyBad(bad > 0); setStep(3); }}>{bad > 0 ? t("wiz.reviewerrors") : t("wiz.preview")}</Btn> : null}
          {step === 3 ? <Btn variant="primary" onClick={() => setStep(4)}>{t("next")}</Btn> : null}
          {step === 4 ? <Btn variant="primary" disabled={busy || good === 0} onClick={() => void confirm()}>{busy ? t("working") : t("wiz.import")}</Btn> : null}
        </>
      )}>
      <StepBar step={done ? 4 : step} />
      {err ? <div className="field-error mb-3" role="alert">{err}</div> : null}

      {done ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center"><CheckCircle2 size={40} style={{ color: "var(--ok)" }} /><div className="font-bold">{done}</div><div className="muted text-[13px]">{t("wiz.done.sub")}</div></div>
      ) : step === 0 ? (
        <div>
          <label className="hair flex cursor-pointer flex-col items-center gap-2 border-dashed p-10 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void load(f); }}>
            <UploadCloud size={30} style={{ color: "var(--accent)" }} />
            <span className="font-bold">{t("wiz.drop")}</span>
            <span className="muted text-[12px]">{t("wiz.drop.sub")}</span>
            <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />
          </label>
          {mode !== "marks" ? <Btn className="mt-3" onClick={() => void downloadTemplate()}><Download size={14} />{t("wiz.template")}</Btn> : null}
        </div>
      ) : step === 1 ? (
        <div>
          <div className="hair mb-4 flex items-center gap-3 p-3"><FileSpreadsheet size={20} /><div className="min-w-0 flex-1"><div className="truncate font-bold">{file?.name}</div><div className="muted text-[12px]">{sheets.length} {t("wiz.sheets")}{mode === "marks" && layout ? ` · ${t(layout.format === "A" ? "wiz.formatA" : "wiz.formatB")}` : ""}</div></div></div>
          {mode === "marks" && layout ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t("col.class")}><select className="select" value={hints.classNo ?? ""} onChange={(e) => setHints({ ...hints, classNo: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              <Field label={t("col.section")}><select className="select" value={hints.section ?? ""} onChange={(e) => setHints({ ...hints, section: e.target.value || null })}><option value="">—</option>{["A", "B"].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
              {layout.format === "A" ? (
                <Field label={t("col.subject")}><select className="select" value={hints.subject ?? ""} onChange={(e) => setHints({ ...hints, subject: e.target.value || null })}><option value="">—</option>{classDefs.map((d) => <option key={d.subject} value={d.subject}>{d.subject}</option>)}</select></Field>
              ) : <div className="muted self-end pb-2 text-[12px]">{layout.subjectCols.map((c) => c.subject).join(", ")}</div>}
            </div>
          ) : <p className="muted text-[13px]">{t("wiz.detect.generic")}</p>}
        </div>
      ) : step === 2 ? (
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="hair p-3"><div className="text-2xl font-extrabold" style={{ color: "var(--ok)" }}>{good}</div><div className="faint text-[12px]">{t("wiz.valid")}</div></div>
            <div className="hair p-3"><div className="text-2xl font-extrabold" style={{ color: "var(--danger)" }}>{bad}</div><div className="faint text-[12px]">{t("wiz.errors")}</div></div>
            <div className="hair p-3"><div className="text-2xl font-extrabold">{total}</div><div className="faint text-[12px]">{t("wiz.rows")}</div></div>
          </div>
          {mode === "marks" && val ? <div className="muted text-[13px]">{t("wiz.warnings", { w: val.counts.warn, a: val.counts.absent, m: val.counts.missing })}</div> : null}
          {bad ? <Btn onClick={() => void downloadErrors()}><Download size={14} />{t("wiz.errreport")}</Btn> : <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--ok)" }}><CheckCircle2 size={16} />{t("wiz.clean")}</div>}
        </div>
      ) : step === 3 ? (
        <div>
          <label className="mb-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={onlyBad} onChange={(e) => setOnlyBad(e.target.checked)} />{t("wiz.onlybad")}</label>
          <div className="scroll-thin max-h-[360px] overflow-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
            <table className="table">
              <thead><tr><th>#</th>{mode === "marks" ? <><th>{t("col.roll")}</th><th>{t("col.name")}</th>{previewCols.map((c) => <th key={c}>{c}</th>)}</> : <th>{t("wiz.data")}</th>}<th>{t("col.status")}</th></tr></thead>
              <tbody>
                {mode === "marks"
                  ? (val?.rows ?? []).filter((r) => !onlyBad || r.status !== "ok").map((r) => (
                    <tr key={r.row} style={{ background: r.status === "error" ? "color-mix(in srgb, var(--danger) 10%, transparent)" : r.status === "warn" ? "color-mix(in srgb, var(--warn) 12%, transparent)" : undefined }}>
                      <td>{r.row}</td><td>{r.roll}</td><td>{r.name}</td>{r.cells.map((c, i) => <td key={i}>{c}</td>)}
                      <td className="text-[12px]"><RowStatus status={r.status} />{r.status !== "ok" ? <div className="mt-1">{r.messages.join("; ")}</div> : null}</td>
                    </tr>))
                  : (genVal?.rows ?? []).filter((r) => !onlyBad || r.status !== "ok").map((r) => (
                    <tr key={r.row} style={{ background: r.status === "error" ? "color-mix(in srgb, var(--danger) 10%, transparent)" : r.status === "warn" ? "color-mix(in srgb, var(--warn) 12%, transparent)" : undefined }}>
                      <td>{r.row}</td><td>{r.data ? ("studentId" in r.data ? `${r.data.studentId} · ${r.data.name}` : `${r.data.name} · ${r.data.phone}`) : "—"}</td><td className="text-[12px]"><RowStatus status={r.status} />{r.status !== "ok" ? <div className="mt-1">{r.messages.join("; ")}</div> : null}</td>
                    </tr>))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid gap-2 text-[13px]">
          <div className="hair p-3">{t("wiz.confirm.body", { good, bad })}</div>
          {mode === "marks" ? <div className="muted">{t("wiz.confirm.marks")}</div> : null}
        </div>
      )}
    </Modal>
  );
}
