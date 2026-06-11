const rateLimit = require('express-rate-limit');

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

function originalUrl(req) {
    return req.originalUrl || req.url || '';
}

function createRateLimiters({ isProd = process.env.NODE_ENV === 'production', limits = {} } = {}) {
    const common = {
        standardHeaders: true,
        legacyHeaders: false,
    };

    const generalApiLimiter = rateLimit({
        windowMs: FIFTEEN_MINUTES,
        max: limits.generalApi ?? (isProd ? 1200 : 10000),
        message: { error: 'Too many API requests. Please try again later.' },
        skip: (req) => {
            const url = originalUrl(req);
            if (url.startsWith('/api/geo')) return true;
            if (url.startsWith('/api/paystack')) return true;
            if (url.startsWith('/api/create-checkout-session')) return true;
            if (url.startsWith('/api/verify-session')) return true;
            if (url.startsWith('/api/auth')) return true;
            if (!isProd && url.startsWith('/api/admin')) return true;
            return false;
        },
        ...common,
    });

    const authLimiter = rateLimit({
        windowMs: ONE_HOUR,
        max: limits.auth ?? (isProd ? 10 : 1000),
        message: { error: 'Too many sign-in attempts. Please try again later.' },
        ...common,
    });

    const stripePaymentLimiter = rateLimit({
        windowMs: FIFTEEN_MINUTES,
        max: limits.stripePayment ?? (isProd ? 20 : 1000),
        message: { error: 'Too many Stripe payment requests. Please try again later.' },
        ...common,
    });

    const paystackPaymentLimiter = rateLimit({
        windowMs: FIFTEEN_MINUTES,
        max: limits.paystackPayment ?? (isProd ? 30 : 1000),
        message: { error: 'Too many Paystack payment requests. Please try again later.' },
        ...common,
    });

    return {
        generalApiLimiter,
        authLimiter,
        stripePaymentLimiter,
        paystackPaymentLimiter,
    };
}

module.exports = {
    createRateLimiters,
};
