# Frontend architecture

pnpm workspace (`node-linker=hoisted`, required by Expo/Metro).

* `packages/types` — API types (camelCase). `packages/permissions` — navigation + `can()` (UI gating only; the server decides). `packages/validation` — zod rules mirroring the server. `packages/api-client` — typed `ApiClient` (bearer auth, **single-flight refresh**, error envelope → `ApiError`, `If-Match`/`Idempotency-Key`, cursor helper, upload/download flow) and `Realtime` (ticket auth, backoff + jitter, re-sync events).
* `packages/screens` — the whole staff/student UI for web **and** desktop (React 18, TanStack Query, react-router, design tokens in `styles.css`, light/dark/system theme, comfortable/compact density, keyboard shortcuts, command palette, notification center, status bar with live-connection state, loading/empty/error/forbidden/offline states).
* `apps/web` — Next.js 14 (App Router) hosting the SPA client-side (no private data rendered on the server), strict CSP/security headers, same-origin dev proxy to the Rust API, `standalone` output + Dockerfile.
* `apps/desktop` — Electron 33: `contextIsolation`, sandboxed renderer, no Node integration, navigation lock, minimal typed preload (secure token storage via `safeStorage`/DPAPI, notifications, version, menu, updater), custom title bar with Windows overlay controls, native menu, electron-updater, electron-builder (NSIS + portable).
* `apps/mobile` — Expo SDK 52 / React Native student app (expo-router): login, dashboard, results + report-card download, attendance, class tests, messaging (REST + WebSocket), homework with file/photo submission, notices, notifications with deep links, profile (password, devices, biometric re-lock), push-token registration.
* `e2e` — Playwright against the **real** API + web build.

Roles → modules: Headmaster (exams authorize, results approve/publish, roles & permissions, audit, moderation, settings), Register (admissions, exams setup, submissions inbox, compile, certificates, documents, reports), Teacher (my classes, attendance, marks entry, class tests, homework), Student (results, attendance, class tests, homework, notices, messages, notifications).
