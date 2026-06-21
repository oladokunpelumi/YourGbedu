const express = require('express');
const router = express.Router();
const { randomBytes, randomUUID: uuidv4 } = require('crypto');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { optionalAuth, requireAuth } = require('../middleware/auth.cjs');
const { PRICING, isFastDelivery } = require('../pricing.cjs');
const { quoteCheckout, parsePromoMetadata } = require('../promos.cjs');
const { getOne, getAll, execSql, withTransaction } = require('../db-helpers.cjs');

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

function makeTrackingToken() {
    return randomBytes(16).toString('hex');
}

function isOwnerOrAdmin(req, order) {
    if (req.user?.role === 'admin') return true;
    const userEmail = String(req.user?.email || '').trim().toLowerCase();
    const orderEmail = String(order.customer_email || '').trim().toLowerCase();
    return !!userEmail && !!orderEmail && userEmail === orderEmail;
}

function hasValidTrackingToken(req, order) {
    const token = typeof req.query?.t === 'string' ? req.query.t : '';
    return !!token && !!order.tracking_token && token === order.tracking_token;
}

// A full order UUID is itself an unguessable capability (122 bits of entropy,
// same class as the tracking token), so knowing it grants read access — this is
// what lets customers track with just their order ID, no email round-trip.
// The IDOR risk we closed earlier was the enumerable 8-char SHORT id; that one
// still requires the email-match lookup or a session.
const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function canAccessOrder(req, order) {
    if (FULL_UUID_RE.test(String(req.params?.id || '')) && req.params.id.toLowerCase() === String(order.id).toLowerCase()) {
        return true;
    }
    return hasValidTrackingToken(req, order) || isOwnerOrAdmin(req, order);
}

async function validateVerifiedAmount({ provider, metadata, requestFastDelivery, verifiedAmount }) {
    if (typeof verifiedAmount !== 'number') return false;

    const fastDelivery = metadata?.fastDelivery ?? requestFastDelivery;
    const currentQuote = await quoteCheckout({ provider, fastDelivery });
    const fullQuote = await quoteCheckout({ provider, fastDelivery, fullPrice: true });
    const promo = parsePromoMetadata(metadata || {});
    const allowed = new Set([
        currentQuote.finalAmount,
        fullQuote.finalAmount,
        Math.round(fullQuote.originalAmount * 0.5),
    ]);

    if (Number.isFinite(promo.discountedAmount)) {
        return allowed.has(promo.discountedAmount) && verifiedAmount === promo.discountedAmount;
    }

    return allowed.has(verifiedAmount);
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
        trackingToken: order.tracking_token || null,
    };
}

