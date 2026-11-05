import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("proxy", () => {
  it("redirects to login and keeps the path and query", () => {
    const response = proxy(request("/users?page=2"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fusers%3Fpage%3D2",
    );
  });

  it("lets a request with a session cookie reach the page, which verifies it", () => {
    const response = proxy(request("/dashboard", "um_session=anything"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("ignores unrelated cookies", () => {
    expect(proxy(request("/dashboard", "other=1")).status).toBe(307);
  });
});
