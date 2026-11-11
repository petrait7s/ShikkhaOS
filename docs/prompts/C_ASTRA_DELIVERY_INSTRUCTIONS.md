# SHIKKHAOS — ASTRA EXECUTION & ZIP DELIVERY INSTRUCTIONS

Give Astra this file TOGETHER WITH `B_BACKEND_PROMPT.md` (the full specification). This file defines HOW to execute and WHAT to hand back. If the two conflict, B defines the product/technical requirements and this file defines process and delivery.

## 1. Mission
Build the ENTIRE ShikkhaOS backend in Rust, exactly per `B_BACKEND_PROMPT.md` and its Shared Integration Contract (C1–C18), then deliver it as a single verified ZIP file the user can download and run. Work autonomously to completion. Do not stop to ask questions: decide the safest option, log it in `docs/integration/ASSUMPTIONS.md`, continue.

## 2. Operating rules
1. Rust only (Tokio, Axum, SQLx, PostgreSQL, Redis, WebSocket, OpenAPI). No Node/NestJS/TypeScript/Go/Python in the core backend.
2. Read `B_BACKEND_PROMPT.md` fully first. Do the repository audit and ecosystem evaluation BEFORE coding. Verify crate versions and APIs from crates.io / `cargo`, never from memory.
3. Backend scope only. Do not build frontends. The frontend may or may not exist in the repo; if absent, implement strictly from the contract and publish `docs/api/openapi.yaml`.
4. No stubs presented as finished, no fake endpoints, no fabricated results. Every claim in the final report must be backed by a command you actually ran. Anything you could not run (e.g. Docker unavailable, no network for crates) is listed as UNVERIFIED with the reason.
5. Long task, context may reset: keep `docs/backend/PROGRESS.md` updated (done / in progress / next / decisions) after every milestone (at least after each module) and resume from it. You have NO GitHub write access: do not push, open PRs, create releases or tags, or call GitHub write APIs. Work only in your own workspace; use local `git commit` only if you want checkpoints. Your single output to the user is the zip.
6. Order: audit → ADRs + walking skeleton → kernel/iam/audit → school/academic/people → exams/marks/results (full lifecycle) → files/documents/report cards → attendance/classtests/homework/notices → messaging/WS/notifications/jobs → reports/search → hardening, performance, OpenAPI drift, docs → packaging.
7. Never commit secrets, `.env`, keys, `target/`, or dev passwords outside documented dev seeds.

## 3. Quality gates before packaging (run, record real output)
```
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings
SQLX_OFFLINE=true cargo check --workspace --all-targets --locked
cargo nextest run --workspace --locked          # unit + integration + authz matrix + e2e exam workflow
cargo sqlx prepare --workspace --check
cargo deny check && cargo audit
sqlx migrate run --source database/migrations   # on an empty Postgres 16, twice (second is a no-op)
cargo build --release --locked --bin shikkhaos-api && ./target/release/shikkhaos-api --version
docker build -f infrastructure/docker/api.Dockerfile -t shikkhaos-api:local .   # if Docker available
```
If a gate fails, fix it. Do not weaken tests or skip them to get green. Do not package a build that fails `cargo build --release`.

## 4. ZIP deliverable
Create `scripts/package-backend.sh` (bash, reproducible) that produces `dist/backend.zip` (and an identical copy `dist/shikkhaos-backend-<version>.zip`; version from `apps/api` Cargo workspace version, default `0.1.0`), plus `dist/backend.zip.sha256`.

ZIP layout (single top-level folder `shikkhaos-backend-<version>/`):
```
README_BACKEND.md          what this is, quick start (docker compose up), env vars, demo accounts, how to point the frontend (API_MODE=live, API_BASE_URL)
BUILD_REPORT.md            REAL results of every gate in section 3: command, exit code, summary counts, date, machine; list of UNVERIFIED items
STATUS.md                  module-by-module completion table (implemented / partial / missing) — be honest
MANIFEST.txt               file list + sizes
apps/api/                  full Cargo workspace source, Cargo.lock, rust-toolchain.toml, deny.toml, .sqlx/, .config/nextest.toml   (NO target/)
database/migrations/  database/seeds/
infrastructure/            docker/, docker-compose.yml, compose.prod.example.yml, .env.example (no secrets), Caddy/Nginx example
docs/backend/              all backend docs (ARCHITECTURE, ECOSYSTEM_DECISIONS, DATABASE+ERD, MIGRATIONS, SECURITY, THREAT_MODEL, REALTIME, JOBS_AND_OUTBOX, TESTING, DEPLOYMENT, RUNBOOK, PERFORMANCE)
docs/api/openapi.yaml
docs/integration/          ASSUMPTIONS, CONTRACT_CHANGELOG, DISCREPANCIES, FRONTEND_INTEGRATION_GUIDE
.github/workflows/backend.yml
```
Excluded: `target/`, `.git/`, `.env*` (except `.env.example`), keys/certs/keystores, `node_modules/`, IDE files, any secret.

Packaging steps (all mandatory):
1. Run `scripts/package-backend.sh`.
2. Verify in a CLEAN directory: `unzip`, then `cargo build --release --locked` with `SQLX_OFFLINE=true`, `shikkhaos-api --version`, and (if Docker available) `docker compose up -d` + `curl /health` and `/ready` + login with a seed account + `docker compose down`. Record results in `BUILD_REPORT.md` inside the zip (regenerate the zip after writing the report; final checksum must match the final zip).
3. `sha256sum` the final zip; print the path, size and checksum.
4. Delivery (no GitHub): hand the file `backend.zip` back to the user directly — attach/send it through whatever file-delivery mechanism your environment provides, and print its absolute path, size and SHA-256. If your environment cannot attach files, say so plainly and give the exact path plus `scripts/package-backend.sh` so the user can regenerate it. Never claim the user can download something you did not verify exists. Do not upload anywhere else.

## 5. Final report (end of work)
Exact structure: 1) what was built; 2) zip path, size, SHA-256, how to download; 3) how to run (3–5 commands); 4) table of gates with real results (pass / fail / unverified); 5) module completion table; 6) contract deviations (with changelog refs); 7) open assumptions; 8) known limitations and next steps. If anything is incomplete, say it first and plainly. Never describe partial work as complete.
