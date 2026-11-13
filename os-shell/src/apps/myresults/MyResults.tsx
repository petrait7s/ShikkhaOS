"use client";
import { Award, Clock, Lock, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useMyExamsQ, useMyHistoryQ } from "@/api/hooks";
import { Btn, Empty, SkeletonRows } from "@/components/ui";
import { ResultReveal } from "@/features/results/ResultReveal";
import { countdown, fmtDateTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";

export default function MyResults() {
  const { t, lang, n } = useT();
  const exams = useMyExamsQ();
  const hist = useMyHistoryQ();
  const [open, setOpen] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  if (exams.isLoading) return <SkeletonRows rows={5} />;
  const list = exams.data ?? [];
  if (list.length === 0) return <Empty title={t("mr.none")} />;
  const growth = (hist.data ?? []).map((h) => ({ exam: lang === "bn" ? h.exam.nameBn : h.exam.name, gpa: h.result.gpa }));
  return (
    <div className="grid gap-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map(({ exam, state, at }) => {
          const h = (hist.data ?? []).find((x) => x.exam.id === exam.id);
          return (
            <section key={exam.id} className="card p-4">
              <div className="flex items-center gap-2"><Award size={18} style={{ color: "var(--accent)" }} /><h3 className="font-bold">{lang === "bn" ? exam.nameBn : exam.name}</h3></div>
              {state === "published" ? (
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div><div className="text-3xl font-extrabold" style={{ color: "var(--accent)" }}>{h ? n(h.result.gpa.toFixed(2)) : "—"}</div><div className="faint text-[12px]">{h ? `${h.result.passed ? h.result.grade : t("reveal.failed")} · ${t("reveal.position")} ${n(h.result.position)}/${n(h.result.classSize)}` : ""}</div></div>
                  <Btn variant="primary" onClick={() => setOpen(exam.id)}><Trophy size={14} />{t("mr.open")}</Btn>
                </div>
              ) : state === "scheduled" && at ? (
                <div className="mt-3"><div className="muted flex items-center gap-1.5 text-[13px]"><Clock size={13} />{t("widget.result.coming", { time: fmtDateTime(at, lang) })}</div><div className="mt-1 font-mono text-2xl font-extrabold tabular-nums">{countdown(at, now)}</div></div>
              ) : <div className="muted mt-3 flex items-center gap-1.5 text-[13px]"><Lock size={13} />{t("mr.notpublished")}</div>}
            </section>
          );
        })}
      </div>
      {growth.length > 1 ? (
        <section className="card p-4">
          <h3 className="faint mb-2 text-[11px] font-bold uppercase tracking-wider">{t("reveal.growth")}</h3>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growth} margin={{ left: -18, right: 10, top: 10 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="exam" tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
                <Line type="monotone" dataKey="gpa" stroke="var(--accent)" strokeWidth={3} dot={{ r: 5, fill: "var(--accent)" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}
      {open ? <ResultReveal examId={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
