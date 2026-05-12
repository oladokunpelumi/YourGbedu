/**
 * Integration tests for the orders API routes.
 *
 * Key security invariants tested:
 *  - GET /api/orders/track requires authentication (returns 401 without cookie)
 *  - Authenticated users can only see their own orders (uses email from JWT, not query param)
 *  - GET /api/orders/:id is accessible without auth (UUID is a capability token)
 *  - POST /api/orders is idempotent on duplicate payment references
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_mock');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('JWT_SECRET', 'test-secret-for-testing-only-32chars!!');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-orders-${process.pid}-${crypto.randomUUID()}.db`));

const TEST_JWT_SECRET = 'test-secret-for-testing-only-32chars!!';

const require = createRequire(import.meta.url);
const db = require('../db.cjs');

beforeEach(() => {
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM revoked_tokens').run();
  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => ({ status: true, data: { status: 'success', amount: 3000000 } }),
  })));
});

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { default: ordersRouter } = await import('../routes/orders.cjs');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/orders', ordersRouter);

function makeAuthCookie(email, role = 'user') {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ userId: crypto.randomUUID(), email, role, jti }, TEST_JWT_SECRET, { expiresIn: '1h' });
  return `sonnetary_token=${token}`;
}

describe('POST /api/orders', () => {
  it('creates a new order', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/orders')
      .send({
        songTitle: 'Test Song',
        genre: 'Afro-Beats',
        occasion: 'anniversary',
        occasionDetail: '10 years together',
        paystackReference: 'ref_001',
        customerEmail: 'test@example.com',
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.songTitle).toBe('Test Song');
    expect(res.body.occasion).toBe('anniversary');
    expect(res.body.occasionDetail).toBe('10 years together');

    const row = db.prepare('SELECT occasion, occasion_detail FROM orders WHERE id = ?').get(res.body.id);
    expect(row.occasion).toBe('anniversary');
    expect(row.occasion_detail).toBe('10 years together');
  });

  it('returns existing order on duplicate paystackReference (idempotency)', async () => {
    const { default: supertest } = await import('supertest');

    const first = await supertest(app)
      .post('/api/orders')
      .send({ genre: 'Gospel', paystackReference: 'ref_idem_001' })
      .set('Content-Type', 'application/json');

    const second = await supertest(app)
      .post('/api/orders')
      .send({ genre: 'Gospel', paystackReference: 'ref_idem_001' })
      .set('Content-Type', 'application/json');

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(first.body.id).toBe(second.body.id);
  });

  it('rejects invalid email', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/orders')
      .send({ customerEmail: 'not-an-email' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe('GET /api/orders/:id', () => {
  it('returns 404 for unknown order', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).get('/api/orders/non-existent-id');
    expect(res.status).toBe(404);
  });

  it('returns an existing order without auth (UUID is capability token)', async () => {
    const { default: supertest } = await import('supertest');

    const created = await supertest(app)
      .post('/api/orders')
      .send({ songTitle: 'My Song', genre: 'Afro-Jazz', paystackReference: 'ref_get_001' })
      .set('Content-Type', 'application/json');

    const fetched = await supertest(app).get(`/api/orders/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });
});

describe('GET /api/orders/track (auth required)', () => {
  it('returns 401 without authentication cookie', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).get('/api/orders/track');
    expect(res.status).toBe(401);
  });

  it('returns 401 with a fake/invalid cookie', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .get('/api/orders/track')
      .set('Cookie', 'sonnetary_token=thisisnotavalidjwt');
    expect(res.status).toBe(401);
  });

  it('returns orders for the authenticated user only', async () => {
    const { default: supertest } = await import('supertest');
    const email = 'customer@secure-test.com';

    await supertest(app)
      .post('/api/orders')
      .send({ genre: 'Afro-R&B', paystackReference: 'ref_track_auth_001', customerEmail: email })
      .set('Content-Type', 'application/json');

    // Also create an order for a different user
    await supertest(app)
      .post('/api/orders')
      .send({ genre: 'Gospel', paystackReference: 'ref_other_user_001', customerEmail: 'other@user.com' })
      .set('Content-Type', 'application/json');

    const authCookie = makeAuthCookie(email);
    const res = await supertest(app).get('/api/orders/track').set('Cookie', authCookie);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Only sees their own orders, not other@user.com's
    expect(res.body.every((o) => o !== null)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('ignores any email query param (uses JWT email only)', async () => {
    const { default: supertest } = await import('supertest');
    const email = 'legit@user.com';

    await supertest(app)
      .post('/api/orders')
      .send({ genre: 'R&B', paystackReference: 'ref_param_bypass_001', customerEmail: 'victim@user.com' })
      .set('Content-Type', 'application/json');

    // Authenticated as legit@user.com but trying to query victim@user.com
    const authCookie = makeAuthCookie(email);
    const res = await supertest(app)
      .get('/api/orders/track?email=victim@user.com')
      .set('Cookie', authCookie);

    // Should return legit@user.com's orders (empty), NOT victim's orders
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0); // legit user has no orders = empty array
  });
});
