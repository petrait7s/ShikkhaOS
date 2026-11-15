"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { repos } from "@/api/factory";
import { AuthFrame, useBrand } from "@/components/AuthFrame";
import { Btn, Field } from "@/components/ui";
import { DEMO_ACCOUNTS } from "@/data/seed";
import { AppIcon } from "@/os/AppIcon";
import { GraduationCap, Presentation, ShieldCheck, Table2, type LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useUI } from "@/store/ui";

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
const ROLE_ICON: Record<string, { icon: LucideIcon; color: string }> = {
  headmaster: { icon: ShieldCheck, color: "#22A752" }, registrar: { icon: Table2, color: "#FF8A1F" },
  teacher: { icon: Presentation, color: "#14B8A6" }, student: { icon: GraduationCap, color: "#4F6BFF" },
};

export default function LoginPage() {
  const { t } = useT();
  const brand = useBrand();
  const router = useRouter();
  const setSession = useUI((s) => s.setSession);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const schema = z.object({ id: z.string().min(3, t("val.id")), password: z.string().min(1, t("val.password")) });
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  async function go(id: string, password: string) {
    setBusy(true);
    setErr(null);
    try {
      const s = await repos.auth.login(id, password);
      setSession(s);
      router.replace("/desktop");
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("error.generic"));
      setBusy(false);
    }
  }

  return (
    <AuthFrame brand={brand} title={t("auth.signin")}>
      <form onSubmit={handleSubmit((v) => go(v.id, v.password))} noValidate>
        <Field label={t("auth.id")} error={errors.id?.message}>
          <input className="input" autoComplete="username" aria-invalid={!!errors.id} {...register("id")} />
        </Field>
        <Field label={t("auth.password")} error={errors.password?.message}>
          <input className="input" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...register("password")} />
        </Field>
        {err ? <div className="field-error mb-3" role="alert">{err}</div> : null}
        <Btn variant="primary" className="w-full !h-[56px] !text-[17px]" type="submit" disabled={busy}><LogIn size={15} />{busy ? t("auth.signing") : t("auth.signin")}</Btn>
        <div className="mt-4 flex justify-between text-[14.5px]">
          <Link href="/forgot" className="muted underline">{t("auth.forgot")}</Link>
          <Link href="/signup" className="underline" style={{ color: "var(--link)" }}>{t("auth.signup")}</Link>
        </div>
      </form>
      {DEMO ? (
        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <div className="faint mb-2 text-[12.5px] font-bold uppercase tracking-wider">{t("auth.enteras")}</div>
          <div className="role-chips">
            {DEMO_ACCOUNTS.map((a) => {
              const ic = ROLE_ICON[a.role];
              return (
                <button key={a.role} type="button" className="role-chip" disabled={busy} onClick={() => void go(a.id, a.password)} title={`${a.id} / ${a.password}`}>
                  <AppIcon icon={ic.icon} color={ic.color} size={44} />
                  <span>{t(`role.${a.role}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </AuthFrame>
  );
}
