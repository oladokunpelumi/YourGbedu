import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { X, Mail, Gift, Loader2 } from 'lucide-react';
import { DISCOUNTED_PRICING_BY_CURRENCY, type Currency, type PaymentProvider } from '../constants';
import { fetchCheckoutConfig } from '../services/checkoutProvider';
import { trackEvent } from '../services/analytics';

type PopupState = 'idle' | 'submitting' | 'revealed' | 'error';

interface SubscribeResponse {
  subscriber?: { email: string; createdAt?: string };
  promo?: { code: string; discountPercent: number };
  error?: string;
}

const STORAGE_KEY = 'yourgbedu_popup_seen_at';
const LEGACY_STORAGE_KEY = 'prayersong_popup_seen_at';
const FULL_PRICE_STORAGE_KEY = 'yourgbedu_pay_full_price';
const SUPPRESS_PATHS = ['/checkout', '/admin', '/verify', '/payment-success', '/payment-cancel', '/track'];
const SUPPRESS_DAYS = 30;
const SHOW_DELAY_MS = 10_000;

function shouldSuppress(pathname: string): boolean {
  if (SUPPRESS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) || window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!stored) return false;
    const seenAt = Number(stored);
    if (!Number.isFinite(seenAt)) return false;
    const ageDays = (Date.now() - seenAt) / (1000 * 60 * 60 * 24);
    return ageDays < SUPPRESS_DAYS;
  } catch {
    return false;
  }
}

function readSavedBriefPriceContext(): { paymentProvider?: PaymentProvider; currency?: Currency; fastDelivery: boolean } {
  try {
    const raw = window.sessionStorage.getItem('yourgbedu_brief');
    if (!raw) return { fastDelivery: false };
    const parsed = JSON.parse(raw) as { paymentProvider?: PaymentProvider; currency?: Currency; fastDelivery?: boolean };
    return {
      paymentProvider: parsed.paymentProvider === 'stripe' || parsed.paymentProvider === 'paystack'
        ? parsed.paymentProvider
        : undefined,
      currency: parsed.currency === 'usd' || parsed.currency === 'ngn' ? parsed.currency : undefined,
      fastDelivery: Boolean(parsed.fastDelivery),
    };
  } catch {
    return { fastDelivery: false };
  }
}

