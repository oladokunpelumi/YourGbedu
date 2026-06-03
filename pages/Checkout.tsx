import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { loadStripe, type StripeEmbeddedCheckout } from '@stripe/stripe-js';
import { PaymentProvider, getDiscountedPrice } from '../constants';

type CheckoutStatus = 'loading' | 'ready' | 'processing' | 'success' | 'error';

interface CheckoutBrief {
  recipientType: string;
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
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    return data.error;
  }
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }
  return fallback;
}

function readBrief(): CheckoutBrief | null {
  const raw = sessionStorage.getItem('yourgbedu_brief');
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CheckoutBrief>;
    if (!parsed.customerEmail || !parsed.paymentProvider) return null;
    return {
      recipientType: parsed.recipientType || '',
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
      paymentProvider: parsed.paymentProvider,
    };
  } catch {
    return null;
  }
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

const Checkout: React.FC = () => {
  const [brief] = useState<CheckoutBrief | null>(() => readBrief());
  const [status, setStatus] = useState<CheckoutStatus>('loading');
  const [message, setMessage] = useState('Preparing secure checkout...');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [hostedFallbackUrl, setHostedFallbackUrl] = useState<string | null>(null);
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
  const providerLabel = brief?.paymentProvider === 'stripe' ? 'Stripe' : 'Paystack';
  const price = brief ? getDiscountedPrice(brief.paymentProvider, brief.fastDelivery) : null;

  const finalizeOrder = useCallback(
    (id: string) => {
      setOrderId(id);
      setStatus('success');
      setMessage('Payment confirmed. Your production order is ready.');
      sessionStorage.setItem('yourgbedu_track_id', id);
      sessionStorage.removeItem('yourgbedu_brief');
      setTimeout(() => navigate(`/track?id=${id}`, { replace: false }), 3500);
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

      finalizeOrder(orderData.id);
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

  const startPaystackCheckout = useCallback(async () => {
    if (!brief) return;

    setMessage('Preparing Paystack checkout...');
    const response = await fetch('/api/paystack/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: brief.customerEmail, metadata: brief }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(getApiError(data, 'Could not initialize Paystack checkout.'));

    if (data.authorization_url) setHostedFallbackUrl(data.authorization_url);
    if (!data.access_code) {
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
        return;
      }
      throw new Error('Paystack did not return an inline checkout access code.');
    }

    await loadScript('https://js.paystack.co/v2/inline.js', 'paystack-inline-js');
    if (!window.PaystackPop) {
      throw new Error('Paystack checkout could not be loaded.');
    }

    setPaystackInline({
      accessCode: data.access_code,
      reference: data.reference,
    });
    setStatus('ready');
    setMessage('Pay securely without leaving YourGbedu.');
  }, [brief]);

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

  const startStripeCheckout = useCallback(async () => {
    if (!brief) return;

    const loadHostedFallback = async () => {
      const fallbackRes = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...brief, embedded: false }),
      });
      const fallbackData = await fallbackRes.json().catch(() => null);
      if (fallbackRes.ok && fallbackData?.url) setHostedFallbackUrl(fallbackData.url);
    };

    setMessage('Preparing Stripe checkout...');
    const response = await fetch('/api/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...brief, embedded: true }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(getApiError(data, 'Could not initialize Stripe checkout.'));

    if (data.url) setHostedFallbackUrl(data.url);
    if (!data.clientSecret || !data.sessionId) {
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Stripe did not return an embedded checkout session.');
    }

    const stripe = await stripePromise;
    if (!stripe) {
      await loadHostedFallback();
      throw new Error('Stripe publishable key is not configured.');
    }

    let embeddedCheckout: StripeEmbeddedCheckout;
    try {
      embeddedCheckout = await stripe.initEmbeddedCheckout({
        clientSecret: data.clientSecret,
        onComplete: () => {
          void verifyStripe(data.sessionId).catch((err) => {
            setStatus('error');
            setMessage(err instanceof Error ? err.message : 'Could not verify payment.');
          });
        },
      });
    } catch (err) {
      await loadHostedFallback();
      throw err;
    }

    stripeCheckoutRef.current = embeddedCheckout;
    if (stripeMountRef.current) {
      embeddedCheckout.mount(stripeMountRef.current);
      setStatus('ready');
      setMessage('Complete payment securely through Stripe.');
    }
  }, [brief, verifyStripe]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (returnedStripeSessionId) {
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
      sessionStorage.setItem('yourgbedu_checkout_error', 'Please complete your song brief before checkout.');
      navigate('/create', { replace: true });
      return;
    }

    const start = brief.paymentProvider === 'stripe' ? startStripeCheckout : startPaystackCheckout;
    void start().catch((err) => {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Could not start checkout.');
    });
  }, [brief, navigate, returnedStripeSessionId, startPaystackCheckout, startStripeCheckout, verifyStripe]);

  useEffect(() => {
    return () => {
      stripeCheckoutRef.current?.destroy();
    };
  }, []);

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
            Your payment is handled by {providerLabel}. YourGbedu never stores card details.
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
                      {price.current}
                    </p>
                  </div>
                  <span className="rounded-full bg-mustard px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-ink">
                    Discounted
                  </span>
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  {brief.fastDelivery
                    ? `Built and delivered in 24 hours via ${providerLabel}.`
                    : `Built and delivered in 48 hours via ${providerLabel}.`}
                </p>
              </div>

              <dl className="mt-6 space-y-4 text-sm">
                {[
                  ['For', brief.recipientType],
                  ['From', brief.senderName],
                  ['Style', brief.genre],
                  ['Voice', brief.voiceGender],
                  ['Occasion', brief.occasionDetail || formatOccasion(brief.occasion)],
                  ['Email', brief.customerEmail],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-4 border-b border-line pb-3">
                    <dt className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
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
                Complete payment
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
                <Link to={`/track?id=${orderId}`} className="mt-6 rounded-full bg-ink px-6 py-3 font-label text-sm font-bold uppercase tracking-[0.12em] text-cream">
                  Open tracker
                </Link>
              )}
            </div>
          ) : (
            <>
              {brief?.paymentProvider === 'stripe' ? (
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
                    {status === 'processing' ? 'Processing...' : `Pay ${price?.current || ''}`}
                  </button>
                </div>
              )}

              {status === 'error' && (
                <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                  {message}
                </div>
              )}

              {hostedFallbackUrl && (
                <a
                  href={hostedFallbackUrl}
                  className="mt-5 inline-flex items-center gap-2 rounded-full px-3 py-2 font-label text-sm font-bold text-ink-soft transition-colors hover:bg-ivory hover:text-terracotta"
                >
                  Open secure hosted checkout instead
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    open_in_new
                  </span>
                </a>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default Checkout;
