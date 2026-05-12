const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function getJwtSecret() {
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) return jwtSecret;
    if (process.env.NODE_ENV === 'test') return 'test-only-secret-not-for-production';

    // A missing secret means tokens could be forged with a weak/default key.
    throw new Error('JWT_SECRET environment variable is required but not set.');
}

let db;
function getDb() {
    if (!db) db = require('../db.cjs');
    return db;
}

function extractToken(req) {
    // Cookie takes priority; Authorization header is a fallback for API clients.
    const fromCookie = req.cookies?.sonnetary_token || req.cookies?.admin_token;
    if (fromCookie) return fromCookie;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    return null;
}

function isRevoked(jti) {
    if (!jti) return false;
    // Let DB errors propagate — requireAuth's outer try/catch returns 401,
    // which is the correct fail-closed behaviour (revoked token stays revoked).
    const row = getDb().prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(jti);
    return !!row;
}

function requireAuth(req, res, next) {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const payload = jwt.verify(token, getJwtSecret());
        if (isRevoked(payload.jti)) {
            return res.status(401).json({ error: 'Session has been revoked. Please sign in again.' });
        }
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireAdmin(req, res, next) {
    requireAuth(req, res, () => {
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

function revokeToken(jwtToken) {
    try {
        const payload = jwt.decode(jwtToken);
        if (!payload?.jti || !payload?.exp) return;
        const expiresAt = new Date(payload.exp * 1000).toISOString();
        getDb().prepare(
            'INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)'
        ).run(payload.jti, expiresAt);
    } catch {
        // best-effort
    }
}

const COOKIE_OPTS = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
};

module.exports = {
    requireAuth,
    requireAdmin,
    generateToken,
    revokeToken,
    COOKIE_OPTS,
};
