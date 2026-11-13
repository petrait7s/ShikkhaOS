"use client";
import { isAdmin } from "@/lib/roles";
import { useQueryClient } from "@tanstack/react-query";
import { repos } from "@/api/factory";
import { keys, useExamsQ, useMatrixQ, useMyCellsQ, useMyExamsQ, useNoticesQ, useNotificationsQ, useSignupsQ } from "@/api/hooks";
import { pickExam } from "@/os/Widgets";
import { useT } from "@/lib/i18n";
import type { Intent } from "@/store/intent";
import { useUI } from "@/store/ui";

export type ActionCategory = "approvals" | "marks" | "results" | "notices" | "updates";
export type ActionPriority = "high" | "medium" | "low";

/** One actionable item derived from existing mock-repository data. Nothing here is fabricated:
 *  every item maps 1:1 to a record the user can already see in another app. */
export type ActionItem = {
  id: string;
  category: ActionCategory;
  priority: ActionPriority;
  title: string;
  detail?: string;
  at: string | null;
  app: string;
  intent?: Intent;
  openLabel: string;
  /** Marks the underlying record read (notices / notifications). */
  markRead?: () => Promise<void>;
  dismissible: boolean;
};

const PRIO: Record<ActionPriority, number> = { high: 0, medium: 1, low: 2 };
const NOTICE_WINDOW_MS = 30 * 24 * 3600_000;

