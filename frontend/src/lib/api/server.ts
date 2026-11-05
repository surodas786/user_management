import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loginUrl } from "@/lib/auth/redirect";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { ApiError, apiRequest, isSessionEnded } from "./core";
import type { User, UserListResponse, UserResponse } from "./types";

const REQUEST_TIMEOUT_MS = 5000;

export type Session =
  | { status: "authenticated"; user: User }
  | { status: "anonymous" }
  | { status: "unavailable"; error: unknown };

/** credentials: 'include' only applies in browsers, so the cookie is forwarded here. */
async function serverRequest<T>(path: string): Promise<T> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return apiRequest<T>(path, {
    headers: token ? { Cookie: `${SESSION_COOKIE}=${token}` } : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** Asks the API who is signed in. Cached per request, so layouts and pages share one call. */
export const getSession = cache(async (): Promise<Session> => {
  if (!(await cookies()).has(SESSION_COOKIE)) {
    return { status: "anonymous" };
  }
  try {
    const { user } = await serverRequest<UserResponse>("/api/auth/me");
    return { status: "authenticated", user };
  } catch (error) {
    return isSessionEnded(error)
      ? { status: "anonymous" }
      : { status: "unavailable", error };
  }
});

/**
 * Authorizes a page render. A session the API rejects goes to login; an API
 * outage is thrown to the error boundary so it isn't reported as signed out.
 */
export async function requireUser(path: string): Promise<User> {
  const session = await getSession();
  if (session.status === "authenticated") {
    return session.user;
  }
  if (session.status === "unavailable") {
    throw session.error;
  }
  redirect(loginUrl({ next: path, reason: "expired" }));
}

export type UserListResult =
  | { status: "ok"; users: User[]; total: number }
  | { status: "forbidden" };

/** The API enforces the admin role; this only reports what it decided. */
export async function listUsers(path: string): Promise<UserListResult> {
  let result: UserListResponse;
  try {
    result = await serverRequest<UserListResponse>("/api/users");
  } catch (error) {
    if (isSessionEnded(error)) {
      redirect(loginUrl({ next: path, reason: "expired" }));
    }
    if (error instanceof ApiError && error.code === "FORBIDDEN") {
      return { status: "forbidden" };
    }
    throw error;
  }
  return { status: "ok", users: result.users, total: result.total };
}
