import type { Request, RequestHandler } from 'express';
import type { Config } from '../config';
import { AppError } from '../errors';
import { SESSION_COOKIE } from '../services/authCookie';
import { verifyToken } from '../services/token';
import type { JsonUserStore } from '../services/userStore';
import type { Role, User } from '../types';

export interface AuthDeps {
  config: Config;
  store: JsonUserStore;
}

/** Resolves the current user from the session cookie, or undefined if there is none. */
export async function resolveSessionUser(
  req: Request,
  { config, store }: AuthDeps,
): Promise<User | undefined> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string') {
    return undefined;
  }

  const claims = verifyToken(token, config.jwtSecret);
  if (!claims) {
    return undefined;
  }

  const user = await store.findById(claims.sub);
  return user?.tokenVersion === claims.tv ? user : undefined;
}

export function requireAuth(deps: AuthDeps): RequestHandler {
  return async (req, _res, next) => {
    const user = await resolveSessionUser(req, deps);
    if (!user) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }
    req.user = user;
    next();
  };
}

/** Must run after requireAuth. */
export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (req.user?.role !== role) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to do this');
    }
    next();
  };
}
