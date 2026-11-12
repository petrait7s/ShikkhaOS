import * as React from "react";
import type { AttendanceSummary, PublishedResult, Student } from "@shikkhaos/types";
import { useApp, useGet, useAction } from "../context";
import { Badge, Button, Card, Empty, ErrorState, Field, Input, PageHeader, Select, Skeleton, StatusBadge, Table, fmtDate, useToast } from "../ui";
import { ResultCard } from "./students";
import { changePasswordSchema, firstErrors } from "@shikkhaos/validation";
import { t, useLang } from "../i18n";

function useMe() { return useGet<Student>("/students/me"); }

export function MyResults() {
  const { api } = useApp(); const toast = useToast(); const me = useMe(); const q = useGet<PublishedResult[]>(me.data ? `/students/${me.data.id}/results` : null); const cards = useGet<{ id: string; examName: string; revision: number; fileId: string }[]>(me.data ? `/students/${me.data.id}/report-cards` : null);
  if (me.isLoading || q.isLoading) return <Skeleton rows={6} />; if (me.error || q.error) return <ErrorState error={me.error ?? q.error} />;
  const dl = async (fileId: string) => { try { window.open(await api.downloadUrl(fileId), "_blank", "noopener"); } catch { toast("Download failed", "bad"); } };
  return <><PageHeader title={t("My results")} sub={t("Published exam results")} />
    {q.data!.length === 0 ? <Empty title={t("No results published yet")}>{t("You'll be notified when a result is published.")}</Empty> : <div className="stack">{q.data!.map((r) => { const card = cards.data?.find((c) => c.examName === r.examName); return <div key={r.resultSetId}><ResultCard r={r} />{card ? <div style={{ marginTop: 8 }}><Button onClick={() => void dl(card.fileId)}>{t("Download report card (PDF)")}</Button></div> : null}</div>; })}</div>}</>;
}

export function MyAttendance() {
  const me = useMe(); const q = useGet<{ summary: AttendanceSummary; records: { date: string; status: string }[] }>(me.data ? `/students/${me.data.id}/attendance` : null);
  if (me.isLoading || q.isLoading) return <Skeleton rows={6} />; if (me.error || q.error) return <ErrorState error={me.error ?? q.error} />;
  const { summary: a, records } = q.data!;
  return <><PageHeader title={t("My attendance")} /><div className="grid cols-4" style={{ marginBottom: 16 }}>{[["Attendance", `${a.percentage}%`], ["Present", a.present], ["Absent", a.absent], ["Late", a.late]].map(([l, v]) => <div key={String(l)} className="card stat"><div className="v">{v}</div><div className="l">{t(String(l))}</div></div>)}</div>
    <Card pad={false}><Table rows={records} rowKey={(r) => r.date + r.status} empty={<Empty title={t("No attendance recorded yet")} />} columns={[{ key: "d", header: "Date", render: (r) => fmtDate(r.date) }, { key: "s", header: "Status", render: (r) => <StatusBadge status={r.status} /> }]} /></Card></>;
}

export function MyClassTests() {
  const me = useMe(); const q = useGet<{ id: string; title: string; testDate: string; fullMarks: number; marks: number | null; absent: boolean; subjectName: string | null; label: string }[]>(me.data ? `/students/${me.data.id}/class-tests` : null);
  if (me.isLoading || q.isLoading) return <Skeleton rows={4} />; if (me.error || q.error) return <ErrorState error={me.error ?? q.error} />;
  return <><PageHeader title={t("Class tests")} sub={t("Shared by your teachers")} /><div className="banner info" style={{ marginBottom: 12 }}>{t("Class tests are not official exam results.")}</div>
    <Card pad={false}><Table rows={q.data!} rowKey={(r) => r.id} empty={<Empty title={t("No class tests shared yet")} />} columns={[{ key: "t", header: "Test", render: (r) => <strong>{r.title}</strong> }, { key: "s", header: "Subject", render: (r) => r.subjectName ?? "—" }, { key: "d", header: "Date", render: (r) => fmtDate(r.testDate) }, { key: "m", header: "Marks", align: "r", render: (r) => (r.absent ? <Badge>Absent</Badge> : `${r.marks} / ${r.fullMarks}`) }]} /></Card></>;
}

function LanguageField() {
  const { lang, setLang } = useLang();
  return <Field label={t("Language")}><Select value={lang} onChange={(e) => setLang(e.target.value as "en" | "bn")}><option value="en">English</option><option value="bn">বাংলা</option></Select></Field>;
}

export function MyProfile({ theme, setTheme, compact, setCompact }: { theme: string; setTheme: (t: "light" | "dark" | "system") => void; compact: boolean; setCompact: (v: boolean) => void }) {
  const { api, auth } = useApp(); const [cur, setCur] = React.useState(""); const [next, setNext] = React.useState(""); const [errs, setErrs] = React.useState<Record<string, string>>({});
  const devices = useGet<{ id: string; platform: string; lastSeenAt: string; current: boolean }[]>("/auth/devices");
  const change = useAction(async () => { const v = changePasswordSchema.safeParse({ currentPassword: cur, newPassword: next }); if (!v.success) { setErrs(firstErrors(v.error.issues)); throw new Error("Fix the highlighted fields"); } setErrs({}); try { await api.post("/auth/change-password", { currentPassword: cur, newPassword: next }); setCur(""); setNext(""); } catch (e: any) { if (e.fieldErrors) setErrs(Object.fromEntries(e.fieldErrors.map((x: any) => [x.field, x.message]))); throw e; } }, { success: "Password changed. Other devices were signed out." });
  const revoke = useAction((id: string) => api.del(`/auth/devices/${id}`), { invalidate: ["/auth"], success: "Device signed out" });
  return <><PageHeader title="Profile & settings" sub={`${auth.user.displayName} · ${auth.user.username}`} />
    <div className="grid cols-2">
      <Card title={t("Appearance")}><div className="stack"><LanguageField /><Field label={t("Theme")}><Select value={theme} onChange={(e) => setTheme(e.target.value as "light")}><option value="system">{t("Match system")}</option><option value="light">{t("Light")}</option><option value="dark">{t("Dark")}</option></Select></Field><label className="row"><input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} /> Compact density</label></div></Card>
      <Card title={t("Change password")}><div className="stack"><Field label="Current password" error={errs.currentPassword}><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" /></Field><Field label="New password" error={errs.newPassword}><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field><div><Button variant="primary" busy={change.isPending} onClick={() => change.mutate(undefined)}>Change password</Button></div></div></Card>
      <Card title={t("Signed-in devices")}><Table rows={devices.data ?? []} rowKey={(d) => d.id} empty={<Empty title="No devices" />} columns={[{ key: "p", header: "Device", render: (d) => <span>{d.platform} {d.current ? <Badge tone="ok">This device</Badge> : null}</span> }, { key: "l", header: "Last active", render: (d) => fmtDate(d.lastSeenAt) }, { key: "a", header: "", render: (d) => (d.current ? null : <Button size="sm" onClick={() => revoke.mutate(d.id)}>Sign out</Button>) }]} /></Card>
      <Card title={t("Keyboard shortcuts")}><ul style={{ margin: 0, padding: 0, listStyle: "none" }}>{[["Ctrl K", "Search and jump"], ["Ctrl Shift N", "Notifications"], ["Ctrl ,", "Profile & settings"], ["Ctrl 1–9", "Go to module"], ["Ctrl W", "Close tab"]].map(([k, v]) => <li key={k} className="row"><kbd className="mono">{k}</kbd><span className="muted">{v}</span></li>)}</ul></Card></div></>;
}
