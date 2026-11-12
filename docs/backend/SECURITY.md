# Security notes (implemented controls)

* Passwords: Argon2id (library defaults); policy ≥10 chars with letter+digit, common-password list; temporary passwords are random, shown once, force a change at first login; admin-assisted recovery only.
* Sessions: 15-minute JWT, opaque 256-bit refresh tokens stored as SHA-256, rotated on use, **reuse revokes the family**; per-request live checks of user status and session; logout/password change/deactivation revoke sessions and emit `session.revoked`.
* Login: lockout after 5 failures (15 min, `423`), identical errors for unknown user and wrong password, timing equalisation for unknown users.
* Web cookies: HttpOnly, SameSite=Strict, path-scoped; refresh demands an allow-listed `Origin` (CSRF); access token only in memory.
* Authorization: server-side RBAC with delegation limits, data scoping, 404-not-403 isolation, re-authentication for sensitive actions, separation of duties, immutable published results.
* Input: `deny_unknown_fields` on bodies, whitelisted CRUD columns, parameterised SQL only, LIKE-pattern escaping, control-character stripping, 2 MB body limit (26 MB on upload route), 30 s timeout, CSV formula-injection guard on exports.
* Files: type allow-list per kind, size limits, magic-byte verification, checksum check, path-traversal-proof storage keys (UUID only), filename sanitising, signed 5-minute download URLs with per-request authorization, `nosniff` + sandbox CSP on downloads, no public listing.
* Messaging safeguarding: student↔student DM impossible (hard-coded, tested even with the flag forced on), recipient list limited by policy, class groups follow enrollment, reports + moderation (hide/suspend), moderator reads are audit-logged, rate limit 30 msgs/min.
* Audit: append-only table; every state transition, privileged read, export and permission change is recorded with actor, role, IP, device, request id.
* Privacy: push/WS notification text never contains marks or personal data; teachers see redacted student profiles (no address/guardian/DOB).
Not done (see ASSUMPTIONS.md): generic rate limiting, virus scanning hook, secret-manager integration, key rotation with `kid`, dependency audit evidence (run `cargo audit` / `cargo deny` in CI).
