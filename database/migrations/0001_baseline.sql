-- ShikkhaOS baseline schema (PostgreSQL 16). Enums are CHECK-constrained text matching the API contract.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('HEADMASTER','REGISTRAR','TEACHER','STUDENT')),
  username citext NOT NULL UNIQUE,
  email citext UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','PENDING','ARCHIVED')),
  must_change_password boolean NOT NULL DEFAULT false,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  avatar_file_id uuid,
  messaging_suspended_until timestamptz,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permission_grants (
  user_id uuid NOT NULL REFERENCES users(id),
  permission text NOT NULL,
  effect text NOT NULL CHECK (effect IN ('GRANT','REVOKE')),
  granted_by uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

CREATE TABLE devices (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  platform text NOT NULL CHECK (platform IN ('web','desktop','android')),
  push_token text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  device_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_family ON refresh_tokens(family_id);
CREATE INDEX refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE school_profile (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name text NOT NULL, name_bn text, eiin text,
  address text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '',
  logo_file_id uuid, motto text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  grading_scheme jsonb NOT NULL,
  academic_year_start_month int NOT NULL DEFAULT 1,
  features jsonb NOT NULL DEFAULT '{"studentDirectMessaging":false,"registrarCanPublishResults":false,"studentToTeacherMessaging":true,"studentToAdminMessaging":true}',
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE academic_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, start_date date NOT NULL, end_date date NOT NULL CHECK (end_date >= start_date),
  is_current boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_current_session ON academic_sessions(is_current) WHERE is_current;

CREATE TABLE classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, level int NOT NULL, "order" int NOT NULL DEFAULT 0,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id), name text NOT NULL, capacity int NOT NULL DEFAULT 60,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, name)
);
CREATE TABLE subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, name text NOT NULL, name_bn text, is_optional boolean NOT NULL DEFAULT false,
  full_marks_default numeric(6,2) NOT NULL DEFAULT 100,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE class_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES classes(id), subject_id uuid NOT NULL REFERENCES subjects(id),
  session_id uuid NOT NULL REFERENCES academic_sessions(id),
  full_marks numeric(6,2) NOT NULL, pass_marks numeric(6,2) NOT NULL CHECK (pass_marks <= full_marks),
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_id, session_id)
);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  student_code text NOT NULL UNIQUE, roll_no int, full_name text NOT NULL, full_name_bn text,
  dob date NOT NULL, gender text NOT NULL CHECK (gender IN ('MALE','FEMALE','OTHER')), blood_group text,
  address text NOT NULL DEFAULT '', guardian_name text NOT NULL DEFAULT '', guardian_phone text NOT NULL DEFAULT '',
  admission_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','TRANSFERRED','GRADUATED','ARCHIVED')),
  photo_file_id uuid, archived_at timestamptz,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_name_trgm ON students USING gin (full_name gin_trgm_ops);

CREATE TABLE teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  employee_code text NOT NULL UNIQUE, full_name text NOT NULL, designation text NOT NULL DEFAULT 'Assistant Teacher',
  phone text NOT NULL DEFAULT '', join_date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ON_LEAVE','INACTIVE')),
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id), session_id uuid NOT NULL REFERENCES academic_sessions(id),
  class_id uuid NOT NULL REFERENCES classes(id), section_id uuid NOT NULL REFERENCES sections(id),
  roll_no int NOT NULL CHECK (roll_no > 0),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PROMOTED','WITHDRAWN')),
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id)
);
CREATE UNIQUE INDEX enrollment_roll_unique ON enrollments(session_id, section_id, roll_no) WHERE status = 'ACTIVE';

