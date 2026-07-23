import type { Currency, PaymentProvider } from '../constants';

export interface GeoCountryResponse {
  country?: string;
  isNigeria?: boolean | null;
  source?: string;
}

export interface CheckoutConfig {
  provider: PaymentProvider;
  currency: Currency;
  country?: string;
}

/**
 * Server-side source of truth for provider + currency. Replaces client-side
 * geo inference — the client can no longer pick its own currency/provider,
 * since that decision now also depends on the NGN_PAYMENT_PROVIDER env switch
 * (Paystack vs. Stripe-for-Naira), which only the server knows.
 */
export async function fetchCheckoutConfig(): Promise<CheckoutConfig> {
  try {
    const response = await fetch('/api/checkout-config');
    if (!response.ok) throw new Error('checkout-config request failed');
    const data = (await response.json()) as Partial<CheckoutConfig>;
    if (data.provider === 'stripe' || data.provider === 'paystack') {
      return {
        provider: data.provider,
        currency: data.currency === 'usd' ? 'usd' : 'ngn',
        country: data.country,
      };
    }
    throw new Error('checkout-config returned an unexpected shape');
  } catch {
    // Fail open: Paystack/NGN, matching the server's own fail-open geo default.
    return { provider: 'paystack', currency: 'ngn' };
  }
}

/** @deprecated Superseded by fetchCheckoutConfig — kept for the tests that
 * document the (now server-side) fail-open behavior. */
export function paymentProviderFromGeo(data: GeoCountryResponse | null | undefined): PaymentProvider {
  return data?.isNigeria === false ? 'stripe' : 'paystack';
}

export function reconcilePaymentProvider<T extends { paymentProvider: PaymentProvider }>(
  brief: T,
  provider: PaymentProvider
): T {
  return brief.paymentProvider === provider ? brief : { ...brief, paymentProvider: provider };
}

export function reconcileCheckoutConfig<T extends { paymentProvider: PaymentProvider; currency: Currency }>(
  brief: T,
  config: CheckoutConfig
): T {
  if (brief.paymentProvider === config.provider && brief.currency === config.currency) return brief;
  return { ...brief, paymentProvider: config.provider, currency: config.currency };
}
