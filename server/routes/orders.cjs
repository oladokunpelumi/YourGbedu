const express = require('express');
const router = express.Router();
const { randomUUID: uuidv4 } = require('crypto');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth.cjs');
const { PRICING, isFastDelivery } = require('../pricing.cjs');
const { quoteCheckout, parsePromoMetadata } = require('../promos.cjs');

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

async function verifyPaystackPayment(reference) {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { paid: false, amount: null };
    const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return {
        paid: !!(data.status && data.data?.status === 'success'),
        amount: data.data?.amount ?? null,
        metadata: data.data?.metadata ?? {},
    };
}

async function verifyStripePayment(sessionId) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) return { paid: false, amount: null };
    const stripe = require('stripe')(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
        paid: session.payment_status === 'paid',
        amount: session.amount_total ?? null,
        metadata: session.metadata ?? {},
    };
}

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

const STANDARD_DELIVERY_HOURS = 48;
const FAST_DELIVERY_HOURS = 24;

const PRODUCTION_STEPS = [
    {
        title: 'Order Received',
        desc: 'Your order and story preferences have been received.',
        descActive: 'Your order and story preferences are being reviewed.',
        icon: 'check',
    },
    {
        title: 'Song Composing',
        desc: 'Lyrics drafted and melody finalized.',
        descActive: 'Lyrics are being drafted and the melody is being shaped.',
        icon: 'music_note',
    },
    {
        title: 'Final Mastering',
        desc: 'Song is ready.',
        descActive: 'Final review and mastering in progress.',
        icon: 'album',
    },
];

function formatPaidAmount(amount, provider) {
    if (typeof amount !== 'number') return undefined;
    if (provider === 'stripe') return `$${(amount / 100).toFixed(2)} USD`;
    return `₦${(amount / 100).toLocaleString('en-NG')}`;
}

const CreateOrderSchema = z.object({
    songTitle: z.string().max(200).optional(),
    genre: z.string().max(100).optional(),
    mood: z.string().max(100).optional(),
    tempo: z.number().int().min(40).max(300).optional(),
    occasion: z.string().max(200).optional(),
    occasionDetail: z.string().max(500).optional(),
    story: z.string().max(5000).optional(),
    stripeSessionId: z.string().max(500).optional(),
    paystackReference: z.string().max(200).optional(),
    customerEmail: z.string().email().optional().or(z.literal('')),
    recipientType: z.string().max(100).optional(),
    recipientName: z.string().max(200).optional(),
    senderName: z.string().max(200).optional(),
    voiceGender: z.string().max(100).optional(),
    specialQualities: z.string().max(5000).optional(),
    favoriteMemories: z.string().max(5000).optional(),
    specialMessage: z.string().max(5000).optional(),
    fastDelivery: z.union([z.boolean(), z.string()]).optional(),
});

const FreeOrderSchema = CreateOrderSchema.omit({
    stripeSessionId: true,
    paystackReference: true,
}).extend({
    promoCode: z.string().min(1).max(100),
    paymentProvider: z.enum(['paystack', 'stripe']).optional(),
});

