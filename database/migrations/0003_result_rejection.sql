-- Headmaster can send a VERIFIED result set back to the Register (REJECTED); the Register fixes and recompiles a new revision.
ALTER TABLE result_sets DROP CONSTRAINT result_sets_status_check;
ALTER TABLE result_sets ADD CONSTRAINT result_sets_status_check CHECK (status IN ('VERIFIED','APPROVED','PUBLISHED','REJECTED'));
ALTER TABLE result_sets ADD COLUMN rejection_note text;
