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

// Indirection (rather than a direct top-level require) so tests can inject a
// deterministic geo result without depending on module-mock/CJS interop.
let detectCountry = require('./geo.cjs').detectCountryFromRequest;

// Nigeria's provider is switchable (Paystack today, Stripe once NGN-via-Stripe
// success rates are proven); NGN_PAYMENT_PROVIDER unset/anything-but-'stripe'
// keeps current behavior. Everywhere else is always Stripe/USD.
function resolveCheckoutConfig(isNigeria) {
    if (!isNigeria) return { provider: 'stripe', currency: 'usd' };
    const ngnProvider = process.env.NGN_PAYMENT_PROVIDER === 'stripe' ? 'stripe' : 'paystack';
    return { provider: ngnProvider, currency: 'ngn' };
}

// GET /api/checkout-config — server-side source of truth for which provider
// and currency a checkout should use. Replaces the old client-side geo
// inference (client can't be trusted to pick its own price/currency).
router.get('/checkout-config', async (req, res) => {
    const geo = await detectCountry(req);
    res.json({ ...resolveCheckoutConfig(geo.isNigeria), country: geo.country });
});

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
            fullPrice,
            // amount is intentionally not destructured — price is always server-calculated
        } = req.body;

        const resolvedEmail = email || customerEmail || 'guest@yourgbedu.com';
        // Currency is derived from server-side geo detection, never from the
        // client — a client can't pick its own (possibly cheaper) currency.
        const geo = await detectCountry(req);
        const { currency } = resolveCheckoutConfig(geo.isNigeria);
        const quote = await quoteCheckout({
            provider: 'stripe',
            currency,
            fastDelivery,
            promoCode,
            fullPrice,
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
            mode: 'payment',
            customer_email: resolvedEmail,
            line_items: [
                {
                    price_data: {
                        currency,
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

        // For USD, pin to card explicitly (existing behavior). For NGN, omit
        // payment_method_types entirely so Checkout's dynamic payment methods can
        // surface Naira-issued cards (ng_card) once enabled in the Dashboard —
        // Checkout Sessions use dynamic payment methods automatically when this
        // field is left unset; `automatic_payment_methods` is a Payment Intents
        // API field and is invalid here (confirmed via a live test-mode probe).
        if (currency !== 'ngn') {
            sessionOptions.payment_method_types = ['card'];
        }

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

        // Abandoned-checkout signal for the Win-Back flow. Only for a real email
        // (not the guest placeholder); fire-and-forget, env-gated.
        const realEmail = email || customerEmail;
        if (realEmail) {
            require('../services/klaviyo.cjs').track('Started Checkout', {
                email: realEmail,
                properties: {
                    sender_name: senderName || '',
                    recipient_name: req.body.recipientName || '',
                    recipient_type: recipientType || '',
                    occasion: occasion || '',
                    genre: genre || '',
                    fast_delivery: !!fastDelivery,
                    provider: 'stripe',
                    currency,
                    promo_code: quote.promo?.codePreview || promoCode || '',
                },
                profileProps: senderName ? { first_name: senderName } : {},
            });
        }

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
            amount: session.amount_total, // in cents/kobo, per session.currency
            currency: session.currency,
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

router.__setDetectCountryForTests = (fn) => {
    detectCountry = fn;
};

module.exports = router;
module.exports.resolveCheckoutConfig = resolveCheckoutConfig;
