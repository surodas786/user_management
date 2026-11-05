import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: undefined as string | undefined,
  redirect: vi.fn((url: string): never => {
    throw new Error(`REDIRECT ${url}`);
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "um_session" && mocks.token ? { value: mocks.token } : undefined,
    has: (name: string) => name === "um_session" && Boolean(mocks.token),
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
// React's cache() only memoizes inside a server render, so it is a pass-through here.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));

import { getSession, listUsers, requireUser } from "./server";

const user = { id: "1", email: "a@b.co", name: "A", role: "user" };
const fetchMock = vi.fn<typeof fetch>();

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

const unauthenticated = () => respond(401, { error: { code: "UNAUTHENTICATED", message: "x" } });

beforeEach(() => {
  mocks.token = "signed.jwt.value";
  mocks.redirect.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getSession", () => {
  it("skips the API when there is no cookie", async () => {
    mocks.token = undefined;
    await expect(getSession()).resolves.toEqual({ status: "anonymous" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only the session cookie", async () => {
    fetchMock.mockResolvedValue(respond(200, { user }));

    await expect(getSession()).resolves.toEqual({ status: "authenticated", user });

    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({
      Cookie: "um_session=signed.jwt.value",
    });
  });

  it("treats a rejected cookie as signed out", async () => {
    fetchMock.mockResolvedValue(unauthenticated());
    await expect(getSession()).resolves.toEqual({ status: "anonymous" });
  });

  it("keeps an outage distinct from signed out", async () => {
    fetchMock.mockResolvedValue(
      respond(503, { error: { code: "STORAGE_UNAVAILABLE", message: "x" } }),
    );
    await expect(getSession()).resolves.toMatchObject({ status: "unavailable" });
  });
});

describe("requireUser", () => {
  it("returns the verified user", async () => {
    fetchMock.mockResolvedValue(respond(200, { user }));
    await expect(requireUser("/dashboard")).resolves.toEqual(user);
  });

  it("sends a rejected session to login with the return path", async () => {
    fetchMock.mockResolvedValue(unauthenticated());
    await expect(requireUser("/dashboard")).rejects.toThrow(
      "REDIRECT /login?next=%2Fdashboard&reason=expired",
    );
  });

  it("throws an outage to the error boundary instead of redirecting", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(requireUser("/dashboard")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("listUsers", () => {
  it("returns the list", async () => {
    fetchMock.mockResolvedValue(respond(200, { users: [user], total: 1 }));
    await expect(listUsers("/users")).resolves.toEqual({
      status: "ok",
      users: [user],
      total: 1,
    });
  });

  it("reports the API's 403", async () => {
    fetchMock.mockResolvedValue(respond(403, { error: { code: "FORBIDDEN", message: "x" } }));
    await expect(listUsers("/users")).resolves.toEqual({ status: "forbidden" });
  });

  it("redirects on 401", async () => {
    fetchMock.mockResolvedValue(unauthenticated());
    await expect(listUsers("/users")).rejects.toThrow("REDIRECT /login");
  });

  it("rethrows other failures", async () => {
    fetchMock.mockResolvedValue(
      respond(503, { error: { code: "STORAGE_UNAVAILABLE", message: "x" } }),
    );
    await expect(listUsers("/users")).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
  });
});
