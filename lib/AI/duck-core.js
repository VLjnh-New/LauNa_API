'use strict';

/**
 * duck-core.js — Shared engine cho duck.ai / duckduckgo.com
 *
 * Tính năng:
 *  - UA rotation: random UA mỗi request (100+ browser pool)
 *  - Proxy rotation: load từ env DUCK_PROXIES (comma-separated HTTP/HTTPS proxy URLs)
 *    → DUCK_PROXIES=http://user:pass@host:port,http://host2:port2
 *    → Cần residential proxy để bypass ERR_BN_LIMIT (datacenter IP bị chặn image gen)
 *  - 2-domain config: duckduckgo.com + duck.ai (cùng backend, cùng rate-limit pool theo IP)
 *    → Chỉ hữu ích khi kết hợp với proxy khác nhau cho mỗi domain
 *  - Per-slot queue + cooldown: mỗi (domain × proxy) slot có queue riêng
 *  - fe-version cache: 6h
 *  - VQD challenge solver: JSDOM sandbox
 *
 * Giới hạn thực tế (không có proxy):
 *  - Chat: ~không giới hạn (IP datacenter OK)
 *  - Image gen: ~5 ảnh/burst → ERR_BN_LIMIT → cần chờ ~90s hoặc dùng residential proxy
 */

const { createHash, webcrypto } = require('crypto');
const { v4: uuidv4 }            = require('uuid');
const { JSDOM }                 = require('jsdom');
const vm                        = require('vm');
const { fetch, ProxyAgent }     = require('undici');
const { randomUA }              = require('../../utils/http/browser-headers');

// ─── Domain configs ───────────────────────────────────────────────────────────
const DOMAIN_CONFIGS = [
    {
        id:       'ddg',
        base:     'https://duckduckgo.com',
        origin:   'https://duckduckgo.com',
        referer:  'https://duckduckgo.com/',
        homeUrl:  'https://duck.ai/',          // lấy fe-version từ duck.ai (cùng 1 app)
    },
    {
        id:       'duckai',
        base:     'https://duck.ai',
        origin:   'https://duck.ai',
        referer:  'https://duck.ai/',
        homeUrl:  'https://duck.ai/',
    },
];

// ─── fe-version cache (per-domain, TTL 6h) ────────────────────────────────────
const _feVerCache = {};
async function getFeVersion(domain) {
    const key = domain.id;
    const now = Date.now();
    if (_feVerCache[key] && now - _feVerCache[key].at < 6 * 3600 * 1000) return _feVerCache[key].v;
    try {
        const r = await fetch(domain.homeUrl, {
            headers: { 'User-Agent': randomUA() },
            signal: AbortSignal.timeout(8000),
        });
        const html = await r.text();
        const tagM = html.match(/data-version-tag="([^"]+)"/);
        const shaM = html.match(/data-version-sha="([^"]+)"/);
        if (tagM && shaM) _feVerCache[key] = { v: `${tagM[1]}-${shaM[1]}`, at: now };
    } catch {}
    return (_feVerCache[key] && _feVerCache[key].v) || 'dev-hash';
}

// ─── RSA-2048 public key cho durableStream ─────────────────────────────────────
async function genPublicKeyJwk() {
    const { publicKey } = await webcrypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['encrypt', 'decrypt']
    );
    const jwk = await webcrypto.subtle.exportKey('jwk', publicKey);
    jwk.use = 'enc';
    return jwk;
}

// ─── x-fe-signals ─────────────────────────────────────────────────────────────
function buildFeSignals() {
    const now = Date.now();
    return Buffer.from(JSON.stringify({
        start: now - 5000 - Math.floor(Math.random() * 3000),
        events: [
            { name: 'onboarding_impression', delta: 20 + Math.floor(Math.random() * 30) },
            { name: 'onboarding_finish',     delta: 1800 + Math.floor(Math.random() * 800) },
            { name: 'startNewChat_free',     delta: 1810 + Math.floor(Math.random() * 800) },
        ],
        end: now,
    })).toString('base64');
}

