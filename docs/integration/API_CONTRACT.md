# API contract (v1) — behaviour reference

`docs/api/openapi.yaml` is generated from the Rust router (`node scripts/gen-openapi.mjs`) and lists every operation (160). `pnpm contract:check` fails if the file drifts from the router or if a TypeScript client calls a path the backend does not serve. Request/response field shapes are defined by the TypeScript types in `packages/types` and enforced by the Rust integration tests (`apps/api/crates/app/tests`). Shared conventions follow contract C1–C18 in `docs/prompts/B_BACKEND_PROMPT.md`.

**Envelopes.** Success `{ "data": …, "meta"?: { limit, nextCursor, hasMore } }`; errors `{ "error": { code, message, requestId?, fieldErrors?[], details? } }`. JSON is camelCase.
**Pagination.** `?limit=` (default 25, max 100) and opaque `?cursor=`; lists are ordered deterministically.
**Concurrency / idempotency.** Mutable records carry `version`; send `If-Match: "<version>"` → `409 VERSION_CONFLICT` on mismatch. `Idempotency-Key` (UUID) on `POST` replays the first 2xx response.
**Auth.** `POST /auth/login` → JWT (HS256, 15 min) + rotating refresh token (30 d). Web: refresh token only in an `HttpOnly; SameSite=Strict` cookie scoped to `/api/v1/auth`, refresh requires an allow-listed `Origin`. Desktop/Android send the refresh token in the body and store it in OS-protected storage. Reuse of a rotated refresh token revokes the whole session (`TOKEN_REVOKED`). 5 failed logins lock the account 15 min (`423 ACCOUNT_LOCKED`).
**Sensitive actions** (approve/publish results, revision decisions, permission changes, password reset, delegation switch) need `X-Reauth-Token` from `POST /auth/reauth` (password re-entry, 5-minute token) → otherwise `403 REAUTH_REQUIRED`.
**Isolation.** Out-of-scope student/resource ids return `404 NOT_FOUND` (never 403). Students only ever receive PUBLISHED results (latest published revision).

## Official result lifecycle
Submission: `DRAFT → SUBMITTED → UNDER_REVIEW → (CORRECTION_REQUESTED → SUBMITTED …) → VERIFIED`. Result set (exam × class): `VERIFIED → APPROVED → PUBLISHED`. Invalid transitions return `409 INVALID_STATE_TRANSITION`. Separation of duties: the submitter cannot verify; a verifier cannot approve. Registrar may publish only when the school switch `registrarCanPublishResults` AND the per-exam `registrarMayPublish` are on AND the user holds `results.publish`. Published results are immutable (DB triggers); corrections are revisions (`revision+1`) requested by staff, approved by the Headmaster, applied with history retained.
Class tests (`/class-tests`) are separate tables/endpoints and never touch result tables.

## Realtime
`POST /ws/tickets` → single-use 30 s ticket → `GET /api/v1/ws?ticket=…`. Envelope `{ id, type, ts, payload }`. Client→server: `message.send`, `typing.start|stop`, `conversation.read`, `ping`. Server→client: `message.created|deleted|ack`, `typing`, `conversation.created|read`, `notification.created`, `notice.published`, `result.published`, `mark-submission.status_changed`, `correction.requested`, `attendance.recorded`, `classtest.shared`, `homework.assigned|graded`, `moderation.report_created`, `session.revoked`, `permissions.changed`, `error`. Clients reconnect with backoff and re-fetch over REST after a gap.

## Files
`POST /files/uploads` → `PUT /files/{id}/content` (bytes) → `POST /files/{id}/complete` (size, magic-byte, checksum verification) → `GET /files/{id}/download-url` (5-minute signed URL, authorization re-checked). Differences from the S3-presign contract: see ASSUMPTIONS.md (A-04).
