const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { generateToken, revokeToken, requireAuth, COOKIE_OPTS } = require('../middleware/auth.cjs');
const { getClientUrlFromRequest } = require('../client-url.cjs');
const { getOne, execSql, execRaw } = require('../db-helpers.cjs');

const TOKEN_TTL_MINUTES = 15;

let emailModule;
function getEmailModule() {
    if (!emailModule) emailModule = require('../email.cjs');
    return emailModule;
}

// Store SHA-256(token) in the DB so even a full DB dump can't be used to
// log in — the plaintext token only ever lives in the email link.
function hashToken(plaintext) {
    return crypto.createHash('sha256').update(plaintext).digest('hex');
}

function redactEmail(email) {
    const [name, domain] = String(email || '').split('@');
    if (!name || !domain) return 'unknown';
    return `${name.slice(0, Math.min(2, name.length))}${name.length > 2 ? '***' : '*'}@${domain}`;
}

let tablesEnsured = false;
async function ensureAuthTables() {
    if (tablesEnsured) return;

    await execRaw(`
      CREATE TABLE IF NOT EXISTS magic_links (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0
      );
    `);

    await execRaw(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    tablesEnsured = true;
}

// POST /api/auth/request — send a magic link to the given email
router.post('/request', async (req, res) => {
    await ensureAuthTables();
    const { email } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'A valid email address is required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Always return the same response regardless of whether the email has orders —
    // this prevents email enumeration. Only actually send if the address has at
    // least one order so the endpoint can't be used to spam arbitrary addresses.
    // Case-insensitive on the column too — orders created before we started
    // normalizing on insert may still have mixed-case addresses.
    const hasOrders = await getOne(
        'SELECT 1 FROM orders WHERE LOWER(TRIM(customer_email)) = ? LIMIT 1',
        normalizedEmail
    );

    if (hasOrders) {
        const plainToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(plainToken);
        const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000).toISOString();

        await execSql(
            'INSERT INTO magic_links (token, email, expires_at, used) VALUES (?, ?, ?, 0)',
            tokenHash,
            normalizedEmail,
            expiresAt
        );

        const delivery = await getEmailModule().sendMagicLinkEmail({
            to: normalizedEmail,
            token: plainToken,
            clientUrl: getClientUrlFromRequest(req),
        });
        console.info(
            `[Auth] Magic link request processed | email=${redactEmail(normalizedEmail)} | delivery=${delivery?.ok ? 'sent' : delivery?.reason || 'unknown'}`
        );
    } else {
        console.info(`[Auth] Magic link request skipped | email=${redactEmail(normalizedEmail)} | reason=no_matching_orders`);
    }

    // Identical response whether or not an email was sent — prevents enumeration.
    res.json({ message: 'If that email has orders, a sign-in link has been sent.' });
});

// POST /api/auth/verify — exchange magic-link token for a session cookie.
// Using POST keeps the token out of server access logs (it's in the body, not the URL).
router.post('/verify', async (req, res) => {
    await ensureAuthTables();
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required.' });

    const tokenHash = hashToken(String(token));
    const record = await getOne('SELECT * FROM magic_links WHERE token = ?', tokenHash);

    if (!record) return res.status(401).json({ error: 'Invalid or expired link.' });
    if (record.used) return res.status(401).json({ error: 'Link already used.' });
    const now = new Date();
    if (new Date(record.expires_at) < now) {
        return res.status(401).json({ error: 'Link has expired. Please request a new one.' });
    }

    const consumed = await execSql(
        'UPDATE magic_links SET used = 1 WHERE token = ? AND used = 0 AND expires_at >= ?',
        tokenHash,
        now.toISOString()
    );
    if (consumed.changes === 0) {
        return res.status(401).json({ error: 'Invalid or expired link.' });
    }

    const existing = await getOne('SELECT id FROM users WHERE email = ?', record.email);
    let userId;
    if (existing) {
        userId = existing.id;
    } else {
        userId = crypto.randomUUID();
        await execSql(
            'INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)',
            userId,
            record.email,
            new Date().toISOString()
        );
    }

    // Magic link always issues a regular user token — admin access is only via
    // /api/admin/login with username + password (HIGH-04 fix).
    const jwtToken = generateToken({ id: userId, email: record.email, role: 'user' });

    res.cookie('sonnetary_token', jwtToken, {
        ...COOKIE_OPTS,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({ email: record.email });
});

// GET /api/auth/me — return the current user from their session cookie or Bearer token
router.get('/me', requireAuth, (req, res) => {
    res.json({ userId: req.user.userId, email: req.user.email, role: req.user.role });
});

// POST /api/auth/logout — revoke the current session cookie
router.post('/logout', async (req, res) => {
    const token = req.cookies?.sonnetary_token;
    if (token) await revokeToken(token);
    res.clearCookie('sonnetary_token', COOKIE_OPTS);
    res.json({ message: 'Signed out.' });
});

module.exports = router;
