"use client";
import { isAdmin } from "@/lib/roles";
import { useEffect, useState } from "react";
import { repos } from "@/api/factory";
import { keys, useMeStudentQ, useMeTeacherQ, useMut, useMyProfileQ } from "@/api/hooks";
import { Btn, ErrorBox, Field, SkeletonRows } from "@/components/ui";
import { BLOOD } from "@/components/PersonEdit";
import { PhotoField } from "@/components/PhotoField";
import { fmtDate } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { useUI } from "@/store/ui";

function Row({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between gap-4 border-b py-2 text-[13px]" style={{ borderColor: "var(--line)" }}><span className="muted">{l}</span><span className="text-right font-semibold">{v}</span></div>;
}

export default function Profile() {
  const { t, lang } = useT();
  const role = useUI((s) => s.session?.role);
  const q = useMyProfileQ();
  const st = useMeStudentQ(role === "student");
  const te = useMeTeacherQ(role === "teacher");
  const [f, setF] = useState<{ nameBn: string; email: string; phone: string; address: string; bloodGroup: string; bio: string; photo: string | null } | null>(null);
  const [pw, setPw] = useState({ cur: "", next: "" });
  useEffect(() => {
    if (q.data && !f) setF({ nameBn: q.data.nameBn, email: q.data.email, phone: q.data.phone, address: q.data.address, bloodGroup: q.data.bloodGroup, bio: q.data.bio, photo: q.data.photo });
  }, [q.data, f]);
  const save = useMut(() => repos.profile.updateMe(role === "student"
    ? { nameBn: f?.nameBn, phone: f?.phone, address: f?.address, bloodGroup: f?.bloodGroup, bio: f?.bio, photo: f?.photo }
    : role === "teacher" ? { nameBn: f?.nameBn, email: f?.email, bio: f?.bio, photo: f?.photo } : { photo: f?.photo }), [keys.profile, keys.me, keys.students, keys.teachers], () => t("pf.saved"));
  const change = useMut(() => repos.profile.changePassword(pw.cur, pw.next), [], () => t("pf.pwok"));

  if (q.isLoading || !f) return <SkeletonRows rows={6} />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} />;
  const set = (k: keyof typeof f, v: string | null) => setF({ ...f, [k]: v });
  const p = q.data;

  return (
    <div className="mx-auto grid max-w-[560px] gap-5 p-5">
      <div>
        <PhotoField name={p.name} photo={f.photo} onChange={(v) => set("photo", v)} />
        <div className="serif-bn mt-3 text-xl font-bold">{lang === "bn" ? f.nameBn || p.name : p.name}</div>
        <div className="muted text-[13px]">{t(`role.${p.role}`)}{te.data ? ` · ${te.data.designation}` : ""}</div>
      </div>

      {!isAdmin(role) ? (
        <div className="grid gap-3">
          <Field label={t("pf.namebn")}><input className="input" value={f.nameBn} onChange={(e) => set("nameBn", e.target.value)} /></Field>
          {role === "teacher" ? <Field label={t("teachers.email")}><input className="input" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field> : null}
          {role === "student" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("pf.phone")}><input className="input" inputMode="numeric" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label={t("pf.blood")}><select className="select" value={f.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>{BLOOD.map((b) => <option key={b} value={b}>{b || "—"}</option>)}</select></Field>
            </div>
          ) : null}
          {role === "student" ? <Field label={t("pf.address")}><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} /></Field> : null}
          <Field label={t("pf.bio")}><textarea className="textarea" maxLength={280} value={f.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
        </div>
      ) : null}
      <div><Btn variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>{t("save")}</Btn></div>

      {!isAdmin(role) ? <div>
        <div className="label">{t("pf.locked")}</div>
        {st.data ? <><Row l={t("col.studentid")} v={st.data.studentId} /><Row l={t("col.class")} v={`${st.data.classNo}-${st.data.section}`} /><Row l={t("col.roll")} v={String(st.data.roll)} /><Row l={t("col.guardian")} v={st.data.guardian} /><Row l={t("students.admission")} v={fmtDate(st.data.admission, lang)} /></> : null}
        {te.data ? <><Row l={t("teachers.phone")} v={te.data.phone} /><Row l={t("teachers.assign")} v={String(te.data.assignments.length)} /></> : null}
        <p className="muted mt-2 text-[12px]">{t("profile.note")}</p>
      </div> : null}

      <div className="grid gap-3">
        <div className="label">{t("pf.password")}</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("pf.pwcur")}><input className="input" type="password" autoComplete="current-password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></Field>
          <Field label={t("pf.pwnew")}><input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
        </div>
        <div><Btn disabled={change.isPending || !pw.cur || pw.next.length < 8} onClick={() => change.mutate(undefined, { onSuccess: () => setPw({ cur: "", next: "" }) })}>{t("pf.pwchange")}</Btn></div>
      </div>
    </div>
  );
}
