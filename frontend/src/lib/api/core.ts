import type { FieldErrorDetail } from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Codes from the API contract, plus two for failures that never reach it. */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_JSON"
  | "INVALID_CREDENTIALS"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CSRF_ORIGIN_REJECTED"
  | "NOT_FOUND"
  | "EMAIL_ALREADY_EXISTS"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR"
  | "STORAGE_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "UNEXPECTED_RESPONSE";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: FieldErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: {
    code?: ApiErrorCode;
    message?: string;
    details?: FieldErrorDetail[];
  };
}

/** The contract treats every 401 except a failed login as an ended session. */
export function isSessionEnded(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 401 &&
    error.code !== "INVALID_CREDENTIALS"
  );
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "The API could not be reached");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = (body as ErrorBody | undefined)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "UNEXPECTED_RESPONSE",
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }

  if (body === undefined) {
    throw new ApiError(
      response.status,
      "UNEXPECTED_RESPONSE",
      "The API returned an unreadable response",
    );
  }

  return body as T;
}

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  INVALID_CREDENTIALS:
    "That email and password don't match. Check them and try again.",
  EMAIL_ALREADY_EXISTS: "This email already has an account.",
  VALIDATION_ERROR: "Check the highlighted fields and try again.",
  NETWORK_ERROR:
    "The server can't be reached. Check your connection and try again.",
  STORAGE_UNAVAILABLE:
    "Account storage is unavailable. Contact an administrator.",
  CSRF_ORIGIN_REJECTED:
    "This site isn't allowed to make that request. Contact an administrator.",
  FORBIDDEN: "Your account doesn't have access to this.",
  UNAUTHENTICATED: "Your session has ended. Sign in again.",
};

/** User-facing text for an error, chosen by code and never by API message text. */
export function errorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    (code && MESSAGES[code]) ?? "Something went wrong on the server. Try again."
  );
}
