import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loadStripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { PaymentProvider, getDiscountedPrice } from '../constants';
import { paymentProviderFromGeo, reconcilePaymentProvider } from '../services/checkoutProvider';

type CheckoutStatus = 'loading' | 'ready' | 'processing' | 'success' | 'error';

const FULL_PRICE_STORAGE_KEY = 'yourgbedu_pay_full_price';

interface CheckoutBrief {
  recipientType: string;
  recipientName: string;
  occasion: string;
  occasionDetail?: string;
  senderName: string;
  genre: string;
  voiceGender: string;
  specialQualities: string;
  favoriteMemories: string;
  specialMessage: string;
  customerEmail: string;
  fastDelivery: boolean;
  paymentProvider: PaymentProvider;
}

interface PromoQuote {
  provider: PaymentProvider;
  currency: 'NGN' | 'USD';
  unit: 'kobo' | 'cents';
  fullPrice?: boolean;
  originalAmount: number;
  currentAmount: number;
  finalAmount: number;
  promo: {
    id: string | null;
    type: 'standard' | 'one_time_free' | 'stored';
    codePreview: string;
    discountPercent: number;
  } | null;
}

function readPayFullPriceFlag() {
  try {
    return window.localStorage.getItem(FULL_PRICE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function clearPayFullPriceFlag() {
  try {
    window.localStorage.removeItem(FULL_PRICE_STORAGE_KEY);
  } catch {
    // localStorage may be unavailable; not fatal.
  }
}

declare global {
  interface Window {
    PaystackPop?: new () => {
      resumeTransaction: (
        accessCode: string | { accessCode: string; [key: string]: unknown },
        callbacks?: PaystackCallbacks
      ) => PaystackTransaction | void;
    };
  }
}

interface PaystackCallbacks {
  onSuccess?: (response: { reference?: string; status?: string }) => void;
  onCancel?: () => void;
  onError?: (error: { message?: string }) => void;
  onLoad?: () => void;
}

interface PaystackTransaction {
  getStatus?: () => Promise<{ status?: string; response?: { reference?: string } }>;
}

const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : Promise.resolve(null);

function getApiError(data: unknown, fallback: string) {
  let message = fallback;
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    message = data.error;
  } else if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    message = data.message;
  }

  if (/too many requests|rate limit/i.test(message) && message !== fallback) {
    return `${fallback} ${message}`;
  }
  return message;
}

function readBrief(): CheckoutBrief | null {
  const raw = sessionStorage.getItem('yourgbedu_brief');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CheckoutBrief>;
    if (!parsed.customerEmail) return null;
    const paymentProvider = parsed.paymentProvider === 'stripe' ? 'stripe' : 'paystack';
    return {
      recipientType: parsed.recipientType || '',
      recipientName: parsed.recipientName || '',
      occasion: parsed.occasion || '',
      occasionDetail: parsed.occasionDetail || '',
      senderName: parsed.senderName || '',
      genre: parsed.genre || '',
      voiceGender: parsed.voiceGender || '',
      specialQualities: parsed.specialQualities || '',
      favoriteMemories: parsed.favoriteMemories || '',
      specialMessage: parsed.specialMessage || '',
      customerEmail: parsed.customerEmail,
      fastDelivery: Boolean(parsed.fastDelivery),
      paymentProvider,
    };
  } catch {
    return null;
  }
}

function saveBrief(brief: CheckoutBrief) {
  sessionStorage.setItem('yourgbedu_brief', JSON.stringify(brief));
}

function loadScript(src: string, id: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.body.appendChild(script);
  });
}

