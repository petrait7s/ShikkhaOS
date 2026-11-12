# Build, run, release

```bash
pnpm install
# API (separate terminal): see docs/backend/DEPLOYMENT.md; dev DB:  createdb shikkhaos
#   DATABASE_URL=postgres://postgres:postgres@localhost/shikkhaos JWT_SECRET=$(openssl rand -hex 32) COOKIE_SECURE=false \
#   CORS_ORIGINS=http://localhost:3000 ALLOW_DEMO_SEED=true cargo run --manifest-path apps/api/Cargo.toml -- seed-demo   # then: -- serve
cp apps/web/.env.example apps/web/.env.local && pnpm dev:web       # http://localhost:3000   (proxy to :8080)
pnpm dev:desktop                                                    # Electron + Vite (VITE_API_BASE_URL defaults to http://localhost:8080/api/v1)
pnpm dev:mobile                                                     # Expo; Android emulator reaches the host API at http://10.0.2.2:8080/api/v1
pnpm typecheck && pnpm lint && pnpm test && pnpm contract:check && pnpm build
pnpm test:e2e      # needs a built API binary, PostgreSQL, Chromium (set PW_EXECUTABLE if needed)
```
Release: tag `vX.Y.Z` → `.github/workflows/release.yml` (see `docs/releases/RELEASING.md`). Windows installer: `pnpm desktop:dist:win` on a Windows machine/runner (building the NSIS installer needs Windows or Wine). Android: `expo prebuild --platform android` + Gradle `assembleRelease` (CI signs with the keystore secrets). Build-time config: `VITE_API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_API_BASE_URL` (the workflows set them from `PRODUCTION_API_BASE_URL`).
