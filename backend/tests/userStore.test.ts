import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonUserStore, type NewUser } from '../src/services/userStore';
import { tempUsersFile } from './helpers';

function newUser(email: string): NewUser {
  return { email, name: 'Test', passwordHash: 'hash', role: 'user' };
}

describe('JsonUserStore', () => {
  let file: string;
  let cleanup: () => Promise<void>;
  let store: JsonUserStore;

  beforeEach(async () => {
    ({ file, cleanup } = await tempUsersFile());
    store = new JsonUserStore(file);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  it('should_return_empty_list_when_file_is_missing', async () => {
    await expect(store.list()).resolves.toEqual([]);
  });

  it('should_create_file_and_parent_directory_when_first_user_is_saved', async () => {
    const nested = path.join(path.dirname(file), 'nested', 'users.json');
    await new JsonUserStore(nested).create(newUser('a@example.com'));

    const saved = JSON.parse(await fs.readFile(nested, 'utf8'));
    expect(saved.version).toBe(1);
    expect(saved.users).toHaveLength(1);
  });

  it('should_persist_user_when_read_by_a_new_store_instance', async () => {
    const created = await store.create(newUser('a@example.com'));
    await expect(new JsonUserStore(file).findById(created.id)).resolves.toEqual(created);
  });

  it('should_reject_when_email_already_exists', async () => {
    await store.create(newUser('a@example.com'));
    await expect(store.create(newUser('a@example.com'))).rejects.toMatchObject({
      code: 'EMAIL_ALREADY_EXISTS',
    });
  });

  it('should_keep_every_user_when_creates_run_concurrently', async () => {
    const emails = Array.from({ length: 50 }, (_, i) => `user${i}@example.com`);
    await Promise.all(emails.map((email) => store.create(newUser(email))));

    const users = await store.list();
    expect(users.map((u) => u.email).sort()).toEqual([...emails].sort());
  });

  it('should_create_one_user_when_same_email_is_registered_concurrently', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => store.create(newUser('same@example.com'))),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it('should_not_lose_increments_when_revocations_run_concurrently', async () => {
    const user = await store.create(newUser('a@example.com'));
    await Promise.all(Array.from({ length: 20 }, () => store.revokeTokens(user.id)));

    expect((await store.findById(user.id))?.tokenVersion).toBe(20);
  });

  it('should_leave_no_temp_files_when_writes_succeed', async () => {
    await store.create(newUser('a@example.com'));
    await expect(fs.readdir(path.dirname(file))).resolves.toEqual(['users.json']);
  });

  it.each([
    ['invalid JSON', '{ not json'],
    ['truncated JSON', '{"version":1,"users":['],
    ['wrong shape', '{"users":"nope"}'],
    ['unknown version', '{"version":2,"users":[]}'],
    ['malformed user', '{"version":1,"users":[{"id":"x"}]}'],
  ])('should_fail_and_preserve_file_when_content_is_%s', async (_label, content) => {
    await fs.writeFile(file, content);

    await expect(store.list()).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });
    await expect(store.create(newUser('a@example.com'))).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
    });
    await expect(fs.readFile(file, 'utf8')).resolves.toBe(content);
  });

  it('should_keep_original_file_and_remove_temp_when_rename_fails', async () => {
    await store.create(newUser('a@example.com'));
    const before = await fs.readFile(file, 'utf8');
    vi.spyOn(fs, 'rename').mockRejectedValue(
      Object.assign(new Error('disk failure'), { code: 'EIO' }),
    );

    await expect(store.create(newUser('b@example.com'))).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
    });

    await expect(fs.readFile(file, 'utf8')).resolves.toBe(before);
    await expect(fs.readdir(path.dirname(file))).resolves.toEqual(['users.json']);
  });

  it('should_retry_rename_when_windows_reports_a_transient_sharing_error', async () => {
    const realRename = fs.rename.bind(fs);
    const rename = vi
      .spyOn(fs, 'rename')
      .mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'EPERM' }))
      .mockImplementation(realRename);

    await store.create(newUser('a@example.com'));

    expect(rename).toHaveBeenCalledTimes(2);
    await expect(store.list()).resolves.toHaveLength(1);
  });

  it('should_keep_processing_when_an_earlier_operation_failed', async () => {
    await store.create(newUser('a@example.com'));
    await expect(store.create(newUser('a@example.com'))).rejects.toBeDefined();

    await expect(store.create(newUser('b@example.com'))).resolves.toBeDefined();
  });
});
