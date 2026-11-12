// UI-gating helper ONLY. The server is the sole authority; effective permissions come from /auth/me.
import type { Role } from "@shikkhaos/types";

export interface Session { role: Role; permissions: readonly string[] }
export const can = (s: Session | null | undefined, p: string): boolean => !!s && s.permissions.includes(p);
export const canAny = (s: Session | null | undefined, ps: readonly string[]): boolean => ps.some((p) => can(s, p));

/** Navigation modules and the permission(s) that reveal them (any-of). Hidden modules are not rendered at all. */
export interface NavItem { id: string; label: string; icon: string; any: readonly string[]; roles?: readonly Role[]; group: "Overview" | "People" | "Academics" | "Exams" | "Communication" | "Administration" }
export const NAV: readonly NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard", any: [], group: "Overview" },
  { id: "my-results", label: "My results", icon: "award", any: ["results.read_own"], roles: ["STUDENT"], group: "Academics" },
  { id: "my-attendance", label: "My attendance", icon: "calendar-check", any: ["attendance.read_own"], roles: ["STUDENT"], group: "Academics" },
  { id: "my-class-tests", label: "Class tests", icon: "clipboard-list", any: ["results.read_own"], roles: ["STUDENT"], group: "Academics" },
  { id: "my-homework", label: "Homework", icon: "book-open", any: ["homework.submit"], roles: ["STUDENT"], group: "Academics" },
  { id: "students", label: "Students", icon: "graduation-cap", any: ["students.read"], group: "People" },
  { id: "teachers", label: "Teachers", icon: "users", any: ["teachers.read"], group: "People" },
  { id: "academics", label: "Academics", icon: "library", any: ["academic.classes.manage", "academic.assignments.manage"], group: "Academics" },
  { id: "my-classes", label: "My classes", icon: "school", any: ["marks.enter", "attendance.mark"], roles: ["TEACHER"], group: "Academics" },
  { id: "attendance", label: "Attendance", icon: "calendar-check", any: ["attendance.mark", "attendance.read"], group: "Academics" },
  { id: "class-tests", label: "Class tests", icon: "clipboard-list", any: ["classtests.manage"], group: "Academics" },
  { id: "homework", label: "Homework", icon: "book-open", any: ["homework.manage", "homework.read"], roles: ["TEACHER", "REGISTRAR", "HEADMASTER"], group: "Academics" },
  { id: "exams", label: "Exams", icon: "file-text", any: ["exams.create", "exams.authorize", "exams.read"], roles: ["HEADMASTER", "REGISTRAR"], group: "Exams" },
  { id: "marks", label: "Marks entry", icon: "pencil", any: ["marks.enter"], group: "Exams" },
  { id: "review", label: "Submissions inbox", icon: "inbox", any: ["marks.review", "marks.verify"], group: "Exams" },
  { id: "results", label: "Results", icon: "award", any: ["marks.verify", "results.approve", "results.publish", "results.read_published"], group: "Exams" },
  { id: "messages", label: "Messages", icon: "message-square", any: ["messages.read"], group: "Communication" },
  { id: "notices", label: "Notices", icon: "megaphone", any: ["notices.read"], group: "Communication" },
  { id: "documents", label: "Documents", icon: "folder", any: ["documents.read", "certificates.issue"], roles: ["HEADMASTER", "REGISTRAR", "TEACHER"], group: "Administration" },
  { id: "reports", label: "Reports", icon: "bar-chart-3", any: ["reports.read"], group: "Administration" },
  { id: "moderation", label: "Moderation", icon: "shield-alert", any: ["moderation.review"], group: "Administration" },
  { id: "permissions", label: "Roles & permissions", icon: "key-round", any: ["roles.manage"], group: "Administration" },
  { id: "audit", label: "Audit log", icon: "scroll-text", any: ["audit.read"], group: "Administration" },
  { id: "settings", label: "School settings", icon: "settings", any: ["school.settings.update", "settings.system.manage"], group: "Administration" },
];
export function navFor(s: Session | null): NavItem[] {
  if (!s) return [];
  return NAV.filter((n) => (!n.roles || n.roles.includes(s.role)) && (n.any.length === 0 || canAny(s, n.any)));
}
