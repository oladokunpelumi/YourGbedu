import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-payments-${process.pid}-${crypto.randomUUID()}.db`));

const createSessionMock = vi.fn();
const retrieveSessionMock = vi.fn();
// Requests in this test have no real IP, so real geo detection would treat
// them as local/Nigerian. Inject a deterministic override so each test
// controls its own currency (module-mocking a sibling .cjs require proved
// unreliable across the CJS/ESM boundary — an explicit override is robust).
let geoResult = { country: 'US', isNigeria: false, source: 'mock' };
const detectCountryMock = vi.fn(async () => geoResult);

beforeEach(() => {
  createSessionMock.mockReset();
  retrieveSessionMock.mockReset();
  detectCountryMock.mockClear();
  geoResult = { country: 'US', isNigeria: false, source: 'mock' };
  vi.stubEnv('NGN_PAYMENT_PROVIDER', '');
});

const { default: express } = await import('express');
const { default: paymentsRouter } = await import('../routes/payments.cjs');
paymentsRouter.__setStripeClientForTests({
  checkout: {
    sessions: {
      create: createSessionMock,
      retrieve: retrieveSessionMock,
    },
  },
});
paymentsRouter.__setDetectCountryForTests(detectCountryMock);

const app = express();
app.use(express.json());
app.use('/api', paymentsRouter);

describe('POST /api/create-checkout-session', () => {
  it('creates an embedded Stripe Checkout session and returns its client secret', async () => {
    const { default: supertest } = await import('supertest');
    createSessionMock.mockResolvedValue({
      id: 'cs_test_embedded',
      client_secret: 'cs_secret_embedded',
      url: null,
    });

    const res = await supertest(app)
      .post('/api/create-checkout-session')
      .send({
        embedded: true,
        customerEmail: 'stripe@test.com',
        recipientType: 'Wife',
        genre: 'Afro-R&B',
        fastDelivery: false,
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sessionId: 'cs_test_embedded',
      clientSecret: 'cs_secret_embedded',
    });

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    const options = createSessionMock.mock.calls[0][0];
    expect(options.ui_mode).toBe('embedded');
    expect(options.return_url).toContain('/#/checkout/return?session_id={CHECKOUT_SESSION_ID}');
    expect(options.success_url).toBeUndefined();
    expect(options.cancel_url).toBeUndefined();
  });

  it('uses server-calculated promo pricing for Stripe fast delivery', async () => {
    const { default: supertest } = await import('supertest');
    createSessionMock.mockResolvedValue({
      id: 'cs_test_promo',
      client_secret: 'cs_secret_promo',
      url: null,
    });

    const res = await supertest(app)
      .post('/api/create-checkout-session')
      .send({
        embedded: true,
        customerEmail: 'promo@test.com',
        recipientType: 'Partner',
        genre: 'R&B',
        fastDelivery: true,
        amount: 1,
        promoCode: 'yourgbedu50',
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const options = createSessionMock.mock.calls[0][0];
    expect(options.line_items[0].price_data.unit_amount).toBe(3250);
    expect(options.metadata).toMatchObject({
      promoDiscountPercent: '50',
      originalAmount: '6500',
      discountedAmount: '3250',
    });
  });

  it('uses server-calculated full original pricing when fullPrice is requested without a promo', async () => {
    const { default: supertest } = await import('supertest');
    createSessionMock.mockResolvedValue({
      id: 'cs_test_full_price',
      client_secret: 'cs_secret_full_price',
      url: null,
    });

    const res = await supertest(app)
      .post('/api/create-checkout-session')
      .send({
        embedded: true,
        customerEmail: 'fullprice@test.com',
        recipientType: 'Friend',
        genre: 'Soul',
        fastDelivery: true,
        amount: 1,
        fullPrice: true,
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const options = createSessionMock.mock.calls[0][0];
    expect(options.line_items[0].price_data.unit_amount).toBe(6500);
    expect(options.metadata).toMatchObject({
      originalAmount: '6500',
      discountedAmount: '6500',
    });
    expect(options.metadata.promoDiscountPercent).toBe('');
  });

  it('charges NGN through Stripe when geo resolves Nigerian and NGN_PAYMENT_PROVIDER=stripe', async () => {
    vi.stubEnv('NGN_PAYMENT_PROVIDER', 'stripe');
    geoResult = { country: 'NG', isNigeria: true, source: 'mock' };
    const { default: supertest } = await import('supertest');
    createSessionMock.mockResolvedValue({
      id: 'cs_test_ngn',
      client_secret: 'cs_secret_ngn',
      url: null,
    });

    const res = await supertest(app)
      .post('/api/create-checkout-session')
      .send({
        embedded: true,
        customerEmail: 'naija@test.com',
        recipientType: 'Mother',
        genre: 'Highlife',
        fastDelivery: false,
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(200);
    const options = createSessionMock.mock.calls[0][0];
    expect(options.line_items[0].price_data.currency).toBe('ngn');
    expect(options.line_items[0].price_data.unit_amount).toBe(3_000_000);
    // NGN sessions omit payment_method_types so Checkout's dynamic payment
    // methods can surface ng_card — automatic_payment_methods is invalid here
    // (it's a Payment Intents field, confirmed via a live test-mode probe).
    expect(options.payment_method_types).toBeUndefined();
    expect(options.automatic_payment_methods).toBeUndefined();
    expect(options.metadata.currency).toBe('NGN');
  });

  it('ignores a client-supplied currency and derives it from server-side geo instead', async () => {
    geoResult = { country: 'US', isNigeria: false, source: 'mock' };
    const { default: supertest } = await import('supertest');
    createSessionMock.mockResolvedValue({ id: 'cs_test_spoof', client_secret: 'secret', url: null });

    await supertest(app)
      .post('/api/create-checkout-session')
      .send({
        embedded: true,
        customerEmail: 'spoof@test.com',
        recipientType: 'Friend',
        genre: 'Pop',
        fastDelivery: false,
        currency: 'ngn', // attempted client override — must be ignored
      })
      .set('Content-Type', 'application/json');

    const options = createSessionMock.mock.calls[0][0];
    expect(options.line_items[0].price_data.currency).toBe('usd');
    expect(options.payment_method_types).toEqual(['card']);
  });
});

describe('GET /api/checkout-config', () => {
  it('returns Paystack/NGN for Nigeria when NGN_PAYMENT_PROVIDER is unset', async () => {
    geoResult = { country: 'NG', isNigeria: true, source: 'mock' };
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).get('/api/checkout-config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'paystack', currency: 'ngn', country: 'NG' });
  });

  it('returns Stripe/NGN for Nigeria when NGN_PAYMENT_PROVIDER=stripe', async () => {
    vi.stubEnv('NGN_PAYMENT_PROVIDER', 'stripe');
    geoResult = { country: 'NG', isNigeria: true, source: 'mock' };
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).get('/api/checkout-config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'stripe', currency: 'ngn', country: 'NG' });
  });

  it('returns Stripe/USD outside Nigeria regardless of NGN_PAYMENT_PROVIDER', async () => {
    vi.stubEnv('NGN_PAYMENT_PROVIDER', 'stripe');
    geoResult = { country: 'GB', isNigeria: false, source: 'mock' };
    const { default: supertest } = await import('supertest');
    const res = await supertest(app).get('/api/checkout-config');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'stripe', currency: 'usd', country: 'GB' });
  });
});
