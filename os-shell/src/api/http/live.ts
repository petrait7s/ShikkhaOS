// Live-API implementations for the results pipeline, notices, notifications, audit, profile.
// Model mapping: the OS UI thinks in "cells" (exam x class x section x subject); the API in mark submissions,
// exam papers and per-class result sets. Class number = class.level; subject key = subject name.
import type { Cell, CellState, Exam, MarkValue, Notice, Notification, AuditLog, StudentResult, ClassSummary, SubjectDef, Publication } from "../contracts";
import type { CellKey, MyProfile, Repos } from "../repositories";
import { ApiError } from "../mock/db";
import { call, listAll } from "./client";
import { reauthHeaders } from "./reauth";

const SCHOOL = "school";
type Cls = { id: string; level: number; name: string };
type Sec = { id: string; classId: string; name: string };
type Sub = { id: string; code: string; name: string; nameBn: string | null; fullMarksDefault: number };
type Refs = { classes: Cls[]; sections: Sec[]; subjects: Sub[] };
type Row = { id: string; examId: string; className: string; sectionName: string; subjectName: string; subjectCode: string; teacherName: string; status: string; fullMarks: number; passMarks: number; submittedAt: string | null; version: number };
type Entry = { studentId: string; marksObtained: number | null; absent: boolean };
type Detail = Row & { entries: Entry[]; note: string | null };
type Paper = { id: string; examId: string; classId: string; subjectId: string; fullMarks: number; passMarks: number };
type ResultSet = { id: string; examId: string; examName: string; classId: string; className: string; status: string; publishedAt: string | null };
type ResultRow = { studentId: string; totalMarks: number; gpa: number | null; passed: boolean };

let refsP: Promise<Refs> | null = null;
export const refs = (): Promise<Refs> => (refsP ??= Promise.all([listAll<Cls>("/classes"), listAll<Sec>("/sections"), listAll<Sub>("/subjects")]).then(([classes, sections, subjects]) => ({ classes, sections, subjects })).catch((e) => { refsP = null; throw e; }));
export const dropRefs = () => { refsP = null; };

const levelOf = (r: Refs, className: string) => r.classes.find((c) => c.name === className)?.level ?? (Number(className.replace(/\D/g, "")) || 0);
const classByNo = (r: Refs, no: number) => { const c = r.classes.find((x) => x.level === no); if (!c) throw new ApiError(`Class ${no} does not exist.`, "not_found"); return c; };
const unsupported = (what: string) => () => Promise.reject(new ApiError(`${what} is not available in the live system yet.`, "not_supported"));

const STATE: Record<string, CellState> = { DRAFT: "draft", SUBMITTED: "submitted", UNDER_REVIEW: "submitted", CORRECTION_REQUESTED: "draft", VERIFIED: "verified" };
const LOCKED = new Set(["SUBMITTED", "UNDER_REVIEW", "VERIFIED"]);
const toMarks = (entries: Entry[]): Record<string, MarkValue> => Object.fromEntries(entries.map((e) => [e.studentId, e.absent ? "AB" : e.marksObtained]));
const fromMarks = (marks: Record<string, MarkValue>) => Object.entries(marks).map(([studentId, v]) => (v === "AB" ? { studentId, absent: true } : { studentId, marksObtained: v, absent: false }));

function cellOf(r: Refs, row: Row | null, k: { examId: string; classNo: number; section: string; subject: string }, published: boolean, detail?: Detail): Cell {
  return {
    schoolId: SCHOOL, examId: k.examId, classNo: k.classNo, section: k.section, subject: k.subject,
    state: published && row?.status === "VERIFIED" ? "published" : row ? STATE[row.status] ?? "draft" : "not_started",
    marks: detail ? toMarks(detail.entries) : {}, submittedBy: row?.teacherName ?? null, source: row ? "teacher" : "none",
    updatedAt: row?.submittedAt ?? null, returnComment: row?.status === "CORRECTION_REQUESTED" ? detail?.note ?? "Correction requested" : null, locked: row ? LOCKED.has(row.status) : false,
  };
}

async function submissions(examId: string): Promise<Row[]> { return listAll<Row>("/mark-submissions", { examId }); }

