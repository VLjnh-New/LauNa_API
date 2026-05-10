'use strict';
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const log = require('../../utils/logger');

const BASE = 'https://j2download.com';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const POW_TIMEOUT_MS = 8000;
const CACHE_FILE     = process.env.J2DL_CACHE_FILE || path.join(require('os').tmpdir(), 'j2dl-session.json');

// ── PoW solver (with timeout) ────────────────────────────────────────────────
function _hasLeadingZeroNibbles(buf, d) {
    const fb = (d / 2) | 0;
    const hb = (d & 1) === 1;
    for (let i = 0; i < fb; i++) if (buf[i] !== 0) return false;
    if (hb && (buf[fb] & 0xF0) !== 0) return false;
    return true;
}

function _solvePow(challenge, nonce, difficulty, type = 'classic') {
    if (!challenge || !nonce || !difficulty) return '';
    if (type !== 'classic') {
        log(`[J2] PoW type lạ "${type}", bỏ qua solver`, 'WARN');
        return '';
    }
    const pre  = 'pow:' + challenge + ':';
    const suf  = ':' + nonce + ':' + challenge.length;
    const t0   = Date.now();
    for (let n = 0; n < 10_000_000; n++) {
        if ((n & 0x3FFFF) === 0 && Date.now() - t0 > POW_TIMEOUT_MS) {
            log(`[J2] PoW timeout sau ${POW_TIMEOUT_MS}ms (n=${n}, diff=${difficulty})`, 'WARN');
            return '';
        }
        const h = crypto.createHash('sha256').update(pre + n + suf).digest();
        if (_hasLeadingZeroNibbles(h, difficulty)) return String(n);
    }
    return '';
}

// ── Session cache (RAM + file) ───────────────────────────────────────────────
let _cached  = null;   // { token, cookie, exp }
let _pending = null;   // Promise lock chống race khi issue song song

function _loadCacheFromDisk() {
    if (_cached) return;
    try {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const obj = JSON.parse(raw);
        if (obj && obj.token && obj.cookie && obj.exp && Date.now() < obj.exp) {
            _cached = obj;
            log(`[J2] Cache loaded từ ${CACHE_FILE} (còn ${Math.round((obj.exp - Date.now()) / 1000)}s)`, 'API');
        }
    } catch { /* không có cache hoặc cache hỏng → bỏ qua */ }
}

function _saveCacheToDisk(s) {
    try {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(s), 'utf8');
    } catch (e) {
        log(`[J2] Không ghi được cache file: ${e.message}`, 'WARN');
    }
}

function _clearCache() {
    _cached = null;
    try { fs.unlinkSync(CACHE_FILE); } catch { /* ignore */ }
}

_loadCacheFromDisk();

function _jwtExp(token) {
    try {
        const [, b64] = token.split('.');
        const pad = b64.replace(/-/g, '+').replace(/_/g, '/');
        const json = JSON.parse(Buffer.from(pad, 'base64').toString('utf-8'));
        return (json.exp || 0) * 1000;
    } catch { return 0; }
}

// ── Bootstrap: thử HTML trước, fallback JSON endpoint ────────────────────────
async function _bootstrapFromHtml() {
    const r = await axios.get(BASE + '/vi', {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
        timeout: 15000,
    });
    const cookies = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]);
    const m = r.data.match(/__BOOTSTRAP__=({[^}]+})/);
    if (!m) throw new Error('html_no_bootstrap');
    const bs = JSON.parse(m[1]);
    if (!bs.nonce) throw new Error('html_bootstrap_invalid');
    return { bs, cookies };
}

async function _bootstrapFromJson(seedCookies = []) {
    const cookieStr = seedCookies.join('; ');
    const r = await axios.get(BASE + '/api/auth/bootstrap', {
        headers: {
            'User-Agent': UA,
            'Accept':     'application/json, text/plain, */*',
            'Origin':     BASE,
            'Referer':    BASE + '/vi',
            ...(cookieStr ? { 'Cookie': cookieStr } : {}),
        },
        timeout: 15000,
        validateStatus: () => true,
    });
    if (r.status !== 200 || !r.data || !r.data.nonce) {
        throw new Error(`json_bootstrap_${r.status}`);
    }
    const newCookies = (r.headers['set-cookie'] || []).map(c => c.split(';')[0]);
    const cookies    = [...seedCookies, ...newCookies];
    return {
        bs: {
            nonce:         r.data.nonce,
            powChallenge:  r.data.powChallenge,
            powDifficulty: r.data.powDifficulty,
            challengeType: r.data.challengeType || 'classic',
        },
        cookies,
    };
}

