import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCheckoutConfig,
  paymentProviderFromGeo,
  reconcileCheckoutConfig,
  reconcilePaymentProvider,
} from './checkoutProvider';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkout payment provider resolution', () => {
  it('forces Paystack for Nigerian geo responses', () => {
    expect(paymentProviderFromGeo({ country: 'NG', isNigeria: true })).toBe('paystack');
  });

  it('keeps Stripe available for non-Nigerian geo responses', () => {
    expect(paymentProviderFromGeo({ country: 'US', isNigeria: false })).toBe('stripe');
  });

  it('defaults to Paystack when geo detection fails or returns no usable answer', () => {
    expect(paymentProviderFromGeo(null)).toBe('paystack');
    expect(paymentProviderFromGeo({})).toBe('paystack');
  });

  it('corrects a stale Stripe checkout brief to Paystack', () => {
    const brief = {
      customerEmail: 'customer@example.com',
      fastDelivery: false,
      paymentProvider: 'stripe' as const,
    };

    expect(reconcilePaymentProvider(brief, 'paystack')).toEqual({
      customerEmail: 'customer@example.com',
      fastDelivery: false,
      paymentProvider: 'paystack',
    });
  });
});

describe('fetchCheckoutConfig (server-side source of truth)', () => {
  it('returns the server config when the request succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ provider: 'stripe', currency: 'ngn', country: 'NG' }),
      }))
    );

    expect(await fetchCheckoutConfig()).toEqual({ provider: 'stripe', currency: 'ngn', country: 'NG' });
  });

  it('normalizes an unexpected currency value to ngn', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ provider: 'paystack', currency: 'weird', country: 'NG' }),
      }))
    );

    expect(await fetchCheckoutConfig()).toEqual({ provider: 'paystack', currency: 'ngn', country: 'NG' });
  });

  it('fails open to Paystack/NGN when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }))
    );

    expect(await fetchCheckoutConfig()).toEqual({ provider: 'paystack', currency: 'ngn' });
  });

  it('fails open to Paystack/NGN when fetch throws (offline/network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      })
    );

    expect(await fetchCheckoutConfig()).toEqual({ provider: 'paystack', currency: 'ngn' });
  });

  it('fails open when the response shape is unexpected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ nonsense: true }) }))
    );

    expect(await fetchCheckoutConfig()).toEqual({ provider: 'paystack', currency: 'ngn' });
  });
});

describe('reconcileCheckoutConfig', () => {
  it('updates both provider and currency when they drift from server config', () => {
    const brief = { paymentProvider: 'paystack' as const, currency: 'ngn' as const };
    const next = reconcileCheckoutConfig(brief, { provider: 'stripe', currency: 'usd' });
    expect(next).toEqual({ paymentProvider: 'stripe', currency: 'usd' });
  });

  it('returns the same reference when already in sync (avoids unnecessary re-saves)', () => {
    const brief = { paymentProvider: 'stripe' as const, currency: 'usd' as const };
    expect(reconcileCheckoutConfig(brief, { provider: 'stripe', currency: 'usd' })).toBe(brief);
  });

  it('handles the Stripe-for-Naira case: provider stripe, currency ngn', () => {
    const brief = { paymentProvider: 'paystack' as const, currency: 'ngn' as const };
    const next = reconcileCheckoutConfig(brief, { provider: 'stripe', currency: 'ngn' });
    expect(next).toEqual({ paymentProvider: 'stripe', currency: 'ngn' });
  });
});
