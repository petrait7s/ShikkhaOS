import * as React from "react";
import { useApp, useAction, useList } from "../context";
import { Badge, Button, Empty, ErrorState, Field, Input, Modal, PageHeader, Skeleton, Table, Tabs, fmtDateTime } from "../ui";

interface Rep { id: string; status: string; reason: string; createdAt: string; messageId: string; conversationId: string; body: string; moderationState: string; senderName: string; reporterName: string }

export function Moderation() {
  const [tab, setTab] = React.useState("OPEN"); const q = useList<Rep>("/moderation/reports", { status: tab }); const [sel, setSel] = React.useState<Rep | null>(null);
  return <>
    <PageHeader title="Moderation" sub="Reported messages" />
    <Tabs value={tab} onChange={setTab} tabs={[{ id: "OPEN", label: "Open" }, { id: "REVIEWED", label: "Hidden" }, { id: "ACTIONED", label: "Actioned" }, { id: "DISMISSED", label: "Dismissed" }]} />
    <div className="card">{q.isLoading ? <div style={{ padding: 16 }}><Skeleton /></div> : q.error ? <ErrorState error={q.error} /> : <Table rows={q.data!} rowKey={(r) => r.id} onRow={setSel} empty={<Empty title="No reports">Nothing to review.</Empty>} columns={[{ key: "m", header: "Message", render: (r) => <span>“{r.body.slice(0, 80)}”</span> }, { key: "s", header: "From", render: (r) => r.senderName }, { key: "r", header: "Reported by", render: (r) => r.reporterName }, { key: "w", header: "Reason", render: (r) => r.reason }, { key: "d", header: "When", render: (r) => fmtDateTime(r.createdAt) }, { key: "x", header: "", render: (r) => <Badge tone={r.status === "OPEN" ? "warn" : undefined}>{r.status.toLowerCase()}</Badge> }]} />}</div>
    {sel ? <Review rep={sel} onClose={() => setSel(null)} /> : null}</>;
}

function Review({ rep, onClose }: { rep: Rep; onClose: () => void }) {
  const { api } = useApp(); const [note, setNote] = React.useState(""); const [hours, setHours] = React.useState("");
  const res = useAction((action: string) => api.post(`/moderation/reports/${rep.id}/resolve`, { action, note: note || undefined, ...(hours ? { suspendSenderHours: Number(hours) } : {}) }), { invalidate: ["/moderation"], success: "Resolved", onSuccess: onClose });
  const open = rep.status === "OPEN";
  return <Modal title="Review reported message" onClose={onClose} footer={open ? <><Button onClick={() => res.mutate("DISMISS")}>Dismiss</Button><Button busy={res.isPending} disabled={!note.trim()} onClick={() => res.mutate("HIDE")}>Hide message</Button><Button variant="danger" disabled={!note.trim()} onClick={() => res.mutate("ACTION")}>Hide & take action</Button></> : null}>
    <div className="stack"><div className="card pad" style={{ padding: 12 }}><div className="faint">{rep.senderName} wrote:</div>{rep.body}</div><div><strong>Reason:</strong> {rep.reason}</div>
      {open ? <><Field label="Moderator note (required to hide or act)"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field><Field label="Suspend sender's messaging (hours, optional)"><Input type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} /></Field></> : null}</div></Modal>;
}
