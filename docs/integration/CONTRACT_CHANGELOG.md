# Contract changelog

## 1.1.0
- Additive: `POST /result-sets/{id}/reject`, result status `REJECTED` (+ `rejectionNote`), recompile of a REJECTED set as `currentRevision+1`; `POST /students/import` (`{ csv, dryRun }`); notification type `RESULTS_REJECTED`.

## 1.0.0
- Initial implemented contract (C1–C18 of the planning prompts) with the deviations listed in ASSUMPTIONS.md.
- Additive: `POST /auth/reauth` + `X-Reauth-Token` for sensitive actions; `GET /students/me`, `GET /teachers/me`; `GET /attendance/summary`; `GET /students/{id}/report-cards`; `POST /academic-sessions/{id}/set-current`; error codes `REAUTH_REQUIRED`, `SEPARATION_OF_DUTIES`, `POSTING_NOT_ALLOWED`, `RECIPIENT_NOT_PERMITTED`, `STUDENT_DM_DISABLED`, `MESSAGING_SUSPENDED`, `SUBMISSION_LOCKED`.
