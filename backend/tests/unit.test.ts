import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config';
import { hashPassword, verifyPassword } from '../src/services/password';
import { signToken, verifyToken } from '../src/services/token';
import { toPublicUser, type User } from '../src/types';
import { TEST_SECRET } from './helpers';

const user: User = {
  id: 'user-1',
  email: 'a@example.com',
  name: 'A',
  passwordHash: 'secret-hash',
  role: 'user',
  tokenVersion: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('password', () => {
  it('should_verify_when_password_matches', async () => {
    const hash = await hashPassword('correct-password', 4);
    expect(hash).not.toContain('correct-password');
    await expect(verifyPassword('correct-password', hash, 4)).resolves.toBe(true);
  });

  it('should_reject_when_password_differs', async () => {
    const hash = await hashPassword('correct-password', 4);
    await expect(verifyPassword('wrong-password', hash, 4)).resolves.toBe(false);
  });

  it('should_reject_when_hash_is_undefined', async () => {
    await expect(verifyPassword('any-password', undefined, 4)).resolves.toBe(false);
  });

  it('should_reject_when_password_exceeds_72_bytes_but_prefix_matches', async () => {
    const password = 'a'.repeat(72);
    const hash = await hashPassword(password, 4);
    await expect(verifyPassword(`${password}extra`, hash, 4)).resolves.toBe(false);
  });
});

describe('token', () => {
  it('should_return_claims_when_token_is_valid', () => {
    const token = signToken(user, TEST_SECRET);
    expect(verifyToken(token, TEST_SECRET)).toEqual({ sub: 'user-1', tv: 3 });
  });

  it('should_expire_after_one_hour', () => {
    const decoded = jwt.decode(signToken(user, TEST_SECRET)) as jwt.JwtPayload;
    expect(decoded.exp! - decoded.iat!).toBe(3600);
  });

  it('should_not_carry_personal_data_or_role_in_payload', () => {
    const decoded = jwt.decode(signToken(user, TEST_SECRET)) as jwt.JwtPayload;
    expect(Object.keys(decoded).sort()).toEqual(['exp', 'iat', 'sub', 'tv']);
  });

  it('should_return_null_when_token_is_expired', () => {
    vi.useFakeTimers();
    try {
      const token = signToken(user, TEST_SECRET);
      vi.advanceTimersByTime(3601 * 1000);
      expect(verifyToken(token, TEST_SECRET)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should_return_null_when_signed_with_another_secret', () => {
    const token = signToken(user, 'another-secret-that-is-at-least-32-chars');
    expect(verifyToken(token, TEST_SECRET)).toBeNull();
  });

  it('should_return_null_when_algorithm_is_none', () => {
    const token = jwt.sign({ tv: 3 }, '', { algorithm: 'none', subject: 'user-1' });
    expect(verifyToken(token, TEST_SECRET)).toBeNull();
  });

  it('should_return_null_when_algorithm_is_not_hs256', () => {
    const token = jwt.sign({ tv: 3 }, TEST_SECRET, { algorithm: 'HS512', subject: 'user-1' });
    expect(verifyToken(token, TEST_SECRET)).toBeNull();
  });

  it('should_return_null_when_token_version_claim_is_missing', () => {
    const token = jwt.sign({}, TEST_SECRET, { algorithm: 'HS256', subject: 'user-1' });
    expect(verifyToken(token, TEST_SECRET)).toBeNull();
  });

  it('should_return_null_when_token_is_garbage', () => {
    expect(verifyToken('not-a-token', TEST_SECRET)).toBeNull();
  });
});

describe('toPublicUser', () => {
  it('should_omit_password_hash_and_token_version', () => {
    const result = toPublicUser(user);
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('tokenVersion');
  });
});

describe('loadConfig', () => {
  const base = { JWT_SECRET: TEST_SECRET };

  it('should_apply_defaults_when_optional_values_are_missing', () => {
    const config = loadConfig(base);
    expect(config).toMatchObject({
      port: 4000,
      bcryptCost: 12,
      corsOrigins: ['http://localhost:3000'],
      cookieSecure: false,
    });
    expect(config.bootstrapAdmin).toBeUndefined();
  });

  it('should_throw_when_jwt_secret_is_missing', () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
  });

  it('should_throw_when_jwt_secret_is_too_short', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('should_not_include_secret_value_when_reporting_a_short_secret', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short-value' })).not.toThrow(/short-value/);
  });

  it('should_enable_secure_cookie_when_in_production', () => {
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).cookieSecure).toBe(true);
  });

  it('should_throw_when_bcrypt_cost_is_too_low_outside_tests', () => {
    expect(() => loadConfig({ ...base, BCRYPT_COST: '4' })).toThrow(/BCRYPT_COST/);
  });

  it('should_throw_when_cors_origin_is_wildcard', () => {
    expect(() => loadConfig({ ...base, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
  });

  it('should_throw_when_only_one_bootstrap_value_is_set', () => {
    expect(() => loadConfig({ ...base, BOOTSTRAP_ADMIN_EMAIL: 'a@example.com' })).toThrow(
      /BOOTSTRAP_ADMIN/,
    );
  });
});