function formatMarketingAmount(currency: Currency, amount: number) {
  if (currency === 'usd') {
    const value = amount / 100;
    return `$${value.toLocaleString('en-US', {
      minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  }
  return `₦${(amount / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function getMarketingPriceLine(currency: Currency, fastDelivery: boolean, discountPercent: number) {
  if (currency === 'usd') {
    const price = fastDelivery ? DISCOUNTED_PRICING_BY_CURRENCY.usd.fast : DISCOUNTED_PRICING_BY_CURRENCY.usd.standard;
    const discounted = Math.round(price.originalAmountCents * (1 - discountPercent / 100));
    return {
      was: formatMarketingAmount(currency, price.originalAmountCents),
      now: formatMarketingAmount(currency, discounted),
    };
  }

  const price = fastDelivery ? DISCOUNTED_PRICING_BY_CURRENCY.ngn.fast : DISCOUNTED_PRICING_BY_CURRENCY.ngn.standard;
  const discounted = Math.round(price.originalAmountKobo * (1 - discountPercent / 100));
  return {
    was: formatMarketingAmount(currency, price.originalAmountKobo),
    now: formatMarketingAmount(currency, discounted),
  };
}

const EmailCapturePopup: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const briefContext = readSavedBriefPriceContext();
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<PopupState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [promo, setPromo] = useState<{ code: string; discountPercent: number } | null>(null);
  const [currency, setCurrency] = useState<Currency>(briefContext.currency || 'ngn');
  const [fastDelivery] = useState(briefContext.fastDelivery);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (shouldSuppress(location.pathname)) return;

    // Already opt-ed in via ?promo= — no need to capture the email again.
    const params = new URLSearchParams(location.search);
    if (params.get('promo')) return;

    const timer = window.setTimeout(() => setIsOpen(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (briefContext.currency) return;
    let cancelled = false;

    const detectCurrency = async () => {
      const config = await fetchCheckoutConfig();
      if (!cancelled) setCurrency(config.currency);
    };

    void detectCurrency();

    return () => {
      cancelled = true;
    };
  }, [briefContext.currency]);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // localStorage may be unavailable (private mode); not fatal.
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    markSeen();
  }, [markSeen]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed.includes('@')) {
        setErrorMessage('Enter a valid email address.');
        return;
      }
      setErrorMessage('');
      setState('submitting');

      try {
        const res = await fetch('/api/subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmed, source: location.pathname }),
        });
        const data = (await res.json().catch(() => null)) as SubscribeResponse | null;
        if (!res.ok || !data?.promo) {
          throw new Error(data?.error || 'Could not save your email. Please try again.');
        }
        try {
          window.localStorage.removeItem(FULL_PRICE_STORAGE_KEY);
        } catch {
          // localStorage may be unavailable; not fatal.
        }
        setPromo(data.promo);
        setState('revealed');
        markSeen();
        trackEvent('lead', { source: location.pathname });
      } catch (err) {
        setState('error');
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    },
    [email, location.pathname, markSeen]
  );

  const handleApply = useCallback(() => {
    if (!promo) return;
    try {
      window.localStorage.removeItem(FULL_PRICE_STORAGE_KEY);
    } catch {
      // localStorage may be unavailable; not fatal.
    }
    handleClose();
    const hasBrief = (() => {
      try {
        return !!window.sessionStorage.getItem('yourgbedu_brief');
      } catch {
        return false;
      }
    })();
    navigate(hasBrief ? `/checkout?promo=${encodeURIComponent(promo.code)}` : `/create?promo=${encodeURIComponent(promo.code)}`);
  }, [handleClose, navigate, promo]);

  const handleDecline = useCallback(() => {
    try {
      window.localStorage.setItem(FULL_PRICE_STORAGE_KEY, 'true');
    } catch {
      // localStorage may be unavailable; not fatal.
    }
    handleClose();
  }, [handleClose]);

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => emailInputRef.current?.focus(), 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleClose();
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [handleClose, isOpen]);

  if (!isOpen) return null;

  const discount = promo?.discountPercent ?? 50;
  const priceLine = getMarketingPriceLine(currency, fastDelivery, discount);

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl border border-line bg-cream p-6 shadow-[0_18px_44px_rgba(31,27,20,0.2)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-capture-title"
      >
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 text-ink-muted transition-colors hover:text-ink"
          aria-label="Close offer"
        >
          <X className="h-5 w-5" />
        </button>

        {state === 'revealed' && promo ? (
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-mustard/30">
              <Gift className="h-7 w-7 text-terracotta" aria-hidden="true" />
            </div>
            <h2 id="email-capture-title" className="mt-4 font-headline text-4xl font-medium leading-none text-ink">
              Your code is ready
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink-soft">
              The promo code has been added to your order. Apply it at checkout and pay half price.
            </p>

            <div className="mt-5 w-full rounded-2xl border border-mustard bg-mustard/20 px-5 py-4 text-center">
              <p className="font-label text-xs font-bold uppercase tracking-[0.18em] text-ink-muted">
                Your code
              </p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-[0.18em] text-ink">{promo.code}</p>
              <p className="mt-2 font-label text-xs font-bold uppercase tracking-[0.14em] text-terracotta-dark">
                Was {priceLine.was} <span className="mx-1 text-ink-muted">·</span> Now {priceLine.now}
              </p>
            </div>

            <button
              type="button"
              onClick={handleApply}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 py-3 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta"
            >
              Apply at checkout
            </button>

            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Join our mailing list to keep up with new song drops and limited offers.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-terracotta-pale">
                <Mail className="h-7 w-7 text-terracotta" aria-hidden="true" />
              </div>
              <h2 id="email-capture-title" className="mt-4 font-headline text-4xl font-medium leading-none text-ink">
                Get {discount}% off your song
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink-soft">
                Drop your email to unlock a promo code instantly. Ends in 7 days.
              </p>
              <p className="mt-2 font-label text-xs font-bold uppercase tracking-[0.14em] text-terracotta-dark">
                Was {priceLine.was} <span className="mx-1 text-ink-muted">·</span> Now {priceLine.now}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <input
                ref={emailInputRef}
                aria-label="Email address"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrorMessage('');
                  if (state === 'error') setState('idle');
                }}
                placeholder="you@email.com"
                required
                className="w-full rounded-xl border border-line bg-ivory px-4 py-3.5 font-body text-ink placeholder:text-ink-muted transition-colors focus:border-terracotta focus:bg-cream focus:outline-none focus:ring-4 focus:ring-terracotta/10"
              />
              {errorMessage && <p className="px-1 text-sm text-red-700">{errorMessage}</p>}
              <button
                type="submit"
                disabled={state === 'submitting' || !email.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 font-label text-sm font-bold uppercase tracking-[0.14em] text-cream transition-colors hover:bg-terracotta disabled:cursor-not-allowed disabled:opacity-50"
              >
                {state === 'submitting' ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Unlock my code'}
              </button>
            </form>

            <button
              type="button"
              onClick={handleDecline}
              className="mt-3 block w-full font-label text-xs font-bold uppercase tracking-[0.14em] text-ink-muted transition-colors hover:text-ink"
            >
              No thanks, I&apos;ll pay full price
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default EmailCapturePopup;
