require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

// ─── Env Validation ───────────────────────────────────────────────────────────
const IS_PROD = process.env.NODE_ENV === 'production';
const IS_TEST = process.env.NODE_ENV === 'test';

// These are required in all environments except test.
// Crash fast so a misconfigured deploy is immediately obvious.
const REQUIRED_ENV = [
    'PAYSTACK_SECRET_KEY',
    'JWT_SECRET',
    'ADMIN_USERNAME',
    'ADMIN_PASSWORD',
    ...(IS_PROD ? ['CLIENT_URL'] : []),
];

if (!IS_TEST) {
    const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
        console.error('   Copy .env.example to .env.local and fill in the required values.');
        process.exit(1);
    }
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const path = require('path');
const { getDevClientOrigins } = require('./client-url.cjs');
const { createRateLimiters } = require('./rate-limiters.cjs');

require('./db.cjs');

const songsRouter = require('./routes/songs.cjs');
const ordersRouter = require('./routes/orders.cjs');
const paymentsRouter = require('./routes/payments.cjs');
const paystackRouter = require('./routes/paystack.cjs');
const adminRouter = require('./routes/admin.cjs');
const authRouter = require('./routes/auth.cjs');
const geoRouter = require('./routes/geo.cjs');
const brainstormRouter = require('./routes/brainstorm.cjs');
const promosRouter = require('./routes/promos.cjs');
const subscribersRouter = require('./routes/subscribers.cjs');
const { getSongPipeline } = require('./services/song-pipeline.cjs');

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

function parseOriginList(value) {
    return String(value || '')
        .split(',')
        .map((origin) => origin.trim().replace(/\/$/, ''))
        .filter(Boolean);
}

const MEDIA_CDN_ORIGINS = parseOriginList(process.env.MEDIA_CDN_ORIGINS);
const mediaFallback = MEDIA_CDN_ORIGINS.length === 0;
if (IS_PROD && mediaFallback) {
    console.warn('[CSP] MEDIA_CDN_ORIGINS is not set; falling back to broad https: media/image sources.');
}

// Railway (and most PaaS) terminate TLS at the edge and forward to the container
// over HTTP with X-Forwarded-For/-Proto. Trust the first proxy hop so:
//   - express-rate-limit keys correctly on the real client IP (avoids
//     ERR_ERL_UNEXPECTED_X_FORWARDED_FOR warnings)
//   - req.secure reflects HTTPS truth, which Set-Cookie `secure: true` relies on
//   - req.protocol is 'https' for redirects and URL building
app.set('trust proxy', 1);

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                // unsafe-inline is only needed for Vite HMR in development.
                // In production, inline scripts are disallowed to prevent XSS.
                ...(IS_PROD ? [] : ["'unsafe-inline'"]),
                'https://js.stripe.com',
                'https://js.paystack.co',
            ],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://fonts.googleapis.com'],
            imgSrc: ["'self'", 'data:', 'blob:', ...MEDIA_CDN_ORIGINS, ...(mediaFallback ? ['https:'] : [])],
            mediaSrc: ["'self'", 'blob:', 'data:', ...MEDIA_CDN_ORIGINS, ...(mediaFallback ? ['https:'] : [])],
            connectSrc: [
                "'self'",
                'https://api.paystack.co',
                'https://api.stripe.com',
                'https://checkout.stripe.com',
                'https://r.stripe.com',
                'https://m.stripe.network',
                'https://ipapi.co',
            ],
            frameSrc: [
                "'self'",
                'https://js.stripe.com',
                'https://checkout.stripe.com',
                'https://hooks.stripe.com',
                'https://js.paystack.co',
                'https://checkout.paystack.com',
                'https://standard.paystack.co',
            ],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: IS_PROD ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false, // audio/media elements need this relaxed
}));

// CORS: in dev, allow the local dev origins. In production, the SPA is served
// from the same Express app — so the *request's own origin* is always trusted
// (same-host). We accept CLIENT_URL and its www/apex variant so a custom
// domain like yourgbedu.com works whether the user types www or not. We also
// accept the Railway default subdomain regardless of CLIENT_URL, so a
// mis-set env var can't silently kill cookie auth on the platform domain.
const DEV_ORIGINS = getDevClientOrigins();

function hostVariants(url) {
    if (!url) return new Set();
    try {
        const u = new URL(url);
        const scheme = u.protocol;
        const host = u.host;
        const hostNoWww = host.startsWith('www.') ? host.slice(4) : host;
        const hostWithWww = host.startsWith('www.') ? host : `www.${host}`;
        return new Set([
            `${scheme}//${hostNoWww}`,
            `${scheme}//${hostWithWww}`,
        ]);
    } catch {
        return new Set([url]);
    }
}

