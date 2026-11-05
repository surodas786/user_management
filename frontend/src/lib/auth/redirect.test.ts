import { describe, expect, it } from "vitest";
import { DEFAULT_SIGNED_IN_PATH, loginUrl, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each(["/dashboard", "/users?page=2", "/a/b#c"])("keeps %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    undefined,
    ["/users"],
    "",
    "dashboard",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "javascript:alert(1)",
  ])("rejects %j", (value) => {
    expect(safeNextPath(value)).toBe(DEFAULT_SIGNED_IN_PATH);
  });
});

describe("loginUrl", () => {
  it("has no query by default", () => {
    expect(loginUrl()).toBe("/login");
  });

  it("encodes the return path and reason", () => {
    expect(loginUrl({ next: "/users?a=1&b=2", reason: "expired" })).toBe(
      "/login?next=%2Fusers%3Fa%3D1%26b%3D2&reason=expired",
    );
  });
});
