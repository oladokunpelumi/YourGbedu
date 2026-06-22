<div align="center">
# YourGbedu

**Turn your most meaningful moments into music — professionally produced, personally yours.**

</div>

---

## What the App Does

YourGbedu is an online platform that lets you commission a custom, professionally produced song for someone you care about. The process is simple: you answer a few questions about the person, the occasion, and the emotion you want to capture, and we build and deliver a fully produced, one-of-a-kind track within 48 hours. From birthdays and weddings to anniversaries and heartfelt surprises, YourGbedu transforms personal stories into music.

---

## Why It Matters

Meaningful gifts are hard to find. Most presents are forgotten — YourGbedu creates something people keep forever. There is no other gift quite like a song written specifically about someone, capturing their name, their story, and the moment that matters. YourGbedu makes that experience accessible to anyone, without needing music industry connections or a production budget.

---

## Key Features

- **Personalised song briefs** — a simple guided form that collects everything the music team needs: the recipient's story, the mood, the occasion, and the preferred sound
- **Secure payments** — fast, reliable checkout so your order is confirmed instantly
- **Order tracking** — check your order status through a secure tracker link or email sign-in
- **Private tracker links** — customer order links use a per-order tracking token; older links recover through magic-link email sign-in
- **48-hour crafted delivery** — we build and deliver professionally produced tracks quickly, so you're never scrambling before a special occasion
- **Completion notifications** — automatic email delivery when your song is ready

---

## Media And Deployment Notes

Large catalogue media (the sample MP3s and cover images) is intentionally **not** tracked in Git. Keep local development copies under `musics/` (served at `/musics/...` in dev). For production you must host them externally, because a fresh build contains no `musics/` files.

**Catalogue media (required for production):**

1. Upload the catalogue files to a CDN / object store, preserving the `musics/` layout, e.g. `https://cdn.yourgbedu.com/musics/Anniversary.mp3` and `https://cdn.yourgbedu.com/musics/Cover%20Phtotos/Anniversary_Cover.jpg`.
2. Set `MEDIA_BASE_URL` to that origin (no trailing slash), e.g. `MEDIA_BASE_URL=https://cdn.yourgbedu.com`. On boot, the catalogue seeds rewrite every relative `/musics/...` path to `${MEDIA_BASE_URL}/musics/...` (idempotent; a no-op in dev where `MEDIA_BASE_URL` is unset and files are served locally).
3. Set `MEDIA_CDN_ORIGINS` to the comma-separated HTTPS origins the CSP should allow for images/audio, e.g. `https://cdn.yourgbedu.com`. If unset, the CSP falls back to a broad `https:` source and logs a warning.

## Environment Variables

Copy `.env.example` to `.env.local` and fill in. Required in production: `JWT_SECRET` (server refuses to boot without it), `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `PAYSTACK_SECRET_KEY`, `CLIENT_URL`, `DATABASE_URL` (Postgres; falls back to local SQLite when unset).

Song-generation pipeline:

- `OPENROUTER_API_KEY` — LLM provider key for the brief/style/lyrics pipeline (shared with the production-brief feature).
- `YG_MODEL_INTAKE`, `YG_MODEL_SONNET` — optional per-tier model overrides (fall back to `LLM_MODEL`, then sensible defaults).
- `SONG_PIPELINE_AUTO` — `paid` (default; only paid orders auto-generate), `all`, or `off`.
- `SONG_PIPELINE_CONCURRENCY` — max concurrent generations (default 2).
- `SONG_PIPELINE_RETENTION_DAYS` — days before completed generations' intermediate state is purged (default 90; `0` disables).
- `SONG_PIPELINE_MOCK` — `1` to run the pipeline with a mock LLM (used by tests; no API spend).

---

## Email Flows (Klaviyo) & Analytics

The app **emits events**; the emails and reports are built in the respective dashboards. Everything is env-gated — unset keys mean no-op, so the app runs fine without any of it.

**Klaviyo** (`server/services/klaviyo.cjs`). Events we send: `Subscribed to Promo` (popup), `Placed Order` (paid + free + Paystack webhook), `Song Delivered` (admin attaches the final song, includes the track URL). Set up:

1. Set `KLAVIYO_PRIVATE_KEY` (Private API key, `pk_...`) and authenticate your sending domain (DKIM) in Klaviyo for deliverability.
2. Create a list for the popup and put its ID in `KLAVIYO_PROMO_LIST_ID`.
3. Build the Flows in Klaviyo, triggered by those events / the list join: welcome + promo code, abandoned checkout, order confirmation, song-ready (use the `track_url` event property for the "listen" button), review/reaction-video, win-back for non-converters. Admin alerts can be a flow filtered to your admin email on `Placed Order`.
4. **Only after** the confirmation + song-ready flows are live, set `KLAVIYO_OWNS_TRANSACTIONAL=1` to stop Resend sending those two. The magic-link sign-in email **always** stays on Resend regardless.

**GA4 + Meta Pixel** (`services/analytics.ts`, consent-gated). The live IDs (GA4 `G-KVDJRERYQC`, Meta Pixel `1586133760190609`) are baked in as defaults — override with `VITE_GA_MEASUREMENT_ID` / `VITE_META_PIXEL_ID` for a staging property. Scripts load only after the visitor accepts the cookie banner, and run from bundled JS (no inline `<script>` in `index.html`) so the strict prod CSP holds. Events: `page_view` on every route, `lead` (popup), `begin_checkout`, `purchase`. The server CSP already allowlists the GA/Meta origins. (Optional later: Meta Conversions API for server-side, ad-blocker-proof purchase tracking.)

⚠️ Never send the customer's personal song text (heart message, memories) to Klaviyo or analytics — only commerce properties (occasion, genre, recipient type, amount, order id) are emitted, by design.

---

## Who It Is For

YourGbedu is for anyone who wants to give a gift that truly stands out. It is ideal for people celebrating birthdays, weddings, anniversaries, graduations, or any milestone worth marking. It is also a meaningful tool for brands and creators looking to offer personalised musical experiences to their audiences. If you believe the people you love deserve something more than a card, YourGbedu was built for you.

---

## Get Started

Great gifts do not have to be complicated — they just have to be personal. Visit YourGbedu today, tell us your story, and let us turn it into a song worth remembering.

---

<div align="center">
  <p>Built with care · YourGbedu © 2026</p>
</div>
