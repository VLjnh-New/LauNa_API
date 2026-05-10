'use strict';

/**
 * Lưu trữ proxy do người dùng đóng góp + tracking auto-proxy theo IP client.
 * Tất cả thao tác đều no-op an toàn nếu DB chưa được cấu hình.
 */

const db = require('./db');

const AUTO_PROXY_TTL_HOURS = 24;
const AUTO_PROXY_MAX_HOURS = 24 * 7;

// ─── User proxies ─────────────────────────────────────────────────────────────

async function saveProxy({ ip, port, protocol = 'http', source = 'user', addedByIp = null, alive = true, ms = null }) {
    if (!db.isEnabled()) return false;
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(String(ip))) return false;
    const p = parseInt(port, 10);
    if (!p || p < 1 || p > 65535) return false;
    try {
        await db.query(
            `INSERT INTO user_proxies (ip, port, protocol, source, added_by_ip, alive, ms, last_checked, fail_count)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), 0)
             ON CONFLICT (ip, port) DO UPDATE SET
               protocol = EXCLUDED.protocol,
               source = COALESCE(EXCLUDED.source, user_proxies.source),
               alive = EXCLUDED.alive,
               ms = COALESCE(EXCLUDED.ms, user_proxies.ms),
               last_checked = NOW(),
               fail_count = CASE WHEN EXCLUDED.alive THEN 0 ELSE user_proxies.fail_count END`,
            [String(ip), p, String(protocol).toLowerCase(), source, addedByIp, !!alive, ms]
        );
        return true;
    } catch (e) {
        return false;
    }
}

async function saveProxiesBulk(list = []) {
    if (!db.isEnabled() || !list.length) return 0;
    let n = 0;
    for (const p of list) {
        if (await saveProxy(p)) n++;
    }
    return n;
}

async function markProxyFail(ip, port) {
    if (!db.isEnabled()) return;
    try {
        await db.query(
            `UPDATE user_proxies SET fail_count = fail_count + 1,
             alive = CASE WHEN fail_count + 1 >= 5 THEN FALSE ELSE alive END,
             last_checked = NOW()
             WHERE ip = $1 AND port = $2`,
            [String(ip), parseInt(port, 10)]
        );
    } catch {}
}

async function listProxies({ aliveOnly = true, limit = 200 } = {}) {
    if (!db.isEnabled()) return [];
    try {
        const { rows } = await db.query(
            `SELECT ip, port, protocol, source, alive, fail_count, ms, last_checked, created_at
             FROM user_proxies
             ${aliveOnly ? 'WHERE alive = TRUE' : ''}
             ORDER BY alive DESC, ms NULLS LAST, created_at DESC
             LIMIT $1`,
            [limit]
        );
        return rows;
    } catch { return []; }
}

async function countProxies() {
    if (!db.isEnabled()) return { total: 0, alive: 0 };
    try {
        const { rows } = await db.query(
            `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE alive)::int AS alive FROM user_proxies`
        );
        return rows[0] || { total: 0, alive: 0 };
    } catch { return { total: 0, alive: 0 }; }
}

async function deleteProxy(ip, port) {
    if (!db.isEnabled()) return false;
    try {
        const r = await db.query(`DELETE FROM user_proxies WHERE ip = $1 AND port = $2`, [String(ip), parseInt(port, 10)]);
        return r.rowCount > 0;
    } catch { return false; }
}

// ─── User proxy sources ───────────────────────────────────────────────────────

