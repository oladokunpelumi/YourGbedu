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
const rateLimit = require('express-rate-limit');
const path = require('path');
const { getDevClientOrigins } = require('./client-url.cjs');

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

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

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
            imgSrc: ["'self'", 'data:', 'blob:'],
            mediaSrc: ["'self'", 'blob:'],
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

// CORS: explicit allowlist — never reflect arbitrary origins
const DEV_ORIGINS = getDevClientOrigins();
app.use(
    cors({
        origin: IS_PROD ? CLIENT_URL : DEV_ORIGINS,
        credentials: true, // required for cookie-based auth
    })
);

// ─── Cookie Parser ────────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Too many sign-in attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const generalApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

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
app.use('/api', generalApiLimiter);
app.use('/api/songs', songsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api', paymentsRouter);
app.use('/api/paystack', paymentLimiter, paystackRouter);
app.use('/api/admin', adminRouter);
app.use('/api/auth', authLimiter, authRouter);
app.use('/api/geo', geoRouter);
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
    console.log(`🔐 CORS origin: ${IS_PROD ? CLIENT_URL : DEV_ORIGINS.join(', ')}`);
    if (IS_PROD) {
        console.log(`🌐 Serving SPA from: ${path.join(__dirname, '..', 'dist')}`);
    }
});
