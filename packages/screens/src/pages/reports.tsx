import * as React from "react";
import { useApp, useGet } from "../context";
import { Button, Empty, ErrorState, PageHeader, Select, Skeleton, Table, useToast } from "../ui";
import { camelKey } from "./util";

const REPORTS = [["enrollment-summary", "Enrollment summary"], ["attendance-summary", "Attendance summary"], ["exam-analysis", "Exam analysis"], ["teacher-submission-status", "Teacher submission status"], ["result-distribution", "Result distribution"]] as const;

export function Reports() {
  const { api } = useApp(); const toast = useToast(); const [key, setKey] = React.useState<string>(REPORTS[0][0]);
  const q = useGet<{ rows: Record<string, unknown>[] }>(`/reports/${key}`);
  const cols = q.data?.rows[0] ? Object.keys(q.data.rows[0]) : [];
  const exportCsv = async () => { try { const r = await api.post<{ filename: string; content: string }>(`/reports/${key}/export`); const url = URL.createObjectURL(new Blob([r.content], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click(); URL.revokeObjectURL(url); } catch { toast("Export failed", "bad"); } };
  return <>
    <PageHeader title="Reports" sub="Academic and operational summaries" actions={<Button onClick={() => void exportCsv()} disabled={!q.data?.rows.length}>Export CSV</Button>} />
    <div className="row" style={{ marginBottom: 12 }}><Select aria-label="Report" value={key} onChange={(e) => setKey(e.target.value)} style={{ width: 280 }}>{REPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>
    <div className="card">{q.isLoading ? <div style={{ padding: 16 }}><Skeleton /></div> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <Table rows={q.data!.rows} rowKey={(_, ) => Math.random().toString(36)} empty={<Empty title="No data for this report yet" />} columns={cols.map((c) => ({ key: c, header: camelKey(c).replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()), render: (r: Record<string, unknown>) => String(r[c] ?? "") }))} />}</div></>;
}
