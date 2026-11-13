# Architecture

```
UI (apps, os, features)
  └─ TanStack Query hooks  (src/api/hooks.ts)
       └─ repository interfaces (src/api/repositories.ts)
            └─ factory (src/api/factory.ts, NEXT_PUBLIC_API_MODE)
                 └─ mock implementation (src/api/mock/*)  ──►  in-memory DB + localStorage
```

- **Contracts:** `src/api/contracts.ts` holds zod schemas; types are inferred from them.
- **UI never imports the mock DB.** Components call hooks (or `repos.*` inside mutation helpers). Swapping `mock` for `http` touches only `src/api/`.
- **Multi-tenancy:** every row has `schoolId`. Each mock repo method reads the session and filters by `session.schoolId`. Only `PlatformRepo` crosses schools, and it returns monitoring data only.
- **Audit:** `audit()` in `mock/db.ts` is called by every mutation.
- **Mock DB:** `shikkaos:v1:db` in localStorage with a version number. A version mismatch reseeds. Latency 120–400 ms.
- **Grading:** `src/lib/grading.ts` is pure and configurable; `scripts/verify-grading.mjs` is a standalone check of the same rules.
- **Window manager:** `os/WindowFrame.tsx` uses pointer events with pointer capture; position, size, z-order, minimize and maximize live in the zustand UI store (persisted). Below 1024 px apps open full-screen with history-based back.
- **i18n:** `lib/dict.ts` maps key → [English, Bangla]. `useT()` returns `t`, `n` (optional Bangla digits) and `lang`. Dates use `Asia/Dhaka`.
- **Excel:** `lib/excel.ts` (exceljs, loaded on demand) and `features/results/importLogic.ts` (pure detect/validate/template functions).
- **Code splitting:** every app is a `next/dynamic` import in `apps/registry.tsx`; exceljs, html-to-image and charts load with the features that use them.
