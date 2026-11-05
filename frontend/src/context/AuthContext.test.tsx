import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAuth } from "@/components/RequireAuth";
import { authApi } from "@/lib/api/client";
import { ApiError } from "@/lib/api/core";
import type { User } from "@/lib/api/types";
import { AuthProvider, useAuth } from "./AuthContext";

const nav = vi.hoisted(() => ({ replace: vi.fn(), pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace }),
}));

const ada: User = {
  id: "1",
  email: "ada@example.com",
  name: "Ada",
  role: "user",
  createdAt: "2026-11-04T12:00:00.000Z",
  updatedAt: "2026-11-04T12:00:00.000Z",
};

function Probe() {
  const { user, logout } = useAuth();
  return (
    <>
      <p data-testid="user">
        {user === undefined ? "unknown" : user === null ? "signed out" : user.name}
      </p>
      <button onClick={() => void logout().catch(() => undefined)}>Sign out</button>
    </>
  );
}

function renderApp(initialUser: User | null | undefined) {
  return render(
    <AuthProvider initialUser={initialUser}>
      <Probe />
      <RequireAuth>
        <p>Protected content</p>
      </RequireAuth>
    </AuthProvider>,
  );
}

const shown = () => screen.getByTestId("user").textContent;
const networkError = () => new ApiError(0, "NETWORK_ERROR", "down");

/** Makes the API reject the session, going through the real client's 401 path. */
function mockSessionEnded() {
  vi.mocked(authApi.me).mockRestore();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "x" } }),
          { status: 401 },
        ),
    ),
  );
}

beforeEach(() => {
  nav.replace.mockClear();
  nav.pathname = "/dashboard";
  vi.spyOn(authApi, "me").mockResolvedValue(ada);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("restoring the session", () => {
  it("shows the server-verified user at once, with no flash of signed-out UI", () => {
    renderApp(ada);
    expect(shown()).toBe("Ada");
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("fetches the user when the server could not tell", async () => {
    renderApp(undefined);
    expect(shown()).toBe("unknown");
    await waitFor(() => expect(shown()).toBe("Ada"));
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("does not call the API when known to be signed out", () => {
    renderApp(null);
    expect(authApi.me).not.toHaveBeenCalled();
  });

  it("picks up a role change on revalidation", async () => {
    vi.spyOn(authApi, "me").mockResolvedValue({ ...ada, name: "Ada L" });
    renderApp(ada);
    await waitFor(() => expect(shown()).toBe("Ada L"));
  });
});

describe("session expiry", () => {
  it("removes protected content and redirects with the return path", async () => {
    mockSessionEnded();
    renderApp(ada);

    await waitFor(() => expect(shown()).toBe("signed out"));

    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith("/login?next=%2Fdashboard&reason=expired");
  });

  it("rechecks when the tab regains focus", async () => {
    renderApp(ada);
    await waitFor(() => expect(authApi.me).toHaveBeenCalledTimes(1));

    mockSessionEnded();
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(shown()).toBe("signed out"));
  });

  it("keeps the user signed in through an outage", async () => {
    vi.spyOn(authApi, "me").mockRejectedValue(networkError());
    renderApp(ada);

    await waitFor(() => expect(authApi.me).toHaveBeenCalled());
    await act(async () => {});

    expect(shown()).toBe("Ada");
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("doesn't call an outage signed out, so the page's error stays visible", async () => {
    vi.spyOn(authApi, "me").mockRejectedValue(networkError());
    renderApp(undefined);

    await waitFor(() => expect(authApi.me).toHaveBeenCalled());
    await act(async () => {});

    expect(shown()).toBe("unknown");
    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("treats a rejected cookie from the server render as expired", () => {
    renderApp(null);
    expect(nav.replace).toHaveBeenCalledWith("/login?next=%2Fdashboard&reason=expired");
  });
});

describe("logout", () => {
  it("clears the user and goes to login with no expiry notice", async () => {
    vi.spyOn(authApi, "logout").mockResolvedValue();
    renderApp(ada);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(shown()).toBe("signed out"));
    expect(nav.replace).toHaveBeenCalledExactlyOnceWith("/login");
  });

  it("stays signed in if the API refuses, because the cookie still works", async () => {
    vi.spyOn(authApi, "logout").mockRejectedValue(
      new ApiError(503, "STORAGE_UNAVAILABLE", "x"),
    );
    renderApp(ada);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(async () => {});

    expect(shown()).toBe("Ada");
  });

  it("ignores a revalidation that finishes after sign-out", async () => {
    let finishMe: (user: User) => void = () => {};
    vi.spyOn(authApi, "me").mockReturnValue(
      new Promise((resolve) => {
        finishMe = resolve;
      }),
    );
    vi.spyOn(authApi, "logout").mockResolvedValue();
    renderApp(ada);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(shown()).toBe("signed out"));
    await act(async () => finishMe(ada));

    expect(shown()).toBe("signed out");
  });
});

it("useAuth fails loudly outside the provider", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<Probe />)).toThrow("useAuth must be used inside AuthProvider");
});
