"use client";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Season } from "@/api/contracts";
import { repos } from "@/api/factory";
import { keys, useGradingQ, useMut, useSchoolQ } from "@/api/hooks";
import { Btn, ErrorBox, Field, Modal, Monogram, SkeletonRows } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { SEASONS } from "@/lib/season";
import { useUI } from "@/store/ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card mb-4 p-4"><h3 className="mb-3 font-bold">{title}</h3>{children}</section>;
}

export default function SettingsApp() {
  const { t, lang } = useT();
  const q = useSchoolQ();
  const grading = useGradingQ();
  const qc = useQueryClient();
  const setLang = useUI((s) => s.setLang);
  const bnDigits = useUI((s) => s.bnDigits);
  const setBnDigits = useUI((s) => s.setBnDigits);
  const [f, setF] = useState({ name: "", nameBn: "", city: "", primary: "#2f7a5b" });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (q.data) setF({ name: q.data.name, nameBn: q.data.nameBn, city: q.data.city, primary: q.data.primary }); }, [q.data]);
  const update = useMut((v: typeof f) => repos.school.update(v), [keys.school], t("set.saved"));
  const auto = useMut((v: boolean) => repos.school.update({ autoApprove: v }), [keys.school]);
  const season = useMut((v: Season | null) => repos.school.setSeason(v), [keys.school], t("set.saved"));
  const regen = useMut(() => repos.school.regenerateJoinCode(), [keys.school], t("set.regen.ok"));
  if (q.isLoading || !q.data) return <SkeletonRows rows={8} />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const s = q.data;

  return (
    <div className="scroll-thin mx-auto max-w-[720px] p-4">
      <Section title={t("set.profile")}>
        <div className="mb-3 flex items-center gap-3"><Monogram text={s.monogram} color={f.primary} size={48} /><div className="muted text-[12px]">{t("set.profile.note")}</div></div>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <Field label={t("set.name")}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label={t("set.namebn")}><input className="input" value={f.nameBn} onChange={(e) => setF({ ...f, nameBn: e.target.value })} /></Field>
          <Field label={t("set.city")}><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
          <Field label={t("set.color")}><input className="input !p-1" type="color" value={f.primary} onChange={(e) => setF({ ...f, primary: e.target.value })} /></Field>
        </div>
        <Btn variant="primary" disabled={update.isPending || f.name.trim().length < 3} onClick={() => update.mutate(f)}><Save size={14} />{t("save")}</Btn>
      </Section>

      <Section title={t("set.access")}>
        <div className="flex flex-wrap items-center gap-3"><div><div className="faint text-[11px]">{t("set.joincode")}</div><code className="text-xl font-extrabold">{s.joinCode}</code></div><Btn size="sm" disabled={regen.isPending} onClick={() => regen.mutate(undefined)}><RefreshCw size={13} />{t("set.regen")}</Btn></div>
        <p className="muted mt-2 text-[12px]">{t("set.joincode.note")}</p>
        <label className="mt-3 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={s.autoApprove} onChange={(e) => auto.mutate(e.target.checked)} />{t("set.autoapprove")}</label>
      </Section>

      <Section title={t("set.season")}>
        <select className="select !w-auto" aria-label={t("set.season")} value={s.seasonOverride ?? ""} onChange={(e) => season.mutate(e.target.value === "" ? null : (e.target.value as Season))}>
          <option value="">{t("set.season.auto")}</option>{SEASONS.map((x) => <option key={x} value={x}>{t(`season.${x}`)}</option>)}
        </select>
      </Section>

      <Section title={t("set.grading")}>
        <div className="flex flex-wrap gap-1.5">{(grading.data?.scale ?? []).map((b) => <span key={b.min} className="chip">{b.min}+ → {b.grade} ({b.point.toFixed(2)})</span>)}</div>
        <p className="muted mt-2 text-[12px]">{t("set.grading.note", { p: grading.data?.passMark ?? 33 })}</p>
      </Section>

      <Section title={t("set.language")}>
        <div className="flex flex-wrap items-center gap-2">
          <Btn variant={lang === "en" ? "primary" : undefined} onClick={() => setLang("en")}>English</Btn>
          <Btn variant={lang === "bn" ? "primary" : undefined} onClick={() => setLang("bn")}>বাংলা</Btn>
          <label className="ml-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={bnDigits} onChange={(e) => setBnDigits(e.target.checked)} />{t("set.bndigits")}</label>
        </div>
      </Section>

      <Section title={t("set.demo")}>
        <p className="muted mb-3 text-[13px]">{t("set.demo.note")}</p>
        <Btn variant="danger" onClick={() => setConfirm(true)}><RotateCcw size={14} />{t("set.reset")}</Btn>
      </Section>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={t("set.reset")} footer={<><Btn onClick={() => setConfirm(false)}>{t("cancel")}</Btn><Btn variant="danger" onClick={() => { void repos.school.resetDemo().then(() => { qc.clear(); setConfirm(false); toast.success(t("set.reset.ok")); }); }}>{t("set.reset")}</Btn></>}>
        <p className="text-[13px]">{t("set.reset.confirm")}</p>
      </Modal>
    </div>
  );
}
