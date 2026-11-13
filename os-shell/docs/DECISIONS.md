# Decisions

- **Single-column marks entry.** Marks are stored as one total per student per subject. Component columns (Written/MCQ/Practical) are accepted in Excel imports and summed; the teacher grid enters the total. Keeps the data model simple for Phase 1.
- **Class position is per class-section**, ranked by total marks, then GPA, then roll (as specified).
- **Failed students** still receive a position by total marks.
- **Scheduled publication** flips to Published lazily: the mock checks the clock whenever matrix, notifications or student results are read.
- **Home is the desktop, not a window.** The Dock shows role apps; widgets form the desktop layer. On mobile the home screen is widgets plus an app grid.
- **Session** is a mock cookie (`shikkaos_session`, role only) used by `middleware.ts`, plus session data in `localStorage`. The cookie is not a security boundary; Phase 2 replaces it with an HttpOnly session.
- **Passwords are plain text in the mock DB.** Demo only. Phase 2 uses hashed passwords server-side.
- **Student names** from Excel imports are stored in both English and Bangla fields until edited.
- **Annual exam** is the default exam in the Results Center, widgets and teacher grid; falls back to the last term exam.
- **Grading config** is stored per school. Subject pass marks come from the subject definition; the scale and default pass percentage from the grading config.
- **Random failures** (≈2–3%) are simulated only on teacher invite, marks submit and publish so error states can be shown.
- **Petra** reads only school list, counts, health, usage and error series. It cannot reach marks, students or results.
- **Lockfile:** `pnpm-lock.yaml` was not generated in the build environment. The first `pnpm install` creates it.
- **Static export (v1.1).** `middleware.ts` was removed: the app is a pure client-side mock, so route protection is the Shell's session check. This lets the same build run as a zip, on any static host, or inside Electron. Phase 2 can move to a server runtime and bring middleware back.
- **Routine:** 6 periods per day, Sun–Thu, break after period 3. Seed avoids teacher clashes; gaps show as "Free".
- **Glass UI:** windows are near-opaque (93%) so text stays readable; the glass effect comes from the wallpaper, dock, top bar and widgets.
