"use client";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleDot, FileText, Loader2, Lock, RotateCw, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Cell, MarkValue } from "@/api/contracts";
import { repos } from "@/api/factory";
import { RESULT_KEYS, useExamsQ, useMut, useMyCellsQ, usePaperKeysQ, useStudentsQ, useSubjectsQ } from "@/api/hooks";
import { Btn, Empty, Modal, SkeletonRows } from "@/components/ui";
import { PaperModal } from "@/components/PaperModal";
import { fmtDateTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { pickExam } from "@/os/Widgets";
import { useIntent } from "@/store/intent";

type Parsed = { ok: boolean; v: MarkValue };
function parse(s: string, full: number): Parsed {
  const x = s.trim();
  if (x === "") return { ok: true, v: null };
  if (/^(ab|absent)$/i.test(x)) return { ok: true, v: "AB" };
  const n = Number(x);
  if (Number.isNaN(n) || n < 0 || n > full) return { ok: false, v: null };
  return { ok: true, v: n };
}

const sameKey = (a: Cell, b: Cell) => a.classNo === b.classNo && a.section === b.section && a.subject === b.subject;

export default function MarksEntry() {
  const { t, lang } = useT();
  const exams = useExamsQ();
  const [examId, setExamId] = useState("");
  const exam = exams.data?.find((e) => e.id === examId) ?? pickExam(exams.data);
  const eid = exam?.id ?? "";
  const cells = useMyCellsQ(eid);
  const students = useStudentsQ();
  const subjects = useSubjectsQ();
  const [selKey, setSelKey] = useState<Cell | null>(null);
  const cell = (cells.data ?? []).find((c) => selKey && sameKey(c, selKey)) ?? (cells.data ?? [])[0];
  const intent = useIntent((s) => s.intent);
  const clearIntent = useIntent((s) => s.clear);
  useEffect(() => {
    if (intent?.kind !== "marks" || !cells.data) return;
    const hit = cells.data.find((c) => c.classNo === intent.classNo && c.section === intent.section && c.subject === intent.subject);
    if (hit) setSelKey(hit);
    clearIntent();
  }, [intent, cells.data, clearIntent]);

  if (cells.isLoading || exams.isLoading) return <SkeletonRows rows={6} />;
  if (!cell) return <Empty title={t("me.none")} hint={t("me.none.hint")} />;

  return (
    <div className="flex h-full min-h-[420px] flex-col sm:flex-row">
      <aside className="scroll-thin max-h-[40%] shrink-0 overflow-auto border-b p-3 sm:max-h-none sm:w-[250px] sm:border-b-0 sm:border-r" style={{ borderColor: "var(--line)" }}>
        <select className="select mb-3" aria-label={t("rc.exam")} value={eid} onChange={(e) => { setExamId(e.target.value); setSelKey(null); }}>
          {(exams.data ?? []).map((e) => <option key={e.id} value={e.id}>{lang === "bn" ? e.nameBn : e.name}</option>)}
        </select>
        <ul className="grid gap-1.5">
          {(cells.data ?? []).map((c) => {
            const active = sameKey(c, cell);
            return (
              <li key={`${c.classNo}${c.section}${c.subject}`}>
                <button type="button" onClick={() => setSelKey(c)} className={cn("hair w-full p-2 text-left")} style={active ? { borderColor: "var(--accent)", outline: "2px solid var(--accent)" } : undefined}>
                  <div className="text-[13px] font-bold">{t("rc.class", { c: c.classNo, s: c.section })} · {c.subject}</div>
                  <div className="faint text-[11px]">{t(`state.${c.state}`)}{c.returnComment ? ` · ${t("rc.returned")}` : ""}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="min-w-0 flex-1">
        <Grid key={`${eid}-${cell.classNo}-${cell.section}-${cell.subject}`} cell={cell} examId={eid}
          roster={(students.data ?? []).filter((s) => s.classNo === cell.classNo && s.section === cell.section).sort((a, b) => a.roll - b.roll)}
          full={subjects.data?.find((d) => d.classNo === cell.classNo && d.subject === cell.subject)?.full ?? 100} />
      </div>
    </div>
  );
}

function Grid({ cell, examId, roster, full }: { cell: Cell; examId: string; roster: { id: string; roll: number; name: string }[]; full: number }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(roster.map((s) => [s.id, String(cell.marks[s.id] ?? "")])));
  const [saved, setSaved] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "dirty" | "saving" | "saved" | "failed">("idle");
  const [confirm, setConfirm] = useState(false);
  const [paperOpen, setPaperOpen] = useState(false);
  const paperKeys = usePaperKeysQ(examId);
  const hasPaper = (paperKeys.data ?? []).includes(`${cell.classNo}-${cell.section}-${cell.subject}`);
  const paperLocked = cell.state === "verified" || cell.state === "published";
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const dirty = useRef(false);
  const locked = cell.locked;
  const k = useMemo(() => ({ examId, classNo: cell.classNo, section: cell.section, subject: cell.subject }), [examId, cell.classNo, cell.section, cell.subject]);

  const parsed = roster.map((s) => parse(vals[s.id] ?? "", full));
  const bad = parsed.filter((p) => !p.ok).length;
  const filled = parsed.filter((p) => p.ok && p.v !== null).length;
  const toMarks = () => Object.fromEntries(roster.map((s, i) => [s.id, (parsed[i] as Parsed).v]).filter(([, v]) => v !== null)) as Record<string, MarkValue>;

  const latest = useRef<() => Record<string, MarkValue>>(toMarks);
  latest.current = toMarks;
  const saveNow = () => {
    if (locked || !dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    repos.marks.saveDraft(k, latest.current())
      .then((c) => { setSaved(c.updatedAt); setSaveState((st) => (st === "dirty" ? "dirty" : "saved")); void qc.invalidateQueries({ queryKey: ["myCells"] }); })
      .catch(() => { dirty.current = true; setSaveState("failed"); });
  };

  // Autosave 1.2 s after the last edit. Typed values stay in the grid if saving fails, so nothing is lost.
  useEffect(() => {
    if (locked || saveState !== "dirty") return;
    const h = setTimeout(saveNow, 1200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState, vals, locked]);

  // Flush a pending draft when the window closes or the user switches sheet; warn before leaving the page with unsaved edits.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (dirty.current && !locked) void repos.marks.saveDraft(k, latest.current()).catch(() => undefined);
    };
  }, [k, locked]);

  const submit = useMut(() => repos.marks.submit(k, toMarks()), [...RESULT_KEYS], t("me.submitted"));
  const set = (id: string, v: string) => { dirty.current = true; setSaveState("dirty"); setVals((p) => ({ ...p, [id]: v })); };
  const focus = (i: number) => { const el = refs.current[i]; if (el) { el.focus(); el.select(); } };

  function onPaste(e: React.ClipboardEvent, start: number) {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.length > 0);
    const next = { ...vals };
    lines.forEach((l, j) => {
      const s = roster[start + j];
      if (s) next[s.id] = (l.split("\t").pop() ?? "").trim();
    });
    dirty.current = true;
    setSaveState("dirty");
    setVals(next);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
        <div className="font-bold">{t("rc.class", { c: cell.classNo, s: cell.section })} · {cell.subject}</div>
        <span className="chip">{t(`state.${cell.state}`)}</span>
        {locked ? <span className="chip" style={{ color: "var(--warn)" }}><Lock size={11} />{t("me.locked")}</span> : null}
        <div className="flex-1" />
        <Btn size="sm" onClick={() => setPaperOpen(true)}><FileText size={13} />{hasPaper ? t("paper.attached") : paperLocked ? t("paper.none.short") : t("paper.add")}</Btn>
        <span role="status" aria-live="polite" className="text-[12.5px]">
          {saveState === "saving" ? <span className="status status-info"><Loader2 size={12} className="animate-spin" />{t("me.saving")}</span>
            : saveState === "dirty" ? <span className="status status-muted"><CircleDot size={12} />{t("me.unsaved")}</span>
            : saveState === "failed" ? <span className="status status-danger"><AlertTriangle size={12} />{t("me.savefail")}<button type="button" className="ml-1 inline-flex items-center gap-1 underline" onClick={saveNow}><RotateCw size={11} />{t("retry")}</button></span>
            : saved ? <span className="status status-ok"><Check size={12} />{t("me.saved")} {fmtDateTime(saved, lang)}</span> : null}
        </span>
        <Btn variant="primary" disabled={locked || bad > 0 || filled !== roster.length || submit.isPending} onClick={() => setConfirm(true)}><Send size={14} />{t("me.submit")}</Btn>
      </div>
      {cell.returnComment ? <div className="mx-3 mt-3 rounded-lg border p-2 text-[13px]" style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>{t("rc.returned")}: {cell.returnComment}</div> : null}
      <div className="faint px-3 pt-2 text-[12px]">{t("me.tip", { full })}</div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
        <table className="table cell-grid" role="grid" aria-label={t("app.marks")}>
          <thead><tr><th style={{ width: 64 }}>{t("col.roll")}</th><th>{t("col.name")}</th><th style={{ width: 140 }} className="text-right">{t("col.marks")} /{full}</th></tr></thead>
          <tbody>
            {roster.map((s, i) => {
              const p = parsed[i] as Parsed;
              return (
                <tr key={s.id}>
                  <td>{s.roll}</td><td>{s.name}</td>
                  <td className="!p-0" style={{ height: 34, background: !p.ok ? "color-mix(in srgb, var(--danger) 14%, transparent)" : undefined }}>
                    <input ref={(el) => { refs.current[i] = el; }} aria-label={`${s.name} ${t("col.marks")}`} aria-invalid={!p.ok} disabled={locked} value={vals[s.id] ?? ""} inputMode="decimal" enterKeyHint="next" autoComplete="off"
                      onChange={(e) => set(s.id, e.target.value)} onPaste={(e) => onPaste(e, i)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); focus(Math.max(0, i - 1)); }
                        else if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); focus(Math.min(roster.length - 1, i + 1)); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); focus(Math.max(0, i - 1)); }
                      }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 border-t px-3 py-2 text-[12px]" style={{ borderColor: "var(--line)" }}>
        <span>{t("me.filled", { a: filled, b: roster.length })}</span>
        {bad ? <span style={{ color: "var(--danger)" }}>{t("me.invalid", { n: bad, full })}</span> : null}
      </div>
      {paperOpen ? <PaperModal k={k} readOnly={paperLocked} onClose={() => setPaperOpen(false)} /> : null}
      <Modal open={confirm} onClose={() => setConfirm(false)} title={t("me.confirm.title")}
        footer={<><Btn onClick={() => setConfirm(false)}>{t("cancel")}</Btn><Btn variant="primary" disabled={submit.isPending} onClick={() => void submit.mutateAsync(undefined).then(() => { setConfirm(false); void qc.invalidateQueries({ queryKey: ["myCells"] }); }).catch(() => undefined)}>{t("me.submit")}</Btn></>}>
        <p className="text-[13px]">{t("me.confirm.body", { n: roster.length, c: cell.classNo, s: cell.section, sub: cell.subject })}</p>
        {!hasPaper ? <p className="mt-2 text-[12px]" style={{ color: "var(--warn)" }}>{t("paper.warn")}</p> : null}
      </Modal>
    </div>
  );
}