// ─── Build request headers cho mỗi request ─────────────────────────────────────
function buildHeaders(domain, feVersion, extra = {}) {
    const ua = randomUA();
    return {
        'User-Agent':        ua,
        'Accept-Language':   'en-US,en;q=0.9',
        'Accept-Encoding':   'gzip, deflate, br',
        'Origin':            domain.origin,
        'Referer':           domain.referer,
        'Cache-Control':     'no-cache',
        'Pragma':            'no-cache',
        'sec-ch-ua':         '"Google Chrome";v="135", "Chromium";v="135", "Not-A.Brand";v="8"',
        'sec-ch-ua-mobile':  '?0',
        'sec-ch-ua-platform':'"Windows"',
        'sec-fetch-dest':    'empty',
        'sec-fetch-mode':    'cors',
        'sec-fetch-site':    domain.id === 'ddg' ? 'same-origin' : 'same-origin',
        'x-fe-version':      feVersion,
        ...extra,
    };
}

// ─── VQD challenge solver ──────────────────────────────────────────────────────
async function solveVqd(domain, dispatcher, feVersion, retries = 3) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const fetchOpts = {
                headers: {
                    ...buildHeaders(domain, feVersion),
                    'accept':       'application/json',
                    'x-vqd-accept': '1',
                },
                signal: AbortSignal.timeout(12000),
            };
            if (dispatcher) fetchOpts.dispatcher = dispatcher;

            const res = await fetch(`${domain.base}/duckchat/v1/status`, fetchOpts);
            if (!res.ok) throw new Error(`VQD HTTP ${res.status}`);

            const b64 = res.headers.get('x-vqd-hash-1');
            if (!b64) throw new Error('No x-vqd-hash-1');

            // Thử parse JSON trực tiếp
            try {
                const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
                if (parsed?.server_hashes) return b64;
            } catch {}

            // Execute JS sandbox
            const challengeJS = Buffer.from(b64, 'base64').toString('utf8');
            const dom = new JSDOM('', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' });
            const win = dom.window;
            win.document.querySelector = () => ({
                contentDocument: { querySelector: () => ({ getAttribute: () => null }) },
                contentWindow: { document: null, self: null },
                getAttribute: () => null,
            });
            const origCreate = win.document.createElement.bind(win.document);
            win.document.createElement = (tag, ...rest) => {
                const el = origCreate(tag, ...rest);
                if (tag.toLowerCase() === 'iframe') {
                    try { Object.defineProperty(el, 'contentWindow',   { get: () => ({ self: null }), configurable: true }); } catch {}
                    try { Object.defineProperty(el, 'contentDocument', { get: () => null,             configurable: true }); } catch {}
                }
                return el;
            };
            win.TextEncoder = TextEncoder;
            win.TextDecoder = TextDecoder;
            try { Object.defineProperty(win, 'crypto', { value: webcrypto, configurable: true, writable: true }); } catch {}
            const ctx = vm.createContext(win);
            let result = vm.runInContext(challengeJS, ctx);
            if (result?.then) result = await result;
            if (!result?.client_hashes) throw new Error('Invalid challenge result');
            const final = {
                ...result,
                client_hashes: result.client_hashes.map(c => createHash('sha256').update(c).digest('base64')),
            };
            return Buffer.from(JSON.stringify(final)).toString('base64');
        } catch (e) {
            lastErr = e;
            if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    throw lastErr;
}