CREATE TABLE teacher_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id), session_id uuid NOT NULL REFERENCES academic_sessions(id),
  class_id uuid NOT NULL REFERENCES classes(id), section_id uuid NOT NULL REFERENCES sections(id),
  subject_id uuid REFERENCES subjects(id), is_class_teacher boolean NOT NULL DEFAULT false,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX teacher_assignment_unique ON teacher_assignments(teacher_id, session_id, section_id, COALESCE(subject_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Exams & marks
CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES academic_sessions(id), name text NOT NULL,
  type text NOT NULL CHECK (type IN ('TERM','MID_TERM','FINAL','MODEL','OTHER')),
  start_date date NOT NULL, end_date date NOT NULL CHECK (end_date >= start_date),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','AUTHORIZED','IN_PROGRESS','CLOSED')),
  authorized_by uuid REFERENCES users(id), authorized_at timestamptz,
  registrar_may_publish boolean NOT NULL DEFAULT false, created_by uuid NOT NULL REFERENCES users(id),
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE exam_papers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id), class_id uuid NOT NULL REFERENCES classes(id), subject_id uuid NOT NULL REFERENCES subjects(id),
  full_marks numeric(6,2) NOT NULL CHECK (full_marks > 0), pass_marks numeric(6,2) NOT NULL CHECK (pass_marks <= full_marks), exam_date date,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, class_id, subject_id)
);
CREATE TABLE mark_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_paper_id uuid NOT NULL REFERENCES exam_papers(id), section_id uuid NOT NULL REFERENCES sections(id), teacher_id uuid NOT NULL REFERENCES teachers(id),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUESTED','VERIFIED')),
  current_revision int NOT NULL DEFAULT 1, submitted_at timestamptz, submitted_by uuid REFERENCES users(id),
  reviewed_by uuid REFERENCES users(id), verified_by uuid REFERENCES users(id), verified_at timestamptz, note text,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_paper_id, section_id)
);
CREATE TABLE mark_submission_revisions (
  submission_id uuid NOT NULL REFERENCES mark_submissions(id), revision int NOT NULL,
  locked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (submission_id, revision)
);
CREATE TABLE mark_entries (
  submission_id uuid NOT NULL, revision int NOT NULL, student_id uuid NOT NULL REFERENCES students(id),
  marks_obtained numeric(6,2), absent boolean NOT NULL DEFAULT false, remark text, flagged boolean NOT NULL DEFAULT false, flag_note text,
  PRIMARY KEY (submission_id, revision, student_id),
  FOREIGN KEY (submission_id, revision) REFERENCES mark_submission_revisions(submission_id, revision),
  CHECK ((absent AND marks_obtained IS NULL) OR (NOT absent AND marks_obtained IS NOT NULL AND marks_obtained >= 0) OR (NOT absent AND marks_obtained IS NULL))
);
CREATE TABLE mark_submission_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES mark_submissions(id),
  from_status text, to_status text NOT NULL, revision int NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE result_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL REFERENCES exams(id), class_id uuid NOT NULL REFERENCES classes(id),
  status text NOT NULL DEFAULT 'VERIFIED' CHECK (status IN ('VERIFIED','APPROVED','PUBLISHED')),
  published_revision int NOT NULL DEFAULT 0, current_revision int NOT NULL DEFAULT 1,
  grading_snapshot jsonb NOT NULL,
  compiled_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), approved_at timestamptz,
  published_by uuid REFERENCES users(id), published_at timestamptz,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, class_id)
);
CREATE TABLE student_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_set_id uuid NOT NULL REFERENCES result_sets(id), student_id uuid NOT NULL REFERENCES students(id), revision int NOT NULL,
  section_id uuid NOT NULL REFERENCES sections(id),
  total_marks numeric(8,2) NOT NULL, gpa numeric(4,2), grade text NOT NULL, passed boolean NOT NULL, position int,
  subjects jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_set_id, student_id, revision)
);
CREATE INDEX student_results_student ON student_results(student_id);
CREATE TABLE result_set_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), result_set_id uuid NOT NULL REFERENCES result_sets(id),
  from_status text, to_status text NOT NULL, revision int NOT NULL, actor_id uuid NOT NULL REFERENCES users(id), note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE result_revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), result_set_id uuid NOT NULL REFERENCES result_sets(id),
  requested_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL, proposed_changes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','APPLIED')),
  decided_by uuid REFERENCES users(id), decided_at timestamptz,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- Class tests (isolated from official results)
CREATE TABLE class_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_assignment_id uuid NOT NULL REFERENCES teacher_assignments(id), title text NOT NULL, test_date date NOT NULL,
  full_marks numeric(6,2) NOT NULL CHECK (full_marks > 0), status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SHARED')), shared_at timestamptz,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE class_test_marks (
  class_test_id uuid NOT NULL REFERENCES class_tests(id), student_id uuid NOT NULL REFERENCES students(id),
  marks numeric(6,2), absent boolean NOT NULL DEFAULT false, PRIMARY KEY (class_test_id, student_id)
);

