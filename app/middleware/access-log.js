'use strict';

/**
 * Access Log Middleware
 *
 * Log mọi request vào ring buffer (có thể xem qua /admin/logs).
 * Format: [METHOD] path → status ms | ip | requestId
 * Không log: static assets, healthz, readyz
 */

const log     = require('../../utils/logger');
const tracker = require('../../utils/data/usage-tracker');

const RING_MAX = 1000;
const ring = [];

const SKIP_PATHS = new Set(['/healthz', '/readyz', '/avatar.png', '/favicon.ico']);
const SKIP_PREFIXES = ['/public/', '/__shield/'];

function shouldSkip(path) {
    if (SKIP_PATHS.has(path)) return true;
    return SKIP_PREFIXES.some(p => path.startsWith(p));
}

function getClientIp(req) {
    return (
        req.headers['cf-connecting-ip'] ||
        req.headers['x-real-ip'] ||
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.ip ||
        '-'
    );
}

function middleware(req, res, next) {
    if (shouldSkip(req.path)) return next();

    const start = Date.now();
    const ip = getClientIp(req);

    res.on('finish', () => {
        const ms = Date.now() - start;
        const status = res.statusCode;
        const apikey = req.query?.apikey || req.headers?.['x-api-key'] || req.headers?.['apikey'] || null;
        const entry = {
            ts:        new Date().toISOString(),
            method:    req.method,
            path:      req.path,
            status,
            ms,
            ip,
            requestId: req.requestId || '-',
            cache:     res.getHeader('X-Cache') || '-',
            ua:        (req.headers['user-agent'] || '-').slice(0, 80),
        };

        if (ring.length >= RING_MAX) ring.shift();
        ring.push(entry);

        // Ghi vào usage-tracker (chỉ request thành công, không track admin/)
        if (status < 400 && !req.path.startsWith('/admin')) {
            try { tracker.track({ apikey, ip, path: req.path }); } catch (_) {}
        }

        const color = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'API';
        log(`[${req.method}] ${req.path} → ${status} ${ms}ms | ${ip} | ${req.requestId || '-'}`, color);
    });

    next();
}

function getLogs({ limit = 100, method, status, path: pathFilter } = {}) {
    let entries = [...ring].reverse();
    if (method) entries = entries.filter(e => e.method === method.toUpperCase());
    if (status) entries = entries.filter(e => e.status === Number(status));
    if (pathFilter) entries = entries.filter(e => e.path.includes(pathFilter));
    return entries.slice(0, Math.min(limit, 500));
}

function getStats() {
    const total = ring.length;
    const byStatus = {};
    const byMethod = {};
    let totalMs = 0;

    for (const e of ring) {
        byStatus[e.status] = (byStatus[e.status] || 0) + 1;
        byMethod[e.method] = (byMethod[e.method] || 0) + 1;
        totalMs += e.ms;
    }

    return {
        total,
        avgMs: total ? Math.round(totalMs / total) : 0,
        byStatus,
        byMethod,
    };
}

module.exports = { middleware, getLogs, getStats };
