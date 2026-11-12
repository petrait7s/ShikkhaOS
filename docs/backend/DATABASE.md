# Database

PostgreSQL 16, `citext` and `pg_trgm` extensions. Enums are CHECK-constrained text identical to the API values. Key integrity rules enforced by the database itself:

* `audit_logs`, `student_results`, `mark_submission_status_history`, `result_set_status_history`: **append-only** (trigger rejects UPDATE/DELETE, SQLSTATE 55000).
* `mark_entries`: rows of a **locked revision are immutable**; a submitted revision is locked, a correction request creates a new unlocked revision copied from the old one. Marks cannot exceed the paper's full marks (trigger); absent ⇒ no marks (CHECK).
* Uniqueness: student code, one active enrollment per student per session, roll number per section per session (active), one submission per (paper, section), one result set per (exam, class), one direct conversation per user pair, one class group per section, one current session, one class teacher per section.
* Foreign keys everywhere; no hard deletes of academic or audit data (status/soft-archive instead).
* Optimistic concurrency via `version` columns on mutable records.

Main tables: users, permission_grants, devices, refresh_tokens, school_profile (single row), academic_sessions, classes, sections, subjects, class_subjects, students, teachers, enrollments, teacher_assignments, exams, exam_papers, mark_submissions (+revisions, entries, status history), result_sets (+student_results, status history, revision requests), class_tests (+marks), attendance_sessions/records, conversations/members/messages/message_reports, notices, homework (+submissions), notifications, files, documents, report_cards, certificates, audit_logs, idempotency_keys.

Migrations: forward-only SQL in `database/migrations`, applied by `shikkhaos-api migrate` (also on `serve`); CI validates them on an empty PostgreSQL 16 and re-runs them (no-op). Back up with `pg_dump`; restore into an empty database, then start the API (migrations table makes it idempotent). Not done: Row-Level Security, EXPLAIN evidence for hot queries, partitioning.
