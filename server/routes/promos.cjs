const express = require('express');
const { z } = require('zod');
const { quoteCheckout } = require('../promos.cjs');

const router = express.Router();

let db;
function getDb() {
    if (!db) db = require('../db.cjs');
    return db;
}

const QuoteSchema = z.object({
    promoCode: z.string().max(100).optional(),
    paymentProvider: z.enum(['paystack', 'stripe']).optional(),
    fastDelivery: z.union([z.boolean(), z.string()]).optional(),
});

router.post('/quote', (req, res) => {
    const parsed = QuoteSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid promo request.' });
    }

    try {
        const quote = quoteCheckout({
            db: getDb(),
            provider: parsed.data.paymentProvider || 'paystack',
            fastDelivery: parsed.data.fastDelivery,
            promoCode: parsed.data.promoCode || '',
        });
        res.json(quote);
    } catch (err) {
        res.status(err.statusCode || 400).json({ error: err.message || 'Could not apply promo code.' });
    }
});

module.exports = router;
