# Backend tests (run on every PR by `.github/workflows/backend.yml`)

`cargo test --workspace` against a real PostgreSQL (`TEST_DATABASE_URL`, default `postgres://postgres:postgres@localhost:5432`); each integration test creates and drops its own database.

| Suite | What it proves |
|---|---|
| `domain` unit + proptest (33) | role defaults/overrides, every legal/illegal submission & result transition, separation of duties, publish rule, GPA/grade/rank (incl. ties, absent, optional subjects, GPA ∈ [0,5], monotonic), messaging matrix, validation rules |
| `exam_workflow` | full official workflow: create → authorize → enter (validation errors) → submit → lock → review → correction → resubmit → verify → compile (blocked until all verified) → approve (re-auth) → publish (registrar refused, double publish refused) → student sees result + notification, other students 404, DB immutability, revision request/approve/apply keeps revision 1, audit rows |
| `security` | lockout, refresh rotation + reuse detection, tampered/alg=none/expired/reauth tokens, cookie flow + CSRF origin, 27-endpoint × 6-principal authorization matrix, IDOR, redaction, permission overrides (delegable only, re-auth, immediate effect), SQL-injection probes, mass assignment, idempotent replay, optimistic concurrency, cursor pagination completeness |
| `messaging` | student↔student denied (flag forced on too), student→teacher only if assigned, admin switch, class-group derivation/posting rules, channels, idempotent send, attachment ownership, report + moderation + audit of moderator reads, **real WebSocket** (single-use tickets, ack, live delivery, unauthorized send error) |
| `modules` | file lifecycle + validation + signed downloads + attachment access, attendance (scope, future date, correction reason, notifications), class tests (shared into group, **result tables untouched**), notices audience/approval, homework flow + reminder job, report-card PDFs, reports + CSV, certificates, audit export |

Gates also run: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, migrations on an empty DB (twice). `cargo audit` passes (two documented lock-file-only ignores). Not run in this environment: `cargo deny`, load tests, coverage (see STATUS.md for what was actually verified).
