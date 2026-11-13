"use client";
import { Check, Copy, KeyRound, Link2, Pencil, Plus, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Teacher } from "@/api/contracts";
import { repos } from "@/api/factory";
import { keys, useInvitesQ, useMut, useSubjectsQ, useTeachersQ } from "@/api/hooks";
import { PersonEdit } from "@/components/PersonEdit";
import { Avatar, Badge, Btn, Drawer, Empty, ErrorBox, Field, Modal, SkeletonRows } from "@/components/ui";
import { ImportWizard } from "@/features/results/ImportWizard";
import { useT } from "@/lib/i18n";

export default function Teachers() {
  const { t, lang } = useT();
  const q = useTeachersQ();
  const inv = useInvitesQ();
  const subjects = useSubjectsQ();
  const [view, setView] = useState<"cards" | "table">("cards");
  const [sel, setSel] = useState<Teacher | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [wiz, setWiz] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  if (q.isLoading) return <SkeletonRows rows={8} />;
  if (q.isError) return <ErrorBox error={q.error} retry={() => void q.refetch()} />;
  const list = q.data ?? [];
  const link = (code: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/signup?invite=${code}`;
  const codeFor = (id: string) => (inv.data ?? []).find((i) => i.teacherId === id && i.status === "pending")?.code;
  const copy = (txt: string) => { void navigator.clipboard.writeText(txt).then(() => toast.success(t("copied"))); };

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--line)" }}>
        <div className="flex rounded-lg p-0.5" style={{ background: "var(--paper-2)" }}>
          {(["cards", "table"] as const).map((v) => <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className="h-7 rounded-md px-3 text-[12px] font-semibold" style={{ background: view === v ? "var(--card)" : "transparent" }}>{t(`view.${v}`)}</button>)}
        </div>
        <div className="flex-1" />
        <Btn onClick={() => setWiz(true)}><Upload size={14} />{t("teachers.import")}</Btn>
        <Btn variant="primary" onClick={() => setNewOpen(true)}><Plus size={14} />{t("teachers.invite")}</Btn>
      </div>
      {list.length === 0 ? <Empty title={t("teachers.empty")} /> : view === "cards" ? (
        <div className="scroll-thin grid flex-1 content-start gap-3 overflow-auto p-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))" }}>
          {list.map((x) => (
            <button key={x.id} type="button" className="card p-3 text-left" onClick={() => setSel(x)}>
              <div className="flex items-center gap-2"><Avatar name={x.name} size={36} photo={x.photo} /><div className="min-w-0"><div className="truncate font-bold">{lang === "bn" ? x.nameBn : x.name}</div><div className="faint truncate text-[12px]">{x.designation}</div></div></div>
              <div className="mt-2 flex items-center justify-between text-[12px]"><span className="muted">{x.phone}</span>{x.status === "invited" ? <Badge tone="warn">{t("teachers.invited")}</Badge> : <Badge tone="ok">{t("teachers.active")}</Badge>}</div>
              <div className="faint mt-1 text-[12px]">{t("teachers.assignments", { n: x.assignments.length })}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="scroll-thin flex-1 overflow-auto p-3">
          <table className="table"><thead><tr><th>{t("col.name")}</th><th>{t("teachers.phone")}</th><th>{t("teachers.designation")}</th><th>{t("col.status")}</th><th>{t("teachers.assign")}</th></tr></thead>
            <tbody>{list.map((x) => <tr key={x.id} className="cursor-pointer" onClick={() => setSel(x)}><td>{lang === "bn" ? x.nameBn : x.name}</td><td>{x.phone}</td><td>{x.designation}</td><td>{x.status === "invited" ? t("teachers.invited") : t("teachers.active")}</td><td>{x.assignments.length}</td></tr>)}</tbody></table>
        </div>
      )}

      <Drawer open={!!sel} onClose={() => setSel(null)} title={t("teachers.profile")} width={460}>
        {sel ? <Profile teacher={sel} code={codeFor(sel.id)} link={link} copy={copy} subjectsFor={(c) => (subjects.data ?? []).filter((d) => d.classNo === c).map((d) => d.subject)} /> : null}
      </Drawer>
      <NewInvite open={newOpen} onClose={() => setNewOpen(false)} onDone={(c) => { setCreated(c); setNewOpen(false); }} />
      <Modal open={!!created} onClose={() => setCreated(null)} title={t("teachers.invite.ready")} footer={<Btn variant="primary" onClick={() => setCreated(null)}>{t("close")}</Btn>}>
        {created ? <div className="grid gap-3 text-[13px]"><p className="muted">{t("teachers.invite.share")}</p>
          <div className="hair flex items-center justify-between gap-2 p-3"><div><div className="faint text-[11px]">{t("signup.invitecode")}</div><code className="text-lg font-extrabold">{created}</code></div><Btn size="sm" onClick={() => copy(created)}><Copy size={13} />{t("copy")}</Btn></div>
          <div className="hair flex items-center justify-between gap-2 p-3"><code className="min-w-0 truncate text-[12px]">{link(created)}</code><Btn size="sm" onClick={() => copy(link(created))}><Link2 size={13} />{t("copy")}</Btn></div></div> : null}
      </Modal>
      {wiz ? <ImportWizard open mode="teachers" onClose={() => setWiz(false)} /> : null}
    </div>
  );
}

function NewInvite({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (code: string) => void }) {
  const { t } = useT();
  const [f, setF] = useState({ name: "", phone: "", email: "", designation: "Assistant Teacher" });
  const [err, setErr] = useState<Record<string, string>>({});
  const m = useMut((v: typeof f) => repos.teacher.createInvite(v), [keys.teachers, keys.invites]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  function go() {
    const e: Record<string, string> = {};
    if (f.name.trim().length < 3) e.name = t("val.name");
    if (!/^\d{11}$/.test(f.phone)) e.phone = t("val.phone");
    if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = t("val.email");
    setErr(e);
    if (Object.keys(e).length) return;
    m.mutateAsync(f).then((i) => { setF({ name: "", phone: "", email: "", designation: "Assistant Teacher" }); onDone(i.code); }).catch(() => undefined);
  }
  return (
    <Modal open={open} onClose={onClose} title={t("teachers.invite")} footer={<><Btn onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={m.isPending} onClick={go}>{t("teachers.invite.gen")}</Btn></>}>
      <Field label={t("col.name")} error={err.name}><input className="input" value={f.name} onChange={set("name")} aria-invalid={!!err.name} /></Field>
      <Field label={t("teachers.phone")} error={err.phone}><input className="input" inputMode="numeric" value={f.phone} onChange={set("phone")} aria-invalid={!!err.phone} /></Field>
      <Field label={t("teachers.email")} error={err.email}><input className="input" value={f.email} onChange={set("email")} aria-invalid={!!err.email} /></Field>
      <Field label={t("teachers.designation")}><input className="input" value={f.designation} onChange={set("designation")} /></Field>
    </Modal>
  );
}

function Profile({ teacher, code, link, copy, subjectsFor }: { teacher: Teacher; code?: string; link: (c: string) => string; copy: (s: string) => void; subjectsFor: (c: number) => string[] }) {
  const { t, lang } = useT();
  const [classNo, setClassNo] = useState(6);
  const [section, setSection] = useState("A");
  const [subject, setSubject] = useState("");
  const [pw, setPw] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const save = useMut((a: Teacher["assignments"]) => repos.teacher.setAssignments(teacher.id, a), [keys.teachers], t("teachers.saved"));
  const [list, setList] = useState(teacher.assignments);
  const opts = subjectsFor(classNo);
  return (
    <div className="grid gap-3 text-[13px]">
      <div className="flex items-center gap-3"><Avatar name={teacher.name} size={52} photo={teacher.photo} /><div><div className="serif-bn text-lg font-bold">{lang === "bn" ? teacher.nameBn : teacher.name}</div><div className="muted">{teacher.designation}</div></div></div>
      <div className="muted">{teacher.phone} · {teacher.email}</div>
      <div><Btn size="sm" onClick={() => setEditing(true)}><Pencil size={13} />{t("pf.edit")}</Btn></div>
      {editing ? <PersonEdit kind="teacher" person={teacher} onClose={() => setEditing(false)} /> : null}
      {teacher.status === "invited" && code ? <div className="hair grid gap-2 p-3"><div className="faint text-[11px]">{t("signup.invitecode")}</div><code className="font-extrabold">{code}</code><Btn size="sm" onClick={() => copy(link(code))}><Link2 size={13} />{t("teachers.copylink")}</Btn></div> : null}
      <div>
        <div className="label">{t("teachers.assign")}</div>
        <ul className="mb-2 grid gap-1">{list.map((a, i) => <li key={`${a.classNo}${a.section}${a.subject}`} className="hair flex items-center justify-between px-2 py-1"><span>{t("rc.class", { c: a.classNo, s: a.section })} · {a.subject}</span><button type="button" className="faint text-[12px] underline" onClick={() => setList(list.filter((_, j) => j !== i))}>{t("remove")}</button></li>)}</ul>
        <div className="grid grid-cols-3 gap-2">
          <select className="select" aria-label={t("col.class")} value={classNo} onChange={(e) => { setClassNo(Number(e.target.value)); setSubject(""); }}>{Array.from({ length: 10 }, (_, i) => i + 1).map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select className="select" aria-label={t("col.section")} value={section} onChange={(e) => setSection(e.target.value)}><option>A</option><option>B</option></select>
          <select className="select" aria-label={t("col.subject")} value={subject} onChange={(e) => setSubject(e.target.value)}><option value="">—</option>{opts.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <div className="mt-2 flex gap-2">
          <Btn size="sm" disabled={!subject || list.some((a) => a.classNo === classNo && a.section === section && a.subject === subject)} onClick={() => { setList([...list, { classNo, section, subject }]); setSubject(""); }}><Check size={13} />{t("teachers.add")}</Btn>
          <Btn size="sm" variant="primary" disabled={save.isPending} onClick={() => save.mutate(list)}>{t("save")}</Btn>
        </div>
      </div>
      <Btn disabled={teacher.status === "invited"} onClick={() => { repos.teacher.resetPassword(teacher.id).then(setPw).catch((e: unknown) => toast.error(e instanceof Error ? e.message : t("error.generic"))); }}><KeyRound size={14} />{t("students.reset")}</Btn>
      {pw ? <div className="hair p-3"><div className="faint text-[11px]">{t("students.reset.temp")}</div><code className="text-base font-bold">{pw}</code></div> : null}
    </div>
  );
}
