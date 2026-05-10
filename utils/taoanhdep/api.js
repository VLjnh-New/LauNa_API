'use strict';

/**
 * Helper dùng chung cho các route gọi REST API trực tiếp của taoanhdep.com
 * (lam-dep, khoi-phuc-anh, net-anh-nguoi[-v2], doi-mat, ...).
 *
 * Tính năng:
 *  - POST multipart tới `https://api.taoanhdep.com/<slug>` (host chính)
 *  - Tự động retry & rotate IP qua proxyPool khi:
 *      • HTTP 429 / message "thử quá nhanh ... N giây" (rate-limit theo IP)
 *      • Lỗi mạng (ECONN, ETIMEDOUT, EAI_AGAIN, socket hang up, ...)
 *      • HTTP 5xx
 *  - Parse số giây trong message rate-limit để chờ chính xác
 *  - Thử thêm host origin `taoanhdep.com/public/<slug>.php` ở vòng cuối
 *    (cùng backend nhưng đôi khi qua đường khác có thể thoát rate-limit lát)
 *
 * Trả về: { image: dataUrl, format, raw } hoặc throw Error.
 */

const axios = require('axios');
const FormData = require('form-data');
const { proxyPool } = require('../http/proxy-pool');
const { sleep } = require('../http');
const { browserHeaders } = require('../http/browser-headers');

const ORIGIN = 'https://taoanhdep.com';

const ENDPOINT_REGISTRY = {
    'lam-dep':         { referer: 'https://taoanhdep.com/lam-dep-anh-xoa-mun-sang-da-bang-ai/', defaultField: 'image' },
    'khoi-phuc-anh':   { referer: 'https://taoanhdep.com/khoi-phuc-anh-bi-nhoe-mo-bang-ai/',  defaultField: 'file'  },
    'net-anh-nguoi':   { referer: 'https://taoanhdep.com/lam-net-anh-bang-ai/',                defaultField: 'file'  },
    'net-anh-nguoi-v2':{ referer: 'https://taoanhdep.com/lam-net-anh-bang-ai/',                defaultField: 'file'  },
    'doi-mat':         { referer: 'https://taoanhdep.com/thay-doi-khuon-mat-bang-ai/',         defaultField: 'image' },
};

function buildHeaders(referer, fdHeaders) {
    return {
        ...browserHeaders({ referer, origin: ORIGIN, purpose: 'cors' }),
        ...fdHeaders,
        'X-Client-URL': referer,
    };
}

function parseRateLimitSec(msg) {
    if (!msg) return 0;
    const m = String(msg).match(/(\d+)\s*giây/);
    return m ? Math.min(parseInt(m[1], 10) + 1, 30) : 0;
}

function isRateLimit(status, msg) {
    if (status === 429) return true;
    if (!msg) return false;
    return /thử quá nhanh|rate.?limit|too many|429/i.test(msg);
}

function isNetworkError(err) {
    const code = err?.code || '';
    if (/ECONN|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNRESET/.test(code)) return true;
    if (/socket hang up|network|timeout/i.test(err?.message || '')) return true;
    return false;
}

function extractImage(json) {
    if (!json || typeof json !== 'object') return null;
    // api.taoanhdep.com/<slug> shape
    if (json.result?.image) {
        return { image: json.result.image, format: json.result.format || 'jpeg', raw: json };
    }
    if (typeof json.result === 'string' && json.result.length > 100) {
        return { image: json.result, format: 'jpeg', raw: json };
    }
    // taoanhdep.com/public/<slug>.php shape
    if (json.image && typeof json.image === 'string' && json.image.length > 100) {
        return { image: json.image, format: 'jpeg', raw: json };
    }
    if (json.images && Array.isArray(json.images) && json.images[0]) {
        return { image: json.images[0], format: 'jpeg', raw: json };
    }
    return null;
}

