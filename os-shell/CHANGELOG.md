# Changelog

## 1.3.0 — 2026-10-28

### Added
- **Unified Action Center** (`src/apps/actions/ActionCenter.tsx`, `src/features/actions/useActionItems.ts`): one searchable, filterable list of actionable items built from existing repository data. Opened from the menu-bar bell (with count badge), Spotlight ("Needs attention" group), and an Action Center desktop widget. Items open the right app and context (cell panel in Results Center, the sheet in Marks Entry, the notice in Notices).
- Notices: per-user read state (`readBy`, the caller only sees their own entry) and an unread dot.
- `notice.markNotificationRead(id)` in the mock repository.
- Results Center: class search, clickable state filters, per-class "x/y verified" progress, sticky class column.
- Marks Entry: save-state indicator (Unsaved / Saving / Saved / Couldn't save + Retry), Shift+Enter to move up, draft flush when the sheet or window closes, browser leave-page warning while unsaved.
- Import wizard: "Review problem rows" jumps to an error-only view; row status shows icon + text.
- Spotlight keyboard hints footer.
- Design tokens (type scale, spacing, radius, control heights, elevation), utility classes and `docs/DESIGN-SYSTEM.md`.

### Changed
- Menu-bar bell now opens the Action Center (the old notification dropdown is folded into its "Updates" category).
- Primary controls are 40 px tall; inputs 40 px; small buttons 32 px. Table text uses tabular numerals.
- Contrast: tertiary text, warning and success colours darkened in light mode; dark-mode tertiary text lightened.
- Bangla text: larger body size and line height (1.7), no letter spacing.
- Results side panel is solid (it no longer shows the matrix through it).
- Desktop widgets reflow to one column on phones (no clipped cards).
- Version metadata aligned to 1.3.0 (root + desktop).

### Fixed
- Window z-order after reload: `zTop` was not persisted, so a focused window could stay behind others. Z-indexes are now persisted and re-numbered before they could climb above the dock and menu bar.
- Windows are re-clamped into the viewport when opened and when the browser is resized.
- Marks autosave failures were silently ignored; they are now shown with a Retry, and typed values are kept.
- Notice read counts increased every time the same user opened a notice.
- Notice list no longer returns other users' read state.

### Known limitations
- Everything is a browser-only mock. `localStorage` is not secure storage; passwords and the session are readable by anyone with access to the browser profile.
- Notifications ("Updates") are shared per role inside a school, so marking one read marks it for everyone with that role. Per-user notification state needs the Phase 2 backend.
- Hidden ("dismissed") Action Center items are stored per device, not per account.
- Petra Admin has no Action Center (Petra must not see school task data); platform alerts stay in the Health / Error Log apps.
- The Petra console route is hidden, not protected: it ships in the same static build.
- No automated unit or end-to-end test suite exists yet; checks are listed in `docs/VERIFICATION.md`.
- Not audited against WCAG; see the accessibility section of `docs/VERIFICATION.md` for what was and was not checked.

## 1.2.0
Deep Ocean palette, Montserrat, profile photos and editing, question papers, hidden Petra console.

## 1.1.0
Glass desktop, class routine, static export, Electron desktop builds and GitHub Actions.
