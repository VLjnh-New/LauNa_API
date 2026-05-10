'use strict';

const { query, isEnabled } = require('../../utils/data/db');
const log = require('../../utils/logger');
const usage = require('../../utils/data/usage-tracker');
const _getIP = require('ipware')().get_ip;

const SKIP_PATHS = new Set([
    '/total_request', '/favicon.ico', '/stats', '/healthz', '/readyz',
    '/openapi.json', '/docs',
    '/oauth/callback', '/auth/callback', '/auth/result', '/oauth/result', '/diver'
]);

function getCategory(p) {
    if (/^\/ai/.test(p)) return 'AI';
    if (/^\/download/.test(p)) return 'Download';
    if (/^\/music/.test(p)) return 'Music';
    if (/^\/note|^\/api\/Note/.test(p)) return 'Note';
    return 'Other';
}

// Buffer in-memory để tránh ghi DB mỗi request
const buffer = { total: 0, byCategory: {}, hourly: {} };
let flushing = false;
let _lastErrLog = 0;
const ERR_LOG_COOLDOWN = 5 * 60_000; // chỉ log lỗi DB mỗi 5 phút

async function flush() {
    if (flushing) return;
    if (buffer.total === 0) return;
    flushing = true;
    const snap = {
        total: buffer.total,
        byCategory: { ...buffer.byCategory },
        hourly: { ...buffer.hourly }
    };
    buffer.total = 0;
    buffer.byCategory = {};
    buffer.hourly = {};
    try {
        await query(
            `UPDATE request_counter
                SET total = total + $1,
                    by_category = (
                        SELECT jsonb_object_agg(k, COALESCE((by_category->>k)::bigint, 0) + (v)::bigint)
                        FROM jsonb_each_text($2::jsonb) AS t(k, v)
                        FULL OUTER JOIN jsonb_object_keys(by_category) AS bk(k) USING (k)
                    )
              WHERE id = 1`,
            [snap.total, JSON.stringify(snap.byCategory)]
        ).catch(async () => {
            // Fallback đơn giản hơn nếu query trên không tương thích
            const cur = await query('SELECT by_category FROM request_counter WHERE id=1');
            const merged = Object.assign({}, cur.rows[0]?.by_category || {});
            for (const [k, v] of Object.entries(snap.byCategory)) merged[k] = (merged[k] || 0) + v;
            await query(
                'UPDATE request_counter SET total = total + $1, by_category = $2 WHERE id=1',
                [snap.total, merged]
            );
        });
        for (const [hour, n] of Object.entries(snap.hourly)) {
            await query(
                `INSERT INTO request_hourly(hour, n) VALUES ($1, $2)
                 ON CONFLICT (hour) DO UPDATE SET n = request_hourly.n + EXCLUDED.n`,
                [hour, n]
            );
        }
    } catch (e) {
        const now = Date.now();
        if (now - _lastErrLog >= ERR_LOG_COOLDOWN) {
            _lastErrLog = now;
            log(`request-counter flush lỗi: ${e.message}`, 'WARN');
        }
        // Trả lại buffer để thử lại
        buffer.total += snap.total;
        for (const [k, v] of Object.entries(snap.byCategory)) buffer.byCategory[k] = (buffer.byCategory[k] || 0) + v;
        for (const [k, v] of Object.entries(snap.hourly))     buffer.hourly[k]     = (buffer.hourly[k]     || 0) + v;
    } finally {
        flushing = false;
    }
}

if (isEnabled()) {
    setInterval(() => { flush().catch(() => {}); }, 30_000).unref();
    process.on('beforeExit', () => { flush().catch(() => {}); });
}

module.exports = function requestCounter(req, res, next) {
    if (SKIP_PATHS.has(req.path)) return next();
    buffer.total += 1;
    const cat = getCategory(req.path);
    buffer.byCategory[cat] = (buffer.byCategory[cat] || 0) + 1;
    const hKey = new Date().toISOString().slice(0, 13);
    buffer.hourly[hKey] = (buffer.hourly[hKey] || 0) + 1;

    // Track per-key + per-IP cho top-users (in-memory, không cần DB)
    try {
        const apikey = (req.query && req.query.apikey)
            || req.headers['x-api-key']
            || req.headers['apikey']
            || null;
        const ip = (_getIP(req).clientIp) || req.ip || null;
        if (apikey || ip) usage.track({ apikey, ip, path: req.path });
    } catch (_) {}

    next();
};

module.exports.flush = flush;
