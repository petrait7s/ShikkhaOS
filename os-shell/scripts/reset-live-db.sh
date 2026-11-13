#!/usr/bin/env bash
# Rebuilds a throw-away LIVE database (migrate + demo users + one authorized exam) and (re)starts the API on :18090.
set -euo pipefail
cd "$(dirname "$0")/../.."
PG=${PG:-postgres://postgres:postgres@localhost:5432}
BIN=${BIN:-apps/api/target/release/shikkhaos-api}
pkill -f "shikkhaos-api serve" 2>/dev/null || true
sleep 1
psql "$PG/postgres" -q -c "DROP DATABASE IF EXISTS oslive WITH (FORCE)" -c "CREATE DATABASE oslive"
export DATABASE_URL="$PG/oslive" JWT_SECRET=live-secret-live-secret-live-secret-12 COOKIE_SECURE=false CORS_ORIGINS=http://localhost:3000 BIND_ADDR=127.0.0.1:18090 ALLOW_DEMO_SEED=true
"$BIN" migrate >/dev/null && "$BIN" seed-demo >/dev/null
nohup "$BIN" serve >/tmp/shikkhaos-api.log 2>&1 &
for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:18090/api/v1/health >/dev/null 2>&1 && break; sleep 0.5; done
API=http://127.0.0.1:18090/api/v1 node os-shell/scripts/seed-live-demo.mjs
