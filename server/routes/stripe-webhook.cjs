const express = require('express');
const router = express.Router();
const { normalizeCurrency } = require('../pricing.cjs');
const { quoteCheckout, parsePromoMetadata } = require('../promos.cjs');
const { createPaidOrder } = require('../services/paid-order.cjs');

let stripeClient;
function getStripeClient() {
    if (!stripeClient) {
        stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
}

async function validateSessionAmount({ metadata, currency, amountTotal }) {
    if (typeof amountTotal !== 'number') return false;
    const promo = parsePromoMetadata(metadata || {});
    if (promo.currency && promo.currency !== normalizeCurrency(currency)) return false;

    const fastDelivery = metadata?.fastDelivery;
    const currentQuote = await quoteCheckout({ provider: 'stripe', currency, fastDelivery });
    const fullQuote = await quoteCheckout({ provider: 'stripe', currency, fastDelivery, fullPrice: true });
    const allowed = new Set([
        currentQuote.finalAmount,
        fullQuote.finalAmount,
        Math.round(fullQuote.originalAmount * 0.5),
    ]);

    if (Number.isFinite(promo.discountedAmount)) {
        return allowed.has(promo.discountedAmount) && amountTotal === promo.discountedAmount;
    }
    return allowed.has(amountTotal);
}

// ── Stripe Webhook ────────────────────────────────────────────────────────────
// This is the authoritative order-creator for Stripe payments — without it, a
// customer who closes the tab right after paying (before the client calls
// POST /api/orders) would have a paid session that never becomes an order.
// Idempotent on stripe_session_id, so racing against the client-side fallback
// is safe: whichever path runs first creates the order, the other is a no-op.
router.post('/', async (req, res) => {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
        console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET missing');
        return res.status(503).json({ error: 'Webhook secret not configured' });
    }
    if (!signature) {
        console.warn('[Stripe Webhook] Missing stripe-signature header — rejected');
        return res.status(401).json({ error: 'Missing signature' });
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    let event;
    try {
        event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
        console.warn('[Stripe Webhook] Signature verification failed:', err.message);
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Acknowledge immediately before doing heavier work.
    res.sendStatus(200);

    if (event.type === 'checkout.session.completed') {
        void (async () => {
            try {
                const session = event.data.object;
                if (session.payment_status !== 'paid') return;

                const currency = normalizeCurrency(session.currency);
                const metadata = session.metadata || {};
                const amountValid = await validateSessionAmount({
                    metadata,
                    currency,
                    amountTotal: session.amount_total,
                });
                if (!amountValid) {
                    console.error('[Stripe Webhook] Amount/currency mismatch for session', session.id);
                    return;
                }

                await createPaidOrder({
                    reference: session.id,
                    referenceColumn: 'stripe_session_id',
                    provider: 'stripe',
                    currency,
                    verifiedAmount: session.amount_total,
                    metadata: {
                        ...metadata,
                        customerEmail: metadata.customerEmail || session.customer_details?.email || session.customer_email,
                    },
                });
            } catch (err) {
                console.error('[Stripe Webhook] Error creating order:', err);
            }
        })();
    }
});

router.__setStripeClientForTests = (client) => {
    stripeClient = client;
};

module.exports = router;
