export const DEFAULT_SIGNED_IN_PATH = "/dashboard";

/**
 * Returns a same-site path to continue to after sign-in. `next` comes from the
 * URL, so anything that could leave this origin falls back to the default.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return DEFAULT_SIGNED_IN_PATH;
  }
  // Browsers treat backslashes as slashes and drop tabs and newlines in URLs.
  if (value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) {
    return DEFAULT_SIGNED_IN_PATH;
  }
  return value;
}

export function loginUrl({
  next,
  reason,
}: {
  next?: string;
  reason?: "expired";
} = {}): string {
  const params = new URLSearchParams();
  if (next) params.set("next", next);
  if (reason) params.set("reason", reason);
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}
