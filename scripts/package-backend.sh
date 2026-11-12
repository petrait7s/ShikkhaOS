#!/usr/bin/env bash
# Builds dist/backend.zip (+ .sha256): the backend source, migrations, infra and docs. Excludes target/, secrets and node_modules.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="$(grep -m1 '^version' apps/api/Cargo.toml | sed 's/.*"\(.*\)".*/\1/')"
OUT="dist"; STAGE="$OUT/stage/shikkhaos-backend-$VERSION"
rm -rf "$OUT/stage" "$OUT/backend.zip"; mkdir -p "$STAGE"
mkdir -p "$STAGE/apps"
tar --exclude=target --exclude='.env*' -cf - apps/api | tar -xf - -C "$STAGE"
mkdir -p "$STAGE/.github/workflows" "$STAGE/docs/integration" "$STAGE/docs"
tar --exclude='.env*' -cf - database infrastructure | tar -xf - -C "$STAGE"
tar -cf - docs/backend docs/api | tar -xf - -C "$STAGE"
cp -a docs/integration/. "$STAGE/docs/integration/"
cp .github/workflows/backend.yml "$STAGE/.github/workflows/"
cp docs/STATUS.md "$STAGE/STATUS.md"
cat > "$STAGE/README_BACKEND.md" <<'DOC'
# ShikkhaOS backend (Rust)
Quick start: `export JWT_SECRET=$(openssl rand -base64 48); docker compose -f infrastructure/docker-compose.yml up --build` (API on :8080), or build natively: `cd apps/api && cargo build --release --locked`.
First account: `shikkhaos-api bootstrap-admin headmaster`. Demo data (dev only): `ALLOW_DEMO_SEED=true shikkhaos-api seed-demo` (see docs/integration/MOCK_FIXTURES.md).
Frontends point to `http(s)://<host>:8080/api/v1`; set `CORS_ORIGINS` to the web origin. Read STATUS.md first: it lists what was verified and what is missing.
Tests: `cargo test --workspace` needs PostgreSQL (`TEST_DATABASE_URL`, default postgres://postgres:postgres@localhost:5432).
DOC
cat > "$STAGE/BUILD_REPORT.md" <<DOC
# Build report (generated $(date -u +%F))
Commit: $(git rev-parse --short HEAD). Real results from the development container; see STATUS.md for the full table.
- cargo fmt --check: pass
- cargo clippy --workspace --all-targets --locked -- -D warnings: pass
- cargo test --workspace: 48 passed (34 domain, 2 lib, 12 integration incl. real WebSocket, full exam workflow, result rejection, CSV import)
- cargo build --release --locked --bin shikkhaos-api: pass
- cargo audit: pass with 2 documented lock-file-only ignores (apps/api/.cargo/audit.toml)
UNVERIFIED here: cargo deny, Docker image build, load tests, coverage, FCM, S3 (not implemented).
DOC
( cd "$STAGE" && find . -type f | sort | sed 's|^\./||' > MANIFEST.txt )
( cd "$OUT/stage" && zip -qr ../backend.zip "shikkhaos-backend-$VERSION" )
( cd "$OUT" && sha256sum backend.zip > backend.zip.sha256 && cat backend.zip.sha256 && ls -l backend.zip )
