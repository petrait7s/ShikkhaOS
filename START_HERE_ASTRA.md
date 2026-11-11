# START HERE (Astra)

Task: complete the ENTIRE ShikkhaOS backend in Rust, then deliver it as `backend.zip`.

1. Read `docs/prompts/B_BACKEND_PROMPT.md` (full specification + shared contract C1–C18).
2. Read `docs/prompts/C_ASTRA_DELIVERY_INSTRUCTIONS.md` (how to execute and how to package). Follow it exactly.
3. `docs/prompts/A_FRONTEND_PROMPT.md` is the frontend agent's prompt; read it only to understand what the frontend expects.
4. CI/CD already exists in `.github/workflows/` (contract C18). Make your code satisfy it.
5. Build the backend under `apps/api/`, `database/`, `infrastructure/`, `docs/backend/`, `docs/api/`, `docs/integration/`.
6. You have NO GitHub write access. Do not push, tag, release or open PRs. Work locally and return the zip to the user.
7. Final deliverable: a single file named `backend.zip` (layout and contents defined in C section 4; name it exactly `backend.zip`, also keep the `shikkhaos-backend-<version>.zip` copy if the script produces it) with a SHA-256 checksum and an honest `BUILD_REPORT.md` and `STATUS.md` inside. Never claim anything passed that you did not run.
