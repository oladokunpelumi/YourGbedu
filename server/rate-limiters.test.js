import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const express = require('express');
const supertest = require('supertest');
const { createRateLimiters } = require('./rate-limiters.cjs');

function createTestApp({ isProd = true } = {}) {
  const {
    generalApiLimiter,
    authLimiter,
    stripePaymentLimiter,
    paystackPaymentLimiter,
  } = createRateLimiters({
    isProd,
    limits: {
      generalApi: 1,
      auth: 1,
      stripePayment: 1,
      paystackPayment: 1,
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/geo', (_req, res) => res.json({ country: 'NG', isNigeria: true }));
  app.use('/api', generalApiLimiter);
  app.get('/api/general', (_req, res) => res.json({ ok: true }));
  app.get('/api/admin/orders', (_req, res) => res.json({ data: [] }));
  app.use('/api/auth', authLimiter);
  app.post('/api/auth/login', (_req, res) => res.json({ ok: true }));
  app.use(['/api/create-checkout-session', '/api/verify-session'], stripePaymentLimiter);
  app.post('/api/create-checkout-session', (_req, res) => res.json({ ok: true }));
  app.get('/api/verify-session/:id', (_req, res) => res.json({ paid: true }));
  app.use('/api/paystack', paystackPaymentLimiter);
  app.post('/api/paystack/initialize', (_req, res) => res.json({ ok: true }));
  app.get('/api/paystack/verify/:reference', (_req, res) => res.json({ paid: true }));

  return supertest(app);
}

describe('scoped API rate limiters', () => {
  it('does not block geo detection when the general API bucket is exhausted', async () => {
    const request = createTestApp();

    expect((await request.get('/api/general')).status).toBe(200);
    expect((await request.get('/api/general')).status).toBe(429);

    const geo = await request.get('/api/geo/country');
    expect(geo.status).toBe(200);
    expect(geo.body).toMatchObject({ country: 'NG', isNigeria: true });
  });

  it('keeps Stripe, Paystack, auth, and general API buckets separate', async () => {
    const request = createTestApp();

    expect((await request.get('/api/general')).status).toBe(200);
    expect((await request.get('/api/general')).status).toBe(429);

    expect((await request.post('/api/paystack/initialize')).status).toBe(200);
    expect((await request.post('/api/paystack/initialize')).status).toBe(429);

    expect((await request.post('/api/create-checkout-session')).status).toBe(200);
    expect((await request.post('/api/create-checkout-session')).status).toBe(429);

    expect((await request.post('/api/auth/login')).status).toBe(200);
    expect((await request.post('/api/auth/login')).status).toBe(429);
  });

  it('does not throttle local admin polling through the general API limiter', async () => {
    const request = createTestApp({ isProd: false });

    expect((await request.get('/api/general')).status).toBe(200);
    expect((await request.get('/api/general')).status).toBe(429);
    expect((await request.get('/api/admin/orders')).status).toBe(200);
  });
});
