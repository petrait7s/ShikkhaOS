"use client";
import { CalendarClock, ChevronRight, Flag, GraduationCap, Megaphone, Pin, PencilLine, Plus, Trophy, Upload, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTeachersQ, useExamsQ, useRoutineQ, useSubjectsQ, useMatrixQ, useMyCellsQ, useMyExamsQ, useNoticesQ, usePlatformQ, useSignupsQ, useStudentsQ } from "@/api/hooks";
import type { Exam } from "@/api/contracts";
import { Btn, Ring, Skeleton } from "@/components/ui";
import { countdown, fmtDateTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { SEASON_ACCENT } from "@/lib/season";
import { useUI } from "@/store/ui";
import { launch } from "./launch";
import { useActionItems } from "@/features/actions/useActionItems";
import { useSeason } from "./useSeason";
import { currentAndNext, periodTime } from "@/lib/routine";

export function pickExam(exams: Exam[] | undefined): Exam | undefined {
  if (!exams) return undefined;
  return exams.find((e) => e.name === "Annual") ?? exams.filter((e) => e.kind === "term").at(-1) ?? exams[0];
}

function Widget({ title, children, onClick, span }: { title: string; children: ReactNode; onClick?: () => void; span?: number }) {
  return (
    <section className={`card min-w-0 p-4 ${span === 2 ? "wspan-2" : ""}`}>
      <header className="mb-2 flex items-center justify-between">
        <h3 className="text-[11.5px] font-bold uppercase tracking-wider" style={{ color: "var(--ink-2)" }}>{title}</h3>
        {onClick ? <Btn variant="icon" size="sm" onClick={onClick} aria-label={title}><ChevronRight size={14} /></Btn> : null}
      </header>
      {children}
    </section>
  );
}

function SeasonBanner() {
  const { t } = useT();
  const season = useSeason();
  const session = useUI((s) => s.session);
  return (
    <section className="card relative overflow-hidden p-5" style={{ gridColumn: "1 / -1" }}>
            <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: SEASON_ACCENT[season] }}>{season === "admission" ? <GraduationCap size={20} /> : season === "exam" ? <PencilLine size={20} /> : season === "result" ? <Trophy size={20} /> : <Flag size={20} />}</span>
        <div>
          <div className="serif-bn text-lg font-bold">{t(`season.${season}.greet`)}{session ? `, ${session.name.split(",")[0]}` : ""}</div>
          <div className="muted text-[13px]">{t(`season.${season}.hint`)}</div>
        </div>
      </div>
    </section>
  );
}

