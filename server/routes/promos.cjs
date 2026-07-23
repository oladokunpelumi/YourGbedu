const express = require('express');
const { z } = require('zod');
const { quoteCheckout } = require('../promos.cjs');

const router = express.Router();

const QuoteSchema = z.object({
    promoCode: z.string().max(100).optional(),
    paymentProvider: z.enum(['paystack', 'stripe']).optional(),
    currency: z.enum(['ngn', 'usd', 'NGN', 'USD']).optional(),
    fastDelivery: z.union([z.boolean(), z.string()]).optional(),
    fullPrice: z.union([z.boolean(), z.string()]).optional(),
});

router.post('/quote', async (req, res) => {
    const parsed = QuoteSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid promo request.' });
    }

    try {
        const quote = await quoteCheckout({
            provider: parsed.data.paymentProvider || 'paystack',
            currency: parsed.data.currency ? parsed.data.currency.toLowerCase() : undefined,
            fastDelivery: parsed.data.fastDelivery,
            promoCode: parsed.data.promoCode || '',
            fullPrice: parsed.data.fullPrice,
        });
        res.json(quote);
    } catch (err) {
        res.status(err.statusCode || 400).json({ error: err.message || 'Could not apply promo code.' });
    }
});

module.exports = router;