async function findRow(k: CellKey): Promise<{ r: Refs; row: Row }> {
  const r = await refs();
  const row = (await submissions(k.examId)).find((x) => levelOf(r, x.className) === k.classNo && x.sectionName === k.section && x.subjectName === k.subject);
  if (!row) throw new ApiError("This sheet has not been assigned yet.", "not_found");
  return { r, row };
}
const detail = async (id: string) => (await call<Detail>("GET", `/mark-submissions/${id}`)).data;

async function cellDetail(k: CellKey): Promise<Cell> {
  const { r, row } = await findRow(k);
  return cellOf(r, row, k, false, await detail(row.id));
}

async function saveEntries(id: string, marks: Record<string, MarkValue>) { await call("PUT", `/mark-submissions/${id}/entries`, { body: { entries: fromMarks(marks) } }); }

async function resultSetFor(examId: string, classNo: number, create: boolean): Promise<ResultSet | null> {
  const r = await refs();
  const cls = classByNo(r, classNo);
  const sets = await listAll<ResultSet>("/result-sets", { examId });
  const found = sets.find((s) => s.classId === cls.id);
  if (found || !create) return found ?? null;
  const made = (await call<ResultSet>("POST", "/result-sets", { body: { examId, classId: cls.id } })).data;
  return made;
}

async function publishClass(examId: string, classNo: number) {
  let set = await resultSetFor(examId, classNo, true);
  if (!set) throw new ApiError("Nothing to publish.", "not_found");
  if (set.status === "PUBLISHED") return;
  if (set.status === "REJECTED") set = (await call<ResultSet>("POST", "/result-sets", { body: { examId, classId: set.classId } })).data;
  if (set.status === "VERIFIED") {
    await call("POST", `/result-sets/${set.id}/approve`, { body: {}, headers: await reauthHeaders("Approve this result. It will then be ready to publish.") });
  }
  await call("POST", `/result-sets/${set.id}/publish`, { body: {}, headers: await reauthHeaders("Publish this result to students.") });
}

type Published = { resultSetId: string; examName: string; examType: string; revision: number; totalMarks: number; gpa: number; grade: string; passed: boolean; position: number | null; publishedAt: string; subjects: { subjectId: string; marks: number; fullMarks: number; grade: string; gradePoint: number; absent: boolean; passed: boolean; subjectName?: string }[] };
const myPublished = async (): Promise<Published[]> => {
  const me = (await call<{ id: string }>("GET", "/students/me")).data;
  return (await call<Published[]>("GET", `/students/${me.id}/results`)).data;
};
const asExam = (p: Published): Exam => ({ id: p.resultSetId, schoolId: SCHOOL, name: p.examName, nameBn: p.examName, kind: /test/i.test(p.examType) ? "test" : "term", year: new Date(p.publishedAt).getFullYear() });
const asResult = (p: Published): StudentResult => ({
  examId: p.resultSetId, studentId: "me", total: p.totalMarks, gpa: p.gpa, grade: p.grade, passed: p.passed, position: p.position ?? 0, classSize: 0,
  subjects: p.subjects.map((s) => ({ subject: s.subjectName ?? s.subjectId, subjectBn: s.subjectName ?? s.subjectId, mark: s.absent ? "AB" : s.marks, full: s.fullMarks, grade: s.grade, point: s.gradePoint, passed: s.passed })),
});

export const liveKlass: Partial<Repos["klass"]> = {
  async subjects(): Promise<SubjectDef[]> {
    const r = await refs();
    const papers = await listAll<Paper>("/exam-papers");
    const seen = new Map<string, SubjectDef>();
    for (const p of papers) {
      const cls = r.classes.find((c) => c.id === p.classId), sub = r.subjects.find((s) => s.id === p.subjectId);
      if (!cls || !sub) continue;
      seen.set(`${cls.level}:${sub.id}`, { schoolId: SCHOOL, classNo: cls.level, subject: sub.name, subjectBn: sub.nameBn ?? sub.name, full: p.fullMarks, pass: p.passMarks, components: [] });
    }
    return [...seen.values()];
  },
};

