"use client";
import { useState } from "react";
import { repos } from "@/api/factory";
import type { Student, Teacher } from "@/api/contracts";
import { keys, useMut } from "@/api/hooks";
import { Btn, Field, Modal } from "@/components/ui";
import { PhotoField } from "@/components/PhotoField";
import { useT } from "@/lib/i18n";

export const BLOOD = ["", "A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

/** Registrar-side edit of a student or teacher profile. */
export function PersonEdit({ kind, person, onClose }: { kind: "student" | "teacher"; person: Student | Teacher; onClose: () => void }) {
  const { t } = useT();
  const st = kind === "student" ? (person as Student) : null;
  const te = kind === "teacher" ? (person as Teacher) : null;
  const [f, setF] = useState({
    name: person.name, nameBn: person.nameBn, photo: person.photo ?? null, bio: person.bio ?? "",
    guardian: st?.guardian ?? "", guardianPhone: st?.guardianPhone ?? "", phone: st?.phone ?? "", address: st?.address ?? "", bloodGroup: st?.bloodGroup ?? "",
    email: te?.email ?? "", designation: te?.designation ?? "",
  });
  const set = (k: keyof typeof f, v: string | null) => setF((p) => ({ ...p, [k]: v }));
  const save = useMut(() => repos.profile.updatePerson(kind, person.id, kind === "student"
    ? { name: f.name, nameBn: f.nameBn, photo: f.photo, bio: f.bio, guardian: f.guardian, guardianPhone: f.guardianPhone, phone: f.phone, address: f.address, bloodGroup: f.bloodGroup }
    : { name: f.name, nameBn: f.nameBn, photo: f.photo, bio: f.bio, email: f.email, designation: f.designation }), [keys.students, keys.teachers, keys.profile], () => t("pf.saved"));
  return (
    <Modal open onClose={onClose} title={t("pf.editperson")} width={560}
      footer={<><Btn onClick={onClose}>{t("cancel")}</Btn><Btn variant="primary" disabled={save.isPending} onClick={() => { save.mutate(undefined, { onSuccess: onClose }); }}>{t("save")}</Btn></>}>
      <div className="grid gap-3">
        <PhotoField name={f.name} photo={f.photo} onChange={(v) => set("photo", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("pf.name")}><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label={t("pf.namebn")}><input className="input" value={f.nameBn} onChange={(e) => set("nameBn", e.target.value)} /></Field>
        </div>
        {kind === "student" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("col.guardian")}><input className="input" value={f.guardian} onChange={(e) => set("guardian", e.target.value)} /></Field>
              <Field label={t("students.phone")}><input className="input" inputMode="numeric" value={f.guardianPhone} onChange={(e) => set("guardianPhone", e.target.value)} /></Field>
              <Field label={t("pf.phone")}><input className="input" inputMode="numeric" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
              <Field label={t("pf.blood")}><select className="select" value={f.bloodGroup} onChange={(e) => set("bloodGroup", e.target.value)}>{BLOOD.map((b) => <option key={b} value={b}>{b || "—"}</option>)}</select></Field>
            </div>
            <Field label={t("pf.address")}><input className="input" value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("teachers.email")}><input className="input" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label={t("pf.designation")}><input className="input" value={f.designation} onChange={(e) => set("designation", e.target.value)} /></Field>
          </div>
        )}
        <Field label={t("pf.bio")}><textarea className="textarea" maxLength={280} value={f.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
