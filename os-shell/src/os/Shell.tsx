"use client";
import { ArrowLeft, Bell, Languages, Lock, LogOut, Moon, Search, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { repos } from "@/api/factory";
import { useMyProfileQ, useSchoolQ } from "@/api/hooks";
import { Avatar, Btn, Monogram, Skeleton, Tip } from "@/components/ui";
import { useHydrated, useT } from "@/lib/i18n";
import { useUI } from "@/store/ui";
import { appById, appsFor } from "@/apps/registry";
import { AppIcon } from "./AppIcon";
import { useActionItems } from "@/features/actions/useActionItems";
import { LockScreen } from "./LockScreen";
import { Spotlight } from "./Spotlight";
import { WindowFrame } from "./WindowFrame";
import { Widgets } from "./Widgets";
import { launch } from "./launch";
import { useMedia } from "./useMedia";
import { MobileShell, isNativeApp } from "./MobileShell";
import { useSeason } from "./useSeason";

const IDLE_MS = 15 * 60 * 1000;
/** Dynamic accent: a teal tone that follows the school season (all inside the brand palette). */
const LIVE_BY_SEASON: Record<string, string> = { admission: "#0F766E", exam: "#14B8A6", result: "#2DD4BF", event: "#0E9F8E" };

function ActionButton() {
  const { t, n } = useT();
  const { items } = useActionItems();
  const urgent = items.filter((i) => i.priority !== "low").length;
  const count = items.length;
  const label = count ? `${t("app.actions")} · ${t("ac.count", { n: n(count) })}` : t("app.actions");
  return (
    <Tip label={label}>
      <Btn variant="icon" size="sm" className="relative" aria-label={label} onClick={() => launch("actions")}>
        <Bell size={14} />
        {count ? <span className="count-badge" style={urgent ? undefined : { background: "var(--ink-3)" }} aria-hidden>{count > 99 ? "99+" : n(count)}</span> : null}
      </Btn>
    </Tip>
  );
}

function UserMenu() {
  const { t } = useT();
  const session = useUI((s) => s.session);
  const setSession = useUI((s) => s.setSession);
  const setLocked = useUI((s) => s.setLocked);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const me = useMyProfileQ();
  if (!session) return null;
  return (
    <div className="relative">
      <button type="button" className="flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-[var(--hover)]" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={session.name} size={20} photo={me.data?.photo} />
        <span className="hidden max-w-[150px] truncate text-[12px] font-medium md:block">{session.name}</span>
      </button>
      {open ? (
        <div role="menu" className="sheet absolute right-0 top-8 z-[9100] w-[200px] p-1.5">
          <Btn variant="ghost" className="w-full justify-start" onClick={() => { setOpen(false); setLocked(true); }}><Lock size={14} />{t("user.lock")}</Btn>
          <Btn variant="ghost" className="w-full justify-start" onClick={() => { void repos.auth.logout().then(() => { setSession(null); router.replace(session.role === "petra" ? "/petra-console/" : "/login/"); }); }}><LogOut size={14} />{t("user.logout")}</Btn>
        </div>
      ) : null}
    </div>
  );
}

function Clock() {
  const { lang } = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(id); }, []);
  const d = new Date(now);
  const day = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short" }).format(d);
  const time = new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-US", { timeZone: "Asia/Dhaka", hour: "numeric", minute: "2-digit" }).format(d);
  return <span className="hidden whitespace-nowrap px-1 text-[12.5px] font-medium tabular-nums sm:inline">{day}  {time}</span>;
}

