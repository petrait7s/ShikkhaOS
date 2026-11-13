"use client";
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { repos } from "./factory";
import { useUI } from "@/store/ui";

export const keys = {
  school: ["school"] as const,
  students: ["students"] as const,
  teachers: ["teachers"] as const,
  invites: ["invites"] as const,
  subjects: ["subjects"] as const,
  exams: ["exams"] as const,
  routine: ["routine"] as const,
  profile: ["profile"] as const,
  paper: (k: string) => ["paper", k] as const,
  paperKeys: (examId: string) => ["paperKeys", examId] as const,
  examSlots: (examId: string) => ["examSlots", examId] as const,
  grading: ["grading"] as const,
  matrix: (e: string) => ["matrix", e] as const,
  cell: (e: string, c: number, s: string, sub: string) => ["cell", e, c, s, sub] as const,
  myCells: (e: string) => ["myCells", e] as const,
  articles: ["articles"] as const,
  issues: ["issues"] as const,
  notices: ["notices"] as const,
  notifications: ["notifications"] as const,
  signups: ["signups"] as const,
  audit: ["audit"] as const,
  platform: ["platform"] as const,
  myExams: ["myExams"] as const,
  myHistory: ["myHistory"] as const,
  me: ["me"] as const,
};

export function useSchoolQ() {
  const role = useUI((s) => s.session?.role);
  return useQuery({ queryKey: keys.school, queryFn: () => repos.school.current(), enabled: !!role && role !== "petra" });
}
export const useStudentsQ = () => useQuery({ queryKey: keys.students, queryFn: () => repos.student.list() });
export const useMeStudentQ = (enabled = true) => useQuery({ queryKey: [...keys.me, "student"], queryFn: () => repos.student.me(), enabled });
export const useTeachersQ = () => useQuery({ queryKey: keys.teachers, queryFn: () => repos.teacher.list() });
export const useMeTeacherQ = (enabled = true) => useQuery({ queryKey: [...keys.me, "teacher"], queryFn: () => repos.teacher.me(), enabled });
export const useInvitesQ = () => useQuery({ queryKey: keys.invites, queryFn: () => repos.teacher.invites() });
export const useSubjectsQ = () => useQuery({ queryKey: keys.subjects, queryFn: () => repos.klass.subjects() });
export const useExamsQ = () => useQuery({ queryKey: keys.exams, queryFn: () => repos.klass.exams() });
export const useGradingQ = () => useQuery({ queryKey: keys.grading, queryFn: () => repos.klass.grading() });
export const useMatrixQ = (examId: string) => useQuery({ queryKey: keys.matrix(examId), queryFn: () => repos.exam.matrix(examId), enabled: !!examId, refetchInterval: 30_000 });
export const useMyCellsQ = (examId: string) => useQuery({ queryKey: keys.myCells(examId), queryFn: () => repos.marks.myCells(examId), enabled: !!examId });
export const useArticlesQ = () => useQuery({ queryKey: keys.articles, queryFn: () => repos.magazine.articles() });
export const useIssuesQ = () => useQuery({ queryKey: keys.issues, queryFn: () => repos.magazine.issues() });
export const useNoticesQ = (enabled = true) => useQuery({ queryKey: keys.notices, queryFn: () => repos.notice.list(), enabled });
export const useNotificationsQ = (enabled = true) => useQuery({ queryKey: keys.notifications, queryFn: () => repos.notice.notifications(), refetchInterval: 20_000, enabled });
export const useSignupsQ = (enabled = true) => useQuery({ queryKey: keys.signups, queryFn: () => repos.approval.pendingSignups(), enabled });
export const useAuditQ = () => useQuery({ queryKey: keys.audit, queryFn: () => repos.audit.list() });
export const useMyExamsQ = (enabled = true) => useQuery({ queryKey: keys.myExams, queryFn: () => repos.result.myExams(), refetchInterval: 15_000, enabled });
export const useMyHistoryQ = () => useQuery({ queryKey: keys.myHistory, queryFn: () => repos.result.myHistory() });
export const usePlatformQ = () => ({
  schools: useQuery({ queryKey: [...keys.platform, "schools"], queryFn: () => repos.platform.schools() }),
  metrics: useQuery({ queryKey: [...keys.platform, "metrics"], queryFn: () => repos.platform.metrics() }),
  errors: useQuery({ queryKey: [...keys.platform, "errors"], queryFn: () => repos.platform.errors() }),
});

export function useMut<V, R>(fn: (v: V) => Promise<R>, invalidate: QueryKey[], success?: string | ((r: R) => string)) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: k });
      void qc.invalidateQueries({ queryKey: keys.audit });
      void qc.invalidateQueries({ queryKey: keys.notifications });
      if (success) toast.success(typeof success === "function" ? success(r) : success);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong."),
  });
}

export const RESULT_KEYS: QueryKey[] = [["matrix"], ["cell"], ["myCells"], keys.myExams, keys.myHistory];

export const useRoutineQ = () => useQuery({ queryKey: keys.routine, queryFn: () => repos.routine.list() });
export const useExamSlotsQ = (examId: string) => useQuery({ queryKey: keys.examSlots(examId), queryFn: () => repos.routine.examSlots(examId), enabled: !!examId });

export const useMyProfileQ = () => {
  const role = useUI((s) => s.session?.role);
  return useQuery({ queryKey: keys.profile, queryFn: () => repos.profile.me(), enabled: !!role && role !== "petra" });
};
export const usePaperKeysQ = (examId: string, enabled = true) => useQuery({ queryKey: keys.paperKeys(examId), queryFn: () => repos.marks.paperKeys(examId), enabled: !!examId && enabled });
