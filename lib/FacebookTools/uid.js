'use strict';

/**
 * /fb-uid — Convert Facebook URL/username → UID.
 *
 * Cách dùng:
 *   /fb-uid?url=https://facebook.com/zuck
 *   /fb-uid?url=fb.com/MarkZuckerberg
 *   /fb-uid?url=facebook.com/profile.php?id=4   (đã là UID, parse thẳng)
 *
 * Hỗ trợ: profile cá nhân, page, group (link công khai).
 * Phương pháp: scrape HTML public, regex tìm nhiều pattern (entity_id, userID, pageID, profile_id).
 */

const axios = require('axios');
const { LRUCache } = require('lru-cache');

const { randomUA } = require('../../utils/http/browser-headers');
const cache = new LRUCache({ max: 1000, ttl: 12 * 60 * 60 * 1000 });

// Pattern + match group; loại bỏ uid = "0" (actorID anonymous của FB)
const UID_PATTERNS = [
    /\/profile\.php\?id=(\d+)/,
    /"userID":"(\d+)"/,
    /"pageID":"(\d+)"/,
    /"entity_id":"(\d+)"/,
    /"profile_id":(\d+)/,
    /fb:\/\/profile\/(\d+)/,
    /content="fb:\/\/profile\/(\d+)"/,
    /"groupID":"(\d+)"/,
    /content="fb:\/\/group\/(\d+)"/,
    /"actorID":"(\d+)"/
];

function normalizeUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try {
        const u = new URL(s);
        if (!/(facebook\.com|fb\.com|fb\.me|m\.facebook\.com)$/i.test(u.hostname)) return null;
        u.hostname = 'www.facebook.com';
        return u.toString();
    } catch { return null; }
}

async function resolveUid(url) {
    const direct = url.match(/[?&]id=(\d+)/);
    if (direct) return { uid: direct[1], method: 'direct-id-param' };

    const r = await axios.get(url, {
        headers: {
            'User-Agent': randomUA(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: () => true
    });

    if (r.status >= 400) throw new Error(`Facebook trả HTTP ${r.status}`);
    const html = String(r.data || '');

    for (const pat of UID_PATTERNS) {
        const m = html.match(pat);
        if (m && m[1] && m[1] !== '0') return { uid: m[1], method: pat.source };
    }
    return null;
}

module.exports = {
    name: '/fb-uid',
    index: async (req, res) => {
        const raw = (req.query.url || req.query.link || '').toString().trim();
        if (!raw) {
            return res.status(400).json({ status: false, message: "Thiếu 'url'.", example: '/fb-uid?url=https://facebook.com/zuck' });
        }

        const url = normalizeUrl(raw);
        if (!url) {
            return res.status(400).json({ status: false, message: 'URL không phải facebook.com / fb.com.' });
        }

        const cached = cache.get(url);
        if (cached) return res.json({ ...cached, cached: true });

        try {
            const found = await resolveUid(url);
            if (!found) {
                return res.status(404).json({ status: false, message: 'Không trích được UID. Profile có thể private hoặc Facebook đã chặn.', urlChecked: url });
            }
            const out = { status: true, uid: found.uid, url, method: found.method };
            cache.set(url, out);
            return res.json(out);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[FB-UID] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tra cứu UID Facebook' });
        }
    }
};
