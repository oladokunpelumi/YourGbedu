import type { PaymentProvider } from '../constants';

export interface GeoCountryResponse {
  country?: string;
  isNigeria?: boolean | null;
  source?: string;
}

export function paymentProviderFromGeo(data: GeoCountryResponse | null | undefined): PaymentProvider {
  return data?.isNigeria === false ? 'stripe' : 'paystack';
}

export function reconcilePaymentProvider<T extends { paymentProvider: PaymentProvider }>(
  brief: T,
  provider: PaymentProvider
): T {
  return brief.paymentProvider === provider ? brief : { ...brief, paymentProvider: provider };
}
