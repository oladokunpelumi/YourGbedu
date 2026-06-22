import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { analyticsConfigured, getConsent, setConsent, loadAnalytics, trackPage } from '../services/analytics';

/**
 * Cookie-consent banner + SPA pageview tracker.
 *
 * GA4 / Meta Pixel set cookies, so they load only after the visitor accepts.
 * The banner shows once (until a choice is stored) and only when analytics IDs
 * are configured. After consent, pageviews fire on every hash route change.
 */
const AnalyticsConsent: React.FC = () => {
  const location = useLocation();
  const [decided, setDecided] = useState<boolean>(() => getConsent() !== null);

  // Load SDKs on mount if consent was granted in a previous visit.
  useEffect(() => {
    if (getConsent() === 'granted') loadAnalytics();
  }, []);

  // Fire a pageview on each route change (no-op until consent is granted).
  useEffect(() => {
    trackPage(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  if (!analyticsConfigured() || decided) return null;

  const choose = (value: 'granted' | 'denied') => {
    setConsent(value);
    setDecided(true);
    if (value === 'granted') trackPage(`${location.pathname}${location.search}`);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[120] border-t border-line bg-cream/95 px-4 py-4 backdrop-blur-sm sm:px-6"
    >
      <div className="mx-auto flex max-w-4xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-ink-soft">
          We use cookies for analytics to understand how the site is used and improve it. You can
          accept or decline.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => choose('denied')}
            className="rounded-full border border-line-strong px-4 py-2 font-label text-xs font-bold uppercase tracking-[0.12em] text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => choose('granted')}
            className="rounded-full bg-ink px-5 py-2 font-label text-xs font-bold uppercase tracking-[0.12em] text-cream transition-colors hover:bg-terracotta"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsConsent;
