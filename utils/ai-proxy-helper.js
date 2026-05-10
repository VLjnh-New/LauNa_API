'use strict';

/**
 * Helper dùng chung cho các route AI:
 *  - Lấy IP client (ưu tiên header proxy-aware).
 *  - Tự bật proxy nếu IP người dùng đã từng bị upstream chặn.
 *  - Nhận diện lỗi "block" từ upstream để mark IP vào auto_proxy_clients.
 */

const proxyStore = require('./data/proxy-store');

function clientIp(req) {
    try {
        const cf = req.headers['cf-connecting-ip'];
        if (cf) return String(cf).trim();
        const xff = req.headers['x-forwarded-for'];
        if (xff) {
            const first = String(xff).split(',')[0].trim();
            if (first) return first;
        }
        const real = req.headers['x-real-ip'];
        if (real) return String(real).trim();
        return req.ip || '';
    } catch { return ''; }
}

async function shouldUseProxy(req, explicit = false) {
    if (explicit) return true;
    const ip = clientIp(req);
    if (!ip) return false;
    try { return await proxyStore.isAutoProxy(ip); } catch { return false; }
}

const BLOCK_PATTERNS = [
    /\b(403|418|429|451|502|503|504|520|521|522|523)\b/i,
    /forbidden|blocked|denied|rate.?limit|too\s+many\s+requests|captcha|cloudflare|ban(ned)?/i,
    /ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNREFUSED/i,
];

function looksLikeBlock(err) {
    if (!err) return false;
    const msg = String(err.message || err.toString());
    const status = err.response?.status || err.status;
    if ([403, 418, 429, 451, 502, 503, 504, 520, 521, 522, 523].includes(status)) return true;
    return BLOCK_PATTERNS.some(re => re.test(msg));
}

async function noteBlocked(req, err, route = 'ai') {
    if (!looksLikeBlock(err)) return false;
    const ip = clientIp(req);
    if (!ip) return false;
    try {
        await proxyStore.markBlocked(ip, `${route}: ${String(err.message || err).slice(0, 160)}`);
        return true;
    } catch { return false; }
}

/**
 * Trả về tier-order phù hợp để truyền cho `runSpace({ tiers })`.
 * - useProxy = true  → ưu tiên đi qua proxy pool & taoanhdep (skip 'direct')
 * - useProxy = false → để mặc định (runSpace tự dùng DEFAULT_TIERS)
 */
function tiersFor(useProxy) {
    return useProxy ? ['hf-pool', 'taoanhdep', 'direct'] : undefined;
}

/**
 * Trả về hàm thực thi axios — qua proxy pool nếu useProxy bật & pool sẵn sàng.
 * Cách dùng: const ax = axiosFor(useProxy); const r = await ax(config);
 */
function axiosFor(useProxy) {
    const axios = require('axios');
    if (useProxy && global.proxyPool) {
        return (cfg) => global.proxyPool.axios(cfg);
    }
    return (cfg) => axios(cfg);
}

/**
 * Đọc cờ proxy "explicit" từ query/body: ?proxy=1 / proxy=true / { proxy: true }
 */
function explicitProxyFlag(req) {
    const q = req?.query || {};
    const b = req?.body  || {};
    return q.proxy === '1' || q.proxy === 'true' || b.proxy === true || b.proxy === '1' || b.proxy === 'true';
}

module.exports = {
    clientIp,
    shouldUseProxy,
    noteBlocked,
    looksLikeBlock,
    tiersFor,
    axiosFor,
    explicitProxyFlag,
};
