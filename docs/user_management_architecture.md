# user_management Backend Architecture

Owner: prog1. The API contract is in [user_management_api_specification.md](user_management_api_specification.md).

## Scope

A single-server proof of concept: Node.js, Express 5, TypeScript, JWT in an HTTP-only cookie, bcrypt, and JSON file storage. No application database is used.

**JSON storage is suitable only for this single-server POC.** It must run as exactly one Node process. Clustering, multiple instances or a second process writing the file will lose data.

## Layout

```
backend/
  src/
    config.ts           Environment parsing and validation
    app.ts              Express app factory (no listening, used by tests)
    server.ts           Entry point: load env, bootstrap admin, listen
    errors.ts           AppError and error codes
    types.ts            User types and toPublicUser
    validation.ts       zod request schemas
    middleware/         auth, requireRole, originCheck, errorHandler
    routes/             auth.ts, users.ts
    services/           userStore.ts, password.ts, token.ts, authCookie.ts, bootstrapAdmin.ts
  data/
    users.json          Runtime data, ignored by Git
    users.json.example  Committed format example
  tests/                Vitest unit and integration tests
docs/
```

## Request flow

`cors` → `originCheck` → `express.json` (10 KB limit) → `cookie-parser` → router → `errorHandler`.

Protected routes add `requireAuth`, which verifies the JWT and loads the current user, and `requireRole('admin')` where needed.

## Data model

`backend/data/users.json`:

```json
{ "version": 1, "users": [] }
```

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID v4 |
| `email` | string | Trimmed, lowercased, unique |
| `name` | string | |
| `passwordHash` | string | bcrypt hash; never returned by the API |
| `role` | `user` \| `admin` | |
| `tokenVersion` | integer | Incremented on logout to revoke issued tokens |
| `createdAt`, `updatedAt` | string | ISO 8601 UTC |

## Storage

- **Concurrency:** every read and read-modify-write runs through one in-process promise queue, so operations never interleave. bcrypt hashing happens outside the queue so it does not block other requests.
- **Atomic writes:** data is written to a temporary file in the same directory, flushed with fsync, then renamed over `users.json`. A crash leaves the old file or the new file, never a partial one. Windows sharing errors on rename are retried briefly.
- **Missing file:** treated as an empty store; the file is created on the first write.
- **Corrupted file:** invalid JSON or an unexpected shape returns `503 STORAGE_UNAVAILABLE`. The file is never overwritten, so an operator can recover it.

## Authentication

- **Password hashing:** bcrypt, cost 12 (`BCRYPT_COST`, minimum 10 outside tests). Passwords over 72 bytes are rejected rather than silently truncated.
- **Login timing:** an unknown email still runs a bcrypt comparison against a dummy hash, built at startup, so response time does not reveal which emails exist.
- **JWT:** HS256 with the algorithm pinned on verification. Claims are `sub` (user id), `tv` (token version), `iat` and `exp`. Lifetime is 1 hour.
- **Secret:** `JWT_SECRET` must be at least 32 characters. The server refuses to start without it.
- **Middleware:** after verifying the signature, `requireAuth` loads the user and checks that `tv` matches `tokenVersion`. Deleted users, role changes and logouts therefore apply immediately.
- **Logout:** clears the cookie and increments `tokenVersion`, which ends all of that user's sessions. A per-session revocation list was rejected as extra persistence the POC does not need.

## Admin accounts

Registration always creates role `user`. If `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are set, the server creates that admin at startup when the email is not yet registered. It runs in the server process, so the file keeps a single writer. An existing account is left unchanged.

## Configuration

Set these in `backend/.env` (ignored by Git; see `backend/.env.example`).

| Variable | Required | Default |
|---|---|---|
| `JWT_SECRET` | Yes | None |
| `PORT` | No | `4000` |
| `NODE_ENV` | No | `development` |
| `CORS_ORIGINS` | No | `http://localhost:3000` (comma-separated) |
| `USERS_FILE` | No | `data/users.json`, relative to `backend/` |
| `BCRYPT_COST` | No | `12` |
| `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` | No | None |

## Running

From `backend/`:

```
npm install
cp .env.example .env    # then set JWT_SECRET
npm run dev             # http://localhost:4000
npm test
npm run build && npm start
```

Requires Node.js 22.12 or later.

## Decisions

OpenJev was consulted on four decisions. Its output is a recommendation; the final decisions follow.

| Decision | OpenJev recommended | Final | Reason |
|---|---|---|---|
| bcrypt cost | 12 (p=0.50) | 12 | Accepted |
| Storage concurrency | Lock file (p=0.83) | In-process queue with atomic rename | There is one writer process, so a lock adds a dependency and stale-lock handling without protecting anything further |
| JWT expiry | 15 minutes with refresh token (p=0.93) | 1 hour, no refresh | Refresh needs an endpoint and persisted token state outside the agreed contract |
| Auth middleware | Stateless claims (p=0.95) | Verify, then load user | A stale admin claim could otherwise last an hour; loading the user also enables real logout revocation |

HTTP-only cookies are a fixed requirement and were not evaluated.

## Known limitations

- No rate limiting or lockout on login.
- No password reset, email verification or profile editing.
- Logout ends all of a user's sessions, not just the current one.
- CSRF protection relies on the frontend and API being same-site.
- All operations are serialized and the whole file is rewritten on each change, so throughput is limited.
