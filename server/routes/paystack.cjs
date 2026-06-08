const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { z } = require('zod');
const { isFastDelivery } = require('../pricing.cjs');
const { getClientUrlFromRequest } = require('../client-url.cjs');
const { quoteCheckout, quoteMetadata, parsePromoMetadata } = require('../promos.cjs');

const InitializeSchema = z.object({
    email: z.string().email().optional().or(z.literal('')),
    // amount is intentionally absent — price is always SONG_PRICE_KOBO, never client-controlled
    metadata: z.record(z.string(), z.unknown()).optional(),
    promoCode: z.string().max(100).optional(),
    fullPrice: z.union([z.boolean(), z.string()]).optional(),
});

const PAYSTACK_BASE_URL = 'https://api.paystack.co';
const STANDARD_DELIVERY_HOURS = 48;
const FAST_DELIVERY_HOURS = 24;

let db;
function getDb() {
    if (!db) db = require('../db.cjs');
    return db;
}

let emailModule;
function getEmailModule() {
    if (!emailModule) emailModule = require('../email.cjs');
    return emailModule;
}

function getPaystackSecretKey() {
    return process.env.PAYSTACK_SECRET_KEY;
}

function safeMetadataValue(value) {
    return String(value || '').substring(0, 500);
}

function buildCheckoutMetadata(metadata, customerEmail, quote) {
    return {
        customerEmail,
        recipientType: safeMetadataValue(metadata.recipientType),
        senderName: safeMetadataValue(metadata.senderName),
        genre: safeMetadataValue(metadata.genre),
        occasion: safeMetadataValue(metadata.occasion),
        occasionDetail: safeMetadataValue(metadata.occasionDetail),
        voiceGender: safeMetadataValue(metadata.voiceGender),
        specialQualities: safeMetadataValue(metadata.specialQualities),
        favoriteMemories: safeMetadataValue(metadata.favoriteMemories),
        specialMessage: safeMetadataValue(metadata.specialMessage),
        fastDelivery: isFastDelivery(metadata.fastDelivery) ? 'true' : 'false',
        ...quoteMetadata(quote),
    };
}

// ── Initialize a Paystack transaction ─────────────────────────────────────────
router.post('/initialize', async (req, res) => {
    const parsed = InitializeSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid checkout request.' });
    }

    try {
        const { email, metadata, promoCode, fullPrice } = parsed.data;
        const customerEmail = email || 'guest@yourgbedu.com';
        const resolvedMetadata = metadata || {};
        const quote = quoteCheckout({
            db: getDb(),
            provider: 'paystack',
            fastDelivery: resolvedMetadata.fastDelivery,
            promoCode,
            fullPrice,
        });
        if (quote.finalAmount <= 0) {
            return res.status(400).json({ error: 'This promo code should be completed through free checkout.' });
        }
        const amount = quote.finalAmount;
        const paystackSecret = getPaystackSecretKey();

        if (!paystackSecret) {
            return res.status(503).json({ error: 'Payment gateway not configured.' });
        }

        const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${paystackSecret}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: customerEmail,
                amount,
                currency: 'NGN',
                callback_url: `${getClientUrlFromRequest(req)}/#/payment-success`,
                metadata: buildCheckoutMetadata(resolvedMetadata, customerEmail, quote),
            }),
        });

        const data = await response.json();

        if (data.status) {
            res.json({
                authorization_url: data.data.authorization_url,
                access_code: data.data.access_code,
                reference: data.data.reference,
            });
        } else {
            console.error('Paystack Initialization Error:', data.message);
            res.status(400).json({ error: data.message });
        }
    } catch (err) {
        console.error('Error initializing Paystack transaction', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to initialize transaction' });
    }
});

// ── Verify a Paystack transaction (client-side fallback) ──────────────────────
router.get('/verify/:reference', async (req, res) => {
    try {
        const { reference } = req.params;
        const paystackSecret = getPaystackSecretKey();
        if (!paystackSecret) {
            return res.status(503).json({ error: 'Payment gateway not configured.' });
        }

        const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${paystackSecret}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (data.status && data.data.status === 'success') {
            res.json({ paid: true, amount: data.data.amount, metadata: data.data.metadata });
        } else {
            res.json({ paid: false, message: 'Transaction not successful' });
        }
    } catch {
        console.error('Error verifying Paystack transaction');
        res.status(500).json({ error: 'Failed to verify transaction' });
    }
});

