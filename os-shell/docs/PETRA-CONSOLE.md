# Petra console (internal)

Not linked from any school-facing screen, menu, or Spotlight, and Petra accounts cannot sign in through `/login`.

- Address: `/petra-console/` (for example `http://localhost:3000/petra-console/`)
- Demo credentials: `admin@petra.dev` / `petra123`
- Signing out returns to `/petra-console/`.

**Limit of Phase 1:** the app is a browser-only mock, so this route ships in the same static build as everything else. It is hidden, not secret. Real access control arrives with the Phase 2 backend, where the Petra role is enforced on the server and the console can be served from a separate deployment.
