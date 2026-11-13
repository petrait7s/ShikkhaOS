// Live-API repositories (NEXT_PUBLIC_API_MODE=http).
// Wired so far: sign-in/out + session, school profile, students (list/me), teachers (list/me), exams (list).
// Everything else answers "not connected yet" until it is mapped (see docs/PHASE2-BACKEND-MAP.md).
import type { Exam, School, Session, Student, Teacher } from "../contracts";
import type { Repos } from "../repositories";
import { ApiError } from "../mock/db";
import { API_BASE, call, deviceId, listAll, setTokens, storeSession, storedSession } from "./client";

type ApiUser = { id: string; role: string; displayName: string; mustChangePassword: boolean };
type ApiStudent = { id: string; studentCode: string; fullName: string; fullNameBn?: string | null; guardianName?: string; guardianPhone?: string; address?: string; status: string; className: string | null; sectionName: string | null; currentRollNo: number | null; createdAt?: string };
type ApiTeacher = { id: string; fullName: string; designation: string; phone: string; status: string };
type ApiExam = { id: string; name: string; type: string; startDate: string };

const ROLE: Record<string, Session["role"]> = { HEADMASTER: "headmaster", REGISTRAR: "registrar", TEACHER: "teacher", STUDENT: "student" };
const classNo = (n: string | null) => Number((n ?? "").replace(/\D/g, "")) || 0;
const SCHOOL = "school";

const toStudent = (s: ApiStudent): Student => ({
  id: s.id, schoolId: SCHOOL, studentId: s.studentCode, roll: s.currentRollNo ?? 0, name: s.fullName, nameBn: s.fullNameBn ?? s.fullName,
  classNo: classNo(s.className), section: s.sectionName ?? "", guardian: s.guardianName ?? "", guardianPhone: s.guardianPhone ?? "",
  admission: s.createdAt?.slice(0, 10) ?? "", status: s.status === "ACTIVE" ? "active" : s.status === "PENDING" ? "pending" : "unclaimed", address: s.address,
});
const toTeacher = (t: ApiTeacher): Teacher => ({
  id: t.id, schoolId: SCHOOL, name: t.fullName, nameBn: t.fullName, phone: t.phone, email: "", designation: t.designation, assignments: [], status: t.status === "ACTIVE" ? "active" : "invited",
});
const toExam = (e: ApiExam): Exam => ({
  id: e.id, schoolId: SCHOOL, name: e.name, nameBn: e.name, kind: /test/i.test(e.type) ? "test" : "term", year: Number(e.startDate?.slice(0, 4)) || new Date().getFullYear(),
});

async function currentSession(user: ApiUser): Promise<Session> {
  const role = ROLE[user.role] ?? "student";
  let refId: string | null = null;
  try {
    if (role === "student") refId = (await call<{ id: string }>("GET", "/students/me")).data.id;
    if (role === "teacher") refId = (await call<{ id: string }>("GET", "/teachers/me")).data.id;
  } catch { /* profile row missing: leave null */ }
  return { userId: user.id, schoolId: SCHOOL, role, name: user.displayName, refId };
}

const notWired = (label: string) => () => Promise.reject(new ApiError(`${label} is not connected to the live API yet.`, "not_connected"));
/** Implemented methods pass through; anything else rejects with "not connected yet". */
const wire = <T extends object>(label: string, impl: Partial<T> = {}): T =>
  new Proxy(impl, { get: (t, p) => (p in t ? (t as Record<string | symbol, unknown>)[p] : p === "then" ? undefined : notWired(`${label}.${String(p)}`)) }) as T;
const stub = <T extends object>(label: string): T => wire<T>(label);

export const httpRepos: Repos = {
  auth: {
    async login(id, password) {
      const r = await call<{ accessToken: string; refreshToken?: string; user: ApiUser }>("POST", "/auth/login", {
        auth: false, body: { identifier: id.trim(), password, deviceId: deviceId(), platform: "desktop" },
      });
      setTokens(r.data.accessToken, r.data.refreshToken ?? null);
      const s = await currentSession(r.data.user);
      storeSession(s);
      return s;
    },
    loginPetra: notWired("auth.loginPetra"),
    async logout() { try { await call("POST", "/auth/logout"); } catch { /* already invalid */ } setTokens(null, null); storeSession(null); },
    session: () => storedSession<Session>(),
    async verifyPassword(password) { try { await call("POST", "/auth/reauth", { body: { password } }); return true; } catch { return false; } },
    async brand() {
      return { id: SCHOOL, name: process.env.NEXT_PUBLIC_SCHOOL_NAME ?? "ShikkhaOS", nameBn: process.env.NEXT_PUBLIC_SCHOOL_NAME_BN ?? "শিক্ষাOS", city: "", monogram: "SO", primary: "#0F172A" };
    },
    previewInvite: notWired("auth.previewInvite"),
    signupTeacher: notWired("auth.signupTeacher"),
    signupStudent: notWired("auth.signupStudent"),
  },
  school: wire<Repos["school"]>("school", {
    async current(): Promise<School> {
      const s = (await call<{ name: string; nameBn?: string | null; address?: string | null }>("GET", "/school")).data;
      return { id: SCHOOL, name: s.name, nameBn: s.nameBn ?? s.name, city: s.address ?? "", monogram: s.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase(), primary: "#0F172A", joinCode: "", status: "active", autoApprove: false, seasonOverride: null };
    },
  }),
  student: wire<Repos["student"]>("student", {
    list: async () => (await listAll<ApiStudent>("/students")).map(toStudent),
    me: async () => toStudent((await call<ApiStudent>("GET", "/students/me")).data),
  }),
  teacher: wire<Repos["teacher"]>("teacher", {
    list: async () => (await listAll<ApiTeacher>("/teachers")).map(toTeacher),
    me: async () => toTeacher((await call<ApiTeacher>("GET", "/teachers/me")).data),
    invites: async () => [],
  }),
  klass: wire<Repos["klass"]>("klass", {
    exams: async () => (await listAll<ApiExam>("/exams")).map(toExam),
    subjects: async () => [],
  }),
  exam: stub("exam"), marks: stub("marks"), result: stub("result"), magazine: stub("magazine"), notice: stub("notice"),
  approval: stub("approval"), audit: stub("audit"), platform: stub("platform"), routine: stub("routine"), profile: stub("profile"),
};

export { API_BASE };
