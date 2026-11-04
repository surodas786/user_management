import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { AppError, storageUnavailable } from '../errors';
import type { Role, User } from '../types';

const FILE_VERSION = 1;
const RENAME_RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_DELAY_MS = 20;

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  name: z.string(),
  passwordHash: z.string().min(1),
  role: z.enum(['user', 'admin']),
  tokenVersion: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const fileSchema = z.object({
  version: z.literal(FILE_VERSION),
  users: z.array(userSchema),
});

type UsersFile = z.infer<typeof fileSchema>;

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/**
 * JSON file user store for a single Node process.
 *
 * Every operation runs through one promise queue, so a read-modify-write can
 * never interleave with another. Multiple processes are not protected.
 */
export class JsonUserStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  findById(id: string): Promise<User | undefined> {
    return this.enqueue(async () => (await this.read()).users.find((u) => u.id === id));
  }

  findByEmail(email: string): Promise<User | undefined> {
    return this.enqueue(async () => (await this.read()).users.find((u) => u.email === email));
  }

  list(): Promise<User[]> {
    return this.enqueue(async () => (await this.read()).users);
  }

  create(input: NewUser): Promise<User> {
    return this.enqueue(async () => {
      const data = await this.read();
      if (data.users.some((u) => u.email === input.email)) {
        throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Email is already registered');
      }

      const now = new Date().toISOString();
      const user: User = {
        ...input,
        id: randomUUID(),
        tokenVersion: 0,
        createdAt: now,
        updatedAt: now,
      };
      data.users.push(user);
      await this.write(data);
      return user;
    });
  }

  /** Revokes every token issued to the user. */
  revokeTokens(id: string): Promise<void> {
    return this.enqueue(async () => {
      const data = await this.read();
      const user = data.users.find((u) => u.id === id);
      if (!user) {
        return;
      }
      user.tokenVersion += 1;
      user.updatedAt = new Date().toISOString();
      await this.write(data);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    // A failed operation must not block the ones behind it.
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<UsersFile> {
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath, 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return { version: FILE_VERSION, users: [] };
      }
      throw storageUnavailable(error);
    }

    try {
      return fileSchema.parse(JSON.parse(raw));
    } catch (error) {
      // Never fall back to an empty store here: the next write would destroy the file.
      throw storageUnavailable(error);
    }
  }

  private async write(data: UsersFile): Promise<void> {
    const directory = path.dirname(this.filePath);
    const tempPath = `${this.filePath}.${randomUUID()}.tmp`;

    try {
      await fs.mkdir(directory, { recursive: true });

      const handle = await fs.open(tempPath, 'wx', 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }

      await this.renameWithRetry(tempPath);
      await this.syncDirectory(directory);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      throw storageUnavailable(error);
    }
  }

  // Windows can briefly refuse to replace a file that antivirus or indexing has open.
  private async renameWithRetry(tempPath: string): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await fs.rename(tempPath, this.filePath);
        return;
      } catch (error) {
        const code = errorCode(error);
        if (attempt >= RENAME_ATTEMPTS || !code || !RENAME_RETRY_CODES.has(code)) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_DELAY_MS * attempt));
      }
    }
  }

  // Makes the rename durable. Windows cannot open a directory for fsync.
  private async syncDirectory(directory: string): Promise<void> {
    if (process.platform === 'win32') {
      return;
    }
    const handle = await fs.open(directory, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}
