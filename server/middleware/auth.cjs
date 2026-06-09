const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getOne, execSql, pgVariantSql } = require('../db-helpers.cjs');

function getJwtSecret() {
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) return jwtSecret;
    if (process.env.NODE_ENV === 'test') return 'test-only-secret-not-for-production';

    // A missing secret means tokens could be forged with a weak/default key.
    throw new Error('JWT_SECRET environment variable is required but not set.');
}

function extractToken(req) {
    // Cookie takes priority; Authorization header is a fallback for API clients.
    const fromCookie = req.cookies?.sonnetary_token || req.cookies?.admin_token;
    if (fromCookie) return fromCookie;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return null;
}

async function isRevoked(jti) {
    if (!jti) return false;
    // Let DB errors propagate — requireAuth's outer try/catch returns 401,
    // which is the correct fail-closed behaviour (revoked token stays revoked).
    const row = await getOne('SELECT 1 AS x FROM revoked_tokens WHERE jti = ?', jti);
    return !!row;
}

async function requireAuth(req, res, next) {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const payload = jwt.verify(token, getJwtSecret());
        if (await isRevoked(payload.jti)) {
            return res.status(401).json({ error: 'Session has been revoked. Please sign in again.' });
        }
        req.user = payload;
        next();
    } catch (err) {
        console.warn('[Auth] requireAuth rejected:', err?.message || err);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

async function requireAdmin(req, res, next) {
    await requireAuth(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Forbidden: Admin access only' });
        }
        next();
    });
}

function generateToken(user) {
    // Role must be explicitly set by a trusted caller (admin login or signup).
    // Never derive role from email — that creates an alternative admin auth path.
    const role = user.role || 'user';
    const expiresIn = role === 'admin' ? '4h' : '24h';
    const jti = crypto.randomUUID();

    return jwt.sign(
        { userId: user.id, email: user.email || null, role, jti },
        getJwtSecret(),
        { expiresIn }
    );
}

async function revokeToken(jwtToken) {
    try {
        const payload = jwt.decode(jwtToken);
        if (!payload?.jti || !payload?.exp) return;
        const expiresAt = new Date(payload.exp * 1000).toISOString();
        const sql = pgVariantSql({
            sqlite: 'INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)',
            postgres: 'INSERT INTO revoked_tokens (jti, expires_at) VALUES (?, ?) ON CONFLICT (jti) DO NOTHING',
        });
        await execSql(sql, payload.jti, expiresAt);
    } catch (err) {
        // best-effort — logout still clears the cookie client-side
        console.warn('[Auth] revokeToken failed (best-effort):', err?.message || err);
    }
}

// sameSite: 'lax' is the right default for cookie-based auth on an SPA — it still
// blocks CSRF on top-level cross-site requests, but allows the cookie to ride
// along on the SPA's own fetch() calls that fire immediately after login.
// 'strict' breaks the admin login flow: the cookie is set on the POST response
// but then dropped on the very next fetch (followup useEffect → fetchData),
// which returns 401 and bounces the user back to the login form.
const COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/', // explicit so /api/* requests carry the cookie regardless of fetch URL prefix
};

module.exports = {
    requireAuth,
    requireAdmin,
    generateToken,
    revokeToken,
    COOKIE_OPTS,
};
