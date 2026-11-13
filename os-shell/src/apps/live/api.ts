// Typed fetchers for the OS apps that have no mock counterpart (attendance, homework, messages).
// They talk to the live API directly and are only shown when NEXT_PUBLIC_API_MODE=http.
import { call, listAll } from "@/api/http/client";
import { refs } from "@/api/http/live";

export const LIVE = process.env.NEXT_PUBLIC_API_MODE === "http";

export type Names = { cls: (id: string) => string; sec: (id: string) => string; secLabel: (sectionId: string) => string; subj: (id: string | null) => string };
export async function names(): Promise<Names> {
  const r = await refs();
  const cls = (id: string) => r.classes.find((c) => c.id === id)?.name ?? "";
  const sec = (id: string) => r.sections.find((s) => s.id === id)?.name ?? "";
  return {
    cls, sec,
    secLabel: (sid) => { const s = r.sections.find((x) => x.id === sid); return s ? `${cls(s.classId)}-${s.name}` : ""; },
    subj: (id) => (id ? r.subjects.find((s) => s.id === id)?.name ?? "" : ""),
  };
}

export type Assignment = { id: string; classId: string; sectionId: string; subjectId: string | null; isClassTeacher: boolean };
export const myAssignments = () => listAll<Assignment>("/teacher-assignments");

export type AttStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export type AttRecord = { studentId: string; fullName: string; rollNo: number; status: AttStatus | null; note: string | null };
export type AttSession = { id: string; sectionId: string; date: string; subjectId: string | null; records: AttRecord[]; version: number };
export type AttRow = { id: string; sectionId: string; date: string; absentCount: number; markedCount: number };

export async function openAttendance(sectionId: string, date: string): Promise<AttSession> {
  const existing = (await call<AttRow[]>("GET", "/attendance-sessions", { query: { sectionId, from: date, to: date, limit: 1 } })).data[0];
  if (existing) return (await call<AttSession>("GET", `/attendance-sessions/${existing.id}`)).data;
  return (await call<AttSession>("POST", "/attendance-sessions", { body: { sectionId, date } })).data;
}
export const saveAttendance = (id: string, records: { studentId: string; status: AttStatus }[], reason?: string) =>
  call("PUT", `/attendance-sessions/${id}/records`, { body: { records, ...(reason ? { reason } : {}) } });
export const attendanceSessions = () => listAll<AttRow>("/attendance-sessions", {}, 3);
export type MyAttendance = { records: { date: string; status: AttStatus; note?: string | null }[]; summary: { total: number; present: number; absent: number; late: number; excused: number; percentage: number } };
export async function myAttendance(): Promise<MyAttendance> {
  const me = (await call<{ id: string }>("GET", "/students/me")).data;
  return (await call<MyAttendance>("GET", `/students/${me.id}/attendance`)).data;
}

export type Homework = { id: string; teacherAssignmentId: string; classId: string; sectionId: string; subjectName: string | null; title: string; description: string; dueAt: string; status: "DRAFT" | "PUBLISHED" | "CLOSED"; mySubmission?: { id: string; submittedAt: string; late: boolean; grade: string | null; feedback: string | null } | null };
export const homeworkList = () => listAll<Homework>("/homework", {}, 3);
export const createHomework = (b: { teacherAssignmentId: string; title: string; description: string; dueAt: string }) => call<Homework>("POST", "/homework", { body: b });
export const publishHomework = (id: string) => call("POST", `/homework/${id}/publish`, { body: {} });
export type HwSub = { studentId: string; fullName: string; rollNo: number; submitted: boolean; submissionId: string | null; text: string | null; late: boolean | null; grade: string | null; feedback: string | null; version: number | null };
export const homeworkSubs = (id: string) => listAll<HwSub>(`/homework/${id}/submissions`, {}, 3);
export const gradeSubmission = (subId: string, b: { grade: string; feedback?: string; version?: number | null }) => call("PATCH", `/homework-submissions/${subId}`, { body: { grade: b.grade, feedback: b.feedback || undefined, version: b.version ?? undefined } });
export const submitHomework = (id: string, text: string) => call("POST", `/homework/${id}/submissions`, { body: { text } });

export type Conv = { id: string; type: "DIRECT" | "CLASS_GROUP" | "CHANNEL"; title: string | null; studentsCanPost: boolean; isReadOnlyForStudents?: boolean; peer: { userId: string; displayName: string; role: string } | null; lastMessage: { preview: string; createdAt: string } | null; unread: number };
export type Msg = { id: string; senderId: string; senderName?: string; senderRole?: string; body: string; createdAt: string; deletedAt?: string | null };
export const conversations = () => listAll<Conv>("/conversations", {}, 3);
export const messagesOf = async (id: string): Promise<Msg[]> => (await call<Msg[]>("GET", `/conversations/${id}/messages`, { query: { limit: 100 } })).data.slice().reverse();
export const sendMessage = (c: Conv, body: string) => (c.type === "CHANNEL" ? call("POST", `/channels/${c.id}/posts`, { body: { body } }) : call("POST", `/conversations/${c.id}/messages`, { body: { body } }));
export const markRead = (id: string) => call("POST", `/conversations/${id}/read`, { body: {} });
export type Recipient = { userId: string; displayName: string; role: string; detail: string | null };
export const recipients = async () => (await call<Recipient[]>("GET", "/messaging/recipients")).data;
export const startDirect = (recipientId: string) => call<{ id: string }>("POST", "/conversations", { body: { type: "DIRECT", recipientId } });
export const reportMessage = (id: string, reason: string) => call("POST", `/messages/${id}/report`, { body: { reason } });
