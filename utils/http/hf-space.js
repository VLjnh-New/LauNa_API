'use strict';

/**
 * Helper dùng chung cho các route gọi HuggingFace Space (Gradio).
 * - upload ảnh → join queue → SSE → trả kết quả
 * - tự fallback qua proxy taoanhdep khi gọi thẳng HF lỗi mạng / GPU / 5xx
 *
 * Dùng cho tất cả các route gói Space tuan2308 trong dự án.
 */

const axios   = require('axios');
const FormData = require('form-data');
const https   = require('https');
const { proxyPool } = require('./proxy-pool');
const { browserHeaders } = require('./browser-headers');

const DEFAULT_REFERER = 'https://taoanhdep.com/';
const DEFAULT_ORIGIN  = 'https://taoanhdep.com';

function randomHash() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function detectMime(buf) {
    if (!buf || buf.length < 12) return { ext: 'jpg', ct: 'image/jpeg' };
    const h = buf.slice(0, 12);
    if (h[0] === 0xFF && h[1] === 0xD8) return { ext: 'jpg',  ct: 'image/jpeg' };
    if (h[0] === 0x89 && h[1] === 0x50) return { ext: 'png',  ct: 'image/png'  };
    if (h.slice(0, 4).toString() === 'RIFF' && h.slice(8, 12).toString() === 'WEBP')
        return { ext: 'webp', ct: 'image/webp' };
    if (h[0] === 0x47 && h[1] === 0x49) return { ext: 'gif',  ct: 'image/gif'  };
    return { ext: 'jpg', ct: 'image/jpeg' };
}

function fileData(base, filePath, fileSize, ct, origName) {
    return {
        path: filePath,
        url: base + filePath,
        orig_name: origName || 'image.jpg',
        size: fileSize || null,
        mime_type: ct || 'image/jpeg',
        meta: { _type: 'gradio.FileData' }
    };
}

/* ── transport selection ─────────────────────────────────────────────────
 *   'direct'    : axios thẳng tới HF.space (dùng IP của container Replit)
 *   'hf-pool'   : axios tới HF.space qua proxyPool (rotate IP public, tránh HF GPU quota)
 *   'taoanhdep' : axios tới taoanhdep.com proxy (proxy "chính chủ", có rate-limit 60s/window)
 */

function pickFn(transport) {
    return transport === 'direct' ? (o => axios(o)) : (o => proxyPool.axios(o));
}

async function uploadImage({ base, referer = DEFAULT_REFERER, imgBuf, ext, ct, transport = 'direct', timeout = 25_000, gradioPrefix = 'gradio_api/' }) {
    const fd = new FormData();
    fd.append('files', imgBuf, { filename: `image.${ext || 'jpg'}`, contentType: ct || 'image/jpeg' });

    const uploadUrl = transport === 'taoanhdep'
        ? `https://api.taoanhdep.com/uploads-v2?apiu=${encodeURIComponent(base)}`
        : `${base}${gradioPrefix}upload?upload_id=${randomHash().slice(0, 12)}`;

    const headers = {
        ...browserHeaders({ referer, origin: DEFAULT_ORIGIN, purpose: 'cors' }),
        ...fd.getHeaders()
    };
    if (transport === 'taoanhdep') headers['X-Client-URL'] = referer;

    const r = await pickFn(transport)({
        method: 'post', url: uploadUrl, data: fd, headers,
        timeout, maxBodyLength: Infinity, validateStatus: () => true
    });

    if (r.status === 429) {
        const retry = +(r.headers?.['retry-after']) || 0;
        const e = new Error(`Upload HTTP 429`); e.status = 429; e.retryAfter = retry;
        throw e;
    }
    if (r.status >= 400) throw new Error(`Upload HTTP ${r.status}`);
    const raw = r.data;
    const arr = Array.isArray(raw) ? raw : (raw?.result && Array.isArray(raw.result) ? raw.result : null);
    if (!arr || !arr[0]) throw new Error('Upload ảnh thất bại (response không hợp lệ)');
    return arr[0];
}

