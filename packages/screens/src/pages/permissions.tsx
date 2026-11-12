import * as React from "react";
import type { User } from "@shikkhaos/types";
import { ROLE_LABEL } from "@shikkhaos/types";
import { useApp, useAction, useGet, usePagedList, useDebounced } from "../context";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, Modal, PageHeader, ReauthDialog, Select, Skeleton, Table } from "../ui";

interface Catalog { permissions: string[]; delegable: string[] }
interface UserPerms { role: string; overrides: { permission: string; effect: string; reason: string }[]; effective: string[] }

export function Permissions() {
  const [q, setQ] = React.useState(""); const dq = useDebounced(q); const list = usePagedList<User>("/users", { q: dq }); const [sel, setSel] = React.useState<User | null>(null);
  return <>
    <PageHeader title="Roles & permissions" sub="Default access follows role. Delegate specific authority or revoke access per person." />
    <Input aria-label="Search people" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 260, marginBottom: 12 }} />
    <div className="card">{list.isLoading && !list.rows.length ? <div style={{ padding: 16 }}><Skeleton /></div> : list.error ? <ErrorState error={list.error} /> : <Table rows={list.rows.filter((u) => u.role !== "STUDENT")} rowKey={(r) => r.id} onRow={setSel} empty={<Empty title="No staff found" />} columns={[{ key: "n", header: "Name", render: (r) => <strong>{r.displayName}</strong> }, { key: "u", header: "Username", render: (r) => <span className="mono">{r.username}</span> }, { key: "r", header: "Role", render: (r) => ROLE_LABEL[r.role] }]} />}</div>
    {sel ? <Editor user={sel} onClose={() => setSel(null)} /> : null}</>;
}

function Editor({ user, onClose }: { user: User; onClose: () => void }) {
  const { api } = useApp(); const cat = useGet<Catalog>("/permissions/catalog"); const cur = useGet<UserPerms>(`/users/${user.id}/permissions`);
  const [draft, setDraft] = React.useState<Record<string, { effect: string; reason: string }>>({}); const [add, setAdd] = React.useState(""); const [reauth, setReauth] = React.useState(false);
  React.useEffect(() => { if (cur.data) setDraft(Object.fromEntries(cur.data.overrides.map((o) => [o.permission, { effect: o.effect, reason: o.reason }]))); }, [cur.data]);
  const save = useAction((t: string) => api.put(`/users/${user.id}/permissions`, { overrides: Object.entries(draft).map(([permission, v]) => ({ permission, effect: v.effect, reason: v.reason })) }, { reauthToken: t }), { invalidate: ["/users"], success: "Permissions updated" });
  const invalid = Object.values(draft).some((d) => !d.reason.trim());
  const candidates = (cat.data?.permissions ?? []).filter((p) => !(p in draft) && (cur.data?.effective.includes(p) ? true : cat.data?.delegable.includes(p)));
  return <Modal wide title={`${user.displayName} — permissions`} onClose={onClose} footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" disabled={invalid} onClick={() => setReauth(true)}>Save changes</Button></>}>
    {cur.isLoading || cat.isLoading ? <Skeleton rows={6} /> : cur.error ? <ErrorState error={cur.error} /> : <div className="stack">
      <div className="banner info">Only the Headmaster can change permissions. Each change needs a reason and your password, and is written to the audit log. Only delegable permissions can be granted beyond the role default.</div>
      <Card title="Overrides">{Object.keys(draft).length === 0 ? <div className="muted">No overrides — this person has their role's default access.</div> : <Table rows={Object.entries(draft)} rowKey={([p]) => p} columns={[{ key: "p", header: "Permission", render: ([p]) => <span className="mono">{p}</span> }, { key: "e", header: "Effect", render: ([p, v]) => <Select aria-label={`Effect for ${p}`} value={v.effect} onChange={(e) => setDraft({ ...draft, [p]: { ...v, effect: e.target.value } })}><option value="GRANT">Grant</option><option value="REVOKE">Revoke</option></Select> }, { key: "r", header: "Reason (required)", render: ([p, v]) => <Input aria-label={`Reason for ${p}`} value={v.reason} onChange={(e) => setDraft({ ...draft, [p]: { ...v, reason: e.target.value } })} /> }, { key: "x", header: "", render: ([p]) => <Button size="sm" onClick={() => { const n = { ...draft }; delete n[p]; setDraft(n); }}>Remove</Button> }]} />}
        <div className="row" style={{ marginTop: 12 }}><Select aria-label="Add permission" value={add} onChange={(e) => setAdd(e.target.value)} style={{ width: 280 }}><option value="">Add override…</option>{candidates.map((p) => <option key={p} value={p}>{p}{cat.data?.delegable.includes(p) ? " (delegable)" : ""}</option>)}</Select><Button disabled={!add} onClick={() => { setDraft({ ...draft, [add]: { effect: cat.data?.delegable.includes(add) && !cur.data?.effective.includes(add) ? "GRANT" : "REVOKE", reason: "" } }); setAdd(""); }}>Add</Button></div></Card>
      <Card title={`Effective permissions (${cur.data?.effective.length ?? 0})`}><div className="row">{cur.data?.effective.map((p) => <Badge key={p}>{p}</Badge>)}</div></Card></div>}
    {reauth ? <ReauthDialog reauth={(pw) => api.reauth(pw)} onToken={async (t) => { await save.mutateAsync(t); }} onClose={() => setReauth(false)} /> : null}</Modal>;
}