// ─── Slot system: (domain × proxy) ────────────────────────────────────────────
function loadProxies() {
    return (process.env.DUCK_PROXIES || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
}

function buildSlots() {
    const proxyUrls = loadProxies();
    const proxies = proxyUrls.length ? proxyUrls : [null];
    const slots = [];
    for (const domain of DOMAIN_CONFIGS) {
        for (const proxyUrl of proxies) {
            let dispatcher = null;
            if (proxyUrl) {
                try { dispatcher = new ProxyAgent(proxyUrl); } catch {}
            }
            slots.push({
                domain,
                proxyUrl,
                dispatcher,
                coolUntil: 0,
                queue: Promise.resolve(),
            });
        }
    }
    return slots;
}

const slots = buildSlots();
let _slotIdx = 0;

function getNextSlot() {
    const now = Date.now();
    for (let i = 0; i < slots.length; i++) {
        const idx = (_slotIdx + i) % slots.length;
        if (slots[idx].coolUntil <= now) {
            _slotIdx = (idx + 1) % slots.length;
            return slots[idx];
        }
    }
    // Tất cả đang cooldown → lấy slot hết hạn sớm nhất
    const best = slots.reduce((a, b) => a.coolUntil < b.coolUntil ? a : b);
    return best;
}

function coolSlot(slot, ms = 60000) {
    slot.coolUntil = Date.now() + ms;
}

function enqueueSlot(slot, fn) {
    const next = slot.queue.then(() => fn());
    slot.queue = next.catch(() => {});
    return next;
}

// ─── Core fetch wrapper ────────────────────────────────────────────────────────
//   Retry tự động qua các slot khi gặp rate-limit / block
async function duckFetch({ path, body, extraHeaders = {}, retries = slots.length + 2 }) {
    let lastErr;
    const tried = new Set();

    for (let attempt = 0; attempt < retries; attempt++) {
        const slot = getNextSlot();
        const slotKey = `${slot.domain.id}:${slot.proxyUrl}`;

        // Nếu đã thử slot này rồi mà vẫn còn lần retry → chờ cooldown
        if (tried.has(slotKey) && attempt < slots.length) {
            await new Promise(r => setTimeout(r, 500));
        }
        tried.add(slotKey);

        try {
            const result = await enqueueSlot(slot, async () => {
                const feVersion = await getFeVersion(slot.domain);
                const vqd = await solveVqd(slot.domain, slot.dispatcher, feVersion);
                await new Promise(r => setTimeout(r, 300 + Math.random() * 400)); // nhỏ delay

                const publicKey = await genPublicKeyJwk();
                const fetchOpts = {
                    method:  'POST',
                    headers: {
                        ...buildHeaders(slot.domain, feVersion),
                        'Content-Type': 'application/json',
                        'accept':       'text/event-stream',
                        'X-Vqd-Hash-1': vqd,
                        'x-fe-signals': buildFeSignals(),
                        ...extraHeaders,
                    },
                    body: JSON.stringify({ ...body, durableStream: { messageId: uuidv4(), conversationId: uuidv4(), publicKey } }),
                    signal: AbortSignal.timeout(60000),
                };
                if (slot.dispatcher) fetchOpts.dispatcher = slot.dispatcher;

                const res = await fetch(`${slot.domain.base}${path}`, fetchOpts);

                if (!res.ok) {
                    const errBody = await res.text().catch(() => '');
                    let errType = '';
                    try { errType = JSON.parse(errBody).type || ''; } catch {}

                    if (res.status === 429) {
                        coolSlot(slot, 90000); // 90s cooldown
                        throw Object.assign(new Error('RATE_LIMIT'), { retryable: true });
                    }
                    if (res.status === 418) {
                        if (errType === 'ERR_BN_LIMIT') {
                            coolSlot(slot, 300000); // 5m cooldown cho BN_LIMIT
                            throw Object.assign(new Error('BN_LIMIT'), { retryable: true });
                        }
                        coolSlot(slot, 30000);
                        throw Object.assign(new Error('CHALLENGE'), { retryable: true });
                    }
                    if (res.status === 404) {
                        if (errType === 'ERR_MODEL_RESTRICTED')  throw new Error(`Model yêu cầu DuckDuckGo Pro.`);
                        if (errType === 'ERR_MODEL_UNAVAILABLE') throw new Error(`Model hiện không khả dụng.`);
                    }
                    throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 100)}`);
                }

                return await res.text();
            });

            return result;
        } catch (e) {
            lastErr = e;
            if (!e.retryable) throw e;
            // Retryable: thử slot tiếp theo
            if (attempt < retries - 1) await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Tất cả slots đều thất bại
    if (lastErr?.message === 'RATE_LIMIT') throw new Error('Duck.ai đang bị rate-limit trên tất cả endpoints. Thử lại sau.');
    if (lastErr?.message === 'BN_LIMIT')   throw new Error('Duck.ai chặn IP server (ERR_BN_LIMIT). Cần proxy residential.');
    throw lastErr || new Error('Duck.ai không phản hồi.');
}

// ─── Slot status (debug) ───────────────────────────────────────────────────────
function slotStatus() {
    const now = Date.now();
    return slots.map((s, i) => ({
        index:   i,
        domain:  s.domain.id,
        proxy:   s.proxyUrl || 'direct',
        cool:    s.coolUntil > now ? Math.ceil((s.coolUntil - now) / 1000) + 's' : 'ready',
    }));
}

module.exports = { helper: true, duckFetch, slotStatus, buildFeSignals, genPublicKeyJwk };
