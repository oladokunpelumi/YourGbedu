const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { generateToken, requireAdmin, revokeToken, COOKIE_OPTS } = require('../middleware/auth.cjs');
const { createOneTimeFreeCode, listOneTimeCodes, disablePromoCode } = require('../promos.cjs');
const { getOne, getAll, execSql, pgVariantSql } = require('../db-helpers.cjs');
const klaviyo = require('../services/klaviyo.cjs');
const adminGenerationRouter = require('./admin-generation.cjs');

// Strict in production, forgiving in local development so a typo does not
// lock the workbench while testing.
const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 10 : 1000,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

let db;
function getDb() {
    if (!db) db = require('../db.cjs');
    return db;
}

let emailModule;
function getEmailModule() {
    if (!emailModule) emailModule = require('../email.cjs');
    return emailModule;
}

let aiService;
function getAiService() {
    if (!aiService) aiService = require('../services/gemini.cjs');
    return aiService;
}

function buildOrderFilters(query) {
    const statusFilter = query.status;
    const search = query.search?.toString().trim();
    let where = '';
    const params = [];

    if (statusFilter && ['in_production', 'completed', 'cancelled'].includes(statusFilter)) {
        where += ' AND o.status = ?';
        params.push(statusFilter);
    }
    if (search) {
        // Escape SQL wildcard chars so user input is treated as a literal string.
        const safeLike = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
        // SQLite LIKE is case-insensitive for ASCII; Postgres LIKE is not — use ILIKE
        // there so admin search behaves identically across adapters.
        where += pgVariantSql({
            sqlite: " AND (o.sender_name LIKE ? ESCAPE '\\' OR o.customer_email LIKE ? ESCAPE '\\' OR o.id LIKE ? ESCAPE '\\' OR o.recipient_type LIKE ? ESCAPE '\\' OR o.genre LIKE ? ESCAPE '\\' OR o.occasion LIKE ? ESCAPE '\\')",
            postgres: " AND (o.sender_name ILIKE ? OR o.customer_email ILIKE ? OR o.id ILIKE ? OR o.recipient_type ILIKE ? OR o.genre ILIKE ? OR o.occasion ILIKE ?)",
        });
        params.push(safeLike, safeLike, safeLike, safeLike, safeLike, safeLike);
    }

    return { where, params };
}

function toProductionJson(order) {
    return {
        orderId: order.id,
        shortOrderId: order.id?.slice(0, 8).toUpperCase(),
        status: order.status,
        paymentReference: order.paystack_reference || order.stripe_session_id || null,
        amount: order.amount,
        promo: {
            codePreview: order.promo_code_preview || null,
            discountPercent: order.promo_discount_percent || null,
            originalAmount: order.original_amount || null,
            discountedAmount: order.discounted_amount || null,
        },
        deliveryDate: order.delivery_date,
        customerEmail: order.customer_email || null,
        form: {
            recipientType: order.recipient_type || '',
            recipientName: order.recipient_name || '',
            senderName: order.sender_name || '',
            genre: order.genre || '',
            voiceGender: order.voice_gender || '',
            occasion: order.occasion || '',
            occasionDetail: order.occasion_detail || '',
            specialQualities: order.special_qualities || '',
            favoriteMemories: order.favorite_memories || '',
            specialMessage: order.special_message || '',
        },
        aiBrief: order.ai_brief || '',
        createdAt: order.created_at,
    };
}

function orderToBriefInput(order) {
    return {
        recipientType: order.recipient_type || '',
        recipientName: order.recipient_name || '',
        senderName: order.sender_name || '',
        genre: order.genre || '',
        voiceGender: order.voice_gender || '',
        occasion: order.occasion || '',
        occasionDetail: order.occasion_detail || '',
        specialQualities: order.special_qualities || '',
        favoriteMemories: order.favorite_memories || '',
        specialMessage: order.special_message || order.story || '',
    };
}

function getAdminCredentials() {
    return {
        username: process.env.ADMIN_USERNAME,
        password: process.env.ADMIN_PASSWORD,
    };
}