async function addSource(url, addedByIp = null) {
    if (!db.isEnabled()) return false;
    if (!/^https?:\/\//i.test(url)) return false;
    try {
        await db.query(
            `INSERT INTO user_proxy_sources (url, added_by_ip)
             VALUES ($1, $2)
             ON CONFLICT (url) DO NOTHING`,
            [url, addedByIp]
        );
        return true;
    } catch { return false; }
}

async function listSources() {
    if (!db.isEnabled()) return [];
    try {
        const { rows } = await db.query(
            `SELECT url, added_by_ip, last_fetched, last_count, fail_count, created_at
             FROM user_proxy_sources ORDER BY created_at DESC LIMIT 200`
        );
        return rows;
    } catch { return []; }
}

async function deleteSource(url) {
    if (!db.isEnabled()) return false;
    try {
        const r = await db.query(`DELETE FROM user_proxy_sources WHERE url = $1`, [url]);
        return r.rowCount > 0;
    } catch { return false; }
}

async function recordSourceFetch(url, count, ok = true) {
    if (!db.isEnabled()) return;
    try {
        await db.query(
            `UPDATE user_proxy_sources
             SET last_fetched = NOW(),
                 last_count = $2,
                 fail_count = CASE WHEN $3 THEN 0 ELSE fail_count + 1 END
             WHERE url = $1`,
            [url, count | 0, !!ok]
        );
    } catch {}
}

// ─── Auto-proxy clients (IP người dùng bị upstream chặn) ─────────────────────

const memCache = new Map(); // ip → expiresAt (ms)
const MEM_TTL = 60_000;

function _putMem(ip, expiresAt) {
    memCache.set(ip, expiresAt);
}

async function markBlocked(ip, reason = '') {
    if (!ip) return;
    const expires = Date.now() + AUTO_PROXY_TTL_HOURS * 3600_000;
    _putMem(ip, expires);
    if (!db.isEnabled()) return;
    try {
        await db.query(
            `INSERT INTO auto_proxy_clients (client_ip, reason, expires_at, hits)
             VALUES ($1, $2, NOW() + ($3 || ' hours')::interval, 1)
             ON CONFLICT (client_ip) DO UPDATE SET
               hits = auto_proxy_clients.hits + 1,
               reason = EXCLUDED.reason,
               marked_at = NOW(),
               expires_at = LEAST(
                 NOW() + ($4 || ' hours')::interval,
                 auto_proxy_clients.expires_at + ($3 || ' hours')::interval
               )`,
            [ip, String(reason).slice(0, 200), String(AUTO_PROXY_TTL_HOURS), String(AUTO_PROXY_MAX_HOURS)]
        );
    } catch {}
}

async function isAutoProxy(ip) {
    if (!ip) return false;
    const cached = memCache.get(ip);
    const now = Date.now();
    if (cached && cached > now) return true;
    if (cached && cached <= now) memCache.delete(ip);
    if (!db.isEnabled()) return false;
    try {
        const { rows } = await db.query(
            `SELECT EXTRACT(EPOCH FROM expires_at) * 1000 AS exp_ms
             FROM auto_proxy_clients
             WHERE client_ip = $1 AND expires_at > NOW()`,
            [ip]
        );
        if (!rows.length) return false;
        _putMem(ip, Number(rows[0].exp_ms) || (now + MEM_TTL));
        return true;
    } catch { return false; }
}

async function clearAutoProxy(ip) {
    memCache.delete(ip);
    if (!db.isEnabled()) return false;
    try {
        const r = await db.query(`DELETE FROM auto_proxy_clients WHERE client_ip = $1`, [ip]);
        return r.rowCount > 0;
    } catch { return false; }
}

async function listAutoProxy({ limit = 100 } = {}) {
    if (!db.isEnabled()) return [];
    try {
        const { rows } = await db.query(
            `SELECT client_ip, reason, marked_at, expires_at, hits
             FROM auto_proxy_clients
             WHERE expires_at > NOW()
             ORDER BY marked_at DESC LIMIT $1`,
            [limit]
        );
        return rows;
    } catch { return []; }
}

async function purgeExpired() {
    if (!db.isEnabled()) return;
    try {
        await db.query(`DELETE FROM auto_proxy_clients WHERE expires_at <= NOW()`);
    } catch {}
}

// Phân tích chuỗi proxy người dùng dán: ip:port hoặc protocol://ip:port (mỗi dòng 1 cái)
function parseProxyText(text) {
    const out = [];
    String(text || '').split(/[\r\n,;]+/).forEach(line => {
        const s = line.trim();
        if (!s) return;
        const m = s.match(/^(?:(https?|socks[45]?):\/\/)?(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})/i);
        if (!m) return;
        const protocol = (m[1] || 'http').toLowerCase();
        if (!['http', 'https'].includes(protocol)) return; // chỉ chấp nhận http(s) cho axios proxy
        out.push({ ip: m[2], port: parseInt(m[3], 10), protocol });
    });
    // Loại trùng
    const seen = new Set();
    return out.filter(p => {
        const k = `${p.ip}:${p.port}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
    });
}

module.exports = {
    saveProxy, saveProxiesBulk, markProxyFail, listProxies, countProxies, deleteProxy,
    addSource, listSources, deleteSource, recordSourceFetch,
    markBlocked, isAutoProxy, clearAutoProxy, listAutoProxy, purgeExpired,
    parseProxyText,
    AUTO_PROXY_TTL_HOURS,
};
