"use client";
// Phone layout (and the Android app): bottom tabs, full-screen pages with a back arrow, no desktop windows.
// Android hardware back: close an open dialog -> leave the open page -> go to Home tab -> exit the app.
import { ArrowLeft, Bell, ChevronRight, Languages, LayoutGrid, Lock, LogOut, Moon, Search, Sun, UserRound, House, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { repos } from "@/api/factory";
import { useMyProfileQ, useSchoolQ } from "@/api/hooks";
import { Avatar, Btn } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useUI } from "@/store/ui";
import { appById, appsFor } from "@/apps/registry";
import { useActionItems } from "@/features/actions/useActionItems";
import { AppIcon } from "./AppIcon";
import { Widgets } from "./Widgets";
import { launch } from "./launch";

type Tab = "home" | "apps" | "alerts" | "me";
type CapWindow = { Capacitor?: { isNativePlatform?: () => boolean } };
export const isNativeApp = (): boolean => typeof window !== "undefined" && !!(window as unknown as CapWindow).Capacitor?.isNativePlatform?.();

function useAndroidBack(onBack: () => boolean) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!isNativeApp()) return;
    let remove: (() => void) | undefined;
    let cancelled = false;
    void import("@capacitor/app").then(async ({ App }) => {
      const h = await App.addListener("backButton", () => { if (!ref.current()) void App.exitApp(); });
      if (cancelled) void h.remove(); else remove = () => void h.remove();
    });
    return () => { cancelled = true; remove?.(); };
  }, []);
}

function TabButton({ id, tab, set, icon: Icon, label, badge }: { id: Tab; tab: Tab; set: (t: Tab) => void; icon: LucideIcon; label: string; badge?: number }) {
  const on = tab === id;
  return (
    <button type="button" className="m-tab" data-on={on} aria-current={on ? "page" : undefined} onClick={() => set(id)}>
      <span className="relative"><Icon size={22} strokeWidth={on ? 2.2 : 1.7} />{badge ? <span className="count-badge" aria-hidden>{badge > 99 ? "99+" : badge}</span> : null}</span>
      <span>{label}</span>
    </button>
  );
}

function AppGrid({ cols = 3 }: { cols?: number }) {
  const { t } = useT();
  const role = useUI((s) => s.session?.role);
  if (!role) return null;
  return (
    <div className="grid gap-3 p-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {appsFor(role).map((a) => (
        <button key={a.id} type="button" className="m-tile" onClick={() => launch(a.id)}>
          <AppIcon icon={a.icon} color={a.color} size={52} />
          <span>{t(`app.${a.id}`)}</span>
        </button>
      ))}
    </div>
  );
}

function Me({ onOpenProfile }: { onOpenProfile: () => void }) {
  const { t, lang } = useT();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const session = useUI((s) => s.session);
  const setSession = useUI((s) => s.setSession);
  const setLocked = useUI((s) => s.setLocked);
  const setLang = useUI((s) => s.setLang);
  const me = useMyProfileQ();
  if (!session) return null;
  const row = "m-row";
  return (
    <div className="grid gap-3 p-4">
      <div className="card flex items-center gap-3 p-4">
        <Avatar name={session.name} size={52} photo={me.data?.photo} />
        <div className="min-w-0"><div className="truncate text-[16px] font-bold">{session.name}</div><div className="muted text-[13px]">{t(`role.${session.role}`)}</div></div>
      </div>
      <div className="card overflow-hidden p-0">
        <button type="button" className={row} onClick={onOpenProfile}><UserRound size={18} />{t("app.profile")}<ChevronRight size={16} className="ml-auto faint" /></button>
        <button type="button" className={row} onClick={() => setLang(lang === "en" ? "bn" : "en")}><Languages size={18} />{lang === "en" ? "বাংলা" : "English"}</button>
        <button type="button" className={row} onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>{resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}{resolvedTheme === "dark" ? "Light mode" : "Dark mode"}</button>
        <button type="button" className={row} onClick={() => setLocked(true)}><Lock size={18} />{t("user.lock")}</button>
      </div>
      <button type="button" className="m-row card justify-center !text-[var(--danger)]" onClick={() => { void repos.auth.logout().then(() => { setSession(null); router.replace("/login/"); }); }}><LogOut size={18} />{t("user.logout")}</button>
    </div>
  );
}

export function MobileShell() {
  const { t } = useT();
  const role = useUI((s) => s.session?.role);
  const mobileApp = useUI((s) => s.mobileApp);
  const setMobileApp = useUI((s) => s.setMobileApp);
  const setSpotlight = useUI((s) => s.setSpotlight);
  const spotlight = useUI((s) => s.spotlight);
  const { data: school } = useSchoolQ();
  const { items } = useActionItems();
  const [tab, setTab] = useState<Tab>("home");
  const app = mobileApp ? appById(mobileApp) : undefined;
  const Actions = appById("actions")?.Component;

  useAndroidBack(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (dlg) { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return true; }
    if (spotlight) { setSpotlight(false); return true; }
    if (mobileApp) { if (window.history.state?.app) window.history.back(); else setMobileApp(null); return true; }
    if (tab !== "home") { setTab("home"); return true; }
    return false;
  });

  if (!role) return null;
  const title = app ? t(`app.${app.id}`) : tab === "home" ? (school?.name ?? "ShikkhaOS") : tab === "apps" ? t("dock.label") : tab === "alerts" ? t("app.actions") : t("app.profile");

  return (
    <div className="m-root">
      <header className="m-bar">
        {app ? (
          <Btn variant="icon" aria-label={t("win.back")} onClick={() => (window.history.state?.app ? window.history.back() : setMobileApp(null))}><ArrowLeft size={20} /></Btn>
        ) : (
          <img src="/logo-mark.png" alt="" className="m-logo" />
        )}
        <h1 className="m-title">{title}</h1>
        <Btn variant="icon" aria-label={t("spot.trigger")} onClick={() => setSpotlight(true)}><Search size={20} /></Btn>
      </header>

      {app ? (
        <main className="m-page m-push" style={{ ["--accent" as string]: app.color }} key={app.id}>
          {(() => { const C = app.Component; return <C />; })()}
        </main>
      ) : (
        <>
          <main className="m-page">
            {tab === "home" ? (
              <>
                <div className="m-quick scroll-thin">
                  {appsFor(role).filter((a) => a.id !== "actions").slice(0, 8).map((a) => (
                    <button key={a.id} type="button" className="m-chip" onClick={() => launch(a.id)}><AppIcon icon={a.icon} color={a.color} size={28} />{t(`app.${a.id}`)}</button>
                  ))}
                </div>
                <Widgets />
              </>
            ) : tab === "apps" ? <AppGrid /> : tab === "alerts" ? (Actions ? <Actions /> : null) : <Me onOpenProfile={() => launch("profile")} />}
          </main>
          <nav className="m-nav" aria-label={t("dock.label")}>
            <TabButton id="home" tab={tab} set={setTab} icon={House} label="Home" />
            <TabButton id="apps" tab={tab} set={setTab} icon={LayoutGrid} label="Apps" />
            <TabButton id="alerts" tab={tab} set={setTab} icon={Bell} label="Alerts" badge={items.length} />
            <TabButton id="me" tab={tab} set={setTab} icon={UserRound} label="Me" />
          </nav>
        </>
      )}
    </div>
  );
}
