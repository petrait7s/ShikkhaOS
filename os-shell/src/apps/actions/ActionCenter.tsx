"use client";
import { BadgeCheck, Bell, CheckCheck, ClipboardList, EyeOff, Inbox, Megaphone, RotateCcw, Table2, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Btn, Empty, ErrorBox, SkeletonRows } from "@/components/ui";
import { useActionItems, type ActionCategory, type ActionItem } from "@/features/actions/useActionItems";
import { fmtDateTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { launch } from "@/os/launch";
import { useIntent } from "@/store/intent";
import { useUI } from "@/store/ui";

const CAT_ICON: Record<ActionCategory, LucideIcon> = { approvals: BadgeCheck, marks: ClipboardList, results: Table2, notices: Megaphone, updates: Bell };
const CATS: ActionCategory[] = ["approvals", "marks", "results", "notices", "updates"];

export function openAction(item: ActionItem): void {
  if (item.intent) useIntent.getState().set(item.intent);
  if (item.app !== "actions") launch(item.app);
}

export default function ActionCenter() {
  const { t, lang, n } = useT();
  const { items, dismissedCount, isLoading, error, refetch, prefix, enabled } = useActionItems();
  const dismiss = useUI((s) => s.dismiss);
  const restore = useUI((s) => s.restoreDismissed);
  const [cat, setCat] = useState<ActionCategory | "all">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const counts = useMemo(() => Object.fromEntries(CATS.map((c) => [c, items.filter((i) => i.category === c).length])) as Record<ActionCategory, number>, [items]);
  const shown = items.filter((i) => (cat === "all" || i.category === cat) && (!q.trim() || `${i.title} ${i.detail ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())));
  const readable = items.filter((i) => i.markRead);

  async function read(i: ActionItem) {
    if (!i.markRead) return;
    setBusy(i.id);
    try { await i.markRead(); } catch (e) { toast.error(e instanceof Error ? e.message : t("error.generic")); } finally { setBusy(null); }
  }
  async function readAll() {
    setBusy("all");
    try { await Promise.all(readable.map((i) => i.markRead?.())); toast.success(t("ac.allread")); } catch (e) { toast.error(e instanceof Error ? e.message : t("error.generic")); } finally { setBusy(null); }
  }

  if (!enabled) return <Empty title={t("ac.unavailable")} />;
  if (isLoading) return <SkeletonRows rows={6} />;
  if (error) return <ErrorBox error={error} retry={refetch} />;

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <header className="grid gap-3 border-b px-5 pb-3 pt-4" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="app-title">{t("app.actions")}</h2>
            <p className="muted text-[13px]" role="status" aria-live="polite">{items.length ? t("ac.count", { n: n(items.length) }) : t("ac.clear")}</p>
          </div>
          {readable.length ? <Btn size="sm" disabled={busy === "all"} onClick={() => void readAll()}><CheckCheck size={14} />{t("ac.readall")}</Btn> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="seg" role="tablist" aria-label={t("ac.filter")}>
            <button type="button" role="tab" aria-selected={cat === "all"} onClick={() => setCat("all")}>{t("ac.cat.all")} <span className="num faint">{n(items.length)}</span></button>
            {CATS.filter((c) => counts[c] > 0 || cat === c).map((c) => (
              <button key={c} type="button" role="tab" aria-selected={cat === c} onClick={() => setCat(c)}>{t(`ac.cat.${c}`)} <span className="num faint">{n(counts[c])}</span></button>
            ))}
          </div>
          <input className="input !h-8 !w-[200px]" type="search" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 py-2">
        {shown.length === 0 ? (
          <Empty icon={<Inbox size={22} />} title={items.length ? t("ac.nomatch") : t("ac.clear")} hint={items.length ? undefined : t("ac.clear.hint")} />
        ) : (
          <ul className="grid gap-0.5">
            {shown.map((i) => {
              const Icon = CAT_ICON[i.category];
              return (
                <li key={i.id} className="list-row">
                  <span className="mt-1.5 flex items-center"><span className={`prio prio-${i.priority}`} /><span className="sr-only">{t(`ac.prio.${i.priority}`)}</span></span>
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px]" style={{ background: "var(--hover)", color: "var(--ink-2)" }}><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold leading-snug">{i.title}</span>
                      {i.priority === "high" ? <span className="status status-danger !h-5 !text-[11px]">{t("ac.prio.high")}</span> : null}
                    </div>
                    {i.detail ? <div className="muted mt-0.5 line-clamp-2 text-[13px]">{i.detail}</div> : null}
                    <div className="faint mt-1 text-[12px]">{t(`ac.cat.${i.category}`)}{i.at ? ` · ${fmtDateTime(i.at, lang)}` : ""}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {i.app !== "actions" ? <Btn size="sm" variant={i.priority === "high" ? "primary" : undefined} onClick={() => openAction(i)}>{i.openLabel}</Btn> : null}
                    {i.markRead ? <Btn size="sm" variant="ghost" disabled={busy === i.id} onClick={() => void read(i)}>{t("ac.markread")}</Btn> : null}
                    {i.dismissible ? <Btn size="sm" variant="icon" aria-label={t("ac.dismiss")} title={t("ac.dismiss")} onClick={() => dismiss(`${prefix}${i.id}`)}><EyeOff size={14} /></Btn> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="faint flex flex-wrap items-center gap-2 border-t px-5 py-2 text-[12px]" style={{ borderColor: "var(--line)" }}>
        <span className="flex-1">{t("ac.footnote")}</span>
        {dismissedCount ? <Btn size="sm" variant="ghost" onClick={() => restore(prefix)}><RotateCcw size={13} />{t("ac.restore", { n: n(dismissedCount) })}</Btn> : null}
      </footer>
    </div>
  );
}
