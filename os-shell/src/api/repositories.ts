import type {
  Article, AuditLog, Assignment, Cell, DayMetric, ErrorEvent, Exam, Grading, Invite, Issue, MarkValue, Notice,
  Notification, PaperFile, Publication, Role, RoutineSlot, ExamSlot, School, Season, Session, Student, StudentResult, SubjectDef, Teacher, ClassSummary,
} from "./contracts";

export type SchoolBrand = { id: string; name: string; nameBn: string; city: string; monogram: string; primary: string };

export interface AuthRepo {
  login(id: string, password: string): Promise<Session>;
  loginPetra(id: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  session(): Session | null;
  verifyPassword(password: string): Promise<boolean>;
  brand(): Promise<SchoolBrand>;
  previewInvite(code: string): Promise<{ teacher: Teacher; school: SchoolBrand }>;
  signupTeacher(code: string, password: string): Promise<void>;
  signupStudent(input: { studentId: string; joinCode: string; guardianLast4: string; password: string }): Promise<{ status: "active" | "pending" }>;
}

export interface SchoolRepo {
  current(): Promise<School>;
  update(patch: Partial<Pick<School, "name" | "nameBn" | "city" | "primary" | "autoApprove">>): Promise<School>;
  setSeason(season: Season | null): Promise<School>;
  regenerateJoinCode(): Promise<string>;
  resetDemo(): Promise<void>;
}

export type RosterRow = { studentId: string; roll: number; name: string; classNo: number; section: string; guardian: string; guardianPhone: string };
export type TeacherRow = { name: string; phone: string; email: string; designation: string };

export interface StudentRepo {
  list(): Promise<Student[]>;
  me(): Promise<Student>;
  importRoster(rows: RosterRow[]): Promise<{ added: number; updated: number }>;
  resetPassword(id: string): Promise<string>;
}

export interface TeacherRepo {
  list(): Promise<Teacher[]>;
  me(): Promise<Teacher>;
  invites(): Promise<Invite[]>;
  createInvite(input: TeacherRow): Promise<Invite>;
  importTeachers(rows: TeacherRow[]): Promise<{ added: number }>;
  setAssignments(id: string, assignments: Assignment[]): Promise<Teacher>;
  resetPassword(id: string): Promise<string>;
}

export interface ClassRepo {
  subjects(): Promise<SubjectDef[]>;
  updateSubject(classNo: number, subject: string, patch: Pick<SubjectDef, "full" | "pass">): Promise<void>;
  exams(): Promise<Exam[]>;
  createExam(name: string, nameBn: string): Promise<Exam>;
  grading(): Promise<Grading>;
  setGrading(g: Grading): Promise<void>;
}

export interface RoutineRepo {
  list(): Promise<RoutineSlot[]>;
  setSlot(slot: Omit<RoutineSlot, "schoolId">): Promise<void>;
  clearSlot(classNo: number, section: string, day: number, period: number): Promise<void>;
  examSlots(examId: string): Promise<ExamSlot[]>;
  saveExamSlot(slot: Omit<ExamSlot, "id" | "schoolId"> & { id?: string }): Promise<void>;
  removeExamSlot(id: string): Promise<void>;
}

export type CellKey = { examId: string; classNo: number; section: string; subject: string };

export interface ExamRepo {
  matrix(examId: string): Promise<{ cells: Cell[]; publications: Publication[] }>;
}

export interface MarksRepo {
  cell(k: CellKey): Promise<Cell>;
  myCells(examId: string): Promise<Cell[]>;
  saveDraft(k: CellKey, marks: Record<string, MarkValue>): Promise<Cell>;
  submit(k: CellKey, marks: Record<string, MarkValue>): Promise<Cell>;
  verify(k: CellKey): Promise<Cell>;
  returnCell(k: CellKey, comment: string): Promise<Cell>;
  importMarks(k: CellKey, values: Record<string, MarkValue>): Promise<Cell>;
  paper(k: CellKey): Promise<PaperFile | null>;
  paperKeys(examId: string): Promise<string[]>;
  savePaper(k: CellKey, file: { name: string; mime: string; size: number; dataUrl: string }): Promise<PaperFile>;
  removePaper(k: CellKey): Promise<void>;
}

export type ProfilePatch = { nameBn?: string; email?: string; phone?: string; address?: string; bloodGroup?: string; bio?: string; photo?: string | null };
export type PersonPatch = ProfilePatch & { name?: string; guardian?: string; guardianPhone?: string; designation?: string };
export type MyProfile = { role: Role; name: string; nameBn: string; photo: string | null; bio: string; email: string; phone: string; address: string; bloodGroup: string };

export interface ProfileRepo {
  me(): Promise<MyProfile>;
  updateMe(patch: ProfilePatch): Promise<MyProfile>;
  updatePerson(kind: "student" | "teacher", id: string, patch: PersonPatch): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

export interface ResultRepo {
  summary(examId: string, classNo: number, section: string): Promise<ClassSummary>;
  publish(examId: string, classNo: number, section: string): Promise<void>;
  schedule(examId: string, classNo: number, section: string, atIso: string): Promise<void>;
  unpublish(examId: string, classNo: number, section: string, reason: string): Promise<void>;
  publishAllReady(examId: string): Promise<number>;
  myExams(): Promise<{ exam: Exam; state: "published" | "scheduled" | "none"; at: string | null }[]>;
  myResult(examId: string): Promise<StudentResult>;
  myHistory(): Promise<{ exam: Exam; result: StudentResult }[]>;
}

export interface MagazineRepo {
  issues(): Promise<Issue[]>;
  articles(): Promise<Article[]>;
  submit(input: { title: string; lang: "en" | "bn"; body: string }): Promise<Article>;
  review(id: string, decision: "approve" | "reject", issueId: string | null): Promise<void>;
  createIssue(title: string, titleBn: string): Promise<Issue>;
  publishIssue(id: string): Promise<void>;
  saveArticle(id: string, patch: Pick<Article, "title" | "body">): Promise<void>;
}

export interface NoticeRepo {
  list(): Promise<Notice[]>;
  create(input: Pick<Notice, "title" | "body" | "audience" | "classNo" | "pinned"> & { publishAt: string }): Promise<Notice>;
  togglePin(id: string): Promise<void>;
  markRead(id: string): Promise<void>;
  notifications(): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllRead(): Promise<void>;
}

export interface ApprovalRepo {
  pendingSignups(): Promise<Student[]>;
  approve(studentId: string): Promise<void>;
  reject(studentId: string, reason: string): Promise<void>;
}

export interface AuditRepo {
  list(): Promise<AuditLog[]>;
}

export type SchoolStat = { school: School; students: number; teachers: number; lastActive: string };

export interface PlatformRepo {
  schools(): Promise<SchoolStat[]>;
  metrics(): Promise<DayMetric[]>;
  errors(): Promise<ErrorEvent[]>;
  createSchool(input: { name: string; city: string; primary: string; registrarEmail: string }): Promise<{ school: School; inviteLink: string }>;
  setStatus(id: string, status: School["status"]): Promise<void>;
}

export type Repos = {
  auth: AuthRepo; school: SchoolRepo; student: StudentRepo; teacher: TeacherRepo; klass: ClassRepo; exam: ExamRepo;
  marks: MarksRepo; result: ResultRepo; magazine: MagazineRepo; notice: NoticeRepo; approval: ApprovalRepo;
  audit: AuditRepo; platform: PlatformRepo; routine: RoutineRepo; profile: ProfileRepo;
};

export type { Role };
