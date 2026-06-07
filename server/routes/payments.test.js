import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';

vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock');
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-payments-${process.pid}-${crypto.randomUUID()}.db`));

const createSessionMock = vi.fn();
const retrieveSessionMock = vi.fn();

beforeEach(() => {
  createSessionMock.mockReset();
  retrieveSessionMock.mockReset();
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
});
