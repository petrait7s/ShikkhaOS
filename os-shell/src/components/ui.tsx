"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Inbox, X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function Btn({ variant, size, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "ghost" | "icon"; size?: "sm" }) {
  return <button type="button" {...p} className={cn("btn", variant === "primary" && "btn-primary", variant === "danger" && "btn-danger", variant === "ghost" && "btn-ghost", variant === "icon" && "btn-icon btn-ghost", size === "sm" && "btn-sm", className)} />;
}

export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content sideOffset={6} className="sheet z-[9999] max-w-[260px] !rounded-lg px-2.5 py-1 text-xs" style={{ color: "var(--ink)" }}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function Phase2({ hint }: { hint?: string }) {
  const { t } = useT();
  return (
    <Tip label={hint ?? t("phase2.tip")}>
      <span className="chip" style={{ color: "var(--warn)" }}>{t("phase2")}</span>
    </Tip>
  );
}

export function Modal({ open, onClose, title, children, width = 520, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number; footer?: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9000] bg-black/30 backdrop-blur-[3px]" />
        <Dialog.Content aria-describedby={undefined} className="sheet fixed left-1/2 top-1/2 z-[9001] flex max-h-[88vh] -translate-x-1/2 -translate-y-1/2 flex-col" style={{ width: `min(${width}px, 94vw)` }}>
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild><Btn variant="icon" size="sm" aria-label="Close"><X size={14} /></Btn></Dialog.Close>
          </div>
          <div className="scroll-thin overflow-auto px-5 pb-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t px-5 py-3" style={{ borderColor: "var(--line)" }}>{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Drawer({ open, onClose, title, children, width = 420 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9000] bg-black/30" />
        <Dialog.Content aria-describedby={undefined} className="sheet fixed right-0 top-0 z-[9001] flex h-full flex-col rounded-r-none" style={{ width: `min(${width}px, 100vw)` }}>
          <div className="flex items-center justify-between px-5 py-4">
            <Dialog.Title className="text-base font-bold">{title}</Dialog.Title>
            <Dialog.Close asChild><Btn variant="icon" aria-label="Close"><X size={16} /></Btn></Dialog.Close>
          </div>
          <div className="scroll-thin flex-1 overflow-auto px-5 pb-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Skeleton({ h = 16, w = "100%", className }: { h?: number; w?: number | string; className?: string }) {
  return <div className={cn("skeleton", className)} style={{ height: h, width: w }} aria-hidden />;
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return <div className="grid gap-2 p-4">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={34} />)}</div>;
}

export function Empty({ title, hint, icon, action }: { title: string; hint?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-2xl" style={{ background: "var(--paper-2)", color: "var(--ink-3)" }}>{icon ?? <Inbox size={22} />}</div>
      <div className="font-bold">{title}</div>
      {hint ? <div className="muted max-w-sm text-[13px]">{hint}</div> : null}
      {action}
    </div>
  );
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useT();
  const msg = error instanceof Error ? error.message : t("error.generic");
  return (
    <div className="m-4 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} role="alert">
      <div>{msg}</div>
      {retry ? <Btn size="sm" className="mt-2" onClick={retry}>{t("retry")}</Btn> : null}
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="label">{label}</span>
      {children}
      {error ? <div className="field-error" role="alert">{error}</div> : null}
    </label>
  );
}

export function Ring({ value, size = 84, stroke = 9, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(1, value)));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--paper-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .6s" }} />
      </svg>
      <div className="absolute text-sm font-bold">{Math.round(value * 100)}%</div>
    </div>
  );
}

const HUES = [150, 215, 20, 330, 190, 40, 270, 100];
export function Avatar({ name, size = 32, photo }: { name: string; size?: number; photo?: string | null }) {
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, boxShadow: "0 0 0 0.5px rgba(0,0,0,.2)" }} />;
  }
  const init = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  const h = HUES[(name.length + (name.charCodeAt(0) || 0)) % HUES.length] ?? 150;
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-bold" style={{ width: size, height: size, background: `hsl(${h} 45% 88%)`, color: `hsl(${h} 45% 28%)`, fontSize: size * 0.38 }} aria-hidden>
      {init}
    </span>
  );
}

export function Monogram({ text, color, size = 40 }: { text: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={text}>
      <rect width="40" height="40" rx="11" fill={color} />
      <path d="M0 29 Q10 22 20 29 T40 29 V40 H0Z" fill="rgba(255,255,255,.14)" />
      <text x="20" y="25.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="Montserrat Variable, sans-serif">{text}</text>
    </svg>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: "ok" | "warn" | "danger" | "info" }) {
  const c = tone === "ok" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : tone === "danger" ? "var(--danger)" : "var(--ink-2)";
  return <span className="chip" style={{ color: c }}>{children}</span>;
}