// GET /api/orders/track — return orders for the authenticated user
// Uses req.user.email from the verified JWT — the email param is ignored to prevent
// horizontal privilege escalation (users can only see their own orders).
router.get('/track', requireAuth, async (req, res) => {
    try {
        const email = req.user.email;
        if (!email) {
            return res.status(400).json({ error: 'No email associated with this session.' });
        }

        const orders = await getAll(
            'SELECT * FROM orders WHERE LOWER(TRIM(customer_email)) = ? ORDER BY created_at DESC',
            String(email).trim().toLowerCase()
        );

        res.json(orders.map(computeOrderProgress));
    } catch (err) {
        console.error('Error fetching orders by email:', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// POST /api/orders/free — create an order with a one-time 100% promo code.
router.post('/free', async (req, res) => {
    const parsed = FreeOrderSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid request data.', details: parsed.error.flatten() });
    }

    try {
        const data = parsed.data;

        const quote = await quoteCheckout({
            provider: data.paymentProvider || 'paystack',
            fastDelivery: data.fastDelivery,
            promoCode: data.promoCode,
        });
        if (!quote.promo || quote.promo.discountPercent !== 100 || quote.finalAmount !== 0 || !quote.promo.id) {
            const err = new Error('This code is not eligible for free checkout.');
            err.statusCode = 400;
            throw err;
        }

        const id = uuidv4();
        const trackingToken = makeTrackingToken();
        const now = new Date().toISOString();
        const deliveryHours = isFastDelivery(data.fastDelivery) ? FAST_DELIVERY_HOURS : STANDARD_DELIVERY_HOURS;
        const deliveryDate = new Date(Date.now() + deliveryHours * 60 * 60 * 1000).toISOString();

        const order = await withTransaction(async (tx) => {
            const redeemed = await tx.execSql(`
                UPDATE promo_codes
                SET used_count = used_count + 1, used_at = ?, used_order_id = ?
                WHERE id = ?
                  AND disabled = 0
                  AND (max_uses IS NULL OR used_count < max_uses)
            `, now, id, quote.promo.id);

            if (redeemed.changes === 0) {
                const err = new Error('Promo code has already been used.');
                err.statusCode = 409;
                throw err;
            }

            await tx.execSql(`
                INSERT INTO orders (
                    id, tracking_token, song_title, genre, mood, tempo, occasion, occasion_detail, story,
                    status, created_at, delivery_date,
                    stripe_session_id, paystack_reference, amount, customer_email,
                    recipient_type, recipient_name, sender_name, voice_gender,
                    special_qualities, favorite_memories, special_message,
                    promo_code_id, promo_code_preview, promo_discount_percent,
                    original_amount, discounted_amount
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_production', ?, ?, NULL, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
                id, trackingToken, data.songTitle || 'Custom Song', data.genre || '', data.mood || '', data.tempo || 100,
                data.occasion || '', data.occasionDetail || '', data.story || '', now, deliveryDate,
                data.customerEmail ? String(data.customerEmail).trim().toLowerCase() : null,
                data.recipientType || '', data.recipientName || '', data.senderName || '',
                data.voiceGender || '', data.specialQualities || '', data.favoriteMemories || '',
                data.specialMessage || '', quote.promo.id, quote.promo.codePreview,
                quote.promo.discountPercent, quote.originalAmount, quote.finalAmount
            );

            return await tx.getOne('SELECT * FROM orders WHERE id = ?', id);
        });
        require('../services/song-pipeline.cjs').getSongPipeline().startGenerationInBackgroundForOrder(order);
        if (data.customerEmail) {
            const normalized = String(data.customerEmail).trim().toLowerCase();
            try {
                await execSql(
                    'UPDATE subscribers SET converted_order_id = ? WHERE email = ? AND converted_order_id IS NULL',
                    order.id,
                    normalized
                );
            } catch (subErr) {
                console.warn('Order: subscriber link skipped:', subErr.message);
            }

            const klaviyo = require('../services/klaviyo.cjs');
            void klaviyo.track('Placed Order', {
                email: data.customerEmail,
                value: 0,
                uniqueId: order.id,
                properties: {
                    order_id: order.id,
                    occasion: order.occasion || data.occasion || null,
                    genre: order.genre || data.genre || null,
                    recipient_type: order.recipient_type || null,
                    fast_delivery: isFastDelivery(data.fastDelivery),
                    promo_code: order.promo_code_preview || null,
                    free: true,
                },
                profileProps: order.sender_name ? { first_name: order.sender_name } : {},
            });

            // Klaviyo owns the confirmation email once its flow is live; until then Resend sends it.
            if (!klaviyo.klaviyoOwnsTransactional()) {
                void getEmailModule().sendConfirmationEmail({
                    to: data.customerEmail,
                    orderId: order.id,
                    trackingToken: order.tracking_token,
                    genre: data.genre,
                    deliveryDate: order.delivery_date,
                    reference: order.promo_code_preview,
                    amountLabel: formatPaidAmount(0, data.paymentProvider === 'stripe' ? 'stripe' : 'paystack'),
                });
            }
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
router.patch('/:id/rating', optionalAuth, async (req, res) => {
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
    }

    try {
        const order = await getOne('SELECT * FROM orders WHERE id = ?', req.params.id);
        if (!order || !canAccessOrder(req, order)) return res.status(404).json({ error: 'Order not found' });

        await execSql('UPDATE orders SET rating = ? WHERE id = ?', rating, req.params.id);
        res.json({ rating });
    } catch (err) {
        console.error('Error saving rating:', err);
        res.status(500).json({ error: 'Failed to save rating' });
    }
});

// POST /api/orders/lookup — guest tracking for the short order number printed in
// emails. The 8-char id alone is enumerable, so it must be paired with the email
// used on the order (standard guest-order-tracking: knowledge of both = access).
// Returns the full order (incl. trackingToken) so the client can build a durable
// /track?id=<uuid>&t=<token> URL. Strictly rate-limited to blunt enumeration.
const lookupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 30 : 1000,
    message: { error: 'Too many lookup attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const LookupSchema = z.object({
    reference: z.string().trim().min(8).max(64),
    email: z.string().trim().email(),
});

router.post('/lookup', lookupLimiter, async (req, res) => {
    const raw = typeof req.body?.reference === 'string' ? req.body.reference.replace(/^#/, '') : '';
    const parsed = LookupSchema.safeParse({ reference: raw, email: req.body?.email });
    if (!parsed.success) {
        return res.status(400).json({ error: 'Enter your order number and the email used on the order.' });
    }

    const reference = parsed.data.reference.toLowerCase();
    const email = parsed.data.email.toLowerCase();

    try {
        const order = FULL_UUID_RE.test(reference)
            ? await getOne(
                'SELECT * FROM orders WHERE LOWER(id) = ? AND LOWER(TRIM(customer_email)) = ?',
                reference, email
            )
            : await getOne(
                'SELECT * FROM orders WHERE LOWER(SUBSTR(id, 1, 8)) = ? AND LOWER(TRIM(customer_email)) = ? ORDER BY created_at DESC LIMIT 1',
                reference.slice(0, 8), email
            );

        if (!order) return res.status(404).json({ error: 'No order matches that number and email.' });
        res.json(computeOrderProgress(order));
    } catch (err) {
        console.error('Error looking up order:', err);
        res.status(500).json({ error: 'Failed to look up order' });
    }
});

// GET /api/orders/:id — return a single order by full UUID (the UUID itself is an
// unguessable capability), by capability token, or by an authenticated session.
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const order = await getOne('SELECT * FROM orders WHERE id = ?', req.params.id);

        if (!order || !canAccessOrder(req, order)) return res.status(404).json({ error: 'Order not found' });

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

    if ((paystackReference ? 1 : 0) + (stripeSessionId ? 1 : 0) !== 1) {
        return res.status(400).json({ error: 'Exactly one verified payment reference is required.' });
    }

    try {
        let verifiedAmount = null;
        let paymentMetadata = {};
        let paymentProvider = 'paystack';

        if (paystackReference) {
            const existing = await getOne('SELECT * FROM orders WHERE paystack_reference = ?', paystackReference);
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
            const existing = await getOne('SELECT * FROM orders WHERE stripe_session_id = ?', stripeSessionId);
            if (existing) return res.status(200).json(computeOrderProgress(existing));

            const payment = await verifyStripePayment(stripeSessionId);
            if (!payment.paid) {
                return res.status(402).json({ error: 'Payment not confirmed. Please wait a moment and try again.' });
            }
            verifiedAmount = payment.amount;
            paymentMetadata = payment.metadata || {};
            paymentProvider = 'stripe';
        }

        const amountValid = await validateVerifiedAmount({
            provider: paymentProvider,
            metadata: paymentMetadata,
            requestFastDelivery: fastDelivery,
            verifiedAmount,
        });
        if (!amountValid) {
            return res.status(402).json({ error: 'Payment amount does not match checkout total.' });
        }

        const id = uuidv4();
        const trackingToken = makeTrackingToken();
        const createdAt = new Date().toISOString();
        const deliveryHours = isFastDelivery(fastDelivery) ? FAST_DELIVERY_HOURS : STANDARD_DELIVERY_HOURS;
        const deliveryDate = new Date(Date.now() + deliveryHours * 60 * 60 * 1000).toISOString();
        const promo = parsePromoMetadata(paymentMetadata);

        await execSql(`
            INSERT INTO orders (
                id, tracking_token, song_title, genre, mood, tempo, occasion, occasion_detail, story,
                status, created_at, delivery_date,
                stripe_session_id, paystack_reference, amount, customer_email,
                recipient_type, recipient_name, sender_name, voice_gender,
                special_qualities, favorite_memories, special_message,
                promo_code_id, promo_code_preview, promo_discount_percent,
                original_amount, discounted_amount
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            id, trackingToken, songTitle || 'Custom Song', genre || '', mood || '', tempo || 100,
            occasion || '', occasionDetail || '', story || '', 'in_production', createdAt, deliveryDate,
            stripeSessionId || null, paystackReference || null,
            verifiedAmount || PRICING.ngn.standardKobo,
            customerEmail ? String(customerEmail).trim().toLowerCase() : null,
            recipientType || '', recipientName || '', senderName || '',
            voiceGender || '', specialQualities || '', favoriteMemories || '', specialMessage || '',
            promo.promoCodeId, promo.promoCodePreview, promo.promoDiscountPercent,
            promo.originalAmount, promo.discountedAmount
        );

        const order = await getOne('SELECT * FROM orders WHERE id = ?', id);
        require('../services/song-pipeline.cjs').getSongPipeline().startGenerationInBackgroundForOrder(order);
        if (customerEmail) {
            const normalized = String(customerEmail).trim().toLowerCase();
            try {
                await execSql(
                    'UPDATE subscribers SET converted_order_id = ? WHERE email = ? AND converted_order_id IS NULL',
                    id,
                    normalized
                );
            } catch (subErr) {
                // best effort — never block order creation on a subscriber update
                console.warn('Order: subscriber link skipped:', subErr.message);
            }

            const klaviyo = require('../services/klaviyo.cjs');
            void klaviyo.track('Placed Order', {
                email: customerEmail,
                value: typeof verifiedAmount === 'number' ? Math.round(verifiedAmount) / 100 : undefined,
                uniqueId: id,
                properties: {
                    order_id: id,
                    occasion: occasion || null,
                    genre: genre || null,
                    recipient_type: recipientType || null,
                    fast_delivery: isFastDelivery(fastDelivery),
                    provider: paymentProvider,
                },
                profileProps: senderName ? { first_name: senderName } : {},
            });

            if (!klaviyo.klaviyoOwnsTransactional()) {
                void getEmailModule().sendConfirmationEmail({
                    to: customerEmail,
                    orderId: id,
                    trackingToken,
                    genre,
                    deliveryDate,
                    reference: paystackReference || stripeSessionId,
                    amountLabel: formatPaidAmount(verifiedAmount, paymentProvider),
                });
            }
        }
        res.status(201).json(computeOrderProgress(order));
    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

module.exports = router;