async function _getBootstrap() {
    try {
        return await _bootstrapFromHtml();
    } catch (e) {
        log(`[J2] HTML bootstrap fail (${e.message}) → fallback JSON`, 'WARN');
        return await _bootstrapFromJson([]);
    }
}

async function _issueSession() {
    const { bs, cookies: rawCookies } = await _getBootstrap();
    const cookieStr = rawCookies.join('; ');

    const sol = _solvePow(bs.powChallenge, bs.nonce, bs.powDifficulty, bs.challengeType);
    log(`[J2] PoW solved: ${sol || 'skipped'} (diff=${bs.powDifficulty})`, 'API');

    const authRes = await axios.post(BASE + '/api/auth/issue', null, {
        headers: {
            'User-Agent':    UA,
            'X-Page-Nonce':  bs.nonce,
            'Origin':        BASE,
            'Referer':       BASE + '/vi',
            'Accept':        'application/json, text/plain, */*',
            'Cookie':        cookieStr,
            ...(sol ? { 'X-Pow-Solution': sol } : {}),
        },
        timeout: 15000,
        validateStatus: () => true,
    });

    if (authRes.status !== 200 || !authRes.data?.accessToken) {
        throw new Error(`[J2] Auth thất bại (${authRes.status}): ${JSON.stringify(authRes.data).slice(0, 120)}`);
    }

    const token       = authRes.data.accessToken;
    const authCookies = (authRes.headers['set-cookie'] || []).map(c => c.split(';')[0]);
    const allCookies  = [...rawCookies, ...authCookies].join('; ');
    const exp         = _jwtExp(token) - 10_000;   // 10s safety buffer

    log(`[J2] Token issued, expires in ${Math.round((exp - Date.now()) / 1000)}s`, 'API');
    const session = { token, cookie: allCookies, exp };
    _saveCacheToDisk(session);
    return session;
}

async function _getSession() {
    if (_cached && Date.now() < _cached.exp) return _cached;
    if (_pending) return _pending;

    _pending = _issueSession()
        .then(s => { _cached = s; return s; })
        .finally(() => { _pending = null; });

    return _pending;
}

// ── Meta enrichment ──────────────────────────────────────────────────────────
// j2download.com đôi khi trả về metadata "rỗng" kiểu:
//   title:     "Unknown tiktok aweme ID: 7632105913859460359"
//   author:    "Unknown"
//   thumbnail: "https://img.freepik.com/.../tik-tok-logo_..."
// nhưng phần `medias` lại trỏ tới tikwm.com → ta gọi tikwm để lấy meta thật.

const PLACEHOLDER_THUMB_RE = /(^|\W)(freepik\.com|placehold(er)?\.|no-?image|default[-_]?(thumb|cover))/i;

function _isUnknownStr(s) {
    if (!s || typeof s !== 'string') return true;
    const t = s.trim();
    if (!t) return true;
    if (/^unknown\b/i.test(t)) return true;
    return false;
}

function _isPlaceholderThumb(s) {
    if (!s || typeof s !== 'string') return true;
    return PLACEHOLDER_THUMB_RE.test(s);
}

function _needsEnrich(data) {
    return _isUnknownStr(data.title) || _isUnknownStr(data.author) || _isPlaceholderThumb(data.thumbnail);
}

