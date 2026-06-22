const express = require('express');
const { randomUUID: uuidv4 } = require('crypto');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const router = express.Router();
const { getOne, execSql } = require('../db-helpers.cjs');

const STANDARD_PROMO_CODE = process.env.STANDARD_PROMO_CODE || 'YOURGBEDU50';
const STANDARD_DISCOUNT_PERCENT = Number(process.env.STANDARD_PROMO_DISCOUNT || 50);

const SubscribeSchema = z.object({
    email: z.string().email(),
    source: z.string().max(200).optional(),
});

const subscribeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many subscription attempts. Please try again later.' },
});

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

// POST /api/subscribers — capture an email and return the promo code to show inline.
// Idempotent: re-subscribing the same email returns the existing row.
router.post('/', subscribeLimiter, async (req, res) => {
    const parsed = SubscribeSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid email address.' });
    }

    const email = normalizeEmail(parsed.data.email);
    const source = parsed.data.source?.trim() || 'popup';

    try {
        const existing = await getOne('SELECT * FROM subscribers WHERE email = ?', email);
        if (existing) {
            return res.json({
                subscriber: { email: existing.email, createdAt: existing.created_at },
                promo: { code: STANDARD_PROMO_CODE, discountPercent: STANDARD_DISCOUNT_PERCENT },
            });
        }

        const id = uuidv4();
        const now = new Date().toISOString();
        await execSql('INSERT INTO subscribers (id, email, created_at, source) VALUES (?, ?, ?, ?)', id, email, now, source);

        // Fire-and-forget: subscribe to the Klaviyo list (welcome flow) + event.
        const klaviyo = require('../services/klaviyo.cjs');
        void klaviyo.subscribeToList(email, { properties: { signup_source: source } });
        void klaviyo.track('Subscribed to Promo', {
            email,
            properties: { source, promo_code: STANDARD_PROMO_CODE, discount_percent: STANDARD_DISCOUNT_PERCENT },
        });

        res.status(201).json({
            subscriber: { email, createdAt: now },
            promo: { code: STANDARD_PROMO_CODE, discountPercent: STANDARD_DISCOUNT_PERCENT },
        });
    } catch (err) {
        // UNIQUE constraint races resolve to "already subscribed" — treat as success.
        if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.json({
                subscriber: { email },
                promo: { code: STANDARD_PROMO_CODE, discountPercent: STANDARD_DISCOUNT_PERCENT },
            });
        }
        console.error('Subscriber: insert failed:', err);
        res.status(500).json({ error: 'Could not save your email. Please try again.' });
    }
});

module.exports = router;