export function useActionItems() {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const session = useUI((s) => s.session);
  const dismissed = useUI((s) => s.dismissed);
  const role = session?.role;
  const school = !!role && role !== "petra";
  const reg = isAdmin(role);
  const teacher = role === "teacher";
  const student = role === "student";

  const exams = useExamsQ();
  const exam = school ? pickExam(exams.data) : undefined;
  const eid = exam?.id ?? "";
  const examName = exam ? (lang === "bn" ? exam.nameBn : exam.name) : "";
  const signups = useSignupsQ(reg);
  const matrix = useMatrixQ(reg ? eid : "");
  const myCells = useMyCellsQ(teacher ? eid : "");
  const myExams = useMyExamsQ(student);
  const notices = useNoticesQ(school);
  const notifs = useNotificationsQ(school);

  const queries = [exams, ...(reg ? [signups, matrix] : []), ...(teacher ? [myCells] : []), ...(student ? [myExams] : []), ...(school ? [notices, notifs] : [])];
  const isLoading = school && queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.isError)?.error ?? null;
  const refetch = () => { for (const q of queries) void q.refetch(); };

  const items: ActionItem[] = [];
  if (school && session) {
    const cls = (c: number, s: string) => t("rc.class", { c, s });

    if (reg) {
      for (const st of signups.data ?? []) {
        items.push({ id: `signup:${st.id}`, category: "approvals", priority: "medium", title: t("ac.signup", { name: lang === "bn" ? st.nameBn : st.name }), detail: `${cls(st.classNo, st.section)} · ${st.studentId}`, at: null, app: "approvals", openLabel: t("ac.open.approvals"), dismissible: false });
      }
      const cells = matrix.data?.cells ?? [];
      const pubs = matrix.data?.publications ?? [];
      const rowsMap = new Map<string, typeof cells>();
      for (const c of cells) rowsMap.set(`${c.classNo}-${c.section}`, [...(rowsMap.get(`${c.classNo}-${c.section}`) ?? []), c]);
      for (const [key, list] of rowsMap) {
        const [cn, sec] = key.split("-") as [string, string];
        const c = Number(cn);
        const pub = pubs.find((p) => p.classNo === c && p.section === sec);
        if (!pub && list.length > 0 && list.every((x) => x.state === "verified")) {
          items.push({ id: `publish:${eid}:${key}`, category: "results", priority: "high", title: t("ac.publish", { cls: cls(c, sec), exam: examName }), detail: t("ac.publish.d", { n: list.length }), at: null, app: "results", intent: { kind: "publish", classNo: c }, openLabel: t("ac.open.results"), dismissible: true });
        }
        if (pub?.state === "scheduled") {
          items.push({ id: `scheduled:${eid}:${key}:${pub.at}`, category: "results", priority: "low", title: t("ac.scheduled", { cls: cls(c, sec), exam: examName }), at: pub.at, app: "results", openLabel: t("ac.open.results"), dismissible: true });
        }
      }
      // One review item per class (not per subject) so a busy exam week does not flood the list.
      for (const [key, list] of rowsMap) {
        const waiting = list.filter((x) => x.state === "submitted" || x.state === "uploaded");
        if (!waiting.length) continue;
        const [cn, sec] = key.split("-") as [string, string];
        const first = waiting[0] as (typeof waiting)[number];
        const latest = waiting.map((x) => x.updatedAt ?? "").sort().at(-1) ?? "";
        items.push({ id: `verify:${eid}:${key}:${latest}`, category: "marks", priority: "medium", title: t("ac.verify", { cls: cls(Number(cn), sec), n: waiting.length }), detail: waiting.map((x) => x.subject).join(", "), at: latest || null, app: "results", intent: { kind: "cell", classNo: first.classNo, section: first.section, subject: first.subject }, openLabel: t("ac.open.review"), dismissible: true });
      }
    }

    if (teacher) {
      for (const c of myCells.data ?? []) {
        const k = `${eid}:${c.classNo}-${c.section}-${c.subject}`;
        const intent: Intent = { kind: "marks", classNo: c.classNo, section: c.section, subject: c.subject };
        if (c.returnComment && (c.state === "draft" || c.state === "not_started")) {
          items.push({ id: `returned:${k}:${c.updatedAt ?? ""}`, category: "marks", priority: "high", title: t("ac.returned", { cls: cls(c.classNo, c.section), sub: c.subject }), detail: c.returnComment, at: c.updatedAt, app: "marks", intent, openLabel: t("ac.open.marks"), dismissible: false });
        } else if (c.state === "not_started" || c.state === "draft") {
          const filled = Object.keys(c.marks).length;
          items.push({ id: `marks:${k}`, category: "marks", priority: "medium", title: t("ac.entermarks", { cls: cls(c.classNo, c.section), sub: c.subject, exam: examName }), detail: c.state === "draft" ? t("ac.draft", { n: filled }) : t("state.not_started"), at: c.updatedAt, app: "marks", intent, openLabel: t("ac.open.marks"), dismissible: true });
        }
      }
    }

    if (student) {
      for (const e of myExams.data ?? []) {
        const name = lang === "bn" ? e.exam.nameBn : e.exam.name;
        if (e.state === "published") items.push({ id: `result:${e.exam.id}:${e.at ?? ""}`, category: "results", priority: "medium", title: t("ac.result", { exam: name }), at: e.at, app: "myresults", openLabel: t("ac.open.myresults"), dismissible: true });
        if (e.state === "scheduled") items.push({ id: `resultsoon:${e.exam.id}:${e.at ?? ""}`, category: "results", priority: "low", title: t("ac.resultsoon", { exam: name }), at: e.at, app: "myresults", openLabel: t("ac.open.myresults"), dismissible: true });
      }
    }

    if (!reg) {
      const now = Date.now();
      for (const n of notices.data ?? []) {
        const ts = new Date(n.publishAt).getTime();
        if (ts > now || now - ts > NOTICE_WINDOW_MS || (n.readBy ?? []).includes(session.userId)) continue;
        items.push({ id: `notice:${n.id}`, category: "notices", priority: n.pinned ? "medium" : "low", title: n.title, detail: n.body.slice(0, 140), at: n.publishAt, app: "notices", intent: { kind: "notice", id: n.id }, openLabel: t("ac.open.notice"), markRead: () => repos.notice.markRead(n.id).then(() => qc.invalidateQueries({ queryKey: keys.notices })), dismissible: false });
      }
    }

    for (const n of notifs.data ?? []) {
      if (n.read) continue;
      items.push({ id: `notif:${n.id}`, category: "updates", priority: "low", title: n.text, at: n.at, app: "actions", openLabel: "", markRead: () => repos.notice.markNotificationRead(n.id).then(() => qc.invalidateQueries({ queryKey: keys.notifications })), dismissible: false });
    }
  }

  const prefix = session ? `${session.userId}|` : "";
  const visible = items
    .filter((i) => !dismissed[`${prefix}${i.id}`])
    .sort((a, b) => PRIO[a.priority] - PRIO[b.priority] || (b.at ?? "").localeCompare(a.at ?? ""));
  const dismissedCount = items.length - visible.length;

  return { items: visible, dismissedCount, isLoading, error, refetch, prefix, enabled: school };
}
