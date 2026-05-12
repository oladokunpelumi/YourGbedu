import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const PaymentSuccess: React.FC = () => {
  const [status, setStatus] = useState<'creating' | 'success' | 'error'>('creating');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState<string>('');
  const [deliveryLabel, setDeliveryLabel] = useState('~3 days');
  const [errorMessage, setErrorMessage] = useState(
    "We couldn't verify your payment or create your order. Please contact support if you were charged."
  );
  const location = useLocation();
  const navigate = useNavigate();

  // Stripe: session_id is inside the hash (we control the success URL format)
  // so location.search from React Router works correctly.
  const hashParams = new URLSearchParams(location.search);
  const stripeSessionId = hashParams.get('session_id');

  // Paystack: appends params BEFORE the hash, so use window.location.search
  const urlParams = new URLSearchParams(window.location.search);
  const paystackReference = urlParams.get('reference') || urlParams.get('trxref');

  const hasReference = !!(stripeSessionId || paystackReference);

  useEffect(() => {
    if (!hasReference) return;

    const briefRaw = sessionStorage.getItem('yourgbedu_brief');
    const brief = briefRaw ? JSON.parse(briefRaw) : {};

    const finalize = (id: string) => {
      setOrderId(id);
      setStatus('success');
      sessionStorage.setItem('yourgbedu_track_id', id);
      sessionStorage.removeItem('yourgbedu_brief');
      setTimeout(() => {
        navigate(`/track?id=${id}`, { replace: false });
      }, 4000);
    };

    const createOrder = async () => {
      try {
        if (stripeSessionId) {
          // ── Stripe flow ─────────────────────────────────────────
          const verifyRes = await fetch(`/api/verify-session/${stripeSessionId}`);
          if (!verifyRes.ok) {
            const data = await verifyRes.json().catch(() => null);
            setErrorMessage(data?.error || 'Stripe verification failed.');
            setStatus('error');
            return;
          }
          const verifyData = await verifyRes.json();

          if (!verifyData.paid) {
            setErrorMessage('Stripe has not marked this payment as paid yet.');
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
          setDeliveryLabel(fastDelivery ? '24 hours' : '~3 days');
          const orderRes = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              songTitle: 'Custom Song',
              genre: brief.genre || meta.genre || '',
              occasion: brief.occasion || meta.occasion || '',
              occasionDetail: brief.occasionDetail || meta.occasionDetail || '',
              stripeSessionId,
              customerEmail:
                brief.customerEmail || verifyData.customerEmail || meta.customerEmail || '',
              recipientType: brief.recipientType || meta.recipientType || '',
              senderName: brief.senderName || meta.senderName || '',
              voiceGender: brief.voiceGender || meta.voiceGender || '',
              specialQualities: brief.specialQualities || meta.specialQualities || '',
              favoriteMemories: brief.favoriteMemories || meta.favoriteMemories || '',
              specialMessage: brief.specialMessage || meta.specialMessage || '',
              fastDelivery,
            }),
          });

          if (!orderRes.ok) {
            const data = await orderRes.json().catch(() => null);
            setErrorMessage(data?.error || 'Payment was verified, but the order could not be created.');
            setStatus('error');
            return;
          }

          const orderData = await orderRes.json();
          finalize(orderData.id);
        } else {
          // ── Paystack flow ───────────────────────────────────────
          const verifyRes = await fetch(`/api/paystack/verify/${paystackReference}`);
          if (!verifyRes.ok) {
            const data = await verifyRes.json().catch(() => null);
            setErrorMessage(data?.error || 'Paystack verification failed.');
            setStatus('error');
            return;
          }
          const verifyData = await verifyRes.json();

          if (!verifyData.paid) {
            setErrorMessage(verifyData.message || 'Paystack has not marked this payment as paid yet.');
            setStatus('error');
            return;
          }

          setAmountPaid(
            typeof verifyData.amount === 'number'
              ? `₦${(verifyData.amount / 100).toLocaleString('en-NG')}`
              : '₦30,000'
          );

          const fastDelivery =
            brief.fastDelivery || verifyData.metadata?.fastDelivery === true || verifyData.metadata?.fastDelivery === 'true';
          setDeliveryLabel(fastDelivery ? '24 hours' : '~3 days');

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
              specialQualities:
                brief.specialQualities || verifyData.metadata?.specialQualities || '',
              favoriteMemories:
                brief.favoriteMemories || verifyData.metadata?.favoriteMemories || '',
              specialMessage: brief.specialMessage || verifyData.metadata?.specialMessage || '',
              fastDelivery,
            }),
          });

          if (!orderRes.ok) {
            const data = await orderRes.json().catch(() => null);
            setErrorMessage(data?.error || 'Payment was verified, but the order could not be created.');
            setStatus('error');
            return;
          }

          const orderData = await orderRes.json();
          finalize(orderData.id);
        }
      } catch (err) {
        console.error('Order creation error:', err);
        setErrorMessage('Network error while creating your order. Please check your connection and try again.');
        setStatus('error');
      }
    };

    createOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasReference]);

  if (!hasReference) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 gap-6 bg-obsidian text-primary">
        <span className="material-symbols-outlined text-7xl text-red-500 font-light drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
          error
        </span>
        <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight">
          Something Went Wrong
        </h2>
        <p className="text-[#e2c15a] font-body text-center max-w-md opacity-80">
          No payment reference was provided in the URL.
        </p>
        <Link
          to="/create"
          className="mt-4 flex items-center gap-2 px-8 h-12 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-all font-display text-sm font-bold uppercase tracking-widest"
        >
          Start Over
        </Link>
      </div>
    );
  }

  if (status === 'creating') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 gap-6 bg-obsidian text-primary">
        <span className="material-symbols-outlined text-6xl text-primary animate-spin">
          progress_activity
        </span>
        <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight">
          Confirming Payment...
        </h2>
        <p className="text-[#e2c15a] font-body opacity-80 max-w-md text-center">
          Please wait while we verify your payment and set up your song.
        </p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 gap-6 bg-obsidian text-primary">
        <span className="material-symbols-outlined text-7xl text-red-500 font-light drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">
          error
        </span>
        <h2 className="text-3xl md:text-4xl font-serif italic tracking-tight">
          Verification Failed
        </h2>
        <p className="text-[#e2c15a] font-body text-center max-w-md opacity-80">
          {errorMessage}
        </p>
        <Link
          to="/create"
          className="mt-4 flex items-center gap-2 px-8 h-12 rounded-full bg-primary text-obsidian hover:bg-[#e2c15a] transition-all font-display text-sm font-bold uppercase tracking-widest"
        >
          Try Again
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex flex-col md:flex-row bg-obsidian border-t border-obsidian/10 relative overflow-hidden">
      <div className="flex-1 p-8 md:p-16 lg:p-24 flex flex-col justify-center relative z-10 w-full">
        {/* Success Animation */}
        <div className="relative mb-8 self-start">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl animate-pulse" />
          <div className="relative size-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-4xl text-primary font-light">
              task_alt
            </span>
          </div>
        </div>

        <div className="mb-10 max-w-lg">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-medium text-primary mb-4 font-serif italic tracking-tight">
            Payment Successful!
          </h2>
          <p className="text-[#e2c15a] text-lg font-body opacity-90 leading-relaxed">
            Your story is now in the hands of our artists. We've begun composing your royal
            masterpiece.
          </p>
          <p className="text-[#c4a02e] text-sm mt-4 font-body opacity-70 border-l-2 border-primary/30 pl-3">
            Redirecting to your order tracker...
          </p>
        </div>

        <div className="bg-obsidian border border-primary/20 shadow-xl shadow-black/50 rounded-2xl p-6 w-full max-w-lg mb-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-5">
            <span className="material-symbols-outlined text-9xl text-primary">receipt_long</span>
          </div>
          <div className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#c4a02e] font-display uppercase tracking-widest">
                Order ID
              </span>
              <span className="text-sm text-primary font-mono bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {orderId?.slice(0, 8).toUpperCase()}...
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#c4a02e] font-display uppercase tracking-widest">
                Amount Paid
              </span>
              <span className="text-base text-primary font-bold font-display">{amountPaid}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#c4a02e] font-display uppercase tracking-widest">
                Payment via
              </span>
              <span className="text-sm text-[#e2c15a] font-medium">
                {stripeSessionId ? 'Stripe' : 'Paystack'}
              </span>
            </div>
            <div className="h-px w-full bg-primary/10 my-2" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#c4a02e] font-display uppercase tracking-widest">
                Est. Delivery
              </span>
              <span className="text-sm text-primary font-bold font-display">{deliveryLabel}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
          <Link
            to={orderId ? `/track?id=${orderId}` : '/track'}
            className="flex-1 flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-primary text-obsidian text-sm font-bold hover:bg-[#e2c15a] transition-all font-display shadow-lg shadow-primary/20 uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-lg">visibility</span>
            Track Order
          </Link>
          <Link
            to="/"
            className="flex-1 flex items-center justify-center gap-2 h-12 px-6 rounded-full bg-transparent border border-primary/30 text-primary text-sm font-bold hover:bg-primary/10 transition-all font-display uppercase tracking-widest"
          >
            Home
          </Link>
        </div>
      </div>

      {/* Cinematic Image Side */}
      <div className="md:w-[45%] lg:w-1/2 relative min-h-[400px] md:min-h-full shrink-0">
        <div
          className="absolute inset-0 bg-cover bg-center md:bg-left"
          style={{ backgroundImage: "url('/images/Composing.png')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-obsidian via-obsidian/40 to-transparent" />
      </div>
    </div>
  );
};

export default PaymentSuccess;
