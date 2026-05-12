const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { generateToken, requireAdmin, revokeToken, COOKIE_OPTS } = require('../middleware/auth.cjs');

// Strict limiter for admin login — same as authLimiter (10 attempts per hour)
const loginLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
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
        where += ' AND status = ?';
        params.push(statusFilter);
    }
    if (search) {
        // Escape SQL wildcard chars so user input is treated as a literal string.
        const safeLike = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
        where += " AND (sender_name LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR recipient_type LIKE ? ESCAPE '\\' OR genre LIKE ? ESCAPE '\\' OR occasion LIKE ? ESCAPE '\\')";
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
        deliveryDate: order.delivery_date,
        customerEmail: order.customer_email || null,
        form: {
            recipientType: order.recipient_type || '',
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
let adminPasswordRaw = null;
async function getPasswordHash(password) {
    if (!password) return null;
    if (!adminPasswordHash || adminPasswordRaw !== password) {
        adminPasswordHash = await bcrypt.hash(password, 10);
        adminPasswordRaw = password;
    }
    return adminPasswordHash;
}

// POST /api/admin/login
router.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body;
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
router.post('/logout', requireAdmin, (req, res) => {
    const token = req.cookies?.admin_token;
    if (token) revokeToken(token);
    res.clearCookie('admin_token', COOKIE_OPTS);
    res.json({ message: 'Logged out.' });
});

// GET /api/admin/orders — paginated orders, most recent first
router.get('/orders', requireAdmin, (req, res) => {
    try {
        const dbConn = getDb();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
        const offset = (page - 1) * limit;
        const { where, params } = buildOrderFilters(req.query);

        const total = dbConn.prepare(`SELECT COUNT(*) as count FROM orders WHERE 1=1${where}`).get(...params).count;
        const orders = dbConn.prepare(`SELECT * FROM orders WHERE 1=1${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

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
router.get('/orders/export', requireAdmin, (req, res) => {
    try {
        const dbConn = getDb();
        const { where, params } = buildOrderFilters(req.query);
        const orders = dbConn
            .prepare(`SELECT * FROM orders WHERE 1=1${where} ORDER BY created_at DESC LIMIT 500`)
            .all(...params);

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
router.get('/stats', requireAdmin, (req, res) => {
    try {
        const dbConn = getDb();
        const totalOrders = dbConn.prepare('SELECT COUNT(*) as count FROM orders').get().count;
        const totalRevenue = dbConn.prepare('SELECT SUM(amount) as total FROM orders').get().total || 0;
        const songCount = dbConn.prepare('SELECT COUNT(*) as count FROM songs').get().count;
        res.json({ totalOrders, totalRevenue, songCount });
    } catch (err) {
        console.error('Admin: Error fetching stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// POST /api/admin/orders/:id/ai-brief — manually generate or regenerate a production brief
router.post('/orders/:id/ai-brief', requireAdmin, async (req, res) => {
    try {
        const dbConn = getDb();
        const order = dbConn.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
        if (!order) return res.status(404).json({ error: 'Order not found' });

        const aiBrief = await getAiService().generateProductionBrief(orderToBriefInput(order));
        dbConn.prepare('UPDATE orders SET ai_brief = ? WHERE id = ?').run(aiBrief, req.params.id);

        const updated = dbConn.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
        res.json({ order: updated, aiBrief });
    } catch (err) {
        console.error('Admin: Error generating AI brief:', err);
        res.status(500).json({ error: 'Failed to generate AI brief' });
    }
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', requireAdmin, (req, res) => {
    const { status } = req.body;
    const validStatuses = ['in_production', 'completed', 'cancelled'];

    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Status must be one of: ${validStatuses.join(', ')}` });
    }

    try {
        const dbConn = getDb();
        const result = dbConn
            .prepare('UPDATE orders SET status = ? WHERE id = ?')
            .run(status, req.params.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = dbConn.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);

        if (status === 'completed' && order?.customer_email) {
            getEmailModule().sendCompletionEmail({
                to: order.customer_email,
                orderId: order.id.slice(0, 8).toUpperCase(),
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

// GET /api/admin/songs
router.get('/songs', requireAdmin, (req, res) => {
    try {
        const songs = getDb().prepare('SELECT * FROM songs ORDER BY id ASC').all();
        res.json(songs);
    } catch {
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

module.exports = router;
