# user_management API Specification

Version: 1.0 · Owner: prog1 (backend) · Consumer: prog2 (frontend)

Base URL (local): `http://localhost:4000`. All bodies are JSON (`Content-Type: application/json`).

## Conventions

### Authentication

Login and registration set a session cookie. The token never appears in a response body, and the frontend cannot read it. Do not store it in localStorage.

| Cookie attribute | Value |
|---|---|
| Name | `um_session` |
| Value | Signed JWT (HS256) |
| HttpOnly | Always |
| Secure | In production (`NODE_ENV=production`) |
| SameSite | `Lax` |
| Path | `/` |
| Max-Age | 3600 seconds, equal to the JWT lifetime. There is no refresh; the user logs in again after expiry. |

Browser clients must send `credentials: 'include'` on every request.

### CORS and CSRF

- CORS allows only the origins in `CORS_ORIGINS` (default `http://localhost:3000`), with credentials.
- `SameSite=Lax` keeps the cookie off cross-site POST requests.
- Every request other than GET, HEAD or OPTIONS that carries an `Origin` header outside the allowlist is rejected with `403 CSRF_ORIGIN_REJECTED`. Requests with no `Origin` header (curl, server-to-server) are allowed, because they do not carry a browser's ambient cookies.
- The frontend and API must stay on the same site (for example `localhost` on two ports, or `app.example.com` and `api.example.com`). Different sites would need `SameSite=None` and a CSRF token, which this version does not provide.

### User object

Returned by every endpoint that returns a user. Password hashes and `tokenVersion` are never returned.

| Field | Type | Notes |
|---|---|---|
| `id` | string (UUID v4) | |
| `email` | string | Stored trimmed and lowercased |
| `name` | string | |
| `role` | `"user"` \| `"admin"` | |
| `createdAt` | string (ISO 8601 UTC) | |
| `updatedAt` | string (ISO 8601 UTC) | |

### Error format

Every error uses this shape. `details` is present only on `VALIDATION_ERROR`.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "Invalid email address" }]
  }
}
```

Branch on `error.code`, not on `message`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body failed validation; see `details` |
| 400 | `INVALID_JSON` | Body is not valid JSON |
| 401 | `INVALID_CREDENTIALS` | Login failed (unknown email and wrong password are indistinguishable) |
| 401 | `UNAUTHENTICATED` | Cookie missing, invalid, expired or revoked, or the user no longer exists |
| 403 | `FORBIDDEN` | Authenticated, but the role is not allowed |
| 403 | `CSRF_ORIGIN_REJECTED` | `Origin` is not in the allowlist |
| 404 | `NOT_FOUND` | No such route |
| 409 | `EMAIL_ALREADY_EXISTS` | Email is already registered |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds 10 KB |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `STORAGE_UNAVAILABLE` | User file is corrupted or unreadable; retrying will not help until an operator fixes it |

## Endpoints

### POST /api/auth/register

Creates a user with role `user` and signs them in. Auth: none.

| Field | Type | Required | Rules |
|---|---|---|---|
| `name` | string | Yes | 1–100 characters after trimming |
| `email` | string | Yes | Valid email, at most 254 characters; case-insensitive |
| `password` | string | Yes | At least 8 characters and at most 72 bytes in UTF-8 (the bcrypt input limit) |

Unknown fields, including `role`, are rejected with `VALIDATION_ERROR`.

```json
{ "name": "Ada Lovelace", "email": "ada@example.com", "password": "correct-horse-battery" }
```

**201 Created**, sets `um_session`:

```json
{
  "user": {
    "id": "6f1c2a58-3a44-4e8c-9f3e-0f6a2f1f7a11",
    "email": "ada@example.com",
    "name": "Ada Lovelace",
    "role": "user",
    "createdAt": "2026-11-04T12:00:00.000Z",
    "updatedAt": "2026-11-04T12:00:00.000Z"
  }
}
```

Errors: 400 `VALIDATION_ERROR`, 400 `INVALID_JSON`, 403 `CSRF_ORIGIN_REJECTED`, 409 `EMAIL_ALREADY_EXISTS`, 503 `STORAGE_UNAVAILABLE`.

### POST /api/auth/login

Auth: none.

| Field | Type | Required | Rules |
|---|---|---|---|
| `email` | string | Yes | Valid email |
| `password` | string | Yes | Non-empty |

```json
{ "email": "ada@example.com", "password": "correct-horse-battery" }
```

**200 OK**, sets `um_session`. Body: `{ "user": User }`.

Errors: 400 `VALIDATION_ERROR`, 400 `INVALID_JSON`, 401 `INVALID_CREDENTIALS`, 403 `CSRF_ORIGIN_REJECTED`, 503 `STORAGE_UNAVAILABLE`.

### GET /api/auth/me

Returns the signed-in user. Auth: `um_session`. Use this to restore state on page load; a 401 means signed out.

**200 OK**. Body: `{ "user": User }`.

Errors: 401 `UNAUTHENTICATED`, 503 `STORAGE_UNAVAILABLE`.

### POST /api/auth/logout

Clears the cookie. If the cookie holds a valid token, it also revokes every token issued to that user, so **all of the user's sessions end**. Auth: optional, so an expired session can still log out. No body.

**204 No Content**, always, unless rejected by the origin check or a storage failure.

Errors: 403 `CSRF_ORIGIN_REJECTED`, 503 `STORAGE_UNAVAILABLE`.

### GET /api/users

Lists all users, oldest first. Auth: `um_session`, role `admin`. Role is read from the user store on each request, so a role change applies immediately.

**200 OK**:

```json
{ "users": [ { "id": "...", "email": "...", "name": "...", "role": "admin", "createdAt": "...", "updatedAt": "..." } ], "total": 1 }
```

Errors: 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 503 `STORAGE_UNAVAILABLE`.

## Frontend notes

- Server-side Next.js code that calls the API must forward the incoming `Cookie` header itself; `credentials: 'include'` only applies in the browser.
- Treat any 401 other than `INVALID_CREDENTIALS` as session expiry and redirect to login.
- Registration reveals whether an email exists (409). This is accepted for the POC.
