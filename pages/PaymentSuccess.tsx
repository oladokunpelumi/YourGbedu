import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const BRIEF_DRAFT_STORAGE_KEY = 'yourgbedu_brief_draft';

const PaymentSuccess: React.FC = () => {
  const [status, setStatus] = useState<'creating' | 'success' | 'error'>('creating');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [deliveryLabel, setDeliveryLabel] = useState('48 hours');
  const [errorMessage, setErrorMessage] = useState(
    "We couldn't verify your payment or create your order. Please contact support if you were charged."
  );
  const location = useLocation();
  const navigate = useNavigate();

  const hashParams = new URLSearchParams(location.search);
  const stripeSessionId = hashParams.get('session_id');
  const urlParams = new URLSearchParams(window.location.search);
  const paystackReference = urlParams.get('reference') || urlParams.get('trxref');
  const hasReference = !!(stripeSessionId || paystackReference);

  useEffect(() => {
    if (!hasReference) return;

    const briefRaw = sessionStorage.getItem('yourgbedu_brief');
    const brief = briefRaw ? JSON.parse(briefRaw) : {};

    const finalize = (id: string, token?: string | null) => {
      setOrderId(id);
      setTrackingToken(token || null);
      setStatus('success');
      sessionStorage.setItem('yourgbedu_track_id', id);
      if (token) sessionStorage.setItem('yourgbedu_track_token', token);
      sessionStorage.removeItem('yourgbedu_brief');
      sessionStorage.removeItem(BRIEF_DRAFT_STORAGE_KEY);
      const tokenParam = token ? `&t=${encodeURIComponent(token)}` : '';
      setTimeout(() => {
        navigate(`/track?id=${encodeURIComponent(id)}${tokenParam}`, { replace: false });
      }, 4000);
    };

    const createOrder = async () => {
      try {
        if (stripeSessionId) {
          const verifyRes = await fetch(`/api/verify-session/${stripeSessionId}`);
          const verifyData = await verifyRes.json().catch(() => null);
          if (!verifyRes.ok || !verifyData?.paid) {
            setErrorMessage(verifyData?.error || 'Stripe verification failed.');
            setStatus('error');
            return;
          }

          setAmountPaid(
            typeof verifyData.amount === 'number'
              ? `$${(verifyData.amount / 100).toFixed(2)} USD`
              : '$25 USD'
          );

          const meta = verifyData.metadata || {};
          const fastDelivery = brief.fastDelivery || meta.fastDelivery === 'true';
          setDeliveryLabel(fastDelivery ? '24 hours' : '48 hours');
          const orderRes = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              songTitle: 'Custom Song',
              genre: brief.genre || meta.genre || '',
              occasion: brief.occasion || meta.occasion || '',
              occasionDetail: brief.occasionDetail || meta.occasionDetail || '',
              stripeSessionId,
              customerEmail: brief.customerEmail || verifyData.customerEmail || meta.customerEmail || '',
              recipientType: brief.recipientType || meta.recipientType || '',
              senderName: brief.senderName || meta.senderName || '',
              voiceGender: brief.voiceGender || meta.voiceGender || '',
              specialQualities: brief.specialQualities || meta.specialQualities || '',
              favoriteMemories: brief.favoriteMemories || meta.favoriteMemories || '',
              specialMessage: brief.specialMessage || meta.specialMessage || '',
              fastDelivery,
            }),
          });

          const orderData = await orderRes.json().catch(() => null);
          if (!orderRes.ok) {
            setErrorMessage(orderData?.error || 'Payment was verified, but the order could not be created.');
            setStatus('error');
            return;
          }
          finalize(orderData.id, orderData.trackingToken);
        } else {
          const verifyRes = await fetch(`/api/paystack/verify/${paystackReference}`);
          const verifyData = await verifyRes.json().catch(() => null);
          if (!verifyRes.ok || !verifyData?.paid) {
            setErrorMessage(verifyData?.error || verifyData?.message || 'Paystack verification failed.');
            setStatus('error');
            return;
          }

          setAmountPaid(
            typeof verifyData.amount === 'number'
              ? `₦${(verifyData.amount / 100).toLocaleString('en-NG')}`
              : '₦30,000'
          );

          const fastDelivery =
            brief.fastDelivery ||
            verifyData.metadata?.fastDelivery === true ||
            verifyData.metadata?.fastDelivery === 'true';
          setDeliveryLabel(fastDelivery ? '24 hours' : '48 hours');

          const orderRes = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              songTitle: 'Custom Song',
              genre: brief.genre || verifyData.metadata?.genre || '',
              occasion: brief.occasion || verifyData.metadata?.occasion || '',
              occasionDetail: brief.occasionDetail || verifyData.metadata?.occasionDetail || '',
              paystackReference,
              customerEmail: brief.customerEmail || verifyData.metadata?.customerEmail || '',
              recipientType: brief.recipientType || verifyData.metadata?.recipientType || '',
              senderName: brief.senderName || verifyData.metadata?.senderName || '',
              voiceGender: brief.voiceGender || verifyData.metadata?.voiceGender || '',
              specialQualities: brief.specialQualities || verifyData.metadata?.specialQualities || '',
              favoriteMemories: brief.favoriteMemories || verifyData.metadata?.favoriteMemories || '',
              specialMessage: brief.specialMessage || verifyData.metadata?.specialMessage || '',
              fastDelivery,
            }),
          });

          const orderData = await orderRes.json().catch(() => null);
          if (!orderRes.ok) {
            setErrorMessage(orderData?.error || 'Payment was verified, but the order could not be created.');
            setStatus('error');
            return;
          }
          finalize(orderData.id, orderData.trackingToken);
        }
      } catch (err) {
        console.error('Order creation error:', err);
        setErrorMessage('Network error while creating your order. Please check your connection and try again.');
        setStatus('error');
      }
    };

    void createOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasReference]);

  if (!hasReference || status === 'creating' || status === 'error') {
    const isError = !hasReference || status === 'error';
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center bg-ivory px-6 py-24 text-center">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${isError ? 'bg-red-50 text-red-600' : 'bg-terracotta-pale text-terracotta'}`}>
          <span className={`material-symbols-outlined text-5xl ${status === 'creating' ? 'animate-spin' : ''}`} aria-hidden="true">
            {isError ? 'error' : 'progress_activity'}
          </span>
        </div>
        <h1 className="mt-6 font-headline text-5xl font-medium leading-none text-ink">
          {isError ? (status === 'error' ? 'Verification failed' : 'Something went wrong') : 'Confirming payment'}
        </h1>
        <p className="mt-4 max-w-md text-base leading-7 text-ink-soft">
          {isError
            ? status === 'error'
              ? errorMessage
              : 'No payment reference was provided in the URL.'
            : 'Please wait while we verify your payment and set up your song.'}
        </p>
        {isError && (
          <Link
            to="/create"
            className="mt-7 rounded-full bg-ink px-7 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
          >
            Try again
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="bg-ivory px-5 py-12 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-6xl overflow-hidden rounded-[1.5rem] border border-line bg-cream lg:grid-cols-[1fr_0.8fr]">
        <div className="p-6 sm:p-10 lg:p-14">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sage-pale text-sage-dark">
            <span className="material-symbols-outlined text-5xl" aria-hidden="true">
              task_alt
            </span>
          </div>
          <h1 className="mt-7 font-headline text-6xl font-medium leading-none text-ink">
            Payment successful
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-ink-soft">
            Your story is now in the hands of our artists. We have begun setting up your custom song
            and will open your order tracker shortly.
          </p>

          <div className="mt-8 max-w-lg rounded-2xl border border-line bg-ivory p-5">
            {[
              ['Order ID', `${orderId?.slice(0, 8).toUpperCase()}...`],
              ['Amount paid', amountPaid],
              ['Payment via', stripeSessionId ? 'Stripe' : 'Paystack'],
              ['Build window', deliveryLabel],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-line py-3 first:pt-0 last:border-b-0 last:pb-0">
                <span className="font-label text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                  {label}
                </span>
                <span className="text-right font-body text-sm font-bold text-ink">{value}</span>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to={orderId ? `/track?id=${encodeURIComponent(orderId)}${trackingToken ? `&t=${encodeURIComponent(trackingToken)}` : ''}` : '/track'}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-7 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
            >
              Track order
            </Link>
            <Link
              to="/"
              className="inline-flex min-h-12 items-center justify-center rounded-full border border-line-strong px-7 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
            >
              Home
            </Link>
          </div>
        </div>

        <img
          src="/images/Composing.webp"
          alt="A YourGbedu production scene"
          loading="lazy"
          decoding="async"
          className="hidden h-full min-h-[520px] w-full object-cover sepia-[0.12] lg:block"
        />
      </div>
    </div>
  );
};

export default PaymentSuccess;
