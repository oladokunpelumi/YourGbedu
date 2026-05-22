/**
 * Integration tests for the auth API routes.
 *
 * Key security invariants tested:
 *  - Magic link tokens are stored as SHA-256 hashes (plaintext never touches DB)
 *  - Verify endpoint sets an HttpOnly cookie, not a JSON token body
 *  - Expired and used tokens are rejected
 *  - /api/auth/me requires a valid session
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_mock');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('JWT_SECRET', 'test-secret-for-testing-only-32chars!!');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-auth-${process.pid}-${crypto.randomUUID()}.db`));

const require = createRequire(import.meta.url);
const db = require('../db.cjs');
const emailModule = require('../email.cjs');
const sendMagicLinkEmailMock = vi.spyOn(emailModule, 'sendMagicLinkEmail').mockResolvedValue(undefined);

db.exec(`
  CREATE TABLE IF NOT EXISTS magic_links (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti TEXT PRIMARY KEY,
    expires_at TEXT NOT NULL
  );
`);

beforeEach(() => {
  db.prepare('DELETE FROM magic_links').run();
  db.prepare('DELETE FROM users').run();
  db.prepare('DELETE FROM revoked_tokens').run();
  db.prepare('DELETE FROM orders').run();
  sendMagicLinkEmailMock.mockClear();
});

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { default: authRouter } = await import('../routes/auth.cjs');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

function hashToken(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

describe('POST /api/auth/request', () => {
  it('accepts a valid email', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/auth/request')
      .send({ email: 'hello@example.com' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(200);
    expect(res.body.message).toBeTruthy();
    expect(sendMagicLinkEmailMock).not.toHaveBeenCalled();
  });

  it('does not send a magic link when the email has no matching orders', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/auth/request')
      .send({ email: 'empty@example.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If that email has orders, a sign-in link has been sent.');
    expect(sendMagicLinkEmailMock).not.toHaveBeenCalled();

    const row = db.prepare('SELECT token FROM magic_links WHERE email = ?').get('empty@example.com');
    expect(row).toBeUndefined();
  });

  it('rejects an invalid email', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/auth/request')
      .send({ email: 'not-valid' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });

  it('stores the token hash, not plaintext', async () => {
    const { default: supertest } = await import('supertest');
    db.prepare(`
      INSERT INTO orders (id, song_title, genre, created_at, delivery_date, customer_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      'Test Song',
      'Afro-Beats',
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
      'hashtest@example.com'
    );

    await supertest(app)
      .post('/api/auth/request')
      .send({ email: 'hashtest@example.com' })
      .set('Content-Type', 'application/json');

    expect(sendMagicLinkEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'hashtest@example.com',
      clientUrl: 'http://localhost:3000',
    }));

    // The email function receives the plaintext token
    const plainToken = sendMagicLinkEmailMock.mock.lastCall?.[0]?.token;
    expect(plainToken).toBeTruthy();

    // The database should store the hash, not the plaintext
    const row = db.prepare('SELECT token FROM magic_links WHERE email = ?').get('hashtest@example.com');
    expect(row).toBeTruthy();
    expect(row.token).not.toBe(plainToken);
    expect(row.token).toBe(hashToken(plainToken));
  });
});

describe('GET /api/auth/verify', () => {
  it('returns 401 for unknown token', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).post('/api/auth/verify').send({ token: 'doesnotexist' });
    expect(res.status).toBe(401);
  });

  it('sets an HttpOnly cookie (no token in response body) for a valid token', async () => {
    const { default: supertest } = await import('supertest');

    // Insert a hashed token directly
    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainToken);
    const expires = new Date(Date.now() + 60000).toISOString();
    db
      .prepare('INSERT INTO magic_links (token, email, expires_at, used) VALUES (?, ?, ?, 0)')
      .run(tokenHash, 'verify@example.com', expires);

    const res = await supertest(app).post('/api/auth/verify').send({ token: plainToken });

    expect(res.status).toBe(200);
    // Response body should NOT include the JWT
    expect(res.body.token).toBeUndefined();
    // Response body should include the email
    expect(res.body.email).toBe('verify@example.com');
    // Cookie should be set with HttpOnly flag
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c) => c.startsWith('sonnetary_token='))).toBe(true);
    expect(setCookie.some((c) => c.includes('HttpOnly'))).toBe(true);
  });

  it('rejects a used token', async () => {
    const { default: supertest } = await import('supertest');

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainToken);
    const expires = new Date(Date.now() + 60000).toISOString();
    db
      .prepare('INSERT INTO magic_links (token, email, expires_at, used) VALUES (?, ?, ?, 1)')
      .run(tokenHash, 'used@example.com', expires);

    const res = await supertest(app).post('/api/auth/verify').send({ token: plainToken });
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const { default: supertest } = await import('supertest');

    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainToken);
    const pastDate = new Date(Date.now() - 1000).toISOString();
    db
      .prepare('INSERT INTO magic_links (token, email, expires_at, used) VALUES (?, ?, ?, 0)')
      .run(tokenHash, 'expired@example.com', pastDate);

    const res = await supertest(app).post('/api/auth/verify').send({ token: plainToken });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a session', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns user info with a valid session cookie', async () => {
    const { default: supertest } = await import('supertest');

    // Get a valid cookie by verifying a fresh token
    const plainToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainToken);
    const expires = new Date(Date.now() + 60000).toISOString();
    db
      .prepare('INSERT OR IGNORE INTO magic_links (token, email, expires_at, used) VALUES (?, ?, ?, 0)')
      .run(tokenHash, 'me@example.com', expires);

    const verifyRes = await supertest(app).post('/api/auth/verify').send({ token: plainToken });
    const cookie = verifyRes.headers['set-cookie'];

    const meRes = await supertest(app)
      .get('/api/auth/me')
      .set('Cookie', cookie);

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe('me@example.com');
  });
});
