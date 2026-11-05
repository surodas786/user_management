import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/core";
import { LoginForm } from "./LoginForm";
import { RegisterForm } from "./RegisterForm";

const auth = vi.hoisted(() => ({ login: vi.fn(), register: vi.fn() }));
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  auth.login.mockReset();
  auth.register.mockReset();
  router.replace.mockClear();
  router.refresh.mockClear();
});

async function fillLogin(email: string, password: string) {
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

async function fillRegister(name: string, email: string, password: string) {
  await userEvent.type(screen.getByLabelText("Name"), name);
  await userEvent.type(screen.getByLabelText("Email"), email);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
}

describe("LoginForm", () => {
  it("shows field errors without calling the API", async () => {
    render(<LoginForm next="/dashboard" expired={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Email")).toHaveAccessibleDescription("Enter your email address.");
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("signs in with a trimmed email and continues to next", async () => {
    auth.login.mockResolvedValue({});
    render(<LoginForm next="/users" expired={false} />);

    await fillLogin(" ada@example.com ", " pass word ");

    expect(auth.login).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: " pass word ",
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/users"));
  });

  it("explains wrong credentials and allows a retry", async () => {
    auth.login.mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "x"));
    render(<LoginForm next="/dashboard" expired={false} />);

    await fillLogin("ada@example.com", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows pending state and blocks a double submit", async () => {
    auth.login.mockReturnValue(new Promise(() => {}));
    render(<LoginForm next="/dashboard" expired={false} />);

    await fillLogin("ada@example.com", "secret");

    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    expect(auth.login).toHaveBeenCalledOnce();
  });

  it("says why the user is back at login", () => {
    render(<LoginForm next="/dashboard" expired />);
    expect(screen.getByRole("status")).toHaveTextContent("Your session ended");
  });

  it("reports an unreachable server", async () => {
    auth.login.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "x"));
    render(<LoginForm next="/dashboard" expired={false} />);

    await fillLogin("ada@example.com", "secret");

    expect(await screen.findByRole("alert")).toHaveTextContent("can't be reached");
  });
});

describe("RegisterForm", () => {
  it("validates before calling the API", async () => {
    render(<RegisterForm next="/dashboard" />);

    await fillRegister("Ada", "ada@example.com", "short");

    expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it("sends only the contract's fields and continues, as registration signs in", async () => {
    auth.register.mockResolvedValue({});
    render(<RegisterForm next="/dashboard" />);

    await fillRegister(" Ada ", "ada@example.com", "long enough");

    expect(auth.register).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.com",
      password: "long enough",
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("puts a taken email on the email field", async () => {
    auth.register.mockRejectedValue(new ApiError(409, "EMAIL_ALREADY_EXISTS", "x"));
    render(<RegisterForm next="/dashboard" />);

    await fillRegister("Ada", "ada@example.com", "long enough");

    expect(await screen.findByText("This email already has an account.")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });

  it("maps the API's validation details onto fields", async () => {
    auth.register.mockRejectedValue(
      new ApiError(400, "VALIDATION_ERROR", "x", [
        { field: "email", message: "Invalid email address" },
      ]),
    );
    render(<RegisterForm next="/dashboard" />);

    await fillRegister("Ada", "ada@example.com", "long enough");

    expect(await screen.findByText("Invalid email address")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Check the highlighted fields");
  });
});
