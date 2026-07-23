import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('DB_PATH', path.join(os.tmpdir(), `sonnetary-promos-${process.pid}-${crypto.randomUUID()}.db`));

const require = createRequire(import.meta.url);
const db = require('./db.cjs');
const { quoteCheckout, createOneTimeFreeCode } = require('./promos.cjs');

beforeEach(() => {
  db.prepare('DELETE FROM promo_codes').run();
});

describe('promo checkout quotes', () => {
  it('applies the reusable 50% code against original NGN standard pricing', async () => {
    const quote = await quoteCheckout({
      provider: 'paystack',
      fastDelivery: false,
      promoCode: ' yourgbedu50 ',
    });

    expect(quote.originalAmount).toBe(6000000);
    expect(quote.currentAmount).toBe(3000000);
    expect(quote.finalAmount).toBe(3000000);
    expect(quote.promo.discountPercent).toBe(50);
  });

  it('applies the reusable 50% code against original USD fast-delivery pricing', async () => {
    const quote = await quoteCheckout({
      provider: 'stripe',
      fastDelivery: true,
      promoCode: 'YOURGBEDU50',
    });

    expect(quote.originalAmount).toBe(6500);
    expect(quote.currentAmount).toBe(4000);
    expect(quote.finalAmount).toBe(3250);
    expect(quote.promo.discountPercent).toBe(50);
  });

  it('quotes one-time free codes as 100% off', async () => {
    const code = await createOneTimeFreeCode();
    const quote = await quoteCheckout({
      provider: 'paystack',
      fastDelivery: true,
      promoCode: code.code,
    });

    expect(quote.originalAmount).toBe(8000000);
    expect(quote.finalAmount).toBe(0);
    expect(quote.promo.id).toBe(code.id);
    expect(quote.promo.discountPercent).toBe(100);
  });

  it('quotes full-price checkout at the original site price when no promo is applied', async () => {
    const quote = await quoteCheckout({
      provider: 'stripe',
      fastDelivery: true,
      fullPrice: true,
    });

    expect(quote.originalAmount).toBe(6500);
    expect(quote.currentAmount).toBe(4000);
    expect(quote.finalAmount).toBe(6500);
    expect(quote.fullPrice).toBe(true);
    expect(quote.promo).toBeNull();
  });

  it('lets a real promo override full-price checkout mode', async () => {
    const quote = await quoteCheckout({
      provider: 'paystack',
      fastDelivery: true,
      fullPrice: true,
      promoCode: 'YOURGBEDU50',
    });

    expect(quote.originalAmount).toBe(8000000);
    expect(quote.currentAmount).toBe(5000000);
    expect(quote.finalAmount).toBe(4000000);
    expect(quote.fullPrice).toBe(false);
    expect(quote.promo.discountPercent).toBe(50);
  });
});

describe('currency is decoupled from provider (Stripe-for-Naira)', () => {
  it('charges NGN pricing through Stripe when currency=ngn is explicit', async () => {
    const quote = await quoteCheckout({
      provider: 'stripe',
      currency: 'ngn',
      fastDelivery: false,
    });

    expect(quote.currency).toBe('NGN');
    expect(quote.unit).toBe('kobo');
    expect(quote.originalAmount).toBe(6000000);
    expect(quote.finalAmount).toBe(3000000);
  });

  it('still defaults a bare "stripe" call (no explicit currency) to USD for backward compatibility', async () => {
    const quote = await quoteCheckout({ provider: 'stripe', fastDelivery: false });
    expect(quote.currency).toBe('USD');
    expect(quote.finalAmount).toBe(2500);
  });

  it('applies the 50% promo identically to NGN-via-Stripe as NGN-via-Paystack', async () => {
    const viaStripe = await quoteCheckout({ provider: 'stripe', currency: 'ngn', fastDelivery: true, promoCode: 'YOURGBEDU50' });
    const viaPaystack = await quoteCheckout({ provider: 'paystack', fastDelivery: true, promoCode: 'YOURGBEDU50' });

    expect(viaStripe.finalAmount).toBe(viaPaystack.finalAmount);
    expect(viaStripe.originalAmount).toBe(viaPaystack.originalAmount);
  });

  it('quoteMetadata carries the currency for downstream amount validation', async () => {
    const { quoteMetadata } = require('./promos.cjs');
    const quote = await quoteCheckout({ provider: 'stripe', currency: 'ngn', fastDelivery: false });
    expect(quoteMetadata(quote).currency).toBe('NGN');
  });
});
