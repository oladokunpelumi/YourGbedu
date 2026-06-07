const crypto = require('crypto');
const {
    isFastDelivery,
    getPaystackAmountKobo,
    getPaystackOriginalAmountKobo,
    getStripeAmountCents,
    getStripeOriginalAmountCents,
} = require('./pricing.cjs');

const STANDARD_PROMO_CODE = process.env.STANDARD_PROMO_CODE || 'YOURGBEDU50';

function normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
}

function hashCode(code) {
    return crypto.createHash('sha256').update(normalizeCode(code)).digest('hex');
}

function maskCode(code) {
    const normalized = normalizeCode(code);
    if (normalized.length <= 4) return `${normalized.slice(0, 1)}***`;
    return `${normalized.slice(0, 4)}...${normalized.slice(-2)}`;
}

function makeOneTimeCode() {
    return `FREE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function getBaseAmounts(provider, fastDelivery) {
    if (provider === 'stripe') {
        return {
            provider: 'stripe',
            currency: 'USD',
            unit: 'cents',
            currentAmount: getStripeAmountCents(fastDelivery),
            originalAmount: getStripeOriginalAmountCents(fastDelivery),
        };
    }

    return {
        provider: 'paystack',
        currency: 'NGN',
        unit: 'kobo',
        currentAmount: getPaystackAmountKobo({ fastDelivery }),
        originalAmount: getPaystackOriginalAmountKobo({ fastDelivery }),
    };
}

function getStandardPromo(normalizedCode) {
    const normalizedStandard = normalizeCode(STANDARD_PROMO_CODE);
    if (!normalizedStandard || normalizedCode !== normalizedStandard) return null;
    return {
        id: null,
        type: 'standard',
        codePreview: maskCode(normalizedStandard),
        discountPercent: 50,
        maxUses: null,
        usedCount: 0,
    };
}

function getStoredPromo(db, normalizedCode) {
    if (!normalizedCode) return null;
    const row = db.prepare('SELECT * FROM promo_codes WHERE code_hash = ?').get(hashCode(normalizedCode));
    if (!row || row.disabled) return null;
    if (row.max_uses !== null && row.max_uses !== undefined && row.used_count >= row.max_uses) return null;
    return {
        id: row.id,
        type: row.discount_percent === 100 && row.max_uses === 1 ? 'one_time_free' : 'stored',
        codePreview: row.code_preview,
        discountPercent: row.discount_percent,
        maxUses: row.max_uses,
        usedCount: row.used_count,
    };
}

function findPromoByCode(db, code) {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) return null;
    return getStandardPromo(normalizedCode) || getStoredPromo(db, normalizedCode);
}

function quoteCheckout({ db, provider = 'paystack', fastDelivery = false, promoCode = '' }) {
    const resolvedProvider = provider === 'stripe' ? 'stripe' : 'paystack';
    const fast = isFastDelivery(fastDelivery);
    const amounts = getBaseAmounts(resolvedProvider, fast);
    const promo = findPromoByCode(db, promoCode);

    if (promoCode && !promo) {
        const err = new Error('Promo code is invalid or has already been used.');
        err.statusCode = 404;
        throw err;
    }

    let finalAmount = amounts.currentAmount;
    if (promo?.discountPercent === 50) {
        finalAmount = Math.round(amounts.originalAmount * 0.5);
    } else if (promo?.discountPercent === 100) {
        finalAmount = 0;
    }

    return {
        provider: amounts.provider,
        currency: amounts.currency,
        unit: amounts.unit,
        fastDelivery: fast,
        originalAmount: amounts.originalAmount,
        currentAmount: amounts.currentAmount,
        finalAmount,
        promo: promo
            ? {
                id: promo.id,
                type: promo.type,
                codePreview: promo.codePreview,
                discountPercent: promo.discountPercent,
            }
            : null,
    };
}

function quoteMetadata(quote) {
    return {
        promoCodeId: quote.promo?.id || '',
        promoCodePreview: quote.promo?.codePreview || '',
        promoDiscountPercent: quote.promo ? String(quote.promo.discountPercent) : '',
        originalAmount: String(quote.originalAmount),
        discountedAmount: String(quote.finalAmount),
    };
}

function parsePromoMetadata(metadata = {}) {
    const promoDiscountPercent = Number.parseInt(metadata.promoDiscountPercent, 10);
    const originalAmount = Number.parseInt(metadata.originalAmount, 10);
    const discountedAmount = Number.parseInt(metadata.discountedAmount, 10);
    return {
        promoCodeId: metadata.promoCodeId || null,
        promoCodePreview: metadata.promoCodePreview || null,
        promoDiscountPercent: Number.isFinite(promoDiscountPercent) ? promoDiscountPercent : null,
        originalAmount: Number.isFinite(originalAmount) ? originalAmount : null,
        discountedAmount: Number.isFinite(discountedAmount) ? discountedAmount : null,
    };
}

function createOneTimeFreeCode(db) {
    const code = makeOneTimeCode();
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    db.prepare(`
        INSERT INTO promo_codes (
            id, code_hash, code_preview, discount_percent, max_uses, used_count,
            disabled, created_at
        )
        VALUES (?, ?, ?, 100, 1, 0, 0, ?)
    `).run(id, hashCode(code), maskCode(code), now);

    return {
        id,
        code,
        codePreview: maskCode(code),
        discountPercent: 100,
        maxUses: 1,
        usedCount: 0,
        disabled: 0,
        createdAt: now,
        usedAt: null,
        usedOrderId: null,
    };
}

function listOneTimeCodes(db) {
    return db.prepare(`
        SELECT
            id,
            code_preview AS codePreview,
            discount_percent AS discountPercent,
            max_uses AS maxUses,
            used_count AS usedCount,
            disabled,
            created_at AS createdAt,
            used_at AS usedAt,
            used_order_id AS usedOrderId
        FROM promo_codes
        ORDER BY created_at DESC
        LIMIT 100
    `).all();
}

function disablePromoCode(db, id) {
    const result = db.prepare('UPDATE promo_codes SET disabled = 1 WHERE id = ? AND used_count = 0').run(id);
    return result.changes > 0;
}

module.exports = {
    STANDARD_PROMO_CODE,
    normalizeCode,
    maskCode,
    hashCode,
    quoteCheckout,
    quoteMetadata,
    parsePromoMetadata,
    createOneTimeFreeCode,
    listOneTimeCodes,
    disablePromoCode,
};