async function joinQueue({ base, referer = DEFAULT_REFERER, body, transport = 'direct', timeout = 60_000, gradioPrefix = 'gradio_api/' }) {
    const queueUrl = transport === 'taoanhdep'
        ? `https://taoanhdep.com/public/proxy-ai/join-v2.php?apiu=${encodeURIComponent(base)}`
        : `${base}${gradioPrefix}queue/join?__theme=systemt`;

    const headers = {
        ...browserHeaders({ referer, origin: DEFAULT_ORIGIN, purpose: 'cors' }),
        'Content-Type': 'application/json'
    };
    if (transport === 'taoanhdep') headers['X-Client-URL'] = referer;

    const r = await pickFn(transport)({
        method: 'post', url: queueUrl, data: JSON.stringify(body), headers,
        timeout, validateStatus: () => true
    });

    if (r.status === 429) {
        const retry = +(r.headers?.['retry-after']) || 0;
        const e = new Error(`Queue HTTP 429`); e.status = 429; e.retryAfter = retry;
        throw e;
    }
    if (r.status >= 400) throw new Error(`Queue HTTP ${r.status}`);
    const data = r.data;
    const result = data?.result || data;
    // taoanhdep rate-limit message → cũng coi là 429
    if (result?.error === 'rate_limit_minute' || /thử quá nhanh/i.test(result?.message || '')) {
        const m = /(\d+)\s*giây/i.exec(result?.message || '');
        const e = new Error(`HTTP 429 ${result.message || 'rate_limit_minute'}`);
        e.status = 429; e.retryAfter = m ? +m[1] : 0;
        throw e;
    }
    const eventId = result?.event_id;
    if (!eventId) {
        const snippet = JSON.stringify(data).slice(0, 200);
        throw new Error(`Không nhận được event_id (${snippet})`);
    }
    return eventId;
}

/* ── SSE listener với extractor tuỳ chỉnh ─────────────────────────────── */

function listenSSE({ base, referer = DEFAULT_REFERER, sessionHash, timeoutMs = 300_000, gradioPrefix = 'gradio_api/' }) {
    return new Promise((resolve, reject) => {
        const sseUrl = `${base}${gradioPrefix}queue/data?session_hash=${sessionHash}`;
        const urlObj = new URL(sseUrl);
        let settled = false;
        const done = (fn, arg) => {
            if (settled) return;
            settled = true;
            try { fn(arg); } catch {}
        };

        const req = https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: browserHeaders({ referer, origin: DEFAULT_ORIGIN, purpose: 'sse' })
        }, (res) => {
            if (res.statusCode !== 200) return done(reject, new Error(`SSE HTTP ${res.statusCode}`));
            let buf = '';
            res.on('data', chunk => {
                buf += chunk.toString();
                const parts = buf.split('\n\n');
                buf = parts.pop();
                for (const part of parts) {
                    const line = part.split('\n').find(l => l.startsWith('data:'));
                    if (!line) continue;
                    let json;
                    try { json = JSON.parse(line.slice(5).trim()); } catch { continue; }

                    if (json.msg === 'process_completed') {
                        const err = json.output?.error;
                        if (err) {
                            res.destroy();
                            return done(reject, new Error(String(err)));
                        }
                        res.destroy();
                        return done(resolve, json.output?.data || []);
                    }
                    if (json.msg === 'unexpected_error') {
                        res.destroy();
                        return done(reject, new Error(json.message || 'unexpected_error'));
                    }
                }
            });
            res.on('end',   () => done(reject, new Error('SSE kết thúc không có kết quả')));
            res.on('error', e  => done(reject, e));
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); done(reject, new Error('Timeout chờ xử lý')); });
        req.on('error', e => done(reject, e));
    });
}

/* ── orchestrator ─────────────────────────────────────────────────────── */

const RETRYABLE = /GPU|quota|exceed|timeout|ECONN|ETIMEDOUT|EAI_AGAIN|HTTP 5\d\d|HTTP 429|cURL|SSE HTTP|socket hang up|rate_limit|thử quá nhanh/i;
const DEFAULT_TIERS = ['direct', 'hf-pool', 'taoanhdep'];

/* ── cooldown tracker per (transport, base) ─────────────────────────────
 *  Khi 1 tier bị 429 → ghi nhớ "tier này đang bị giới hạn cho base X
 *  đến thời điểm Y", các request sau đó sẽ skip thẳng tier này cho đến
 *  khi Y trôi qua. Sau cooldown sẽ tự thử lại tier ưu tiên cao (direct).
 */
const cooldownMap = new Map();   // key = `${transport}|${base}` → expiresAtMs
const DEFAULT_COOLDOWN_MS = 60_000;   // 60s cho HF
const TAOANHDEP_COOLDOWN_MS = 65_000; // taoanhdep nói 60s, để dư 5s

