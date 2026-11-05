import { describe, expect, it } from "vitest";
import { validateLogin, validateRegister } from "./validation";

const valid = { name: "Ada", email: "ada@example.com", password: "12345678" };

describe("validateRegister", () => {
  it("accepts input at the contract's limits", () => {
    expect(validateRegister(valid)).toEqual({});
    expect(
      validateRegister({ ...valid, name: "n".repeat(100), password: "p".repeat(72) }),
    ).toEqual({});
  });

  it("requires a name after trimming and caps it at 100 characters", () => {
    expect(validateRegister({ ...valid, name: "   " }).name).toBeDefined();
    expect(validateRegister({ ...valid, name: "n".repeat(101) }).name).toBeDefined();
    expect(validateRegister({ ...valid, name: ` ${"n".repeat(100)} ` })).toEqual({});
  });

  it("rejects malformed and overlong emails", () => {
    expect(validateRegister({ ...valid, email: "ada" }).email).toBeDefined();
    expect(
      validateRegister({ ...valid, email: `${"a".repeat(250)}@b.co` }).email,
    ).toBeDefined();
  });

  it("requires 8 characters", () => {
    expect(validateRegister({ ...valid, password: "1234567" }).password).toBeDefined();
  });

  it("measures the password limit in UTF-8 bytes, not characters", () => {
    // 25 characters at 3 bytes each is 75 bytes.
    expect(validateRegister({ ...valid, password: "€".repeat(25) }).password).toBeDefined();
    expect(validateRegister({ ...valid, password: "€".repeat(24) })).toEqual({});
  });
});

describe("validateLogin", () => {
  it("only requires a password to be present", () => {
    expect(validateLogin({ email: "ada@example.com", password: "x" })).toEqual({});
    expect(validateLogin({ email: "ada@example.com", password: "" }).password).toBeDefined();
  });
});