let adminPasswordHash = null;
async function getPasswordHash(password) {
    if (!password) return null;
    if (!adminPasswordHash) {
        adminPasswordHash = await bcrypt.hash(password, 10);
    }
    return adminPasswordHash;
}

// POST /api/admin/login
router.post('/login', loginLimiter, async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : req.body?.username;
    const { password } = req.body;
    const { username: adminUsername, password: adminPassword } = getAdminCredentials();

    if (!adminUsername || !adminPassword) {
        return res.status(503).json({ error: 'Admin credentials not configured.' });
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    // Constant-time username compare to prevent username enumeration via timing.
    const usernameBuffer = Buffer.from(username);
    const validBuffer = Buffer.from(adminUsername);
    const usernameMatch =
        usernameBuffer.length === validBuffer.length &&
        crypto.timingSafeEqual(usernameBuffer, validBuffer);

    const hash = await getPasswordHash(adminPassword);
    const passwordMatch = hash ? await bcrypt.compare(password, hash) : false;

    if (!usernameMatch || !passwordMatch) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken({ id: 'admin-id', role: 'admin' });

    // Set an HttpOnly cookie — the token is never exposed to JavaScript.
    res.cookie('admin_token', token, {
        ...COOKIE_OPTS,
        maxAge: 4 * 60 * 60 * 1000, // 4 hours
    });

    res.json({ authenticated: true });
});

// POST /api/admin/logout — revoke the active admin session
router.post('/logout', requireAdmin, async (req, res) => {
    const token = req.cookies?.admin_token;
    if (token) await revokeToken(token);
    res.clearCookie('admin_token', COOKIE_OPTS);
    res.json({ message: 'Logged out.' });
});

router.use('/orders/:orderId/generation', requireAdmin, adminGenerationRouter);

