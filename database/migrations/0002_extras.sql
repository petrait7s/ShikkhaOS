ALTER TABLE homework ADD COLUMN reminder_sent_at timestamptz;
ALTER TABLE homework_submissions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE report_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_set_id uuid NOT NULL REFERENCES result_sets(id), student_id uuid NOT NULL REFERENCES students(id),
  revision int NOT NULL, file_id uuid NOT NULL REFERENCES files(id), generated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_set_id, student_id, revision)
);
CREATE SEQUENCE certificate_serial;
CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id), type text NOT NULL CHECK (type IN ('CHARACTER','TRANSFER','STUDYING','BONAFIDE','OTHER')),
  serial_no text NOT NULL UNIQUE, issued_by uuid NOT NULL REFERENCES users(id), issued_at timestamptz NOT NULL DEFAULT now(),
  file_id uuid NOT NULL REFERENCES files(id), remarks text
);
CREATE INDEX messages_sender ON messages(sender_id, created_at DESC);
CREATE INDEX attendance_records_student ON attendance_records(student_id);
