# ShikkaOS v1.3

A private school operating system: OS-style workspace (menu bar, dock, windows, Spotlight, widgets, Action Center) with a realistic **mock** backend and seeded demo data. Nothing is public except Login / Sign up / Forgot.

> **Demo software.** All data lives in this browser's `localStorage`. Passwords, sessions and files there are not encrypted or protected. Do not enter real student data. The real backend is Phase 2 (see `docs/PHASE2-READINESS.md`).

## Run it (any OS with Node 22 + pnpm 9)

```bash
pnpm install
pnpm dev               # development, http://localhost:3000
# or a production build:
pnpm build && pnpm start   # static export served from ./out on :3000
```

## NixOS quick start (same commands inside the dev shell)

```bash
nix develop            # or: nix-shell
cp .env.example .env   # optional, defaults already work
pnpm install
pnpm dev               # http://localhost:3000
```

Other commands: `pnpm build` (static export to `out/`), `pnpm start` (serves `out/` on :3000), `pnpm typecheck`, `pnpm lint`, `pnpm samples` (regenerate Excel demo files), `pnpm verify:grading`.

## Demo credentials (demo school: Green Crescent Model School, Sylhet)

| Role | ID | Password |
|---|---|---|
| Registrar | `registrar@gcms.edu.bd` | `registrar123` |
| Teacher | `01711000005` | `teacher123` |
| Student (rich history) | `GC26-08A-07` | `student123` |

With `NEXT_PUBLIC_DEMO_MODE=true` (default) the login screen shows an **Enter as…** panel with one click per school role (Registrar, Teacher, Student).

Verified sign-up (Student ID + join code + last 4 guardian digits): join code `GCMS-4821`. Last 4 digits come from the roster (Students app → profile). Teacher invites: Teachers app → Invite teacher, or use a pending invite code shown in the teacher profile.

## Env flags

| Flag | Default | Meaning |
|---|---|---|
| `NEXT_PUBLIC_API_MODE` | `mock` | `mock` only in Phase 1. `http` is reserved for Phase 2. |
| `NEXT_PUBLIC_DEMO_MODE` | on | Shows the one-click "Enter as…" panel. Set `false` to hide. |

## Folder map

```
src/app        routes: (auth)/login|signup|forgot, (os)/desktop
src/os         shell, window manager, dock, spotlight, widgets, lock screen
src/apps       one folder per OS app
src/features   results import wizard + validation, result reveal
src/api        contracts (zod), repositories (interfaces), mock/ (implementation), hooks, factory
src/data       seeded generator + curated Bangladeshi names
src/lib        grading, excel, i18n + dict, season, dates (Asia/Dhaka)
src/store      zustand stores
scripts        generate-samples.mjs, verify-grading.mjs
public/samples ready-made Excel files for the live demo
docs           DECISIONS, ARCHITECTURE, DEMO-SCRIPT, PHASE2-BACKEND-MAP
```

## NixOS troubleshooting

- No native binaries are used. If a prebuilt Node addon from a transitive dependency fails to load, enable `programs.nix-ld.enable = true;` in `configuration.nix` and rebuild. No global installs are needed.
- If pnpm asks to approve build scripts, none are required; run `pnpm install` again.
- Demo data lives in the browser (`localStorage`, key `shikkaos:v1:db`). Use Settings → Reset demo data, or clear site data.

## v1.1

- Apple-style glass UI: animated translucent wallpaper, glass dock/top bar/widgets, light + dark.
- **Routine** app: weekly class routine (registrar edits with teacher-clash blocking; teachers see "My week"; students see their class), exam routine, print, and a "Today's classes" widget.
- Static export: no server needed. The whole app runs in the browser on the mock backend.

## Builds (GitHub Actions)

`.github/workflows/build.yml` runs on every push to `main`:

1. **web**: install, typecheck, static export; uploads `shikkaos-web.zip` (unzip and serve with any static server).
2. **desktop**: Electron installers built on GitHub runners: Windows `.exe` (installer + portable), Linux `.AppImage`, macOS `.dmg`. Download from the run's **Artifacts**.
3. Push a tag like `v1.1.0` to also publish them as a GitHub Release.

Test on NixOS without installing anything native:

```bash
nix develop
pnpm install && pnpm build && pnpm start      # http://localhost:3000
# or from the CI zip:
unzip shikkaos-web.zip -d site && nix run nixpkgs#python3 -- -m http.server 3000 -d site
```

The Electron app is only built in CI (`desktop/`), so no Electron binary is needed on NixOS. Windows builds are unsigned, so SmartScreen may warn on first run.

## v1.2

- **Deep Ocean** palette (light + dark), Montserrat for English, Hind Siliguri for Bangla. No emoji; line icons only.
- **Profiles:** students, teachers and the registrar can add/crop/remove a photo and edit their own details; the registrar can edit any student or teacher (Students/Teachers apps, profile, Edit profile).
- **Question paper:** teachers attach the paper (PDF/image, up to 1.2 MB) from Marks Entry, fill the marks sheet and submit it; the registrar opens the paper from the Results Center cell panel before verifying.
- **Petra console** is not on the school login page. See `docs/PETRA-CONSOLE.md`.

## v1.3

- **Unified Action Center** (bell in the menu bar, Spotlight, desktop widget): approvals, marks to enter or review, returned sheets, publish-ready classes, unread notices and updates in one filterable list. See `docs/ACTION-CENTER.md`.
- **Design system refresh** (tokens, type scale, 40 px controls, contrast fixes). See `docs/DESIGN-SYSTEM.md`.
- **Results Center:** class search, state filters, sticky class column, per-class progress, solid side panel.
- **Marks Entry:** explicit Unsaved / Saving / Saved / Couldn't save + Retry states, flush on close, Shift+Enter, leave-page warning.
- **Import wizard:** goes straight to problem rows when the file has errors; text + icon row status.
- Full list and known limits: `CHANGELOG.md`. Checks that were run: `docs/VERIFICATION.md`.

## v1.4 changes
- Headmaster role (approves/publishes; superset of Registrar in the demo), login: headmaster@gcms.edu.bd / headmaster123
- Headmaster desktop: School overview + Your decision widgets
- New look: navy/teal palette, Inter font, ShikkhaOS logo, calmer glass
