"use client";
import { useQueryClient } from "@tanstack/react-query";
import { Palette } from "lucide-react";
import { toast } from "sonner";
import { repos } from "@/api/factory";
import { keys, usePlatformQ } from "@/api/hooks";
import { Badge, Btn, ErrorBox, Monogram, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { fmtDateTime } from "@/lib/dates";

export default function Schools() {
  const { t, lang, n } = useT();
  const { schools } = usePlatformQ();
  const qc = useQueryClient();
  if (schools.isLoading) return <SkeletonRows rows={5} />;
  if (schools.isError) return <ErrorBox error={schools.error} retry={() => void schools.refetch()} />;
  const setStatus = (id: string, status: "active" | "suspended") => {
    repos.platform.setStatus(id, status).then(() => { void qc.invalidateQueries({ queryKey: keys.platform }); toast.success(t("petra.status.ok")); }).catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("error.generic")));
  };
  return (
    <div className="p-4">
      <p className="muted mb-3 text-[13px]">{t("petra.note")}</p>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {(schools.data ?? []).map(({ school, students, teachers, lastActive }) => (
          <section key={school.id} className="card p-4">
            <div className="flex items-center gap-3">
              <Monogram text={school.monogram} color={school.primary} size={44} />
              <div className="min-w-0"><div className="serif-bn truncate font-bold">{lang === "bn" ? school.nameBn : school.name}</div><div className="faint text-[12px]">{school.city}</div></div>
            </div>
            <div className="mt-3 flex items-center justify-between"><Badge tone={school.status === "active" ? "ok" : school.status === "trial" ? "warn" : "danger"}>{t(`petra.status.${school.status}`)}</Badge><span className="faint text-[11px]">{t("petra.lastactive")}: {fmtDateTime(lastActive, lang)}</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center"><div className="hair p-2"><div className="text-xl font-extrabold">{n(students)}</div><div className="faint text-[11px]">{t("petra.users.students")}</div></div><div className="hair p-2"><div className="text-xl font-extrabold">{n(teachers)}</div><div className="faint text-[11px]">{t("petra.users.teachers")}</div></div></div>
            <div className="mt-3 flex gap-2">
              <Btn size="sm" onClick={() => { document.documentElement.style.setProperty("--school-primary", school.primary); toast.success(t("petra.theme.ok", { n: school.name })); }}><Palette size={13} />{t("petra.theme")}</Btn>
              {school.status === "suspended" ? <Btn size="sm" onClick={() => setStatus(school.id, "active")}>{t("petra.activate")}</Btn> : <Btn size="sm" onClick={() => setStatus(school.id, "suspended")}>{t("petra.suspend")}</Btn>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
