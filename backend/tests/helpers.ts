import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import { createApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import { JsonUserStore } from '../src/services/userStore';

export const TEST_ORIGIN = 'http://localhost:3000';
export const TEST_SECRET = 'test-only-secret-at-least-32-characters-long';

export interface TestContext {
  app: Express;
  config: Config;
  store: JsonUserStore;
  usersFile: string;
  cleanup: () => Promise<void>;
}

export async function tempUsersFile(): Promise<{ file: string; cleanup: () => Promise<void> }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'um-test-'));
  return {
    file: path.join(directory, 'users.json'),
    cleanup: () => fs.rm(directory, { recursive: true, force: true }),
  };
}

export async function createTestContext(env: NodeJS.ProcessEnv = {}): Promise<TestContext> {
  const { file, cleanup } = await tempUsersFile();
  const config = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: TEST_SECRET,
    BCRYPT_COST: '4',
    CORS_ORIGINS: TEST_ORIGIN,
    USERS_FILE: file,
    ...env,
  });
  const store = new JsonUserStore(file);
  return { app: createApp({ config, store }), config, store, usersFile: file, cleanup };
}

/** Rewrites a stored user directly, standing in for an operator editing the file. */
export async function editUsersFile(
  usersFile: string,
  edit: (users: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
): Promise<void> {
  const data = JSON.parse(await fs.readFile(usersFile, 'utf8'));
  data.users = edit(data.users);
  await fs.writeFile(usersFile, JSON.stringify(data));
}
