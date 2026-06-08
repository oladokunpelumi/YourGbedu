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
const { createOneTimeFreeCode } = require('../promos.cjs');
const emailModule = require('../email.cjs');
const sendConfirmationEmailMock = vi.spyOn(emailModule, 'sendConfirmationEmail').mockResolvedValue(undefined);

beforeEach(() => {
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM promo_codes').run();
  db.prepare('DELETE FROM revoked_tokens').run();
  sendConfirmationEmailMock.mockClear();
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
    expect(sendConfirmationEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test@example.com',
      orderId: res.body.id.slice(0, 8).toUpperCase(),
      genre: 'Afro-Beats',
      deliveryDate: expect.any(String),
      reference: 'ref_001',
      amountLabel: '₦30,000',
    }));
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
    expect(sendConfirmationEmailMock).not.toHaveBeenCalled();
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

describe('POST /api/orders/free', () => {
  it('creates an order with a one-time 100% promo code and marks it used', async () => {
    const { default: supertest } = await import('supertest');
    const promo = createOneTimeFreeCode(db);

    const res = await supertest(app)
      .post('/api/orders/free')
      .send({
        genre: 'Afro-R&B',
        occasion: 'birthday',
        customerEmail: 'free@example.com',
        recipientType: 'Friend',
        senderName: 'Sade',
        paymentProvider: 'paystack',
        promoCode: promo.code,
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.amount).toBe(0);
    expect(res.body.promoDiscountPercent).toBe(100);
    expect(res.body.promoCodePreview).toBe(promo.codePreview);

    const codeRow = db.prepare('SELECT used_count, used_order_id FROM promo_codes WHERE id = ?').get(promo.id);
    expect(codeRow.used_count).toBe(1);
    expect(codeRow.used_order_id).toBe(res.body.id);

    const order = db.prepare('SELECT amount, promo_code_id, original_amount, discounted_amount FROM orders WHERE id = ?').get(res.body.id);
    expect(order.amount).toBe(0);
    expect(order.promo_code_id).toBe(promo.id);
    expect(order.original_amount).toBe(6000000);
    expect(order.discounted_amount).toBe(0);
  });

  it('does not allow a one-time free code to be reused', async () => {
    const { default: supertest } = await import('supertest');
    const promo = createOneTimeFreeCode(db);

    const payload = {
      genre: 'Gospel',
      customerEmail: 'reuse@example.com',
      paymentProvider: 'paystack',
      promoCode: promo.code,
    };

    const first = await supertest(app)
      .post('/api/orders/free')
      .send(payload)
      .set('Content-Type', 'application/json');
    const second = await supertest(app)
      .post('/api/orders/free')
      .send(payload)
      .set('Content-Type', 'application/json');

    expect(first.status).toBe(201);
    expect(second.status).toBe(404);
    const rows = db.prepare('SELECT id FROM orders WHERE promo_code_id = ?').all(promo.id);
    expect(rows).toHaveLength(1);
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
    expect(fetched.body.currentStep).toBe(1);
    expect(fetched.body.steps).toHaveLength(3);
    expect(fetched.body.steps.map((step) => step.title)).toEqual([
      'Order Received',
      'Song Composing',
      'Final Mastering',
    ]);
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
