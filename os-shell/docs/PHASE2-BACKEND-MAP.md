# Phase 2 backend map

Every table carries `school_id uuid not null`. Enable PostgreSQL row-level security on all school tables: `USING (school_id = current_setting('app.school_id')::uuid)`; the API sets `app.school_id` from the session per request. Petra uses a separate role with access only to `schools`, `platform_metrics`, `platform_errors` and aggregate counts.

Permission legend: **R** registrar, **T** teacher, **S** student, **P** petra.

## AuthRepo
| Method | Endpoint | Table / columns | Rule |
|---|---|---|---|
| login | `POST /auth/login` | `users(id, school_id, role, login_id, password_hash, status)` | public; rate-limited; sets HttpOnly session |
| logout | `POST /auth/logout` | sessions | any |
| session | `GET /auth/session` | sessions, users | any |
| verifyPassword | `POST /auth/verify-password` | users.password_hash | any (lock screen) |
| brand | `GET /public/brand` | `schools(name, name_bn, monogram, primary)` | public, brand fields only |
| previewInvite | `GET /invites/:code` | `invites(code, teacher_id, status)`, `teachers` | public, single-use code |
| signupTeacher | `POST /invites/:code/accept` | invites, users, teachers.status | public; code valid |
| signupStudent | `POST /auth/student-signup` | `students(student_id, guardian_phone)`, `schools.join_code`, users | public; join code + roster match + last 4 digits; status per `schools.auto_approve` |

## SchoolRepo
| Method | Endpoint | Table | Rule |
|---|---|---|---|
| current | `GET /school` | schools | R T S |
| update | `PATCH /school` | schools(name, name_bn, city, primary, auto_approve) | R |
| setSeason | `PUT /school/season` | schools.season_override | R, P |
| regenerateJoinCode | `POST /school/join-code` | schools.join_code | R |
| resetDemo | not exposed | — | demo only |

## StudentRepo / TeacherRepo
| Method | Endpoint | Table | Rule |
|---|---|---|---|
| student.list | `GET /students` | students | R T |
| student.me | `GET /students/me` | students | S |
| student.importRoster | `POST /students/import` | students | R |
| student.resetPassword | `POST /students/:id/reset-password` | users.password_hash, users.must_reset | R |
| teacher.list | `GET /teachers` | teachers | R T S (students: active only, no phone/email) |
| teacher.me | `GET /teachers/me` | teachers, teacher_assignments | T |
| teacher.invites | `GET /invites` | invites | R |
| teacher.createInvite | `POST /teachers` | teachers, invites | R |
| teacher.importTeachers | `POST /teachers/import` | teachers, invites | R |
| teacher.setAssignments | `PUT /teachers/:id/assignments` | `teacher_assignments(teacher_id, class_no, section, subject)` | R |
| teacher.resetPassword | `POST /teachers/:id/reset-password` | users | R |

## ClassRepo / ExamRepo
| Method | Endpoint | Table | Rule |
|---|---|---|---|
| subjects | `GET /subjects` | `subjects(class_no, subject, subject_bn, full, pass, components)` | R T S |
| updateSubject | `PATCH /subjects/:classNo/:subject` | subjects | R |
| exams | `GET /exams` | `exams(name, name_bn, kind, year)` | R T S |
| createExam | `POST /exams` | exams, marks_sheets | R |
| grading / setGrading | `GET/PUT /grading` | `grading(school_id, scale jsonb, pass_mark)` | R (write), all (read) |
| exam.matrix | `GET /exams/:id/matrix` | marks_sheets, publications | R |

## MarksRepo
Table `marks_sheets(exam_id, class_no, section, subject, state, source, submitted_by, updated_at, return_comment, locked)` and `marks(sheet_id, student_id, value numeric null, absent bool)`.

| Method | Endpoint | Rule |
|---|---|---|
| cell | `GET /marks/:examId/:class/:section/:subject` | R T (T only own assignment) |
| myCells | `GET /marks/mine?examId=` | T |
| saveDraft | `PUT /marks/.../draft` | T own assignment, sheet not locked |
| submit | `POST /marks/.../submit` | T own assignment; validates ≤ full marks; locks |
| verify | `POST /marks/.../verify` | R; state submitted or uploaded |
| returnCell | `POST /marks/.../return` | R; not published |
| importMarks | `POST /marks/.../import` | R; refuses published sheets; replaces unpublished marks only |

