import { Router } from 'express';
import { AppError } from '../errors';
import { requireAuth, resolveSessionUser, type AuthDeps } from '../middleware/auth';
import { clearSessionCookie, setSessionCookie } from '../services/authCookie';
import { hashPassword, verifyPassword } from '../services/password';
import { signToken } from '../services/token';
import { toPublicUser } from '../types';
import { loginSchema, parseBody, registerSchema } from '../validation';

export function createAuthRouter(deps: AuthDeps): Router {
  const { config, store } = deps;
  const router = Router();

  router.post('/register', async (req, res) => {
    const { name, email, password } = parseBody(registerSchema, req.body);

    // Hash outside the store so slow bcrypt work does not hold up the queue.
    const passwordHash = await hashPassword(password, config.bcryptCost);
    const user = await store.create({ name, email, passwordHash, role: 'user' });

    setSessionCookie(res, signToken(user, config.jwtSecret), config);
    res.status(201).json({ user: toPublicUser(user) });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = parseBody(loginSchema, req.body);

    const user = await store.findByEmail(email);
    const valid = await verifyPassword(password, user?.passwordHash, config.bcryptCost);
    if (!user || !valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    setSessionCookie(res, signToken(user, config.jwtSecret), config);
    res.json({ user: toPublicUser(user) });
  });

  router.get('/me', requireAuth(deps), (req, res) => {
    res.json({ user: toPublicUser(req.user!) });
  });

  router.post('/logout', async (req, res) => {
    const user = await resolveSessionUser(req, deps);
    if (user) {
      await store.revokeTokens(user.id);
    }
    clearSessionCookie(res, config);
    res.status(204).end();
  });

  return router;
}
