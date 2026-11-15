"use client";
import { Languages, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { repos } from "@/api/factory";
import type { SchoolBrand } from "@/api/repositories";
import { Btn } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { seasonFromCalendar } from "@/lib/season";
import { useUI } from "@/store/ui";

export function useBrand(): SchoolBrand | null {
  const [b, setB] = useState<SchoolBrand | null>(null);
  useEffect(() => {
    void repos.auth.brand().then((x) => {
      setB(x);
      document.documentElement.style.setProperty("--school-primary", x.primary);
    });
  }, []);
  return b;
}

/** Login / sign-up shell: school badge, name and motto on top, the card, and "Powered by Petra" at the bottom. */
export function AuthFrame({ children, brand, title }: { children: ReactNode; brand: SchoolBrand | null; title?: string }) {
  const { t, lang } = useT();
  const { resolvedTheme, setTheme } = useTheme();
  const setLang = useUI((s) => s.setLang);
  const season = seasonFromCalendar();
  return (
    <main className="wallpaper auth-main relative flex min-h-dvh flex-col items-center px-4 pb-5 pt-8">
      <div className="no-print absolute right-4 top-4 flex gap-2">
        <Btn size="sm" onClick={() => setLang(lang === "en" ? "bn" : "en")} aria-label={t("toggle.lang")}><Languages size={14} />{lang === "en" ? "বাংলা" : "English"}</Btn>
        <Btn size="sm" variant="icon" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label={t("toggle.theme")}>{resolvedTheme === "dark" ? <Sun size={15} /> : <Moon size={15} />}</Btn>
      </div>
      <div className="my-auto w-full max-w-[520px] py-4">
        <div className="auth-head">
          {brand ? <div className="school-badge" aria-hidden>{brand.monogram}</div> : <div className="school-badge skeleton" />}
          <h1 className="auth-name">{brand ? (lang === "bn" ? brand.nameBn : brand.name) : "ShikkhaOS"}</h1>
          {brand && lang !== "bn" && brand.nameBn ? <p className="auth-bn">{brand.nameBn}</p> : null}
          {brand?.motto ? <p className="auth-motto">&ldquo;{brand.motto}&rdquo;</p> : brand?.id !== "petra" ? <p className="muted text-[14.5px]">{t(`season.${season}.greet`)}</p> : null}
        </div>
        <div className="sheet auth-card">
          {title ? <h2 className="auth-title">{title}</h2> : null}
          {children}
        </div>
        <p className="faint mt-4 text-center text-[13px]">{t("auth.private")}</p>
      </div>
      <footer className="auth-foot">
        <img src="/logo-mark.png" alt="" /><span>Powered by <b>Petra</b></span><span className="faint">· ShikkhaOS</span>
      </footer>
    </main>
  );
}
