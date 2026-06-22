/**
 * Klaviyo service — env-gated, fire-and-forget, correct payload shape.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const klaviyoPath = require.resolve('./klaviyo.cjs');

function freshKlaviyo() {
    delete require.cache[klaviyoPath];
    return require('./klaviyo.cjs');
}

describe('klaviyo service', () => {
    beforeEach(() => {
        delete process.env.KLAVIYO_PRIVATE_KEY;
        delete process.env.KLAVIYO_OWNS_TRANSACTIONAL;
        delete process.env.KLAVIYO_PROMO_LIST_ID;
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('is a no-op when no key is configured (never calls fetch)', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const klaviyo = freshKlaviyo();

        const res = await klaviyo.track('Placed Order', { email: 'a@b.com' });
        expect(res.skipped).toBe(true);
        expect(res.reason).toBe('klaviyo_not_configured');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sends a correctly shaped event when configured', async () => {
        process.env.KLAVIYO_PRIVATE_KEY = 'pk_test_123';
        const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }));
        vi.stubGlobal('fetch', fetchMock);
        const klaviyo = freshKlaviyo();

        const res = await klaviyo.track('Placed Order', {
            email: 'Buyer@Example.com',
            value: 25,
            uniqueId: 'order-1',
            properties: { genre: 'Afro-R&B' },
            profileProps: { first_name: 'Tunde' },
        });

        expect(res.ok).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toContain('/api/events/');
        expect(opts.headers.Authorization).toBe('Klaviyo-API-Key pk_test_123');
        expect(opts.headers.revision).toBeTruthy();
        const body = JSON.parse(opts.body);
        expect(body.data.attributes.metric.data.attributes.name).toBe('Placed Order');
        // email normalized lowercase
        expect(body.data.attributes.profile.data.attributes.email).toBe('buyer@example.com');
        expect(body.data.attributes.profile.data.attributes.first_name).toBe('Tunde');
        expect(body.data.attributes.value).toBe(25);
        expect(body.data.attributes.unique_id).toBe('order-1');
        expect(body.data.attributes.properties.genre).toBe('Afro-R&B');
    });

    it('never throws on a provider error — returns ok:false', async () => {
        process.env.KLAVIYO_PRIVATE_KEY = 'pk_test_123';
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429, text: async () => 'rate limited' })));
        const klaviyo = freshKlaviyo();

        const res = await klaviyo.track('Placed Order', { email: 'a@b.com' });
        expect(res.ok).toBe(false);
        expect(res.error).toContain('429');
    });

    it('subscribeToList no-ops without a list id', async () => {
        process.env.KLAVIYO_PRIVATE_KEY = 'pk_test_123';
        const fetchMock = vi.fn(async () => ({ ok: true, text: async () => '' }));
        vi.stubGlobal('fetch', fetchMock);
        const klaviyo = freshKlaviyo();

        const res = await klaviyo.subscribeToList('a@b.com');
        expect(res.skipped).toBe(true);
        expect(res.reason).toBe('no_list_id');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('klaviyoOwnsTransactional reflects the env flag', () => {
        const klaviyo = freshKlaviyo();
        expect(klaviyo.klaviyoOwnsTransactional()).toBe(false);
        process.env.KLAVIYO_OWNS_TRANSACTIONAL = 'true';
        expect(klaviyo.klaviyoOwnsTransactional()).toBe(true);
    });
});
