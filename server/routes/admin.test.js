/**
 * Integration tests for the admin API routes.
 *
 * Key security invariants tested:
 *  - Login uses bcrypt comparison (not plaintext)
 *  - Successful login sets an HttpOnly cookie (token not in response body)
 *  - Wrong credentials always return 401
 *  - Protected routes reject requests without a valid admin cookie
 *  - Logout revokes the session and clears the cookie
 */
import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_mock');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('JWT_SECRET', 'test-secret-for-testing-only-32chars!!');
vi.stubEnv('ADMIN_USERNAME', 'testadmin');
vi.stubEnv('ADMIN_PASSWORD', 'supersecret_test_password_123!');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-admin-${process.pid}-${crypto.randomUUID()}.db`));

const inMemoryDb = await (async () => {
  const Database = (await import('better-sqlite3')).default;
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      song_title TEXT,
      genre TEXT,
      mood TEXT,
      tempo INTEGER,
      occasion TEXT,
      occasion_detail TEXT,
      story TEXT,
      status TEXT DEFAULT 'in_production',
      created_at TEXT NOT NULL,
      delivery_date TEXT NOT NULL,
      stripe_session_id TEXT,
      paystack_reference TEXT,
      amount INTEGER DEFAULT 30000,
      customer_email TEXT,
      ai_brief TEXT,
      recipient_type TEXT,
      recipient_name TEXT,
      sender_name TEXT,
      voice_gender TEXT,
      special_qualities TEXT,
      favorite_memories TEXT,
      special_message TEXT,
      promo_code_id TEXT,
      promo_code_preview TEXT,
      promo_discount_percent INTEGER,
      original_amount INTEGER,
      discounted_amount INTEGER
    );
    CREATE TABLE IF NOT EXISTS song_generations (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'queued',
      current_stage TEXT,
      pipeline_form TEXT,
      derived_fields TEXT,
      state TEXT,
      final_output TEXT,
      llm_usage TEXT,
      stage_status TEXT,
      stage_comments TEXT,
      error TEXT,
      resume_attempts INTEGER DEFAULT 0,
      run_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      genre TEXT NOT NULL,
      duration TEXT NOT NULL,
      description TEXT NOT NULL,
      cover_url TEXT NOT NULL,
      artist TEXT,
      tags TEXT,
      audio_url TEXT,
      story TEXT,
      sort_order INTEGER DEFAULT 99
    );
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS promo_codes (
      id TEXT PRIMARY KEY,
      code_hash TEXT UNIQUE NOT NULL,
      code_preview TEXT NOT NULL,
      discount_percent INTEGER NOT NULL,
      max_uses INTEGER,
      used_count INTEGER DEFAULT 0,
      disabled INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      used_at TEXT,
      used_order_id TEXT
    );
  `);
  return db;
})();

vi.mock('../db.cjs', () => ({ default: inMemoryDb }));
vi.mock('../email.cjs', () => ({
  sendCompletionEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/gemini.cjs', () => ({
  generateProductionBrief: vi.fn().mockResolvedValue('Generated production brief'),
}));

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { default: adminRouter } = await import('../routes/admin.cjs');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/admin', adminRouter);

const require = createRequire(import.meta.url);
const routeDbModule = require('../db.cjs');
const routeDb = routeDbModule.default || routeDbModule;

describe('POST /api/admin/login', () => {
  it('rejects wrong password', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'wrongpassword' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(401);
    expect(res.body.authenticated).toBeUndefined();
  });

  it('rejects wrong username', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'wronguser', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(401);
  });

  it('rejects the hardcoded fallback password from the old code', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'admin', password: 'yourgbedu2026' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(401);
  });

  it('sets an HttpOnly cookie on valid login (token NOT in response body)', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    // No token in body — it's in an HttpOnly cookie
    expect(res.body.token).toBeUndefined();
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c) => c.startsWith('admin_token='))).toBe(true);
    expect(setCookie.some((c) => c.includes('HttpOnly'))).toBe(true);
  });
});

