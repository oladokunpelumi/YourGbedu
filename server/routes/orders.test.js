/**
 * Integration tests for the orders API routes.
 *
 * Key security invariants tested:
 *  - GET /api/orders/track requires authentication (returns 401 without cookie)
 *  - Authenticated users can only see their own orders (uses email from JWT, not query param)
 *  - GET /api/orders/:id requires a per-order tracking token unless authenticated owner/admin
 *  - POST /api/orders is idempotent on duplicate payment references
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_mock');
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('JWT_SECRET', 'test-secret-for-testing-only-32chars!!');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-orders-${process.pid}-${crypto.randomUUID()}.db`));

const TEST_JWT_SECRET = 'test-secret-for-testing-only-32chars!!';

const stripeRetrieveMock = vi.fn();

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
  stripeRetrieveMock.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => ({
    json: async () => ({ status: true, data: { status: 'success', amount: 3000000 } }),
  })));
});

const { default: express } = await import('express');
const { default: cookieParser } = await import('cookie-parser');
const { default: ordersRouter } = await import('../routes/orders.cjs');
ordersRouter.__setStripeClientForTests({
  checkout: { sessions: { retrieve: (...args) => stripeRetrieveMock(...args) } },
});

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
    expect(res.body.trackingToken).toMatch(/^[a-f0-9]{32}$/);
    expect(sendConfirmationEmailMock).toHaveBeenCalledWith(expect.objectContaining({
      to: 'test@example.com',
      orderId: res.body.id,
      trackingToken: res.body.trackingToken,
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

  it('requires exactly one payment reference', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/orders')
      .send({ paystackReference: 'ref_both_001', stripeSessionId: 'cs_both_001' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
  });

  it('rejects a verified payment amount that does not match checkout pricing', async () => {
    const { default: supertest } = await import('supertest');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ status: true, data: { status: 'success', amount: 1, metadata: { fastDelivery: 'false' } } }),
    })));

    const res = await supertest(app)
      .post('/api/orders')
      .send({ genre: 'Afro-Beats', paystackReference: 'ref_underpay_001' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(402);
    expect(db.prepare('SELECT id FROM orders WHERE paystack_reference = ?').get('ref_underpay_001')).toBeUndefined();
  });

  it('creates a Stripe order charged in NGN (Naira-via-Stripe) when the session currency is ngn', async () => {
    const { default: supertest } = await import('supertest');
    stripeRetrieveMock.mockResolvedValue({
      payment_status: 'paid',
      amount_total: 3_000_000,
      currency: 'ngn',
      metadata: {
        customerEmail: 'naija@test.com',
        genre: 'Highlife',
        currency: 'NGN',
        originalAmount: '6000000',
        discountedAmount: '3000000',
      },
    });

    const res = await supertest(app)
      .post('/api/orders')
      .send({ genre: 'Highlife', stripeSessionId: 'cs_ngn_001', customerEmail: 'naija@test.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    const row = db.prepare('SELECT amount, stripe_session_id, customer_email FROM orders WHERE stripe_session_id = ?').get('cs_ngn_001');
    expect(row.amount).toBe(3_000_000);
    expect(row.customer_email).toBe('naija@test.com');
  });

  it('rejects a Stripe session whose metadata currency does not match what was actually charged', async () => {
    const { default: supertest } = await import('supertest');
    // Metadata claims USD pricing, but the session actually charged NGN — a
    // mismatch that could otherwise let a cheaper currency's amount pass validation.
    stripeRetrieveMock.mockResolvedValue({
      payment_status: 'paid',
      amount_total: 2_500,
      currency: 'ngn',
      metadata: {
        customerEmail: 'mismatch@test.com',
        currency: 'USD',
        originalAmount: '5000',
        discountedAmount: '2500',
      },
    });

    const res = await supertest(app)
      .post('/api/orders')
      .send({ genre: 'Pop', stripeSessionId: 'cs_currency_mismatch_001', customerEmail: 'mismatch@test.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(402);
    expect(db.prepare('SELECT id FROM orders WHERE stripe_session_id = ?').get('cs_currency_mismatch_001')).toBeUndefined();
  });
});

describe('POST /api/orders/free', () => {
  it('creates an order with a one-time 100% promo code and marks it used', async () => {
    const { default: supertest } = await import('supertest');
    const promo = await createOneTimeFreeCode();

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
    const promo = await createOneTimeFreeCode();

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

  it('treats the full order UUID as an access capability; short ids stay protected', async () => {
    const { default: supertest } = await import('supertest');

    const created = await supertest(app)
      .post('/api/orders')
      .send({ songTitle: 'My Song', genre: 'Afro-Jazz', paystackReference: 'ref_get_001' })
      .set('Content-Type', 'application/json');

    // Full UUID = 122 bits of entropy = unguessable capability, so it grants
    // read access on its own (this is what lets customers track by order ID
    // without an email round-trip).
    const byUuidOnly = await supertest(app).get(`/api/orders/${created.body.id}`);
    const withToken = await supertest(app).get(`/api/orders/${created.body.id}?t=${created.body.trackingToken}`);
    // The enumerable 8-char short id must never resolve here, token or not.
    const shortId = await supertest(app).get(`/api/orders/${created.body.id.slice(0, 8)}?t=${created.body.trackingToken}`);

    expect(byUuidOnly.status).toBe(200);
    expect(byUuidOnly.body.id).toBe(created.body.id);
    expect(withToken.status).toBe(200);
    expect(shortId.status).toBe(404);
    expect(withToken.body.currentStep).toBe(1);
    expect(withToken.body.steps).toHaveLength(3);
    expect(withToken.body.steps.map((step) => step.title)).toEqual([
      'Order Received',
      'Song Composing',
      'Final Mastering',
    ]);
  });

  it('allows an authenticated owner to fetch their order without the URL token', async () => {
    const { default: supertest } = await import('supertest');
    const email = 'owner@example.com';

    const created = await supertest(app)
      .post('/api/orders')
      .send({ songTitle: 'Owner Song', genre: 'R&B', paystackReference: 'ref_owner_001', customerEmail: email })
      .set('Content-Type', 'application/json');

    const fetched = await supertest(app)
      .get(`/api/orders/${created.body.id}`)
      .set('Cookie', makeAuthCookie(email));

    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });
});

describe('POST /api/orders/lookup (guest tracking by order number + email)', () => {
  it('resolves a short order number paired with the matching email', async () => {
    const { default: supertest } = await import('supertest');
    const email = 'guest@example.com';

    const created = await supertest(app)
      .post('/api/orders')
      .send({ songTitle: 'Guest Song', genre: 'Soul', paystackReference: 'ref_lookup_001', customerEmail: email })
      .set('Content-Type', 'application/json');

    const shortRef = `#${created.body.id.slice(0, 8).toUpperCase()}`;
    const res = await supertest(app)
      .post('/api/orders/lookup')
      .send({ reference: shortRef, email: 'Guest@Example.COM' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.trackingToken).toBe(created.body.trackingToken);
  });

  it('rejects a short order number with the wrong email', async () => {
    const { default: supertest } = await import('supertest');

    const created = await supertest(app)
      .post('/api/orders')
      .send({ songTitle: 'Guest Song', genre: 'Soul', paystackReference: 'ref_lookup_002', customerEmail: 'right@example.com' })
      .set('Content-Type', 'application/json');

    const res = await supertest(app)
      .post('/api/orders/lookup')
      .send({ reference: created.body.id.slice(0, 8), email: 'wrong@example.com' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(404);
  });

  it('rejects malformed input', async () => {
    const { default: supertest } = await import('supertest');
    const res = await supertest(app)
      .post('/api/orders/lookup')
      .send({ reference: 'abc', email: 'not-an-email' })
      .set('Content-Type', 'application/json');
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/orders/:id/rating', () => {
  it('accepts the full-UUID capability or the tracking token; rejects unresolvable ids', async () => {
    const { default: supertest } = await import('supertest');

    const created = await supertest(app)
      .post('/api/orders')
      .send({ genre: 'Soul', paystackReference: 'ref_rating_001' })
      .set('Content-Type', 'application/json');

    // The full UUID is the same unguessable capability the share link carries,
    // so it can rate without the explicit ?t= token.
    const byUuid = await supertest(app)
      .patch(`/api/orders/${created.body.id}/rating`)
      .send({ rating: 4 });
    const withToken = await supertest(app)
      .patch(`/api/orders/${created.body.id}/rating?t=${created.body.trackingToken}`)
      .send({ rating: 5 });
    const shortId = await supertest(app)
      .patch(`/api/orders/${created.body.id.slice(0, 8)}/rating?t=${created.body.trackingToken}`)
      .send({ rating: 1 });

    expect(byUuid.status).toBe(200);
    expect(withToken.status).toBe(200);
    expect(shortId.status).toBe(404);
    expect(db.prepare('SELECT rating FROM orders WHERE id = ?').get(created.body.id).rating).toBe(5);
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
