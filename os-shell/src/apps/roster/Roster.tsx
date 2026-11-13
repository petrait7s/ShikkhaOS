"use client";
import { useState } from "react";
import { useMeTeacherQ, useStudentsQ } from "@/api/hooks";
import { Avatar, Empty, ErrorBox, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function Roster() {
  const { t, lang } = useT();
  const me = useMeTeacherQ();
  const students = useStudentsQ();
  const [pick, setPick] = useState("");
  if (me.isLoading || students.isLoading) return <SkeletonRows rows={8} />;
  if (me.isError) return <ErrorBox error={me.error} />;
  const groups = [...new Map((me.data?.assignments ?? []).map((a) => [`${a.classNo}-${a.section}`, a])).values()];
  if (groups.length === 0) return <Empty title={t("mc.none")} />;
  const key = pick || `${groups[0]?.classNo}-${groups[0]?.section}`;
  const [c, s] = key.split("-") as [string, string];
  const list = (students.data ?? []).filter((x) => x.classNo === Number(c) && x.section === s).sort((a, b) => a.roll - b.roll);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
        <select className="select !w-auto" aria-label={t("col.class")} value={key} onChange={(e) => setPick(e.target.value)}>{groups.map((g) => <option key={`${g.classNo}-${g.section}`} value={`${g.classNo}-${g.section}`}>{t("rc.class", { c: g.classNo, s: g.section })}</option>)}</select>
        <span className="faint text-[12px]">{list.length} {t("mc.students")}</span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
        <table className="table"><thead><tr><th>{t("col.roll")}</th><th>{t("col.name")}</th><th>{t("col.studentid")}</th><th>{t("col.guardian")}</th></tr></thead>
          <tbody>{list.map((x) => <tr key={x.id}><td>{x.roll}</td><td><span className="flex items-center gap-2"><Avatar name={x.name} size={24} photo={x.photo} />{lang === "bn" ? x.nameBn : x.name}</span></td><td>{x.studentId}</td><td>{x.guardian}</td></tr>)}</tbody></table>
      </div>
    </div>
  );
}
