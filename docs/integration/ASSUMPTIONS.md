# Assumptions, deviations and open items

Format: ID · decision · affects · status. "Deviation" = differs from the planning prompts (`docs/prompts`).

| ID | Decision | Status |
|---|---|---|
| A-01 | **No mock backend.** The prompts asked the frontend to run on mock data; since the Rust backend was built in the same effort, all three clients run against the real API (`API_BASE_URL`). A demo dataset is seeded by `shikkhaos-api seed-demo` (see MOCK_FIXTURES.md). Offline/demo use without the server is therefore not supported. | Deviation |
| A-02 | JWT is **HS256** with a server-side secret (not EdDSA/RS256): single service, no third-party verifier. Key rotation requires changing `JWT_SECRET` (signs everyone out). | Deviation |
| A-03 | SQLx uses **runtime-checked queries** (no `query!` macros, no `.sqlx` cache). Correctness is covered by integration tests on real PostgreSQL. CI therefore has no `sqlx prepare --check` step. | Deviation |
| A-04 | File storage is a **local-disk `FsStorage`** behind a small seam, not S3-compatible object storage; uploads go to `PUT /files/{id}/content` on the API instead of a presigned S3 URL. Same 3-step client flow. | Deviation |
| A-05 | Background work is an **in-process 5-minute scheduler** (`jobs.rs`: homework due-soon reminders, expired upload / idempotency cleanup) and notifications are written inside the request transaction. No Redis, no outbox relay, single-instance only. | Deviation |
| A-06 | **Push delivery (FCM) is not implemented server-side.** Devices register tokens (`POST /devices/push-token`) and in-app + WebSocket notifications work; a `PushProvider` still has to be written. | Open |
| A-07 | Realtime hub is **in-process** (one API instance). Multi-instance needs Redis pub/sub. | Open |
| A-08 | Pagination cursors are opaque **offset** cursors (stable ordering, not keyset). | Deviation |
| A-09 | IDs are UUID v4 (database default), not v7. | Deviation |
| A-10 | Rate limiting: login lockout, message send limit (30/min/user) only. No generic per-IP limiter (put the reverse proxy in front). | Open |
| A-11 | Registrar "prepares results" = `marks.verify` permission (no separate permission code); the Registrar can compile result sets. | Decision |
| A-12 | Notice audience semantics: roles only = all users of those roles; classes/sections only = enrolled students + assigned teachers; both = that scope narrowed to the roles; empty = everyone. | Decision |
| A-13 | Report-card/certificate PDFs are generated synchronously by a small built-in PDF writer (Helvetica, Latin-1: Bengali text is replaced by `?`). Needs a font-embedding PDF library for Bengali names. | Open |
| A-14 | Idempotency is not atomic across concurrent requests with the same key (both may run); sequential replays are exact. | Open |
| A-15 | Frontend i18n (Bengali), multi-tab workspace/dock, draggable dashboard widgets, CSV bulk import, charts and Storybook were **not built**. The UI is English-only. | Open |
| A-16 | Reject-back-to-Register from the Headmaster's approval screen is not modelled (the Headmaster simply does not approve; a published-result revision flow exists). | Open |
| A-17 | Desktop auto-update uses electron-updater (GitHub Releases, `latest.yml`). Authenticode publisher pinning needs `WIN_PUBLISHER_NAME`; private repositories need a token or a generic update server. | Open |
