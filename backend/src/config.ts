import path from 'node:path';
import { emailSchema, newPasswordSchema } from './validation';

const BACKEND_ROOT = path.resolve(__dirname, '..');
const MIN_SECRET_LENGTH = 32;
const MIN_BCRYPT_COST = 10;
const MAX_BCRYPT_COST = 15;

export const SESSION_LIFETIME_SECONDS = 3600;

export interface Config {
  nodeEnv: string;
  port: number;
  jwtSecret: string;
  corsOrigins: string[];
  usersFile: string;
  bcryptCost: number;
  cookieSecure: boolean;
  bootstrapAdmin?: { email: string; password: string };
}

function parseInteger(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function parseBootstrapAdmin(env: NodeJS.ProcessEnv): Config['bootstrapAdmin'] {
  const rawEmail = env.BOOTSTRAP_ADMIN_EMAIL;
  const rawPassword = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!rawEmail && !rawPassword) {
    return undefined;
  }

  const email = emailSchema.safeParse(rawEmail);
  const password = newPasswordSchema.safeParse(rawPassword);
  if (!email.success || !password.success) {
    throw new Error(
      'BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must both be set and valid',
    );
  }
  return { email: email.data, password: password.data };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV || 'development';

  const jwtSecret = env.JWT_SECRET ?? '';
  if (jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters`);
  }

  const port = parseInteger('PORT', env.PORT || '4000');
  if (port < 0 || port > 65535) {
    throw new Error('PORT must be between 0 and 65535');
  }

  const bcryptCost = parseInteger('BCRYPT_COST', env.BCRYPT_COST || '12');
  const minCost = nodeEnv === 'test' ? 4 : MIN_BCRYPT_COST;
  if (bcryptCost < minCost || bcryptCost > MAX_BCRYPT_COST) {
    throw new Error(`BCRYPT_COST must be between ${minCost} and ${MAX_BCRYPT_COST}`);
  }

  const corsOrigins = (env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.includes('*')) {
    throw new Error('CORS_ORIGINS cannot contain * because credentials are enabled');
  }

  return {
    nodeEnv,
    port,
    jwtSecret,
    corsOrigins,
    usersFile: path.resolve(BACKEND_ROOT, env.USERS_FILE || 'data/users.json'),
    bcryptCost,
    cookieSecure: nodeEnv === 'production',
    bootstrapAdmin: parseBootstrapAdmin(env),
  };
}
