import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e-password-1";
const API = "http://localhost:4000";

function newEmail() {
  return `e2e-${randomUUID()}@example.com`;
}

async function register(page: Page, email = newEmail(), name = "Ada Lovelace") {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/dashboard");
  return email;
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("a signed-out visitor is sent to login and returned afterwards", async ({ page }) => {
  const email = await register(page);
  await page.context().clearCookies();

  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard");

  await signIn(page, email);
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();
});

test("registering signs in with an HTTP-only cookie and stores no token in the page", async ({
  page,
  context,
}) => {
  const email = await register(page);

  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  const session = (await context.cookies()).find((c) => c.name === "um_session");
  expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });

  const visibleToScripts = await page.evaluate(() => ({
    cookie: document.cookie,
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage),
  }));
  expect(visibleToScripts.cookie).not.toContain("um_session");
  expect(visibleToScripts.local).toBe("{}");
  expect(visibleToScripts.session).toBe("{}");
});

test("the session survives a reload and is rendered on the server", async ({ page }) => {
  await register(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toBeVisible();

  const html = await (await page.request.get("/dashboard")).text();
  expect(html).toContain("Ada Lovelace");
});

test("sign out ends the session and the back button can't reveal it", async ({ page, context }) => {
  await register(page);
  // Registering replaces history, so add an entry for the back button to return to.
  await page.goto("/dashboard?visit=1");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByText("Your session ended")).toHaveCount(0);
  expect((await context.cookies()).some((c) => c.name === "um_session")).toBe(false);

  await page.goBack();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Ada Lovelace" })).toHaveCount(0);
});

test("a signed-in user visiting login goes to the dashboard", async ({ page }) => {
  await register(page);
  await page.goto("/login");
  await expect(page).toHaveURL("/dashboard");
});

test("the root path routes by session", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/login");
  await register(page);
  await page.goto("/");
  await expect(page).toHaveURL("/dashboard");
});

test("wrong credentials show an error and stay on login", async ({ page }) => {
  const email = await register(page);
  await page.context().clearCookies();
  await page.goto("/login");

  await signIn(page, email, "not-the-password");

  await expect(page.locator(".notice-error")).toContainText("don't match");
  await expect(page).toHaveURL("/login");
});

test("a taken email is reported on the email field", async ({ browser, page }) => {
  const email = await register(page);

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await other.goto("/register");
  await other.getByLabel("Name").fill("Someone Else");
  await other.getByLabel("Email").fill(email);
  await other.getByLabel("Password").fill(PASSWORD);
  await other.getByRole("button", { name: "Create account" }).click();

  await expect(other.getByText("This email already has an account.")).toBeVisible();
  await expect(other.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  await otherContext.close();
});

test("invalid input is stopped before it reaches the API", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(API) && request.method() === "POST") calls.push(request.url());
  });

  await page.goto("/register");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Enter your name.")).toBeVisible();
  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
  expect(calls).toEqual([]);
});

test("a session revoked elsewhere ends in this tab without a redirect loop", async ({
  browser,
  page,
}) => {
  const email = await register(page);

  const secondContext = await browser.newContext();
  const second = await secondContext.newPage();
  await second.goto("/login");
  await signIn(second, email);
  await expect(second).toHaveURL("/dashboard");

  // Logout revokes every token for the user, so `second` now holds a dead cookie.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");

  await second.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(second).toHaveURL("/login?next=%2Fdashboard&reason=expired");
  await expect(second.getByRole("status")).toContainText("Your session ended");
  await expect(second.getByRole("heading", { name: "Ada Lovelace" })).toHaveCount(0);

  // The dead cookie is still present. A full load must verify it, then stop at login.
  expect((await secondContext.cookies()).some((c) => c.name === "um_session")).toBe(true);
  await second.goto("/dashboard");
  await expect(second).toHaveURL("/login?next=%2Fdashboard&reason=expired");
  await second.goto("/login");
  await expect(second).toHaveURL("/login");

  await signIn(second, email);
  await expect(second).toHaveURL("/dashboard");
  await secondContext.close();
});

test("a forged session cookie is rejected by the API, not trusted", async ({ page, context }) => {
  await context.addCookies([
    { name: "um_session", value: "forged.token.value", domain: "localhost", path: "/" },
  ]);
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard&reason=expired");
});

test("an external next parameter can't redirect after sign-in", async ({ page }) => {
  const email = await register(page);
  await page.context().clearCookies();

  await page.goto("/login?next=//evil.example/");
  await signIn(page, email);

  await expect(page).toHaveURL("/dashboard");
});

test("an unreachable API shows an error on the form", async ({ page }) => {
  await page.route(`${API}/api/auth/login`, (route) => route.abort());
  await page.goto("/login");

  await signIn(page, "ada@example.com");

  await expect(page.locator(".notice-error")).toContainText("can't be reached");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("a failed sign-out leaves the user signed in and says so", async ({ page }) => {
  await register(page);
  await page.route(`${API}/api/auth/logout`, (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "http://localhost:3000",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({ error: { code: "STORAGE_UNAVAILABLE", message: "x" } }),
    }),
  );

  await page.getByRole("button", { name: "Sign out" }).click();

  await expect(page.locator(".notice-error")).toContainText("Account storage is unavailable");
  await expect(page).toHaveURL("/dashboard");
});

test.describe("administration", () => {
  test("a member can't see the people list", async ({ page }) => {
    await register(page);
    await expect(page.getByRole("link", { name: "People" })).toHaveCount(0);

    await page.goto("/users");

    await expect(
      page.getByRole("heading", { name: "You don't have access to this page" }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  });

  test("an admin can see the people list", async ({ page }) => {
    const member = await register(page, newEmail(), "Listed Member");
    await page.context().clearCookies();

    await page.goto("/login");
    await signIn(page, process.env.E2E_ADMIN_EMAIL!, process.env.E2E_ADMIN_PASSWORD!);
    await expect(page).toHaveURL("/dashboard");
    await expect(page.locator(".pass-role")).toHaveText("Administrator");

    await page.getByRole("link", { name: "People", exact: true }).click();

    await expect(page).toHaveURL("/users");
    const table = page.getByRole("table");
    await expect(table.getByText(process.env.E2E_ADMIN_EMAIL!)).toBeVisible();
    await expect(table.getByText(member)).toBeVisible();
  });
});

test.describe("responsive layout", () => {
  for (const [name, width] of [
    ["phone", 360],
    ["tablet", 768],
    ["desktop", 1280],
  ] as const) {
    test(`no horizontal scroll at ${name} width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });

      const fits = () =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        );

      await page.goto("/login");
      expect(await fits()).toBe(true);
      await register(page, newEmail(), "A Very Long Name That Should Wrap Instead Of Overflowing");
      expect(await fits()).toBe(true);
      await page.screenshot({ path: `test-results/screens/dashboard-${name}.png` });
    });
  }
});
