const express = require('express');
const router = express.Router();
const { randomUUID: uuidv4 } = require('crypto');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth.cjs');
const { PRICING, isFastDelivery } = require('../pricing.cjs');

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
    { title: 'Brief Received', desc: 'Your story and preferences have been analyzed.', icon: 'check' },
    { title: 'Composing', desc: 'Lyrics drafted and melody structure finalized.', icon: 'music_note' },
    { title: 'Studio Recording', desc: 'Our vocalists are currently laying down tracks.', icon: 'mic' },
    { title: 'Mixing', desc: 'Balancing levels and adding effects.', icon: 'tune' },
    { title: 'Final Mastering', desc: 'Preparing the track for distribution.', icon: 'album' },
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
    senderName: z.string().max(200).optional(),
    voiceGender: z.string().max(100).optional(),
    specialQualities: z.string().max(5000).optional(),
    favoriteMemories: z.string().max(5000).optional(),
    specialMessage: z.string().max(5000).optional(),
    fastDelivery: z.union([z.boolean(), z.string()]).optional(),
});

function computeOrderProgress(order) {
    const createdAt = new Date(order.created_at);
    const deliveryDate = new Date(order.delivery_date);
    const now = new Date();

    const totalMs = deliveryDate.getTime() - createdAt.getTime();
    const elapsedMs = now.getTime() - createdAt.getTime();
    const overallProgress = Math.max(0, Math.min(1, elapsedMs / totalMs));

    const currentStepIndex = Math.min(4, Math.floor(overallProgress * 5));
    const stepProgress = Math.round(((overallProgress * 5) - currentStepIndex) * 100);

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
        senderName: order.sender_name || null,
        voiceGender: order.voice_gender || null,
        specialQualities: order.special_qualities || null,
        favoriteMemories: order.favorite_memories || null,
        specialMessage: order.special_message || null,
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
            'SELECT * FROM orders WHERE customer_email = ? ORDER BY created_at DESC'
        ).all(email);

        res.json(orders.map(computeOrderProgress));
    } catch (err) {
        console.error('Error fetching orders by email:', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
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

    const { songTitle, genre, mood, tempo, occasion, occasionDetail, story, stripeSessionId, paystackReference, customerEmail, recipientType, senderName, voiceGender, specialQualities, favoriteMemories, specialMessage, fastDelivery } = parsed.data;

    if (!paystackReference && !stripeSessionId) {
        return res.status(400).json({ error: 'A verified payment reference is required.' });
    }

    try {
        const dbConn = getDb();
        let verifiedAmount = null;

        if (paystackReference) {
            const existing = dbConn.prepare('SELECT * FROM orders WHERE paystack_reference = ?').get(paystackReference);
            if (existing) return res.status(200).json(computeOrderProgress(existing));

            const payment = await verifyPaystackPayment(paystackReference);
            if (!payment.paid) {
                return res.status(402).json({ error: 'Payment not confirmed. Please wait a moment and try again.' });
            }
            verifiedAmount = payment.amount;
        }

        if (stripeSessionId) {
            const existing = dbConn.prepare('SELECT * FROM orders WHERE stripe_session_id = ?').get(stripeSessionId);
            if (existing) return res.status(200).json(computeOrderProgress(existing));

            const payment = await verifyStripePayment(stripeSessionId);
            if (!payment.paid) {
                return res.status(402).json({ error: 'Payment not confirmed. Please wait a moment and try again.' });
            }
            verifiedAmount = payment.amount;
        }

        const id = uuidv4();
        const createdAt = new Date().toISOString();
        const deliveryHours = isFastDelivery(fastDelivery) ? FAST_DELIVERY_HOURS : STANDARD_DELIVERY_HOURS;
        const deliveryDate = new Date(Date.now() + deliveryHours * 60 * 60 * 1000).toISOString();

        dbConn.prepare(`
            INSERT INTO orders (
                id, song_title, genre, mood, tempo, occasion, occasion_detail, story,
                status, created_at, delivery_date,
                stripe_session_id, paystack_reference, amount, customer_email,
                recipient_type, sender_name, voice_gender,
                special_qualities, favorite_memories, special_message
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_production', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            id, songTitle || 'Custom Song', genre || '', mood || '', tempo || 100,
            occasion || '', occasionDetail || '', story || '', createdAt, deliveryDate,
            stripeSessionId || null, paystackReference || null,
            verifiedAmount || PRICING.ngn.standardKobo,
            customerEmail || null, recipientType || '', senderName || '',
            voiceGender || '', specialQualities || '', favoriteMemories || '', specialMessage || ''
        );

        const order = dbConn.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (customerEmail) {
            void getEmailModule().sendConfirmationEmail({
                to: customerEmail,
                orderId: id.slice(0, 8).toUpperCase(),
                genre,
                mood,
                deliveryDate,
                reference: paystackReference || stripeSessionId,
                amountLabel: formatPaidAmount(verifiedAmount, stripeSessionId ? 'stripe' : 'paystack'),
            });
        }
        res.status(201).json(computeOrderProgress(order));
    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

module.exports = router;
