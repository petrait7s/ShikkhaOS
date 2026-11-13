import type { Cell, DB, Student, StudentResult } from "../contracts";
import { markTotal, overallGpa, rankStudents, subjectGrade } from "@/lib/grading";
import { DEFAULT_GRADING } from "@/lib/grading";
import { notify } from "./db";

export function applyScheduled(db: DB): void {
  const now = Date.now();
  for (const p of db.publications) {
    if (p.state === "scheduled" && new Date(p.at).getTime() <= now) {
      p.state = "published";
      for (const c of db.cells) {
        if (c.schoolId === p.schoolId && c.examId === p.examId && c.classNo === p.classNo && c.section === p.section) {
          c.state = "published";
          c.locked = true;
        }
      }
      notify(p.schoolId, "student", `Results for Class ${p.classNo}-${p.section} are now published.`);
    }
  }
}

export function classCells(db: DB, schoolId: string, examId: string, classNo: number, section: string): Cell[] {
  return db.cells.filter((c) => c.schoolId === schoolId && c.examId === examId && c.classNo === classNo && c.section === section);
}

export function computeClass(db: DB, schoolId: string, examId: string, classNo: number, section: string): Map<string, StudentResult> {
  const cfg = db.grading[schoolId] ?? DEFAULT_GRADING;
  const students = db.students.filter((s) => s.schoolId === schoolId && s.classNo === classNo && s.section === section);
  const defs = db.subjects.filter((d) => d.schoolId === schoolId && d.classNo === classNo);
  const cells = classCells(db, schoolId, examId, classNo, section);
  const rows = students.map((st: Student) => {
    const subjects = defs.map((d) => {
      const cell = cells.find((c) => c.subject === d.subject);
      const mark = cell ? (cell.marks[st.id] ?? null) : null;
      const g = subjectGrade(mark, d.full, { ...cfg, passMark: d.pass });
      return { subject: d.subject, subjectBn: d.subjectBn, mark, full: d.full, grade: g.grade, point: g.point, passed: g.passed };
    });
    const overall = overallGpa(subjects.map((x) => ({ percent: 0, grade: x.grade, point: x.point, passed: x.passed })), cfg);
    const total = markTotal(subjects.map((x) => x.mark));
    return { st, subjects, overall, total };
  });
  const ranks = rankStudents(rows.map((r) => ({ id: r.st.id, roll: r.st.roll, total: r.total, gpa: r.overall.gpa })));
  const out = new Map<string, StudentResult>();
  for (const r of rows) {
    out.set(r.st.id, {
      examId, studentId: r.st.id, subjects: r.subjects, total: r.total, gpa: r.overall.gpa, grade: r.overall.grade,
      passed: r.overall.passed, position: ranks.get(r.st.id) ?? 0, classSize: rows.length,
    });
  }
  return out;
}

export function isPublished(db: DB, schoolId: string, examId: string, classNo: number, section: string): boolean {
  return db.publications.some((p) => p.schoolId === schoolId && p.examId === examId && p.classNo === classNo && p.section === section && p.state === "published");
}
