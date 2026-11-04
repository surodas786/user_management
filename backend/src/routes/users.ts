import { Router } from 'express';
import { requireAuth, requireRole, type AuthDeps } from '../middleware/auth';
import { toPublicUser } from '../types';

export function createUsersRouter(deps: AuthDeps): Router {
  const router = Router();

  router.get('/', requireAuth(deps), requireRole('admin'), async (_req, res) => {
    const users = await deps.store.list();
    res.json({ users: users.map(toPublicUser), total: users.length });
  });

  return router;
}
