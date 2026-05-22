const express = require('express');
const router = express.Router();

async function detectCountry(req, res) {
    try {
        // Respect x-forwarded-for for reverse proxies (Railway, etc.)
        const forwarded = req.headers['x-forwarded-for'];
        const ip = (forwarded ? forwarded.split(',')[0].trim() : null) || req.ip || '';

        // Local IPs in dev — default to Nigeria so Paystack works locally
        const isLocal =
            !ip ||
            ip === '127.0.0.1' ||
            ip === '::1' ||
            ip.startsWith('::ffff:127.') ||
            ip.startsWith('192.168.') ||
            ip.startsWith('10.');

        if (isLocal) {
            return res.json({ country: 'NG', isNigeria: true, source: 'local' });
        }

        const response = await fetch(`https://ipapi.co/${ip}/json/`, {
            headers: { 'User-Agent': 'YourGbedu/1.0' },
            signal: AbortSignal.timeout(3000), // 3s timeout
        });

        const data = await response.json();
        const country = data.country_code || 'NG';

        res.json({ country, isNigeria: country === 'NG', source: 'ipapi' });
    } catch (err) {
        console.error('[Geo] Country detection failed:', err.message);
        // Fail open: default to Nigeria (Paystack) so Nigerian users are never broken
        res.json({ country: 'NG', isNigeria: true, source: 'fallback' });
    }
}

// GET /api/geo and /api/geo/country — detect user's country from IP address.
router.get('/', detectCountry);
router.get('/country', detectCountry);

module.exports = router;
