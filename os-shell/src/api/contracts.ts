import { z } from "zod";

export const RoleSchema = z.enum(["headmaster", "registrar", "teacher", "student", "petra"]);
export type Role = z.infer<typeof RoleSchema>;

export const SeasonSchema = z.enum(["admission", "exam", "result", "event"]);
export type Season = z.infer<typeof SeasonSchema>;

export const SchoolSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameBn: z.string(),
  city: z.string(),
  monogram: z.string(),
  primary: z.string(),
  joinCode: z.string(),
  status: z.enum(["active", "trial", "suspended"]),
  autoApprove: z.boolean(),
  seasonOverride: SeasonSchema.nullable(),
});
export type School = z.infer<typeof SchoolSchema>;

export const UserSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  role: RoleSchema,
  loginId: z.string(),
  password: z.string(),
  name: z.string(),
  refId: z.string().nullable(),
  status: z.enum(["active", "pending", "disabled"]),
  mustReset: z.boolean(),
  photo: z.string().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const SessionSchema = z.object({
  userId: z.string(),
  schoolId: z.string(),
  role: RoleSchema,
  name: z.string(),
  refId: z.string().nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

export const StudentSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  studentId: z.string(),
  roll: z.number(),
  name: z.string(),
  nameBn: z.string(),
  classNo: z.number(),
  section: z.string(),
  guardian: z.string(),
  guardianPhone: z.string(),
  admission: z.string(),
  status: z.enum(["active", "pending", "unclaimed"]),
  photo: z.string().optional(),
  bio: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  bloodGroup: z.string().optional(),
});
export type Student = z.infer<typeof StudentSchema>;

export const AssignmentSchema = z.object({ classNo: z.number(), section: z.string(), subject: z.string() });
export type Assignment = z.infer<typeof AssignmentSchema>;

export const TeacherSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  name: z.string(),
  nameBn: z.string(),
  phone: z.string(),
  email: z.string(),
  designation: z.string(),
  assignments: z.array(AssignmentSchema),
  status: z.enum(["active", "invited"]),
  photo: z.string().optional(),
  bio: z.string().optional(),
});
export type Teacher = z.infer<typeof TeacherSchema>;

export const InviteSchema = z.object({
  code: z.string(),
  schoolId: z.string(),
  teacherId: z.string(),
  status: z.enum(["pending", "used"]),
  createdAt: z.string(),
});
export type Invite = z.infer<typeof InviteSchema>;

export const SubjectDefSchema = z.object({
  schoolId: z.string(),
  classNo: z.number(),
  subject: z.string(),
  subjectBn: z.string(),
  full: z.number(),
  pass: z.number(),
  components: z.array(z.string()),
});
export type SubjectDef = z.infer<typeof SubjectDefSchema>;

export const ExamSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  name: z.string(),
  nameBn: z.string(),
  kind: z.enum(["term", "test"]),
  year: z.number(),
  /** Live API only: DRAFT | AUTHORIZED | IN_PROGRESS | CLOSED. */
  status: z.string().optional(),
});
export type Exam = z.infer<typeof ExamSchema>;

export const CellStateSchema = z.enum(["not_started", "draft", "submitted", "uploaded", "verified", "published"]);
export type CellState = z.infer<typeof CellStateSchema>;

export const MarkValueSchema = z.union([z.number(), z.literal("AB"), z.null()]);
export type MarkValue = z.infer<typeof MarkValueSchema>;

export const CellSchema = z.object({
  schoolId: z.string(),
  examId: z.string(),
  classNo: z.number(),
  section: z.string(),
  subject: z.string(),
  state: CellStateSchema,
  marks: z.record(z.string(), MarkValueSchema),
  submittedBy: z.string().nullable(),
  source: z.enum(["teacher", "excel", "none"]),
  updatedAt: z.string().nullable(),
  returnComment: z.string().nullable(),
  locked: z.boolean(),
});
export type Cell = z.infer<typeof CellSchema>;

export const PaperFileSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  examId: z.string(),
  classNo: z.number(),
  section: z.string(),
  subject: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  dataUrl: z.string(),
  uploadedBy: z.string(),
  at: z.string(),
});
export type PaperFile = z.infer<typeof PaperFileSchema>;

