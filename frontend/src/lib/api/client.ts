import { apiRequest, isSessionEnded } from "./core";
import type { LoginInput, RegisterInput, User, UserResponse } from "./types";

type SessionEndedHandler = () => void;

let onSessionEnded: SessionEndedHandler | undefined;

/** Registers the single listener told about any ended session. Returns an unsubscribe. */
export function setSessionEndedHandler(handler: SessionEndedHandler) {
  onSessionEnded = handler;
  return () => {
    if (onSessionEnded === handler) {
      onSessionEnded = undefined;
    }
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await apiRequest<T>(path, { ...init, credentials: "include" });
  } catch (error) {
    if (isSessionEnded(error)) {
      onSessionEnded?.();
    }
    throw error;
  }
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
}

export const authApi = {
  async register(input: RegisterInput): Promise<User> {
    return (await post<UserResponse>("/api/auth/register", input)).user;
  },
  async login(input: LoginInput): Promise<User> {
    return (await post<UserResponse>("/api/auth/login", input)).user;
  },
  async me(): Promise<User> {
    return (await request<UserResponse>("/api/auth/me")).user;
  },
  logout(): Promise<void> {
    return post<void>("/api/auth/logout");
  },
};
