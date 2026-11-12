# Deployment

Docker (recommended): `docker compose -f infrastructure/docker-compose.yml up --build` after `export JWT_SECRET=$(openssl rand -base64 48)`. Image: `ghcr.io/<owner>/<repo>-api:<version>` (built by `backend.yml`; non-root, healthcheck on `/api/v1/health`).
Binary: `shikkhaos-api-<v>-x86_64-linux.tar.gz` from the GitHub Release (contains `migrations/`). Run `shikkhaos-api migrate` then `serve` behind a TLS reverse proxy (Caddy/Nginx). Set `COOKIE_SECURE=true`, `CORS_ORIGINS` to the exact web origin(s), `STORAGE_DIR` on a persistent, backed-up volume.
First account: `shikkhaos-api bootstrap-admin headmaster` (prints a one-time temporary password). Never run `seed-demo` in production (it refuses without `ALLOW_DEMO_SEED=true`).
Backups: `pg_dump` + the `STORAGE_DIR` volume. Rollback: deploy the previous image; migrations are forward-only, so take a database backup before upgrading.
Single instance only (in-process realtime hub and scheduler) — see ASSUMPTIONS.md A-05/A-07.