function computeOrderProgress(order) {
    const createdAt = new Date(order.created_at);
    const deliveryDate = new Date(order.delivery_date);
    const now = new Date();

    const totalMs = deliveryDate.getTime() - createdAt.getTime();
    const elapsedMs = now.getTime() - createdAt.getTime();
    const overallProgress = Math.max(0, Math.min(1, elapsedMs / totalMs));

    const stepCount = PRODUCTION_STEPS.length;
    const currentStepIndex = Math.min(stepCount - 1, Math.floor(overallProgress * stepCount));
    const stepProgress = Math.round(((overallProgress * stepCount) - currentStepIndex) * 100);

    const remainingMs = Math.max(0, deliveryDate.getTime() - now.getTime());
    const days = Math.floor(remainingMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

    const steps = PRODUCTION_STEPS.map((step, i) => ({
        ...step,
        status: i < currentStepIndex ? 'Completed' : i === currentStepIndex ? 'In Progress' : 'Upcoming',
        active: i === currentStepIndex,
        locked: i > currentStepIndex,
        progress: i === currentStepIndex ? stepProgress : i < currentStepIndex ? 100 : 0,
    }));

    return {
        id: order.id,
        songTitle: order.song_title || 'Custom Song',
        genre: order.genre || 'Not specified',
        mood: order.mood,
        tempo: order.tempo,
        occasion: order.occasion,
        occasionDetail: order.occasion_detail || null,
        story: order.story,
        status: overallProgress >= 1 ? 'completed' : order.status || 'in_production',
        createdAt: order.created_at,
        deliveryDate: order.delivery_date,
        overallProgress: Math.round(overallProgress * 100),
        currentStep: currentStepIndex + 1,
        steps,
        timeLeft: { days, hours, minutes, seconds },
        amount: order.amount,
        aiBrief: order.ai_brief || null,
        recipientType: order.recipient_type || null,
        recipientName: order.recipient_name || null,
        senderName: order.sender_name || null,
        voiceGender: order.voice_gender || null,
        specialQualities: order.special_qualities || null,
        favoriteMemories: order.favorite_memories || null,
        specialMessage: order.special_message || null,
        promoCodePreview: order.promo_code_preview || null,
        promoDiscountPercent: order.promo_discount_percent || null,
        originalAmount: order.original_amount || null,
        discountedAmount: order.discounted_amount || null,
        finalSongUrl: order.final_song_url || null,
        finalSongTitle: order.final_song_title || null,
        deliveredAt: order.delivered_at || null,
        rating: typeof order.rating === 'number' ? order.rating : null,
    };
}

// GET /api/orders/track — return orders for the authenticated user
// Uses req.user.email from the verified JWT — the email param is ignored to prevent
// horizontal privilege escalation (users can only see their own orders).
router.get('/track', requireAuth, (req, res) => {
    try {
        const dbConn = getDb();
        const email = req.user.email;
        if (!email) {
            return res.status(400).json({ error: 'No email associated with this session.' });
        }

        const orders = dbConn.prepare(
            'SELECT * FROM orders WHERE LOWER(TRIM(customer_email)) = ? ORDER BY created_at DESC'
        ).all(String(email).trim().toLowerCase());

        res.json(orders.map(computeOrderProgress));
    } catch (err) {
        console.error('Error fetching orders by email:', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// POST /api/orders/free — create an order with a one-time 100% promo code.
router.post('/free', (req, res) => {
    const parsed = FreeOrderSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request data.', details: parsed.error.flatten() });
    }

    try {
        const dbConn = getDb();
        const data = parsed.data;

        const createFreeOrder = dbConn.transaction((input) => {
            const quote = quoteCheckout({
                db: dbConn,
                provider: input.paymentProvider || 'paystack',
                fastDelivery: input.fastDelivery,
                promoCode: input.promoCode,
            });

            if (!quote.promo || quote.promo.discountPercent !== 100 || quote.finalAmount !== 0 || !quote.promo.id) {
                const err = new Error('This code is not eligible for free checkout.');
                err.statusCode = 400;
                throw err;
            }

            const id = uuidv4();
            const now = new Date().toISOString();
            const deliveryHours = isFastDelivery(input.fastDelivery) ? FAST_DELIVERY_HOURS : STANDARD_DELIVERY_HOURS;
            const deliveryDate = new Date(Date.now() + deliveryHours * 60 * 60 * 1000).toISOString();

            const redeemed = dbConn.prepare(`
                UPDATE promo_codes
                SET used_count = used_count + 1, used_at = ?, used_order_id = ?
                WHERE id = ?
                  AND disabled = 0
                  AND (max_uses IS NULL OR used_count < max_uses)
            `).run(now, id, quote.promo.id);

            if (redeemed.changes === 0) {
                const err = new Error('Promo code has already been used.');
                err.statusCode = 409;
                throw err;
            }

            dbConn.prepare(`
                INSERT INTO orders (
                    id, song_title, genre, mood, tempo, occasion, occasion_detail, story,
                    status, created_at, delivery_date,
                    stripe_session_id, paystack_reference, amount, customer_email,
                    recipient_type, recipient_name, sender_name, voice_gender,
                    special_qualities, favorite_memories, special_message,
                    promo_code_id, promo_code_preview, promo_discount_percent,
                    original_amount, discounted_amount
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_production', ?, ?, NULL, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                id, input.songTitle || 'Custom Song', input.genre || '', input.mood || '', input.tempo || 100,
                input.occasion || '', input.occasionDetail || '', input.story || '', now, deliveryDate,
                input.customerEmail ? String(input.customerEmail).trim().toLowerCase() : null,
                input.recipientType || '', input.recipientName || '', input.senderName || '',
                input.voiceGender || '', input.specialQualities || '', input.favoriteMemories || '',
                input.specialMessage || '', quote.promo.id, quote.promo.codePreview,
                quote.promo.discountPercent, quote.originalAmount, quote.finalAmount
            );

            return dbConn.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        });

        const order = createFreeOrder(data);
        if (data.customerEmail) {
            const normalized = String(data.customerEmail).trim().toLowerCase();
            try {
                getDb()
                    .prepare('UPDATE subscribers SET converted_order_id = ? WHERE email = ? AND converted_order_id IS NULL')
                    .run(order.id, normalized);
            } catch (subErr) {
                console.warn('Order: subscriber link skipped:', subErr.message);
            }

            void getEmailModule().sendConfirmationEmail({
                to: data.customerEmail,
                orderId: order.id.slice(0, 8).toUpperCase(),
                genre: data.genre,
                deliveryDate: order.delivery_date,
                reference: order.promo_code_preview,
                amountLabel: formatPaidAmount(0, data.paymentProvider === 'stripe' ? 'stripe' : 'paystack'),
            });
        }

        res.status(201).json(computeOrderProgress(order));
    } catch (err) {
        if (!err.statusCode || err.statusCode >= 500) {
            console.error('Error creating free order:', err);
        }
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create free order' });
    }
});

// PATCH /api/orders/:id/rating — customer submits a 1-5 rating for their completed song.
// Public (gated by knowing the order id, same as the GET below) so the link in
// the completion email works without forcing a magic-link login.
router.patch('/:id/rating', (req, res) => {
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
    }

    try {
        const dbConn = getDb();
        const result = dbConn.prepare('UPDATE orders SET rating = ? WHERE id = ?').run(rating, req.params.id);
        if (result.changes === 0) {
            const fallback = dbConn.prepare(
                "UPDATE orders SET rating = ? WHERE UPPER(SUBSTR(id, 1, 8)) = UPPER(?)"
            ).run(rating, req.params.id.slice(0, 8));
            if (fallback.changes === 0) return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ rating });
    } catch (err) {
        console.error('Error saving rating:', err);
        res.status(500).json({ error: 'Failed to save rating' });
    }
});

// GET /api/orders/:id — return single order (UUID or 8-char short ID)
// The order id acts as a shareable tracking reference. Email-based order lists
// still require magic-link authentication via /api/orders/track.
router.get('/:id', (req, res) => {
    try {
        const dbConn = getDb();
        const order = dbConn.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id)
            ?? dbConn.prepare("SELECT * FROM orders WHERE UPPER(SUBSTR(id, 1, 8)) = UPPER(?) LIMIT 1").get(req.params.id.slice(0, 8));

        if (!order) return res.status(404).json({ error: 'Order not found' });

        res.json(computeOrderProgress(order));
    } catch (err) {
        console.error('Error fetching order:', err);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// POST /api/orders — create a new order (client-side fallback after payment).
// Requires a valid payment reference that is verified server-side before inserting.
router.post('/', async (req, res) => {
    const parsed = CreateOrderSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request data.', details: parsed.error.flatten() });
    }

    const { songTitle, genre, mood, tempo, occasion, occasionDetail, story, stripeSessionId, paystackReference, customerEmail, recipientType, recipientName, senderName, voiceGender, specialQualities, favoriteMemories, specialMessage, fastDelivery } = parsed.data;

    if (!paystackReference && !stripeSessionId) {
        return res.status(400).json({ error: 'A verified payment reference is required.' });
    }

    try {
        const dbConn = getDb();
        let verifiedAmount = null;
        let paymentMetadata = {};
        let paymentProvider = 'paystack';

        if (paystackReference) {
            const existing = dbConn.prepare('SELECT * FROM orders WHERE paystack_reference = ?').get(paystackReference);
            if (existing) return res.status(200).json(computeOrderProgress(existing));

            const payment = await verifyPaystackPayment(paystackReference);
            if (!payment.paid) {
                return res.status(402).json({ error: 'Payment not confirmed. Please wait a moment and try again.' });
            }
            verifiedAmount = payment.amount;
            paymentMetadata = payment.metadata || {};
            paymentProvider = 'paystack';
        }

        if (stripeSessionId) {
            const existing = dbConn.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').get(stripeSessionId);
            if (existing) return res.status(200).json(computeOrderProgress(existing));

            const payment = await verifyStripePayment(stripeSessionId);
            if (!payment.paid) {
                return res.status(402).json({ error: 'Payment not confirmed. Please wait a moment and try again.' });
            }
            verifiedAmount = payment.amount;
            paymentMetadata = payment.metadata || {};
            paymentProvider = 'stripe';
        }

        const id = uuidv4();
        const createdAt = new Date().toISOString();
        const deliveryHours = isFastDelivery(fastDelivery) ? FAST_DELIVERY_HOURS : STANDARD_DELIVERY_HOURS;
        const deliveryDate = new Date(Date.now() + deliveryHours * 60 * 60 * 1000).toISOString();
        const promo = parsePromoMetadata(paymentMetadata);

        dbConn.prepare(`
            INSERT INTO orders (
                id, song_title, genre, mood, tempo, occasion, occasion_detail, story,
                status, created_at, delivery_date,
                stripe_session_id, paystack_reference, amount, customer_email,
                recipient_type, recipient_name, sender_name, voice_gender,
                special_qualities, favorite_memories, special_message,
                promo_code_id, promo_code_preview, promo_discount_percent,
                original_amount, discounted_amount
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, songTitle || 'Custom Song', genre || '', mood || '', tempo || 100,
            occasion || '', occasionDetail || '', story || '', 'in_production', createdAt, deliveryDate,
            stripeSessionId || null, paystackReference || null,
            verifiedAmount || PRICING.ngn.standardKobo,
            customerEmail ? String(customerEmail).trim().toLowerCase() : null,
            recipientType || '', recipientName || '', senderName || '',
            voiceGender || '', specialQualities || '', favoriteMemories || '', specialMessage || '',
            promo.promoCodeId, promo.promoCodePreview, promo.promoDiscountPercent,
            promo.originalAmount, promo.discountedAmount
        );

        const order = dbConn.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (customerEmail) {
            const normalized = String(customerEmail).trim().toLowerCase();
            try {
                dbConn
                    .prepare('UPDATE subscribers SET converted_order_id = ? WHERE email = ? AND converted_order_id IS NULL')
                    .run(id, normalized);
            } catch (subErr) {
                // best effort — never block order creation on a subscriber update
                console.warn('Order: subscriber link skipped:', subErr.message);
            }

            void getEmailModule().sendConfirmationEmail({
                to: customerEmail,
                orderId: id.slice(0, 8).toUpperCase(),
                genre,
                deliveryDate,
                reference: paystackReference || stripeSessionId,
                amountLabel: formatPaidAmount(verifiedAmount, paymentProvider),
            });
        }
        res.status(201).json(computeOrderProgress(order));
    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

module.exports = router;
