# SHIKKHAOS — FRONTEND DEVELOPMENT MASTER PROMPT (Phase 1 — for Claude)

You are a Senior Frontend Architect, UI/UX engineer and React/TypeScript lead. You will build the **entire ShikkhaOS frontend** — Windows desktop app, Android student app, and web app — running on a **mock backend**. You do NOT build the real backend. A different agent (GPT Astra) will build the backend later in **Rust**; your work must plug into it with no UI rewrite.

## 0. NON-NEGOTIABLE RULES
1. Frontend only. Do not write server business logic, a Rust backend, Prisma schemas, or a database. The mock layer lives in the client workspace and is clearly isolated (`packages/api-client/src/mock/`).
2. No fake functionality. Every button, menu item, toggle and shortcut must do something real against the mock layer, or be hidden/disabled with a visible reason ("Requires permission X", "Coming in a later release"). No decorative controls. No lorem ipsum, no "TODO" screens shipped as finished.
3. No fabricated results. Never claim a build, test, lint or screenshot passed unless you ran it and saw it pass. Paste real command output summaries in your final report. If something fails or is not done, say so plainly.
4. Do not invent business rules. Follow the **Shared Integration Contract** (section 4) exactly. If something is ambiguous, pick the safest reading, record it in `docs/integration/ASSUMPTIONS.md`, and continue.
5. Do not delete or replace existing working code without written justification in `docs/integration/ASSUMPTIONS.md` or the commit message. Do not assume the repo is empty (see section 1).
6. Preserve product constraints: single school; three user categories (Administration = Headmaster + Register, Teachers, Students); NO parent accounts; NO student-to-student private messaging (not even hidden behind a UI toggle); class test marks are separate from official results; Headmaster and Register have different permissions.
7. The frontend never trusts itself for security: permission checks in the UI only hide/disable; mock services must also enforce permissions and data scope so the UI is tested against realistic 401/403/404/409/422 responses.
8. Work in small verifiable increments. Commit often with clear messages on the designated branch. Do not open a pull request unless asked.

## 1. REPOSITORY AUDIT (do this FIRST, before writing code)
At planning time the repository (`petrait7s/ShikkhaOS`) was inspected and found **empty (no commits, no remote branches)**. It may not be empty when you start. Therefore:
1. Run: `git log --oneline`, `git status`, `ls -la`, list `apps/`, `packages/`, `docs/`, read every `package.json`, lockfile, tsconfig, lint config, CI file, README.
2. Write `docs/frontend/REPO_AUDIT.md` listing: existing apps, package structure, frameworks and versions, UI components, design tokens, routes, build scripts, working features, broken/incomplete features, and what you will keep, extend, or replace (with justification).
3. If the repo is still empty, state that and scaffold the monorepo from section 3. If code exists, build on it; do not clobber it. Do not assume any proposed technology is already present — verify.
4. Verify tool versions available (Node, pnpm, Java/Android SDK presence). Record what the environment cannot do (for example, building a Windows installer or APK on Linux) in the audit and in the build docs; never pretend those steps were verified.

## 2. PRODUCT CONTEXT
**ShikkhaOS — "One School. One System. One Connected Community."** A private, single-school operating environment combining administration, academics, examinations and results, and internal communication. It is a premium, macOS-inspired experience that stays a practical professional application. It is NOT a real operating system and NOT a generic admin template.

Users:
- **Administration**: Headmaster (highest authority: school-wide dashboard, permissions, exam authorization, final result approval, result publishing, official announcements, audit/reports) and Register/Registrar (admission, student & academic records, class/section assignment, exam setup, receives teacher marks, verifies, requests corrections, prepares results, publishes only when delegated, certificates and records).
- **Teachers**: dashboard, assigned classes/subjects, student directory, attendance, exam marks entry, class tests, submit marks to Register, handle correction requests, class group chat, direct communication with authorized users, homework, notices, academic history. Only their own authorized records.
- **Students** (primarily Android): dashboard, profile, published results, subject marks, class test marks, attendance, class group, teacher messaging, homework/assignments, notices, notifications, academic history, downloadable report cards. Never any other student's data.

Platforms: Windows desktop EXE (flagship; Headmaster, Register, Teachers), Android APK (Students), Web (all three categories, same backend rules).

## 3. FRONTEND ARCHITECTURE
### 3.1 Monorepo (pnpm workspaces + Turborepo or Nx; pick one, justify in docs)
```
apps/desktop   Electron (main + preload + renderer) with React + TypeScript + Vite
apps/web       Next.js (App Router) + TypeScript
apps/mobile    Expo (React Native) + TypeScript, Expo Router, Android target
packages/ui           design tokens + shared component logic. Web/desktop components (React DOM); mobile has its own RN components that consume the same tokens
packages/types        TS types for every contract entity/enum (mirror of contract C6/C7; generated from or checked against docs/api/openapi.yaml)
packages/validation   Zod schemas implementing contract C15
packages/api-client   typed API client + mock adapter + live adapter + WebSocket client
packages/permissions  permission codes (C4), role defaults, `can()` helpers (UI gating only)
packages/config       shared eslint/tsconfig/prettier, env schema
docs/                 see 12
apps/api, database/, infrastructure/ are reserved for the backend agent. Do not create or modify Rust code. You may add a placeholder README in apps/api stating it is reserved.
```
Do not create `schoolId`/multi-tenant constructs.

### 3.2 State management and data layer
- Server state: TanStack Query (cache keys per resource, optimistic updates only where safe, invalidation after transitions). Client/UI state: Zustand (or equivalent small store). Forms: React Hook Form + Zod from `packages/validation`. No global god-store.
- `packages/api-client` exposes ONE typed interface (e.g. `ShikkhaApi`) with domain namespaces (`auth`, `students`, `exams`, `markSubmissions`, `resultSets`, `messaging`, …) matching contract C9 endpoints one-to-one. Two adapters: `mockAdapter` and `httpAdapter`, selected by `API_MODE=mock|live` (default `mock`) and `API_BASE_URL`. UI code never imports the mock directly.
- The HTTP adapter must be implemented now (against C9/C10): bearer auth, single-flight refresh on `TOKEN_EXPIRED`, error-envelope parsing into a typed `ApiError` (`code`, `status`, `fieldErrors`, `requestId`), cursor pagination helper, `Idempotency-Key` and `If-Match` support, abort/timeout, request-id propagation. Unit-test it against a local fake HTTP server (e.g. MSW) — not against a real backend.
- The WebSocket client implements C11 (ticket, envelope, heartbeat, reconnect with backoff + jitter, REST re-sync after reconnect, polling fallback). The mock layer provides an in-memory event bus that emits the same events so realtime UI is genuinely exercised.
- Token handling per C10: web = access token in memory, refresh via HttpOnly cookie semantics (mock simulates); desktop = Electron `safeStorage` via preload IPC; mobile = `expo-secure-store`. No tokens in localStorage.

