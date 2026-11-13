# Verification report — v1.3.0

Environment: Linux container, Node 22, pnpm 9.15, Chromium (Playwright) headless. Date: 2026-10-28.

| # | Check | Command / method | Result |
|---|---|---|---|
| 1 | Install | `pnpm install --frozen-lockfile` | Pass (lockfile consistent) |
| 2 | Typecheck | `pnpm typecheck` | Pass, 0 errors |
| 3 | Lint | `pnpm lint` | Pass, 0 errors, 0 warnings (3 pre-existing hook warnings fixed) |
| 4 | Production build | `pnpm build` (static export) | Pass, all 7 routes exported |
| 5 | Grading rules | `pnpm verify:grading` | Pass (all cases) |
| 6 | Unit / integration tests | — | **Not available**: the project has no test suite yet |
| 7 | Browser smoke: Registrar | login → Action Center lists sign-ups, publish-ready, review items → "Review marks" opens Results Center with the cell panel → class search filters rows | Pass, no console errors |
| 8 | Browser smoke: Teacher | Action Center → "Open marks sheet" opens that sheet → type a mark → status "Unsaved changes" → autosave "Draft saved"; Enter and Tab move focus to the next row; "Mark read" on a notice removes it | Pass, no console errors |
| 9 | Browser smoke: Student (390×844) | desktop widgets in one column, no horizontal page overflow | Pass |
| 10 | Browser smoke: Registrar (390×844) | Results Center full-screen; matrix scrolls horizontally with sticky class column | Pass (visual check) |
| 11 | Petra | `/petra-console/` login works; no Action Center button; Petra rejected on `/login` | Pass |
| 12 | Dark mode + Bangla | Action Center and desktop rendered in dark theme with Bangla UI | Pass (visual check) |
| 13 | Keyboard (login) | Tab order: language, theme, ID, password, Sign in, Forgot | Pass |
| 14 | Accessible names (login) | every button/input/link has a name | Pass (0 unnamed) |
| 15 | Contrast (solid panels) | WCAG ratio of text tokens on `--card-solid` | Pass: all ≥ 4.5:1 (lowest 4.88 `--ink-3` light) |
| 16 | GitHub Actions (web + Windows/macOS/Linux installers) | push to `main` | See the Actions run for commit "v1.3" |

## Not verified
- No automated accessibility audit (axe / Lighthouse) was run; no screen-reader testing (NVDA/VoiceOver). Do not treat this as WCAG compliance.
- Contrast on translucent surfaces (widgets over the animated wallpaper) varies with the wallpaper behind them and was only checked visually.
- Real touch devices and Safari/Firefox were not tested (Chromium only).
- Electron desktop app was not launched here; it is built in CI only.
- Concurrent use by several people is not meaningful in the mock (each browser has its own data).

## Pre-existing issues (not introduced in v1.3)
- Notifications are shared per role (mock design); documented in `CHANGELOG.md`.
- Persisted window positions from older versions may reopen at their old place (now clamped into view).
