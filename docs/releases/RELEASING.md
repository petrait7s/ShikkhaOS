# Releasing ShikkhaOS

## Workflows
| File | Trigger | Purpose |
|---|---|---|
| `ci.yml` | PR, push `main`, called by release | hygiene (no keystores/secrets, actionlint), typecheck, lint, tests, contract check, build, Playwright e2e |
| `backend.yml` | PR/push touching `apps/api`, `database`, docker; called by release | fmt, clippy, tests (Postgres 16 + Redis 7), migration validation, SQLx offline check, cargo-deny/audit, Linux binary, Docker image (GHCR) |
| `desktop.yml` | PR/push touching desktop/packages; called by release | Windows NSIS installer, portable exe, `latest.yml`, signature + silent-install check |
| `android.yml` | PR/push touching mobile/packages; called by release | signed APK + AAB (release), debug-signed CI APK (non-release) |
| `web.yml` | PR/push touching web/packages; called by release | tests, production build, optional deploy (Vercel or GHCR image) |
| `release.yml` | tag `vX.Y.Z[-pre]` | runs all of the above with `release: true`, then publishes ONE GitHub Release |

Release safety: the tag must be on `main`; every component must exist (missing = failure, not skip); `publish` needs all builds; the Release is created as a draft, assets are uploaded and counted, then published; on any failure the draft is deleted. A component that is missing or unsigned **fails the release**.

## Cutting a release
```bash
git checkout main && git pull
git tag -a v1.0.0 -m "ShikkhaOS 1.0.0"
git push origin v1.0.0
```
Pre-releases: `v1.1.0-rc.1` (marked pre-release, never `latest`). Version history lives in GitHub Releases (auto-generated notes grouped by `.github/release.yml` PR labels) plus `docs/releases/CHANGELOG.md` (update it in the PR that prepares the release). Versions are SemVer; the tag is the single source of truth (workflows stamp it into desktop `package.json`, Android `versionName`/`versionCode`, backend `SHIKKHAOS_VERSION`, web `NEXT_PUBLIC_APP_VERSION`, Docker tags).

Android `versionCode = (MAJOR*1e6 + MINOR*1e3 + PATCH)*100 + suffix` (suffix = rc number for pre-releases, 99 for finals).

## One-time setup (Settings → Secrets and variables → Actions)
Secrets:
| Secret | Used by | Notes |
|---|---|---|
| `ANDROID_KEYSTORE_BASE64` | android | `base64 -w0 release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | android | |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | desktop | base64 of the code-signing `.pfx` (or HTTPS URL) + password |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | web (only if provider = vercel) | |

Variables: `PRODUCTION_API_BASE_URL` (e.g. `https://api.school.example/api/v1`), `WEB_DEPLOY_PROVIDER` (`vercel`\|`docker`\|`none`), `ENABLE_ATTESTATIONS` (`true` on public repos / plans that support it), `ALLOW_UNSIGNED_WINDOWS` (leave unset; `true` only for a conscious unsigned release). Create GitHub Environments `staging` and `production` (add required reviewers on `production`).

Create the Android keystore **locally**, never in the repo; back it up offline (losing it means students cannot upgrade the app):
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore release.keystore -alias shikkhaos -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 release.keystore | gh secret set ANDROID_KEYSTORE_BASE64
```

## Download, install, update, verify
**All files:** download from the Release page, then verify the checksum.
```bash
sha256sum -c SHA256SUMS.txt --ignore-missing          # Linux/macOS
```
```powershell
Get-FileHash .\ShikkhaOS-Setup-1.0.0.exe -Algorithm SHA256   # Windows; compare with SHA256SUMS.txt
```
If the repo has attestations enabled: `gh attestation verify <file> --repo petrait7s/ShikkhaOS`.

**Windows desktop** — run `ShikkhaOS-Setup-<v>.exe` (per-user install, no admin needed). Check *Properties → Digital Signatures* shows the school's publisher. Updates: the app uses electron-updater against this repository's Releases (`latest.yml` + installer + `.blockmap`); it downloads over HTTPS, checks the SHA-512 in `latest.yml` and requires a valid Authenticode signature from the same publisher before applying. Private repository: updates need a read-only token or a generic update server — decide before the first release and record it in `docs/integration/ASSUMPTIONS.md`.

**Android** — students: install `ShikkhaOS-Student-<v>.apk` (allow “install unknown apps” once) or from Play (`.aab`). Verify the signer: `apksigner verify --print-certs ShikkhaOS-Student-<v>.apk` and compare the SHA-256 certificate digest with the one published in this document / the first release. Updating = installing a newer APK signed with the same key.

**Backend** — Docker: `docker pull ghcr.io/petrait7s/shikkhaos-api:<v>` (note lowercase). Run `shikkhaos-api migrate` before starting a new version (see `docs/backend/DEPLOYMENT.md`). Binary: extract `shikkhaos-api-<v>-x86_64-linux.tar.gz`, which contains the binary and `migrations/`.

**Web** — deployed automatically per `WEB_DEPLOY_PROVIDER`; the tarball is an offline copy of the build. Rollback: redeploy the previous tag.

**Rollback** — never delete a published tag; publish a patch release. Database migrations are forward-only (expand/contract), see backend docs.

## Local verification of workflow changes
```bash
pip install actionlint-py && actionlint .github/workflows/*.yml
```
Note: action versions are pinned to major tags; Dependabot proposes updates weekly. Pin to commit SHAs before the first production release if your policy requires it.
