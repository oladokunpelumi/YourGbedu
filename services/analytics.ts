/**
 * GA4 + Meta Pixel — consent-gated, env-driven.
 *
 * Scripts load only after the visitor accepts the consent banner. Both init
 * snippets run from this bundled module (not inline <script>), so the prod CSP
 * keeps scriptSrc strict — only the external loaders are allowlisted.
 *
 * No IDs configured, or no consent → every call is a no-op.
 */
const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || '';
const META_PIXEL_ID = (import.meta.env.VITE_META_PIXEL_ID as string | undefined) || '';

const CONSENT_KEY = 'yourgbedu_analytics_consent';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _fbq?: any;
  }
}

let loaded = false;

export function analyticsConfigured(): boolean {
  return Boolean(GA_ID || META_PIXEL_ID);
}

export function getConsent(): 'granted' | 'denied' | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: 'granted' | 'denied') {
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // localStorage may be unavailable; not fatal.
  }
  if (value === 'granted') loadAnalytics();
}

function injectScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/** Load the analytics SDKs. Idempotent; only runs with consent + at least one ID. */
export function loadAnalytics() {
  if (loaded) return;
  if (getConsent() !== 'granted') return;
  if (!analyticsConfigured()) return;
  loaded = true;

  if (GA_ID) {
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    // SPA: we send page_view manually on route change, so disable auto.
    window.gtag('config', GA_ID, { send_page_view: false });
  }

  if (META_PIXEL_ID) {
    /* Standard Meta Pixel bootstrap, run from bundled JS (CSP-safe). The vendor
       snippet is intentionally loosely typed. */
    /* eslint-disable @typescript-eslint/no-explicit-any, prefer-rest-params */
    const n: any = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    window.fbq = n;
    /* eslint-enable @typescript-eslint/no-explicit-any, prefer-rest-params */
    injectScript('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_PIXEL_ID);
  }
}

/** Send a virtual page_view to GA + Meta on SPA route change. */
export function trackPage(path: string) {
  if (getConsent() !== 'granted') return;
  if (GA_ID && window.gtag) window.gtag('event', 'page_view', { page_path: path });
  if (META_PIXEL_ID && window.fbq) window.fbq('track', 'PageView');
}

/**
 * Track a commerce event. Maps a single call to the right metric name on each
 * platform (GA4 snake_case vs Meta StandardEvent).
 */
export function trackEvent(
  event: 'lead' | 'begin_checkout' | 'purchase',
  params: { value?: number; currency?: string; [k: string]: unknown } = {}
) {
  if (getConsent() !== 'granted') return;

  const gaName = event; // GA4 recommended names are already snake_case
  const metaName = event === 'lead' ? 'Lead' : event === 'begin_checkout' ? 'InitiateCheckout' : 'Purchase';

  if (GA_ID && window.gtag) window.gtag('event', gaName, params);
  if (META_PIXEL_ID && window.fbq) {
    const metaParams =
      typeof params.value === 'number'
        ? { value: params.value, currency: params.currency || 'USD' }
        : {};
    window.fbq('track', metaName, metaParams);
  }
}