export const PublicationSchema = z.object({
  schoolId: z.string(),
  examId: z.string(),
  classNo: z.number(),
  section: z.string(),
  state: z.enum(["published", "scheduled"]),
  at: z.string(),
});
export type Publication = z.infer<typeof PublicationSchema>;

export const NoticeSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  title: z.string(),
  body: z.string(),
  audience: z.enum(["all", "class", "teachers"]),
  classNo: z.number().nullable(),
  pinned: z.boolean(),
  publishAt: z.string(),
  reads: z.number(),
  author: z.string(),
  /** User ids that opened this notice (mock: drives per-user unread state). */
  readBy: z.array(z.string()).optional(),
});
export type Notice = z.infer<typeof NoticeSchema>;

export const NotificationSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  userId: z.string().nullable(),
  role: RoleSchema.nullable(),
  text: z.string(),
  at: z.string(),
  read: z.boolean(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const ArticleSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  issueId: z.string().nullable(),
  title: z.string(),
  lang: z.enum(["en", "bn"]),
  author: z.string(),
  body: z.string(),
  status: z.enum(["pending", "published", "rejected"]),
});
export type Article = z.infer<typeof ArticleSchema>;

export const IssueSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  title: z.string(),
  titleBn: z.string(),
  hue: z.number(),
  status: z.enum(["draft", "published"]),
  publishedAt: z.string().nullable(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const AuditSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  actor: z.string(),
  role: RoleSchema,
  action: z.string(),
  entity: z.string(),
  summary: z.string(),
  at: z.string(),
});
export type AuditLog = z.infer<typeof AuditSchema>;

export const GradeBandSchema = z.object({ min: z.number(), grade: z.string(), point: z.number() });
export const GradingSchema = z.object({ scale: z.array(GradeBandSchema), passMark: z.number() });
export type Grading = z.infer<typeof GradingSchema>;

export const ErrorEventSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  group: z.string(),
  severity: z.enum(["info", "warn", "error", "critical"]),
  count: z.number(),
  lastSeen: z.string(),
});
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;

export const DayMetricSchema = z.object({
  day: z.string(),
  uptime: z.number(),
  errorRate: z.number(),
  latency: z.number(),
  dau: z.number(),
  published: z.number(),
  uploads: z.number(),
});
export type DayMetric = z.infer<typeof DayMetricSchema>;

export const RoutineSlotSchema = z.object({
  schoolId: z.string(),
  classNo: z.number(),
  section: z.string(),
  day: z.number().int().min(0).max(4),
  period: z.number().int().min(1).max(8),
  subject: z.string(),
  teacherId: z.string().nullable(),
});
export type RoutineSlot = z.infer<typeof RoutineSlotSchema>;

export const ExamSlotSchema = z.object({
  id: z.string(),
  schoolId: z.string(),
  examId: z.string(),
  classNo: z.number(),
  subject: z.string(),
  date: z.string(),
  start: z.string(),
  end: z.string(),
  room: z.string(),
});
export type ExamSlot = z.infer<typeof ExamSlotSchema>;

export type DB = {
  version: number;
  schools: School[];
  users: User[];
  students: Student[];
  teachers: Teacher[];
  invites: Invite[];
  subjects: SubjectDef[];
  exams: Exam[];
  cells: Cell[];
  publications: Publication[];
  notices: Notice[];
  notifications: Notification[];
  issues: Issue[];
  articles: Article[];
  audit: AuditLog[];
  grading: Record<string, Grading>;
  errors: ErrorEvent[];
  metrics: DayMetric[];
  rejections: { studentId: string; reason: string }[];
  routine: RoutineSlot[];
  examSlots: ExamSlot[];
};

export type StudentResultSubject = {
  subject: string;
  subjectBn: string;
  mark: MarkValue;
  full: number;
  grade: string;
  point: number;
  passed: boolean;
};
export type StudentResult = {
  examId: string;
  studentId: string;
  subjects: StudentResultSubject[];
  total: number;
  gpa: number;
  grade: string;
  passed: boolean;
  position: number;
  classSize: number;
};
export type ClassSummary = {
  students: number;
  passRate: number;
  avgGpa: number;
  failCount: number;
};
