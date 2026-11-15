"use client";
import dynamic from "next/dynamic";
import {
  Activity, Award, Bug, Building2, CalendarDays, ChartNoAxesColumn, CirclePlus, Contact, GraduationCap, Layers3,
  Megaphone, Presentation, School, ScrollText, ShieldCheck, SlidersHorizontal, SquarePen, Table2, UserRound, Users,
  BookOpenText, Inbox, CalendarCheck, MessageSquare, NotebookPen, type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import type { Role } from "@/api/contracts";
import { SkeletonRows } from "@/components/ui";

export type AppDef = { id: string; icon: LucideIcon; color: string; roles: Role[]; Component: ComponentType; size?: [number, number]; /** false = reachable from the menu bar / Spotlight / mobile home, but not pinned in the dock. */ inDock?: boolean; /** Only available against the live API (no mock data behind it). */ liveOnly?: boolean };

const load = (fn: () => Promise<{ default: ComponentType }>) => dynamic(fn, { ssr: false, loading: () => <SkeletonRows /> });

export const APPS: AppDef[] = [
  { id: "actions", icon: Inbox, color: "#FF5A5F", roles: ["headmaster", "registrar", "teacher", "student"], Component: load(() => import("./actions/ActionCenter")), size: [760, 600], inDock: false },
  { id: "results", icon: Table2, color: "#FF8A1F", roles: ["headmaster", "registrar"], Component: load(() => import("./results/ResultsCenter")), size: [1120, 660] },
  { id: "students", icon: GraduationCap, color: "#4F6BFF", roles: ["headmaster", "registrar"], Component: load(() => import("./students/Students")), size: [1040, 640] },
  { id: "teachers", icon: Presentation, color: "#14B8A6", roles: ["headmaster", "registrar"], Component: load(() => import("./teachers/Teachers")) },
  { id: "classes", icon: Layers3, color: "#F0436A", roles: ["headmaster", "registrar"], Component: load(() => import("./classes/ClassesExams")) },
  { id: "approvals", icon: ShieldCheck, color: "#22A752", roles: ["headmaster", "registrar"], Component: load(() => import("./approvals/Approvals")), size: [820, 560] },
  { id: "routine", icon: CalendarDays, color: "#E8458B", roles: ["headmaster", "registrar", "teacher", "student"], Component: load(() => import("./routine/Routine")), size: [1020, 640] },
  { id: "magazine", icon: BookOpenText, color: "#C026D3", roles: ["headmaster", "registrar", "teacher", "student"], Component: load(() => import("./magazine/Magazine")) },
  { id: "notices", icon: Megaphone, color: "#1D8FE8", roles: ["headmaster", "registrar", "teacher", "student"], Component: load(() => import("./notices/Notices")), size: [860, 580] },
  { id: "audit", icon: ScrollText, color: "#8B5CF6", roles: ["headmaster", "registrar"], Component: load(() => import("./audit/AuditLog")) },
  { id: "settings", icon: SlidersHorizontal, color: "#64748B", roles: ["headmaster", "registrar"], Component: load(() => import("./settings/SettingsApp")), size: [820, 600] },

  { id: "myclasses", icon: School, color: "#2FB67C", roles: ["teacher"], Component: load(() => import("./myclasses/MyClasses")), size: [860, 560] },
  { id: "marks", icon: SquarePen, color: "#FF6A3D", roles: ["teacher"], Component: load(() => import("./marks/MarksEntry")), size: [1060, 660] },
  { id: "roster", icon: Users, color: "#3B82F6", roles: ["teacher"], Component: load(() => import("./roster/Roster")), size: [860, 580] },
  { id: "faculty", icon: Contact, color: "#7C6CF0", roles: ["teacher", "student"], Component: load(() => import("./faculty/Faculty")), size: [900, 580] },
  { id: "attendance", icon: CalendarCheck, color: "#0F9D6E", roles: ["teacher", "student", "headmaster", "registrar"], Component: load(() => import("./attendance/Attendance")), size: [900, 600], liveOnly: true },
  { id: "homework", icon: NotebookPen, color: "#F5A524", roles: ["teacher", "student", "headmaster", "registrar"], Component: load(() => import("./homework/Homework")), size: [980, 620], liveOnly: true },
  { id: "messages", icon: MessageSquare, color: "#0891B2", roles: ["teacher", "student", "headmaster", "registrar"], Component: load(() => import("./messages/Messages")), size: [960, 620], liveOnly: true },
  { id: "profile", icon: UserRound, color: "#6366F1", roles: ["headmaster", "registrar", "teacher", "student"], Component: load(() => import("./profile/Profile")), size: [620, 520] },

  { id: "myresults", icon: Award, color: "#FFB020", roles: ["student"], Component: load(() => import("./myresults/MyResults")), size: [980, 640] },

  { id: "schools", icon: Building2, color: "#2B7FFF", roles: ["petra"], Component: load(() => import("./petra/Schools")), size: [980, 620] },
  { id: "health", icon: Activity, color: "#22A752", roles: ["petra"], Component: load(() => import("./petra/Health")), size: [920, 600] },
  { id: "errors", icon: Bug, color: "#E5484D", roles: ["petra"], Component: load(() => import("./petra/Errors")), size: [900, 560] },
  { id: "usage", icon: ChartNoAxesColumn, color: "#8B5CF6", roles: ["petra"], Component: load(() => import("./petra/Usage")), size: [920, 600] },
  { id: "createschool", icon: CirclePlus, color: "#F97316", roles: ["petra"], Component: load(() => import("./petra/CreateSchool")), size: [640, 600] },
];

const LIVE = process.env.NEXT_PUBLIC_API_MODE === "http";
export const appsFor = (role: Role): AppDef[] => APPS.filter((a) => a.roles.includes(role) && (!a.liveOnly || LIVE));
export const appById = (id: string): AppDef | undefined => APPS.find((a) => a.id === id);
