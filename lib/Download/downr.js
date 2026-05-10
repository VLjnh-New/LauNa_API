'use strict';
const axios = require('axios');
const http = require('http');
const https = require('https');
const log = require('../../utils/logger');

// ── Keep-alive agents ────────────────────────────────────────────────────────
const _httpAgent  = new http.Agent({ keepAlive: true, maxSockets: 8 });
const _httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const _ax = axios.create({ httpAgent: _httpAgent, httpsAgent: _httpsAgent });

// ── Session pool ─────────────────────────────────────────────────────────────
const POOL_SIZE   = 2;
const SESSION_TTL = 30 * 60 * 1000;
const REFRESH_BUF =  5 * 60 * 1000;
const MIN_DELAY   = 60_000;

const _pool   = [];
let _poolIdx  = 0;
let _fetching = false;
let _fetchQ   = [];

// ── Circuit breaker ──────────────────────────────────────────────────────────
let _cbFails = 0;
let _cbOpenUntil = 0;
const CB_THRESHOLD = 5;
const CB_COOLDOWN  = 2 * 60 * 1000;

function _cbCheck() {
    if (_cbFails >= CB_THRESHOLD) {
        if (Date.now() < _cbOpenUntil) throw new Error(`[ORG] Circuit breaker mở — service lỗi liên tục, thử lại sau ${Math.ceil((_cbOpenUntil - Date.now()) / 1000)}s`);
        _cbFails = 0;
    }
}
function _cbSuccess() { _cbFails = 0; }
function _cbFail()    { _cbFails++; if (_cbFails >= CB_THRESHOLD) _cbOpenUntil = Date.now() + CB_COOLDOWN; }

// ── Fetch 1 session cookie ────────────────────────────────────────────────────
async function _fetchOneSession() {
    const res = await _ax.get("https://downr.org/.netlify/functions/analytics", {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Origin":     "https://downr.org",
            "Referer":    "https://downr.org/",
        },
        timeout: 15000,
    });

    const raw  = res.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : (raw ? [raw] : []);
    const line = list.find(c => c.startsWith("sess="));
    if (!line) throw new Error("[ORG] Không lấy được sess cookie");

    const cookieValue = line.split(";")[0];
    const b64 = cookieValue.replace("sess=", "").split(".")[0];

    let exp = Date.now() + SESSION_TTL;
    try {
        const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));
        if (payload.exp) exp = typeof payload.exp === "number" && payload.exp > 1e10 ? payload.exp : payload.exp * 1000;
    } catch {}

    return { cookie: cookieValue, exp };
}

// ── Điền đầy pool (với lock) ──────────────────────────────────────────────────
async function _fillPool() {
    if (_fetching) {
        await new Promise(r => _fetchQ.push(r));
        return;
    }
    _fetching = true;
    try {
        const now = Date.now();
        const needed = POOL_SIZE - _pool.filter(s => s && s.exp - now > REFRESH_BUF).length;
        if (needed <= 0) return;

        const tasks = Array.from({ length: needed }, () =>
            _fetchOneSession().catch(e => { log(`[ORG] fetchSession lỗi: ${e.message}`, 'WARN'); return null; })
        );
        const results = await Promise.all(tasks);
        for (const s of results) {
            if (!s) continue;
            const slot = _pool.findIndex(p => !p || p.exp - now <= REFRESH_BUF);
            if (slot >= 0) _pool[slot] = s;
            else if (_pool.length < POOL_SIZE) _pool.push(s);
        }
        if (_pool.filter(Boolean).length > 0) {
            _scheduleRefresh();
        }
    } finally {
        _fetching = false;
        const q = _fetchQ.splice(0);
        q.forEach(r => r());
    }
}

// ── Auto-refresh timer ────────────────────────────────────────────────────────
let _refreshTimer = null;
function _scheduleRefresh() {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    const valid = _pool.filter(s => s && s.exp > Date.now() + REFRESH_BUF);
    if (!valid.length) return;
    const earliest = Math.min(...valid.map(s => s.exp));
    const delay    = Math.max(earliest - Date.now() - REFRESH_BUF, MIN_DELAY);
    _refreshTimer  = setTimeout(() => {
        _fillPool().catch(e => log(`[ORG] Auto-refresh lỗi: ${e.message}`, 'WARN'));
    }, delay);
    if (_refreshTimer.unref) _refreshTimer.unref();
}

// ── Lấy session hợp lệ (round-robin) ─────────────────────────────────────────
async function _getSession() {
    const now = Date.now();
    const valid = _pool.filter(s => s && s.exp - now > REFRESH_BUF);
    if (!valid.length) await _fillPool();

    const alive = _pool.filter(s => s && s.exp - now > REFRESH_BUF);
    if (!alive.length) throw new Error("[ORG] Không có session hợp lệ");

    _poolIdx = (_poolIdx + 1) % alive.length;
    return alive[_poolIdx % alive.length].cookie;
}

// ── Invalidate session ────────────────────────────────────────────────────────
function _invalidateSession(cookie) {
    const idx = _pool.findIndex(s => s && s.cookie === cookie);
    if (idx >= 0) _pool[idx] = null;
}

