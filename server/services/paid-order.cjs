const { randomBytes, randomUUID: uuidv4 } = require('crypto');
const { isFastDelivery } = require('../pricing.cjs');
const { parsePromoMetadata } = require('../promos.cjs');
const { getOne, execSql } = require('../db-helpers.cjs');

const STANDARD_DELIVERY_HOURS = 48;
const FAST_DELIVERY_HOURS = 24;

function makeTrackingToken() {
    return randomBytes(16).toString('hex');
}

function formatPaidAmount(amount, currency) {
    if (typeof amount !== 'number') return undefined;
    if (currency === 'usd') return `$${(amount / 100).toFixed(2)} USD`;
    return `₦${(amount / 100).toLocaleString('en-NG')}`;
}

let emailModule;
function getEmailModule() {
    if (!emailModule) emailModule = require('../email.cjs');
    return emailModule;
}

/**
 * Idempotent, side-effect-complete paid-order creation shared by the
 * client-side POST /api/orders fallback and the Stripe webhook. Caller has
 * already verified the payment server-side (amount + currency).
 */
async function createPaidOrder({
    reference,
    referenceColumn, // 'stripe_session_id' | 'paystack_reference'
    provider, // 'stripe' | 'paystack' — analytics/formatting only, not a security boundary
    currency, // 'ngn' | 'usd' — drives amount formatting
    verifiedAmount,
    metadata = {},
    fallback = {}, // client-submitted brief fields used when metadata is thin
}) {
    const existing = await getOne(`SELECT * FROM orders WHERE ${referenceColumn} = ?`, reference);
    if (existing) return { order: existing, created: false };

    const fastDelivery = isFastDelivery(metadata.fastDelivery ?? fallback.fastDelivery);
    const promo = parsePromoMetadata(metadata);

    const id = uuidv4();
    const trackingToken = makeTrackingToken();
    const createdAt = new Date().toISOString();
    const deliveryHours = fastDelivery ? FAST_DELIVERY_HOURS : STANDARD_DELIVERY_HOURS;
    const deliveryDate = new Date(Date.now() + deliveryHours * 60 * 60 * 1000).toISOString();

    const customerEmail = String(metadata.customerEmail || fallback.customerEmail || '').trim().toLowerCase() || null;
    const genre = metadata.genre || fallback.genre || '';
    const occasion = metadata.occasion || fallback.occasion || '';
    const occasionDetail = metadata.occasionDetail || fallback.occasionDetail || '';
    const recipientType = metadata.recipientType || fallback.recipientType || '';
    const recipientName = metadata.recipientName || fallback.recipientName || '';
    const senderName = metadata.senderName || fallback.senderName || '';
    const voiceGender = metadata.voiceGender || fallback.voiceGender || '';
    const specialQualities = metadata.specialQualities || fallback.specialQualities || '';
    const favoriteMemories = metadata.favoriteMemories || fallback.favoriteMemories || '';
    const specialMessage = metadata.specialMessage || fallback.specialMessage || '';
    const songTitle = fallback.songTitle || 'Custom Song';

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
        id, trackingToken, songTitle, genre, fallback.mood || '', fallback.tempo || 100,
        occasion, occasionDetail, fallback.story || '', 'in_production', createdAt, deliveryDate,
        referenceColumn === 'stripe_session_id' ? reference : null,
        referenceColumn === 'paystack_reference' ? reference : null,
        verifiedAmount,
        customerEmail,
        recipientType, recipientName, senderName,
        voiceGender, specialQualities, favoriteMemories, specialMessage,
        promo.promoCodeId, promo.promoCodePreview, promo.promoDiscountPercent,
        promo.originalAmount, promo.discountedAmount
    );

    const order = await getOne('SELECT * FROM orders WHERE id = ?', id);

    require('./song-pipeline.cjs').getSongPipeline().startGenerationInBackgroundForOrder(order);

    if (customerEmail) {
        try {
            await execSql(
                'UPDATE subscribers SET converted_order_id = ? WHERE email = ? AND converted_order_id IS NULL',
                id,
                customerEmail
            );
        } catch (subErr) {
            // best effort — never block order creation on a subscriber update
            console.warn('Order: subscriber link skipped:', subErr.message);
        }

        const klaviyo = require('./klaviyo.cjs');
        void klaviyo.track('Placed Order', {
            email: customerEmail,
            value: typeof verifiedAmount === 'number' ? Math.round(verifiedAmount) / 100 : undefined,
            uniqueId: id,
            properties: {
                order_id: id,
                occasion: occasion || null,
                genre: genre || null,
                recipient_type: recipientType || null,
                fast_delivery: fastDelivery,
                provider,
                currency,
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
                reference,
                amountLabel: formatPaidAmount(verifiedAmount, currency),
            });
        }
    }

    void getEmailModule().sendAdminNewOrderEmail({
        orderId: id,
        occasion,
        genre,
        recipientType,
        fastDelivery,
        amountLabel: formatPaidAmount(verifiedAmount, currency),
        customerEmail,
    });

    return { order, created: true };
}

module.exports = { createPaidOrder, formatPaidAmount, makeTrackingToken };
