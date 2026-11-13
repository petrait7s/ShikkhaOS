"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { repos } from "@/api/factory";
import { AuthFrame } from "@/components/AuthFrame";
import { Btn, Field } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useUI } from "@/store/ui";

const BRAND = { id: "petra", name: "Petra Console", nameBn: "পেট্রা কনসোল", city: "", monogram: "PE", primary: "#12385a" };

/** Hidden entry point for Petra staff. Not linked from anywhere in the school-facing app. */
export default function PetraConsoleLogin() {
  const { t } = useT();
  const router = useRouter();
  const setSession = useUI((s) => s.setSession);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const schema = z.object({ id: z.string().min(3, t("val.id")), password: z.string().min(1, t("val.password")) });
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  async function go(v: z.infer<typeof schema>) {
    setBusy(true);
    setErr(null);
    try {
      setSession(await repos.auth.loginPetra(v.id, v.password));
      router.replace("/desktop/");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("error.generic"));
      setBusy(false);
    }
  }

  return (
    <AuthFrame brand={BRAND} title={t("pc.title")}>
      <p className="muted mb-4 text-[13px]">{t("pc.sub")}</p>
      <form onSubmit={handleSubmit(go)} noValidate>
        <Field label={t("auth.id")} error={errors.id?.message}><input className="input" autoComplete="username" aria-invalid={!!errors.id} {...register("id")} /></Field>
        <Field label={t("auth.password")} error={errors.password?.message}><input className="input" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} /></Field>
        {err ? <div className="field-error mb-3" role="alert">{err}</div> : null}
        <Btn variant="primary" className="w-full" type="submit" disabled={busy}><LogIn size={15} />{busy ? t("auth.signing") : t("auth.signin")}</Btn>
      </form>
    </AuthFrame>
  );
}
