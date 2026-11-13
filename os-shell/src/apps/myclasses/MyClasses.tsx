"use client";
import { School } from "lucide-react";
import { useExamsQ, useMeTeacherQ, useMyCellsQ, useStudentsQ } from "@/api/hooks";
import { Empty, ErrorBox, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { launch } from "@/os/launch";
import { pickExam } from "@/os/Widgets";

export default function MyClasses() {
  const { t, n } = useT();
  const me = useMeTeacherQ();
  const students = useStudentsQ();
  const exams = useExamsQ();
  const exam = pickExam(exams.data);
  const cells = useMyCellsQ(exam?.id ?? "");
  if (me.isLoading) return <SkeletonRows rows={5} />;
  if (me.isError) return <ErrorBox error={me.error} />;
  const list = me.data?.assignments ?? [];
  if (list.length === 0) return <Empty title={t("mc.none")} hint={t("mc.none.hint")} icon={<School size={22} />} />;
  return (
    <div className="grid gap-3 p-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
      {list.map((a) => {
        const count = (students.data ?? []).filter((s) => s.classNo === a.classNo && s.section === a.section).length;
        const cell = (cells.data ?? []).find((c) => c.classNo === a.classNo && c.section === a.section && c.subject === a.subject);
        return (
          <section key={`${a.classNo}${a.section}${a.subject}`} className="card p-4">
            <div className="text-lg font-extrabold">{t("rc.class", { c: a.classNo, s: a.section })}</div>
            <div className="muted text-[13px]">{a.subject} · {n(count)} {t("mc.students")}</div>
            <div className="mt-2"><span className="chip">{cell ? t(`state.${cell.state}`) : "—"}</span></div>
            <div className="mt-3 flex gap-2"><button type="button" className="btn btn-sm btn-primary" onClick={() => launch("marks")}>{t("app.marks")}</button><button type="button" className="btn btn-sm" onClick={() => launch("roster")}>{t("app.roster")}</button></div>
          </section>
        );
      })}
    </div>
  );
}