### 3.3 Mock backend (required, high fidelity)
Implement inside `packages/api-client/src/mock/` (in-memory store seeded from fixtures, persisted per platform to IndexedDB / AsyncStorage / electron-store so a refresh keeps state; a "Reset demo data" action in Settings → Developer, visible only when `API_MODE=mock`).
It MUST faithfully simulate:
- Login with the demo accounts in C17, wrong password, lockout after 5 failures, forced password change, token expiry and refresh, session revoke.
- RBAC: every mock endpoint checks permission codes (C4) and data scope (C5) and returns real contract errors (401/403/404/409/422/429). Add a "latency & failure injection" dev panel (delay slider, force error %, go offline) to test loading/error/offline states.
- Cursor pagination, filtering, sorting, search exactly like C9.
- The full exam workflow with all 7 statuses and the transition table in C7, including: correction requests with reasons, resubmission creating a new revision, separation of duties, Headmaster approval, delegated publishing rule (`registrarCanPublishResults` + `exam.registrarMayPublish`), publishing notifications to students, post-publication revision requests that create `revision+1` while keeping history, audit entries for every transition.
- Class tests fully separate from official results (C8), shared into the class group conversation.
- Attendance, homework (create → student submit → teacher grade), notices (audience targeting, approval flow), messaging policy matrix (C13) including rejected student↔student DMs, message reports and moderation, class groups derived from enrollment/assignment, channels, notifications and unread counts, file upload contract (C14, simulated presign + progress + complete + reject for bad type/size), report card "generation" producing a real PDF in the browser/RN (use a client-side PDF library; clearly labelled as mock-generated), audit log, reports with computed aggregates, global search.
- Realistic seed data: one school (Bangladesh context: Bengali + English names, `Asia/Dhaka`), ≥ 1 current session + 1 past session, classes 6–10 with sections, ≥ 12 subjects, ≥ 15 teachers, ≥ 200 students, enrollments, teacher assignments, several exams in different lifecycle states (so every status is demoable on first launch), published results with history, attendance for 60+ school days, class tests, homework in all states, notices, conversations/messages, notifications, one reported message, audit entries. Deterministic seeding (seeded RNG) so tests are reproducible. Document in `docs/integration/MOCK_FIXTURES.md` (demo identities, ids, scenarios) because the backend seeds must match.
- Mock services must never be bundled into a production build when `API_MODE=live` (tree-shake/guard and test it).

## 4. SHARED INTEGRATION CONTRACT
## SHARED INTEGRATION CONTRACT v1.0.0 (IDENTICAL IN BOTH PROMPTS — AUTHORITATIVE)

Both agents MUST treat this section as law. Neither agent may change it unilaterally. Any needed change is recorded in `docs/integration/CONTRACT_CHANGELOG.md` (version bump, reason, affected endpoints/types, migration note) and every deviation or guess is recorded in `docs/integration/ASSUMPTIONS.md`. Additive, backward-compatible extensions are allowed if logged. Breaking changes require a major-version bump and an explicit note for the other agent.

### C1. Fixed technology decisions
- Backend: **Rust only** (stable), Tokio, Axum, PostgreSQL, SQLx, Serde, JWT + rotating refresh tokens, native WebSocket, OpenAPI 3.1, Redis-backed jobs (library chosen by backend agent after ecosystem evaluation). Modular monolith, not microservices. No Node.js/NestJS/TypeScript/Go/Python in the core backend.
- Frontends: Desktop = Electron + React + TypeScript (Windows EXE). Web = Next.js + TypeScript. Android = React Native + Expo + TypeScript (APK). Shared TS packages under `packages/`.
- NOTE: Socket.IO is NOT used. Realtime is plain WebSocket with the JSON envelope in C9.
- Single school (single tenant). No `tenantId`/`schoolId` multi-tenancy columns. A single `SchoolProfile` row exists.
- No parent/guardian accounts in v1. Student-to-student private messaging is disabled in v1 (server enforced, config flag defaults to `false`, no UI to enable it).

### C2. Repository layout (monorepo; see agent prompt for who owns what)
```
shikkhaos/
  apps/
    desktop/      Electron + React            (frontend agent)
    web/          Next.js                     (frontend agent)
    mobile/       Expo React Native           (frontend agent)
    api/          Rust Cargo workspace        (backend agent)
  packages/
    ui/ types/ validation/ api-client/ permissions/ config/    (TS, frontend agent; mirror the contract)
  database/       SQL migrations, seed data   (backend agent)
  infrastructure/ Docker, compose, CI, deploy (backend agent; frontend adds its own CI jobs)
  docs/
    api/openapi.yaml            (frontend drafts v1 from this contract; backend finalizes and owns it afterwards)
    integration/ASSUMPTIONS.md, CONTRACT_CHANGELOG.md, MOCK_TO_REAL_MIGRATION.md
```