function cooldownKey(transport, base) { return `${transport}|${base}`; }
function isOnCooldown(transport, base) {
    const exp = cooldownMap.get(cooldownKey(transport, base));
    if (!exp) return false;
    if (Date.now() >= exp) { cooldownMap.delete(cooldownKey(transport, base)); return false; }
    return true;
}
function setCooldown(transport, base, retryAfterSec) {
    const baseMs = transport === 'taoanhdep' ? TAOANHDEP_COOLDOWN_MS : DEFAULT_COOLDOWN_MS;
    const ms = retryAfterSec ? Math.max(retryAfterSec * 1000, 5_000) : baseMs;
    cooldownMap.set(cooldownKey(transport, base), Date.now() + ms);
}
function getCooldownStatus() {
    const now = Date.now();
    const out = [];
    for (const [k, exp] of cooldownMap) {
        if (exp <= now) cooldownMap.delete(k);
        else {
            const [transport, base] = k.split('|');
            out.push({ transport, base, secondsLeft: Math.ceil((exp - now) / 1000) });
        }
    }
    return out;
}

/**
 * Gọi 1 endpoint Space, tự fallback qua 3 tier:
 *   1. direct      — Replit IP gọi thẳng HF
 *   2. hf-pool     — proxyPool (rotate IP) gọi thẳng HF (bypass HF GPU quota)
 *   3. taoanhdep   — qua taoanhdep proxy ("chính chủ", có rate-limit 60s)
 *
 * @param {object} opts
 *   base, referer, fnIndex, triggerId
 *   image?: { buf, ext, ct }
 *   data? | buildData?: (meta) => array
 *   sseTimeoutMs? (default 300000)
 *   tiers? (default ['direct', 'hf-pool', 'taoanhdep'])
 */
async function runSpace(opts) {
    const {
        base, referer = DEFAULT_REFERER,
        fnIndex, triggerId,
        image, data, buildData,
        sseTimeoutMs = 300_000,
        tiers = DEFAULT_TIERS,
        gradioPrefix = 'gradio_api/'
    } = opts;

    let lastError;
    // Lọc bỏ tier đang trong cooldown 429 cho base này (skip thẳng, không tốn 1 lượt thử)
    const activeTiers = tiers.filter(t => !isOnCooldown(t, base));
    const tryOrder = activeTiers.length ? activeTiers : tiers;

    for (const transport of tryOrder) {
        try {
            const sessionHash = randomHash();
            let payloadData;

            if (image) {
                if (typeof buildData !== 'function') throw new Error('Thiếu buildData khi truyền image');
                const filePath = await uploadImage({ base, referer, imgBuf: image.buf, ext: image.ext, ct: image.ct, transport, gradioPrefix });
                const meta = fileData(base, filePath, image.buf.length, image.ct, image.origName);
                payloadData = buildData(meta);
            } else if (Array.isArray(data)) {
                payloadData = data;
            } else if (typeof buildData === 'function') {
                payloadData = buildData(null);
            } else {
                throw new Error('Thiếu data hoặc buildData');
            }

            const body = {
                data: payloadData,
                event_data: null,
                fn_index: fnIndex,
                trigger_id: triggerId,
                session_hash: sessionHash
            };

            await joinQueue({ base, referer, body, transport, gradioPrefix });
            const out = await listenSSE({ base, referer, sessionHash, timeoutMs: sseTimeoutMs, gradioPrefix });
            const _tier = transport === 'direct' ? 'primary'
                       : transport === 'taoanhdep' ? 'backup'
                       : transport === 'hf-pool' ? 'pool' : 'primary';
            return { data: out, transport: _tier, viaProxy: transport !== 'direct' };
        } catch (e) {
            lastError = e;
            const msg = String(e?.message || '');
            // Nếu là 429 → ghi cooldown cho tier này, lần sau skip
            if (e?.status === 429 || /HTTP 429|rate_limit|thử quá nhanh/i.test(msg)) {
                setCooldown(transport, base, e?.retryAfter);
            }
            if (!RETRYABLE.test(msg)) break;
        }
    }
    throw lastError || new Error('Không thể xử lý');
}

module.exports = { runSpace, uploadImage, joinQueue, listenSSE, randomHash, detectMime, fileData, getCooldownStatus };
