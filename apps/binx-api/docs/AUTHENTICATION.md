# Authentication System — Backend Portal (Staff/Org Members)

This auth system is for **organization staff logging into the backend portal**
(`binx-web`'s `(portal)` route group) — not for the separate client-facing portal.

All endpoints live under `binx-api`'s `/auth` prefix. All request/response bodies
are JSON.

## Token model

- **Access token** — short-lived JWT (default 30 min, `access_token_expire_minutes`
  in `core/config.py`). Sent as `Authorization: Bearer <token>` on every
  authenticated request. Stateless — verified via signature, not a DB lookup.
- **Refresh token** — opaque random string (not a JWT), default 30 days
  (`refresh_token_expire_days`). Stored hashed (SHA-256) in the `auth_tokens`
  table so it can be looked up, expired, and **rotated on every use** (each
  refresh call invalidates the old refresh token and issues a new pair).
- **Email verification / password reset tokens** — same opaque-token mechanism,
  single-use, short expiry (24h / 30min respectively).

The frontend should store the access token in memory (or a short-lived cookie)
and the refresh token in an httpOnly cookie if possible; avoid `localStorage`
for the refresh token if you can avoid it (XSS risk).

## Endpoints

### `POST /auth/signup`
```json
// request
{ "user_name": "jlatten", "email": "j@example.com", "full_name": "James Latten", "password": "•••••••• (min 8)" }
// response 201
{ "user": { "id": "...", "user_name": "jlatten", "email": "...", "full_name": "...", "role": "user", "is_active": true, "is_verified": false }, "message": "..." }
```
Account is created with `is_verified = false`. An email-verification link is
"sent" (logged to console via `core/email.py` — swap this for a real provider).
Login is blocked until the account is verified.

### `POST /auth/verify-email`
```json
{ "token": "<token from email link>" }
```
Marks the account verified. Token is single-use and expires after 24h.

### `POST /auth/resend-verification`
```json
{ "email": "j@example.com" }
```
Always returns a generic success message (does not reveal whether the email
exists) to avoid user enumeration.

### `POST /auth/login`
```json
// request
{ "email": "j@example.com", "password": "..." }
// response
{ "access_token": "...", "refresh_token": "...", "token_type": "bearer" }
```
Fails with `401` on bad credentials, `403` if the account is disabled or
email is unverified.

### `POST /auth/refresh`
```json
{ "refresh_token": "..." }
```
Returns a new `TokenPair`. The old refresh token is invalidated (rotation) —
store the new one immediately.

### `POST /auth/forgot-password`
```json
{ "email": "j@example.com" }
```
Always returns a generic success message. Sends a password-reset link
(30 min expiry) if the account exists.

### `POST /auth/reset-password`
```json
{ "token": "<token from email link>", "new_password": "..." }
```

### `GET /users/me` (authenticated)
Requires `Authorization: Bearer <access_token>`. Returns the current user.

## Error shape

FastAPI's default `HTTPException` shape:
```json
{ "detail": "Incorrect email or password" }
```

## Wiring up the frontend

1. On login/signup success, store `access_token` + `refresh_token`.
2. Attach `Authorization: Bearer <access_token>` to all API calls.
3. On `401`, call `/auth/refresh` with the stored refresh token, update both
   tokens, and retry the original request once. If refresh also fails, redirect
   to login.
4. Route guards: only allow into `(portal)` routes once a valid access token
   (or successful refresh) is confirmed.

## Local dev notes

- `core/email.py` only logs emails to the console — check the `binx-api`
  terminal output for verification/reset links while testing.
- `frontend_url` in `core/config.py` (`.env`: `FRONTEND_URL`) is used to build
  the links in those emails — point it at wherever `binx-web`'s portal runs.
- Role-gating helper: `Depends(require_role("admin"))` from `core/dependencies.py`
  for admin-only endpoints.