export const liveExam: Repos["exam"] = {
  async matrix(examId) {
    const r = await refs();
    const [papers, subs, sets] = await Promise.all([listAll<Paper>("/exam-papers", { examId }), submissions(examId), listAll<ResultSet>("/result-sets", { examId })]);
    const cells: Cell[] = [];
    for (const p of papers) {
      const cls = r.classes.find((c) => c.id === p.classId), sub = r.subjects.find((s) => s.id === p.subjectId);
      if (!cls || !sub) continue;
      const published = sets.some((s) => s.classId === cls.id && s.status === "PUBLISHED");
      for (const sec of r.sections.filter((s) => s.classId === cls.id)) {
        const row = subs.find((x) => x.className === cls.name && x.sectionName === sec.name && x.subjectCode === sub.code) ?? null;
        cells.push(cellOf(r, row, { examId, classNo: cls.level, section: sec.name, subject: sub.name }, published));
      }
    }
    const publications: Publication[] = [];
    for (const s of sets.filter((x) => x.status === "PUBLISHED")) {
      const cls = r.classes.find((c) => c.id === s.classId);
      if (cls) for (const sec of r.sections.filter((x) => x.classId === cls.id)) publications.push({ schoolId: SCHOOL, examId, classNo: cls.level, section: sec.name, state: "published", at: s.publishedAt ?? "" });
    }
    return { cells, publications };
  },
};

export const liveMarks: Partial<Repos["marks"]> = {
  cell: cellDetail,
  async myCells(examId) {
    const r = await refs();
    return (await submissions(examId)).map((row) => cellOf(r, row, { examId, classNo: levelOf(r, row.className), section: row.sectionName, subject: row.subjectName }, false));
  },
  async saveDraft(k, marks) { const { row } = await findRow(k); await saveEntries(row.id, marks); return cellDetail(k); },
  async submit(k, marks) { const { row } = await findRow(k); await saveEntries(row.id, marks); await call("POST", `/mark-submissions/${row.id}/submit`, { body: {} }); return cellDetail(k); },
  async verify(k) {
    const { row } = await findRow(k);
    if (row.status === "SUBMITTED") await call("POST", `/mark-submissions/${row.id}/start-review`, { body: {} });
    await call("POST", `/mark-submissions/${row.id}/verify`, { body: {} });
    return cellDetail(k);
  },
  async returnCell(k, comment) {
    const { row } = await findRow(k);
    if (row.status === "SUBMITTED") await call("POST", `/mark-submissions/${row.id}/start-review`, { body: {} });
    await call("POST", `/mark-submissions/${row.id}/request-correction`, { body: { reason: comment, items: [] } });
    return cellDetail(k);
  },
  async importMarks(k, values) { const { row } = await findRow(k); await saveEntries(row.id, values); await call("POST", `/mark-submissions/${row.id}/submit`, { body: {} }); return cellDetail(k); },
  paper: async () => null,
  paperKeys: async () => [],
  savePaper: unsupported("Attaching a question paper"),
  removePaper: unsupported("Removing a question paper"),
};

export const liveResult: Partial<Repos["result"]> = {
  async summary(examId, classNo): Promise<ClassSummary> {
    const set = await resultSetFor(examId, classNo, false);
    if (!set) return { students: 0, passRate: 0, avgGpa: 0, failCount: 0 };
    const d = (await call<{ results: ResultRow[] }>("GET", `/result-sets/${set.id}`)).data.results;
    const gpas = d.map((x) => x.gpa ?? 0);
    return { students: d.length, passRate: d.length ? (d.filter((x) => x.passed).length / d.length) * 100 : 0, avgGpa: gpas.length ? gpas.reduce((a, b) => a + b, 0) / gpas.length : 0, failCount: d.filter((x) => !x.passed).length };
  },
  async publish(examId, classNo) { await publishClass(examId, classNo); },
  schedule: unsupported("Scheduled publishing"),
  unpublish: unsupported("Unpublishing (use a revision request instead)"),
  async publishAllReady(examId) {
    const m = await liveExam.matrix(examId);
    const byClass = new Map<number, Cell[]>();
    for (const c of m.cells) byClass.set(c.classNo, [...(byClass.get(c.classNo) ?? []), c]);
    let n = 0;
    for (const [classNo, cs] of byClass) if (cs.length && cs.every((c) => c.state === "verified")) { await publishClass(examId, classNo); n++; }
    return n;
  },
  async myExams() { return (await myPublished()).map((p) => ({ exam: asExam(p), state: "published" as const, at: p.publishedAt })); },
  async myResult(examId) {
    const p = (await myPublished()).find((x) => x.resultSetId === examId);
    if (!p) throw new ApiError("This result is not published.", "not_found");
    return asResult(p);
  },
  async myHistory() { return (await myPublished()).map((p) => ({ exam: asExam(p), result: asResult(p) })); },
};

