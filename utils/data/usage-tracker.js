'use strict';

/**
 * In-memory request tracker — không cần DB.
 * Lưu count theo bucket 1 giờ, giữ tối đa 168 buckets (= 7 ngày).
 *
 *   track({ apikey, ip, path })
 *   topKeys(hours)  → [{ key, count }]
 *   topIps(hours)   → [{ ip,  count }]
 *   keysForIp(ip)   → [apikey, ...]
 *   ipsForKey(key)  → [ip, ...]
 */

const MAX_HOURS    = 7 * 24;          // giữ 7 ngày
const MAX_KEYS     = 5_000;           // chống nổ RAM
const MAX_IPS      = 20_000;
const MAX_PER_BKT  = 50_000;          // mỗi bucket tối đa N entries

// Map<bucketHourKey, { keys: Map<apikey,count>, ips: Map<ip,count> }>
const buckets = new Map();
// Liên kết apikey ↔ ip để search nhanh
const keyToIps = new Map(); // apikey → Set<ip>
const ipToKeys = new Map(); // ip → Set<apikey>

function bucketKey(ts = Date.now()) {
    return new Date(ts).toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

function getBucket(key) {
    let b = buckets.get(key);
    if (!b) {
        b = { keys: new Map(), ips: new Map() };
        buckets.set(key, b);
        // Trim cũ
        if (buckets.size > MAX_HOURS) {
            const oldest = buckets.keys().next().value;
            buckets.delete(oldest);
        }
    }
    return b;
}

function track({ apikey, ip, path }) {
    const bk = bucketKey();
    const b = getBucket(bk);
    if (apikey) {
        if (b.keys.size < MAX_PER_BKT || b.keys.has(apikey)) {
            b.keys.set(apikey, (b.keys.get(apikey) || 0) + 1);
        }
        if (ip) {
            let s = keyToIps.get(apikey);
            if (!s) { s = new Set(); keyToIps.set(apikey, s); }
            if (s.size < 200) s.add(ip);
            if (keyToIps.size > MAX_KEYS) {
                const oldest = keyToIps.keys().next().value;
                keyToIps.delete(oldest);
            }
        }
    }
    if (ip) {
        if (b.ips.size < MAX_PER_BKT || b.ips.has(ip)) {
            b.ips.set(ip, (b.ips.get(ip) || 0) + 1);
        }
        if (apikey) {
            let s = ipToKeys.get(ip);
            if (!s) { s = new Set(); ipToKeys.set(ip, s); }
            if (s.size < 50) s.add(apikey);
            if (ipToKeys.size > MAX_IPS) {
                const oldest = ipToKeys.keys().next().value;
                ipToKeys.delete(oldest);
            }
        }
    }
}

function aggregate(field, hours = 24, limit = 10) {
    const cutoff = Date.now() - hours * 3600_000;
    const sums = new Map();
    for (const [bk, b] of buckets) {
        const ts = Date.parse(bk + ':00:00.000Z');
        if (ts < cutoff) continue;
        for (const [k, v] of b[field]) {
            sums.set(k, (sums.get(k) || 0) + v);
        }
    }
    return [...sums.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([k, count]) => field === 'keys' ? { key: k, count } : { ip: k, count });
}

function topKeys(hours = 24, limit = 10) { return aggregate('keys', hours, limit); }
function topIps (hours = 24, limit = 10) { return aggregate('ips',  hours, limit); }

function keysForIp(ip)   { return [...(ipToKeys.get(ip) || [])]; }
function ipsForKey(key)  { return [...(keyToIps.get(key) || [])]; }

function totals(hours = 24) {
    const cutoff = Date.now() - hours * 3600_000;
    let total = 0;
    const uKeys = new Set(), uIps = new Set();
    for (const [bk, b] of buckets) {
        const ts = Date.parse(bk + ':00:00.000Z');
        if (ts < cutoff) continue;
        for (const [k, v] of b.keys) { total += v; uKeys.add(k); }
        for (const ip of b.ips.keys()) uIps.add(ip);
    }
    return { total, uniqueKeys: uKeys.size, uniqueIps: uIps.size };
}

module.exports = { track, topKeys, topIps, keysForIp, ipsForKey, totals };
