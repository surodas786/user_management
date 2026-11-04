import { z } from 'zod';
import { AppError, type ErrorDetail } from './errors';

const BCRYPT_MAX_BYTES = 72;

export function fitsBcryptLimit(password: string): boolean {
  return Buffer.byteLength(password, 'utf8') <= BCRYPT_MAX_BYTES;
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Email must be at most 254 characters')
  .pipe(z.email('Invalid email address'));

export const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(fitsBcryptLimit, 'Password must be at most 72 bytes');

export const registerSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name must be at most 100 characters'),
  email: emailSchema,
  password: newPasswordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body ?? {});
  if (result.success) {
    return result.data;
  }

  const details: ErrorDetail[] = result.error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({ field: key, message: 'Unknown field' }));
    }
    return [{ field: issue.path.join('.') || 'body', message: issue.message }];
  });
  throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
}