const ALLOWED_PROD_ORIGINS = hostVariants(CLIENT_URL);

app.use(
    cors({
        origin: (origin, callback) => {
            // Non-browser requests (curl, server-to-server) have no Origin header.
            if (!origin) return callback(null, true);

            if (IS_PROD) {
                if (ALLOWED_PROD_ORIGINS.has(origin)) return callback(null, true);
                // Allow same Railway domain even if CLIENT_URL drifted in env.
                if (process.env.RAILWAY_PUBLIC_DOMAIN && origin === `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`) {
                    return callback(null, true);
                }
                console.warn(`[CORS] rejecting origin=${origin} (not in ${[...ALLOWED_PROD_ORIGINS].join(', ')} and not a Railway subdomain)`);
                return callback(null, false);
            }

            if (DEV_ORIGINS.includes(origin)) return callback(null, true);
            return callback(null, false);
        },
        credentials: true, // required for cookie-based auth
    })
);

// ─── Cookie Parser ────────────────────────────────────────────────────────────
app.use(cookieParser());

// Lightweight diagnostic: log which admin requests arrive with/without the
// session cookie so we can pinpoint a vanishing cookie in production. The
// JWT itself is never logged.
if (IS_PROD) {
    app.use('/api/admin', (req, res, next) => {
        const hasAdminToken = !!req.cookies?.admin_token;
        const hasSonnetaryToken = !!req.cookies?.sonnetary_token;
        const cookieNames = Object.keys(req.cookies || {});
        console.info(
            `[Admin] ${req.method} ${req.path} | origin=${req.headers.origin || 'none'} | host=${req.headers.host} | cookies=[${cookieNames.join(',')}] | admin_token=${hasAdminToken} | sonnetary_token=${hasSonnetaryToken}`
        );
        next();
    });
}

// ─── Rate Limiters ────────────────────────────────────────────────────────────
// Local limiter state is in memory; restarting the dev server clears local
// lockouts after aggressive checkout/admin testing.
const {
    generalApiLimiter,
    authLimiter,
    stripePaymentLimiter,
    paystackPaymentLimiter,
} = createRateLimiters({ isProd: IS_PROD });

// ─── Body Parsing ─────────────────────────────────────────────────────────────
app.use('/api/paystack/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use('/musics', express.static(path.join(__dirname, '..', 'musics'), {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.mp3')) {
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=604800');
        }
        if (/\.(png|jpg|jpeg|webp)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        }
    },
}));

if (IS_PROD) {
    const distPath = path.join(__dirname, '..', 'dist');
    app.use(express.static(distPath, { index: false }));
}

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/geo', geoRouter);
app.use('/api', generalApiLimiter);
app.use('/api/songs', songsRouter);
app.use('/api/orders', ordersRouter);
app.use(['/api/create-checkout-session', '/api/verify-session'], stripePaymentLimiter);
app.use('/api', paymentsRouter);
app.use('/api/paystack', paystackPaymentLimiter, paystackRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/brainstorm', brainstormRouter);
app.use('/api/promos', promosRouter);
app.use('/api/subscribers', subscribersRouter);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── SPA Fallback (production only) ──────────────────────────────────────────
if (IS_PROD) {
    const distPath = path.join(__dirname, '..', 'dist');
    app.get('/{*path}', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`🎵 YourGbedu server running on http://localhost:${PORT}`);
    if (IS_PROD) {
        console.log(`🔐 CORS — CLIENT_URL: ${CLIENT_URL}`);
        console.log(`🔐 CORS — allowed prod origins: ${[...ALLOWED_PROD_ORIGINS].join(', ')}`);
        console.log(`🔐 CORS — RAILWAY_PUBLIC_DOMAIN: ${process.env.RAILWAY_PUBLIC_DOMAIN || '(not set)'}`);
        console.log(`🍪 Cookie — secure: true, sameSite: lax, trust proxy: 1`);
        console.log(`🌐 Serving SPA from: ${path.join(__dirname, '..', 'dist')}`);
    } else {
        console.log(`🔐 CORS — dev origins: ${DEV_ORIGINS.join(', ')}`);
    }
});

setImmediate(() => {
    const pipeline = getSongPipeline();
    pipeline.resumeInterruptedRuns().catch((err) => {
        console.error('[SongPipeline] resume check failed:', err?.message || err);
    });
    pipeline.purgeOldGenerationState().catch((err) => {
        console.error('[SongPipeline] retention purge failed:', err?.message || err);
    });
});

process.on('SIGTERM', () => {
    const pipeline = getSongPipeline();
    Promise.race([
        pipeline.markInProcessInterrupted(),
        new Promise((resolve) => setTimeout(resolve, 3000)),
    ]).finally(() => process.exit(0));
});