function TopBar({ mobile }: { mobile: boolean }) {
  const { t, lang } = useT();
  const { data: school } = useSchoolQ();
  const { resolvedTheme, setTheme } = useTheme();
  const setLang = useUI((s) => s.setLang);
  const setSpot = useUI((s) => s.setSpotlight);
  const role = useUI((s) => s.session?.role);
  const windows = useUI((s) => s.windows);
  const front = Object.entries(windows).filter(([, w]) => w.open && !w.min).sort((a, b) => b[1].z - a[1].z)[0];
  const title = front && !mobile ? t(`app.${front[0]}`) : role === "petra" ? "Petra Console" : school ? (lang === "bn" ? school.nameBn : school.name) : "…";
  return (
    <header className="menubar relative z-[9050] flex h-8 shrink-0 items-center gap-1 px-3">
      {school ? <img src="/logo-mark.png" alt="" className="menubar-logo" /> : role === "petra" ? <Monogram text="PE" color="#1f1b16" size={18} /> : <Skeleton w={18} h={18} />}
      <span className="serif-bn ml-1.5 max-w-[46vw] truncate text-[13px] font-bold">{title}</span>
      <div className="flex-1" />
      <Btn variant="icon" size="sm" onClick={() => setSpot(true)} aria-label={t("spot.trigger")}><Search size={14} /></Btn>
      {role !== "petra" ? <ActionButton /> : null}
      <Btn variant="icon" size="sm" onClick={() => setLang(lang === "en" ? "bn" : "en")} aria-label={t("toggle.lang")}><Languages size={14} /></Btn>
      <Btn variant="icon" size="sm" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label={t("toggle.theme")}>{resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}</Btn>
      <Clock />
      <UserMenu />
    </header>
  );
}

function DockItem({ app, mouseX, running, onClick, label }: { app: ReturnType<typeof appsFor>[number]; mouseX: MotionValue<number>; running: boolean; onClick: () => void; label: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (v) => { const b = ref.current?.getBoundingClientRect(); return b ? v - b.x - b.width / 2 : Infinity; });
  const size = useSpring(useTransform(distance, [-140, -70, 0, 70, 140], [48, 62, 82, 62, 48]), { mass: 0.1, stiffness: 190, damping: 14 });
  return (
    <div className="flex flex-col items-center gap-1">
      <Tip label={label}>
        <motion.button ref={ref} type="button" aria-label={label} style={{ width: size, height: size }} whileTap={{ scale: 0.9 }} onClick={onClick} className="grid place-items-center">
          <motion.span style={{ width: size, height: size }} className="grid place-items-center">
            <AppIconFluid icon={app.icon} color={app.color} size={size} />
          </motion.span>
        </motion.button>
      </Tip>
      <span className="dock-dot" style={{ opacity: running ? 1 : 0 }} />
    </div>
  );
}

function AppIconFluid({ icon: Icon, color, size }: { icon: ReturnType<typeof appsFor>[number]["icon"]; color: string; size: MotionValue<number> }) {
  const glyph = useTransform(size, (v) => Math.round(v * 0.5));
  return (
    <motion.span className="app-icon" style={{ width: size, height: size, background: `linear-gradient(180deg, color-mix(in srgb, ${color} 72%, #fff) 0%, ${color} 52%, color-mix(in srgb, ${color} 82%, #000) 100%)` }}>
      <motion.span style={{ width: glyph, height: glyph }} className="grid place-items-center [&>svg]:size-full"><Icon /></motion.span>
    </motion.span>
  );
}

function Dock() {
  const { t } = useT();
  const role = useUI((s) => s.session?.role);
  const windows = useUI((s) => s.windows);
  const { toggleMin, focusApp } = useUI();
  const mouseX = useMotionValue(Infinity);
  const topZ = Math.max(0, ...Object.values(windows).filter((w) => w.open && !w.min).map((w) => w.z));
  if (!role) return null;
  return (
    <motion.nav
      onMouseMove={(e) => mouseX.set(e.clientX)} onMouseLeave={() => mouseX.set(Infinity)}
      className="dock absolute bottom-3 left-1/2 z-[9040] flex h-[68px] -translate-x-1/2 items-end gap-2.5 rounded-[24px] px-3 pb-2"
      aria-label={t("dock.label")}
    >
      {appsFor(role).filter((a) => a.inDock !== false || windows[a.id]?.open).map((a) => {
        const w = windows[a.id];
        const running = !!w?.open;
        return (
          <DockItem key={a.id} app={a} mouseX={mouseX} running={running} label={t(`app.${a.id}`)}
            onClick={() => { if (!running) launch(a.id); else if (w && !w.min && w.z === topZ) toggleMin(a.id); else { if (w?.min) toggleMin(a.id); focusApp(a.id); } }} />
        );
      })}
    </motion.nav>
  );
}

