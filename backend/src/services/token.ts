import jwt from 'jsonwebtoken';
import { SESSION_LIFETIME_SECONDS } from '../config';
import type { User } from '../types';

const ALGORITHM = 'HS256';

export interface SessionClaims {
  sub: string;
  tv: number;
}

export function signToken(user: User, secret: string): string {
  return jwt.sign({ tv: user.tokenVersion }, secret, {
    algorithm: ALGORITHM,
    subject: user.id,
    expiresIn: SESSION_LIFETIME_SECONDS,
  });
}

/** Returns the claims, or null for any invalid, expired or malformed token. */
export function verifyToken(token: string, secret: string): SessionClaims | null {
  try {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return null;
    }
    return typeof payload.tv === 'number' ? { sub: payload.sub, tv: payload.tv } : null;
  } catch {
    return null;
  }
}
