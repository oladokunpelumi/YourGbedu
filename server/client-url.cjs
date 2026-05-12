const DEFAULT_CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

function getDevClientOrigins() {
    const configuredPort = process.env.VITE_CLIENT_PORT || '3000';
    const ports = new Set([configuredPort, '3000', '5173']);

    return Array.from(ports).flatMap((port) => [
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
    ]);
}

function getClientUrlFromRequest(req) {
    const origin = req.get('origin');
    if (process.env.NODE_ENV !== 'production' && origin && getDevClientOrigins().includes(origin)) {
        return origin;
    }

    return DEFAULT_CLIENT_URL;
}

module.exports = {
    DEFAULT_CLIENT_URL,
    getDevClientOrigins,
    getClientUrlFromRequest,
};
