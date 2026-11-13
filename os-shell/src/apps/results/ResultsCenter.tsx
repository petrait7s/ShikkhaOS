"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, CircleDashed, Download, FileUp, Globe, PencilLine, Send, ShieldCheck, Upload, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Cell, CellState, Publication } from "@/api/contracts";
import { repos } from "@/api/factory";
import { RESULT_KEYS, useExamsQ, useMatrixQ, useMut, useStudentsQ, useSubjectsQ, useTeachersQ } from "@/api/hooks";
import { Badge, Btn, Empty, ErrorBox, Field, Modal, SkeletonRows } from "@/components/ui";
import { SUBJECT_MASTER } from "@/data/names";
import { ImportWizard } from "@/features/results/ImportWizard";
import { classTemplate, subjectTemplate } from "@/features/results/importLogic";
import { buildXlsx } from "@/lib/excel";
import { fmtDateTime, fromLocalInput, toLocalInput } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { cn, downloadBlob } from "@/lib/utils";
import { useIntent } from "@/store/intent";
import { pickExam } from "@/os/Widgets";

const STATE_META: Record<CellState, { icon: LucideIcon; color: string }> = {
  not_started: { icon: CircleDashed, color: "#8a8274" },
  draft: { icon: PencilLine, color: "#2563eb" },
  submitted: { icon: Send, color: "#7c3aed" },
  uploaded: { icon: FileUp, color: "#c27a1a" },
  verified: { icon: ShieldCheck, color: "#059669" },
  published: { icon: Globe, color: "#0f766e" },
};
const STATES = Object.keys(STATE_META) as CellState[];

type Key = { classNo: number; section: string; subject: string };

function StateChip({ state }: { state: CellState }) {
  const { t } = useT();
  const m = STATE_META[state];
  return <span className="chip" style={{ color: m.color, borderColor: m.color }}><m.icon size={12} />{t(`state.${state}`)}</span>;
}