// ── Paystack Webhook ──────────────────────────────────────────────────────────
// Paystack signs webhooks with the merchant's secret key (same as PAYSTACK_SECRET_KEY).
// https://paystack.com/docs/payments/webhooks/#verify-event-origin
router.post('/webhook', (req, res) => {
    const signature = req.headers['x-paystack-signature'];
    const paystackSecret = getPaystackSecretKey();

    if (!signature) {
        console.warn('[Webhook] Missing x-paystack-signature header — rejected');
        return res.status(401).json({ error: 'Missing signature' });
    }
    if (!paystackSecret) {
        console.error('[Webhook] PAYSTACK_SECRET_KEY missing');
        return res.status(503).json({ error: 'Webhook secret not configured' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

    const hash = crypto
        .createHmac('sha512', paystackSecret)
        .update(rawBody)
        .digest('hex');

    const hashBuffer = Buffer.from(hash, 'utf8');
    const signatureBuffer = Buffer.from(String(signature), 'utf8');
    if (hashBuffer.length !== signatureBuffer.length || !crypto.timingSafeEqual(hashBuffer, signatureBuffer)) {
        console.warn('[Webhook] Invalid signature — rejected');
        return res.status(401).json({ error: 'Invalid signature' });
    }

    let event;
    try {
        event = JSON.parse(rawBody.toString());
    } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    // Acknowledge immediately before doing heavy work
    res.sendStatus(200);

    if (event.event === 'charge.success') {
        const dbConn = getDb();
        const { reference, metadata, customer, amount } = event.data;
        const promo = parsePromoMetadata(metadata || {});

        const existing = dbConn.prepare('SELECT id FROM orders WHERE paystack_reference = ?').get(reference);
        if (existing) {
            console.log(`[Webhook] Order for reference already exists, skipping`);
            return;
        }

        const id = uuidv4();
        const createdAt = new Date().toISOString();
        const actualDeliveryHours = isFastDelivery(metadata?.fastDelivery)
            ? FAST_DELIVERY_HOURS
            : STANDARD_DELIVERY_HOURS;
        const deliveryDate = new Date(
            Date.now() + actualDeliveryHours * 60 * 60 * 1000
        ).toISOString();

        try {
            dbConn.prepare(`
                INSERT INTO orders (
                    id, song_title, genre, mood, tempo, occasion, occasion_detail, story, status,
                    created_at, delivery_date, paystack_reference, amount,
                    recipient_type, sender_name, voice_gender,
                    special_qualities, favorite_memories, special_message, customer_email,
                    promo_code_id, promo_code_preview, promo_discount_percent,
                    original_amount, discounted_amount
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_production', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                id,
                'Custom Song',
                metadata?.genre || '',
                '', 100,
                metadata?.occasion || '',
                metadata?.occasionDetail || '',
                '',
                createdAt,
                deliveryDate,
                reference,
                amount,
                metadata?.recipientType || '',
                metadata?.senderName || '',
                metadata?.voiceGender || '',
                metadata?.specialQualities || '',
                metadata?.favoriteMemories || '',
                metadata?.specialMessage || '',
                metadata?.customerEmail || customer?.email || null,
                promo.promoCodeId,
                promo.promoCodePreview,
                promo.promoDiscountPercent,
                promo.originalAmount,
                promo.discountedAmount
            );

            console.log(`[Webhook] Order created`);

            const customerEmail = metadata?.customerEmail || customer?.email;
            if (customerEmail) {
                getEmailModule().sendConfirmationEmail({
                    to: customerEmail,
                    orderId: id.slice(0, 8).toUpperCase(),
                    genre: metadata?.genre,
                    mood: metadata?.mood,
                    deliveryDate,
                    reference,
                    amountLabel: typeof amount === 'number' ? `₦${(amount / 100).toLocaleString('en-NG')}` : undefined,
                });
            }
        } catch (err) {
            console.error('[Webhook] Error creating order:', err);
        }
    }
});

module.exports = router;
