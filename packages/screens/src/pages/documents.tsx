import * as React from "react";
import { can } from "@shikkhaos/permissions";
import type { Student } from "@shikkhaos/types";
import { useApp, useAction, useList, useSession, useGet, useDebounced } from "../context";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageHeader, Select, Skeleton, Table, Tabs, fmtDate, useToast } from "../ui";

interface Doc { id: string; title: string; category: string; fileId: string; visibility: string; filename: string; sizeBytes: number; createdAt: string }
interface Cert { id: string; studentId: string; fullName: string; type: string; serialNo: string; issuedAt: string; fileId: string }

async function openFile(api: ReturnType<typeof useApp>["api"], id: string) { const url = await api.downloadUrl(id); window.open(url, "_blank", "noopener"); }

export function Documents() {
  const s = useSession(); const [tab, setTab] = React.useState<"docs" | "certs">(can(s, "documents.read") ? "docs" : "certs");
  return <>
    <PageHeader title="Documents & certificates" sub="Official records, circulars and certificates" />
    <Tabs value={tab} onChange={setTab} tabs={[...(can(s, "documents.read") ? [{ id: "docs" as const, label: "Documents" }] : []), ...(can(s, "certificates.issue") ? [{ id: "certs" as const, label: "Certificates" }] : [])]} />
    {tab === "docs" ? <Docs /> : <Certs />}</>;
}

function Docs() {
  const s = useSession(); const { api } = useApp(); const toast = useToast(); const q = useList<Doc>("/documents"); const [open, setOpen] = React.useState(false);
  return <Card title="Documents" actions={can(s, "documents.manage") ? <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Upload document</Button> : null}>
    {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : <Table rows={q.data!} rowKey={(r) => r.id} empty={<Empty title="No documents yet" />} columns={[{ key: "t", header: "Title", render: (r) => <strong>{r.title}</strong> }, { key: "c", header: "Category", render: (r) => r.category }, { key: "v", header: "Visible to", render: (r) => <Badge>{r.visibility === "ALL" ? "Everyone" : "Staff"}</Badge> }, { key: "d", header: "Added", render: (r) => fmtDate(r.createdAt) }, { key: "a", header: "", render: (r) => <Button size="sm" onClick={() => openFile(api, r.fileId).catch(() => toast("Download failed", "bad"))}>Download</Button> }]} />}
    {open ? <Upload onClose={() => setOpen(false)} /> : null}</Card>;
}

function Upload({ onClose }: { onClose: () => void }) {
  const { api } = useApp(); const [f, setF] = React.useState({ title: "", category: "Circular", visibility: "STAFF" }); const [file, setFile] = React.useState<File | null>(null); const [err, setErr] = React.useState<string>(); const [busy, setBusy] = React.useState(false);
  const qc = useAction(async () => { setBusy(true); setErr(undefined); try { const up = await api.upload({ name: file!.name, type: file!.type, size: file!.size, data: file! }, "DOCUMENT"); await api.post("/documents", { title: f.title, category: f.category, fileId: up.id, visibility: f.visibility }); } catch (e) { setErr((e as Error).message); throw e; } finally { setBusy(false); } }, { invalidate: ["/documents"], success: "Document uploaded", onSuccess: onClose });
  return <Modal title="Upload document" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={busy} disabled={!file || !f.title} onClick={() => qc.mutate(undefined)}>Upload</Button></>}>
    <div className="form-grid">{err ? <div className="banner bad full" role="alert">{err}</div> : null}<Field label="Title" full><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Category"><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field><Field label="Visible to"><Select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}><option value="STAFF">Staff only</option><option value="ALL">Everyone</option></Select></Field>
      <Field label="File (PDF, image, docx, xlsx, txt; max 25 MB)" full><input type="file" accept=".pdf,image/*,.docx,.xlsx,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field></div></Modal>;
}

function Certs() {
  const { api } = useApp(); const toast = useToast(); const q = useList<Cert>("/certificates"); const [open, setOpen] = React.useState(false);
  return <Card title="Issued certificates" actions={<Button size="sm" variant="primary" onClick={() => setOpen(true)}>Issue certificate</Button>}>
    {q.isLoading ? <Skeleton /> : q.error ? <ErrorState error={q.error} /> : <Table rows={q.data!} rowKey={(r) => r.id} empty={<Empty title="No certificates issued" />} columns={[{ key: "n", header: "Serial", render: (r) => <span className="mono">{r.serialNo}</span> }, { key: "s", header: "Student", render: (r) => r.fullName }, { key: "t", header: "Type", render: (r) => r.type }, { key: "d", header: "Issued", render: (r) => fmtDate(r.issuedAt) }, { key: "a", header: "", render: (r) => <Button size="sm" onClick={() => openFile(api, r.fileId).catch(() => toast("Download failed", "bad"))}>Download PDF</Button> }]} />}
    {open ? <Issue onClose={() => setOpen(false)} /> : null}</Card>;
}

function Issue({ onClose }: { onClose: () => void }) {
  const { api } = useApp(); const [q, setQ] = React.useState(""); const dq = useDebounced(q); const students = useGet<Student[]>("/students", { q: dq, limit: 8 }); const [sid, setSid] = React.useState(""); const [type, setType] = React.useState("STUDYING"); const [remarks, setRemarks] = React.useState("");
  const go = useAction(() => api.post("/certificates/issue", { studentId: sid, type, remarks: remarks || undefined }), { invalidate: ["/certificates"], success: "Certificate issued", onSuccess: onClose });
  return <Modal title="Issue certificate" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={go.isPending} disabled={!sid} onClick={() => go.mutate(undefined)}>Issue</Button></>}>
    <div className="stack"><Field label="Find student"><Input value={q} onChange={(e) => setQ(e.target.value)} /></Field><Select size={5} aria-label="Student" value={sid} onChange={(e) => setSid(e.target.value)}>{students.data?.map((s) => <option key={s.id} value={s.id}>{s.fullName} — {s.studentCode}</option>)}</Select>
      <Field label="Type"><Select value={type} onChange={(e) => setType(e.target.value)}>{["STUDYING", "CHARACTER", "TRANSFER", "BONAFIDE", "OTHER"].map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field><Field label="Remarks (optional)"><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field></div></Modal>;
}
