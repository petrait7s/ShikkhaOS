# Pilot runbook (one school, one class first)

## Before day 1
- [ ] Production API + database running (see `VERCEL-SUPABASE.md`), HTTPS only, `COOKIE_SECURE=true`.
- [ ] `JWT_SECRET` is random (32+ bytes) and stored only as a host secret. No demo seed in production (`seed-demo` refuses without `ALLOW_DEMO_SEED=true`; never set it there).
- [ ] First Headmaster created with `bootstrap-admin`; temporary password changed at first login. Registrar and teachers created from the UI/CSV import.
- [ ] **Backups on:** managed Postgres daily backup (Supabase paid plan: daily + PITR) AND a weekly `pg_dump` copied off-platform. Do one restore test into a scratch database before the pilot starts.
- [ ] Uploaded files (`STORAGE_DIR`) on a persistent volume that is snapshotted.
- [ ] Uptime check on `GET /api/v1/health` (UptimeRobot/Better Stack), alert to a phone.
- [ ] Error visibility: API logs (`RUST_LOG=info`) kept 14+ days; someone owns reading them daily during the pilot.
- [ ] Paper fallback agreed: results are also kept on paper for the first exam cycle.

## Pilot (suggested)
Week 1 prepare and train, weeks 2-5 attendance/notices/homework on one class, then one exam cycle in parallel with paper. Compare published results with the paper result sheet line by line.

## Feedback loop
Keep one list (GitHub Issues with labels `bug`, `ux`, `idea`, `data`). Each entry: who, which screen, what they expected, screenshot. Review twice a week; ship fixes through a tagged release (`docs/releases/RELEASING.md`), never by editing production by hand.
Severity: S1 wrong result/marks or data exposure (stop and fix now), S2 blocked workflow (same day), S3 confusing/slow (next release), S4 idea.

## Rollback
- UI (Vercel): redeploy the previous deployment from the Vercel dashboard.
- API: redeploy the previous image tag. Migrations are forward-only; take a backup before any release that adds one.
- Data: restore from backup into a new database, point `DATABASE_URL` at it, restart the API.

## Scaling triggers (watch, do not pre-build)
| Signal | Action |
|---|---|
| API p95 > 500 ms or CPU > 70% sustained | bigger instance first; check slow queries (`pg_stat_statements`) |
| Postgres connections near the limit | lower the API pool size or use the pooler |
| Disk (files) > 70% | move uploads to object storage (S3-compatible) before adding instances |
| More than one API instance needed | first move file storage and the in-process job runner/WebSocket hub to shared services; today one instance is the supported setup |
| More than one school | not supported by this data model (single school per deployment); run one deployment per school |

## Known gaps to decide on after the pilot
Guardian login, unpublish/scheduled publishing, routine, magazine, sign-up approval flow, push notifications to closed phones (Firebase), Bengali text on PDFs (font), OS-style screens for attendance/homework/messages.
