import { describe, expect, it } from 'vitest';
import { paymentProviderFromGeo, reconcilePaymentProvider } from './checkoutProvider';

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