function extractError(json, status) {
    if (!json || typeof json !== 'object') return `HTTP ${status}`;
    return json.message || json.error || json.detail || `HTTP ${status}`;
}

/**
 * Gọi 1 endpoint REST của taoanhdep.
 * @param {string} slug          - 'lam-dep' | 'khoi-phuc-anh' | 'net-anh-nguoi' | 'net-anh-nguoi-v2' | 'doi-mat' | (custom)
 * @param {object} fields        - { fieldName: { buf, ext, contentType } | string | number, ... }
 * @param {object} [opts]
 * @param {string} [opts.referer]    - override referer
 * @param {number} [opts.timeout]    - per-request timeout (default 120000)
 * @param {number} [opts.maxAttempts]- tổng số lần thử (default 5)
 * @param {boolean}[opts.tryOrigin]  - cuối cùng thử thêm `taoanhdep.com/public/<slug>.php` (default true)
 */
async function call(slug, fields, opts = {}) {
    const reg = ENDPOINT_REGISTRY[slug] || {};
    const referer = opts.referer || reg.referer || 'https://taoanhdep.com/';
    const timeout = opts.timeout || 120_000;
    const maxAttempts = opts.maxAttempts || 5;
    const tryOrigin = opts.tryOrigin !== false;

    const apiUrl = `https://api.taoanhdep.com/${slug}`;
    const originUrl = `https://taoanhdep.com/public/${slug}.php`;

    let lastError = 'Lỗi không xác định';
    let lastStatus = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Rotate target URL: lần cuối thử origin host nếu được phép
        const url = (attempt === maxAttempts && tryOrigin) ? originUrl : apiUrl;

        // Tier:
        //   attempt 1 → direct (Replit IP)
        //   attempt 2+ → qua proxyPool (rotate IP) để né rate-limit theo IP
        const useProxy = attempt >= 2;

        // Build fresh FormData mỗi attempt (không tái sử dụng được)
        const fd = new FormData();
        for (const [name, val] of Object.entries(fields)) {
            if (val && typeof val === 'object' && Buffer.isBuffer(val.buf)) {
                fd.append(name, val.buf, {
                    filename: val.filename || `image.${val.ext || 'jpg'}`,
                    contentType: val.contentType || 'image/jpeg'
                });
            } else if (val !== undefined && val !== null) {
                fd.append(name, String(val));
            }
        }

        const headers = buildHeaders(referer, fd.getHeaders());
        const config = { method: 'post', url, data: fd, headers, timeout, maxBodyLength: Infinity, validateStatus: () => true };

        let r;
        try {
            r = useProxy ? await proxyPool.axios(config) : await axios(config);
        } catch (err) {
            lastError = err.message || String(err);
            if (attempt < maxAttempts && isNetworkError(err)) { await sleep(1000 * attempt); continue; }
            if (attempt < maxAttempts) { await sleep(1500); continue; }
            break;
        }

        lastStatus = r.status;
        const body = r.data;
        const json = (typeof body === 'object' && body !== null) ? body : null;

        const ok = extractImage(json);
        if (ok) return ok;

        const errMsg = extractError(json, r.status);
        lastError = errMsg;

        if (isRateLimit(r.status, errMsg)) {
            const waitSec = parseRateLimitSec(errMsg) || (3 * attempt);
            // proxy rotation đã được dùng; chỉ ngủ ngắn rồi rotate IP khác
            if (attempt < maxAttempts) { await sleep(Math.min(waitSec, 5) * 1000); continue; }
            break;
        }

        if (r.status >= 500 || /kết nối|connection/i.test(errMsg)) {
            if (attempt < maxAttempts) { await sleep(2000 * attempt); continue; }
            break;
        }

        // Lỗi business logic (input invalid, ...) — không retry
        break;
    }

    const e = new Error(lastError);
    e.status = lastStatus;
    throw e;
}

module.exports = { call, ENDPOINT_REGISTRY, parseRateLimitSec, isRateLimit };
