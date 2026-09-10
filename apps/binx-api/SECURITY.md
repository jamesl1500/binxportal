# Security posture — binx-api auth

Snapshot of the auth surface and the hardening backlog. Update this when an
item lands or a new one is found.

## In place

- **Passwords** — bcrypt (passlib), 12-char minimum, top-of-breach-list
  blocklist (`core/security.py::Password`). Applies to signup, reset, and
  change-password.
- **Opaque tokens** (email verification / reset / refresh / email change) —
  256-bit random, stored only as a SHA-256 hash, single-use, TTL'd. The
  spend is a guarded `UPDATE ... WHERE used_at IS NULL` so two requests can't
  race the same token.
- **Refresh rotation** with a short reuse-grace window, and **reuse
  detection → family kill**: replaying a spent refresh token past the grace
  window revokes every refresh token for that account.
- **`auth_tokens` hygiene** — rows expired > 1 day are swept opportunistically
  on each token issue (indexed on `expires_at`).
- **Session checks every request** — `get_current_user` re-loads the user and
  rejects `is_active = false` immediately (not just on token expiry).
- **Email change is staged** — never takes effect until the link sent to the
  *new* address is confirmed.
- **Rate limiting** (`core/rate_limit.py`, slowapi, keyed by client IP):
  login 10/min, signup 10/hr, forgot-password + resend-verification 5/hr,
  reset-password + verify-email 20/hr. Storage is in-process.

## Backlog

| Priority | Item | Notes |
|---|---|---|
| High | **Redis-backed rate-limit storage** | In-process counters mean each API process limits independently — a 3-pod deploy effectively triples every limit. Set `limits`' `storage_uri` to a Redis URL before scaling past one instance. |
| High | **Real password strength / breach check** | The blocklist is ~40 entries. Move to a HIBP k-anonymity range query, or `zxcvbn`, with a score floor. |
| Medium | **Signup still leaks email existence via the 409 status** | The message is generic now, but `409` vs `201` for a fresh-username + known-email signup still confirms the email is registered. The real fix is silent-success: always `201`, and email the existing account "someone tried to sign up with your address". Product decision. |
| Medium | **Login enumeration via 403** | `"Email not verified"` / `"Account is disabled"` confirm an account exists. Rate limiting caps bulk probing; closing it fully means a generic 401 + a separate "resend verification" affordance. |
| Medium | **Per-account login throttle / lockout** | IP rate limiting doesn't stop a botnet spraying one account. Add an attempt counter keyed by email (needs a store). |
| Medium | **CORS + security headers** | No CORS config (fine while the web app proxies server-side) and no HSTS / `X-Content-Type-Options` / `X-Frame-Options` / CSP. Add a middleware; set `Strict-Transport-Security` at the edge. |
| Low | **Argon2id** for password hashing | passlib is unmaintained and pins `bcrypt<4.1`. Migrate the `CryptContext` to `argon2`, rehash on next login. |
| Low | **JWT `iss` / `aud` / `jti`** | Access tokens carry only `sub` / `exp` / `type` / `role`. Add issuer+audience; a `jti` + denylist would allow pre-expiry revocation (currently a compromised access token is valid for its full 30 min). |
| Low | **CAPTCHA / proof-of-work on signup** | Nothing stops scripted account creation beyond the 10/hr IP limit. |
| Low | **2FA (TOTP)** | Not started. |
| — | **Pre-existing Alembic drift** | `alembic check` flags `users.created_at` (removed from the model, still in the schema) and several unnamed unique constraints. Predates this work; needs a decision (drop the column, or restore it) before the migrations CI job can go green. |
