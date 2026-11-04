import type { RequestHandler } from 'express';
import { AppError } from '../errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense alongside SameSite=Lax. Browsers always send Origin on cross-origin
 * state-changing requests, so a missing header means a non-browser client.
 */
export function originCheck(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    const origin = req.headers.origin;
    if (!SAFE_METHODS.has(req.method) && origin !== undefined && !allowed.has(origin)) {
      throw new AppError(403, 'CSRF_ORIGIN_REJECTED', 'Request origin is not allowed');
    }
    next();
  };
}