export default function ResultsCenter() {
  const { t, lang, n } = useT();
  const exams = useExamsQ();
  const [examId, setExamId] = useState("");
  const exam = exams.data?.find((e) => e.id === examId) ?? pickExam(exams.data);
  const eid = exam?.id ?? "";
  const matrix = useMatrixQ(eid);
  const subjects = useSubjectsQ();
  const students = useStudentsQ();
  const teachers = useTeachersQ();
  const [sel, setSel] = useState<Key | null>(null);
  const [wiz, setWiz] = useState<{ file: File | null; preset?: Partial<Key> } | null>(null);
  const [drag, setDrag] = useState(false);
  const [pubRow, setPubRow] = useState<{ classNo: number; section: string } | null>(null);
  const [unpubRow, setUnpubRow] = useState<{ classNo: number; section: string } | null>(null);
  const [returning, setReturning] = useState(false);
  const [stateFilter, setStateFilter] = useState<CellState | null>(null);
  const [query, setQuery] = useState("");
  const intent = useIntent((s) => s.intent);
  const clearIntent = useIntent((s) => s.clear);

  const rows = useMemo(() => {
    const set = new Map<string, { classNo: number; section: string }>();
    for (const c of matrix.data?.cells ?? []) set.set(`${c.classNo}-${c.section}`, { classNo: c.classNo, section: c.section });
    return [...set.values()].sort((a, b) => a.classNo - b.classNo || a.section.localeCompare(b.section));
  }, [matrix.data]);
  const cols = useMemo(() => {
    const used = new Set((matrix.data?.cells ?? []).map((c) => c.subject));
    return SUBJECT_MASTER.filter((s) => used.has(s.en));
  }, [matrix.data]);
  const cellMap = useMemo(() => new Map((matrix.data?.cells ?? []).map((c) => [`${c.classNo}-${c.section}-${c.subject}`, c])), [matrix.data]);
  const pubOf = (c: number, s: string): Publication | undefined => matrix.data?.publications.find((p) => p.classNo === c && p.section === s);
  const rowCells = (c: number, s: string): Cell[] => (matrix.data?.cells ?? []).filter((x) => x.classNo === c && x.section === s);
  const rowReady = (c: number, s: string) => { const l = rowCells(c, s); return l.length > 0 && l.every((x) => x.state === "verified") && !pubOf(c, s); };

  useEffect(() => {
    if (intent?.kind === "cell" && matrix.data) {
      setSel({ classNo: intent.classNo, section: intent.section, subject: intent.subject });
      clearIntent();
    }
    if (intent?.kind === "publish" && matrix.data) {
      const r = rows.find((x) => x.classNo === intent.classNo && rowReady(x.classNo, x.section));
      if (r) setPubRow(r);
      clearIntent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, matrix.data]);

  const verify = useMut((k: Key) => repos.marks.verify({ examId: eid, ...k }), [...RESULT_KEYS], t("rc.verified"));
  const publishAll = useMut(() => repos.result.publishAllReady(eid), [...RESULT_KEYS], (c) => t("rc.publishedall", { n: c }));
  const selCell = sel ? cellMap.get(`${sel.classNo}-${sel.section}-${sel.subject}`) : undefined;
  const selDef = sel ? subjects.data?.find((d) => d.classNo === sel.classNo && d.subject === sel.subject) : undefined;
  const readyCount = rows.filter((r) => rowReady(r.classNo, r.section)).length;
  const qn = query.trim().toLowerCase().replace(/^class\s*/, "");
  const visibleRows = rows.filter((r) => (!qn || `${r.classNo}-${r.section}`.toLowerCase().startsWith(qn) || `${r.classNo}${r.section}`.toLowerCase().startsWith(qn)) && (!stateFilter || rowCells(r.classNo, r.section).some((x) => x.state === stateFilter)));

  async function dlSubject() {
    if (!sel || !selDef) return;
    const list = (students.data ?? []).filter((s) => s.classNo === sel.classNo && s.section === sel.section).sort((a, b) => a.roll - b.roll);
    downloadBlob(await buildXlsx([subjectTemplate(list, selDef)]), `${exam?.name ?? "Exam"}_Class${sel.classNo}${sel.section}_${sel.subject.replace(/\W+/g, "")}.xlsx`);
  }
  async function dlClass(c: number, s: string) {
    const list = (students.data ?? []).filter((x) => x.classNo === c && x.section === s).sort((a, b) => a.roll - b.roll);
    const defs = (subjects.data ?? []).filter((d) => d.classNo === c);
    downloadBlob(await buildXlsx([classTemplate(list, defs)]), `${exam?.name ?? "Exam"}_Class${c}${s}.xlsx`);
  }

  if (exams.isLoading || matrix.isLoading) return <SkeletonRows rows={8} />;
  if (matrix.isError) return <ErrorBox error={matrix.error} retry={() => void matrix.refetch()} />;
  if (!exam) return <Empty title={t("rc.noexam")} />;

  return (
    <div className="relative flex h-full min-h-[420px]" onDragEnter={(e) => { if (e.dataTransfer.types.includes("Files")) setDrag(true); }}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
          <select className="select !w-auto" aria-label={t("rc.exam")} value={eid} onChange={(e) => { setExamId(e.target.value); setSel(null); }}>
            {(exams.data ?? []).map((e) => <option key={e.id} value={e.id}>{lang === "bn" ? e.nameBn : e.name}</option>)}
          </select>
          <div className="flex-1" />
          <Btn onClick={() => setWiz({ file: null })}><Upload size={14} />{t("rc.import")}</Btn>
          <Btn variant="primary" disabled={readyCount === 0 || publishAll.isPending} onClick={() => publishAll.mutate(undefined)}><Send size={14} />{t("rc.publishall")} ({n(readyCount)})</Btn>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <input className="input !h-8 !w-[180px]" type="search" placeholder={t("rc.findclass")} aria-label={t("rc.findclass")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("rc.legend")}>
            {STATES.map((s) => (
              <button key={s} type="button" aria-pressed={stateFilter === s} className="rounded-full" style={{ outline: stateFilter === s ? `2px solid ${STATE_META[s].color}` : undefined, outlineOffset: 1 }} onClick={() => setStateFilter(stateFilter === s ? null : s)} title={t("rc.filterby")}>
                <StateChip state={s} />
              </button>
            ))}
            {stateFilter || query ? <Btn size="sm" variant="ghost" onClick={() => { setStateFilter(null); setQuery(""); }}>{t("rc.clearfilter")}</Btn> : null}
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
          <table className="table min-w-[760px]">
            <thead><tr><th className="sticky-col">{t("col.class")}</th>{cols.map((c) => <th key={c.en}>{lang === "bn" ? c.bn : c.en}</th>)}<th>{t("rc.publish")}</th></tr></thead>
            <tbody>
              {visibleRows.length === 0 ? <tr><td colSpan={cols.length + 2}><Empty title={t("rc.nomatch")} /></td></tr> : null}
              {visibleRows.map((r) => {
                const pub = pubOf(r.classNo, r.section);
                const rc = rowCells(r.classNo, r.section);
                const doneN = rc.filter((x) => x.state === "verified" || x.state === "published").length;
                return (
                  <tr key={`${r.classNo}-${r.section}`}>
                    <td className="sticky-col whitespace-nowrap"><div className="font-bold">{t("rc.class", { c: r.classNo, s: r.section })}</div><div className="faint num text-[11.5px]">{t("rc.progress", { a: n(doneN), b: n(rc.length) })}</div></td>
                    {cols.map((c) => {
                      const cell = cellMap.get(`${r.classNo}-${r.section}-${c.en}`);
                      if (!cell) return <td key={c.en} className="faint text-center">—</td>;
                      const m = STATE_META[cell.state];
                      const active = sel && sel.classNo === r.classNo && sel.section === r.section && sel.subject === c.en;
                      const dim = stateFilter !== null && cell.state !== stateFilter;
                      return (
                        <td key={c.en} className="!p-1">
                          <button type="button" className="flex w-full min-w-[84px] flex-col items-center gap-0.5 whitespace-nowrap rounded-lg border px-1.5 py-1.5 text-[11px] font-semibold" aria-label={`${t("rc.class", { c: r.classNo, s: r.section })} ${c.en}: ${t(`state.${cell.state}`)}`}
                            style={{ color: m.color, borderColor: active ? "var(--accent)" : "var(--line)", background: `color-mix(in srgb, ${m.color} 10%, transparent)`, outline: active ? "2px solid var(--accent)" : undefined, opacity: dim ? 0.32 : 1 }}
                            onClick={() => setSel({ classNo: r.classNo, section: r.section, subject: c.en })}>
                            <m.icon size={14} />{t(`state.${cell.state}`)}
                          </button>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        {pub?.state === "published" ? <><Badge tone="ok">{t("state.published")}</Badge><Btn size="sm" onClick={() => setUnpubRow(r)}>{t("rc.unpublish")}</Btn></>
                          : pub?.state === "scheduled" ? <><Badge tone="warn">{fmtDateTime(pub.at, lang)}</Badge><Btn size="sm" onClick={() => setUnpubRow(r)}>{t("rc.cancelsched")}</Btn></>
                          : <Btn size="sm" variant={rowReady(r.classNo, r.section) ? "primary" : undefined} disabled={!rowReady(r.classNo, r.section)} onClick={() => setPubRow(r)}>{t("rc.publishclass", { c: r.classNo })}</Btn>}
                        <Btn size="sm" variant="icon" aria-label={t("rc.template.class")} onClick={() => void dlClass(r.classNo, r.section)}><Download size={13} /></Btn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="faint mt-3 text-[12px]">{t("rc.dragtip")}</p>
        </div>
      </div>

      {sel && selCell ? (
        <aside style={{ background: "var(--card-solid)", boxShadow: "-12px 0 30px rgba(12,34,51,.12), -0.5px 0 0 var(--line)" }} className="absolute inset-y-0 right-0 z-[6] flex w-full flex-col rounded-none border-y-0 border-r-0 sm:w-[360px]" aria-label={t("rc.panel")}>
          <div className="flex items-start justify-between gap-2 p-4">
            <div><div className="font-bold">{t("rc.class", { c: sel.classNo, s: sel.section })} · {sel.subject}</div><div className="mt-1"><StateChip state={selCell.state} /></div></div>
            <Btn variant="icon" aria-label={t("close")} onClick={() => setSel(null)}><X size={16} /></Btn>
          </div>
          <div className="muted px-4 text-[12px]">
            {selCell.submittedBy ? <div>{t("rc.by")}: {(teachers.data ?? []).find((x) => x.id === selCell.submittedBy)?.name ?? "—"}</div> : null}
            <div>{t("rc.updated")}: {selCell.updatedAt ? fmtDateTime(selCell.updatedAt, lang) : "—"}</div>
            {selCell.returnComment ? <div style={{ color: "var(--warn)" }}>{t("rc.returned")}: {selCell.returnComment}</div> : null}
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            <Btn variant="primary" disabled={(selCell.state !== "submitted" && selCell.state !== "uploaded") || verify.isPending} onClick={() => verify.mutate(sel)}><ShieldCheck size={14} />{t("rc.verify")}</Btn>
            <Btn disabled={selCell.state === "published" || selCell.state === "not_started"} onClick={() => setReturning(true)}>{t("rc.return")}</Btn>
            <Btn disabled={selCell.state === "published"} onClick={() => setWiz({ file: null, preset: sel })}><Upload size={14} />{t("rc.uploadhere")}</Btn>
            <Btn onClick={() => void dlSubject()}><Download size={14} />{t("rc.template")}</Btn>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-auto px-4 pb-4">
            {Object.keys(selCell.marks).length === 0 ? <Empty title={t("rc.nomarks")} /> : (
              <table className="table"><thead><tr><th>{t("col.roll")}</th><th>{t("col.name")}</th><th className="text-right">{t("col.marks")}{selDef ? ` /${selDef.full}` : ""}</th></tr></thead>
                <tbody>{(students.data ?? []).filter((s) => s.classNo === sel.classNo && s.section === sel.section).sort((a, b) => a.roll - b.roll).map((s) => {
                  const v = selCell.marks[s.id];
                  return <tr key={s.id}><td>{s.roll}</td><td>{s.name}</td><td className="text-right tabular-nums" style={{ color: v === undefined || v === null ? "var(--ink-3)" : v === "AB" ? "var(--warn)" : undefined }}>{v === undefined || v === null ? "—" : v}</td></tr>;
                })}</tbody></table>
            )}
          </div>
        </aside>
      ) : null}

      {drag ? (
        <div className="absolute inset-0 z-10 grid place-items-center border-2 border-dashed" style={{ background: "color-mix(in srgb, var(--accent) 12%, var(--card))", borderColor: "var(--accent)" }}
          onDragOver={(e) => e.preventDefault()} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) setWiz({ file: f }); }}>
          <div className="flex flex-col items-center gap-2 font-bold"><Upload size={32} style={{ color: "var(--accent)" }} />{t("rc.drophere")}</div>
        </div>
      ) : null}

      {wiz ? <ImportWizard open mode="marks" examId={eid} initialFile={wiz.file} preset={wiz.preset} onClose={() => setWiz(null)} /> : null}
      {pubRow ? <PublishDialog examId={eid} row={pubRow} onClose={() => setPubRow(null)} /> : null}
      {unpubRow ? <UnpublishDialog examId={eid} row={unpubRow} onClose={() => setUnpubRow(null)} /> : null}
      {returning && sel ? <ReturnDialog examId={eid} k={sel} onClose={() => setReturning(false)} /> : null}
    </div>
  );
}

function PublishDialog({ examId, row, onClose }: { examId: string; row: { classNo: number; section: string }; onClose: () => void }) {
  const { t, n } = useT();
  const sum = useQuery({ queryKey: ["summary", examId, row.classNo, row.section], queryFn: () => repos.result.summary(examId, row.classNo, row.section) });
  const [sched, setSched] = useState(false);
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() + 24 * 3600_000).toISOString()));
  const [ok, setOk] = useState(false);
  const pub = useMut(() => repos.result.publish(examId, row.classNo, row.section), [...RESULT_KEYS]);
  const schedule = useMut(() => repos.result.schedule(examId, row.classNo, row.section, fromLocalInput(at)), [...RESULT_KEYS], t("rc.scheduled"));
  const run = async () => {
    try {
      if (sched) { await schedule.mutateAsync(undefined); onClose(); } else { await pub.mutateAsync(undefined); setOk(true); }
    } catch { /* toast */ }
  };
  return (
    <Modal open onClose={onClose} title={t("rc.publish.title", { c: row.classNo, s: row.section })}
      footer={ok ? <Btn variant="primary" onClick={onClose}>{t("close")}</Btn> : <><Btn onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={pub.isPending || schedule.isPending || sum.isLoading} onClick={() => void run()}>{sched ? t("rc.schedule") : t("rc.publishnow")}</Btn></>}>
      {ok ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center"><CheckCircle2 size={44} style={{ color: "var(--ok)" }} /><div className="text-lg font-bold">{t("rc.success")}</div><div className="muted text-[13px]">{t("rc.success.sub")}</div></div>
      ) : (
        <>
          {sum.isLoading ? <SkeletonRows rows={2} /> : sum.data ? (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[[t("rc.sum.students"), n(sum.data.students)], [t("rc.sum.pass"), `${n(sum.data.passRate.toFixed(1))}%`], [t("rc.sum.gpa"), n(sum.data.avgGpa.toFixed(2))], [t("rc.sum.fail"), n(sum.data.failCount)]].map(([l, v]) => (
                <div key={l} className="hair p-3 text-center"><div className="text-xl font-extrabold">{v}</div><div className="faint text-[11px]">{l}</div></div>
              ))}
            </div>
          ) : null}
          <label className="mb-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={sched} onChange={(e) => setSched(e.target.checked)} />{t("rc.schedule.opt")}</label>
          {sched ? <Field label={t("rc.schedule.at")}><input className="input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field> : null}
          <p className="muted flex items-center gap-1.5 text-[12px]"><AlertTriangle size={13} />{t("rc.publish.warn")}</p>
        </>
      )}
    </Modal>
  );
}

function UnpublishDialog({ examId, row, onClose }: { examId: string; row: { classNo: number; section: string }; onClose: () => void }) {
  const { t } = useT();
  const [reason, setReason] = useState("");
  const m = useMut(() => repos.result.unpublish(examId, row.classNo, row.section, reason), [...RESULT_KEYS], t("rc.unpublished"));
  return (
    <Modal open onClose={onClose} title={t("rc.unpublish.title", { c: row.classNo, s: row.section })}
      footer={<><Btn onClick={onClose}>{t("cancel")}</Btn><Btn variant="danger" disabled={reason.trim().length < 3 || m.isPending} onClick={() => void m.mutateAsync(undefined).then(onClose).catch(() => undefined)}>{t("rc.unpublish")}</Btn></>}>
      <Field label={t("rc.reason")}><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <p className="muted text-[12px]">{t("rc.unpublish.note")}</p>
    </Modal>
  );
}

function ReturnDialog({ examId, k, onClose }: { examId: string; k: Key; onClose: () => void }) {
  const { t } = useT();
  const [c, setC] = useState("");
  const m = useMut(() => repos.marks.returnCell({ examId, ...k }, c), [...RESULT_KEYS], t("rc.returnedok"));
  return (
    <Modal open onClose={onClose} title={t("rc.return")}
      footer={<><Btn onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={c.trim().length < 3 || m.isPending} onClick={() => void m.mutateAsync(undefined).then(onClose).catch(() => undefined)}>{t("rc.return")}</Btn></>}>
      <Field label={t("rc.comment")}><textarea className={cn("textarea")} value={c} onChange={(e) => setC(e.target.value)} /></Field>
    </Modal>
  );
}
