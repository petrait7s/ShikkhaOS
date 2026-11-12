# ShikkhaOS — School Operating System

*One School. One System. One Connected Community.*

A private, single-school platform: administration, academics, examinations/results and internal communication, with three clients on one **Rust** backend.

| Part | Tech | Users |
|---|---|---|
| `apps/api` | Rust · Axum · SQLx · PostgreSQL · WebSocket | all |
| `apps/desktop` | Electron + React (Windows installer via electron-builder) | Headmaster, Register, Teachers |
| `apps/web` | Next.js (SPA) | all roles |
| `apps/mobile` | Expo / React Native (Android APK) | Students |
| `packages/*` | shared types, permissions, validation, API client, screens | — |

Roles: **Headmaster** (authorizes exams, approves/publishes results, permissions, audit), **Register** (admissions, exam setup, verifies marks, requests corrections, compiles results, publishes only when delegated, certificates), **Teacher** (own classes only: attendance, marks entry, class tests, homework), **Student** (own records only). No parent accounts; no student-to-student private messaging.

## Quick start (development)
```bash
createdb shikkhaos
export DATABASE_URL=postgres://postgres:postgres@localhost/shikkhaos JWT_SECRET=$(openssl rand -hex 32) COOKIE_SECURE=false CORS_ORIGINS=http://localhost:3000
cd apps/api && ALLOW_DEMO_SEED=true cargo run -- seed-demo && cargo run -- serve      # API on :8080
cd ../.. && pnpm install && cp apps/web/.env.example apps/web/.env.local && pnpm dev:web   # http://localhost:3000
```
Demo accounts (password `Demo@Pass2026`): `headmaster`, `registrar`, `teacher.rahim`, `teacher.salma`, `student.ayesha`, … — see `docs/integration/MOCK_FIXTURES.md`.
Docker: `export JWT_SECRET=$(openssl rand -base64 48); docker compose -f infrastructure/docker-compose.yml up --build`.

## Verify
```bash
(cd apps/api && cargo fmt --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace)
pnpm typecheck && pnpm test && pnpm contract:check && pnpm build && pnpm test:e2e
```

## Docs
`docs/STATUS.md` (what is done / verified / missing) · `docs/integration/` (contract, assumptions & deviations) · `docs/backend/` · `docs/frontend/` · `docs/releases/RELEASING.md` (CI/CD, signing secrets, download/verify/update) · `docs/prompts/` (original planning prompts).