type ApiNotice = { id: string; title: string; body: string; audience: { roles: string[]; classIds: string[] }; publishedAt: string | null; pinned: boolean; createdByName: string };
const noticeOf = (n: ApiNotice, r: Refs): Notice => {
  const teachersOnly = n.audience.roles.length === 1 && n.audience.roles[0] === "TEACHER";
  const cls = n.audience.classIds.length ? r.classes.find((c) => c.id === n.audience.classIds[0]) : undefined;
  return { id: n.id, schoolId: SCHOOL, title: n.title, body: n.body, audience: cls ? "class" : teachersOnly ? "teachers" : "all", classNo: cls?.level ?? null, pinned: n.pinned, publishAt: n.publishedAt ?? new Date().toISOString(), reads: 0, author: n.createdByName };
};

export const liveNotice: Partial<Repos["notice"]> = {
  async list() { const r = await refs(); return (await listAll<ApiNotice>("/notices")).filter((n) => n.publishedAt).map((n) => noticeOf(n, r)); },
  async create(input) {
    const r = await refs();
    const audience = input.audience === "teachers" ? { roles: ["TEACHER"], classIds: [], sectionIds: [] } : input.audience === "class" && input.classNo ? { roles: [], classIds: [classByNo(r, input.classNo).id], sectionIds: [] } : { roles: [], classIds: [], sectionIds: [] };
    const made = (await call<ApiNotice & { id: string }>("POST", "/notices", { body: { title: input.title, body: input.body, audience, pinned: input.pinned } })).data;
    const pub = (await call<ApiNotice>("POST", `/notices/${made.id}/publish`, { body: {} })).data;
    return noticeOf(pub, r);
  },
  togglePin: unsupported("Pinning"),
  markRead: async () => undefined,
  async notifications() {
    const items = await listAll<{ id: string; title: string; body: string; createdAt: string; readAt: string | null }>("/notifications", {}, 2);
    return items.map((n): Notification => ({ id: n.id, schoolId: SCHOOL, userId: null, role: null, text: `${n.title}: ${n.body}`, at: n.createdAt, read: !!n.readAt }));
  },
  async markNotificationRead(id) { await call("POST", `/notifications/${id}/read`, { body: {} }); },
  async markAllRead() { await call("POST", "/notifications/read-all", { body: {} }); },
};

const ROLE_LC: Record<string, AuditLog["role"]> = { HEADMASTER: "headmaster", REGISTRAR: "registrar", TEACHER: "teacher", STUDENT: "student" };
export const liveAudit: Repos["audit"] = {
  async list() {
    const rows = await listAll<{ id: string; actorName: string | null; actorRole: string | null; action: string; entityType: string; createdAt: string }>("/audit-logs", {}, 5);
    return rows.map((a): AuditLog => ({ id: a.id, schoolId: SCHOOL, actor: a.actorName ?? "System", role: ROLE_LC[a.actorRole ?? ""] ?? "registrar", action: a.action, entity: a.entityType, summary: `${a.action} · ${a.entityType}`, at: a.createdAt }));
  },
};

export const liveProfile: Partial<Repos["profile"]> = {
  async me(): Promise<MyProfile> {
    const u = (await call<{ user: { role: string; displayName: string; email: string | null } }>("GET", "/auth/me")).data.user;
    return { role: (ROLE_LC[u.role] ?? "student") as MyProfile["role"], name: u.displayName, nameBn: u.displayName, photo: null, bio: "", email: u.email ?? "", phone: "", address: "", bloodGroup: "" };
  },
  async changePassword(current, next) { await call("POST", "/auth/change-password", { body: { currentPassword: current, newPassword: next } }); },
  updateMe: unsupported("Editing your profile"),
  updatePerson: unsupported("Editing a person"),
};

export const liveApproval: Repos["approval"] = { pendingSignups: async () => [], approve: unsupported("Sign-up approval"), reject: unsupported("Sign-up approval") };
export const liveRoutine: Repos["routine"] = { list: async () => [], examSlots: async () => [], setSlot: unsupported("Routine editing"), clearSlot: unsupported("Routine editing"), saveExamSlot: unsupported("Routine editing"), removeExamSlot: unsupported("Routine editing") };
export const liveMagazine: Repos["magazine"] = { issues: async () => [], articles: async () => [], submit: unsupported("Magazine"), review: unsupported("Magazine"), createIssue: unsupported("Magazine"), publishIssue: unsupported("Magazine"), saveArticle: unsupported("Magazine") };
