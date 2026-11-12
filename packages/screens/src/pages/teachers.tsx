import * as React from "react";
import { can } from "@shikkhaos/permissions";
import type { Teacher } from "@shikkhaos/types";
import { ApiError } from "@shikkhaos/api-client";
import { username as usernameRule } from "@shikkhaos/validation";
import { useApp, useAction, useDebounced, usePagedList, useSession } from "../context";
import { Button, ConfirmDialog, ErrorState, Field, Input, Modal, PageHeader, Skeleton, StatusBadge, Table, useToast } from "../ui";

export function Teachers() {
  const s = useSession(); const { api } = useApp(); const toast = useToast();
  const [q, setQ] = React.useState(""); const dq = useDebounced(q); const [creating, setCreating] = React.useState(false); const [deact, setDeact] = React.useState<Teacher | null>(null);
  const list = usePagedList<Teacher>("/teachers", { q: dq });
  const setStatus = useAction(({ t, status }: { t: Teacher; status: string }) => api.patch(`/teachers/${t.id}`, { status }, { ifMatch: t.version }), { invalidate: ["/teachers"], success: "Updated" });
  return (
    <>
      <PageHeader title="Teachers" sub="Staff directory" actions={can(s, "teachers.create") ? <Button variant="primary" onClick={() => setCreating(true)}>Add teacher</Button> : null} />
      <Input placeholder="Search name or code" aria-label="Search teachers" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 280, marginBottom: 12 }} />
      <div className="card">{list.isLoading && !list.rows.length ? <div style={{ padding: 16 }}><Skeleton rows={6} /></div> : list.error ? <ErrorState error={list.error} /> :
        <Table rows={list.rows} rowKey={(r) => r.id} columns={[{ key: "n", header: "Name", render: (r) => <strong>{r.fullName}</strong> }, { key: "c", header: "Code", render: (r) => <span className="mono">{r.employeeCode}</span> }, { key: "d", header: "Designation", render: (r) => r.designation }, { key: "p", header: "Phone", render: (r) => r.phone || "—" }, { key: "s", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "a", header: "", render: (r) => <div className="row">{can(s, "teachers.update") && r.status === "ACTIVE" ? <Button size="sm" onClick={() => setStatus.mutate({ t: r, status: "ON_LEAVE" })}>On leave</Button> : null}{can(s, "teachers.update") && r.status === "ON_LEAVE" ? <Button size="sm" onClick={() => setStatus.mutate({ t: r, status: "ACTIVE" })}>Return</Button> : null}{can(s, "teachers.deactivate") && r.status !== "INACTIVE" ? <Button size="sm" variant="danger" onClick={() => setDeact(r)}>Deactivate</Button> : null}</div> }]} />}
        {list.hasMore ? <div style={{ padding: 12, textAlign: "center" }}><Button onClick={list.loadMore}>Load more</Button></div> : null}</div>
      {creating ? <AddTeacher onClose={() => setCreating(false)} /> : null}
      {deact ? <ConfirmDialog title="Deactivate teacher" danger typed={deact.employeeCode} confirmLabel="Deactivate" message={<>{deact.fullName} will be signed out and lose access. Their past records are kept.</>} onConfirm={async () => { await api.patch(`/teachers/${deact.id}`, { status: "INACTIVE" }, { ifMatch: deact.version }); toast("Teacher deactivated"); void list.refetch(); }} onClose={() => setDeact(null)} /> : null}
    </>
  );
}

function AddTeacher({ onClose }: { onClose: () => void }) {
  const { api } = useApp();
  const [f, setF] = React.useState({ employeeCode: "", fullName: "", username: "", email: "", designation: "", phone: "" }); const [errs, setErrs] = React.useState<Record<string, string>>({}); const [temp, setTemp] = React.useState<string>();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const create = useAction(async () => {
    const e: Record<string, string> = {}; const u = usernameRule.safeParse(f.username); if (!u.success) e.username = u.error.issues[0]!.message; if (!f.fullName.trim()) e.fullName = "Required"; if (f.employeeCode.trim().length < 2) e.employeeCode = "Required";
    if (Object.keys(e).length) { setErrs(e); throw new Error("Fix the highlighted fields"); } setErrs({});
    try { return await api.post<{ teacher: Teacher; temporaryPassword: string }>("/teachers", { employeeCode: f.employeeCode, fullName: f.fullName, username: f.username, ...(f.email ? { email: f.email } : {}), ...(f.designation ? { designation: f.designation } : {}), ...(f.phone ? { phone: f.phone } : {}) }); }
    catch (ex) { if (ex instanceof ApiError) setErrs(Object.fromEntries(ex.fieldErrors.map((x) => [x.field, x.message]))); throw ex; }
  }, { invalidate: ["/teachers"], onSuccess: (r) => setTemp(r.temporaryPassword) });
  if (temp) return <Modal title="Teacher added" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}><div className="stack"><div>Share these details securely. The password is shown once.</div><div className="card pad" style={{ padding: 12 }}>Username: <strong className="mono">{f.username}</strong><br />Temporary password: <strong className="mono">{temp}</strong></div></div></Modal>;
  return <Modal title="Add teacher" onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" busy={create.isPending} onClick={() => create.mutate(undefined)}>Add</Button></>}>
    <div className="form-grid"><Field label="Full name" error={errs.fullName}><Input value={f.fullName} onChange={set("fullName")} /></Field><Field label="Employee code" error={errs.employeeCode}><Input value={f.employeeCode} onChange={set("employeeCode")} /></Field><Field label="Username" error={errs.username}><Input value={f.username} onChange={set("username")} /></Field><Field label="Email (optional)" error={errs.email}><Input value={f.email} onChange={set("email")} /></Field><Field label="Designation"><Input value={f.designation} onChange={set("designation")} placeholder="Assistant Teacher" /></Field><Field label="Phone" error={errs.phone}><Input value={f.phone} onChange={set("phone")} /></Field></div></Modal>;
}
