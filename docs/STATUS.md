# Project status — what exists, what was verified, what is missing

Last verified in the development container (Linux, Rust 1.97, Node 22, PostgreSQL 16). **"Verified" = a command was run and passed.** Items under "Not verified" were not run in this environment.

## Verified
| Check | Result |
|---|---|
| `cargo fmt --check` | pass |
| `cargo clippy --workspace --all-targets --locked -- -D warnings` | pass (0 findings) |
| `cargo test --workspace` (real PostgreSQL) | **44 passed**: 33 domain unit/property, 1 PDF, 10 integration (exam workflow, security ×5, messaging ×2 incl. real WebSocket, modules ×2) |
| `cargo build --release --locked --bin shikkhaos-api` + `--version` | pass |
| Migrations on an empty PostgreSQL 16 | pass (applied by every integration test and the e2e runner) |
| `pnpm typecheck` (types, permissions, validation, api-client, screens, web, desktop, mobile) | pass |
| `pnpm test` | **19 passed**: validation 2, permissions 1, api-client 5 (single-flight refresh, error envelope, cookie/web mode, idempotency/If-Match, pagination), screens 11 (UI states, typed confirm, login, permission-driven navigation, forced password change) |
| `pnpm contract:check` | pass: `docs/api/openapi.yaml` in sync with the 160 router operations; 64 client API paths all served by the backend |
| `pnpm --filter web build` (Next.js production build) | pass |
| `pnpm --filter desktop build` (Vite renderer + esbuild main/preload) | pass |
| `expo export --platform android` (Metro → Hermes bytecode bundle) | pass (JS bundle only — **no APK was built**) |
| `pnpm test:e2e` — Playwright on the real stack (Rust API + built Next.js + PostgreSQL) | **4 passed**: login/errors/role navigation; **the complete official exam workflow through the UI** (create exam → papers → authorize → marks entry with validation → submit → lock → review → correction → resubmit → verify → compile → approve with password re-auth → publish with typed confirmation → student sees result + notification); realtime teacher↔student chat; read-only class group |
| `cargo audit` | pass with 2 documented ignores (RUSTSEC-2023-0071 `rsa`, RUSTSEC-2026-0459 `libsqlite3-sys`): both exist only in `Cargo.lock` via unused sqlx drivers and are not compiled (`cargo tree -i` prints nothing); see `apps/api/.cargo/audit.toml` |
| `actionlint` on all workflows | pass |
| `electron-builder --win --dir` | packaged `win-unpacked/`, then **failed at the Windows resource-editing step (needs Windows/Wine)** — see below |

## Not verified (honest list)
* **Windows `.exe` installer, auto-update, code signing** — cannot be built on Linux; the CI workflow (`desktop.yml`, `windows-latest`) is the first place this will run.
* **Android `.apk/.aab`** — only the JS bundle was built; `expo prebuild` + Gradle + signing run first in `android.yml`.
* **GitHub Actions workflows have never run on GitHub**; action versions are major-tag pins I could not look up offline.
* `cargo deny` (policy file exists, never executed), load/performance tests, coverage numbers, accessibility audit (axe), Docker image build (no Docker daemon used), production deployment, FCM push delivery, S3.

## Built (summary)
Backend: auth (Argon2id, JWT + rotating refresh with reuse detection, lockout, devices, re-auth), RBAC with delegation + scope, school profile/settings, academic structure (sessions, classes, sections, subjects, class-subjects, teacher assignments, enrollments + bulk promote), students/teachers, exams + papers + authorization + progress, marks entry/submit/review/correction/verify with revisions and history, result compile/approve/publish/revision with immutability, report-card + certificate PDFs, attendance, class tests (isolated), messaging (direct/class group/channels, policy, moderation, WebSocket), notices, homework (+ reminder job), notifications, files, documents, reports (5) + CSV export, global search, audit log + export, idempotency, optimistic concurrency, health/ready.
Frontend: shared React UI for web + desktop covering all staff/student modules above, Electron shell, Expo student app, API client + realtime client, e2e suite. CI/CD workflows, Dockerfiles, compose, release docs.

## Known gaps (also in `docs/integration/ASSUMPTIONS.md`)
No mock backend (A-01); no S3 / Redis / FCM sender (A-04..A-07); HS256 JWT (A-02); English-only UI, no multi-tab/dock workspace, draggable widgets, CSV bulk import, charts, Storybook (A-15); PDFs are Latin-1 only (A-13); no reject-to-Register approval step (A-16); mobile app has no automated tests; backend has no coverage/load figures.