// ── HTTP call ─────────────────────────────────────────────────────────────────
const NXT_HEADERS = {
    "Content-Type": "application/json",
    "Accept":       "application/json, text/plain, */*",
    "Origin":       "https://downr.org",
    "Referer":      "https://downr.org/",
    "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

async function _callNyt(cookie, url) {
    return _ax.post(
        "https://downr.org/.netlify/functions/nyt",
        { url },
        {
            headers:        { ...NXT_HEADERS, Cookie: cookie },
            timeout:        35000,
            validateStatus: () => true,
        }
    );
}

// ── Phân loại lỗi ─────────────────────────────────────────────────────────────
function _isUnsupportedUrl(body) {
    return /url\s*(is\s*)?(invalid|not\s*supported)/i.test(body)
        || /invalid\s*(or\s*not\s*supported)?\s*url/i.test(body)
        || /unsupported/i.test(body);
}

function _bodyStr(data) {
    return typeof data === "string" ? data : JSON.stringify(data ?? "");
}

// ── Chuẩn hóa response ────────────────────────────────────────────────────────
function _normalizeData(data) {
    if (!data || typeof data !== "object") return data;
    data.source = "downr.org";

    if (Array.isArray(data.medias)) {
        data.medias = data.medias.map(m => {
            if (Array.isArray(m.url)) {
                m.url = m.url.filter(Boolean)[0] ?? null;
            }
            if (typeof m.url === "string") m.url = m.url.trim();
            return m;
        }).filter(m => m.url);
    }
    return data;
}

// ── Core: downrFetch với retry + backoff ──────────────────────────────────────
const MAX_RETRY  = 3;
const BACKOFF_MS = [0, 800, 2000];

async function downrFetch(rawUrl) {
    const url = (rawUrl || "").trim();
    if (!url) throw new Error("URL rỗng");

    _cbCheck();

    let lastErr = null;

    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
        if (BACKOFF_MS[attempt]) await new Promise(r => setTimeout(r, BACKOFF_MS[attempt]));

        let cookie;
        try { cookie = await _getSession(); }
        catch (e) { throw e; }

        let res;
        try {
            res = await _callNyt(cookie, url);
        } catch (e) {
            lastErr = e;
            log(`[ORG] Attempt ${attempt + 1} timeout/net: ${e.message}`, 'WARN');
            _cbFail();
            continue;
        }

        const body = _bodyStr(res.data);

        if (res.status === 403) {
            log(`[ORG] 403 attempt ${attempt + 1} — invalidate session`, 'WARN');
            _invalidateSession(cookie);
            lastErr = new Error(`ORG 403: ${body.slice(0, 120)}`);
            continue;
        }

        if (res.status === 400) {
            if (_isUnsupportedUrl(body)) {
                _cbSuccess();
                throw new Error("URL không được hỗ trợ hoặc không hợp lệ");
            }
            log(`[ORG] 400 attempt ${attempt + 1} — reset session. Body: ${body.slice(0, 120)}`, 'WARN');
            _invalidateSession(cookie);
            lastErr = new Error(`ORG 400: ${body.slice(0, 120)}`);
            continue;
        }

        if (res.status === 429) {
            const retryAfter = parseInt(res.headers["retry-after"] || "5") * 1000;
            log(`[ORG] 429 rate-limit, chờ ${retryAfter}ms`, 'WARN');
            await new Promise(r => setTimeout(r, retryAfter));
            lastErr = new Error("ORG 429: rate limited");
            _cbFail();
            continue;
        }

        if (res.status !== 200) {
            lastErr = new Error(`ORG ${res.status}: ${body.slice(0, 120)}`);
            _cbFail();
            log(`[ORG] ${res.status} attempt ${attempt + 1}: ${body.slice(0, 80)}`, 'WARN');
            continue;
        }

        const data = res.data;
        if (!data || data.error) {
            const msg = data && data.error ? data.error : "ORG trả về lỗi không xác định";
            if (_isUnsupportedUrl(msg)) {
                _cbSuccess();
                throw new Error("URL không được hỗ trợ hoặc không hợp lệ");
            }
            lastErr = new Error(msg);
            _cbFail();
            continue;
        }
        if (!data.medias || !data.medias.length) {
            lastErr = new Error("Không có media nào trong kết quả");
            _cbFail();
            continue;
        }

        _cbSuccess();
        return _normalizeData(data);
    }

    _cbFail();
    throw lastErr || new Error("[ORG] Tất cả lần retry đều thất bại");
}

// ── Khởi tạo pool khi load module ────────────────────────────────────────────
_fillPool().catch(e => log(`[ORG] Khởi tạo pool lỗi: ${e.message}`, 'WARN'));

// ── Route export ──────────────────────────────────────────────────────────────
module.exports = {
    downrFetch,
    name: '/download/downr',
    index: async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).json({
            status: false,
            message: "Thiếu tham số 'url'",
            example: '/download/downr?url=https://www.tiktok.com/...'
        });
        try {
            const data = await downrFetch(url);
            log(`[ORG] OK — ${data.medias && data.medias.length} media(s) | ${url.slice(0, 60)}`, 'API');
            return res.json({ status: true, data });
        } catch (err) {
            const isUnsupported = /không được hỗ trợ|không hợp lệ|unsupported|not supported/i.test(err.message);
            if (isUnsupported) {
                log(`[ORG] URL không hỗ trợ: ${url.slice(0, 80)}`, 'WARN');
                return res.status(400).json({ status: false, message: 'URL không được hỗ trợ' });
            }
            log(`[ORG] Lỗi: ${err.message}`, 'ERROR');
            return res.status(500).json({ status: false, message: 'Lỗi tải media' });
        }
    }
};
