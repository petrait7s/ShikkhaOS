"use client";
import { isAdmin } from "@/lib/roles";
import { Command } from "cmdk";
import { Languages, Moon, Search, Send } from "lucide-react";
import { useTheme } from "next-themes";
import { useExamsQ, useMatrixQ, useNoticesQ, useStudentsQ, useTeachersQ } from "@/api/hooks";
import { useT } from "@/lib/i18n";
import { useIntent } from "@/store/intent";
import { useUI } from "@/store/ui";
import { appsFor } from "@/apps/registry";
import { launch } from "./launch";
import { useActionItems } from "@/features/actions/useActionItems";
import { openAction } from "@/apps/actions/ActionCenter";
import { pickExam } from "./Widgets";

export function Spotlight() {
  const { t, lang } = useT();
  const open = useUI((s) => s.spotlight);
  const setOpen = useUI((s) => s.setSpotlight);
  const setLang = useUI((s) => s.setLang);
  const role = useUI((s) => s.session?.role);
  const { resolvedTheme, setTheme } = useTheme();
  const setIntent = useIntent((s) => s.set);
  const reg = isAdmin(role);
  const people = isAdmin(role) || role === "teacher";
  const students = useStudentsQ();
  const teachers = useTeachersQ();
  const notices = useNoticesQ();
  const exams = useExamsQ();
  const exam = pickExam(exams.data);
  const matrix = useMatrixQ(reg && exam ? exam.id : "");

  const readyClasses: number[] = [];
  if (reg && matrix.data) {
    const rows = new Map<number, string[]>();
    for (const c of matrix.data.cells) rows.set(c.classNo, [...(rows.get(c.classNo) ?? []), c.state]);
    for (const [k, v] of rows) if (v.every((s) => s === "verified")) readyClasses.push(k);
  }
  const apps = role ? appsFor(role) : [];
  const actions = useActionItems().items.filter((i) => i.app !== "actions").slice(0, 5);
  const run = (fn: () => void) => { setOpen(false); fn(); };

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label={t("spot.label")} loop>
      <Command.Input placeholder={t("spot.placeholder")} />
      <Command.List>
        <Command.Empty>{t("spot.empty")}</Command.Empty>
        {actions.length ? (
          <Command.Group heading={t("spot.attention")}>
            {actions.map((i) => (
              <Command.Item key={i.id} value={`action ${i.title} ${i.detail ?? ""}`} onSelect={() => run(() => openAction(i))}>
                <span className={`prio prio-${i.priority}`} aria-hidden /><span className="min-w-0 flex-1 truncate">{i.title}</span><span className="faint text-[11.5px]">{i.openLabel}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        <Command.Group heading={t("spot.apps")}>
          {apps.map((a) => (
            <Command.Item key={a.id} value={`app ${t(`app.${a.id}`)} ${a.id}`} onSelect={() => run(() => launch(a.id))}>
              <span className="grid size-6 place-items-center rounded-md text-white" style={{ background: a.color }}><a.icon size={13} /></span>{t(`app.${a.id}`)}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading={t("spot.actions")}>
          {readyClasses.map((c) => (
            <Command.Item key={c} value={`publish class ${c} ${exam?.name ?? ""}`} onSelect={() => run(() => { setIntent({ kind: "publish", classNo: c }); launch("results"); })}>
              <Send size={15} />{t("spot.publish", { c, exam: exam ? (lang === "bn" ? exam.nameBn : exam.name) : "" })}
            </Command.Item>
          ))}
          <Command.Item value="switch theme dark light mode" onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}><Moon size={15} />{resolvedTheme === "dark" ? t("spot.light") : t("spot.dark")}</Command.Item>
          <Command.Item value="language bangla english বাংলা" onSelect={() => run(() => setLang(lang === "en" ? "bn" : "en"))}><Languages size={15} />{t("toggle.lang")}</Command.Item>
        </Command.Group>
        {people && students.data ? (
          <Command.Group heading={t("spot.students")}>
            {students.data.slice(0, 600).map((s) => (
              <Command.Item key={s.id} value={`student ${s.name} ${s.studentId} class ${s.classNo}`} onSelect={() => run(() => { if (reg) { setIntent({ kind: "search", app: "students", q: s.studentId }); launch("students"); } else launch("roster"); })}>
                <Search size={15} />{s.name}<span className="faint ml-auto text-[12px]">{s.studentId}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {teachers.data ? (
          <Command.Group heading={t("spot.teachers")}>
            {teachers.data.map((x) => (
              <Command.Item key={x.id} value={`teacher ${x.name} ${x.phone}`} onSelect={() => run(() => launch(reg ? "teachers" : "faculty"))}><Search size={15} />{x.name}<span className="faint ml-auto text-[12px]">{x.designation}</span></Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {notices.data ? (
          <Command.Group heading={t("spot.notices")}>
            {notices.data.map((x) => (
              <Command.Item key={x.id} value={`notice ${x.title}`} onSelect={() => run(() => launch("notices"))}><Search size={15} />{x.title}</Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
      <div className="faint flex gap-4 border-t px-4 py-2 text-[11.5px]" style={{ borderColor: "var(--line)" }} aria-hidden><span><kbd>↑</kbd> <kbd>↓</kbd> {t("spot.k.move")}</span><span><kbd>Enter</kbd> {t("spot.k.open")}</span><span><kbd>Esc</kbd> {t("spot.k.close")}</span></div>
    </Command.Dialog>
  );
}
