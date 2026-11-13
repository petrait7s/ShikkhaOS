// Live-API school setup: student import, teachers + assignments, subjects, exams (+ papers), grading, school profile.
// New accounts get one-time temporary passwords from the API; they are saved to a CSV the user downloads right away
// (the server never shows them again).
import { toast } from "sonner";
import type { Assignment, Exam, Grading, School, SubjectDef, Teacher } from "../contracts";
import type { Repos, RosterRow, TeacherRow } from "../repositories";
import { ApiError } from "../mock/db";
import { call, listAll } from "./client";
import { refs } from "./live";
import { reauthHeaders } from "./reauth";

const SCHOOL = "school";
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function downloadCredentials(kind: string, rows: string[][]): void {
  if (typeof document === "undefined" || rows.length === 0) return;
  const body = [["Name", "ID / username", "Temporary password"], ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `ShikkhaOS-${kind}-temporary-passwords-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast.message("Temporary passwords saved to a CSV in your Downloads. Hand them out, then delete the file.", { duration: 12000 });
}

type ImportRes = { created: number; errors?: { line: number; field: string; message: string }[]; credentials?: { fullName: string; studentCode: string; username: string; temporaryPassword: string }[] };

async function resetFor(kind: "students" | "teachers", id: string): Promise<string> {
  const p = (await call<{ userId: string }>("GET", `/${kind}/${id}`)).data;
  const r = await call<{ temporaryPassword: string }>("POST", `/users/${p.userId}/reset-password`, { body: {}, headers: await reauthHeaders("Reset this person's password. They must choose a new one at next sign-in.") });
  return r.data.temporaryPassword;
}

export const liveStudent: Partial<Repos["student"]> = {
  async importRoster(rows: RosterRow[]) {
    const header = "studentCode,fullName,dob,gender,guardianName,guardianPhone,address,className,sectionName,rollNo";
    const csv = [header, ...rows.map((r) => [r.studentId, r.name, r.dob ?? "", r.gender ?? "", r.guardian, r.guardianPhone, "", `Class ${r.classNo}`, r.section, r.roll].map(csvCell).join(","))].join("\n") + "\n";
    const res = (await call<ImportRes>("POST", "/students/import", { body: { csv, dryRun: false } })).data;
    if (res.errors?.length) {
      const first = res.errors.slice(0, 3).map((e) => `line ${e.line}: ${e.message}`).join("; ");
      throw new ApiError(`Nothing was imported. ${first}${res.errors.length > 3 ? ` (and ${res.errors.length - 3} more)` : ""}`, "import_invalid");
    }
    downloadCredentials("students", (res.credentials ?? []).map((c) => [c.fullName, c.username, c.temporaryPassword]));
    return { added: res.created, updated: 0 };
  },
  resetPassword: (id) => resetFor("students", id),
};

type ApiTeacher = { id: string; fullName: string; designation: string; phone: string; status: string };
type ApiAssign = { id: string; teacherId: string; classId: string; sectionId: string; subjectId: string | null; sessionId: string; isClassTeacher: boolean };

async function assignmentsByTeacher(): Promise<Map<string, Assignment[]>> {
  const r = await refs();
  const out = new Map<string, Assignment[]>();
  for (const a of await listAll<ApiAssign>("/teacher-assignments")) {
    const cls = r.classes.find((c) => c.id === a.classId), sec = r.sections.find((s) => s.id === a.sectionId), sub = r.subjects.find((s) => s.id === a.subjectId);
    if (!cls || !sec) continue;
    out.set(a.teacherId, [...(out.get(a.teacherId) ?? []), { classNo: cls.level, section: sec.name, subject: sub?.name ?? "Class teacher" }]);
  }
  return out;
}
const toTeacher = (t: ApiTeacher, a: Assignment[]): Teacher => ({ id: t.id, schoolId: SCHOOL, name: t.fullName, nameBn: t.fullName, phone: t.phone, email: "", designation: t.designation, assignments: a, status: t.status === "ACTIVE" ? "active" : "invited" });

async function createTeacher(r: TeacherRow): Promise<{ teacher: ApiTeacher; temporaryPassword: string }> {
  const digits = r.phone.replace(/\D/g, "");
  const username = digits || r.email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "");
  const res = await call<{ teacher: ApiTeacher; temporaryPassword: string }>("POST", "/teachers", {
    body: { employeeCode: `EMP-${digits.slice(-8) || username}`.slice(0, 30), fullName: r.name, username, email: r.email || null, designation: r.designation || "Teacher", phone: digits },
  });
  return res.data;
}

export const liveTeacher: Partial<Repos["teacher"]> = {
  async list() {
    const [ts, as] = await Promise.all([listAll<ApiTeacher>("/teachers"), assignmentsByTeacher()]);
    return ts.map((t) => toTeacher(t, as.get(t.id) ?? []));
  },
  async createInvite(input) {
    const { teacher, temporaryPassword } = await createTeacher(input);
    downloadCredentials("teacher", [[input.name, input.phone.replace(/\D/g, ""), temporaryPassword]]);
    return { code: temporaryPassword, schoolId: SCHOOL, teacherId: teacher.id, status: "pending", createdAt: new Date().toISOString() };
  },
  async importTeachers(rows) {
    const creds: string[][] = [];
    let added = 0;
    try {
      for (const r of rows) { const x = await createTeacher(r); creds.push([r.name, r.phone.replace(/\D/g, ""), x.temporaryPassword]); added++; }
    } finally { downloadCredentials("teachers", creds); }
    return { added };
  },
  async setAssignments(id, assignments) {
    const r = await refs();
    const sessions = await listAll<{ id: string; isCurrent: boolean }>("/academic-sessions");
    const session = sessions.find((s) => s.isCurrent) ?? sessions[0];
    const existing = (await listAll<ApiAssign>("/teacher-assignments")).filter((a) => a.teacherId === id);
    const keyOf = (classId: string, sectionId: string, subjectId: string | null) => `${classId}|${sectionId}|${subjectId ?? ""}`;
    const have = new Set(existing.map((a) => keyOf(a.classId, a.sectionId, a.subjectId)));
    const want = assignments.map((a) => {
      const cls = r.classes.find((c) => c.level === a.classNo), sec = r.sections.find((s) => s.classId === cls?.id && s.name === a.section), sub = r.subjects.find((s) => s.name === a.subject);
      if (!cls || !sec) throw new ApiError(`Class ${a.classNo}-${a.section} does not exist.`, "not_found");
      return { classId: cls.id, sectionId: sec.id, subjectId: sub?.id ?? null };
    });
    const wantKeys = new Set(want.map((w) => keyOf(w.classId, w.sectionId, w.subjectId)));
    if ([...have].some((k) => !wantKeys.has(k))) throw new ApiError("Removing an assignment is not supported yet. Add the new ones only.", "not_supported");
    for (const w of want) if (!have.has(keyOf(w.classId, w.sectionId, w.subjectId))) await call("POST", "/teacher-assignments", { body: { teacherId: id, sessionId: session.id, classId: w.classId, sectionId: w.sectionId, subjectId: w.subjectId, isClassTeacher: false } });
    const t = (await call<ApiTeacher>("GET", `/teachers/${id}`)).data;
    return toTeacher(t, (await assignmentsByTeacher()).get(id) ?? []);
  },
  resetPassword: (id) => resetFor("teachers", id),
};

type ClassSubject = { id: string; classId: string; subjectId: string; fullMarks: number; passMarks: number; version: number };
type ApiExam = { id: string; name: string; type: string; startDate: string; status: string };
export const examOf = (e: ApiExam): Exam & { status: string } => ({ id: e.id, schoolId: SCHOOL, name: e.name, nameBn: e.name, kind: /test/i.test(e.type) ? "test" : "term", year: Number(e.startDate?.slice(0, 4)) || new Date().getFullYear(), status: e.status });

export const liveKlassSetup: Partial<Repos["klass"]> = {
  async subjects(): Promise<SubjectDef[]> {
    const r = await refs();
    return (await listAll<ClassSubject>("/class-subjects")).flatMap((cs) => {
      const cls = r.classes.find((c) => c.id === cs.classId), sub = r.subjects.find((s) => s.id === cs.subjectId);
      return cls && sub ? [{ schoolId: SCHOOL, classNo: cls.level, subject: sub.name, subjectBn: sub.nameBn ?? sub.name, full: cs.fullMarks, pass: cs.passMarks, components: [] }] : [];
    });
  },
  async updateSubject(classNo, subject, patch) {
    const r = await refs();
    const cls = r.classes.find((c) => c.level === classNo), sub = r.subjects.find((s) => s.name === subject);
    const cs = (await listAll<ClassSubject>("/class-subjects")).find((x) => x.classId === cls?.id && x.subjectId === sub?.id);
    if (!cs) throw new ApiError("This subject is not set up for the class.", "not_found");
    await call("PATCH", `/class-subjects/${cs.id}`, { body: { fullMarks: patch.full, passMarks: patch.pass, version: cs.version } });
  },
  async createExam(name, nameBn) {
    const today = new Date(), end = new Date(Date.now() + 7 * 86400000);
    const e = (await call<ApiExam>("POST", "/exams", { body: { name: (name || nameBn).trim(), type: /test/i.test(name) ? "TEST" : "TERM", startDate: today.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) } })).data;
    for (const cs of await listAll<ClassSubject>("/class-subjects")) await call("POST", "/exam-papers", { body: { examId: e.id, classId: cs.classId, subjectId: cs.subjectId } });
    return examOf(e);
  },
  async grading(): Promise<Grading> {
    const s = (await call<{ gradingScheme: { bands: { grade: string; min: number; point: number }[] } }>("GET", "/school")).data.gradingScheme.bands;
    return { scale: s.map((b) => ({ min: b.min, grade: b.grade, point: b.point })), passMark: Math.min(...s.filter((b) => b.point > 0).map((b) => b.min)) };
  },
  async setGrading(g) {
    const cur = (await call<{ version: number; gradingScheme: { failIfAnySubjectFails: boolean } }>("GET", "/school")).data;
    await call("PATCH", "/school", { body: { gradingScheme: { bands: g.scale.map((b) => ({ grade: b.grade, min: b.min, point: b.point })), failIfAnySubjectFails: cur.gradingScheme.failIfAnySubjectFails }, version: cur.version } });
  },
};

export const authorizeExam = async (id: string) => { await call("POST", `/exams/${id}/authorize`, { body: {}, headers: await reauthHeaders("Authorize this exam. Teachers can then enter marks.") }); };

export const liveSchoolSetup: Partial<Repos["school"]> = {
  async update(patch) {
    const cur = (await call<{ version: number }>("GET", "/school")).data;
    const body: Record<string, unknown> = { version: cur.version };
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.nameBn !== undefined) body.nameBn = patch.nameBn;
    await call("PATCH", "/school", { body });
    return liveSchoolGet();
  },
};
export async function liveSchoolGet(): Promise<School> {
  const s = (await call<{ name: string; nameBn?: string | null; address?: string | null }>("GET", "/school")).data;
  return { id: SCHOOL, name: s.name, nameBn: s.nameBn ?? s.name, city: s.address ?? "", monogram: s.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(), primary: "#0F172A", joinCode: "", status: "active", autoApprove: false, seasonOverride: null };
}
