# user_management frontend

Next.js (App Router), React and TypeScript. The API contract is in
[docs/user_management_api_specification.md](../docs/user_management_api_specification.md),
owned by the backend.

## Running

Requires Node.js 22.12 or later. Start the backend first (see
[the architecture document](../docs/user_management_architecture.md#running)), then:

```
npm install
cp .env.example .env.local
npm run dev             # http://localhost:3000
```

Open the app at `http://localhost:3000`, not `127.0.0.1`. The API allows that
origin only, and the session cookie must stay on the same hostname.

To see the admin People page, set `BOOTSTRAP_ADMIN_EMAIL` and
`BOOTSTRAP_ADMIN_PASSWORD` in your own `backend/.env`.

## Checks

```
npm run lint
npm run typecheck
npm test                # Vitest unit and component tests
npm run test:e2e        # Playwright, needs Chrome and backend dependencies installed
```

`test:e2e` builds the frontend and starts the real backend with a temporary user
file and generated secrets. Ports 3000 and 4000 must be free.

## Layout

```
src/
  proxy.ts            Redirects requests with no session cookie
  app/
    (public)/         /login, /register
    (protected)/      /dashboard, /users (admin)
  context/            AuthContext: current user and session lifecycle
  components/         Forms, navigation, guards
  lib/api/            core.ts (shared), client.ts (browser), server.ts (server only)
  lib/auth/           Redirect helpers, cookie name
  lib/validation.ts   Client-side copies of the API's input rules
e2e/                  Browser tests against the real backend
```

## Authentication

The session is the API's `um_session` HTTP-only cookie. JavaScript can't read it,
and nothing is kept in `localStorage`. Three layers cover protected pages, and
only the API's answer counts as authorization:

1. `proxy.ts` redirects when there is no cookie. This is a fast path, not a check.
2. Each protected page calls `requireUser`, which forwards the cookie to
   `GET /api/auth/me` during the server render.
3. `AuthContext` rechecks on navigation, on tab focus and every minute.
   `RequireAuth` removes the page as soon as the session is known to be over.

Any 401 other than `INVALID_CREDENTIALS` ends the session. A network failure or
503 doesn't: the page shows an error and the user stays signed in.

Check a session with the API on every server render. Don't redirect away from
`/login` in `proxy.ts` because a cookie exists, or a revoked cookie will cause a
redirect loop.
