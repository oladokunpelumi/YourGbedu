/**
 * Integration tests for the Paystack API routes.
 *
 * Key security invariants tested:
 *  - Webhook rejects requests with no x-paystack-signature header
 *  - Webhook rejects requests whose HMAC signature does not match
 *  - Webhook accepts requests with a valid HMAC-SHA512 signature
 *  - charge.success creates an order in the database
 *  - Duplicate paystack_reference is silently ignored (idempotency)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_mock_secret_key');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('JWT_SECRET', 'test-secret-for-testing-only-32chars!!');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-paystack-${process.pid}-${crypto.randomUUID()}.db`));

const PAYSTACK_SECRET = 'sk_test_mock_secret_key';
const require = createRequire(import.meta.url);
const db = require('../db.cjs');
const emailModule = require('../email.cjs');
const geminiModule = require('../services/gemini.cjs');
const sendConfirmationEmailMock = vi.spyOn(emailModule, 'sendConfirmationEmail').mockResolvedValue(undefined);
const generateProductionBriefMock = vi.spyOn(geminiModule, 'generateProductionBrief').mockResolvedValue('Mock AI brief');

beforeEach(() => {
  db.prepare('DELETE FROM orders').run();
  sendConfirmationEmailMock.mockClear();
  generateProductionBriefMock.mockClear();
});

const { default: express } = await import('express');
const { default: paystackRouter } = await import('../routes/paystack.cjs');

// The webhook route reads req.body as a raw Buffer, so we mount the router
// with express.raw() rather than express.json().
const app = express();
app.use('/api/paystack/webhook', express.raw({ type: '*/*' }), paystackRouter);
app.use('/api/paystack', express.json(), paystackRouter);

function makeSignature(body) {
  return crypto.createHmac('sha512', PAYSTACK_SECRET).update(body).digest('hex');
}

function makeChargeSuccessPayload(reference, overrides = {}) {
  return JSON.stringify({
    event: 'charge.success',
    data: {
      reference,
      amount: 3000000,
      customer: { email: 'customer@test.com' },
      metadata: {
        genre: 'Afro-Beats',
        customerEmail: 'customer@test.com',
        ...overrides,
      },
    },
  });
}

describe('POST /api/paystack/initialize', () => {
  it('returns access_code, reference, and hosted fallback URL', async () => {
    const { default: supertest } = await import('supertest');
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/mock',
          access_code: 'access_mock_123',
          reference: 'ref_inline_123',
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await supertest(app)
      .post('/api/paystack/initialize')
      .send({
        email: 'checkout@test.com',
        metadata: { genre: 'Afro-Beats', fastDelivery: false },
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      authorization_url: 'https://checkout.paystack.com/mock',
      access_code: 'access_mock_123',
      reference: 'ref_inline_123',
    });
  });

  it('uses server-calculated promo pricing and ignores client amount', async () => {
    const { default: supertest } = await import('supertest');
    const fetchMock = vi.fn(async () => ({
      json: async () => ({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/mock',
          access_code: 'access_mock_promo',
          reference: 'ref_inline_promo',
        },
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await supertest(app)
      .post('/api/paystack/initialize')
      .send({
        email: 'promo@test.com',
        amount: 1,
        promoCode: 'yourgbedu50',
        metadata: { genre: 'Afro-Beats', fastDelivery: true, promoDiscountPercent: '100' },
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.amount).toBe(4000000);
    expect(body.metadata).toMatchObject({
      promoDiscountPercent: '50',
      originalAmount: '8000000',
      discountedAmount: '4000000',
    });
  });
});

describe('POST /api/paystack/webhook — signature verification', () => {
  it('returns 401 when x-paystack-signature header is missing', async () => {
    const { default: supertest } = await import('supertest');
    const body = makeChargeSuccessPayload('ref_sig_missing');

    const res = await supertest(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/missing signature/i);
  });

  it('returns 401 when the signature is incorrect (tampered body)', async () => {
    const { default: supertest } = await import('supertest');
    const body = makeChargeSuccessPayload('ref_tampered');
    const wrongSig = makeSignature(body + ' tampered');

    const res = await supertest(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', wrongSig)
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid signature/i);
  });

  it('returns 401 when the signature is a random string', async () => {
    const { default: supertest } = await import('supertest');
    const body = makeChargeSuccessPayload('ref_random_sig');

    const res = await supertest(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', 'deadbeefdeadbeef')
      .send(body);

    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid HMAC-SHA512 signature', async () => {
    const { default: supertest } = await import('supertest');
    const body = makeChargeSuccessPayload('ref_valid_sig');
    const sig = makeSignature(body);

    const res = await supertest(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    expect(res.status).toBe(200);
  });
});

describe('POST /api/paystack/webhook — charge.success order creation', () => {
  it('creates an order in the database on charge.success', async () => {
    const { default: supertest } = await import('supertest');
    const reference = 'ref_order_create_001';
    const body = makeChargeSuccessPayload(reference, { genre: 'Gospel', customerEmail: 'gospel@test.com' });
    const sig = makeSignature(body);

    const res = await supertest(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    expect(res.status).toBe(200);

    // Give the synchronous DB insert time to run (webhook responds before DB work)
    await new Promise((r) => setTimeout(r, 50));

    const order = db
      .prepare('SELECT * FROM orders WHERE paystack_reference = ?')
      .get(reference);

    expect(order).toBeTruthy();
    expect(order.paystack_reference).toBe(reference);
    expect(order.genre).toBe('Gospel');
    expect(order.customer_email).toBe('gospel@test.com');
    expect(order.status).toBe('in_production');
  });

  it('does NOT create a duplicate order for a repeated reference (idempotency)', async () => {
    const { default: supertest } = await import('supertest');
    const reference = 'ref_idempotent_001';
    const body = makeChargeSuccessPayload(reference);
    const sig = makeSignature(body);

    const sendWebhook = () =>
      supertest(app)
        .post('/api/paystack/webhook')
        .set('Content-Type', 'application/json')
        .set('x-paystack-signature', sig)
        .send(body);

    const first = await sendWebhook();
    const second = await sendWebhook();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const rows = db
      .prepare('SELECT id FROM orders WHERE paystack_reference = ?')
      .all(reference);

    expect(rows.length).toBe(1);
  });

  it('stores the correct amount from the webhook payload', async () => {
    const { default: supertest } = await import('supertest');
    const reference = 'ref_amount_check_001';
    const body = JSON.stringify({
      event: 'charge.success',
      data: {
        reference,
        amount: 5000000,
        customer: { email: 'amount@test.com' },
        metadata: { genre: 'Afro-R&B', customerEmail: 'amount@test.com' },
      },
    });
    const sig = makeSignature(body);

    await supertest(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    await new Promise((r) => setTimeout(r, 50));

    const order = db
      .prepare('SELECT amount FROM orders WHERE paystack_reference = ?')
      .get(reference);

    expect(order?.amount).toBe(5000000);
  });

  it('ignores unknown event types without creating an order', async () => {
    const { default: supertest } = await import('supertest');
    const reference = 'ref_unknown_event';
    const body = JSON.stringify({
      event: 'transfer.success',
      data: { reference, amount: 100, customer: { email: 'x@test.com' }, metadata: {} },
    });
    const sig = makeSignature(body);

    const res = await supertest(app)
      .post('/api/paystack/webhook')
      .set('Content-Type', 'application/json')
      .set('x-paystack-signature', sig)
      .send(body);

    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const order = db
      .prepare('SELECT id FROM orders WHERE paystack_reference = ?')
      .get(reference);

    expect(order).toBeUndefined();
  });
});
