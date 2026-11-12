import * as React from "react";
import { can } from "@shikkhaos/permissions";
import type { Notice, Role, SchoolClass, Section } from "@shikkhaos/types";
import { useApp, useAction, usePagedList, useList, useSession, useRealtimeInvalidate } from "../context";
import { t } from "../i18n";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageHeader, Skeleton, StatusBadge, Tabs, Textarea, fmtDate } from "../ui";

export function Notices() {
  const s = useSession(); const { api } = useApp(); const [tab, setTab] = React.useState("PUBLISHED"); const [creating, setCreating] = React.useState(false);
  useRealtimeInvalidate(["notice.published"], ["/notices"]);
  const q = usePagedList<Notice>("/notices", { status: tab === "ALL" ? undefined : tab });
  const act = (verb: string, ok: string) => useAction((n: Notice) => api.post(`/notices/${n.id}/${verb}`), { invalidate: ["/notices"], success: ok });
  const publish = act("publish", "Notice updated"); const archive = act("archive", "Archived");
  const staff = can(s, "notices.create");
  return <>
    <PageHeader title={t("Notices")} sub={t("School noticeboard")} actions={staff ? <Button variant="primary" onClick={() => setCreating(true)}>New notice</Button> : null} />
    {staff ? <Tabs value={tab} onChange={setTab} tabs={[{ id: "PUBLISHED", label: "Published" }, { id: "DRAFT", label: "Drafts" }, { id: "PENDING_APPROVAL", label: "Pending approval" }, { id: "ARCHIVED", label: "Archived" }]} /> : null}
    {q.isLoading && !q.rows.length ? <Skeleton rows={5} /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.rows.length === 0 ? <Empty title={t("No notices")}>{staff ? "Create a notice to inform students and staff." : "There are no notices for you right now."}</Empty> :
      <div className="stack">{q.rows.map((n) => <Card key={n.id} title={<>{n.pinned ? "📌 " : ""}{n.title}</>} actions={<><StatusBadge status={n.status} />{staff && (n.status === "DRAFT" || n.status === "PENDING_APPROVAL") ? <Button size="sm" variant="primary" onClick={() => publish.mutate(n)}>{can(s, "notices.publish") ? "Publish" : "Publish / send for approval"}</Button> : null}{staff && n.status === "PUBLISHED" ? <Button size="sm" onClick={() => archive.mutate(n)}>Archive</Button> : null}</>}>
        <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div><div className="faint" style={{ marginTop: 8 }}>{n.createdByName} · {fmtDate(n.publishedAt)} {audienceLabel(n)}</div></Card>)}{q.hasMore ? <Button onClick={q.loadMore}>Load more</Button> : null}</div>}
    {creating ? <NewNotice onClose={() => setCreating(false)} /> : null}</>;
}
const audienceLabel = (n: Notice) => { const a = n.audience; if (!a.roles.length && !a.classIds.length && !a.sectionIds.length) return "· Everyone"; return `· ${[...a.roles.map((r) => r.toLowerCase() + "s"), a.classIds.length ? `${a.classIds.length} class(es)` : "", a.sectionIds.length ? `${a.sectionIds.length} section(s)` : ""].filter(Boolean).join(", ")}`; };

function NewNotice({ onClose }: { onClose: () => void }) {
  const s = useSession(); const { api } = useApp(); const classes = useList<SchoolClass>("/classes"); const sections = useList<Section>("/sections");
  const [f, setF] = React.useState({ title: "", body: "", pinned: false }); const [roles, setRoles] = React.useState<Role[]>([]); const [classIds, setClassIds] = React.useState<string[]>([]); const [sectionIds, setSectionIds] = React.useState<string[]>([]); const [err, setErr] = React.useState<string>();
  const tog = <T,>(arr: T[], v: T, set: (a: T[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const go = useAction(() => api.post("/notices", { ...f, audience: { roles, classIds, sectionIds } }).catch((e) => { setErr(e.message); throw e; }), { invalidate: ["/notices"], success: "Saved as draft", onSuccess: onClose });
  return <Modal title="New notice" wide onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={go.isPending} disabled={!f.title || !f.body} onClick={() => go.mutate(undefined)}>Save draft</Button></>}>
    <div className="stack">{err ? <div className="banner bad">{err}</div> : null}<Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field><Field label="Message"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
      <fieldset><legend className="muted">Audience (leave empty for everyone)</legend><div className="row">{(["STUDENT", "TEACHER", "REGISTRAR"] as Role[]).map((r) => <label key={r} className="row"><input type="checkbox" checked={roles.includes(r)} onChange={() => tog(roles, r, setRoles)} /> {r.toLowerCase()}s</label>)}</div>
        <div className="row" style={{ marginTop: 8 }}>{classes.data?.map((c) => <label key={c.id} className="row"><input type="checkbox" checked={classIds.includes(c.id)} onChange={() => tog(classIds, c.id, setClassIds)} /> {c.name}</label>)}</div>
        <div className="row" style={{ marginTop: 8 }}>{sections.data?.map((c) => <label key={c.id} className="row"><input type="checkbox" checked={sectionIds.includes(c.id)} onChange={() => tog(sectionIds, c.id, setSectionIds)} /> {classes.data?.find((k) => k.id === c.classId)?.name}-{c.name}</label>)}</div></fieldset>
      {can(s, "notices.publish") ? <label className="row"><input type="checkbox" checked={f.pinned} onChange={(e) => setF({ ...f, pinned: e.target.checked })} /> Pin to top</label> : <Badge>Teacher notices to whole classes go to the Headmaster for approval</Badge>}</div></Modal>;
}
