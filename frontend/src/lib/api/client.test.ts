import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authApi, setSessionEndedHandler } from "./client";
import { API_BASE_URL, ApiError, errorMessage } from "./core";

const user = { id: "1", email: "a@b.co", name: "A", role: "user" };

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function apiError(code: string, extra: object = {}) {
  return { error: { code, message: "ignored by the UI", ...extra } };
}

const fetchMock = vi.fn<typeof fetch>();
const onEnded = vi.fn();
let unsubscribe: () => void;

beforeEach(() => {
  fetchMock.mockReset();
  onEnded.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  unsubscribe = setSessionEndedHandler(onEnded);
});

afterEach(() => {
  unsubscribe();
  vi.unstubAllGlobals();
});

describe("requests", () => {
  it("sends credentials and JSON on login", async () => {
    fetchMock.mockResolvedValue(respond(200, { user }));

    await expect(authApi.login({ email: "a@b.co", password: "x" })).resolves.toEqual(user);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/auth/login`);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    expect(JSON.parse(init?.body as string)).toEqual({ email: "a@b.co", password: "x" });
  });

  it("sends credentials on me", async () => {
    fetchMock.mockResolvedValue(respond(200, { user }));
    await authApi.me();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("posts logout with no body and accepts 204", async () => {
    fetchMock.mockResolvedValue(respond(204));
    await expect(authApi.logout()).resolves.toBeUndefined();
    const init = fetchMock.mock.calls[0][1];
    expect(init?.body).toBeUndefined();
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
  });
});

describe("errors", () => {
  it("exposes the contract's code and details", async () => {
    const details = [{ field: "email", message: "Invalid email address" }];
    fetchMock.mockResolvedValue(respond(400, apiError("VALIDATION_ERROR", { details })));

    const error = await authApi.register({ name: "A", email: "x", password: "y" }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "VALIDATION_ERROR", details });
  });

  it("reports an unreachable API as a network error, not as signed out", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(authApi.me()).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 });
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("survives a non-JSON error body", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(authApi.me()).rejects.toMatchObject({ code: "UNEXPECTED_RESPONSE", status: 502 });
  });

  it("chooses user text by code, never from the API's message", () => {
    const error = new ApiError(503, "STORAGE_UNAVAILABLE", "internal detail");
    expect(errorMessage(error)).not.toContain("internal detail");
    expect(errorMessage(new Error("boom"))).not.toContain("boom");
  });
});

describe("session expiry", () => {
  it("announces an ended session on a 401", async () => {
    fetchMock.mockResolvedValue(respond(401, apiError("UNAUTHENTICATED")));
    await expect(authApi.me()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("does not treat a failed login as an ended session", async () => {
    fetchMock.mockResolvedValue(respond(401, apiError("INVALID_CREDENTIALS")));
    await expect(authApi.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    expect(onEnded).not.toHaveBeenCalled();
  });

  it.each([403, 409, 500, 503])("ignores status %i", async (status) => {
    fetchMock.mockResolvedValue(respond(status, apiError("INTERNAL_ERROR")));
    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError);
    expect(onEnded).not.toHaveBeenCalled();
  });
});
