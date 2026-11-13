# Phase 2 backend readiness

Phase 1 (v1.3) is a browser-only mock. This document lists what the backend must provide. Per-method endpoint and table mapping is in `PHASE2-BACKEND-MAP.md`.

## Integration boundary
- UI → TanStack Query hooks (`src/api/hooks.ts`) → repository interfaces (`src/api/repositories.ts`) → implementation chosen by `src/api/factory.ts` (`NEXT_PUBLIC_API_MODE`).
- Phase 2 adds an `http` implementation of the same interfaces. No component imports `src/api/mock/*`.
- Zod schemas in `src/api/contracts.ts` are the wire contract; validate responses with them.
- The Action Center needs no new endpoints; it composes existing ones. A server-side `GET /me/actions` can replace it later for efficiency.

## Authentication
- Replace the mock session (`localStorage` + non-HttpOnly cookie) with HttpOnly, Secure, SameSite=Lax session cookies or short-lived tokens with rotation.
- Hash passwords (Argon2id). Lockout / rate limit on login. Password reset by verified phone/email.
- Petra staff authenticate against a separate user store and, ideally, a separate deployment; school accounts must never authenticate there.
- Remove demo credentials and the "Enter as…" panel from production builds (`NEXT_PUBLIC_DEMO_MODE=false`).

## Authorization
- Enforce every rule on the server; the client checks in `mock/repos.ts` (`need(...)`) are only a model of the rules.
- Teachers: only their assigned class/subject sheets and papers; locked after verification.
- Students: only their own published results.
- Petra: school list, counts, health, usage, errors. Never marks, students or results.
- Client-side route hiding (Petra console) is not authorization.

## Database and school isolation
- PostgreSQL; `school_id` on every school-owned table; row-level security with `school_id = current_setting('app.school_id')`.
- Files (photos, question papers) in object storage under `school/{id}/…`, served with short-lived signed URLs; size and MIME checks on the server.

## Audit logging
- Every mutation already writes an audit row in the mock (`audit()`); keep the same actions server-side in an append-only table with actor, role, school, IP, user agent and timestamp.

## Backups
- Daily full + continuous WAL archiving; tested restore; 30-day retention minimum; per-school export on request.

## Synchronization
- Today each browser has its own copy of the data. Phase 2 makes the server the single source of truth; the client keeps TanStack Query caching only.
- Concurrent marks editing: use `updated_at` / version checks on save and return 409 on conflict; the Marks Entry save-state UI already shows failures with Retry.
- Optional later: offline draft queue for marks entry.

## Migration from mock data
- The mock DB shape (`DB` in `contracts.ts`) maps table-for-table to the backend map. Seed data is demo-only and must not be migrated.
- For pilot schools, import real rosters and teachers through the existing Excel importers (server-side validation reusing `importLogic.ts` rules).
- Drop `localStorage` keys `shikkaos:v1:db`, `shikkaos:v1:papers` on first login against the real backend.

## Frontend risks to close before real data
- `localStorage` holds plaintext passwords and all school data (mock only).
- Session cookie is readable by scripts and is not a security boundary.
- Question papers and photos are data URLs in `localStorage` (size-limited, unencrypted).
- No CSP headers on the static export; add CSP when served from a real server.