// GET /api/admin/orders — paginated orders, most recent first
router.get('/orders', requireAdmin, async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const offset = (page - 1) * limit;
        const { where, params } = buildOrderFilters(req.query);

        const totalRow = await getOne(`SELECT COUNT(*) as count FROM orders o WHERE 1=1${where}`, ...params);
        const total = Number(totalRow?.count ?? 0);
        const orders = await getAll(
            `SELECT o.*, sg.status AS generation_status, sg.current_stage AS generation_stage
             FROM orders o
             LEFT JOIN song_generations sg ON sg.order_id = o.id
             WHERE 1=1${where}
             ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
            ...params, limit, offset
        );

        res.json({
            data: orders,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1,
            },
        });
    } catch (err) {
        console.error('Admin: Error fetching orders:', err);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// GET /api/admin/orders/export — production JSON for the current filtered queue
router.get('/orders/export', requireAdmin, async (req, res) => {
    try {
        const { where, params } = buildOrderFilters(req.query);
        const orders = await getAll(
            `SELECT o.* FROM orders o WHERE 1=1${where} ORDER BY o.created_at DESC LIMIT 500`,
            ...params
        );

        res.json({
            exportedAt: new Date().toISOString(),
            count: orders.length,
            orders: orders.map(toProductionJson),
        });
    } catch (err) {
        console.error('Admin: Error exporting orders:', err);
        res.status(500).json({ error: 'Failed to export orders' });
    }
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (req, res) => {
    try {
        const ordersRow = await getOne('SELECT COUNT(*) as count FROM orders');
        const revenueRow = await getOne('SELECT SUM(amount) as total FROM orders');
        const songsRow = await getOne('SELECT COUNT(*) as count FROM songs');
        res.json({
            totalOrders: Number(ordersRow?.count ?? 0),
            totalRevenue: Number(revenueRow?.total ?? 0),
            songCount: Number(songsRow?.count ?? 0),
        });
    } catch (err) {
        console.error('Admin: Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// GET /api/admin/promo-codes — list one-time promo codes without raw code values
router.get('/promo-codes', requireAdmin, async (req, res) => {
    try {
        res.json({ data: await listOneTimeCodes() });
    } catch (err) {
        console.error('Admin: Error listing promo codes:', err);
        res.status(500).json({ error: 'Failed to list promo codes' });
    }
});

// POST /api/admin/promo-codes — generate a one-time 100% off code
router.post('/promo-codes', requireAdmin, async (req, res) => {
    try {
        const code = await createOneTimeFreeCode();
        res.status(201).json(code);
    } catch (err) {
        console.error('Admin: Error generating promo code:', err);
        res.status(500).json({ error: 'Failed to generate promo code' });
    }
});

// PATCH /api/admin/promo-codes/:id/disable — disable an unused one-time code
router.patch('/promo-codes/:id/disable', requireAdmin, async (req, res) => {
    try {
        const disabled = await disablePromoCode(req.params.id);
        if (!disabled) return res.status(404).json({ error: 'Promo code not found or already used.' });
        res.json({ disabled: true });
    } catch (err) {
        console.error('Admin: Error disabling promo code:', err);
        res.status(500).json({ error: 'Failed to disable promo code' });
    }
});

// POST /api/admin/orders/:id/ai-brief — manually generate or regenerate a production brief
router.post('/orders/:id/ai-brief', requireAdmin, async (req, res) => {
    try {
        const order = await getOne('SELECT * FROM orders WHERE id = ?', req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const aiBrief = await getAiService().generateProductionBrief(orderToBriefInput(order));
        await execSql('UPDATE orders SET ai_brief = ? WHERE id = ?', aiBrief, req.params.id);

        const updated = await getOne('SELECT * FROM orders WHERE id = ?', req.params.id);
        res.json({ order: updated, aiBrief });
    } catch (err) {
        console.error('Admin: Error generating AI brief:', err);
        res.status(500).json({ error: 'Failed to generate AI brief' });
    }
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', requireAdmin, async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['in_production', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    try {
        const result = await execSql('UPDATE orders SET status = ? WHERE id = ?', status, req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = await getOne('SELECT * FROM orders WHERE id = ?', req.params.id);

        if (status === 'completed' && order?.customer_email && !klaviyo.klaviyoOwnsTransactional()) {
            getEmailModule().sendCompletionEmail({
                to: order.customer_email,
                orderId: order.id,
                trackingToken: order.tracking_token,
                genre: order.genre,
                senderName: order.sender_name,
                recipientType: order.recipient_type,
            });
        }

        res.json(order);
    } catch (err) {
        console.error('Admin: Error updating order status:', err);
        res.status(500).json({ error: 'Failed to update order' });
    }
});

// DELETE /api/admin/orders/:id — erase an order and its generation data.
router.delete('/orders/:id', requireAdmin, async (req, res) => {
    try {
        const generation = await getOne('SELECT status FROM song_generations WHERE order_id = ?', req.params.id);
        if (generation?.status === 'running') {
            return res.status(409).json({ error: 'Cannot delete an order while generation is running.' });
        }

        await execSql('DELETE FROM song_generations WHERE order_id = ?', req.params.id);
        await execSql('UPDATE subscribers SET converted_order_id = NULL WHERE converted_order_id = ?', req.params.id);
        const result = await execSql('DELETE FROM orders WHERE id = ?', req.params.id);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ deleted: true });
    } catch (err) {
        console.error('Admin: Error deleting order:', err);
        res.status(500).json({ error: 'Failed to delete order' });
    }
});

// Reject URLs that resolve to private/loopback/link-local hosts to prevent SSRF —
// an attacker-supplied "song URL" must not be usable to probe internal services
// (cloud metadata at 169.254.169.254, localhost admin panels, RFC1918 ranges, etc.).
function isPublicHttpUrl(raw) {
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
        host === 'localhost' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.endsWith('.localhost') ||
        host.endsWith('.internal') ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||           // link-local incl. cloud metadata
        /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
        /^(fc|fd)[0-9a-f]{2}:/.test(host) ||   // unique-local IPv6
        /^fe80:/.test(host)                    // link-local IPv6
    ) {
        return false;
    }
    return true;
}

// Confirm the pasted URL actually serves a media file before we attach it and
// email the customer. Catches the most common operator mistakes: pasting the R2
// dashboard URL instead of the public object URL, a wrong object key (404), or a
// bucket/object that isn't public (403). Returns { ok, status, contentType }.
async function probeMediaUrl(url) {
    const attempt = async (method, headers) => {
        const resp = await fetch(url, {
            method,
            headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
        });
        return { status: resp.status, contentType: resp.headers.get('content-type') || '' };
    };
    try {
        // Prefer a 1-byte ranged GET — some object stores don't answer HEAD.
        let r = await attempt('GET', { Range: 'bytes=0-0' });
        if (r.status === 405 || r.status === 501) r = await attempt('HEAD', {});
        return { ok: r.status >= 200 && r.status < 400, ...r };
    } catch (err) {
        return { ok: false, status: 0, contentType: '', error: err?.message || 'unreachable' };
    }
}

// POST /api/admin/orders/:id/song — attach a finished song URL and mark completed
router.post('/orders/:id/song', requireAdmin, async (req, res) => {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const force = req.body?.force === true || req.body?.force === 'true';

    if (!url || url.length > 2048 || !isPublicHttpUrl(url)) {
        return res.status(400).json({ error: 'A valid public http(s) URL is required.' });
    }

    // Reachability gate — skippable with force:true for hosts that block our probe.
    if (!force) {
        const probe = await probeMediaUrl(url);
        if (!probe.ok) {
            const reason = probe.status
                ? `the host returned ${probe.status}`
                : `the host could not be reached (${probe.error || 'network error'})`;
            return res.status(422).json({
                error: `That URL isn't loadable — ${reason}. Open it in a private browser tab: it must download/play the file directly. Check it's the public object URL (…r2.dev/<folder>/<file>), not the dashboard link, and that the object is public.`,
                probeStatus: probe.status,
                canForce: true,
            });
        }
        if (probe.contentType && !/^audio\/|^video\/|^application\/octet-stream/i.test(probe.contentType)) {
            return res.status(422).json({
                error: `That URL loads but looks like "${probe.contentType}", not an audio file. Double-check you copied the .mp3/.wav object URL. Attach anyway if you're sure.`,
                contentType: probe.contentType,
                canForce: true,
            });
        }
    }

    try {
        const deliveredAt = new Date().toISOString();
        const result = await execSql(
            `UPDATE orders
             SET final_song_url = ?, final_song_title = ?, delivered_at = ?, status = 'completed'
             WHERE id = ?`,
            url, title || null, deliveredAt, req.params.id
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = await getOne('SELECT * FROM orders WHERE id = ?', req.params.id);

        if (order?.customer_email) {
            const emailModule = getEmailModule();
            void klaviyo.track('Song Delivered', {
                email: order.customer_email,
                uniqueId: `${order.id}:delivered`,
                properties: {
                    order_id: order.id,
                    genre: order.genre || null,
                    recipient_type: order.recipient_type || null,
                    final_song_title: order.final_song_title || null,
                    track_url: emailModule.getTrackUrl(order.id, order.tracking_token),
                },
                profileProps: order.sender_name ? { first_name: order.sender_name } : {},
            });

            if (!klaviyo.klaviyoOwnsTransactional()) {
                void emailModule.sendCompletionEmail({
                    to: order.customer_email,
                    orderId: order.id,
                    trackingToken: order.tracking_token,
                    genre: order.genre,
                    senderName: order.sender_name,
                    recipientType: order.recipient_type,
                });
            }
        }

        res.json(order);
    } catch (err) {
        console.error('Admin: Error attaching song URL:', err);
        res.status(500).json({ error: 'Failed to attach song URL' });
    }
});

// GET /api/admin/subscribers — list captured emails for follow-up
router.get('/subscribers', requireAdmin, async (req, res) => {
    try {
        const rows = await getAll(
            'SELECT id, email, created_at, source, converted_order_id, last_emailed_at FROM subscribers ORDER BY created_at DESC'
        );
        res.json({ data: rows, total: rows.length });
    } catch (err) {
        console.error('Admin: Error listing subscribers:', err);
        res.status(500).json({ error: 'Failed to load subscribers' });
    }
});

// GET /api/admin/songs
router.get('/songs', requireAdmin, async (req, res) => {
    try {
        const songs = await getAll('SELECT * FROM songs ORDER BY id ASC');
        res.json(songs);
    } catch {
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

module.exports = router;
