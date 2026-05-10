'use strict';

/**
 * Rate limit theo IP.
 * - Không có REDIS_URL: dùng in-memory (Map), phù hợp single instance.
 * - Có REDIS_URL: dùng Redis, phù hợp multi-instance trên Render.
 *
 * Usage:
 *   const { createLimiter } = require('./rate-limit');
 *   app.use('/challenge', createLimiter({ windowMs: 60_000, max: 15 }));
 */

const _getIP = require('ipware')().get_ip;
const log = require('../logger');

// ─── Redis client (lazy init, shared) ─────────────────────────────────────────

let _redisClient = null;
let _redisConnecting = false;

async function getRedisClient() {
    if (_redisClient) return _redisClient;
    if (_redisConnecting) return null;
    const url = process.env.REDIS_URL;
    if (!url) return null;

    _redisConnecting = true;
    try {
        const { createClient } = require('redis');
        const client = createClient({ url });
        client.on('error', e => log(`[REDIS] ${e.message}`, 'WARN'));
        await client.connect();
        _redisClient = client;
        log('[RATE-LIMIT] Redis store đã kết nối', 'INFO');
    } catch (e) {
        log(`[RATE-LIMIT] Redis lỗi, dùng memory store: ${e.message}`, 'WARN');
    }
    _redisConnecting = false;
    return _redisClient;
}

// ─── In-memory limiter ────────────────────────────────────────────────────────

function createMemoryLimiter({ windowMs, max, message }) {
    const buckets = new Map();

    setInterval(() => {
        const now = Date.now();
        for (const [ip, b] of buckets) {
            if (b.reset <= now) buckets.delete(ip);
        }
    }, Math.max(windowMs, 30_000)).unref();

    return function rateLimitMiddleware(req, res, next) {
        const ip = _getIP(req).clientIp || req.ip || '0.0.0.0';
        const now = Date.now();

        let b = buckets.get(ip);
        if (!b || b.reset <= now) {
            b = { reset: now + windowMs, count: 0 };
            buckets.set(ip, b);
        }
        b.count++;

        const remaining = Math.max(0, max - b.count);
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(b.reset / 1000)));

        if (b.count > max) {
            const retryAfter = Math.ceil((b.reset - now) / 1000);
            res.setHeader('Retry-After', String(retryAfter));
            return res.status(429).json({
                status: false,
                message: message || `Quá nhiều yêu cầu. Thử lại sau ${retryAfter}s.`
            });
        }
        next();
    };
}

// ─── Redis limiter ────────────────────────────────────────────────────────────

function createRedisLimiter({ windowMs, max, message, name }) {
    const prefix = `RL_${name || 'default'}_`;

    return async function rateLimitMiddleware(req, res, next) {
        const client = await getRedisClient();
        if (!client) return next();

        const ip = _getIP(req).clientIp || req.ip || '0.0.0.0';
        const key = prefix + ip;
        const windowSec = Math.ceil(windowMs / 1000);

        try {
            const multi = client.multi();
            multi.incr(key);
            multi.ttl(key);
            const [count, ttl] = await multi.exec();

            if (count === 1) await client.expire(key, windowSec);

            const remaining = Math.max(0, max - count);
            const retryAfter = ttl > 0 ? ttl : windowSec;

            res.setHeader('X-RateLimit-Limit', String(max));
            res.setHeader('X-RateLimit-Remaining', String(remaining));
            res.setHeader('X-RateLimit-Reset', String(Math.floor(Date.now() / 1000) + retryAfter));

            if (count > max) {
                res.setHeader('Retry-After', String(retryAfter));
                return res.status(429).json({
                    status: false,
                    message: message || `Quá nhiều yêu cầu. Thử lại sau ${retryAfter}s.`
                });
            }
            next();
        } catch (e) {
            log(`[RATE-LIMIT] Redis lỗi: ${e.message}`, 'WARN');
            next();
        }
    };
}

// ─── Public API ───────────────────────────────────────────────────────────────

function createLimiter({ windowMs = 60_000, max = 30, message, name } = {}) {
    if (process.env.REDIS_URL) {
        getRedisClient().catch(() => {});
        return createRedisLimiter({ windowMs, max, message, name });
    }
    return createMemoryLimiter({ windowMs, max, message });
}

module.exports = { createLimiter };
