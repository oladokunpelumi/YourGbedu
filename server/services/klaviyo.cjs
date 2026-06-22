/**
 * Klaviyo integration — events + list subscription.
 *
 * We push *events* and *profile data* to Klaviyo; the actual emails (welcome,
 * abandoned checkout, order confirmation, song-ready, win-back) are built as
 * Flows in the Klaviyo dashboard and triggered by these events / list joins.
 *
 * Mirrors the email.cjs contract: env-gated (no key → no-op), fire-and-forget,
 * never throws into the request path, short timeout. NEVER send the customer's
 * personal song text (heart message, memories) — only commerce properties.
 */
const API_BASE = 'https://a.klaviyo.com/api';
const DEFAULT_REVISION = '2024-10-15';

function getKey() {
    const key = process.env.KLAVIYO_PRIVATE_KEY;
    if (!key || key.startsWith('pk_placeholder')) return null;
    return key;
}

function isConfigured() {
    return !!getKey();
}

function klaviyoOwnsTransactional() {
    const v = String(process.env.KLAVIYO_OWNS_TRANSACTIONAL || '').toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

function headers() {
    return {
        Authorization: `Klaviyo-API-Key ${getKey()}`,
        revision: process.env.KLAVIYO_API_REVISION || DEFAULT_REVISION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

function redactEmail(email) {
    const value = String(email || '');
    const [name, domain] = value.split('@');
    if (!name || !domain) return 'unknown';
    return `${name.slice(0, 2)}${name.length > 2 ? '***' : '*'}@${domain}`;
}

async function post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Klaviyo ${res.status}: ${text.slice(0, 300)}`);
    }
    return res;
}

/**
 * Fire a metric event for a profile. Drives event-triggered flows.
 * @param {string} metric - e.g. "Placed Order", "Song Delivered"
 * @param {object} opts
 * @param {string} opts.email
 * @param {object} [opts.properties] - event properties (commerce only)
 * @param {object} [opts.profileProps] - profile attributes (first_name, etc.)
 * @param {number} [opts.value] - numeric value (e.g. order amount in major units)
 * @param {string} [opts.uniqueId] - dedupe key (e.g. order id) for idempotent events
 */
async function track(metric, { email, properties = {}, profileProps = {}, value, uniqueId } = {}) {
    if (!isConfigured()) return { ok: false, skipped: true, reason: 'klaviyo_not_configured' };
    if (!email) return { ok: false, skipped: true, reason: 'no_email' };

    try {
        await post('/events/', {
            data: {
                type: 'event',
                attributes: {
                    metric: { data: { type: 'metric', attributes: { name: metric } } },
                    profile: {
                        data: {
                            type: 'profile',
                            attributes: { email: String(email).trim().toLowerCase(), ...profileProps },
                        },
                    },
                    properties,
                    ...(typeof value === 'number' ? { value } : {}),
                    ...(uniqueId ? { unique_id: String(uniqueId) } : {}),
                },
            },
        });
        console.log(`[Klaviyo] event sent | metric="${metric}" | to=${redactEmail(email)}`);
        return { ok: true };
    } catch (err) {
        console.warn(`[Klaviyo] event failed | metric="${metric}" | ${err.message}`);
        return { ok: false, error: err.message };
    }
}

/**
 * Subscribe a profile to a list with marketing consent. Drives the welcome flow.
 * No-op (event-only) when KLAVIYO_PROMO_LIST_ID is unset — the welcome flow can
 * instead be triggered by the metric event.
 */
async function subscribeToList(email, { listId = process.env.KLAVIYO_PROMO_LIST_ID, properties = {} } = {}) {
    if (!isConfigured()) return { ok: false, skipped: true, reason: 'klaviyo_not_configured' };
    if (!email) return { ok: false, skipped: true, reason: 'no_email' };
    if (!listId) return { ok: false, skipped: true, reason: 'no_list_id' };

    try {
        await post('/profile-subscription-bulk-create-jobs/', {
            data: {
                type: 'profile-subscription-bulk-create-job',
                attributes: {
                    profiles: {
                        data: [
                            {
                                type: 'profile',
                                attributes: {
                                    email: String(email).trim().toLowerCase(),
                                    ...(Object.keys(properties).length ? { properties } : {}),
                                    subscriptions: { email: { marketing: { consent: 'SUBSCRIBED' } } },
                                },
                            },
                        ],
                    },
                },
                relationships: { list: { data: { type: 'list', id: String(listId) } } },
            },
        });
        console.log(`[Klaviyo] subscribed | to=${redactEmail(email)} | list=${listId}`);
        return { ok: true };
    } catch (err) {
        console.warn(`[Klaviyo] subscribe failed | ${err.message}`);
        return { ok: false, error: err.message };
    }
}

module.exports = { track, subscribeToList, isConfigured, klaviyoOwnsTransactional };
