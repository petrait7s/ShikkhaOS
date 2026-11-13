"use client";
import { useState } from "react";
import { usePlatformQ } from "@/api/hooks";
import { Badge, Empty, ErrorBox, SkeletonRows } from "@/components/ui";
import { fmtDateTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";

const ORDER = { critical: 0, error: 1, warn: 2, info: 3 } as const;

export default function Errors() {
  const { t, lang, n } = useT();
  const { errors, schools } = usePlatformQ();
  const [sev, setSev] = useState("");
  if (errors.isLoading) return <SkeletonRows rows={6} />;
  if (errors.isError) return <ErrorBox error={errors.error} retry={() => void errors.refetch()} />;
  const list = [...(errors.data ?? [])].filter((e) => !sev || e.severity === sev).sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || b.count - a.count);
  const nameOf = (id: string) => (schools.data ?? []).find((s) => s.school.id === id)?.school.name ?? id;
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3" style={{ borderColor: "var(--line)" }}><select className="select !w-auto" aria-label={t("errors.severity")} value={sev} onChange={(e) => setSev(e.target.value)}><option value="">{t("errors.severity")}</option>{(["critical", "error", "warn", "info"] as const).map((s) => <option key={s} value={s}>{t(`sev.${s}`)}</option>)}</select></div>
      {list.length === 0 ? <Empty title={t("errors.empty")} /> : (
        <div className="scroll-thin flex-1 overflow-auto p-3"><table className="table"><thead><tr><th>{t("errors.severity")}</th><th>{t("errors.group")}</th><th>{t("errors.school")}</th><th>{t("errors.count")}</th><th>{t("errors.last")}</th></tr></thead>
          <tbody>{list.map((e) => <tr key={e.id}><td><Badge tone={e.severity === "critical" || e.severity === "error" ? "danger" : e.severity === "warn" ? "warn" : undefined}>{t(`sev.${e.severity}`)}</Badge></td><td>{e.group}</td><td>{nameOf(e.schoolId)}</td><td className="tabular-nums">{n(e.count)}</td><td className="whitespace-nowrap">{fmtDateTime(e.lastSeen, lang)}</td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}
