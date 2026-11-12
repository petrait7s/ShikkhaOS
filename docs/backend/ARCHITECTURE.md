# Backend architecture

Rust (stable), Tokio, Axum 0.8, SQLx 0.8 on PostgreSQL 16. A **modular monolith**: one binary (`shikkhaos-api`), a pure `domain` crate and an `app` crate organised as modules per bounded area.

```
apps/api/crates/
  domain/   pure rules, no IO: permissions (C4 + role defaults + overrides), result lifecycle state machines,
            grading/GPA/ranking, messaging policy matrix, shared validation        (33 unit + property tests)
  app/      src/lib.rs router + middleware; routes/{auth,users,academic,people,exams,marks,results,attendance,
            classtests,messaging,ws,notices,homework,files,docs,reports,search,audit,notifications,misc}.rs
            auth.rs (JWT, Argon2id, request context), scope.rs (data scoping), crud.rs (whitelisted reference CRUD),
            groups.rs (class-group sync), notify.rs (transactional notifications + post-commit realtime),
            idempotency.rs, jobs.rs, pdf.rs, seed.rs, error.rs, http.rs (envelopes, camelCase, cursors)
database/migrations/   0001_baseline.sql, 0002_extras.sql      (run by `shikkhaos-api migrate` / on `serve`)
```
Request flow: middleware (request-id → error normalisation → CORS → security headers → timeout → idempotency) → `Ctx` extractor (JWT, live user status, live session check, effective permissions) → handler (permission check → data-scope check → domain rule → transaction → audit row → notifications) → envelope.
Domain rules live in `domain` and are called from handlers; SQL never decides business transitions except as a guard (CHECK/trigger).

Authorization is always server-side and layered: role defaults + per-user GRANT/REVOKE (only delegable permissions may be granted; REVOKE wins) + scope (teacher assignments, student self, class teacher). Not-in-scope → `404`.

CLI: `shikkhaos-api serve | migrate | bootstrap-admin <username> | seed-demo | --version`.
Configuration (env): `DATABASE_URL`, `JWT_SECRET` (≥32 chars), `CORS_ORIGINS`, `COOKIE_SECURE`, `BIND_ADDR`, `STORAGE_DIR`, `ACCESS_TTL_SECS`, `REFRESH_TTL_DAYS`, `DB_MAX_CONNECTIONS`.
