import type { CookieOptions, Response } from 'express';
import { SESSION_LIFETIME_SECONDS, type Config } from '../config';

export const SESSION_COOKIE = 'um_session';

function baseOptions(config: Config): CookieOptions {
  return { httpOnly: true, secure: config.cookieSecure, sameSite: 'lax', path: '/' };
}

export function setSessionCookie(res: Response, token: string, config: Config): void {
  res.cookie(SESSION_COOKIE, token, {
    ...baseOptions(config),
    maxAge: SESSION_LIFETIME_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response, config: Config): void {
  res.clearCookie(SESSION_COOKIE, baseOptions(config));
}
