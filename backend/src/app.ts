import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { AppError } from './errors';
import type { AuthDeps } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { originCheck } from './middleware/originCheck';
import { createAuthRouter } from './routes/auth';
import { createUsersRouter } from './routes/users';

export function createApp(deps: AuthDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors({
      origin: deps.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(originCheck(deps.config.corsOrigins));
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  app.use('/api/auth', createAuthRouter(deps));
  app.use('/api/users', createUsersRouter(deps));

  app.use(() => {
    throw new AppError(404, 'NOT_FOUND', 'Route not found');
  });
  app.use(errorHandler);

  return app;
}
