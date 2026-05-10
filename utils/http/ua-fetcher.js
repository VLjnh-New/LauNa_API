'use strict';

/**
 * ua-fetcher.js — Tự động fetch User-Agent mới nhất từ nhiều nguồn free,
 * merge vào BROWSERS pool của browser-headers.js, tự refresh mỗi 24h.
 *
 * Nguồn (không cần token):
 *  1. microlinkhq/top-user-agents  — 100 UA thực tế, luôn cập nhật qua CI
 *  2. jnrbsn/user-agents           — 16 UA real browser, tự động qua CI
 *  3. useragents.me                — crawl JSON nhúng, có % usage weight
 *  4. useragentstring.com/Chrome   — crawl ~800 UA Chrome, lọc ver mới
 *
 * Filter version tối thiểu: Chrome >= 110, Firefox >= 110, Safari >= 16
 */

const axios = require('axios');

const REFRESH_MS = 24 * 60 * 60 * 1000; // 24h

// Version tối thiểu chấp nhận (loại bỏ UA cổ)
const MIN_VER = { chrome: 110, edge: 110, firefox: 110, safari: 16 };

const UA_SOURCES = [
    // ── JSON trực tiếp ──────────────────────────────────────────────────────
    {
        name: 'microlinkhq',
        url:  'https://raw.githubusercontent.com/microlinkhq/top-user-agents/master/src/index.json',
        parse(data) {
            const arr = typeof data === 'string' ? JSON.parse(data) : data;
            return arr.filter(s => typeof s === 'string' && s.startsWith('Mozilla/'))
                      .map(ua => uaToEntry(ua, 'microlinkhq'));
        },
    },
    {
        name: 'jnrbsn',
        url:  'https://raw.githubusercontent.com/jnrbsn/user-agents/main/user-agents.json',
        parse(data) {
            const arr = typeof data === 'string' ? JSON.parse(data) : data;
            return arr.filter(s => typeof s === 'string' && s.startsWith('Mozilla/'))
                      .map(ua => uaToEntry(ua, 'jnrbsn'));
        },
    },
    // ── Crawl HTML — useragents.me ──────────────────────────────────────────
    {
        name: 'useragents.me',
        url:  'https://www.useragents.me/',
        parse(html) {
            const results = [];
            const re = /id="([^"]+)-useragents-json-csv"[\s\S]*?<textarea[^>]*>([\s\S]*?)<\/textarea>/gi;
            let m;
            while ((m = re.exec(html)) !== null) {
                const key = m[1];
                try {
                    const raw = m[2]
                        .replace(/&quot;/g, '"')
                        .replace(/&amp;/g, '&')
                        .replace(/&#39;/g, "'");
                    const arr = JSON.parse(raw);
                    for (const item of arr) {
                        if (!item.ua || !item.ua.startsWith('Mozilla/')) continue;
                        const entry = uaToEntry(item.ua, `useragents.me/${key}`);
                        entry._pct = parseFloat(item.pct) || 1;
                        results.push(entry);
                    }
                } catch { /* skip */ }
            }
            return results;
        },
    },
    // ── Crawl HTML — useragentstring.com Chrome list ────────────────────────
    {
        name: 'useragentstring.com',
        url:  'https://useragentstring.com/pages/Chrome/',
        parse(html) {
            const results = [];
            const re = /<a[^>]*href="\/\?uas=[^"]*"[^>]*>(Mozilla\/[^<]+)<\/a>/gi;
            let m;
            while ((m = re.exec(html)) !== null) {
                const ua = m[1].replace(/&amp;/g,'&').replace(/&#39;/g,"'").trim();
                if (ua.startsWith('Mozilla/')) results.push(uaToEntry(ua, 'useragentstring.com'));
            }
            return results;
        },
    },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectFamily(ua) {
    if (/Edg\//i.test(ua))     return 'edge';
    if (/Firefox\//i.test(ua)) return 'firefox';
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return 'safari';
    return 'chrome';
}

function detectPlatform(ua) {
    if (/Android/i.test(ua))             return 'Android';
    if (/iPhone|iPad/i.test(ua))         return 'iOS';
    if (/Macintosh|Mac OS X/i.test(ua))  return 'macOS';
    if (/Linux/i.test(ua))               return 'Linux';
    return 'Windows';
}

function detectVer(ua, family) {
    let m;
    if (family === 'firefox')                         m = /Firefox\/(\d+)/i.exec(ua);
    else if (family === 'edge')                       m = /Edg\/(\d+)/i.exec(ua);
    else if (family === 'safari' && !/Chrome/i.test(ua)) m = /Version\/(\d+)/i.exec(ua);
    else                                              m = /Chrome\/(\d+)/i.exec(ua);
    return m ? parseInt(m[1], 10) : 0;
}

function uaToEntry(ua, source) {
    const family   = detectFamily(ua);
    const platform = detectPlatform(ua);
    const ver      = detectVer(ua, family);
    const mobile   = /Mobile|Android/i.test(ua) && !/iPad/i.test(ua);
    return { family, ver, platform, mobile, ua, _source: source, _pct: 1 };
}

function isFreshEnough(entry) {
    const min = MIN_VER[entry.family] || 0;
    return entry.ver >= min;
}

// ── State ────────────────────────────────────────────────────────────────────

let _fetched   = [];
let _lastFetch = 0;
let _fetching  = false;

async function fetchOne(src) {
    if (src.skip) return [];
    try {
        const res = await axios.get(src.url, {
            timeout: 15000,
            responseType: 'text',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
        });
        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
        const entries = src.parse(body);
        return Array.isArray(entries) ? entries : [];
    } catch { return []; }
}

async function refresh() {
    if (_fetching) return;
    _fetching = true;
    try {
        const settled = await Promise.allSettled(UA_SOURCES.map(fetchOne));
        const all = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);

        // Lọc version cũ + dedup theo ua string
        const seen = new Set();
        _fetched = all.filter(e => {
            if (!e.ua || !isFreshEnough(e) || seen.has(e.ua)) return false;
            seen.add(e.ua);
            return true;
        });
        _lastFetch = Date.now();
    } catch { /* silent */ } finally { _fetching = false; }
}

// Khởi động fetch ngay, lặp mỗi giờ để kiểm tra (refresh thực sự mỗi 24h)
refresh();
setInterval(() => { if (Date.now() - _lastFetch >= REFRESH_MS) refresh(); }, 60 * 60 * 1000).unref();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Trả về toàn bộ UA entries đã fetch, fallback về hardcode nếu chưa sẵn sàng.
 */
function getEntries(fallback = []) {
    return _fetched.length > 0 ? _fetched : fallback;
}

/**
 * Pick 1 entry random, weighted theo _pct, filter family/mobile tùy chọn.
 */
function pickEntry(entries, { family, mobile } = {}) {
    let pool = entries;
    if (family)              pool = pool.filter(e => e.family === family);
    if (mobile !== undefined) pool = pool.filter(e => !!e.mobile === mobile);
    if (!pool.length) pool = entries;
    if (!pool.length) return null;

    const total = pool.reduce((s, e) => s + (e._pct || 1), 0);
    let r = Math.random() * total;
    for (const e of pool) { r -= (e._pct || 1); if (r <= 0) return e; }
    return pool[pool.length - 1];
}

/**
 * Thống kê nguồn đã fetch.
 */
function getStats() {
    const bySource = {};
    for (const e of _fetched) {
        const s = e._source || 'unknown';
        bySource[s] = (bySource[s] || 0) + 1;
    }
    return {
        total: _fetched.length,
        lastFetch: _lastFetch ? new Date(_lastFetch).toISOString() : null,
        fetching: _fetching,
        bySource,
    };
}

module.exports = { getEntries, pickEntry, getStats, refresh };
