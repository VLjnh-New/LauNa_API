'use strict';

/**
 * Global LRU Response Cache Middleware
 *
 * Tự động cache MỌI GET request JSON thành công (2xx).
 * - Không cache: POST/PUT/DELETE, streaming (FFmpeg), errors, bypass patterns
 * - Cache key: method + path + query (trừ apikey)
 * - TTL theo từng route pattern
 * - Header: X-Cache: HIT | MISS
 * - Có thể clear cache qua API admin
 */

const { LRUCache } = require('lru-cache');

// ─── TTL rules (ms) theo route prefix ─────────────────────────────────────────
const TTL_RULES = [
    // Static/reference data — cache lâu
    { prefix: '/lol/',               ttl: 30 * 60_000 },  // 30 phút
    { prefix: '/lienquan/',          ttl: 30 * 60_000 },  // 30 phút
    { prefix: '/ai/voices',          ttl: 60 * 60_000 },  // 1 giờ
    { prefix: '/ai/models',          ttl: 60 * 60_000 },  // 1 giờ
    { prefix: '/vietqr',             ttl: 60 * 60_000 },  // 1 giờ
    { prefix: '/vietnam/',           ttl: 60 * 60_000 },  // 1 giờ
    { prefix: '/lich-am',            ttl: 60 * 60_000 },  // 1 giờ
    { prefix: '/mst',                ttl: 10 * 60_000 },  // 10 phút
    { prefix: '/bank-lookup',        ttl: 10 * 60_000 },  // 10 phút
    { prefix: '/ship-track',         ttl: 2 * 60_000 },   // 2 phút

    // Search / live data — cache ngắn
    { prefix: '/music/scl-search',   ttl: 5 * 60_000 },   // 5 phút
    { prefix: '/music/',             ttl: 3 * 60_000 },   // 3 phút
    { prefix: '/download/',          ttl: 2 * 60_000 },   // 2 phút
    { prefix: '/freefire/',          ttl: 3 * 60_000 },   // 3 phút
    { prefix: '/stats',              ttl: 2 * 60_000 },   // 2 phút
    { prefix: '/finance/',           ttl: 60_000 },        // 1 phút
    { prefix: '/tools/',             ttl: 5 * 60_000 },   // 5 phút
    { prefix: '/fb-uid',             ttl: 5 * 60_000 },   // 5 phút

    // Default fallback — mọi GET API khác cache 2 phút
    { prefix: '/',                   ttl: 2 * 60_000 },   // 2 phút (fallback)
];

// ─── Routes KHÔNG cache ────────────────────────────────────────────────────────
const BYPASS_PREFIXES = [
    '/download/process',  // FFmpeg streaming
    '/download/scl',      // audio streaming
    '/ai/voice',          // TTS streaming
    '/ai/chat',           // AI streaming
    '/note/',             // user-specific
    '/tempmail/',         // user-specific
    '/tempsms/',          // user-specific
    '/vps/',              // user-specific
    '/proxy/',            // admin
    '/admin/',            // admin
    '/tools/reg/',        // tạo tài khoản — không cache, mỗi lần ra kết quả khác nhau
    '/gpt/reggpt',        // job registration — live data, không cache
    '/healthz',
    '/readyz',
    '/challenge',
];

const cache = new LRUCache({
    max: 1500,
    ttl: 2 * 60_000,
    allowStale: false,
    updateAgeOnGet: false,
});

function getTTL(path) {
    const p = path.toLowerCase();
    const rule = TTL_RULES.find(r => p.startsWith(r.prefix));
    return rule ? rule.ttl : null;
}

function shouldBypass(path) {
    const p = path.toLowerCase();
    return BYPASS_PREFIXES.some(bp => p.startsWith(bp));
}

/**
 * Cache key = method + path + query (trừ apikey) + auth-partition.
 *
 * Auth-partition ngăn cache bypass:
 *   - Request có apikey  → dùng 8 ký tự đầu của key làm partition
 *   - Request không key  → partition = 'pub'
 *
 * Kết quả: unauthenticated request KHÔNG bao giờ HIT cache của authenticated request.
 */
function makeCacheKey(req) {
    const rawKey = req.query.apikey || req.headers['x-api-key'] || req.headers['apikey'] || '';
    // Dùng 8 ký tự đầu của key làm partition — đủ để phân biệt, không lộ key đầy đủ
    const partition = rawKey ? rawKey.slice(0, 8) : 'pub';

    const q = { ...req.query };
    delete q.apikey;
    const qs = Object.keys(q).sort().map(k => `${k}=${q[k]}`).join('&');
    return `${req.method}:${req.path}:${partition}${qs ? '?' + qs : ''}`;
}

function middleware(req, res, next) {
    if (req.method !== 'GET') return next();
    if (shouldBypass(req.path)) return next();

    const ttl = getTTL(req.path);
    if (!ttl) return next();

    const key = makeCacheKey(req);
    const hit = cache.get(key);

    if (hit) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Request-ID', req.requestId || 'cached');
        res.setHeader('X-Response-Time', '0ms');
        res.setHeader('X-API-Version', require('../../package.json').version);
        return res.status(200).send(hit);
    }

    res.setHeader('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    res.json = function cachedJson(body) {
        if (res.statusCode >= 200 && res.statusCode < 300 && body && body.status !== false) {
            const serialized = JSON.stringify(body, null, 4);
            cache.set(key, serialized, { ttl });
        }
        return originalJson(body);
    };

    next();
}

function getStats() {
    return {
        size: cache.size,
        max: cache.max,
        calculatedSize: cache.calculatedSize,
    };
}

function clearCache(pattern) {
    if (!pattern) {
        cache.clear();
        return { cleared: 'all' };
    }
    let count = 0;
    for (const key of cache.keys()) {
        if (key.includes(pattern)) {
            cache.delete(key);
            count++;
        }
    }
    return { cleared: count, pattern };
}

function listKeys() {
    return [...cache.keys()];
}

module.exports = { middleware, getStats, clearCache, listKeys };