// Lấy aweme/video ID từ title hoặc URL media
function _extractTiktokId(data) {
    const m1 = String(data.title || '').match(/\b(?:aweme|video|post)\s*(?:id)?\s*[:#]?\s*(\d{15,25})\b/i);
    if (m1) return m1[1];
    if (Array.isArray(data.medias)) {
        for (const med of data.medias) {
            const u = med && med.url;
            if (!u) continue;
            const m2 = String(u).match(/(\d{15,25})\.(?:mp4|mp3|jpg|jpeg|png|webp)\b/i);
            if (m2) return m2[1];
        }
    }
    return null;
}

async function _fetchTikwmMeta(awemeId) {
    try {
        const r = await axios.get('https://www.tikwm.com/api/', {
            params: { url: `https://www.tiktok.com/@x/video/${awemeId}`, hd: 1 },
            timeout: 15000,
            headers: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*' },
            validateStatus: () => true,
        });
        if (r.status !== 200 || !r.data || r.data.code !== 0 || !r.data.data) return null;
        const d = r.data.data;
        return {
            title:     (d.title && String(d.title).trim()) || '',
            author:    d.author?.nickname || d.author?.unique_id || '',
            thumbnail: d.origin_cover || d.cover || d.ai_dynamic_cover || '',
            duration:  typeof d.duration === 'number' ? d.duration : null,
        };
    } catch (e) {
        log(`[J2] Enrich tikwm fail: ${e.message}`, 'WARN');
        return null;
    }
}

async function _enrichMeta(data) {
    if (!_needsEnrich(data)) return data;

    const src = String(data.source || '').toLowerCase();
    const looksTiktok = src === 'tiktok'
        || /tikwm\.com|tiktokcdn|tiktok\.com/i.test(JSON.stringify(data.medias || []))
        || /tiktok/i.test(String(data.title || ''));

    if (looksTiktok) {
        const id = _extractTiktokId(data);
        if (id) {
            const meta = await _fetchTikwmMeta(id);
            if (meta) {
                if (_isUnknownStr(data.title)     && meta.title)     data.title     = meta.title;
                if (_isUnknownStr(data.author)    && meta.author)    data.author    = meta.author;
                if (_isPlaceholderThumb(data.thumbnail) && meta.thumbnail) data.thumbnail = meta.thumbnail;
                if ((data.duration == null) && meta.duration != null)     data.duration  = meta.duration;
                if (!data.source || data.source === 'j2download') data.source = 'tiktok';
                log(`[J2] Enriched meta cho TikTok ${id} qua tikwm`, 'API');
            }
        }
    }

    // Dọn placeholder còn sót để client không hiển thị "Unknown"
    if (_isUnknownStr(data.title))   data.title  = '';
    if (_isUnknownStr(data.author))  data.author = '';
    if (_isPlaceholderThumb(data.thumbnail)) data.thumbnail = '';

    return data;
}

// ── SSE resolver: kết nối SSE stream, chờ event completed để lấy URL thật ────
const https = require('https');
const http  = require('http');

function _resolveSseUrl(sseUrl, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
        let u;
        try { u = new URL(sseUrl); } catch { return reject(new Error('SSE URL không hợp lệ: ' + sseUrl)); }

        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.get({
            hostname: u.hostname,
            port:     u.port || (u.protocol === 'https:' ? 443 : 80),
            path:     u.pathname + u.search,
            headers:  {
                'Accept':     'text/event-stream',
                'User-Agent': UA,
            },
        }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`SSE HTTP ${res.statusCode}`));
            }

            let buf = '';
            let eventName = '';
            const timer = setTimeout(() => {
                req.destroy();
                reject(new Error('SSE timeout'));
            }, timeoutMs);

            res.on('data', (chunk) => {
                buf += chunk.toString();
                const lines = buf.split('\n');
                buf = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('event:')) {
                        eventName = line.slice(6).trim();
                    } else if (line.startsWith('data:')) {
                        const raw = line.slice(5).trim();
                        if (!raw) continue;
                        try {
                            const obj = JSON.parse(raw);
                            if (eventName === 'completed' && obj.download_url) {
                                clearTimeout(timer);
                                req.destroy();
                                resolve({ url: obj.download_url, info: obj.file_info || {} });
                                return;
                            }
                            if (obj.status === 'error' || obj.error) {
                                clearTimeout(timer);
                                req.destroy();
                                reject(new Error('SSE error: ' + (obj.message || obj.error || raw)));
                                return;
                            }
                        } catch { /* JSON parse fail, bỏ qua */ }
                        eventName = '';
                    }
                }
            });

            res.on('end', () => {
                clearTimeout(timer);
                reject(new Error('SSE stream kết thúc mà không có download_url'));
            });
        });

        req.on('error', (e) => reject(new Error('SSE request error: ' + e.message)));
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('SSE connect timeout')); });
    });
}

const SSE_RE = /sse-progress|sse\?|\/sse/i;

