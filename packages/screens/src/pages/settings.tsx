import * as React from "react";
import { can } from "@shikkhaos/permissions";
import { useApp, useAction, useGet, useSession } from "../context";
import { Badge, Button, Card, ErrorState, Field, Input, PageHeader, ReauthDialog, Skeleton, Table } from "../ui";

interface School { name: string; nameBn: string | null; address: string; phone: string; email: string; motto: string; timezone: string; gradingScheme: { bands: { min: number; grade: string; point: number }[] }; features: { registrarCanPublishResults: boolean; studentToTeacherMessaging: boolean; studentToAdminMessaging: boolean }; version: number }

export function Settings() {
  const s = useSession(); const { api } = useApp(); const q = useGet<School>("/school");
  const [f, setF] = React.useState({ name: "", address: "", phone: "", email: "", motto: "" }); const [errs, setErrs] = React.useState<Record<string, string>>({}); const [reauth, setReauth] = React.useState<null | { patch: Record<string, boolean> }>(null);
  React.useEffect(() => { if (q.data) setF({ name: q.data.name, address: q.data.address, phone: q.data.phone, email: q.data.email, motto: q.data.motto }); }, [q.data]);
  const save = useAction(async () => { setErrs({}); try { await api.patch("/school", f, { ifMatch: q.data!.version }); } catch (e: any) { if (e.fieldErrors) setErrs(Object.fromEntries(e.fieldErrors.map((x: any) => [x.field, x.message]))); throw e; } }, { invalidate: ["/school"], success: "School profile saved" });
  const flags = useAction((v: { patch: Record<string, boolean>; t?: string }) => api.patch("/settings", v.patch, v.t ? { reauthToken: v.t } : {}), { invalidate: ["/school", "/settings"], success: "Setting updated" });
  if (q.isLoading) return <Skeleton rows={8} />; if (q.error) return <ErrorState error={q.error} />;
  const sc = q.data!; const canEdit = can(s, "school.settings.update"); const canSys = can(s, "settings.system.manage");
  return <>
    <PageHeader title="School settings" sub="Profile, grading and messaging policy" />
    <div className="stack">
      <Card title="School profile"><div className="form-grid"><Field label="Name" error={errs.name}><Input disabled={!canEdit} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label="Motto"><Input disabled={!canEdit} value={f.motto} onChange={(e) => setF({ ...f, motto: e.target.value })} /></Field><Field label="Address" full><Input disabled={!canEdit} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field><Field label="Phone" error={errs.phone}><Input disabled={!canEdit} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field><Field label="Email" error={errs.email}><Input disabled={!canEdit} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
        {canEdit ? <div style={{ marginTop: 12 }}><Button variant="primary" busy={save.isPending} onClick={() => save.mutate(undefined)}>Save profile</Button></div> : null}</Card>
      <Card title="Grading scheme"><Table rows={sc.gradingScheme.bands} rowKey={(b) => b.grade} columns={[{ key: "g", header: "Grade", render: (b) => <strong>{b.grade}</strong> }, { key: "m", header: "From (%)", align: "r", render: (b) => b.min }, { key: "p", header: "Grade point", align: "r", render: (b) => Number(b.point).toFixed(2) }]} /><div className="faint" style={{ marginTop: 8 }}>Results keep the scheme they were compiled with; changing it never alters published results.</div></Card>
      <Card title="Policies">{canSys ? <div className="stack">
        <label className="row"><input type="checkbox" checked={sc.features.registrarCanPublishResults} onChange={(e) => setReauth({ patch: { registrarCanPublishResults: e.target.checked } })} /> Allow the Register to publish results (also needs the per-exam flag)</label>
        <label className="row"><input type="checkbox" checked={sc.features.studentToTeacherMessaging} onChange={(e) => flags.mutate({ patch: { studentToTeacherMessaging: e.target.checked } })} /> Students may message their own teachers</label>
        <label className="row"><input type="checkbox" checked={sc.features.studentToAdminMessaging} onChange={(e) => flags.mutate({ patch: { studentToAdminMessaging: e.target.checked } })} /> Students may message the Headmaster/Register</label>
        <label className="row"><input type="checkbox" disabled checked={false} /> Student-to-student private messaging <Badge>Disabled in this release</Badge></label></div> : <div className="muted">Only the Headmaster can change policies.</div>}</Card></div>
    {reauth ? <ReauthDialog reauth={(pw) => api.reauth(pw)} onToken={async (t) => { await flags.mutateAsync({ patch: reauth.patch, t }); }} onClose={() => setReauth(null)} /> : null}</>;
}
