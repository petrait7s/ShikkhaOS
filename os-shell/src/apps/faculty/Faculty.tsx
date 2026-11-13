"use client";
import { useState } from "react";
import { useTeachersQ } from "@/api/hooks";
import { Avatar, Empty, ErrorBox, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function Faculty() {
  const { t, lang } = useT();
  const q = useTeachersQ();
  const [s, setS] = useState("");
  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const list = (q.data ?? []).filter((x) => x.status === "active" && `${x.name} ${x.nameBn} ${x.assignments.map((a) => a.subject).join(" ")}`.toLowerCase().includes(s.trim().toLowerCase()));
  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3" style={{ borderColor: "var(--line)" }}><input className="input !w-[260px]" placeholder={t("search")} aria-label={t("search")} value={s} onChange={(e) => setS(e.target.value)} /></div>
      {list.length === 0 ? <Empty title={t("fac.empty")} /> : (
        <div className="scroll-thin grid flex-1 content-start gap-3 overflow-auto p-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {list.map((x) => {
            const subs = [...new Set(x.assignments.map((a) => a.subject))];
            return (
              <div key={x.id} className="card p-3">
                <div className="flex items-center gap-2"><Avatar name={x.name} size={38} photo={x.photo} /><div className="min-w-0"><div className="truncate font-bold">{lang === "bn" ? x.nameBn : x.name}</div><div className="faint truncate text-[12px]">{x.designation}</div></div></div>
                <div className="mt-2 flex flex-wrap gap-1">{subs.map((su) => <span key={su} className="chip">{su}</span>)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
