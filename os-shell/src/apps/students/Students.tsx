"use client";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, KeyRound, Pencil, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Student } from "@/api/contracts";
import { repos } from "@/api/factory";
import { useStudentsQ } from "@/api/hooks";
import { PersonEdit } from "@/components/PersonEdit";
import { Avatar, Badge, Btn, Drawer, Empty, ErrorBox, Ring, SkeletonRows } from "@/components/ui";
import { ImportWizard } from "@/features/results/ImportWizard";
import { fmtDate } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { useIntent } from "@/store/intent";

const GRID = "110px 56px minmax(160px,1.4fr) 70px 80px minmax(120px,1fr) 100px";

export default function Students() {
  const { t, lang, n } = useT();
  const q = useStudentsQ();
  const [search, setSearch] = useState("");
  const [cls, setCls] = useState("");
  const [sec, setSec] = useState("");
  const [status, setStatus] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [open, setOpen] = useState<Student | null>(null);
  const [wiz, setWiz] = useState(false);
  const [pw, setPw] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const intent = useIntent((s) => s.intent);
  const clear = useIntent((s) => s.clear);
  useEffect(() => { if (intent?.kind === "search" && intent.app === "students") { setSearch(intent.q); clear(); } }, [intent, clear]);

  const data = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((x) => (!cls || x.classNo === Number(cls)) && (!sec || x.section === sec) && (!status || x.status === status) && (!s || `${x.name} ${x.nameBn} ${x.studentId} ${x.guardian}`.toLowerCase().includes(s)));
  }, [q.data, search, cls, sec, status]);

  const stLabel = (s: Student["status"]) => (s === "active" ? t("st.claimed") : s === "pending" ? t("st.pending") : t("st.unclaimed"));
  const columns = useMemo<ColumnDef<Student>[]>(() => [
    { accessorKey: "studentId", header: t("col.studentid") },
    { accessorKey: "roll", header: t("col.roll") },
    { id: "name", accessorFn: (r) => (lang === "bn" ? r.nameBn : r.name), header: t("col.name"), cell: (c) => <span className="flex items-center gap-2"><Avatar name={c.row.original.name} size={24} photo={c.row.original.photo} /><span className="truncate">{String(c.getValue())}</span></span> },
    { accessorKey: "classNo", header: t("col.class") },
    { accessorKey: "section", header: t("col.section") },
    { accessorKey: "guardian", header: t("col.guardian") },
    { accessorKey: "status", header: t("col.status"), cell: (c) => <Badge tone={c.row.original.status === "active" ? "ok" : c.row.original.status === "pending" ? "warn" : undefined}>{stLabel(c.row.original.status)}</Badge> },
  ], [t, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = useReactTable({ data, columns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });
  const rows = table.getRowModel().rows;
  const parent = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 40, overscan: 12 });

  if (q.isLoading) return <SkeletonRows rows={10} />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const all = q.data ?? [];
  const claimed = all.filter((x) => x.status === "active").length / Math.max(1, all.length);

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
        <Ring value={claimed} size={52} stroke={6} label={t("widget.onboarding")} />
        <div className="mr-2 text-[12px]"><div className="font-bold">{n(all.filter((x) => x.status === "active").length)}/{n(all.length)}</div><div className="faint">{t("st.claimed")}</div></div>
        <input className="input !w-[200px]" placeholder={t("search")} aria-label={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="select !w-auto" aria-label={t("col.class")} value={cls} onChange={(e) => setCls(e.target.value)}><option value="">{t("col.class")}</option>{Array.from({ length: 10 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <select className="select !w-auto" aria-label={t("col.section")} value={sec} onChange={(e) => setSec(e.target.value)}><option value="">{t("col.section")}</option><option>A</option><option>B</option></select>
        <select className="select !w-auto" aria-label={t("col.status")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t("col.status")}</option><option value="active">{t("st.claimed")}</option><option value="pending">{t("st.pending")}</option><option value="unclaimed">{t("st.unclaimed")}</option></select>
        <div className="flex-1" />
        <span className="faint text-[12px]">{n(rows.length)} {t("students.shown")}</span>
        <Btn onClick={() => setWiz(true)}><Upload size={14} />{t("students.import")}</Btn>
      </div>
      {rows.length === 0 ? <Empty title={t("students.empty")} hint={t("students.empty.hint")} /> : (
        <div className="min-h-0 flex-1 overflow-hidden text-[13px]">
          <div className="grid items-center gap-2 border-b px-3 py-2 text-[11px] font-bold uppercase tracking-wider" style={{ gridTemplateColumns: GRID, borderColor: "var(--line)", color: "var(--ink-3)" }} role="row">
            {table.getHeaderGroups()[0]?.headers.map((h) => (
              <button key={h.id} type="button" className="flex items-center gap-1 text-left uppercase" onClick={h.column.getToggleSortingHandler()}>{flexRender(h.column.columnDef.header, h.getContext())}<ArrowUpDown size={11} /></button>
            ))}
          </div>
          <div ref={parent} className="scroll-thin h-[calc(100%-34px)] overflow-auto" role="table" aria-label={t("app.students")}>
            <div style={{ height: virt.getTotalSize(), position: "relative" }}>
              {virt.getVirtualItems().map((v) => {
                const r = rows[v.index];
                if (!r) return null;
                return (
                  <div key={r.id} role="row" tabIndex={0} className="absolute left-0 grid w-full cursor-pointer items-center gap-2 border-b px-3 hover:bg-[var(--paper-2)]" style={{ top: 0, transform: `translateY(${v.start}px)`, height: v.size, gridTemplateColumns: GRID, borderColor: "var(--line)" }}
                    onClick={() => setOpen(r.original)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(r.original); }}>
                    {r.getVisibleCells().map((c) => <div key={c.id} className="truncate" role="cell">{flexRender(c.column.columnDef.cell, c.getContext())}</div>)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {editing && open ? <PersonEdit kind="student" person={open} onClose={() => { setEditing(false); setOpen(null); }} /> : null}
      <Drawer open={!!open} onClose={() => { setOpen(null); setPw(null); }} title={t("students.profile")}>
        {open ? (
          <div className="grid gap-3 text-[13px]">
            <div className="flex items-center gap-3"><Avatar name={open.name} size={52} photo={open.photo} /><div><div className="serif-bn text-lg font-bold">{lang === "bn" ? open.nameBn : open.name}</div><div className="muted">{open.studentId}</div></div></div>
            {[[t("col.class"), `${open.classNo}-${open.section}`], [t("col.roll"), String(open.roll)], [t("col.guardian"), open.guardian], [t("students.phone"), open.guardianPhone], [t("students.admission"), fmtDate(open.admission, lang)], [t("col.status"), stLabel(open.status)]].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b py-1.5" style={{ borderColor: "var(--line)" }}><span className="muted">{l}</span><span className="font-semibold">{v}</span></div>
            ))}
            <Btn onClick={() => setEditing(true)}><Pencil size={14} />{t("pf.edit")}</Btn>
            <Btn disabled={open.status === "unclaimed"} onClick={() => { repos.student.resetPassword(open.id).then((p) => { setPw(p); toast.success(t("students.reset.ok")); }).catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("error.generic"))); }}><KeyRound size={14} />{t("students.reset")}</Btn>
            {pw ? <div className="hair p-3"><div className="faint text-[11px]">{t("students.reset.temp")}</div><code className="text-base font-bold">{pw}</code></div> : null}
          </div>
        ) : null}
      </Drawer>
      {wiz ? <ImportWizard open mode="roster" onClose={() => setWiz(false)} /> : null}
    </div>
  );
}
