const express = require('express');
const router = express.Router();
const { getClientUrlFromRequest } = require('../client-url.cjs');
const { quoteCheckout, quoteMetadata } = require('../promos.cjs');

let stripeClient;
function getStripeClient() {
    if (!stripeClient) {
        stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
    }
    return stripeClient;
}

let db;
function getDb() {
    if (!db) db = require('../db.cjs');
    return db;
}

// POST /api/create-checkout-session
router.post('/create-checkout-session', async (req, res) => {
    try {
        const {
            email,
            customerEmail,
            recipientType,
            senderName,
            genre,
            occasion,
            occasionDetail,
            voiceGender,
            specialQualities,
            favoriteMemories,
            specialMessage,
            fastDelivery,
            embedded,
            promoCode,
            // amount is intentionally not destructured — price is always server-calculated
        } = req.body;

        const resolvedEmail = email || customerEmail || 'guest@yourgbedu.com';
        const quote = quoteCheckout({
            db: getDb(),
            provider: 'stripe',
            fastDelivery,
            promoCode,
        });
        if (quote.finalAmount <= 0) {
            return res.status(400).json({ error: 'This promo code should be completed through free checkout.' });
        }
        const unitAmount = quote.finalAmount;
        const clientUrl = getClientUrlFromRequest(req);

        const metadata = {
            customerEmail: resolvedEmail,
            recipientType: (recipientType || '').substring(0, 500),
            senderName: (senderName || '').substring(0, 500),
            genre: (genre || '').substring(0, 500),
            occasion: (occasion || '').substring(0, 500),
            occasionDetail: (occasionDetail || '').substring(0, 500),
            voiceGender: (voiceGender || '').substring(0, 500),
            specialQualities: (specialQualities || '').substring(0, 500),
            favoriteMemories: (favoriteMemories || '').substring(0, 500),
            specialMessage: (specialMessage || '').substring(0, 500),
            fastDelivery: fastDelivery ? 'true' : 'false',
            ...quoteMetadata(quote),
        };

        const sessionOptions = {
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: resolvedEmail,
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Custom Song — YourGbedu' + (fastDelivery ? ' (24-Hour Fast Delivery)' : ''),
                            description: `A personalised ${genre || 'custom'} song crafted just for your ${recipientType || 'loved one'}.`,
                        },
                        unit_amount: unitAmount,
                    },
                    quantity: 1,
                },
            ],
            metadata,
        };

        if (embedded) {
            sessionOptions.ui_mode = 'embedded';
            sessionOptions.redirect_on_completion = 'if_required';
            sessionOptions.return_url = `${clientUrl}/#/checkout/return?session_id={CHECKOUT_SESSION_ID}&provider=stripe`;
        } else {
            // Success URL uses hash routing — session_id sits inside the hash so
            // location.search works correctly in the React app.
            sessionOptions.success_url = `${clientUrl}/#/payment-success?session_id={CHECKOUT_SESSION_ID}&provider=stripe`;
            sessionOptions.cancel_url = `${clientUrl}/#/create`;
        }

        const session = await getStripeClient().checkout.sessions.create(sessionOptions);

        res.json({ url: session.url, sessionId: session.id, clientSecret: session.client_secret });
    } catch (err) {
        console.error('[Stripe] Checkout session error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to create checkout session' });
    }
});

// GET /api/verify-session/:sessionId — verify a completed Stripe session
router.get('/verify-session/:sessionId', async (req, res) => {
    try {
        const session = await getStripeClient().checkout.sessions.retrieve(req.params.sessionId);
        res.json({
            paid: session.payment_status === 'paid',
            amount: session.amount_total, // in cents
            customerEmail: session.customer_details?.email || session.customer_email,
            metadata: session.metadata,
        });
    } catch (err) {
        console.error('[Stripe] Session verify error:', err);
        res.status(500).json({ error: 'Failed to verify session' });
    }
});

router.__setStripeClientForTests = (client) => {
    stripeClient = client;
};

module.exports = router;