function formatOccasion(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCheckoutAmount(provider: PaymentProvider, amount: number) {
  if (provider === 'stripe') {
    const value = amount / 100;
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `₦${(amount / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

const Checkout: React.FC = () => {
  const [brief, setBrief] = useState<CheckoutBrief | null>(() => readBrief());
  const [status, setStatus] = useState<CheckoutStatus>('loading');
  const [message, setMessage] = useState('Preparing secure checkout...');
  const [providerResolved, setProviderResolved] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [activePromoCode, setActivePromoCode] = useState('');
  const [promoQuote, setPromoQuote] = useState<PromoQuote | null>(null);
  const [promoMessage, setPromoMessage] = useState('');
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [payFullPrice, setPayFullPrice] = useState(readPayFullPriceFlag);
  const [paystackInline, setPaystackInline] = useState<{
    accessCode: string;
    reference: string;
  } | null>(null);
  const stripeMountRef = useRef<HTMLDivElement | null>(null);
  const stripeCheckoutRef = useRef<StripeEmbeddedCheckout | null>(null);
  const initializedRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const returnedStripeSessionId = query.get('session_id');
  const displayBrief = brief && !providerResolved && !returnedStripeSessionId
    ? { ...brief, paymentProvider: 'paystack' as PaymentProvider }
    : brief;
  const providerLabel = displayBrief?.paymentProvider === 'stripe' ? 'Stripe' : 'Paystack';
  const price = displayBrief ? getDiscountedPrice(displayBrief.paymentProvider, displayBrief.fastDelivery) : null;
  const isFullPriceCheckout = payFullPrice && !promoQuote?.promo;
  const displayTotal = displayBrief && promoQuote
    ? formatCheckoutAmount(displayBrief.paymentProvider, promoQuote.finalAmount)
    : isFullPriceCheckout
      ? price?.original
      : price?.current;
  const displayOriginal = displayBrief && promoQuote
    ? formatCheckoutAmount(displayBrief.paymentProvider, promoQuote.originalAmount)
    : isFullPriceCheckout
      ? undefined
      : price?.original;

  const finalizeOrder = useCallback(
    (id: string, trackingToken?: string | null) => {
      setOrderId(id);
      setTrackingToken(trackingToken || null);
      setStatus('success');
      setMessage('Payment confirmed. Your production order is ready.');
      sessionStorage.setItem('yourgbedu_track_id', id);
      if (trackingToken) sessionStorage.setItem('yourgbedu_track_token', trackingToken);
      sessionStorage.removeItem('yourgbedu_brief');
      clearPayFullPriceFlag();
      const tokenParam = trackingToken ? `&t=${encodeURIComponent(trackingToken)}` : '';
      setTimeout(() => navigate(`/track?id=${encodeURIComponent(id)}${tokenParam}`, { replace: false }), 3500);
    },
    [navigate]
  );

  const createOrderFromPayment = useCallback(
    async (
      provider: PaymentProvider,
      reference: string,
      verifyData: {
        amount?: number;
        customerEmail?: string;
        metadata?: Record<string, unknown>;
      }
    ) => {
      const meta = verifyData.metadata || {};
      const source = brief || {
        recipientType: String(meta.recipientType || ''),
        recipientName: String(meta.recipientName || ''),
        occasion: String(meta.occasion || ''),
        occasionDetail: String(meta.occasionDetail || ''),
        senderName: String(meta.senderName || ''),
        genre: String(meta.genre || ''),
        voiceGender: String(meta.voiceGender || ''),
        specialQualities: String(meta.specialQualities || ''),
        favoriteMemories: String(meta.favoriteMemories || ''),
        specialMessage: String(meta.specialMessage || ''),
        customerEmail: String(verifyData.customerEmail || meta.customerEmail || ''),
        fastDelivery: meta.fastDelivery === true || meta.fastDelivery === 'true',
        paymentProvider: provider,
      };

      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songTitle: 'Custom Song',
          genre: source.genre || meta.genre || '',
          occasion: source.occasion || meta.occasion || '',
          occasionDetail: source.occasionDetail || meta.occasionDetail || '',
          stripeSessionId: provider === 'stripe' ? reference : undefined,
          paystackReference: provider === 'paystack' ? reference : undefined,
          customerEmail: source.customerEmail || verifyData.customerEmail || meta.customerEmail || '',
          recipientType: source.recipientType || meta.recipientType || '',
          recipientName: source.recipientName || meta.recipientName || '',
          senderName: source.senderName || meta.senderName || '',
          voiceGender: source.voiceGender || meta.voiceGender || '',
          specialQualities: source.specialQualities || meta.specialQualities || '',
          favoriteMemories: source.favoriteMemories || meta.favoriteMemories || '',
          specialMessage: source.specialMessage || meta.specialMessage || '',
          fastDelivery: source.fastDelivery || meta.fastDelivery === true || meta.fastDelivery === 'true',
        }),
      });

      const orderData = await orderRes.json().catch(() => null);
      if (!orderRes.ok) {
        throw new Error(getApiError(orderData, 'Payment was verified, but the order could not be created.'));
      }

      finalizeOrder(orderData.id, orderData.trackingToken);
    },
    [brief, finalizeOrder]
  );

  const verifyPaystack = useCallback(
    async (reference: string) => {
      setStatus('processing');
      setMessage('Verifying Paystack payment...');
      const verifyRes = await fetch(`/api/paystack/verify/${encodeURIComponent(reference)}`);
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok) throw new Error(getApiError(verifyData, 'Paystack verification failed.'));
      if (!verifyData.paid) throw new Error(verifyData.message || 'Paystack has not confirmed this payment yet.');
      await createOrderFromPayment('paystack', reference, verifyData);
    },
    [createOrderFromPayment]
  );

  const verifyStripe = useCallback(
    async (sessionId: string) => {
      setStatus('processing');
      setMessage('Verifying Stripe payment...');
      const verifyRes = await fetch(`/api/verify-session/${encodeURIComponent(sessionId)}`);
      const verifyData = await verifyRes.json().catch(() => null);
      if (!verifyRes.ok) throw new Error(getApiError(verifyData, 'Stripe verification failed.'));
      if (!verifyData.paid) throw new Error('Stripe has not confirmed this payment yet.');
      await createOrderFromPayment('stripe', sessionId, verifyData);
    },
    [createOrderFromPayment]
  );

  const createFreeOrder = useCallback(
    async (code: string) => {
      if (!brief) return;

      stripeCheckoutRef.current?.destroy();
      stripeCheckoutRef.current = null;
      setPaystackInline(null);
      setStatus('processing');
      setMessage('Promo accepted. Creating your order...');

      const orderRes = await fetch('/api/orders/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          songTitle: 'Custom Song',
          genre: brief.genre,
          occasion: brief.occasion,
          occasionDetail: brief.occasionDetail,
          customerEmail: brief.customerEmail,
          recipientType: brief.recipientType,
          recipientName: brief.recipientName,
          senderName: brief.senderName,
          voiceGender: brief.voiceGender,
          specialQualities: brief.specialQualities,
          favoriteMemories: brief.favoriteMemories,
          specialMessage: brief.specialMessage,
          fastDelivery: brief.fastDelivery,
          paymentProvider: brief.paymentProvider,
          promoCode: code,
        }),
      });

      const orderData = await orderRes.json().catch(() => null);
      if (!orderRes.ok) {
        throw new Error(getApiError(orderData, 'Could not complete free checkout.'));
      }

      finalizeOrder(orderData.id, orderData.trackingToken);
    },
    [brief, finalizeOrder]
  );

  const startPaystackCheckout = useCallback(async (code = '') => {
    if (!brief) return;

    setMessage('Preparing Paystack checkout...');
    setPaystackInline(null);
    const response = await fetch('/api/paystack/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: brief.customerEmail,
        metadata: brief,
        promoCode: code || undefined,
        fullPrice: !code && payFullPrice,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(getApiError(data, 'Could not initialize Paystack checkout.'));

    if (!data.access_code) {
      throw new Error('Paystack did not return an inline checkout access code. Please refresh and try again.');
    }

    await loadScript('https://js.paystack.co/v2/inline.js', 'paystack-inline-js');
    if (!window.PaystackPop) {
      throw new Error('Paystack checkout could not be loaded. Please refresh and try again.');
    }

    setPaystackInline({
      accessCode: data.access_code,
      reference: data.reference,
    });
    setStatus('ready');
    setMessage('Your payment is encrypted and processed by Paystack. YourGbedu never stores card details.');
  }, [brief, payFullPrice]);

  const launchPaystackCheckout = useCallback(() => {
    if (!paystackInline) return;
    if (!window.PaystackPop) {
      setStatus('error');
      setMessage('Paystack checkout is not ready. Please refresh and try again.');
      return;
    }

    const callbacks: PaystackCallbacks = {
      onSuccess: (response) => {
        const reference = response.reference || paystackInline.reference;
        if (reference) void verifyPaystack(reference).catch((err) => {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Could not verify payment.');
        });
      },
      onCancel: () => {
        setStatus('ready');
        setMessage('Payment was cancelled. You can try again when ready.');
      },
      onError: (error) => {
        setStatus('error');
        setMessage(error.message || 'Paystack checkout failed. Please try again.');
      },
    };

    const popup = new window.PaystackPop();
    let transaction: PaystackTransaction | void;
    try {
      transaction = popup.resumeTransaction(paystackInline.accessCode, callbacks);
    } catch {
      transaction = popup.resumeTransaction({ accessCode: paystackInline.accessCode, ...callbacks });
    }

    if (transaction?.getStatus) {
      const stopAt = Date.now() + 10 * 60 * 1000;
      const poll = window.setInterval(() => {
        if (Date.now() > stopAt) {
          window.clearInterval(poll);
          return;
        }
        transaction
          ?.getStatus?.()
          .then((result) => {
            if (result.status !== 'success') return;
            window.clearInterval(poll);
            void verifyPaystack(result.response?.reference || paystackInline.reference);
          })
          .catch(() => undefined);
      }, 3000);
    }
  }, [paystackInline, verifyPaystack]);

  const startStripeCheckout = useCallback(async (code = '') => {
    if (!brief) return;

    setMessage('Preparing Stripe checkout...');
    stripeCheckoutRef.current?.destroy();
    stripeCheckoutRef.current = null;
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...brief,
        embedded: true,
        promoCode: code || undefined,
        fullPrice: !code && payFullPrice,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(getApiError(data, 'Could not initialize Stripe checkout.'));

    if (!data.clientSecret || !data.sessionId) {
      throw new Error('Stripe did not return an embedded checkout session. Please refresh and try again.');
    }

    const stripe = await stripePromise;
    if (!stripe) {
      throw new Error('Stripe is not configured. Please refresh and try again.');
    }

    const embeddedCheckout = await stripe.initEmbeddedCheckout({
      clientSecret: data.clientSecret,
      onComplete: () => {
        void verifyStripe(data.sessionId).catch((err) => {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Could not verify payment.');
        });
      },
    });

    stripeCheckoutRef.current = embeddedCheckout;
    if (stripeMountRef.current) {
      embeddedCheckout.mount(stripeMountRef.current);
      setStatus('ready');
      setMessage('Your payment is encrypted and processed by Stripe. YourGbedu never stores card details.');
    }
  }, [brief, payFullPrice, verifyStripe]);

  const restartCheckout = useCallback(
    async (code = '') => {
      if (!brief) return;
      setStatus('loading');
      const start = brief.paymentProvider === 'stripe' ? startStripeCheckout : startPaystackCheckout;
      await start(code);
    },
    [brief, startPaystackCheckout, startStripeCheckout]
  );

  const applyPromoCode = useCallback(async () => {
    if (!brief) return;
    const code = promoCode.trim();
    if (!code) {
      setPromoMessage('Enter a promo code first.');
      return;
    }

    setIsApplyingPromo(true);
    setPromoMessage('');
    try {
      const response = await fetch('/api/promos/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoCode: code,
          paymentProvider: brief.paymentProvider,
          fastDelivery: brief.fastDelivery,
          fullPrice: false,
        }),
      });
      const quote = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiError(quote, 'Could not apply promo code.'));

      setPromoQuote(quote);
      setActivePromoCode(code);
      setPayFullPrice(false);
      clearPayFullPriceFlag();
      setPromoMessage(
        quote.finalAmount === 0
          ? '100% promo applied. Completing your order now.'
          : `${quote.promo?.discountPercent || 0}% promo applied. Total updated to ${formatCheckoutAmount(brief.paymentProvider, quote.finalAmount)}.`
      );

      if (quote.finalAmount === 0) {
        await createFreeOrder(code);
      } else {
        await restartCheckout(code);
      }
    } catch (err) {
      setPromoQuote(null);
      setActivePromoCode('');
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Could not apply promo code.');
      setPromoMessage(err instanceof Error ? err.message : 'Could not apply promo code.');
    } finally {
      setIsApplyingPromo(false);
    }
  }, [brief, createFreeOrder, promoCode, restartCheckout]);

  const removePromoCode = useCallback(async () => {
    setPromoCode('');
    setActivePromoCode('');
    setPromoQuote(null);
    const restoredFullPrice = readPayFullPriceFlag();
    setPayFullPrice(restoredFullPrice);
    setPromoMessage(restoredFullPrice ? 'Promo removed. Full price restored.' : 'Promo removed. Checkout total restored.');
    await restartCheckout('');
  }, [restartCheckout]);

  useEffect(() => {
    if (!brief || providerResolved || returnedStripeSessionId) return;
    let cancelled = false;

    const resolveProvider = async () => {
      setMessage('Confirming local checkout provider...');
      let provider: PaymentProvider = 'paystack';

      try {
        const response = await fetch('/api/geo/country');
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(getApiError(data, 'Geo detection failed.'));
        provider = paymentProviderFromGeo(data);
      } catch {
        provider = 'paystack';
      }

      if (cancelled) return;
      setBrief((current) => {
        if (!current) return current;
        const next = reconcilePaymentProvider(current, provider);
        if (next !== current) saveBrief(next);
        return next;
      });
      setProviderResolved(true);
    };

    void resolveProvider();

    return () => {
      cancelled = true;
    };
  }, [brief, providerResolved, returnedStripeSessionId]);

  useEffect(() => {
    if (initializedRef.current) return;

    if (returnedStripeSessionId) {
      initializedRef.current = true;
      const verifyReturnedPayment = async () => {
        try {
          await verifyStripe(returnedStripeSessionId);
        } catch (err) {
          setStatus('error');
          setMessage(err instanceof Error ? err.message : 'Could not verify Stripe payment.');
        }
      };

      void verifyReturnedPayment();
      return;
    }

    if (!brief) {
      initializedRef.current = true;
      sessionStorage.setItem('yourgbedu_checkout_error', 'Please complete your song brief before checkout.');
      navigate('/create', { replace: true });
      return;
    }

    if (!providerResolved) return;

    initializedRef.current = true;
    const start = brief.paymentProvider === 'stripe' ? startStripeCheckout : startPaystackCheckout;
    void start().catch((err) => {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Could not start checkout.');
    });
  }, [brief, navigate, providerResolved, returnedStripeSessionId, startPaystackCheckout, startStripeCheckout, verifyStripe]);

  useEffect(() => {
    return () => {
      stripeCheckoutRef.current?.destroy();
    };
  }, []);

  // Auto-apply promo when arriving from the email-capture popup with ?promo=CODE.
  // Step 1: seed the input. Step 2: fire the existing apply flow once state has settled.
  const autoPromoSeededRef = useRef(false);
  const autoPromoAppliedRef = useRef(false);
  useEffect(() => {
    if (autoPromoSeededRef.current) return;
    const urlPromo = query.get('promo');
    if (!urlPromo || !brief) return;
    clearPayFullPriceFlag();
    setPayFullPrice(false);
    autoPromoSeededRef.current = true;
    setPromoCode(urlPromo);
  }, [query, brief]);

  useEffect(() => {
    if (autoPromoAppliedRef.current) return;
    if (!autoPromoSeededRef.current) return;
    if (!providerResolved && !returnedStripeSessionId) return;
    if (!brief || activePromoCode || isApplyingPromo || !promoCode) return;
    const urlPromo = query.get('promo');
    if (!urlPromo || urlPromo !== promoCode) return;
    autoPromoAppliedRef.current = true;
    void applyPromoCode();
  }, [query, brief, promoCode, activePromoCode, isApplyingPromo, providerResolved, returnedStripeSessionId, applyPromoCode]);

  if (!brief && !returnedStripeSessionId) {
    return null;
  }

  return (
    <div className="bg-ivory px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto grid min-h-[calc(100vh-96px)] max-w-6xl gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="self-start rounded-2xl border border-line bg-cream p-6">
          <p className="editorial-kicker">Secure checkout</p>
          <h1 className="mt-4 font-headline text-5xl font-medium leading-none text-ink">
            Finish your <em className="text-terracotta">song order</em>
          </h1>
          <p className="mt-4 text-sm leading-6 text-ink-soft">
            Your payment is encrypted and processed by {providerLabel}. YourGbedu never stores card details.
          </p>

          {brief && price && (
            <>
              <div className="mt-8 rounded-2xl border border-line bg-ivory p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-label text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                      Total
                    </p>
                    <p className="mt-1 font-headline text-4xl font-semibold text-ink">
                      {displayTotal}
                    </p>
                    {displayOriginal && (
                      <p className="mt-1 text-sm text-ink-muted line-through">{displayOriginal}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-mustard px-3 py-1 font-label text-xs font-bold uppercase tracking-[0.12em] text-ink">
                    {promoQuote?.promo ? `${promoQuote.promo.discountPercent}% off` : isFullPriceCheckout ? 'Full price' : 'Discounted'}
                  </span>
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  {brief.fastDelivery
                    ? `Built and delivered in 24 hours via ${providerLabel}.`
                    : `Built and delivered in 48 hours via ${providerLabel}.`}
                </p>
              </div>

              <form
                className="mt-4 rounded-2xl border border-line bg-ivory p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void applyPromoCode();
                }}
              >
                <label htmlFor="promo-code" className="font-label text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                  Promo code
                </label>
                <div className="mt-3 flex gap-2">
                  <input
                    id="promo-code"
                    type="text"
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value)}
                    disabled={status === 'success' || isApplyingPromo}
                    className="min-w-0 flex-1 rounded-xl border border-line bg-cream px-3 py-2.5 font-body text-sm font-semibold uppercase text-ink placeholder:normal-case placeholder:text-ink-muted focus:border-terracotta focus:outline-none focus:ring-4 focus:ring-terracotta/10 disabled:opacity-60"
                    placeholder="Enter code"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    disabled={isApplyingPromo || status === 'success'}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-4 font-label text-xs font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isApplyingPromo ? 'Applying' : 'Apply'}
                  </button>
                </div>
                {activePromoCode && promoQuote?.promo && (
                  <button
                    type="button"
                    onClick={() => void removePromoCode()}
                    disabled={isApplyingPromo || status === 'success'}
                    className="mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1 font-label text-xs font-bold text-ink-soft transition-colors hover:bg-cream hover:text-terracotta disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      close
                    </span>
                    Remove {promoQuote.promo.codePreview}
                  </button>
                )}
                {promoMessage && (
                  <p className={`mt-3 text-sm font-medium ${promoQuote?.promo ? 'text-sage-dark' : 'text-terracotta'}`}>
                    {promoMessage}
                  </p>
                )}
              </form>

              <dl className="mt-6 space-y-4 text-sm">
                {[
                  [
                    'For',
                    brief.recipientName && brief.recipientType !== 'Yourself'
                      ? `${brief.recipientName} (${brief.recipientType})`
                      : brief.recipientType,
                  ],
                  ['From', brief.senderName],
                  ['Style', brief.genre],
                  ['Occasion', brief.occasionDetail || formatOccasion(brief.occasion)],
                  ['Email', brief.customerEmail],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 border-b border-line pb-3">
                    <dt className="font-label text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                      {label}
                    </dt>
                    <dd className="max-w-[190px] text-right font-body font-semibold text-ink">
                      {value || '-'}
                    </dd>
                  </div>
                ))}
              </dl>

              <Link
                to="/create"
                className="mt-6 inline-flex items-center gap-2 rounded-full px-3 py-2 font-label text-sm font-bold text-ink-soft transition-colors hover:bg-ivory hover:text-terracotta"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  edit
                </span>
                Return to edit your brief
              </Link>
            </>
          )}
        </aside>

        <section className="rounded-2xl border border-line bg-cream p-5 sm:p-8">
          <div className="mb-6 flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="editorial-kicker">{providerLabel} payment</p>
              <h2 className="mt-3 font-headline text-4xl font-medium leading-none text-ink">
                {promoQuote?.finalAmount === 0 ? 'Completing order' : 'Complete payment'}
              </h2>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-ivory px-4 py-2 text-sm font-semibold text-ink-soft">
              <span className="material-symbols-outlined text-lg text-terracotta" aria-hidden="true">
                lock
              </span>
              Provider-secured
            </div>
          </div>

          <div role="status" className="mb-5 rounded-xl border border-line bg-ivory px-4 py-3 text-sm text-ink-soft">
            {message}
          </div>

          {status === 'success' ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
              <span className="material-symbols-outlined text-7xl text-sage" aria-hidden="true">
                check_circle
              </span>
              <h3 className="mt-5 font-headline text-5xl font-medium leading-none text-ink">
                Payment confirmed
              </h3>
              <p className="mt-3 max-w-md text-ink-soft">
                Your order is ready. We are opening your tracker now.
              </p>
              {orderId && (
                <Link to={`/track?id=${encodeURIComponent(orderId)}${trackingToken ? `&t=${encodeURIComponent(trackingToken)}` : ''}`} className="mt-6 rounded-full bg-ink px-6 py-3 font-label text-sm font-bold uppercase tracking-[0.12em] text-cream">
                  Open tracker
                </Link>
              )}
            </div>
          ) : (
            <>
              {displayBrief?.paymentProvider === 'stripe' ? (
                <div
                  ref={stripeMountRef}
                  className="min-h-[520px] overflow-hidden rounded-2xl border border-line bg-white p-2"
                  aria-label="Stripe embedded checkout"
                />
              ) : (
                <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-line bg-ivory px-6 text-center">
                  <span className="material-symbols-outlined text-6xl text-terracotta" aria-hidden="true">
                    payments
                  </span>
                  <h3 className="mt-4 font-headline text-4xl font-medium leading-none text-ink">
                    Paystack checkout is ready
                  </h3>
                  <p className="mt-3 max-w-md text-ink-soft">
                    Paystack may open a secure payment layer for card, bank transfer, USSD, or mobile authentication.
                  </p>
                  <button
                    type="button"
                    onClick={launchPaystackCheckout}
                    disabled={status === 'processing'}
                    className="mt-6 rounded-full bg-terracotta px-8 py-4 font-label text-sm font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta-dark disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {status === 'processing' ? 'Processing...' : `Pay ${displayTotal || ''}`}
                  </button>
                </div>
              )}

              {status === 'error' && (
                <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                  <p className="mb-3">{message}</p>
                  <button
                    type="button"
                    onClick={() => void restartCheckout(activePromoCode)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-4 py-2 font-label text-xs font-bold uppercase tracking-[0.12em] text-red-700 transition-colors hover:bg-red-200"
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">refresh</span>
                    Try again
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default Checkout;
