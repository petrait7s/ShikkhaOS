"use client";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { repos } from "@/api/factory";
import type { Teacher } from "@/api/contracts";
import { AuthFrame, useBrand } from "@/components/AuthFrame";
import { Btn, Field } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function TeacherSignup({ code }: { code: string }) {
  const { t } = useT();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    repos.auth.previewInvite(code).then((r) => setTeacher(r.teacher)).catch((e: unknown) => setErr(e instanceof Error ? e.message : t("error.generic")));
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  if (done) return <Done text={t("signup.teacher.done")} />;
  if (err && !teacher) return <div className="field-error" role="alert">{err}</div>;
  if (!teacher) return <div className="skeleton h-24" />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErr(null); repos.auth.signupTeacher(code, pw).then(() => setDone(true)).catch((x: unknown) => setErr(x instanceof Error ? x.message : t("error.generic"))); }}>
      <div className="hair mb-4 p-3 text-[13px]">
        <div className="font-bold">{teacher.name}</div>
        <div className="muted">{teacher.designation} · {teacher.phone}</div>
        <div className="muted">{teacher.email}</div>
      </div>
      <Field label={t("signup.setpw")}><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      {err ? <div className="field-error mb-3" role="alert">{err}</div> : null}
      <Btn variant="primary" className="w-full" type="submit">{t("signup.confirm")}</Btn>
    </form>
  );
}

function StudentSignup() {
  const { t } = useT();
  const [f, setF] = useState({ studentId: "", joinCode: "", guardianLast4: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<"active" | "pending" | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  if (res) return <Done text={res === "active" ? t("signup.student.active") : t("signup.student.pending")} />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); setErr(null); repos.auth.signupStudent(f).then((r) => setRes(r.status)).catch((x: unknown) => setErr(x instanceof Error ? x.message : t("error.generic"))); }}>
      <Field label={t("signup.studentid")}><input className="input" value={f.studentId} onChange={set("studentId")} required /></Field>
      <Field label={t("signup.joincode")}><input className="input" value={f.joinCode} onChange={set("joinCode")} required /></Field>
      <Field label={t("signup.guardian4")}><input className="input" inputMode="numeric" maxLength={4} value={f.guardianLast4} onChange={set("guardianLast4")} required /></Field>
      <Field label={t("signup.setpw")}><input className="input" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} required /></Field>
      {err ? <div className="field-error mb-3" role="alert">{err}</div> : null}
      <Btn variant="primary" className="w-full" type="submit">{t("signup.verify")}</Btn>
    </form>
  );
}

function Done({ text }: { text: string }) {
  const { t } = useT();
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <CheckCircle2 size={36} style={{ color: "var(--ok)" }} />
      <p className="text-[13px]">{text}</p>
      <Link href="/login" className="btn btn-primary">{t("auth.signin")}</Link>
    </div>
  );
}

function SignupInner() {
  const { t } = useT();
  const brand = useBrand();
  const params = useSearchParams();
  const invite = params.get("invite");
  const [tab, setTab] = useState<"student" | "teacher">(invite ? "teacher" : "student");
  const [code, setCode] = useState(invite ?? "");
  const [go, setGo] = useState(!!invite);
  return (
    <AuthFrame brand={brand} title={t("auth.signup")}>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl p-1" style={{ background: "var(--paper-2)" }} role="tablist">
        {(["student", "teacher"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cn("h-8 rounded-lg text-[13px] font-semibold", tab === k && "shadow-sm")} style={{ background: tab === k ? "var(--card)" : "transparent" }}>{t(`role.${k}`)}</button>
        ))}
      </div>
      {tab === "student" ? <StudentSignup /> : go && code ? <TeacherSignup code={code} /> : (
        <form onSubmit={(e) => { e.preventDefault(); setGo(true); }}>
          <Field label={t("signup.invitecode")}><input className="input" value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
          <Btn variant="primary" className="w-full" type="submit">{t("signup.continue")}</Btn>
        </form>
      )}
      <p className="muted mt-4 text-center text-[12px]">{t("signup.registrar.note")}</p>
      <div className="mt-3 text-center text-[13px]"><Link href="/login" className="underline">{t("auth.back")}</Link></div>
    </AuthFrame>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupInner />
    </Suspense>
  );
}
