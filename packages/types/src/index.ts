// Types mirror the API contract (docs/integration, contract C6/C7). Server JSON is camelCase.
export type Role = "HEADMASTER" | "REGISTRAR" | "TEACHER" | "STUDENT";
export type Uuid = string;
export type Iso = string;

export interface ApiEnvelope<T> { data: T; meta?: PageMeta }
export interface PageMeta { limit: number; nextCursor: string | null; hasMore: boolean }
export interface FieldError { field: string; code: string; message: string }
export interface ApiErrorBody { error: { code: string; message: string; requestId?: string; fieldErrors?: FieldError[]; details?: Record<string, unknown> } }

export interface User { id: Uuid; role: Role; username: string; email: string | null; displayName: string; status: "ACTIVE" | "SUSPENDED" | "PENDING" | "ARCHIVED"; mustChangePassword: boolean; lastLoginAt: Iso | null; version: number }
export interface LoginResult { accessToken: string; refreshToken?: string; expiresIn: number; user: User; permissions: string[]; mustChangePassword: boolean }

export type SubmissionStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "CORRECTION_REQUESTED" | "VERIFIED";
export type ResultStatus = "VERIFIED" | "APPROVED" | "PUBLISHED";
export type AnyResultStatus = SubmissionStatus | ResultStatus;
export type ExamStatus = "DRAFT" | "AUTHORIZED" | "IN_PROGRESS" | "CLOSED";

export interface Session { id: Uuid; name: string; startDate: string; endDate: string; isCurrent: boolean; version: number }
export interface SchoolClass { id: Uuid; name: string; level: number; order: number; version: number }
export interface Section { id: Uuid; classId: Uuid; name: string; capacity: number; studentCount: number; version: number }
export interface Subject { id: Uuid; code: string; name: string; nameBn: string | null; isOptional: boolean; fullMarksDefault: number; version: number }
export interface Student { id: Uuid; userId: Uuid; studentCode: string; fullName: string; fullNameBn?: string | null; dob?: string; gender?: string; address?: string; guardianName?: string; guardianPhone?: string; status: string; classId: Uuid | null; sectionId: Uuid | null; className: string | null; sectionName: string | null; currentRollNo: number | null; version: number }
export interface Teacher { id: Uuid; userId: Uuid; employeeCode: string; fullName: string; designation: string; phone: string; status: string; version: number }
export interface TeacherAssignment { id: Uuid; teacherId: Uuid; sessionId: Uuid; classId: Uuid; sectionId: Uuid; subjectId: Uuid | null; isClassTeacher: boolean }
export interface Exam { id: Uuid; sessionId: Uuid; name: string; type: string; startDate: string; endDate: string; status: ExamStatus; registrarMayPublish: boolean; version: number }
export interface ExamPaper { id: Uuid; examId: Uuid; classId: Uuid; subjectId: Uuid; fullMarks: number; passMarks: number; examDate: string | null }
export interface MarkSubmissionRow { id: Uuid; examId: Uuid; examName: string; className: string; sectionName: string; subjectName: string; subjectCode: string; teacherName: string; status: SubmissionStatus; currentRevision: number; fullMarks: number; passMarks: number; submittedAt: Iso | null; version: number }
export interface MarkEntry { studentId: Uuid; fullName: string; studentCode: string; rollNo: number; marksObtained: number | null; absent: boolean; remark: string | null; flagged: boolean; flagNote: string | null; entered: boolean }
export interface MarkSubmissionDetail extends MarkSubmissionRow { entries: MarkEntry[]; note: string | null; editable: boolean; examStatus: ExamStatus }
export interface ResultSetRow { id: Uuid; examId: Uuid; examName: string; classId: Uuid; className: string; status: ResultStatus; publishedRevision: number; currentRevision: number; publishedAt: Iso | null; version: number }
export interface SubjectResult { subjectId: string; marks: number; fullMarks: number; grade: string; gradePoint: number; absent: boolean; passed: boolean; subjectName?: string }
export interface StudentResultRow { studentId: Uuid; fullName: string; studentCode: string; sectionName: string; rollNo: number | null; revision: number; totalMarks: number; gpa: number | null; grade: string; passed: boolean; position: number | null; subjects: SubjectResult[] }
export interface ResultSetDetail extends ResultSetRow { results: StudentResultRow[]; summary: { students: number; failed: number; withAbsence: number; passRate: number }; revision: number }
export interface PublishedResult { resultSetId: Uuid; examName: string; examType: string; revision: number; totalMarks: number; gpa: number; grade: string; passed: boolean; position: number | null; publishedAt: Iso; subjects: SubjectResult[] }

export interface Conversation { id: Uuid; type: "DIRECT" | "CLASS_GROUP" | "CHANNEL"; title: string | null; channelKind: string | null; sectionId: Uuid | null; studentsCanPost: boolean; lastMessageAt: Iso | null; peer: { userId: Uuid; displayName: string; role: Role } | null; lastMessage: { id: Uuid; senderId: Uuid; preview: string; createdAt: Iso } | null; unread: number }
export interface Message { id: Uuid; conversationId: Uuid; senderId: Uuid; senderName?: string; senderRole?: Role; body: string; kind: string; attachmentFileIds: Uuid[]; moderationState?: string; createdAt: Iso; deletedAt?: Iso | null }
export interface NotificationItem { id: Uuid; type: string; title: string; body: string; data: { entityType?: string; entityId?: string; deepLink?: string }; readAt: Iso | null; createdAt: Iso }
export interface Notice { id: Uuid; title: string; body: string; audience: { roles: Role[]; classIds: Uuid[]; sectionIds: Uuid[] }; status: "DRAFT" | "PENDING_APPROVAL" | "PUBLISHED" | "ARCHIVED"; publishedAt: Iso | null; pinned: boolean; createdByName: string; version: number }
export interface Homework { id: Uuid; teacherAssignmentId: Uuid; classId: Uuid; sectionId: Uuid; subjectId: Uuid | null; subjectName: string | null; title: string; description: string; dueAt: Iso; status: "DRAFT" | "PUBLISHED" | "CLOSED"; mySubmission?: { id: Uuid; submittedAt: Iso; late: boolean; grade: string | null; feedback: string | null } | null }
export interface AttendanceSummary { total: number; present: number; absent: number; late: number; excused: number; percentage: number }
export interface AuditLog { id: Uuid; actorName: string | null; actorRole: string | null; action: string; entityType: string; entityId: string | null; createdAt: Iso; before?: unknown; after?: unknown }

export const SUBMISSION_STATUS_LABEL: Record<AnyResultStatus, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", CORRECTION_REQUESTED: "Correction requested", VERIFIED: "Verified", APPROVED: "Approved", PUBLISHED: "Published",
};
export const ROLE_LABEL: Record<Role, string> = { HEADMASTER: "Headmaster", REGISTRAR: "Register", TEACHER: "Teacher", STUDENT: "Student" };