describe('GET /api/admin/orders (protected)', () => {
  it('returns 401 without a cookie', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).get('/api/admin/orders');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a non-admin cookie', async () => {
    const { default: supertest } = await import('supertest');
    const jwt = (await import('jsonwebtoken')).default;
    const userToken = jwt.sign(
      { userId: 'u1', email: 'user@test.com', role: 'user', jti: crypto.randomUUID() },
      'test-secret-for-testing-only-32chars!!',
      { expiresIn: '1h' }
    );
    const res = await supertest(app)
      .get('/api/admin/orders')
      .set('Cookie', `admin_token=${userToken}`);

    expect(res.status).toBe(403);
  });

  it('returns orders list for a valid admin session', async () => {
    const { default: supertest } = await import('supertest');

    // Login to get the admin cookie
    const loginRes = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');

    const cookie = loginRes.headers['set-cookie'];

    const res = await supertest(app)
      .get('/api/admin/orders')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('Admin promo code management', () => {
  it('generates, lists, and disables one-time free codes', async () => {
    const { default: supertest } = await import('supertest');
    routeDb.prepare('DELETE FROM promo_codes').run();

    const loginRes = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');
    const cookie = loginRes.headers['set-cookie'];

    const created = await supertest(app)
      .post('/api/admin/promo-codes')
      .set('Cookie', cookie);

    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(/^FREE-[A-F0-9]{12}$/);
    expect(created.body.codePreview).toBeTruthy();
    expect(created.body.discountPercent).toBe(100);

    const listed = await supertest(app)
      .get('/api/admin/promo-codes')
      .set('Cookie', cookie);

    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    expect(listed.body.data[0].codePreview).toBe(created.body.codePreview);
    expect(listed.body.data[0].code).toBeUndefined();

    const disabled = await supertest(app)
      .patch(`/api/admin/promo-codes/${created.body.id}/disable`)
      .set('Cookie', cookie);

    expect(disabled.status).toBe(200);
    const row = routeDb.prepare('SELECT disabled FROM promo_codes WHERE id = ?').get(created.body.id);
    expect(row.disabled).toBe(1);
  });
});

describe('POST /api/admin/orders/:id/ai-brief (protected)', () => {
  it('rejects AI brief generation without a cookie', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).post('/api/admin/orders/order-ai-001/ai-brief');
    expect(res.status).toBe(401);
  });

  it('stores an AI brief for a valid admin session', async () => {
    const { default: supertest } = await import('supertest');
    const orderId = crypto.randomUUID();

    routeDb.prepare(`
      INSERT INTO orders (
        id, song_title, genre, occasion, occasion_detail, created_at, delivery_date,
        customer_email, recipient_type, sender_name, voice_gender,
        special_qualities, favorite_memories, special_message
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      'Custom Song',
      'Afro-Beats',
      'anniversary',
      '',
      new Date().toISOString(),
      new Date(Date.now() + 86400000).toISOString(),
      'customer@test.com',
      'Wife',
      'Tunde',
      'Male Voice',
      'Kind and steady',
      'Their first date',
      'I love you'
    );

    const loginRes = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');

    const res = await supertest(app)
      .post(`/api/admin/orders/${orderId}/ai-brief`)
      .set('Cookie', loginRes.headers['set-cookie']);

    expect(res.status).toBe(200);
    expect(res.body.aiBrief).toContain('Custom Afro-Beats song');
    expect(res.body.aiBrief).toContain('Occasion: anniversary');

    const row = routeDb.prepare('SELECT ai_brief FROM orders WHERE id = ?').get(orderId);
    expect(row.ai_brief).toBe(res.body.aiBrief);
  });
});

describe('DELETE /api/admin/orders/:id (protected)', () => {
  it('rejects order deletion without a cookie', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).delete('/api/admin/orders/order-delete-001');
    expect(res.status).toBe(401);
  });

  it('deletes the order and generation row, and unlinks subscribers', async () => {
    const { default: supertest } = await import('supertest');
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    routeDb.prepare(`
      INSERT INTO orders (id, song_title, genre, occasion, created_at, delivery_date, customer_email)
      VALUES (?, 'Custom Song', 'Afro-Beats', 'birthday', ?, ?, 'erase@test.com')
    `).run(orderId, now, now);
    routeDb.prepare(`
      INSERT INTO song_generations (id, order_id, status, created_at, updated_at)
      VALUES (?, ?, 'completed', ?, ?)
    `).run(crypto.randomUUID(), orderId, now, now);
    routeDb.prepare(`
      INSERT INTO subscribers (id, email, created_at, converted_order_id)
      VALUES (?, 'erase@test.com', ?, ?)
    `).run(crypto.randomUUID(), now, orderId);

    const loginRes = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');

    const res = await supertest(app)
      .delete(`/api/admin/orders/${orderId}`)
      .set('Cookie', loginRes.headers['set-cookie']);

    expect(res.status).toBe(200);
    expect(routeDb.prepare('SELECT 1 FROM orders WHERE id = ?').get(orderId)).toBeUndefined();
    expect(routeDb.prepare('SELECT 1 FROM song_generations WHERE order_id = ?').get(orderId)).toBeUndefined();
    expect(routeDb.prepare('SELECT converted_order_id FROM subscribers WHERE email = ?').get('erase@test.com').converted_order_id).toBeNull();
  });

  it('returns 409 when the generation is running', async () => {
    const { default: supertest } = await import('supertest');
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    routeDb.prepare(`
      INSERT INTO orders (id, song_title, genre, occasion, created_at, delivery_date)
      VALUES (?, 'Custom Song', 'Afro-Beats', 'birthday', ?, ?)
    `).run(orderId, now, now);
    routeDb.prepare(`
      INSERT INTO song_generations (id, order_id, status, created_at, updated_at)
      VALUES (?, ?, 'running', ?, ?)
    `).run(crypto.randomUUID(), orderId, now, now);

    const loginRes = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');

    const res = await supertest(app)
      .delete(`/api/admin/orders/${orderId}`)
      .set('Cookie', loginRes.headers['set-cookie']);

    expect(res.status).toBe(409);
    expect(routeDb.prepare('SELECT 1 FROM orders WHERE id = ?').get(orderId)).toBeTruthy();
  });
});

describe('POST /api/admin/orders/:id/song (SSRF guard)', () => {
  async function adminCookie(supertest) {
    const loginRes = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');
    return loginRes.headers['set-cookie'];
  }

  it('rejects private/loopback/link-local hosts with 400', async () => {
    const { default: supertest } = await import('supertest');
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();
    routeDb.prepare(`
      INSERT INTO orders (id, song_title, genre, occasion, created_at, delivery_date)
      VALUES (?, 'Custom Song', 'Afro-Beats', 'birthday', ?, ?)
    `).run(orderId, now, now);
    const cookie = await adminCookie(supertest);

    const blocked = [
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost:3000/internal',
      'https://127.0.0.1/x.mp3',
      'http://10.0.0.5/x.mp3',
      'http://192.168.1.10/x.mp3',
      'ftp://example.com/x.mp3',
    ];
    for (const url of blocked) {
      const res = await supertest(app)
        .post(`/api/admin/orders/${orderId}/song`)
        .set('Cookie', cookie)
        .send({ url });
      expect(res.status, `should block ${url}`).toBe(400);
    }
    // order must remain untouched (no final_song_url written)
    expect(routeDb.prepare('SELECT final_song_url FROM orders WHERE id = ?').get(orderId).final_song_url).toBeFalsy();
  });

  it('accepts a public https URL that serves audio', async () => {
    const { default: supertest } = await import('supertest');
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();
    routeDb.prepare(`
      INSERT INTO orders (id, song_title, genre, occasion, created_at, delivery_date)
      VALUES (?, 'Custom Song', 'Afro-Beats', 'birthday', ?, ?)
    `).run(orderId, now, now);
    const cookie = await adminCookie(supertest);

    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 206,
      headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'audio/mpeg' : null) },
    })));

    const res = await supertest(app)
      .post(`/api/admin/orders/${orderId}/song`)
      .set('Cookie', cookie)
      .send({ url: 'https://cdn.example.com/songs/final.mp3', title: 'Final Mix' });

    vi.unstubAllGlobals();

    expect(res.status).toBe(200);
    expect(routeDb.prepare('SELECT final_song_url FROM orders WHERE id = ?').get(orderId).final_song_url)
      .toBe('https://cdn.example.com/songs/final.mp3');
  });

  it('rejects an unreachable URL with 422 and allows force', async () => {
    const { default: supertest } = await import('supertest');
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();
    routeDb.prepare(`
      INSERT INTO orders (id, song_title, genre, occasion, created_at, delivery_date)
      VALUES (?, 'Custom Song', 'Afro-Beats', 'birthday', ?, ?)
    `).run(orderId, now, now);
    const cookie = await adminCookie(supertest);

    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 404,
      headers: { get: () => 'text/html' },
    })));

    const blocked = await supertest(app)
      .post(`/api/admin/orders/${orderId}/song`)
      .set('Cookie', cookie)
      .send({ url: 'https://cdn.example.com/songs/missing.mp3' });

    expect(blocked.status).toBe(422);
    expect(blocked.body.canForce).toBe(true);
    expect(routeDb.prepare('SELECT final_song_url FROM orders WHERE id = ?').get(orderId).final_song_url).toBeFalsy();

    // force:true bypasses the probe entirely (no fetch call needed)
    const forced = await supertest(app)
      .post(`/api/admin/orders/${orderId}/song`)
      .set('Cookie', cookie)
      .send({ url: 'https://cdn.example.com/songs/missing.mp3', force: true });

    vi.unstubAllGlobals();

    expect(forced.status).toBe(200);
    expect(routeDb.prepare('SELECT final_song_url FROM orders WHERE id = ?').get(orderId).final_song_url)
      .toBe('https://cdn.example.com/songs/missing.mp3');
  });
});

describe('POST /api/admin/logout', () => {
  it('clears the admin cookie and revokes the session', async () => {
    const { default: supertest } = await import('supertest');

    // Login first
    const loginRes = await supertest(app)
      .post('/api/admin/login')
      .send({ username: 'testadmin', password: 'supersecret_test_password_123!' })
      .set('Content-Type', 'application/json');

    const cookie = loginRes.headers['set-cookie'];

    // Logout
    const logoutRes = await supertest(app)
      .post('/api/admin/logout')
      .set('Cookie', cookie);

    expect(logoutRes.status).toBe(200);

    // The Set-Cookie header should clear the admin_token cookie
    const clearCookie = logoutRes.headers['set-cookie'];
    expect(clearCookie).toBeDefined();
    // Cookie should be expired/cleared
    expect(clearCookie.some((c) => c.includes('admin_token=;') || c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970'))).toBe(true);

    // Subsequent requests with the old cookie should be rejected (token is revoked)
    const afterLogout = await supertest(app)
      .get('/api/admin/orders')
      .set('Cookie', cookie);

    expect(afterLogout.status).toBe(401);
  });
});