async function _resolveMedias(medias) {
    if (!Array.isArray(medias) || !medias.length) return medias;
    if (!SSE_RE.test(medias[0]?.url || '')) return medias;

    log(`[J2] Đang resolve ${medias.length} SSE URL(s)…`, 'API');

    const settled = await Promise.allSettled(
        medias.map(async (m) => {
            if (!m || !m.url || !SSE_RE.test(m.url)) return m;
            try {
                const { url, info } = await _resolveSseUrl(m.url);
                return {
                    ...m,
                    url,
                    ext:      m.ext || m.extension || info.ext || 'mp4',
                    size:     info.size     || m.size     || null,
                    filesize: info.size     || m.filesize || null,
                    duration: info.duration || m.duration || null,
                };
            } catch (e) {
                log(`[J2] Không resolve được SSE (${m.quality || '?'}): ${e.message}`, 'WARN');
                return null;
            }
        })
    );

    const resolved = settled
        .map(r => r.status === 'fulfilled' ? r.value : null)
        .filter(Boolean);

    if (!resolved.length) throw new Error('[J2] Không resolve được bất kỳ SSE URL nào');
    log(`[J2] Resolved ${resolved.length}/${medias.length} media(s)`, 'API');
    return resolved;
}

// ── Core fetch ───────────────────────────────────────────────────────────────
async function j2Fetch(url) {
    const cleanUrl = (url || '').trim();
    if (!cleanUrl) throw new Error('URL rỗng');

    let session;
    try {
        session = await _getSession();
    } catch (e) {
        throw new Error('[J2] Không lấy được session: ' + e.message);
    }

    const res = await axios.post(BASE + '/api/autolink',
        { data: { url: cleanUrl, unlock: true } },
        {
            headers: {
                'User-Agent':    UA,
                'Authorization': 'Bearer ' + session.token,
                'Content-Type':  'application/json',
                'Accept':        'application/json, text/plain, */*',
                'Origin':        BASE,
                'Referer':       BASE + '/vi',
                'Cookie':        session.cookie,
            },
            timeout: 35000,
            validateStatus: () => true,
        }
    );

    if (res.status === 401) {
        _clearCache();
        throw new Error('[J2] Session hết hạn, thử lại');
    }

    if (res.status !== 200) {
        throw new Error(`[J2] HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 120)}`);
    }

    const d = res.data;

    if (d.error === true && d.message) {
        const msg = typeof d.message === 'string' ? d.message : JSON.stringify(d.message);
        if (/no media|not found|unsupported/i.test(msg)) throw new Error('URL không được hỗ trợ hoặc không có media');
        throw new Error('[J2] ' + msg);
    }

    const data = d.data || d;
    if (!data.medias || !data.medias.length) throw new Error('Không có media nào trong kết quả');

    const resolvedMedias = await _resolveMedias(data.medias);

    const out = {
        source:    data.source    || 'j2download',
        title:     data.title     || '',
        author:    data.author    || '',
        thumbnail: data.thumbnail || '',
        duration:  data.duration  || null,
        medias:    resolvedMedias,
    };

    return await _enrichMeta(out);
}

// ── Public wrapper: dedup theo URL + retry 1 lần khi 401 ─────────────────────
const _inflight = new Map();   // url → Promise (chống nhiều request trùng URL)

async function _doDownload(url) {
    try {
        const data = await j2Fetch(url);
        log(`[J2] OK — ${data.medias.length} media(s) | ${url.slice(0, 60)}`, 'API');
        return data;
    } catch (err) {
        if (err.message.includes('Session hết hạn')) {
            const data = await j2Fetch(url);
            log(`[J2] OK (retry) — ${data.medias.length} media(s)`, 'API');
            return data;
        }
        throw err;
    }
}

async function downloadAll(url) {
    const key = (url || '').trim();
    if (_inflight.has(key)) {
        return _inflight.get(key);
    }
    const p = _doDownload(key).finally(() => _inflight.delete(key));
    _inflight.set(key, p);
    return p;
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = {
    downloadAll,
    name: '/download/j2dl',
    index: async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).json({
            status: false,
            message: "Thiếu tham số 'url'",
            example: '/download/j2dl?url=https://www.tiktok.com/...',
        });

        try {
            const data = await downloadAll(url);
            return res.json({ status: true, data });
        } catch (err) {
            const isUnsupported = /không được hỗ trợ|no media|not found|unsupported/i.test(err.message);
            if (isUnsupported) {
                log(`[J2] URL không hỗ trợ: ${url.slice(0, 80)}`, 'WARN');
                return res.status(400).json({ status: false, message: 'URL không được hỗ trợ' });
            }
            log(`[J2] Lỗi: ${err.message}`, 'ERROR');
            return res.status(500).json({ status: false, message: 'Lỗi tải media' });
        }
    },
};
