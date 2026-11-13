"use client";
import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { repos } from "@/api/factory";
import { keys, useMut } from "@/api/hooks";
import { Btn, Field, Monogram } from "@/components/ui";
import { useT } from "@/lib/i18n";

export default function CreateSchool() {
  const { t } = useT();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: "", city: "", primary: "#2b5fa8", registrarEmail: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [res, setRes] = useState<{ name: string; join: string; link: string; email: string } | null>(null);
  const m = useMut(() => repos.platform.createSchool(f), [keys.platform]);
  const mono = f.name.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase() || "SC";
  function next() {
    const e: Record<string, string> = {};
    if (step === 0) { if (f.name.trim().length < 3) e.name = t("val.name"); if (f.city.trim().length < 2) e.city = t("val.city"); }
    if (step === 2 && !/^\S+@\S+\.\S+$/.test(f.registrarEmail)) e.registrarEmail = t("val.email");
    setErr(e);
    if (Object.keys(e).length) return;
    if (step < 2) setStep(step + 1);
    else m.mutateAsync(undefined).then((r) => setRes({ name: r.school.name, join: r.school.joinCode, link: `${window.location.origin}${r.inviteLink}`, email: f.registrarEmail })).catch(() => undefined);
  }
  if (res) return (
    <div className="mx-auto grid max-w-[520px] gap-3 p-6 text-[13px]">
      <h3 className="text-lg font-bold">{t("cs.done", { n: res.name })}</h3>
      <div className="hair p-3"><div className="faint text-[11px]">{t("set.joincode")}</div><code className="text-lg font-extrabold">{res.join}</code></div>
      <div className="hair p-3"><div className="faint text-[11px]">{t("cs.invitelink")}</div><code className="break-all text-[12px]">{res.link}</code><div className="muted mt-1">{t("cs.registrar")}: {res.email} · welcome123</div></div>
      <Btn onClick={() => { void navigator.clipboard.writeText(res.link).then(() => toast.success(t("copied"))); }}><Copy size={14} />{t("copy")}</Btn>
      <Btn onClick={() => { setRes(null); setStep(0); setF({ name: "", city: "", primary: "#2b5fa8", registrarEmail: "" }); }}>{t("cs.another")}</Btn>
    </div>
  );
  return (
    <div className="mx-auto max-w-[520px] p-6">
      <ol className="mb-4 flex gap-1.5 text-[12px]">{["cs.s1", "cs.s2", "cs.s3"].map((k, i) => <li key={k} className="chip" style={i === step ? { background: "var(--accent)", color: "#fff", borderColor: "transparent" } : undefined}>{i + 1}. {t(k)}</li>)}</ol>
      {step === 0 ? <><Field label={t("set.name")} error={err.name}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field><Field label={t("set.city")} error={err.city}><input className="input" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field></> : null}
      {step === 1 ? <div className="flex items-center gap-4"><Monogram text={mono} color={f.primary} size={72} /><Field label={t("set.color")}><input className="input !w-24 !p-1" type="color" value={f.primary} onChange={(e) => setF({ ...f, primary: e.target.value })} /></Field></div> : null}
      {step === 2 ? <><Field label={t("cs.registrar.email")} error={err.registrarEmail}><input className="input" value={f.registrarEmail} onChange={(e) => setF({ ...f, registrarEmail: e.target.value })} /></Field><p className="muted text-[12px]">{t("cs.note")}</p></> : null}
      <div className="mt-4 flex gap-2">{step > 0 ? <Btn onClick={() => setStep(step - 1)}>{t("back")}</Btn> : null}<Btn variant="primary" disabled={m.isPending} onClick={next}>{step < 2 ? t("next") : t("create")}</Btn></div>
    </div>
  );
}
