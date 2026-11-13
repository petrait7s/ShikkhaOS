import type { Grading, MarkValue } from "@/api/contracts";

export const DEFAULT_GRADING: Grading = {
  passMark: 33,
  scale: [
    { min: 80, grade: "A+", point: 5 },
    { min: 70, grade: "A", point: 4 },
    { min: 60, grade: "A-", point: 3.5 },
    { min: 50, grade: "B", point: 3 },
    { min: 40, grade: "C", point: 2 },
    { min: 33, grade: "D", point: 1 },
    { min: 0, grade: "F", point: 0 },
  ],
};

export type SubjectGrade = { percent: number; grade: string; point: number; passed: boolean };

export function subjectGrade(mark: MarkValue, full: number, cfg: Grading = DEFAULT_GRADING): SubjectGrade {
  if (mark === null || mark === "AB" || full <= 0) return { percent: 0, grade: "F", point: 0, passed: false };
  const percent = (mark / full) * 100;
  const passed = percent >= cfg.passMark;
  if (!passed) return { percent, grade: "F", point: 0, passed: false };
  const band = [...cfg.scale].sort((a, b) => b.min - a.min).find((b) => percent >= b.min);
  if (!band) return { percent, grade: "F", point: 0, passed: false };
  return { percent, grade: band.grade, point: band.point, passed: true };
}

export type Overall = { gpa: number; grade: string; passed: boolean };

export function overallGpa(points: SubjectGrade[], cfg: Grading = DEFAULT_GRADING): Overall {
  if (points.length === 0) return { gpa: 0, grade: "F", passed: false };
  if (points.some((p) => !p.passed)) return { gpa: 0, grade: "Failed", passed: false };
  const gpa = points.reduce((s, p) => s + p.point, 0) / points.length;
  const rounded = Math.round(gpa * 100) / 100;
  const sorted = [...cfg.scale].sort((a, b) => b.point - a.point);
  const band = sorted.find((b) => rounded >= b.point) ?? sorted[sorted.length - 1];
  return { gpa: rounded, grade: band ? band.grade : "F", passed: true };
}

export type RankInput = { id: string; roll: number; total: number; gpa: number };

export function rankStudents(rows: RankInput[]): Map<string, number> {
  const sorted = [...rows].sort((a, b) => b.total - a.total || b.gpa - a.gpa || a.roll - b.roll);
  const out = new Map<string, number>();
  sorted.forEach((r, i) => out.set(r.id, i + 1));
  return out;
}

export function markTotal(marks: MarkValue[]): number {
  return marks.reduce<number>((s, m) => (typeof m === "number" ? s + m : s), 0);
}
