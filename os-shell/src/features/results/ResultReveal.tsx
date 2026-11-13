"use client";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { Printer, Share2, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { repos } from "@/api/factory";
import { useMeStudentQ, useMyHistoryQ, useSchoolQ } from "@/api/hooks";
import { Btn, Monogram, Skeleton } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { downloadBlob } from "@/lib/utils";

function useCountUp(target: number, run: boolean, instant: boolean, ms = 1400): number {
  const [v, setV] = useState(instant ? target : 0);
  useEffect(() => {
    if (instant) { setV(target); return; }
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, instant, ms]);
  return v;
}

export function ResultReveal({ examId, onClose }: { examId: string; onClose: () => void }) {
  const { t, lang, n } = useT();
  const reduce = useReducedMotion() ?? false;
  const me = useMeStudentQ();
  const school = useSchoolQ();
  const hist = useMyHistoryQ();
  const res = useQuery({ queryKey: ["myResult", examId], queryFn: () => repos.result.myResult(examId) });
  const [stage, setStage] = useState(reduce ? 7 : 0);
  const cardRef = useRef<HTMLDivElement>(null);
  const r = res.data;
  const gpa = useCountUp(r?.gpa ?? 0, stage >= 1, reduce);

  useEffect(() => {
    if (!r || reduce) return;
    const timers = [200, 1800, 2400, 3300, 4200, 5100, 5800].map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [r, reduce]);

  const show = (s: number) => stage >= s;
  const radar = (r?.subjects ?? []).map((s) => ({ subject: lang === "bn" ? s.subjectBn : s.subject, v: typeof s.mark === "number" ? Math.round((s.mark / s.full) * 100) : 0 }));
  const growth = (hist.data ?? []).map((h) => ({ exam: lang === "bn" ? h.exam.nameBn : h.exam.name, gpa: h.result.gpa }));
  const examName = (hist.data ?? []).find((h) => h.exam.id === examId)?.exam;

  async function snapshot(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    const dark = document.documentElement.classList.contains("dark");
    const url = await toPng(cardRef.current, { pixelRatio: 2, backgroundColor: dark ? "#2a2722" : "#fffdf8", cacheBust: true });
    return (await fetch(url)).blob();
  }
  async function share() {
    try {
      const blob = await snapshot();
      if (!blob) return;
      const file = new File([blob], "result-card.png", { type: "image/png" });
      if (typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: t("reveal.share.title") });
      } else {
        downloadBlob(blob, "result-card.png");
        toast.success(t("reveal.saved"));
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      toast.error(t("reveal.share.err"));
    }
  }

  const fade = (s: number) => ({ initial: reduce ? false : { opacity: 0, y: 12 }, animate: show(s) ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }, transition: { duration: 0.5 } });

  return (
    <div className="fixed inset-0 z-[9800] overflow-auto" style={{ background: "color-mix(in srgb, var(--paper) 92%, var(--accent))" }} role="dialog" aria-modal="true" aria-label={t("reveal.title")}>
      <div className="no-print sticky top-0 z-10 flex items-center justify-end gap-2 p-3">
        <Btn disabled={!show(7)} onClick={() => void share()}><Share2 size={14} />{t("reveal.share")}</Btn>
        <Btn disabled={!show(7)} onClick={() => window.print()}><Printer size={14} />{t("reveal.print")}</Btn>
        {!show(7) && !reduce ? <Btn size="sm" onClick={() => setStage(7)}>{t("reveal.skip")}</Btn> : null}
        <Btn variant="icon" aria-label={t("close")} onClick={onClose}><X size={18} /></Btn>
      </div>
      <div className="mx-auto max-w-[760px] px-4 pb-16">
        {res.isLoading || !r ? <Skeleton h={420} /> : (
          <AnimatePresence>
            <motion.div ref={cardRef} className="card print-area p-6 sm:p-8" initial={reduce ? false : { scale: 0.92, opacity: 0, rotateX: 18 }} animate={{ scale: 1, opacity: 1, rotateX: 0 }} transition={{ duration: 0.6 }}>
              <header className="flex items-center gap-3">
                {school.data ? <Monogram text={school.data.monogram} color={school.data.primary} size={46} /> : null}
                <div className="min-w-0 flex-1">
                  <div className="serif-bn truncate text-lg font-bold">{school.data ? (lang === "bn" ? school.data.nameBn : school.data.name) : ""}</div>
                  <div className="muted text-[12px]">{examName ? (lang === "bn" ? examName.nameBn : examName.name) : ""} · {t("reveal.card")}</div>
                </div>
              </header>
              <div className="mt-4">
                <div className="serif-bn text-2xl font-bold">{me.data ? (lang === "bn" ? me.data.nameBn : me.data.name) : ""}</div>
                <div className="muted text-[13px]">{me.data ? `${t("rc.class", { c: me.data.classNo, s: me.data.section })} · ${t("col.roll")} ${n(me.data.roll)} · ${me.data.studentId}` : ""}</div>
              </div>

              <div className="my-6 flex items-end justify-center gap-6 text-center">
                <div>
                  <div className="faint text-[11px] font-bold uppercase tracking-wider">GPA</div>
                  <div className="text-6xl font-extrabold tabular-nums" style={{ color: r.passed ? "var(--accent)" : "var(--danger)" }} aria-label={`GPA ${r.gpa.toFixed(2)}`}>{n(gpa.toFixed(2))}</div>
                </div>
                <motion.div {...fade(2)} className="mb-2 grid size-16 place-items-center rounded-2xl text-2xl font-extrabold text-white" style={{ background: r.passed ? "var(--accent)" : "var(--danger)" }}>
                  {r.passed ? r.grade : t("reveal.failed")}
                </motion.div>
              </div>

              <motion.div {...fade(3)} className="grid gap-2">
                {r.subjects.map((s, i) => {
                  const p = typeof s.mark === "number" ? (s.mark / s.full) * 100 : 0;
                  return (
                    <div key={s.subject} className="grid grid-cols-[130px_1fr_70px] items-center gap-2 text-[13px] sm:grid-cols-[190px_1fr_90px]">
                      <span className="truncate font-semibold">{lang === "bn" ? s.subjectBn : s.subject}</span>
                      <span className="h-2.5 overflow-hidden rounded-full" style={{ background: "var(--paper-2)" }}>
                        <motion.span className="block h-full rounded-full" style={{ background: s.passed ? "var(--accent)" : "var(--danger)" }} initial={reduce ? false : { width: 0 }} animate={{ width: show(3) ? `${p}%` : 0 }} transition={{ duration: 0.7, delay: reduce ? 0 : i * 0.06 }} />
                      </span>
                      <span className="text-right tabular-nums">{s.mark === "AB" ? "AB" : n(s.mark ?? "—")} · {s.grade}</span>
                    </div>
                  );
                })}
              </motion.div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <motion.div {...fade(4)}>
                  <div className="faint mb-1 text-[11px] font-bold uppercase tracking-wider">{t("reveal.strengths")}</div>
                  <div style={{ width: "100%", height: 230 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radar} outerRadius="68%">
                        <PolarGrid stroke="var(--line)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10, fill: "var(--ink-2)" }} />
                        <Radar dataKey="v" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.3} isAnimationActive={!reduce} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
                <motion.div {...fade(5)}>
                  <div className="faint mb-1 text-[11px] font-bold uppercase tracking-wider">{t("reveal.growth")}</div>
                  <div style={{ width: "100%", height: 230 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={growth} margin={{ left: -18, right: 10, top: 10 }}>
                        <CartesianGrid stroke="var(--line)" vertical={false} />
                        <XAxis dataKey="exam" tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
                        <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
                        <Line type="monotone" dataKey="gpa" stroke="var(--accent)" strokeWidth={3} dot={{ r: 5, fill: "var(--accent)" }} isAnimationActive={!reduce} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              </div>

              <motion.div {...fade(6)} className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="hair p-3"><div className="text-2xl font-extrabold">{n(r.position)}<span className="faint text-sm">/{n(r.classSize)}</span></div><div className="faint text-[11px]">{t("reveal.position")}</div></div>
                <div className="hair p-3"><div className="text-2xl font-extrabold">{n(r.total)}</div><div className="faint text-[11px]">{t("reveal.total")}</div></div>
                <div className="hair p-3"><div className="text-2xl font-extrabold">{r.passed ? t("reveal.passed") : t("reveal.failed")}</div><div className="faint text-[11px]">{t("col.status")}</div></div>
              </motion.div>
            </motion.div>
          </AnimatePresence>
        )}
        {res.isError ? <div className="field-error mt-4 text-center" role="alert">{res.error instanceof Error ? res.error.message : t("error.generic")}</div> : null}
      </div>
    </div>
  );
}
