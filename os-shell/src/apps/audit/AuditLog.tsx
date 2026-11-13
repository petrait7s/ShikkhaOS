"use client";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuditQ } from "@/api/hooks";
import { Btn, Empty, ErrorBox, SkeletonRows } from "@/components/ui";
import { buildXlsx } from "@/lib/excel";
import { fmtDateTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { downloadBlob } from "@/lib/utils";

export default function AuditLog() {
  const { t, lang } = useT();
  const q = useAuditQ();
  const [text, setText] = useState("");
  const [role, setRole] = useState("");
  const [entity, setEntity] = useState("");
  const rows = useMemo(() => {
    const s = text.trim().toLowerCase();
    return (q.data ?? []).filter((a) => (!role || a.role === role) && (!entity || a.entity === entity) && (!s || `${a.actor} ${a.action} ${a.summary}`.toLowerCase().includes(s)));
  }, [q.data, text, role, entity]);
  const entities = useMemo(() => [...new Set((q.data ?? []).map((a) => a.entity))].sort(), [q.data]);
  if (q.isLoading) return <SkeletonRows rows={10} />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  return (
    <div className="flex h-full min-h-[380px] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
        <input className="input !w-[220px]" placeholder={t("search")} aria-label={t("search")} value={text} onChange={(e) => setText(e.target.value)} />
        <select className="select !w-auto" aria-label={t("audit.role")} value={role} onChange={(e) => setRole(e.target.value)}><option value="">{t("audit.role")}</option>{["headmaster", "registrar", "teacher", "student"].map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}</select>
        <select className="select !w-auto" aria-label={t("audit.entity")} value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">{t("audit.entity")}</option>{entities.map((r) => <option key={r}>{r}</option>)}</select>
        <div className="flex-1" />
        <Btn onClick={() => void buildXlsx([{ name: "Audit", rows: [["Time", "Actor", "Role", "Action", "Entity", "Summary"], ...rows.map((a) => [fmtDateTime(a.at, "en"), a.actor, a.role, a.action, a.entity, a.summary])], widths: [18, 24, 12, 22, 12, 60] }]).then((b) => downloadBlob(b, "audit-log.xlsx"))}><Download size={14} />{t("audit.export")}</Btn>
      </div>
      {rows.length === 0 ? <Empty title={t("audit.empty")} /> : (
        <div className="scroll-thin min-h-0 flex-1 overflow-auto p-3">
          <table className="table"><thead><tr><th>{t("audit.time")}</th><th>{t("audit.actor")}</th><th>{t("audit.action")}</th><th>{t("audit.summary")}</th></tr></thead>
            <tbody>{rows.map((a) => <tr key={a.id}><td className="whitespace-nowrap">{fmtDateTime(a.at, lang)}</td><td>{a.actor}<div className="faint text-[11px]">{t(`role.${a.role}`)}</div></td><td><code className="text-[12px]">{a.action}</code></td><td>{a.summary}</td></tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}