### C3. Roles (exact enum values, used everywhere)
`HEADMASTER`, `REGISTRAR`, `TEACHER`, `STUDENT`. UI label for REGISTRAR is "Register" (the school's term); code, API and DB always use `REGISTRAR`.
Role = coarse group. Effective access = role default permissions + per-user grants/revocations (Headmaster-configurable) + data-scope checks (C5). Clients may use permissions only to hide/disable UI; the server is the sole authority.

### C4. Permission codes (exact strings, `domain.resource.action`)
```
school.settings.read | school.settings.update
users.read | users.create | users.update | users.deactivate | users.reset_password
roles.read | roles.manage                       (headmaster only: grant/revoke per-user permissions)
students.read | students.create | students.update | students.archive
students.read_own                                 (student: own profile)
teachers.read | teachers.create | teachers.update | teachers.deactivate
academic.sessions.manage | academic.classes.manage | academic.sections.manage
academic.subjects.manage | academic.assignments.manage | academic.enrollments.manage
exams.read | exams.create | exams.update | exams.authorize          (authorize = Headmaster)
marks.enter | marks.submit | marks.review | marks.request_correction | marks.verify
results.approve | results.publish | results.revise_published | results.read_published
results.read_own
reportcards.generate | reportcards.read_own
attendance.mark | attendance.read | attendance.read_own | attendance.correct
classtests.manage | classtests.share
messages.send_direct | messages.send_group | messages.read
channels.post_official | channels.manage
notices.read | notices.create | notices.publish
homework.manage | homework.read | homework.submit
documents.read | documents.manage | certificates.issue
reports.read | audit.read | audit.export
moderation.review | moderation.report
settings.system.manage
```
Default role grants (server seeds; clients mirror in `packages/permissions` for UI gating only):
- **HEADMASTER**: everything, including `exams.authorize`, `results.approve`, `results.revise_published`, `roles.*`, `audit.*`, `settings.system.manage`, `moderation.review`, `channels.post_official`, `notices.publish`.
- **REGISTRAR**: students/teachers CRUD, academic.* management, `exams.read|create|update` (not `exams.authorize` unless delegated), `marks.review|request_correction|verify`, `results.read_published`, `results.publish` ONLY when delegated (delegation is a Headmaster-controlled setting `delegation.registrar_can_publish` + per-exam flag; see C7), `reportcards.generate`, `documents.*`, `certificates.issue`, `notices.create`, `reports.read`, `messages.*`, `attendance.read|correct`. Registrar NEVER has `results.approve`, `roles.manage`, `audit.export`, `settings.system.manage` unless the Headmaster explicitly grants it per-user.
- **TEACHER**: `students.read` (scoped), `marks.enter|submit` (scoped to assigned class+section+subject), `attendance.mark|read` (scoped), `classtests.manage|share` (scoped), `homework.manage` (scoped), `messages.*` (policy-limited), `notices.read|create` (create goes to approval or class-scope only, per policy), `moderation.report`, `results.read_published` (own subjects/classes only).
- **STUDENT**: `students.read_own`, `results.read_own`, `reportcards.read_own`, `attendance.read_own`, `homework.read|submit`, `notices.read`, `messages.send_direct` (only to permitted recipients, C10), `messages.read` (own conversations), `moderation.report`.

### C5. Data scope rules (server-enforced; frontend mocks must simulate them)
- Teacher sees/edits only (class, section, subject) combinations in their active `TeacherAssignment`s for the current or selected `AcademicSession`. Class teacher assignment grants attendance + student-directory access for that section.
- Student sees only their own profile, marks, attendance, report cards, and homework for their current enrollment, plus their class group and authorized conversations. Any other student id → `404 NOT_FOUND` (never `403`, to avoid existence leaks).
- Registrar/Headmaster are school-wide.
- Students never see Draft/Submitted/UnderReview/CorrectionRequested/Verified/Approved results. Only `PUBLISHED`, and only the latest published revision.

### C6. Entity names and core fields (JSON = camelCase, DB = snake_case; ids = UUID strings; times = RFC 3339 UTC; dates = `YYYY-MM-DD`)
Every entity: `id`, `createdAt`, `updatedAt`, `version` (integer, optimistic concurrency). Soft-delete via `archivedAt` where noted.
- `User` { id, role, email?, username, displayName, status(`ACTIVE|SUSPENDED|PENDING|ARCHIVED`), mustChangePassword, lastLoginAt, avatarFileId? }
- `PermissionGrant` { userId, permission, effect(`GRANT|REVOKE`), grantedBy, reason }
- `SchoolProfile` { name, nameBn?, eiin?, address, phone, email, logoFileId?, motto, timezone(`Asia/Dhaka`), gradingScheme, academicYearStartMonth, features{ studentDirectMessaging:false, registrarCanPublishResults:false } }
- `AcademicSession` { id, name(`2026`), startDate, endDate, isCurrent }
- `Class` { id, name(`Class 6`), level(int), order } ; `Section` { id, classId, name(`A`), capacity }
- `Subject` { id, code, name, nameBn?, isOptional, fullMarksDefault }
- `ClassSubject` { id, classId, subjectId, sessionId, fullMarks, passMarks }
- `Student` { id, userId, studentCode, rollNo?, fullName, fullNameBn?, dob, gender, bloodGroup?, address, guardianName, guardianPhone, admissionDate, status(`ACTIVE|TRANSFERRED|GRADUATED|ARCHIVED`), photoFileId? } — guardian fields are plain data only, no guardian account.
- `Enrollment` { id, studentId, sessionId, classId, sectionId, rollNo, status(`ACTIVE|PROMOTED|WITHDRAWN`) }
- `Teacher` { id, userId, employeeCode, fullName, designation, phone, joinDate, status(`ACTIVE|ON_LEAVE|INACTIVE`) }
- `TeacherAssignment` { id, teacherId, sessionId, classId, sectionId, subjectId?, isClassTeacher }
- `Exam` { id, sessionId, name, type(`TERM|MID_TERM|FINAL|MODEL|OTHER`), startDate, endDate, status(`DRAFT|AUTHORIZED|IN_PROGRESS|CLOSED`), authorizedBy?, authorizedAt?, registrarMayPublish(boolean) }
- `ExamPaper` { id, examId, classId, subjectId, fullMarks, passMarks, examDate? }
- `MarkSubmission` { id, examPaperId, sectionId, teacherId, status(R1), currentRevision(int), submittedAt?, reviewedBy?, verifiedAt?, note? } — one per (examPaper, section).
- `MarkEntry` { id, submissionId, studentId, marksObtained(decimal|null), absent(boolean), remark? } — belongs to a revision snapshot.
- `ResultSet` { id, examId, classId, sectionId?, status(`VERIFIED|APPROVED|PUBLISHED`), publishedRevision(int), approvedBy?, approvedAt?, publishedBy?, publishedAt? }
- `StudentResult` { id, resultSetId, studentId, revision, totalMarks, gpa?, grade, position?, subjects:[{ subjectId, marks, fullMarks, grade, gradePoint, absent }] }
- `ResultRevisionRequest` { id, resultSetId, requestedBy, reason, proposedChanges, status(`PENDING|APPROVED|REJECTED|APPLIED`), decidedBy?, decidedAt? }
- `ClassTest` { id, teacherAssignmentId, title, date, fullMarks, status(`DRAFT|SHARED`), sharedAt? }; `ClassTestMark` { classTestId, studentId, marks|null, absent }
- `AttendanceSession` { id, sectionId, date, takenBy, subjectId? } ; `AttendanceRecord` { sessionId, studentId, status(`PRESENT|ABSENT|LATE|EXCUSED`), note? }
- `Conversation` { id, type(`DIRECT|CLASS_GROUP|CHANNEL`), title?, classId?, sectionId?, subjectId?, channelKind?(`ANNOUNCEMENTS|STAFF|ADMIN_DESK`), isReadOnlyForStudents, lastMessageAt }
- `ConversationMember` { conversationId, userId, role(`OWNER|MEMBER`), mutedUntil?, lastReadMessageId? }
- `Message` { id, conversationId, senderId, body, attachmentFileIds[], replyToId?, createdAt, editedAt?, deletedAt?, moderationState(`OK|REPORTED|HIDDEN`) }
- `MessageReport` { id, messageId, reportedBy, reason, status(`OPEN|REVIEWED|DISMISSED|ACTIONED`), reviewedBy? }
- `Notice` { id, title, body, audience{ roles[], classIds[], sectionIds[] }, status(`DRAFT|PENDING_APPROVAL|PUBLISHED|ARCHIVED`), publishedAt?, pinned, attachmentFileIds[] }
- `Homework` { id, teacherAssignmentId, title, description, dueAt, attachmentFileIds[], status(`DRAFT|PUBLISHED|CLOSED`) } ; `HomeworkSubmission` { id, homeworkId, studentId, fileIds[], text?, submittedAt, grade?, feedback? }
- `Notification` { id, userId, type, title, body, data{}, readAt?, createdAt }
- `FileObject` { id, ownerId, kind(`AVATAR|DOCUMENT|ATTACHMENT|HOMEWORK|REPORT_CARD|CERTIFICATE|LOGO`), filename, mimeType, sizeBytes, status(`PENDING|READY|REJECTED`), checksumSha256? }
- `Document` { id, title, category, fileId, visibility } ; `Certificate` { id, studentId, type, issuedBy, issuedAt, fileId, serialNo }
- `AuditLog` { id, actorId, actorRole, action, entityType, entityId, before?, after?, ip, deviceId?, requestId, createdAt } (append-only)
- `Device` { id, userId, platform(`web|desktop|android`), pushToken?, lastSeenAt, revokedAt? }

### C7. Official result lifecycle (R1)
Statuses (exact enum, SCREAMING_SNAKE): `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CORRECTION_REQUESTED`, `VERIFIED`, `APPROVED`, `PUBLISHED`.
Two levels:
1. **MarkSubmission** (teacher × exam paper × section) uses `DRAFT → SUBMITTED → UNDER_REVIEW → (CORRECTION_REQUESTED → SUBMITTED …) → VERIFIED`.
2. **ResultSet** (exam × class[/section]) is compiled from all VERIFIED submissions and uses `VERIFIED → APPROVED → PUBLISHED`. A ResultSet can only be created when every required paper's submission is VERIFIED.

Allowed transitions (anything else → `409 INVALID_STATE_TRANSITION`):
| From | To | Action endpoint | Who (permission + scope) |
|---|---|---|---|
| — | DRAFT | save entries | TEACHER `marks.enter` scoped; exam must be `AUTHORIZED/IN_PROGRESS` |
| DRAFT | SUBMITTED | `POST /mark-submissions/{id}/submit` | `marks.submit` scoped; all students have marks or absent flag |
| CORRECTION_REQUESTED | SUBMITTED | same `submit` (new revision) | teacher |
| SUBMITTED | UNDER_REVIEW | `POST …/start-review` | `marks.review` |
| UNDER_REVIEW | CORRECTION_REQUESTED | `POST …/request-correction` {reason, items[]} | `marks.request_correction`; reason required |
| UNDER_REVIEW | VERIFIED | `POST …/verify` | `marks.verify` |
| VERIFIED | APPROVED | `POST /result-sets/{id}/approve` | `results.approve` (Headmaster; Registrar only with explicit per-user grant) |
| APPROVED | PUBLISHED | `POST /result-sets/{id}/publish` | `results.publish`; for REGISTRAR additionally requires `features.registrarCanPublishResults=true` AND `exam.registrarMayPublish=true` |
| PUBLISHED | (revision) | `POST /result-sets/{id}/revision-requests` then `…/approve` then `…/apply` | request: `marks.review`/`results.revise_published`; approve: Headmaster only |
Rules: teacher cannot edit once SUBMITTED/UNDER_REVIEW/VERIFIED; every transition writes an `AuditLog` and a status-history row; a PUBLISHED result is immutable — a revision creates `revision+1` and keeps all earlier revisions readable by admins; students only see the latest published revision; publishing creates `result.published` notifications for every affected student; the same user may not both enter and verify the same submission (separation of duties); invalid transitions never silently succeed.

### C8. Class tests are NOT official results
`ClassTest`/`ClassTestMark` live in separate tables, endpoints, UI sections, and notification types from official results. Sharing a class test (`POST /class-tests/{id}/share`) posts a `CLASS_TEST_SHARED` message into the class-group `Conversation` and creates `classtest.shared` notifications. It never reads or writes `ResultSet`/`StudentResult`/`MarkSubmission`. Class test marks never appear on report cards or in result totals.

### C9. API conventions
- Base path `/api/v1`. JSON only (UTF-8). Resource nouns plural kebab-case: `/students`, `/mark-submissions`, `/result-sets`, `/class-tests`. Actions as `POST /{resource}/{id}/{verb-kebab}`.
- Auth header `Authorization: Bearer <accessJwt>`. Request correlation: client may send `X-Request-Id`; server always returns it. Clients send `X-Client: web|desktop|mobile` and `X-Device-Id` (UUID persisted per install). `Accept-Language: en|bn` (UI strings only; data is not translated by the API).
- Success envelope: `{ "data": <object|array>, "meta": { … }? }`. No bare arrays.
- **Pagination (cursor-based, all list endpoints):** query `?limit=` (default 25, max 100) and `?cursor=` (opaque). Response `meta: { "limit": 25, "nextCursor": "…"|null, "hasMore": true, "total": 123? }` (`total` only where cheap). Filtering: `?filter[field]=value`; search: `?q=`; sorting: `?sort=-createdAt,name`.
- **Error envelope (all non-2xx):**
```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Human readable", "requestId": "uuid",
  "fieldErrors": [ { "field": "marksObtained", "code": "OUT_OF_RANGE", "message": "Must be between 0 and 100" } ],
  "details": {} } }
```
HTTP/`code` pairs: 400 `BAD_REQUEST`; 401 `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`; 403 `FORBIDDEN` (missing permission), `ACCOUNT_SUSPENDED`; 404 `NOT_FOUND`; 409 `CONFLICT`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `DUPLICATE`; 413 `PAYLOAD_TOO_LARGE`; 415 `UNSUPPORTED_MEDIA_TYPE`; 422 `VALIDATION_FAILED`; 423 `ACCOUNT_LOCKED`; 429 `RATE_LIMITED` (with `Retry-After`); 500 `INTERNAL`; 503 `UNAVAILABLE`. Errors never leak stack traces or SQL.
- Optimistic concurrency: updates send `If-Match: "<version>"` (or `version` in body); mismatch → `409 VERSION_CONFLICT`.
- Idempotency: all `POST` that create/transition accept `Idempotency-Key` (UUID); replays return the original response.
- Rate-limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` on 429.
- Bulk marks entry: `PUT /mark-submissions/{id}/entries` with `{ entries:[{studentId, marksObtained|null, absent}], version }` — atomic, partial failure impossible.
- Standard endpoint set (frontend builds the mock for exactly these; backend implements exactly these, plus additive extras):
```
Auth:        POST /auth/login | /auth/refresh | /auth/logout | /auth/change-password | /auth/forgot-password(admin-assisted reset in v1: returns 202) ; GET /auth/me ; GET|DELETE /auth/devices[/{id}] ; POST /devices/push-token
Users/RBAC:  GET|POST /users ; GET|PATCH /users/{id} ; POST /users/{id}/deactivate|reset-password ; GET|PUT /users/{id}/permissions ; GET /permissions/catalog
School:      GET|PATCH /school ; GET|PATCH /settings
Academic:    /academic-sessions /classes /sections /subjects /class-subjects /teacher-assignments /enrollments (CRUD; POST /enrollments/bulk-promote)
People:      /students (+ POST /students/{id}/archive, GET /students/{id}/academic-history) ; /teachers
Exams:       /exams (+ POST /exams/{id}/authorize|close) ; /exam-papers ; GET /exams/{id}/progress
Marks:       GET /mark-submissions ; GET /mark-submissions/{id} ; PUT /mark-submissions/{id}/entries ; POST …/submit|start-review|request-correction|verify ; GET …/history
Results:     /result-sets (GET, POST compile) ; POST /result-sets/{id}/approve|publish ; POST|GET /result-sets/{id}/revision-requests ; POST /result-revision-requests/{id}/approve|reject|apply ; GET /students/{id}/results (published only for students) ; POST /result-sets/{id}/report-cards ; GET /report-cards/{id}
Class tests: /class-tests ; PUT /class-tests/{id}/marks ; POST /class-tests/{id}/share ; GET /students/{id}/class-tests
Attendance:  GET|POST /attendance-sessions ; PUT /attendance-sessions/{id}/records ; GET /students/{id}/attendance ; GET /attendance/summary
Messaging:   GET /conversations ; POST /conversations (DIRECT only) ; GET /conversations/{id}/messages ; POST /conversations/{id}/messages ; POST /conversations/{id}/read ; DELETE /messages/{id} ; POST /messages/{id}/report ; GET /moderation/reports ; POST /moderation/reports/{id}/resolve ; GET /messaging/recipients (who may I message)
Channels:    GET /channels ; POST /channels/{id}/posts
Notices:     /notices (+ POST /notices/{id}/publish|archive)
Homework:    /homework ; POST /homework/{id}/submissions ; GET /homework/{id}/submissions ; PATCH /homework-submissions/{id}
Notifications: GET /notifications ; POST /notifications/{id}/read ; POST /notifications/read-all ; GET /notifications/unread-count
Files:       POST /files/uploads ; POST /files/{id}/complete ; GET /files/{id}/download-url
Documents:   /documents ; /certificates (+ POST /certificates/issue)
Reports:     GET /reports/{key} (key: enrollment-summary|attendance-summary|exam-analysis|teacher-submission-status|result-distribution) ; POST /reports/{key}/export
Audit:       GET /audit-logs ; POST /audit-logs/export
Search:      GET /search?q= (global search across entities the caller may see)
Health:      GET /health ; GET /ready
```
- Every response schema must exist in `docs/api/openapi.yaml` and in `packages/types`. Contract tests on both sides compare against it.

### C10. Authentication and session strategy
- Login: `POST /auth/login` `{ identifier, password, deviceId, platform }` → `{ data:{ accessToken, refreshToken?, expiresIn, user:User, permissions:string[], mustChangePassword } }`. `identifier` = username, email or student code.
- Access token: JWT (EdDSA or RS256), 15 min, claims `sub, role, sid(session id), did(device id), iat, exp, jti`. Permissions are NOT trusted from the token; the server resolves them per request (cached).
- Refresh token: opaque random 256-bit, stored hashed server-side, 30-day sliding, **rotated on every use**, reuse of an old token revokes the whole token family (`TOKEN_REVOKED`).
- Web: refresh token in `HttpOnly; Secure; SameSite=Strict` cookie (`/api/v1/auth`), access token held in memory only; CSRF protection on cookie-authenticated endpoints. Desktop: refresh token in OS-protected storage (Electron `safeStorage`/Windows DPAPI), never in plain files or localStorage. Android: `expo-secure-store` (Keystore). Mobile/desktop send refresh token in the JSON body.
- Passwords hashed with Argon2id. Lockout after repeated failures (423 `ACCOUNT_LOCKED` + backoff). First login with temporary password forces `mustChangePassword`. Logout revokes the session. Admin password reset is the v1 recovery flow (no public self-service email recovery in v1).
- Clients: single-flight refresh on 401 `TOKEN_EXPIRED`, retry once, then clear session and route to login.

### C11. Realtime (WebSocket)
- Endpoint `GET /api/v1/ws`. Authenticate by a short-lived ticket: `POST /ws/tickets` → `{ ticket, expiresIn:30 }`, then connect `wss://…/api/v1/ws?ticket=…` (no long-lived tokens in URLs). Single connection per client; heartbeat `ping`/`pong` every 25 s; client reconnects with exponential backoff + jitter and, after reconnect, re-fetches missed data via REST using `?cursor=`/`since` (server does not guarantee replay).
- Envelope (both directions): `{ "id": "uuid", "type": "message.created", "ts": "RFC3339", "payload": { … } }`. Client→server types: `message.send` (`{conversationId, body, clientMessageId, attachmentFileIds?}` → ack `message.ack` with server id), `typing.start|stop`, `conversation.read`, `ping`. Server→client types:
`message.created`, `message.updated`, `message.deleted`, `message.ack`, `typing`, `conversation.created`, `conversation.read`, `notification.created`, `notice.published`, `result.published`, `mark-submission.status_changed`, `correction.requested`, `attendance.recorded`, `classtest.shared`, `homework.assigned`, `homework.graded`, `moderation.report_created`, `session.revoked`, `permissions.changed`, `error`.
- Server authorizes every subscription and every send; unauthorized `message.send` returns an `error` event with the standard error `code`. Clients degrade gracefully (REST polling every 30 s) when the socket is down.

### C12. Notification events (also pushed via FCM to Android; in-app via `Notification` rows and WS)
`RESULT_PUBLISHED`, `RESULT_REVISED`, `MARKS_SUBMITTED` (to registrar), `CORRECTION_REQUESTED` (to teacher), `SUBMISSION_VERIFIED`, `RESULTS_AWAITING_APPROVAL` (to headmaster), `CLASS_TEST_SHARED`, `ATTENDANCE_ABSENT` (to the student), `HOMEWORK_ASSIGNED`, `HOMEWORK_DUE_SOON`, `HOMEWORK_GRADED`, `NOTICE_PUBLISHED`, `MESSAGE_RECEIVED`, `MESSAGE_REPORTED` (to moderators), `EXAM_AUTHORIZED`, `ACCOUNT_SECURITY` (new device login, password changed, permission change). Payload: `{ type, title, body, data:{ entityType, entityId, deepLink } }`; `deepLink` format `shikkhaos://{route}` (e.g. `shikkhaos://results/{resultSetId}`), identical on all platforms.

### C13. Messaging policy (server-enforced; `GET /messaging/recipients` returns who the caller may start a DIRECT conversation with)
| Sender → Recipient | Allowed? |
|---|---|
| Teacher → Teacher | Yes |
| Teacher → Headmaster / Registrar | Yes |
| Teacher → own class group (CLASS_GROUP) | Yes (members only) |
| Student → own teachers (those with TeacherAssignment for the student's section) | Yes, if `features.studentToTeacherMessaging` (default true) |
| Student → Headmaster/Registrar | Only via the `ADMIN_DESK` channel/DM when `features.studentToAdminMessaging` (default true, restricted to a request/response style; admin may disable) |
| Student → Student private DM | **No** (rejected with `403 FORBIDDEN`, code `STUDENT_DM_DISABLED`) |
| Student in class group | May read; may post only if teacher enables `studentsCanPost` on that group (default false) |
| Admin → anyone; Official CHANNEL posts | Headmaster/authorized staff post; students read-only |
Class group membership is derived automatically from `Enrollment` (students) and `TeacherAssignment` (teachers) and re-synced on enrollment/assignment change. Safeguarding: report any message, moderators (Headmaster, or users with `moderation.review`) can hide messages and review reports; Headmaster can read conversations involving students under audit (every such read is itself audit-logged); message body max 4000 chars; attachment types restricted; basic profanity/link policy hook configurable; rate-limited sends.

### C14. File upload contract
1. `POST /files/uploads` `{ filename, mimeType, sizeBytes, kind, checksumSha256? }` → `{ data:{ fileId, uploadUrl, method:"PUT", headers:{…}, expiresAt } }` (presigned S3-compatible URL).
2. Client `PUT`s bytes directly to `uploadUrl` (progress shown; cancel supported).
3. `POST /files/{fileId}/complete` → server verifies size/type/checksum, scans/validates, flips status `PENDING → READY` (or `REJECTED`).
4. Reads: `GET /files/{fileId}/download-url` → `{ url, expiresAt }` (short-lived, authorization-checked each time). Never expose permanent public URLs.
Limits (configurable): avatar ≤ 2 MB (png/jpeg/webp); attachment/homework ≤ 15 MB; documents ≤ 25 MB (pdf, png, jpeg, docx, xlsx, txt). Max 5 attachments per message/homework submission. Report cards/certificates are server-generated PDFs.

### C15. Validation rules (shared; implemented in `packages/validation` and again in Rust — they must agree)
- `username` 3–32 `[a-z0-9._-]`; `password` ≥ 10 chars, must contain letter+digit, not in common-password list; `email` RFC-valid; `phone` Bangladesh format `01XXXXXXXXX` or `+8801XXXXXXXXX`; `studentCode` 4–20 `[A-Z0-9-]`, unique; `rollNo` positive int unique per (session, section).
- `marksObtained`: decimal, 0 ≤ marks ≤ `fullMarks` of the paper, max 2 decimals; null only when `absent=true`; `absent=true` forces marks null.
- Dates: `endDate ≥ startDate`; exam papers inside exam window; homework `dueAt` in the future at creation; attendance date not in future.
- Text: titles 1–200 chars, descriptions ≤ 5000, message ≤ 4000; trimmed; no control characters.
- Grading (default, editable by Headmaster in `SchoolProfile.gradingScheme`): 80–100 A+ (5.00), 70–79 A (4.00), 60–69 A- (3.50), 50–59 B (3.00), 40–49 C (2.00), 33–39 D (1.00), 0–32 F (0.00). GPA calculated by the server; the frontend mock uses the same function but the real UI always displays server-provided values.

### C16. Security and privacy baseline (affects both sides)
HTTPS only; strict CORS allowlist; security headers/CSP on web; no secrets in clients; no sensitive data in logs, URLs or push payloads (push shows generic text such as "New result published", not marks); audit log is append-only; minors' data is minimized; student photos/contact details visible only to staff with a need; all PII reads by staff of student records are audit-sampled; account-security notifications on new device logins.

### C17. Integration documentation rules
- `docs/api/openapi.yaml` is the single source of truth for shapes. Frontend drafts v1 from this contract before building its mock layer; backend finalizes it. Frontend `packages/types` is generated from (or verified against) it.
- Every assumption, ambiguity or deviation is logged in `docs/integration/ASSUMPTIONS.md` as `ID | date | agent | assumption | affects | status(open/confirmed/changed)`. Do not silently decide.
- Seed data the backend ships (`database/seeds/`) must contain the same demo identities and shapes as the frontend mock fixtures (frontend documents them in `docs/integration/MOCK_FIXTURES.md`) so switching `API_MODE=mock` → `API_MODE=live` requires no UI change.
- Demo accounts (both mock and seed): `headmaster` (HEADMASTER), `registrar` (REGISTRAR), `teacher.rahim`, `teacher.salma` (TEACHER), `student.ayesha`, `student.farhan`, `student.nusrat` (STUDENT); development password documented in README only, never reused outside dev.

### C18. CI/CD contract (workflows ALREADY EXIST in `.github/workflows/`; docs in `docs/releases/RELEASING.md`)
The pipeline was authored during planning and is lint-clean (`actionlint`). It has never run against real application code. Neither agent may rewrite it wholesale; each agent MUST make its own code satisfy the contract below, run the relevant workflow logic locally where possible, and if a workflow needs a fix, change it minimally, keep `actionlint` clean, and log it in `CONTRACT_CHANGELOG.md`. Workflows: `ci.yml` (PR + main), `backend.yml`, `desktop.yml`, `android.yml`, `web.yml`, `release.yml` (tag `vX.Y.Z[-pre]`). Release publishes only if every platform builds, is signed, and passes verification; secrets live only in GitHub Actions Secrets; keystores/certs are never committed.
Names the workflows depend on (change = contract change):
- **Root (frontend agent):** `.nvmrc`=22 (exists), `pnpm-workspace.yaml`, `packageManager` field, committed `pnpm-lock.yaml`, scripts `typecheck`, `lint`, `test`, `test:e2e`, `contract:check`, `build`, `web:build`, `desktop:build`, `desktop:dist:win`. Workspace package names: `web`, `mobile` (filters used by CI: `pnpm --filter web run test`, `pnpm --filter mobile run typecheck`).
- **Desktop:** `apps/desktop`, electron-builder `productName: ShikkhaOS`, appId `app.shikkhaos.desktop`, NSIS `artifactName: ShikkhaOS-Setup-${version}.exe`, per-user install (`perMachine:false`), output dir `apps/desktop/release/` containing the installer, `*.blockmap`, `latest.yml` (generated with `--publish never`); `publish: { provider: github, owner: petrait7s, repo: ShikkhaOS }` metadata for electron-updater; signing via `CSC_LINK`/`CSC_KEY_PASSWORD` env only; `electron-updater` integrated with signature + sha512 verification, updates disabled in dev/mock mode, no prerelease channel by default. Version is stamped by CI from the tag.
- **Android:** `apps/mobile`, Expo config applicationId/package `app.shikkhaos.student`, `expo prebuild` must work non-interactively and produce `apps/mobile/android/app/build.gradle` containing `versionCode N` and `versionName "x"` lines (CI rewrites them), `./gradlew assembleRelease bundleRelease` must succeed, no keystore/`google-services.json` secrets in git (FCM config injected via EAS secrets/CI file secret documented by the frontend agent; not required for v1 CI).
- **Web:** `apps/web` builds with `pnpm web:build`; `infrastructure/docker/web.Dockerfile` (Next.js standalone output, non-root) for `WEB_DEPLOY_PROVIDER=docker`.
- **Backend (backend agent):** Cargo workspace root `apps/api/Cargo.toml`, `rust-toolchain.toml`, committed `Cargo.lock`, `deny.toml`, `.sqlx/` offline cache, `.config/nextest.toml` with a `ci` profile; the binary is `shikkhaos-api` (flags `--version`, `serve`, `migrate`, `bootstrap-admin`), reads the version from env `SHIKKHAOS_VERSION` at build time; migrations in `database/migrations` (SQLx format, runnable with `sqlx migrate run --source database/migrations` against an empty Postgres 16); `infrastructure/docker/api.Dockerfile` with build context = repo root and `ARG VERSION`, building with `SQLX_OFFLINE=true`, minimal non-root runtime image, healthcheck; tests may use testcontainers (Docker is available on runners) and may use `DATABASE_URL`/`REDIS_URL` env vars provided by the workflow.
- **Build-time API URL:** repo variable `PRODUCTION_API_BASE_URL` is injected as `NEXT_PUBLIC_API_BASE_URL`, `VITE_API_BASE_URL`, `EXPO_PUBLIC_API_BASE_URL`, `SHIKKHAOS_API_BASE_URL`; release builds set `API_MODE=live` (`NEXT_PUBLIC_API_MODE`, `VITE_API_MODE`, `EXPO_PUBLIC_API_MODE`). Release bundles must contain no mock data/seeds (tested).
- Release artifact names (checked by `release.yml`): `shikkhaos-api-<v>-x86_64-linux.tar.gz`, `ShikkhaOS-Setup-<v>.exe` + `latest.yml` + blockmap, `ShikkhaOS-Student-<v>.apk` + `.aab`, `shikkhaos-web-<v>.tar.gz`, `SHA256SUMS.txt`; Docker `ghcr.io/<owner>/<repo>-api:<v>` (lowercase).


## 5. DESIGN SYSTEM AND UX
### 5.1 Principles
Premium, calm, dense-but-clear. macOS-inspired (not a copy): refined neutrals, subtle translucency/vibrancy only on sidebar/toolbars, soft shadows, 8-pt spacing grid, restrained accent color, consistent 1.5 px stroke line-icon set (one family only, e.g. Lucide) plus a distinct module app-icon set for the dock/launcher. Typography: system UI stack with Inter as fallback (and a Bengali-capable font such as Noto Sans Bengali / Hind Siliguri); strict type scale (11/12/13/15/17/22/28), no oversized headings, tabular numerals for marks. Clear hierarchy, left-aligned content, consistent paddings.
Avoid: generic admin-template look, gradients as decoration, rainbow cards, gratuitous animation (motion ≤ 200 ms, respects `prefers-reduced-motion`), clutter, inconsistent icons/spacing, controls that do nothing.
### 5.2 Tokens and theming
Design tokens in `packages/ui/tokens` (color, space, radius, elevation, typography, motion, z-index), exported for CSS variables (web/desktop) and a TS object (RN). Light and dark themes plus "System". Semantic status colors (draft, submitted, under review, correction requested, verified, approved, published) defined once, never color-only (always icon + label). WCAG 2.2 AA contrast, visible focus rings, 44 px minimum touch targets on mobile, 24 px on desktop hit areas, full keyboard operation, ARIA roles/labels, screen-reader-friendly tables, `lang` handling for English/Bengali, UI language switch (en/bn) with i18n scaffolding (i18next) and at least the shell, auth, dashboard, results, attendance and messaging strings translated.
### 5.3 Component library (build, document, test)
App shell, Sidebar, Toolbar/MenuBar, Dock/Launcher, Tab strip/Workspace, Command palette (Ctrl/Cmd+K), Global search results, Notification center popover, Profile menu, Data table (virtualized, sortable, filterable, column chooser, row selection, bulk actions, sticky header, CSV export where permitted), Forms (inputs, select, combobox, date, number, textarea, file uploader with progress), Wizard/Stepper, Status badge, Timeline (status history), Diff/revision viewer, Modal/Sheet/Drawer, Toast, Confirm dialog (typed confirmation for destructive/publish actions), Empty/Loading(Skeleton)/Error/Offline/No-permission states, Chat components (conversation list, thread, composer, attachments, typing, read marker), Charts (attendance trend, grade distribution — via a single chart library, accessible with data-table alternative), Calendar/date picker, Avatar, Tooltip, Tabs, Breadcrumbs, Pagination (cursor-based "load more"/infinite).
A Storybook (or equivalent) for web/desktop components and a documented RN component list for mobile. Every component has states (default, hover, focus, disabled, loading, error) and light/dark coverage.
### 5.4 Mandatory UI states
Every data-driven screen implements: loading skeleton, empty (with explanation and a primary action only if permitted), error (with retry + request id shown in details), offline/stale, no-permission (403 view), not-found (404), validation errors inline from `fieldErrors`, optimistic-conflict (409 `VERSION_CONFLICT` → "Someone else changed this; reload" flow), session-expired flow.

## 6. PLATFORM REQUIREMENTS
### 6.1 Desktop (Electron, Windows EXE) — flagship
- Secure Electron: `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer, strict CSP, a minimal typed preload API (secure token storage, window controls, notifications, open-file/save-file dialogs, app version, auto-start preference), IPC validated, no remote content, navigation locked down, single-instance lock, external links open in the system browser.
- Shell: custom macOS-inspired window chrome (frameless with accessible drag region and Windows-native min/max/close behavior), top menu bar (File, Edit, View, Go, Window, Help with real commands), left sidebar (modules, role-aware), bottom/side **Dock** with pinned modules (user can pin/unpin, persisted), multi-workspace **tabs** (open the same module twice, reorder, close, restore last session), split "detail" panes, status bar (connection state, sync state, mock/live badge, current session/year), notification center, profile & settings, theme toggle, density toggle (comfortable/compact), global search (Ctrl+K), full keyboard shortcut map shown in Help → Keyboard Shortcuts (e.g. Ctrl+K search, Ctrl+T new tab, Ctrl+W close tab, Ctrl+1..9 dock, Ctrl+, settings, Ctrl+Shift+N notifications, F5 refresh, Ctrl+/ shortcuts).
- Dashboard widgets (draggable/hideable, layout persisted per user, role-specific): see 7.
- Packaging: electron-builder config per C18 producing an NSIS Windows installer + portable EXE + `latest.yml`, app icon set, and a **real, secure electron-updater integration** (GitHub provider, HTTPS, sha512 + Authenticode publisher verification, disabled in dev/mock, user-visible 'update available / restart' UI that works against a fake update server in tests; never a fake update UI). Provide `pnpm desktop:dev`, `pnpm desktop:build`, `pnpm desktop:dist:win`. If you cannot produce the EXE in this environment (e.g. no Wine), say so explicitly, build the renderer + main bundle, run electron-builder in `--dir`/config-validate mode if possible, and document the exact Windows steps. Never claim an EXE was built unless the file exists and you listed it.
### 6.2 Android (Expo React Native) — students
- A true mobile-first app (not a WebView of the web app): bottom tab navigation (Home, Results, Attendance, Messages, More), stack navigation inside tabs, pull-to-refresh, native-feeling lists (FlashList), skeletons, haptics only where meaningful, safe-area handling, dark mode, large-text/accessibility support (TalkBack labels), Bengali/English.
- Screens: Login + forced password change, Dashboard (today’s snapshot, latest published result, attendance %, due homework, latest notices, unread messages), Profile & academic profile, Results (list of published exams → subject-wise marks, GPA/grade, position, revision badge), Report card (view/download/share PDF), Class tests (separate section, clearly labelled "Class tests — not official results"), Attendance (monthly calendar + history + percentage), Class group (chat; read-only if `studentsCanPost=false`), Teacher messages (only permitted recipients from `GET /messaging/recipients`; no student-to-student option anywhere), Report message, Homework (list, detail, attachment download, submit with file/photo, status), Notices (pinned, filter, attachments), Notifications center (grouped, mark all read, deep links `shikkhaos://`), Academic history (sessions/classes/results), Settings (language, theme, notification prefs, devices/sessions, change password, logout), Offline banner and cached last-known data (read-only) where safe.
- Push notifications: integrate `expo-notifications` structure: permission flow, device token registration to `POST /devices/push-token`, notification handlers and deep-link routing, local simulation in mock mode (a dev tool can fire each C12 event). Real FCM delivery is backend-dependent; implement and document the config (`google-services.json` placeholder instructions) without committing secrets.
- Security: secure token storage, optional biometric re-lock (expo-local-authentication) when app returns from background > N minutes (setting), screenshot-protection is not required, certificate-pinning documented as future work. Provide `pnpm mobile:start`, `pnpm mobile:android`, EAS build profiles for APK (`preview`) and AAB; document how to build the APK. Do not claim an APK exists unless you built it.
### 6.3 Web (Next.js)
- Role-aware experience for Headmaster, Register, Teachers and Students in a responsive layout: full app-shell on large screens (similar to desktop but without dock multitasking tabs unless trivial), simplified responsive layout on tablets/phones. Student web uses the mobile information architecture adapted to the browser.
- App Router with route groups per area, route guards via middleware that checks session presence only (real authorization is server-side), client-side permission gating, SEO irrelevant (private app: `noindex`), strict CSP and security headers config, cookie-based refresh semantics per C10 (mocked), accessible, keyboard-friendly, deep-linkable URLs for every entity (e.g. `/exams/{id}/papers/{id}`), `Accept-Language` support.
- Provide `pnpm web:dev`, `pnpm web:build`, `pnpm web:start`.

## 7. ROLE-SPECIFIC INTERFACES AND MODULES
Build all 29 modules. Each module lists what each role sees. Hide whole modules a role cannot access; inside modules, hide/disable actions by permission and show reasons.

**Navigation (desktop/web) by role**
- Headmaster: Dashboard, Students, Teachers, Academics (sessions/classes/sections/subjects/assignments/enrollment), Exams, Result Approval, Results (all), Attendance overview, Messages, Channels & Announcements, Notices, Reports, Documents, Roles & Permissions, Audit Log, Moderation, School Settings, System Settings.
- Register: Dashboard, Admissions & Students, Teachers (read), Academics, Exams (setup), Submissions Inbox (review queue), Results (prepare/publish when delegated), Report Cards, Certificates & Documents, Attendance (read/correct), Messages, Notices, Reports.
- Teacher: Dashboard, My Classes, My Subjects, Student Directory (scoped), Attendance, Marks Entry (exam papers assigned), My Submissions (statuses + correction requests), Class Tests, Homework, Class Groups, Messages, Notices, Academic History.
- Student (web/mobile): see 6.2.

**Module requirements (implement UI + mock service + tests)**
1. Authentication & Identity — login, logout, forced password change, session list/revoke, locked/suspended account screens, re-auth for sensitive actions (publish, approve, permission change).
2. Role & Permission Management (Headmaster) — role defaults viewer, per-user grant/revoke with reason, effective-permission preview, delegation switch `registrarCanPublishResults`, change history.
3. School Configuration — profile, logo upload, grading scheme editor with validation, timezone, feature flags (student→teacher/admin messaging; student DMs shown as permanently disabled and non-editable).
4. Student Registry — searchable/filterable table, admission wizard (multi-step, validation, photo upload), profile detail with tabs (personal, academic, enrollment history, attendance, results, documents), edit with optimistic concurrency, archive/transfer, bulk import via CSV with preview, validation report, and error rows (client-side parse → mock API).
5. Teacher Management — list, create, profile, assignments overview, deactivate.
6. Academic Session Management — create session, set current, rollover preview.
7. Class & Section Management — classes, sections, capacity, student counts.
8. Subject Management — subjects, class-subject full/pass marks.
9. Teacher Assignment — matrix editor teacher × class/section/subject with conflict detection and class-teacher designation.
10. Student Enrollment — enroll, assign section/roll, bulk promote with preview.
11. Examination Management — create exam (Register/authorized), define papers per class/subject, Headmaster authorization, schedule, progress board (per paper × section status heatmap with accessible legend).
12. Marks Entry — spreadsheet-like grid (keyboard navigation, paste from clipboard, absent toggle, per-cell validation vs full marks, autosave drafts, unsaved-changes guard, version-conflict handling, totals).
13. Marks Submission — pre-submit checklist, confirm, locked state after submit, read-only history, correction view with reviewer comments highlighted per row.
14. Result Verification (Register) — inbox, filters by exam/class/teacher/status, side-by-side review, per-row flags, request correction (reason required), verify, view revision diffs and status timeline.
15. Result Approval (Headmaster) — compiled ResultSet preview, anomalies summary, approve with re-auth + typed confirmation, reject back to Register with comment (mock must model via audit comment only if the contract allows; otherwise log the assumption).
16. Result Publishing — publish with preflight checks, delegation rules enforced (UI explains why disabled), notification fan-out preview count, immutable after publish, revision request flow with diff and Headmaster approval.
17. Report Card Generation — template preview (school logo, grades, GPA, attendance), single and batch generate, status, download; students download their own.
18. Attendance Management — daily roll-call UI (fast keyboard/touch toggles, mark all present, late/excused), corrections with reason, student/section/month views, summaries and charts, absent-notification indicator.
19. Class Test Management — create, enter marks, preview, share to class group; prominent "not official" labelling; separate from results screens.
20. Class Groups — auto-derived groups, membership list (read-only, derived), `studentsCanPost` toggle for teachers, pinned posts.
21. Private Messenger — conversation list with search/filter/unread, thread with day separators, composer with attachments, reply, delete own, report message, typing and read indicators (via mock WS), recipient picker restricted to `GET /messaging/recipients`, clear "not allowed" explanations. No student-to-student path.
22. Official Communication Channels — announcement and staff channels, read-only for students, post composer for authorized roles, audience info.
23. Noticeboard — create, audience targeting (roles/classes/sections), draft → (approval) → publish → archive, pinning, attachments, read receipts count for staff.
24. Homework & Assignments — create (with attachments, due date), student submissions list, grading with feedback, due-soon and overdue states; student submit flow.
25. Notification Center — list, filter by type, mark read/all, deep-link navigation, preferences (which types to receive), unread badge in dock/tab icon/app icon badge where supported.
26. Academic Reports — report builder using the five report keys in C9 with filters, charts + tables, export CSV/PDF (client-generated, labelled), permission-gated.
27. Document Management — upload/list/download documents, categories, visibility, certificate issue form + serial numbers + preview/print.
28. Audit Logs (Headmaster, plus `audit.read` holders) — filterable timeline/table (actor, action, entity, date), diff viewer for before/after, export request.
29. System Settings — appearance, language, notification preferences, keyboard shortcuts (desktop), data & storage (mock reset), about/version/build info, connection mode indicator.
Also: Moderation queue (reported messages: review, hide, dismiss, action note), global search, command palette.

**Dashboards**
- Headmaster: pending approvals, exam pipeline funnel by status, attendance today, enrollment totals, recent audit events, reported messages, upcoming exams, quick actions.
- Register: submissions awaiting review, corrections outstanding by teacher, verified-ready-for-approval/publish, admissions this month, document requests, quick actions.
- Teacher: today’s classes, attendance to take, marks entry due dates, correction requests (highlighted), homework to grade, unread messages, notices.
- Student: see 6.2.
Widgets show real mock data, link to their module, and have loading/empty/error states.

## 8. QUALITY, TESTING AND BUILD REQUIREMENTS
- TypeScript `strict` everywhere, ESLint + Prettier, no `any` without justification, no unused code, CI is provided by the existing `.github/workflows/` (see C18): make your scripts and package/app names satisfy them, and validate locally what you can (`pip install actionlint-py && actionlint`, run each script the workflows call). Do not create a competing frontend workflow; fix `ci.yml`/`desktop.yml`/`android.yml`/`web.yml` minimally if the repo layout forces it and log it.
- Tests (must really run and pass; report counts):
  - Unit: validation schemas (every C15 rule incl. boundary marks), permission helpers, grade/GPA function, api-client error mapping, token refresh single-flight, pagination helper, mock RBAC/scope enforcement, **result lifecycle state machine (every legal and many illegal transitions)**, messaging policy matrix (including student↔student denial), class-test/official-result isolation.
  - Component: marks-entry grid, status badges, publish confirmation, permission-gated actions, forms with `fieldErrors`, empty/error/loading states.
  - Integration/E2E (Playwright for web and desktop renderer where feasible; Detox/Maestro optional for mobile): full exam workflow end-to-end (teacher enters → submits → registrar requests correction → teacher fixes → registrar verifies → headmaster approves → publish → student sees result and gets notification), teacher cannot see unassigned class, student cannot reach another student's data, registrar cannot publish when not delegated, published result revision keeps history.
  - Accessibility: automated axe checks on core screens, keyboard-only walkthrough for login, marks grid and publish flow.
- Performance budgets: web initial JS ≤ 250 KB gz for the login route; tables virtualized for 5,000+ rows; desktop cold start to interactive ≤ 3 s on a mid laptop (measure if possible and report honestly); mobile list screens 60 fps with 500 items.
- Required scripts at repo root: `pnpm i`, `pnpm dev:web`, `pnpm dev:desktop`, `pnpm dev:mobile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm storybook`. Document each. All must be run by you; report results truthfully, including what could not be verified in this environment.

## 9. API INTEGRATION PREPARATION (deliverables for the backend agent)
1. `docs/api/openapi.yaml` — complete OpenAPI 3.1 for every endpoint, schema, enum, error and WS event doc in the contract (validated with a linter such as Spectral; report result).
2. `packages/types` aligned to it. A script `pnpm contract:check` that fails if mock responses (validated with Zod/ajv) drift from the schema.
3. `docs/integration/MOCK_TO_REAL_MIGRATION.md` — step-by-step: env vars, switching `API_MODE`, removing mock seeds, what must match (ids, enums, fixtures), known mock simplifications, list of endpoints exercised by each screen.
4. `docs/integration/ENDPOINT_USAGE_MATRIX.md` — screen → endpoint → permission → error cases handled.
5. `docs/integration/ASSUMPTIONS.md` and `CONTRACT_CHANGELOG.md` maintained throughout.
6. `docs/integration/BACKEND_HANDOFF.md` — a checklist of behaviors the real backend must reproduce (derived from the mock), including the realtime events your UI listens to and the exact payload shapes.

## 10. IMPLEMENTATION ORDER (suggested)
1. Repo audit → monorepo scaffold, CI, tokens, theming, component foundation.
2. Contract artifacts (openapi.yaml draft, types, validation, permissions packages).
3. api-client (interface, http adapter, mock core, WS bus) + seed data.
4. Auth + shells (desktop, web, mobile) + navigation + dashboards skeletons.
5. Core records: students, teachers, academics, assignments, enrollment.
6. Exam → marks → submission → verification → approval → publishing → report cards (vertical slice first, then polish).
7. Attendance, class tests, homework, notices.
8. Messaging, channels, moderation, notifications, push plumbing.
9. Reports, documents, audit, settings, search, command palette.
10. Accessibility, performance, tests, packaging, docs. Final self-review against the Definition of Done.

## 11. COMMUNICATION RULES
- Keep the user informed with short progress notes at each major milestone. At the end provide: what was built, how to run each platform, test commands with actual results, known limitations, platform builds that could not be verified, and open assumptions.
- When unsure about a product decision not covered here, choose the safest/least-privileged option, log it, and keep going; do not block.

## 12. DOCUMENTATION DELIVERABLES
`README.md` (setup, scripts, platforms), `docs/frontend/REPO_AUDIT.md`, `docs/frontend/ARCHITECTURE.md`, `docs/frontend/DESIGN_SYSTEM.md`, `docs/frontend/BUILD_AND_RELEASE.md` (Windows EXE, APK, web), `docs/frontend/TESTING.md`, `docs/frontend/KEYBOARD_SHORTCUTS.md`, plus all integration docs in section 9.

## 13. DEFINITION OF DONE
The frontend is done only when ALL are true and demonstrated with real command output:
- [ ] Desktop, web and Android apps all start in mock mode with the demo accounts; each of the 29 modules is reachable by the right roles and works end-to-end against the mock.
- [ ] The complete official exam workflow, class test workflow and communication workflow behave exactly per the contract, including all 7 statuses, correction loops, delegated publishing, revisions, and audit entries.
- [ ] Role/scope enforcement verified by tests: Teacher scoped, Student isolated (404 on others), Registrar ≠ Headmaster authority, student↔student DM impossible.
- [ ] All screens implement loading/empty/error/offline/no-permission states; no dead controls; no placeholder or lorem ipsum content.
- [ ] Light/dark, English/Bengali (core flows), keyboard navigation, AA contrast, axe checks pass on core screens.
- [ ] `typecheck`, `lint`, `test`, `build` pass; E2E core workflow passes; failures or unverifiable platform builds are explicitly documented, never hidden.
- [ ] HTTP adapter and WS client implemented and tested against a fake server; switching `API_MODE=live` requires configuration only.
- [ ] `openapi.yaml`, types, mock fixtures, migration and handoff docs complete and consistent with the contract.
- [ ] Windows EXE and Android APK build instructions verified or honestly marked unverified; no secrets committed.
- [ ] CI/CD contract C18 satisfied: every script/path/name the workflows rely on exists; `actionlint` clean; `ci.yml` jobs pass on the branch; `expo prebuild` + `assembleRelease` and `desktop:dist:win` verified where the environment allows, otherwise honestly reported; release bundles contain no mock code.
- [ ] Final report lists every assumption and deviation. No fabricated results anywhere.

Begin with the repository audit (section 1).
