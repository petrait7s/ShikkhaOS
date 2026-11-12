import * as React from "react";
import type { AuditLog } from "@shikkhaos/types";
import { useApp, usePagedList, useDebounced } from "../context";
import { Button, Empty, ErrorState, Input, Modal, PageHeader, Skeleton, Table, fmtDateTime, useToast } from "../ui";

export function Audit() {
  const { api } = useApp(); const toast = useToast(); const [action, setAction] = React.useState(""); const [entityType, setEt] = React.useState(""); const da = useDebounced(action);
  const q = usePagedList<AuditLog>("/audit-logs", { action: da, entityType }); const [sel, setSel] = React.useState<AuditLog | null>(null);
  const exportCsv = async () => { try { const r = await api.post<{ filename: string; content: string }>("/audit-logs/export"); const url = URL.createObjectURL(new Blob([r.content], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url); } catch { toast("Export not permitted or failed", "bad"); } };
  return <>
    <PageHeader title="Audit log" sub="Append-only record of every significant action" actions={<Button onClick={() => void exportCsv()}>Export CSV</Button>} />
    <div className="row" style={{ marginBottom: 12 }}><Input aria-label="Action prefix" placeholder="Action, e.g. result_set." value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 240 }} /><Input aria-label="Entity type" placeholder="Entity type" value={entityType} onChange={(e) => setEt(e.target.value)} style={{ width: 180 }} /></div>
    <div className="card">{q.isLoading && !q.rows.length ? <div style={{ padding: 16 }}><Skeleton rows={8} /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> :
      <Table rows={q.rows} rowKey={(r) => r.id} onRow={setSel} empty={<Empty title="No matching entries" />} columns={[{ key: "t", header: "Time", render: (r) => fmtDateTime(r.createdAt) }, { key: "a", header: "Actor", render: (r) => <span>{r.actorName ?? "System"} <span className="faint">{r.actorRole?.toLowerCase()}</span></span> }, { key: "x", header: "Action", render: (r) => <span className="mono">{r.action}</span> }, { key: "e", header: "Entity", render: (r) => `${r.entityType}${r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}` }]} />}
      {q.hasMore ? <div style={{ padding: 12, textAlign: "center" }}><Button onClick={q.loadMore}>Load more</Button></div> : null}</div>
    {sel ? <Modal title={sel.action} wide onClose={() => setSel(null)}><div className="grid cols-2"><div><h3>Before</h3><pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(sel.before ?? null, null, 2)}</pre></div><div><h3>After</h3><pre className="mono" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(sel.after ?? null, null, 2)}</pre></div></div></Modal> : null}</>;
}