function NoticesWidget() {
  const { t, lang } = useT();
  const { data, isLoading } = useNoticesQ();
  return (
    <Widget title={t("widget.notices")} onClick={() => launch("notices")}>
      {isLoading ? <Skeleton h={60} /> : (
        <ul className="grid gap-2">
          {(data ?? []).slice(0, 3).map((n) => (
            <li key={n.id} className="text-[13px]"><div className="font-semibold">{n.pinned ? <Pin size={12} className="mr-1 inline -translate-y-px" /> : null}{n.title}</div><div className="faint text-[11px]">{fmtDateTime(n.publishAt, lang)}</div></li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

function Quick({ items }: { items: { icon: ReactNode; label: string; app: string }[] }) {
  const { t } = useT();
  return (
    <Widget title={t("widget.quick")}>
      <div className="grid gap-2">
        {items.map((i) => <Btn key={i.label} className="justify-start" onClick={() => launch(i.app)}>{i.icon}{i.label}</Btn>)}
      </div>
    </Widget>
  );
}

function RoutineWidget() {
  const { t, lang } = useT();
  const q = useRoutineQ();
  const subjects = useSubjectsQ();
  const role = useUI((s) => s.session?.role);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(id); }, []);
  const bn = (s: string): string => (subjects.data ?? []).find((x) => x.subject === s)?.subjectBn ?? s;
  const { current, next, day } = currentAndNext(q.data ?? [], now);
  const line = (label: string, s: NonNullable<typeof current>) => (
    <div className="flex items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: "var(--paper-2)" }}>
      <div className="min-w-0"><div className="faint text-[11px] font-bold uppercase">{label}</div><div className="truncate font-bold">{lang === "bn" ? bn(s.subject) : s.subject}{role === "teacher" ? ` · ${s.classNo}-${s.section}` : ""}</div></div>
      <div className="faint shrink-0 text-[12px]">{periodTime(s.period)}</div>
    </div>
  );
  return (
    <Widget title={t("widget.routine")} onClick={() => launch("routine")}>
      {q.isLoading ? <Skeleton h={60} /> : day < 0 ? <p className="muted text-[13px]">{t("rt.weekend")}</p> : (
        <div className="grid gap-2">
          {current ? line(t("rt.now"), current) : null}
          {next ? line(t("rt.next"), next) : null}
          {!current && !next ? <p className="muted text-[13px]">{t("rt.noclass")}</p> : null}
        </div>
      )}
    </Widget>
  );
}

function RegistrarWidgets() {
  const { t, n } = useT();
  const signups = useSignupsQ();
  const students = useStudentsQ();
  const exams = useExamsQ();
  const exam = pickExam(exams.data);
  const matrix = useMatrixQ(exam?.id ?? "");
  const claimed = students.data ? students.data.filter((s) => s.status === "active").length / Math.max(1, students.data.length) : 0;
  let ready = 0, scheduled = 0, published = 0;
  if (matrix.data) {
    const rows = new Map<string, string[]>();
    for (const c of matrix.data.cells) rows.set(`${c.classNo}-${c.section}`, [...(rows.get(`${c.classNo}-${c.section}`) ?? []), c.state]);
    for (const [k, v] of rows) {
      const pub = matrix.data.publications.find((p) => `${p.classNo}-${p.section}` === k);
      if (pub?.state === "published") published++;
      else if (pub?.state === "scheduled") scheduled++;
      else if (v.every((x) => x === "verified")) ready++;
    }
  }
  return (
    <>
      <Widget title={t("widget.approvals")} onClick={() => launch("approvals")}>
        {signups.isLoading ? <Skeleton h={40} /> : <div className="flex items-baseline gap-2"><span className="text-3xl font-extrabold">{n(signups.data?.length ?? 0)}</span><span className="muted text-[13px]">{t("widget.approvals.sub")}</span></div>}
      </Widget>
      <Widget title={t("widget.publish")} onClick={() => launch("results")}>
        {matrix.isLoading ? <Skeleton h={40} /> : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><div className="text-2xl font-extrabold" style={{ color: "var(--ok)" }}>{n(ready)}</div><div className="faint text-[11px]">{t("widget.ready")}</div></div>
            <div><div className="text-2xl font-extrabold">{n(scheduled)}</div><div className="faint text-[11px]">{t("widget.scheduled")}</div></div>
            <div><div className="text-2xl font-extrabold">{n(published)}</div><div className="faint text-[11px]">{t("widget.published")}</div></div>
          </div>
        )}
      </Widget>
      <Widget title={t("widget.onboarding")} onClick={() => launch("students")}>
        <div className="flex items-center gap-3"><Ring value={claimed} label={t("widget.onboarding")} /><div className="muted text-[13px]">{t("widget.onboarding.sub")}</div></div>
      </Widget>
      <NoticesWidget />
      <Quick items={[
        { icon: <Upload size={14} />, label: t("quick.import"), app: "results" },
        { icon: <Megaphone size={14} />, label: t("quick.notice"), app: "notices" },
        { icon: <UserPlus size={14} />, label: t("quick.invite"), app: "teachers" },
      ]} />
    </>
  );
}

function TeacherWidgets() {
  const { t, n } = useT();
  const exams = useExamsQ();
  const exam = pickExam(exams.data);
  const cells = useMyCellsQ(exam?.id ?? "");
  const todo = (cells.data ?? []).filter((c) => c.state === "not_started" || c.state === "draft").length;
  const returned = (cells.data ?? []).filter((c) => c.returnComment).length;
  return (
    <>
      <Widget title={t("widget.marksdue")} onClick={() => launch("marks")}>
        {cells.isLoading ? <Skeleton h={40} /> : <div className="flex items-baseline gap-2"><span className="text-3xl font-extrabold">{n(todo)}</span><span className="muted text-[13px]">{t("widget.marksdue.sub")}</span></div>}
        {returned ? <div className="mt-1 text-[12px]" style={{ color: "var(--warn)" }}>{t("widget.returned", { n: returned })}</div> : null}
      </Widget>
      <RoutineWidget />
      <NoticesWidget />
      <Quick items={[
        { icon: <PencilLine size={14} />, label: t("app.marks"), app: "marks" },
        { icon: <Plus size={14} />, label: t("quick.article"), app: "magazine" },
      ]} />
    </>
  );
}

function StudentWidgets() {
  const { t, lang } = useT();
  const q = useMyExamsQ();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const pub = (q.data ?? []).filter((x) => x.state === "published");
  const sch = (q.data ?? []).find((x) => x.state === "scheduled");
  const latest = pub.at(-1);
  return (
    <>
      <Widget title={t("widget.result")} span={2}>
        {q.isLoading ? <Skeleton h={70} /> : sch ? (
          <div><div className="muted text-[13px]">{t("widget.result.coming", { time: fmtDateTime(sch.at ?? "", lang) })}</div><div className="mt-1 font-mono text-3xl font-extrabold tabular-nums" aria-live="off">{countdown(sch.at ?? "", now)}</div></div>
        ) : latest ? (
          <div className="flex items-center justify-between gap-3"><div><div className="font-bold">{lang === "bn" ? latest.exam.nameBn : latest.exam.name}</div><div className="muted text-[13px]">{t("widget.result.ready")}</div></div><Btn variant="primary" onClick={() => launch("myresults")}>{t("widget.result.open")}</Btn></div>
        ) : <div className="muted text-[13px]">{t("widget.result.none")}</div>}
      </Widget>
      <RoutineWidget />
      <NoticesWidget />
      <Quick items={[{ icon: <CalendarClock size={14} />, label: t("app.myresults"), app: "myresults" }, { icon: <Plus size={14} />, label: t("quick.article"), app: "magazine" }]} />
    </>
  );
}

function PetraWidgets() {
  const { t, n } = useT();
  const p = usePlatformQ();
  const crit = (p.errors.data ?? []).filter((e) => e.severity === "critical" || e.severity === "error").length;
  const last = p.metrics.data?.at(-1);
  return (
    <>
      <Widget title={t("app.schools")} onClick={() => launch("schools")}><div className="text-3xl font-extrabold">{n(p.schools.data?.length ?? 0)}</div></Widget>
      <Widget title={t("health.uptime")} onClick={() => launch("health")}><div className="text-3xl font-extrabold">{last ? `${n(last.uptime.toFixed(2))}%` : "—"}</div></Widget>
      <Widget title={t("widget.errors")} onClick={() => launch("errors")}><div className="text-3xl font-extrabold" style={{ color: crit ? "var(--danger)" : undefined }}>{n(crit)}</div></Widget>
    </>
  );
}

function ActionsWidget() {
  const { t, n } = useT();
  const { items, isLoading } = useActionItems();
  const top = items.slice(0, 3);
  return (
    <Widget title={`${t("app.actions")} · ${n(items.length)}`} onClick={() => launch("actions")} span={2}>
      {isLoading ? <Skeleton h={60} /> : top.length === 0 ? <p className="muted text-[13px]">{t("ac.clear")}</p> : (
        <ul className="grid gap-1">
          {top.map((i) => (
            <li key={i.id}>
              <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] hover:bg-[var(--hover)]" onClick={() => launch("actions")}>
                <span className={`prio prio-${i.priority}`} aria-hidden /><span className="sr-only">{t(`ac.prio.${i.priority}`)}</span>
                <span className="min-w-0 flex-1 truncate">{i.title}</span>
                <ChevronRight size={14} className="faint shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  );
}

function HeadmasterWidgets() {
  const { n } = useT();
  const students = useStudentsQ();
  const teachers = useTeachersQ();
  const exams = useExamsQ();
  const exam = pickExam(exams.data);
  const matrix = useMatrixQ(exam?.id ?? "");
  const cells = matrix.data?.cells ?? [];
  const verified = cells.filter((c) => c.state === "verified" || c.state === "published").length;
  const pct = cells.length ? verified / cells.length : 0;
  const published = (matrix.data?.publications ?? []).filter((p) => p.state === "published").length;
  const kpi = (label: string, value: string, sub: string) => (
    <div className="min-w-0"><div className="faint text-[11px] font-bold uppercase tracking-wider">{label}</div><div className="mt-1 text-3xl font-extrabold leading-none">{value}</div><div className="muted mt-1 truncate text-[12px]">{sub}</div></div>
  );
  return (
    <>
      <Widget title="School overview" span={2} onClick={() => launch("students")}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {kpi("Students", students.isLoading ? "…" : n(students.data?.length ?? 0), "on the roll")}
          {kpi("Teachers", teachers.isLoading ? "…" : n(teachers.data?.length ?? 0), "teaching staff")}
          {kpi("Marks verified", matrix.isLoading ? "…" : `${Math.round(pct * 100)}%`, exam ? exam.name : "—")}
          {kpi("Published", matrix.isLoading ? "…" : n(published), "classes this exam")}
        </div>
      </Widget>
      <Widget title="Your decision" onClick={() => launch("results")}>
        <div className="text-[13px]"><div className="muted">Verified results wait for approval and publishing.</div><button type="button" className="btn btn-primary mt-3" onClick={(e) => { e.stopPropagation(); launch("results"); }}>Open Results Center</button></div>
      </Widget>
      <RegistrarWidgets />
    </>
  );
}

export function Widgets() {
  const role = useUI((s) => s.session?.role);
  return (
    <div className="grid gap-4 p-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(260px, 100%), 1fr))", maxWidth: 1240 }}>
      <SeasonBanner />
      {role && role !== "petra" ? <ActionsWidget /> : null}
      {role === "headmaster" ? <HeadmasterWidgets /> : role === "registrar" ? <RegistrarWidgets /> : role === "teacher" ? <TeacherWidgets /> : role === "student" ? <StudentWidgets /> : role === "petra" ? <PetraWidgets /> : null}
    </div>
  );
}
