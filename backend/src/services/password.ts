import bcrypt from 'bcrypt';
import { fitsBcryptLimit } from '../validation';

const dummyHashes = new Map<number, Promise<string>>();

function dummyHash(cost: number): Promise<string> {
  let hash = dummyHashes.get(cost);
  if (!hash) {
    hash = bcrypt.hash('dummy-password-for-constant-time-login', cost);
    dummyHashes.set(cost, hash);
  }
  return hash;
}

/** Call at startup so the first login for an unknown email is not measurably slower. */
export async function warmUpPasswordCheck(cost: number): Promise<void> {
  await dummyHash(cost);
}

export function hashPassword(password: string, cost: number): Promise<string> {
  return bcrypt.hash(password, cost);
}

/**
 * Compares against a dummy hash when the user is unknown, so response time does
 * not reveal whether an email is registered.
 */
export async function verifyPassword(
  password: string,
  hash: string | undefined,
  cost: number,
): Promise<boolean> {
  const matches = await bcrypt.compare(password, hash ?? (await dummyHash(cost)));
  // bcrypt ignores bytes past 72, so an over-long password must never match.
  return matches && hash !== undefined && fitsBcryptLimit(password);
}
