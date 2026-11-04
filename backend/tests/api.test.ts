import { promises as fs } from 'node:fs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureBootstrapAdmin } from '../src/services/bootstrapAdmin';
import { hashPassword } from '../src/services/password';
import {
  createTestContext,
  editUsersFile,
  TEST_ORIGIN,
  TEST_SECRET,
  type TestContext,
} from './helpers';

const PASSWORD = 'correct-horse-battery';
const valid = { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD };

function setCookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

function sessionCookie(res: request.Response): string {
  const cookie = setCookies(res).find((c) => c.startsWith('um_session='));
  if (!cookie) {
    throw new Error('um_session cookie was not set');
  }
  return cookie.split(';')[0]!;
}

describe('API', () => {
  let ctx: TestContext;

  async function register(body: object = valid) {
    return request(ctx.app).post('/api/auth/register').send(body);
  }

  async function createAdminCookie(): Promise<string> {
    await ctx.store.create({
      email: 'admin@example.com',
      name: 'Admin',
      passwordHash: await hashPassword(PASSWORD, 4),
      role: 'admin',
    });
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: PASSWORD });
    return sessionCookie(res);
  }

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await ctx.cleanup();
  });

  describe('POST /api/auth/register', () => {
    it('should_create_user_and_set_cookie_when_input_is_valid', async () => {
      const res = await register();

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        role: 'user',
      });
      expect(Object.keys(res.body.user).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'name',
        'role',
        'updatedAt',
      ]);
      expect(sessionCookie(res)).toBeTruthy();
    });

    it('should_store_bcrypt_hash_and_never_plaintext_when_registering', async () => {
      await register();

      const raw = await fs.readFile(ctx.usersFile, 'utf8');
      expect(raw).not.toContain(PASSWORD);
      expect(JSON.parse(raw).users[0].passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('should_normalize_email_when_it_has_case_and_spaces', async () => {
      const res = await register({ ...valid, email: '  ADA@Example.COM ' });
      expect(res.body.user.email).toBe('ada@example.com');
    });

    it('should_return_409_when_email_differs_only_by_case', async () => {
      await register();
      const res = await register({ ...valid, email: 'ADA@example.com' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('should_reject_when_client_tries_to_set_role', async () => {
      const res = await register({ ...valid, role: 'admin' });

      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([{ field: 'role', message: 'Unknown field' }]);
      await expect(ctx.store.list()).resolves.toHaveLength(0);
    });

    it.each([
      ['missing name', { email: valid.email, password: PASSWORD }, 'name'],
      ['blank name', { ...valid, name: '   ' }, 'name'],
      ['long name', { ...valid, name: 'x'.repeat(101) }, 'name'],
      ['missing email', { name: 'A', password: PASSWORD }, 'email'],
      ['invalid email', { ...valid, email: 'not-an-email' }, 'email'],
      ['non-string email', { ...valid, email: 42 }, 'email'],
      ['short password', { ...valid, password: '1234567' }, 'password'],
      ['long password', { ...valid, password: 'a'.repeat(73) }, 'password'],
      ['multibyte password over 72 bytes', { ...valid, password: 'é'.repeat(37) }, 'password'],
    ])('should_return_400_when_body_has_%s', async (_label, body, field) => {
      const res = await register(body);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
    });

    it('should_accept_when_password_is_exactly_8_characters_or_72_bytes', async () => {
      expect((await register({ ...valid, password: '12345678' })).status).toBe(201);
      const res = await register({
        ...valid,
        email: 'b@example.com',
        password: 'a'.repeat(72),
      });
      expect(res.status).toBe(201);
    });

    it('should_return_400_when_body_is_absent', async () => {
      const res = await request(ctx.app).post('/api/auth/register');
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should_return_400_when_json_is_malformed', async () => {
      const res = await request(ctx.app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{ bad json');

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_JSON');
    });

    it('should_return_413_when_body_exceeds_limit', async () => {
      const res = await register({ ...valid, name: 'x'.repeat(11 * 1024) });

      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await register();
    });

    it('should_return_user_and_cookie_when_credentials_are_valid', async () => {
      const res = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'ADA@example.com', password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('ada@example.com');
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(sessionCookie(res)).toBeTruthy();
    });

    it('should_not_return_token_in_body_when_login_succeeds', async () => {
      const res = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: valid.email, password: PASSWORD });

      const token = sessionCookie(res).split('=')[1]!;
      expect(JSON.stringify(res.body)).not.toContain(token);
    });

    it('should_return_identical_error_when_password_or_email_is_wrong', async () => {
      const wrongPassword = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: valid.email, password: 'wrong-password' });
      const unknownEmail = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: PASSWORD });

      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknownEmail.status).toBe(401);
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(setCookies(wrongPassword)).toEqual([]);
    });

    it('should_return_400_when_fields_are_missing', async () => {
      const res = await request(ctx.app).post('/api/auth/login').send({ email: valid.email });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('session cookie', () => {
    it('should_set_security_attributes_when_in_development', async () => {
      const cookie = setCookies(await register())[0]!;

      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\//i);
      expect(cookie).toMatch(/Max-Age=3600/i);
      expect(cookie).not.toMatch(/Secure/i);
    });

    it('should_set_secure_when_in_production', async () => {
      const production = await createTestContext({ NODE_ENV: 'production', BCRYPT_COST: '10' });
      try {
        const res = await request(production.app).post('/api/auth/register').send(valid);
        expect(setCookies(res)[0]).toMatch(/Secure/i);
      } finally {
        await production.cleanup();
      }
    });
  });

  describe('GET /api/auth/me', () => {
    it('should_return_user_when_cookie_is_valid', async () => {
      const cookie = sessionCookie(await register());
      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(valid.email);
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.user).not.toHaveProperty('tokenVersion');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('should_return_401_when_cookie_is_missing', async () => {
      const res = await request(ctx.app).get('/api/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('should_return_401_when_token_is_tampered', async () => {
      const cookie = sessionCookie(await register());
      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', `${cookie}x`);
      expect(res.status).toBe(401);
    });

    it('should_return_401_when_token_is_expired', async () => {
      const { body } = await register();
      const token = jwt.sign({ tv: 0 }, TEST_SECRET, {
        algorithm: 'HS256',
        subject: body.user.id,
        expiresIn: -1,
      });
      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', `um_session=${token}`);
      expect(res.status).toBe(401);
    });

    it('should_return_401_when_cookie_is_a_json_cookie_object', async () => {
      const res = await request(ctx.app)
        .get('/api/auth/me')
        .set('Cookie', `um_session=${encodeURIComponent('j:{"a":1}')}`);
      expect(res.status).toBe(401);
    });

    it('should_return_401_when_user_no_longer_exists', async () => {
      const cookie = sessionCookie(await register());
      await editUsersFile(ctx.usersFile, () => []);

      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should_clear_cookie_and_revoke_token_when_logged_in', async () => {
      const cookie = sessionCookie(await register());

      const res = await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');
      expect(setCookies(res)[0]).toMatch(/^um_session=;/);

      const replay = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
      expect(replay.status).toBe(401);
    });

    it('should_end_all_sessions_when_user_logs_out', async () => {
      const first = sessionCookie(await register());
      const login = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: valid.email, password: PASSWORD });

      await request(ctx.app).post('/api/auth/logout').set('Cookie', sessionCookie(login));

      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', first);
      expect(res.status).toBe(401);
    });

    it('should_allow_new_login_when_user_has_logged_out', async () => {
      const cookie = sessionCookie(await register());
      await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie);

      const login = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: valid.email, password: PASSWORD });
      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', sessionCookie(login));
      expect(res.status).toBe(200);
    });

    it('should_return_204_when_no_session_exists', async () => {
      const res = await request(ctx.app).post('/api/auth/logout');
      expect(res.status).toBe(204);
    });
  });

  describe('GET /api/users', () => {
    it('should_list_users_without_secrets_when_requester_is_admin', async () => {
      await register();
      const cookie = await createAdminCookie();

      const res = await request(ctx.app).get('/api/users').set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.users.map((u: { email: string }) => u.email)).toEqual([
        'ada@example.com',
        'admin@example.com',
      ]);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion|\$2[aby]\$/);
    });

    it('should_return_403_when_requester_is_not_admin', async () => {
      const cookie = sessionCookie(await register());
      const res = await request(ctx.app).get('/api/users').set('Cookie', cookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should_return_401_when_not_authenticated', async () => {
      const res = await request(ctx.app).get('/api/users');
      expect(res.status).toBe(401);
    });

    it('should_return_403_immediately_when_admin_role_is_removed', async () => {
      const cookie = await createAdminCookie();
      await editUsersFile(ctx.usersFile, (users) =>
        users.map((user) => ({ ...user, role: 'user' })),
      );

      const res = await request(ctx.app).get('/api/users').set('Cookie', cookie);
      expect(res.status).toBe(403);
    });
  });

  describe('CORS and CSRF', () => {
    it('should_allow_credentials_when_origin_is_allowed', async () => {
      const res = await request(ctx.app).get('/api/auth/me').set('Origin', TEST_ORIGIN);

      expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should_answer_preflight_when_origin_is_allowed', async () => {
      const res = await request(ctx.app)
        .options('/api/auth/login')
        .set('Origin', TEST_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    });

    it('should_omit_cors_headers_when_origin_is_not_allowed', async () => {
      const res = await request(ctx.app).get('/api/auth/me').set('Origin', 'https://evil.example');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should_accept_post_when_origin_is_allowed', async () => {
      const res = await request(ctx.app)
        .post('/api/auth/register')
        .set('Origin', TEST_ORIGIN)
        .send(valid);
      expect(res.status).toBe(201);
    });

    it.each(['/api/auth/register', '/api/auth/login', '/api/auth/logout'])(
      'should_reject_post_to_%s_when_origin_is_not_allowed',
      async (path) => {
        const res = await request(ctx.app)
          .post(path)
          .set('Origin', 'https://evil.example')
          .send(valid);

        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('CSRF_ORIGIN_REJECTED');
      },
    );

    it('should_not_revoke_session_when_logout_comes_from_another_origin', async () => {
      const cookie = sessionCookie(await register());
      await request(ctx.app)
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example');

      const res = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
      expect(res.status).toBe(200);
    });
  });

  describe('failure handling', () => {
    it('should_return_503_and_preserve_file_when_storage_is_corrupted', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await fs.writeFile(ctx.usersFile, '{ corrupted');

      const res = await register();

      expect(res.status).toBe(503);
      expect(res.body).toEqual({
        error: { code: 'STORAGE_UNAVAILABLE', message: 'User storage is unavailable' },
      });
      await expect(fs.readFile(ctx.usersFile, 'utf8')).resolves.toBe('{ corrupted');
    });

    it('should_return_500_without_internal_details_when_error_is_unexpected', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(ctx.store, 'findByEmail').mockRejectedValue(new Error('secret internal detail'));

      const res = await request(ctx.app)
        .post('/api/auth/login')
        .send({ email: valid.email, password: PASSWORD });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('secret internal detail');
    });

    it('should_return_404_in_standard_format_when_route_is_unknown', async () => {
      const res = await request(ctx.app).get('/api/nope');

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('should_not_expose_framework_header', async () => {
      const res = await request(ctx.app).get('/api/nope');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('bootstrap admin', () => {
    const bootstrap = { email: 'root@example.com', password: PASSWORD };

    it('should_create_admin_who_can_log_in_when_configured', async () => {
      vi.spyOn(console, 'info').mockImplementation(() => undefined);
      await ensureBootstrapAdmin({ ...ctx.config, bootstrapAdmin: bootstrap }, ctx.store);

      const login = await request(ctx.app).post('/api/auth/login').send(bootstrap);
      expect(login.body.user.role).toBe('admin');
    });

    it('should_not_elevate_existing_user_when_email_is_taken', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      await register({ ...valid, email: bootstrap.email });

      await ensureBootstrapAdmin({ ...ctx.config, bootstrapAdmin: bootstrap }, ctx.store);

      expect((await ctx.store.findByEmail(bootstrap.email))?.role).toBe('user');
    });
  });
});