## ResultRepo
Table `publications(exam_id, class_no, section, state, at)`.

| Method | Endpoint | Rule |
|---|---|---|
| summary | `GET /results/:exam/:class/:section/summary` | R |
| publish | `POST /results/.../publish` | R; every sheet verified |
| schedule | `POST /results/.../schedule` | R; future time; a job flips state at `at` |
| unpublish | `POST /results/.../unpublish` | R; reason required; audit-logged |
| publishAllReady | `POST /results/:exam/publish-ready` | R |
| myExams / myResult / myHistory | `GET /me/exams`, `/me/results/:exam`, `/me/results` | S; own rows only; published only |

## MagazineRepo, NoticeRepo, ApprovalRepo, AuditRepo
| Method | Endpoint | Table | Rule |
|---|---|---|---|
| magazine.issues / articles | `GET /magazine/issues`, `/articles` | issues, articles | all (students/teachers: published only) |
| magazine.submit | `POST /magazine/articles` | articles(status pending) | T S |
| magazine.review | `POST /magazine/articles/:id/review` | articles | R |
| magazine.createIssue / publishIssue / saveArticle | `POST /magazine/issues`, `POST /magazine/issues/:id/publish`, `PATCH /magazine/articles/:id` | issues, articles | R |
| notice.list | `GET /notices` | `notices(audience, class_no, pinned, publish_at, reads)` | audience-filtered per role |
| notice.create / togglePin | `POST /notices`, `POST /notices/:id/pin` | notices | R |
| notice.markRead | `POST /notices/:id/read` | `notice_reads(notice_id, user_id)` | T S |
| notice.notifications / markAllRead | `GET /notifications`, `POST /notifications/read` | notifications | own |
| approval.pendingSignups / approve / reject | `GET /approvals/signups`, `POST /approvals/signups/:id/approve|reject` | students.status, users.status | R |
| audit.list | `GET /audit` | `audit_log(actor, role, action, entity, summary, at)` | R |

## PlatformRepo
| Method | Endpoint | Table | Rule |
|---|---|---|---|
| schools | `GET /platform/schools` | schools + counts | P |
| metrics | `GET /platform/metrics` | `platform_metrics(day, uptime, error_rate, latency, dau, published, uploads)` | P |
| errors | `GET /platform/errors` | `platform_errors(school_id, group, severity, count, last_seen)` | P |
| createSchool | `POST /platform/schools` | schools, users (registrar), invite | P |
| setStatus | `PATCH /platform/schools/:id/status` | schools.status | P |

## RoutineRepo (v1.1)
Tables: `routine_slots(school_id, class_no, section, day 0-4, period 1-8, subject, teacher_id)` with unique `(school_id, class_no, section, day, period)` and unique `(school_id, teacher_id, day, period)` (this enforces the teacher-clash rule in the database); `exam_slots(id, school_id, exam_id, class_no, subject, date, start, end, room)`.

| Method | Endpoint | Rule |
|---|---|---|
| list | `GET /routine` | R all; T own slots; S own class-section |
| setSlot / clearSlot | `PUT/DELETE /routine/:class/:section/:day/:period` | R; clash returns 409 |
| examSlots | `GET /exams/:id/routine` | all roles |
| saveExamSlot / removeExamSlot | `POST/PUT/DELETE /exams/:id/routine` | R; overlapping time for the same class returns 409 |

## ProfileRepo and question papers (v1.2)
| Method | Endpoint | Table | Rule |
|---|---|---|---|
| profile.me / updateMe | `GET/PATCH /me/profile` | students, teachers, users (`photo_url`, `bio`, `phone`, `address`, `blood_group`) | own record; teacher phone is the login id, not editable |
| profile.updatePerson | `PATCH /students/:id`, `PATCH /teachers/:id` | same | R |
| profile.changePassword | `POST /me/password` | users.password_hash | own |
| marks.paper / savePaper / removePaper | `GET/PUT/DELETE /marks/.../paper` | `question_papers(id, school_id, exam_id, class_no, section, subject, file_url, mime, size, uploaded_by, at)` | T own assignment, locked after verify; R read; files in object storage with signed URLs |
| auth.loginPetra | `POST /platform/auth/login` | platform_users | separate credential store and deployment; never accepts school users |