-- Attendance
CREATE TABLE attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES sections(id), date date NOT NULL,
  taken_by uuid NOT NULL REFERENCES users(id), subject_id uuid REFERENCES subjects(id),
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX attendance_session_unique ON attendance_sessions(section_id, date, COALESCE(subject_id,'00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE attendance_records (
  session_id uuid NOT NULL REFERENCES attendance_sessions(id), student_id uuid NOT NULL REFERENCES students(id),
  status text NOT NULL CHECK (status IN ('PRESENT','ABSENT','LATE','EXCUSED')), note text, PRIMARY KEY (session_id, student_id)
);

-- Messaging
CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('DIRECT','CLASS_GROUP','CHANNEL')), title text,
  class_id uuid REFERENCES classes(id), section_id uuid REFERENCES sections(id), subject_id uuid REFERENCES subjects(id),
  channel_kind text CHECK (channel_kind IN ('ANNOUNCEMENTS','STAFF','ADMIN_DESK')),
  is_read_only_for_students boolean NOT NULL DEFAULT false, students_can_post boolean NOT NULL DEFAULT false,
  direct_key text UNIQUE, last_message_at timestamptz,
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX class_group_unique ON conversations(section_id) WHERE type = 'CLASS_GROUP';
CREATE TABLE conversation_members (
  conversation_id uuid NOT NULL REFERENCES conversations(id), user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER','MEMBER')), muted_until timestamptz, last_read_message_id uuid,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX conversation_members_user ON conversation_members(user_id);
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id), sender_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000), kind text NOT NULL DEFAULT 'TEXT',
  attachment_file_ids uuid[] NOT NULL DEFAULT '{}', reply_to_id uuid, client_message_id uuid,
  moderation_state text NOT NULL DEFAULT 'OK' CHECK (moderation_state IN ('OK','REPORTED','HIDDEN')),
  edited_at timestamptz, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_id, client_message_id)
);
CREATE INDEX messages_conv_created ON messages(conversation_id, created_at DESC, id DESC);
CREATE TABLE message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id), reported_by uuid NOT NULL REFERENCES users(id), reason text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','DISMISSED','ACTIONED')),
  reviewed_by uuid REFERENCES users(id), review_note text, created_at timestamptz NOT NULL DEFAULT now()
);

-- Notices, homework
CREATE TABLE notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, body text NOT NULL, audience jsonb NOT NULL DEFAULT '{"roles":[],"classIds":[],"sectionIds":[]}',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PENDING_APPROVAL','PUBLISHED','ARCHIVED')),
  published_at timestamptz, pinned boolean NOT NULL DEFAULT false, attachment_file_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES users(id),
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_assignment_id uuid NOT NULL REFERENCES teacher_assignments(id), title text NOT NULL, description text NOT NULL DEFAULT '',
  due_at timestamptz NOT NULL, attachment_file_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','CLOSED')),
  version int NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE homework_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id uuid NOT NULL REFERENCES homework(id), student_id uuid NOT NULL REFERENCES students(id),
  file_ids uuid[] NOT NULL DEFAULT '{}', text text, submitted_at timestamptz NOT NULL DEFAULT now(), late boolean NOT NULL DEFAULT false,
  grade text, feedback text, version int NOT NULL DEFAULT 1,
  UNIQUE (homework_id, student_id)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id), type text NOT NULL, title text NOT NULL, body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}', read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('AVATAR','DOCUMENT','ATTACHMENT','HOMEWORK','REPORT_CARD','CERTIFICATE','LOGO')),
  filename text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL, status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','REJECTED')),
  checksum_sha256 text, storage_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, category text NOT NULL, file_id uuid NOT NULL REFERENCES files(id),
  visibility text NOT NULL DEFAULT 'STAFF', created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid, actor_role text, action text NOT NULL, entity_type text NOT NULL, entity_id text,
  before jsonb, after jsonb, ip text, device_id text, request_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created ON audit_logs(created_at DESC, id DESC);
CREATE INDEX audit_entity ON audit_logs(entity_type, entity_id);

CREATE TABLE idempotency_keys (
  user_id uuid NOT NULL, key text NOT NULL, method text NOT NULL, path text NOT NULL,
  status int NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, key)
);

-- Immutability guards
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% on % is not allowed (append-only)', TG_OP, TG_TABLE_NAME USING ERRCODE = '55000'; END $$;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER student_results_insert_only BEFORE UPDATE OR DELETE ON student_results FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER mark_hist_insert_only BEFORE UPDATE OR DELETE ON mark_submission_status_history FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER result_hist_insert_only BEFORE UPDATE OR DELETE ON result_set_status_history FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE FUNCTION guard_locked_entries() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sid uuid; rev int; is_locked boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN sid := NEW.submission_id; rev := NEW.revision; ELSE sid := OLD.submission_id; rev := OLD.revision; END IF;
  SELECT locked INTO is_locked FROM mark_submission_revisions WHERE submission_id = sid AND revision = rev;
  IF is_locked THEN RAISE EXCEPTION 'mark entries of a locked revision are immutable' USING ERRCODE = '55000'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER mark_entries_locked BEFORE INSERT OR UPDATE OR DELETE ON mark_entries FOR EACH ROW EXECUTE FUNCTION guard_locked_entries();

-- marks_obtained <= paper full_marks
CREATE FUNCTION check_marks_range() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fm numeric;
BEGIN
  SELECT p.full_marks INTO fm FROM mark_submissions s JOIN exam_papers p ON p.id = s.exam_paper_id WHERE s.id = NEW.submission_id;
  IF NEW.marks_obtained IS NOT NULL AND NEW.marks_obtained > fm THEN RAISE EXCEPTION 'marks exceed full marks' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER mark_entries_range BEFORE INSERT OR UPDATE ON mark_entries FOR EACH ROW EXECUTE FUNCTION check_marks_range();
