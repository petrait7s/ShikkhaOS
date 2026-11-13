"use client";
import { KeyRound } from "lucide-react";
import Link from "next/link";
import { AuthFrame, useBrand } from "@/components/AuthFrame";
import { useT } from "@/lib/i18n";

export default function ForgotPage() {
  const { t } = useT();
  const brand = useBrand();
  return (
    <AuthFrame brand={brand} title={t("auth.forgot")}>
      <div className="flex flex-col items-center gap-3 text-center">
        <KeyRound size={30} style={{ color: "var(--accent)" }} />
        <p className="text-[13px]">{t("forgot.body")}</p>
        <Link href="/login" className="btn">{t("auth.back")}</Link>
      </div>
    </AuthFrame>
  );
}
