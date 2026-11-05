import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Runs the production frontend against the real backend. Everything is
 * generated per run and kept in the process environment, so no backend/.env or
 * real user data is touched. Workers inherit these values.
 */
process.env.E2E_ADMIN_EMAIL ??= "e2e-admin@example.com";
process.env.E2E_ADMIN_PASSWORD ??= randomBytes(18).toString("base64url");
process.env.E2E_JWT_SECRET ??= randomBytes(48).toString("base64url");
process.env.E2E_USERS_FILE ??= path.join(
  mkdtempSync(path.join(tmpdir(), "um-e2e-")),
  "users.json",
);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  globalTimeout: 240_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev",
      cwd: path.resolve(__dirname, "../backend"),
      url: "http://localhost:4000/api/auth/me",
      reuseExistingServer: false,
      env: {
        JWT_SECRET: process.env.E2E_JWT_SECRET,
        USERS_FILE: process.env.E2E_USERS_FILE,
        BCRYPT_COST: "10",
        BOOTSTRAP_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL,
        BOOTSTRAP_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD,
      },
    },
    {
      command: "npm run build && npm run start",
      url: "http://localhost:3000/login",
      timeout: 180_000,
      reuseExistingServer: false,
    },
  ],
});
