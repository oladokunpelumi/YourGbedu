const PRICING = {
    ngn: {
        standardKobo: 3_000_000, // ₦30,000 discounted from ₦60,000
        standardOriginalKobo: 6_000_000,
        fastDeliveryKobo: 5_000_000, // ₦50,000 discounted priority price
        fastDeliveryUpgradeKobo: 2_000_000,
    },
    usd: {
        standardCents: 2_500, // $25 discounted from $50
        standardOriginalCents: 5_000,
        fastDeliveryCents: 4_000, // $40 discounted priority price
        fastDeliveryUpgradeCents: 1_500,
    },
};

function isFastDelivery(value) {
    return value === true || value === 'true' || value === 1 || value === '1';
}

function getPaystackAmountKobo(metadata = {}) {
    return isFastDelivery(metadata.fastDelivery)
        ? PRICING.ngn.fastDeliveryKobo
        : PRICING.ngn.standardKobo;
}

function getStripeAmountCents(fastDelivery) {
    return isFastDelivery(fastDelivery)
        ? PRICING.usd.fastDeliveryCents
        : PRICING.usd.standardCents;
}

module.exports = {
    PRICING,
    isFastDelivery,
    getPaystackAmountKobo,
    getStripeAmountCents,
};
