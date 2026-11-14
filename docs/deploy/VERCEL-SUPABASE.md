# Deploy: Vercel (UI) + Supabase (database) + API host

```
Browser ──► Vercel (os-shell, static)  ──fetch──►  API host (Rust, Docker)  ──SQL──►  Supabase Postgres
```

Vercel serves only the UI. The Rust API is a long-running server (WebSocket, background jobs, file storage), so it cannot run as a Vercel function. Run it on a container host (Fly.io, Render, Railway, or a VPS) and let it use Supabase as its database.

Not tested here: a real Supabase project or a real Vercel/API deploy (no accounts or network access from this build environment). The API, migrations and the UI in `http` mode were tested against a local PostgreSQL 16.

## 1. Supabase (database, trial/free)
1. Create a project. Pick a region near your users and set a strong database password.
2. Project → Connect → copy the **Session pooler** string (port **5432**). Use it, not the "Transaction pooler" (port 6543): the API uses prepared statements, which the transaction pooler breaks.
   - The "Direct connection" is IPv6-only on the free tier; many hosts have no IPv6. The Session pooler works over IPv4.
3. Add `?sslmode=require` to the URL:
   `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`
4. Keep the Supabase "Data API" (PostgREST) off for this project, and do not expose the database password anywhere except the API host's secrets. The school data is only reached through the API.
5. Free-tier projects pause after about a week of inactivity and have small storage; use a paid plan for real school data.

## 2. Create the schema and the first admin (once, from your computer)
```bash
export DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require'
export JWT_SECRET="$(openssl rand -hex 32)"      # keep this; set the same value on the API host
shikkhaos-api migrate
shikkhaos-api bootstrap-admin headmaster "Your Name"   # creates the first Headmaster; prints a one-time password
```
`shikkhaos-api` comes from the release archive `shikkhaos-api-<version>-x86_64-linux.tar.gz`, from the Docker image, or `cargo run --release --bin shikkhaos-api -- migrate` in `apps/api`.
The migrations enable the `citext` and `pg_trgm` extensions; Supabase allows both.
For a demo database only: `ALLOW_DEMO_SEED=true shikkhaos-api seed-demo` (demo users, password `Demo@Pass2026`). Never seed demo data into a real school database.

## 3. API host (Docker image from `infrastructure/docker/api.Dockerfile`)
Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Supabase session-pooler URL above |
| `JWT_SECRET` | same long random value (at least 32 chars) |
| `CORS_ORIGINS` | your UI origin(s), e.g. `https://your-app.vercel.app` (comma separated, no trailing slash) |
| `COOKIE_SECURE` | `true` |
| `BIND_ADDR` | `0.0.0.0:8080` (default) |
| `STORAGE_DIR` | `/app/data/files`, on a persistent volume (uploads are files on disk) |

Health check: `GET /api/v1/health`. Put the host behind HTTPS (Fly, Render and Railway do this for you). Keep a single instance until file storage moves to shared object storage.
Example (Fly.io): `fly launch --dockerfile infrastructure/docker/api.Dockerfile`, then `fly secrets set DATABASE_URL=... JWT_SECRET=... CORS_ORIGINS=...` and `fly volumes create data`.

## 4. Vercel (UI)
1. Import the GitHub repository. Set **Root Directory** to `os-shell`. `os-shell/vercel.json` sets install/build/output.
2. Environment variables (Production):
   - `NEXT_PUBLIC_API_MODE` = `http`
   - `NEXT_PUBLIC_API_BASE_URL` = `https://<your-api-host>/api/v1`
   - `NEXT_PUBLIC_DEMO_MODE` = `false`
   - `NEXT_PUBLIC_SCHOOL_NAME` = your school name (and `NEXT_PUBLIC_SCHOOL_NAME_BN`)
3. Deploy, then add the Vercel URL to `CORS_ORIGINS` on the API host and restart it.
Variables starting with `NEXT_PUBLIC_` are baked in at build time and are visible in the browser: never put secrets there.

## What works in `http` mode today
Tested end to end in a browser against the real API (`os-shell/scripts/e2e-live.mjs`):
teacher enters and submits marks, registrar verifies, headmaster approves and publishes (password re-confirmation dialog), student sees the published result.

Wired to the live API: school setup (student roster import from Excel, create teachers, teacher assignments (add only), class subjects and pass marks, new exam with papers, headmaster authorization, grading scale, school name), forced new-password screen after a temporary password, password reset for students and teachers (needs re-confirmation), sign-in/out, school name, students and teachers (lists), exams, marks entry and submit, review (verify / return for correction), result compile + approve + publish, student results, notices (list/create), notifications, audit log, profile (read), change password, Headmaster overview.

Shows "not available in the live system yet" (no matching API feature or not mapped yet): unpublish/schedule publishing (use revision requests, not mapped yet), question-paper attachments, routine, magazine, sign-up approval and join codes, profile editing, pinning notices, removing a teacher assignment.
Attendance (teacher roll call, admin overview, student record), Homework (create/publish/grade, student submit) and Messages (direct chats, class groups, school channels, report a message) are live-mode-only screens in the OS interface and are hidden in mock mode. Messages refresh by polling every 4-8 seconds (the API also has a WebSocket; not used here yet). Class tests and file attachments are not in the OS interface.

For the Electron desktop build in live mode, add the app origin to the API: `CORS_ORIGINS=https://your-app.vercel.app,app://shikkaos`.

## Accounts and passwords (important for day 1)
The server creates every account with a one-time temporary password and never shows it again. When you import students or create a teacher, the UI downloads a CSV of IDs and temporary passwords. Hand them out in person, then delete the file. Everyone must choose their own password at first sign-in (the UI blocks until they do). Students sign in with their Student ID; teachers with the phone number used when creating them.
Student import needs a date of birth (YYYY-MM-DD) and gender (Male/Female) for each student; the import template has the columns.

## Tests you can re-run
`os-shell/scripts/reset-live-db.sh` (throw-away database + demo users + API on :18090), build the UI with `NEXT_PUBLIC_API_MODE=http NEXT_PUBLIC_API_BASE_URL=http://localhost:18090/api/v1`, serve `out/` on :3000, then `node os-shell/scripts/e2e-setup.mjs` and `node os-shell/scripts/e2e-live.mjs` (run the reset script before each).

## Demo installers (built-in demo data, no server)
GitHub -> Actions -> "OS apps (demo installers)" -> Run workflow. It produces, as downloadable artifacts of the run: Windows installer and portable `.exe`, Linux `.AppImage` and Fedora/RHEL `.rpm`, and an Android `.apk` (debug-signed, install by sideloading). All are unsigned demo builds with mock data in the app's own storage; they do not talk to the API. Fedora: `sudo dnf install ./ShikkaOS-*.rpm` or `chmod +x ShikkaOS-*.AppImage && ./ShikkaOS-*.AppImage`.