function MobileHome() {
  const { t } = useT();
  const role = useUI((s) => s.session?.role);
  if (!role) return null;
  return (
    <div className="scroll-thin h-full overflow-auto pb-8">
      <Widgets />
      <div className="grid grid-cols-4 gap-4 px-5 pb-6">
        {appsFor(role).map((a) => (
          <button key={a.id} type="button" className="flex flex-col items-center gap-1.5" onClick={() => launch(a.id)}>
            <AppIcon icon={a.icon} color={a.color} size={58} />
            <span className="text-center text-[11px] font-semibold leading-tight">{t(`app.${a.id}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function Shell() {
  const router = useRouter();
  const hydrated = useHydrated();
  const wide = useMedia("(min-width: 1024px)");
  const desktop = wide && !isNativeApp();
  const { t } = useT();
  const { session, locked, windows, mobileApp, lastActive, setSession, setLocked, setSpotlight, touch, setMobileApp } = useUI();
  const [booted, setBooted] = useState(false);
  const lastTouch = useRef(0);
  const { data: school } = useSchoolQ();
  const season = useSeason();
  useEffect(() => { document.documentElement.style.setProperty("--live", LIVE_BY_SEASON[season]); }, [season]);

  useEffect(() => {
    const s = repos.auth.session();
    if (!s) { router.replace("/login"); return; }
    setSession(s);
    setBooted(true);
  }, [router, setSession]);

  useEffect(() => { if (school) document.documentElement.style.setProperty("--school-primary", school.primary); }, [school]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSpotlight(!useUI.getState().spotlight); }
    };
    const onAct = () => { const n = Date.now(); if (n - lastTouch.current > 5000) { lastTouch.current = n; touch(); } };
    const onPop = () => setMobileApp(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onAct);
    window.addEventListener("keydown", onAct);
    window.addEventListener("popstate", onPop);
    const idle = setInterval(() => { if (Date.now() - useUI.getState().lastActive > IDLE_MS) setLocked(true); }, 30_000);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onAct); window.removeEventListener("keydown", onAct); window.removeEventListener("popstate", onPop); clearInterval(idle); };
  }, [setSpotlight, touch, setLocked, setMobileApp]);

  void lastActive;
  if (!hydrated || !booted || !session) return <div className="grid h-dvh place-items-center"><Skeleton w={220} h={12} /></div>;

  if (!desktop) {
    return (
      <>
        <MobileShell />
        <Spotlight />
        {locked ? <LockScreen /> : null}
      </>
    );
  }

  return (
    <div className="wallpaper flex h-dvh flex-col overflow-hidden">
      <TopBar mobile={!desktop} />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {desktop ? (
          <>
            <div className="scroll-thin absolute inset-0 overflow-auto pb-28"><Widgets /></div>
            {Object.entries(windows).map(([id, win]) => {
              const app = appById(id);
              if (!app || !appsFor(session.role).some((a) => a.id === id)) return null;
              const C = app.Component;
              return <WindowFrame key={id} app={app} win={win}><C /></WindowFrame>;
            })}
            <Dock />
          </>
        ) : mobileApp && appById(mobileApp) ? (
          (() => {
            const app = appById(mobileApp);
            if (!app) return null;
            const C = app.Component;
            return (
              <div className="absolute inset-0 flex flex-col" style={{ background: "var(--win)", backdropFilter: "blur(30px)", ["--accent" as string]: app.color }}>
                <div className="flex h-11 shrink-0 items-center gap-2 border-b px-2" style={{ borderColor: "var(--line)" }}>
                  <Btn variant="icon" aria-label={t("win.back")} onClick={() => window.history.back()}><ArrowLeft size={18} /></Btn>
                  <span className="font-bold">{t(`app.${app.id}`)}</span>
                </div>
                <div className="scroll-thin min-h-0 flex-1 overflow-auto"><C /></div>
              </div>
            );
          })()
        ) : <MobileHome />}
      </div>
      <Spotlight />
      {locked ? <LockScreen /> : null}
    </div>
  );
}
