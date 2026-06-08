import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { OrderData } from '../types';
import SongReady from '../components/SongReady';

type AuthState = 'checking' | 'authenticated' | 'unauthenticated';
type SignInState = 'idle' | 'sending' | 'sent' | 'error';

const OrderStatus: React.FC = () => {
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLefts, setTimeLefts] = useState<
    Record<string, { days: number; hours: number; minutes: number; seconds: number }>
  >({});
  const [isNigeria, setIsNigeria] = useState<boolean>(true);
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [signInState, setSignInState] = useState<SignInState>('idle');
  const [signInEmail, setSignInEmail] = useState('');

  const location = useLocation();

  useEffect(() => {
    fetch('/api/geo/country')
      .then((r) => r.json())
      .then((data) => setIsNigeria(!!data.isNigeria))
      .catch(() => setIsNigeria(true));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlId = params.get('id');
    const trackId = urlId || sessionStorage.getItem('yourgbedu_track_id');

    if (trackId && !trackId.includes('@')) {
      sessionStorage.setItem('yourgbedu_track_id', trackId);
      fetch(`/api/orders/${encodeURIComponent(trackId)}`, { credentials: 'include' })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setOrders([data]);
            setTimeLefts({ [data.id]: data.timeLeft });
            setAuthState('authenticated');
          } else {
            setOrders([]);
            setAuthState('authenticated');
          }
        })
        .catch(() => setAuthState('unauthenticated'))
        .finally(() => setLoading(false));
      return;
    }

    fetch('/api/orders/track', { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401) {
          setAuthState('unauthenticated');
          setLoading(false);
          return;
        }
        if (res.ok) {
          const data: OrderData[] = await res.json();
          setOrders(data);
          const tl: Record<string, any> = {};
          data.forEach((o) => {
            tl[o.id] = o.timeLeft;
          });
          setTimeLefts(tl);
          setAuthState('authenticated');
        }
      })
      .catch(() => setAuthState('unauthenticated'))
      .finally(() => setLoading(false));
  }, [location.search]);

  useEffect(() => {
    if (orders.length === 0) return;
    const interval = setInterval(() => {
      setTimeLefts((prev) => {
        const next = { ...prev };
        orders.forEach((order) => {
          const delivery = new Date(order.deliveryDate).getTime();
          const remainingMs = Math.max(0, delivery - Date.now());
          next[order.id] = {
            days: Math.floor(remainingMs / (1000 * 60 * 60 * 24)),
            hours: Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            minutes: Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)),
            seconds: Math.floor((remainingMs % (1000 * 60)) / 1000),
          };
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [orders]);

  const handleRequestSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail.includes('@')) return;
    setSignInState('sending');
    try {
      const res = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signInEmail }),
      });
      setSignInState(res.ok ? 'sent' : 'error');
    } catch {
      setSignInState('error');
    }
  };

  if (loading || authState === 'checking') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-ivory px-6 py-24 text-center">
        <span className="material-symbols-outlined mb-4 text-5xl text-terracotta animate-spin" aria-hidden="true">
          progress_activity
        </span>
        <p className="font-label text-sm font-bold uppercase tracking-[0.16em] text-ink-muted">
          Loading your orders...
        </p>
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return (
      <div className="bg-ivory px-5 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-cream p-6 text-center sm:p-8">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-terracotta-pale text-terracotta">
            <span className="material-symbols-outlined text-4xl" aria-hidden="true">
              lock
            </span>
          </div>
          <h1 className="mt-6 font-headline text-5xl font-medium leading-none text-ink">
            Sign in to view your orders
          </h1>
          <p className="mx-auto mt-4 max-w-md text-base leading-7 text-ink-soft">
            Enter your email and we will send you a secure sign-in link for all orders.
          </p>

          {signInState === 'sent' ? (
            <div className="mt-8 rounded-2xl border border-sage-soft bg-sage-pale p-5 text-sage-dark">
              <p className="font-bold">Check your inbox.</p>
              <p className="mt-1 text-sm">
                If that email matches an order, a secure sign-in link is on the way.
              </p>
            </div>
          ) : (
            <form onSubmit={handleRequestSignIn} className="mt-8 flex flex-col gap-4">
              <input
                type="email"
                value={signInEmail}
                onChange={(e) => setSignInEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-xl border border-line bg-ivory px-5 py-4 font-body text-base text-ink placeholder:text-ink-muted focus:border-terracotta focus:bg-cream focus:outline-none focus:ring-4 focus:ring-terracotta/10"
                required
              />
              {signInState === 'error' && (
                <p className="text-sm font-medium text-red-700">Something went wrong. Please try again.</p>
              )}
              <button
                type="submit"
                disabled={signInState === 'sending'}
                className="min-h-12 rounded-full bg-ink px-6 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta disabled:opacity-50"
              >
                {signInState === 'sending' ? 'Sending...' : 'Send sign-in link'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 bg-ivory px-6 py-24 text-center">
        <h1 className="font-headline text-5xl font-medium leading-none text-ink">
          No orders yet
        </h1>
        <p className="max-w-md text-base leading-7 text-ink-soft">
          We could not find any orders for this account. Start a new composition whenever you are ready.
        </p>
        <Link
          to="/create"
          className="rounded-full bg-ink px-7 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
        >
          Begin composition
        </Link>
      </div>
    );
  }

  const order = orders[0];
  const tl = timeLefts[order.id] || order.timeLeft;
  const isDelivered = order.status === 'completed' && !!order.finalSongUrl;

  if (isDelivered) {
    return (
      <div className="bg-ivory px-5 py-8 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between gap-3">
            <span className="rounded-full border border-line bg-cream px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
              Order #{order.id.slice(0, 8)}
            </span>
            <span className="rounded-full bg-sage-pale px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-sage-dark">
              Song ready
            </span>
          </div>
          <h1 className="text-center font-headline text-5xl font-medium leading-tight text-ink sm:text-6xl">
            Your song is ready
          </h1>
          <p className="mt-3 text-center text-base leading-7 text-ink-soft">
            Press play and let it land. Share it, rate it, send a reaction — it&apos;s yours.
          </p>
          <SongReady
            order={order}
            onRatingSaved={(value) => setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, rating: value } : o)))}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-ivory px-5 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <section className="rounded-[1.5rem] border border-line bg-cream p-5 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-line bg-ivory px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                  Order #{order.id.slice(0, 8)}
                </span>
                <span className={`rounded-full px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] ${
                  order.status === 'completed'
                    ? 'bg-sage-pale text-sage-dark'
                    : 'bg-terracotta-pale text-terracotta-dark'
                }`}>
                  {order.status === 'completed' ? 'Completed' : 'In production'}
                </span>
              </div>
              <h1 className="mt-5 font-headline text-6xl font-medium leading-none text-ink sm:text-7xl">
                {order.songTitle}
              </h1>
              <p className="mt-4 font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
                {order.genre}
              </p>
              <p className="mt-6 max-w-2xl text-base leading-7 text-ink-soft">
                Your production timeline updates as the song moves through writing, recording, review,
                and delivery.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {[
                { val: String(tl.days).padStart(2, '0'), label: 'Days' },
                { val: String(tl.hours).padStart(2, '0'), label: 'Hours' },
                { val: String(tl.minutes).padStart(2, '0'), label: 'Minutes' },
                { val: String(tl.seconds).padStart(2, '0'), label: 'Seconds' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-line bg-ivory p-3 text-center">
                  <span className="block font-headline text-4xl font-semibold leading-none text-ink">
                    {item.val}
                  </span>
                  <span className="mt-2 block font-label text-[9px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-8 border-t border-line pt-5 font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-muted">
            Estimated delivery:{' '}
            <span className="text-ink">
              {new Date(order.deliveryDate).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </span>
          </p>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-line bg-cream p-5 sm:p-7">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-headline text-4xl font-medium leading-none text-ink">
                Production timeline
              </h2>
              <span className="rounded-full border border-line bg-ivory px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                Step {order.currentStep} of {order.steps.length}
              </span>
            </div>

            <div className="space-y-4">
              {order.steps.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-2xl border p-5 ${
                    item.active
                      ? 'border-terracotta bg-terracotta-pale'
                      : item.status === 'Completed'
                        ? 'border-sage-soft bg-sage-pale'
                        : 'border-line bg-ivory'
                  }`}
                >
                  <div className="flex gap-4">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                      item.active
                        ? 'bg-terracotta text-cream'
                        : item.status === 'Completed'
                          ? 'bg-sage text-cream'
                          : 'bg-cream text-ink-muted'
                    }`}>
                      <span className="material-symbols-outlined text-xl" aria-hidden="true">
                        {item.status === 'Completed' ? 'check' : item.icon}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-headline text-3xl font-medium leading-none text-ink">
                          {item.title}
                        </h3>
                        <span className="rounded-full bg-cream px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                          {item.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-ink-soft">
                        {item.status === 'In Progress' && item.descActive ? item.descActive : item.desc}
                      </p>
                      {item.active && (
                        <div className="mt-5">
                          <div className="mb-2 flex justify-between font-label text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                            <span>Tracking progress</span>
                            <span>{item.progress}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-cream">
                            <div className="h-full rounded-full bg-terracotta" style={{ width: `${item.progress}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-line bg-cream p-6">
              <h2 className="font-headline text-4xl font-medium leading-none text-ink">
                Song brief
              </h2>
              <div className="mt-5 space-y-3">
                {[
                  { label: 'Genre', value: order.genre },
                  ...(order.occasion
                    ? [{ label: 'Occasion', value: order.occasionDetail ? `${order.occasion} - ${order.occasionDetail}` : order.occasion }]
                    : []),
                  ...(order.recipientType
                    ? [{ label: 'For', value: order.recipientName ? `${order.recipientName} · ${order.recipientType}` : order.recipientType }]
                    : []),
                  ...(order.senderName ? [{ label: 'From', value: order.senderName }] : []),
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-line bg-ivory p-4">
                    <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
                      {item.label}
                    </p>
                    <p className="mt-1 font-body text-sm font-bold text-ink">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-ink p-6 text-cream">
              <p className="font-label text-[10px] font-bold uppercase tracking-[0.16em] text-cream/45">
                Price summary
              </p>
              <div className="mt-3 flex items-center justify-between gap-4">
                <div>
                  <p className="font-headline text-4xl font-semibold text-mustard">
                    {isNigeria ? '₦30,000' : '$25'}
                  </p>
                  <p className="text-sm text-cream/35 line-through">
                    {isNigeria ? '₦60,000' : '$50'}
                  </p>
                </div>
                <span className="rounded-full bg-mustard px-3 py-1 font-label text-[10px] font-bold uppercase tracking-[0.12em] text-ink">
                  50% off
                </span>
              </div>
            </div>

            {orders.length > 1 && (
              <div className="rounded-2xl border border-line bg-cream p-6">
                <h3 className="font-label text-xs font-bold uppercase tracking-[0.16em] text-ink-muted">
                  All orders
                </h3>
                <div className="mt-4 space-y-3">
                  {orders.map((o, i) => (
                    <div key={o.id} className={`rounded-xl border p-3 ${i === 0 ? 'border-terracotta bg-terracotta-pale' : 'border-line bg-ivory'}`}>
                      <p className="font-headline text-2xl italic leading-none text-ink">{o.songTitle}</p>
                      <p className="mt-1 font-label text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">
                        {o.genre} - {o.overallProgress}%
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
};

export default OrderStatus;
