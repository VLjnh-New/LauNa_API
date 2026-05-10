'use strict';

const path = require('path');
const fs = require('fs');
const log = require('../logger');

// Trên serverless (Leapcell/Railway…) chỉ /tmp là writable.
// Fallback về /tmp nếu thư mục gốc read-only.
const _DEFAULT_BLOCK_PATH = path.join(process.cwd(), 'data', 'block', 'listIP.json');
const _TMP_BLOCK_PATH     = path.join('/tmp', 'launa-block', 'listIP.json');
function _resolveBanPath() {
    try {
        fs.mkdirSync(path.dirname(_DEFAULT_BLOCK_PATH), { recursive: true });
        fs.accessSync(path.dirname(_DEFAULT_BLOCK_PATH), fs.constants.W_OK);
        return _DEFAULT_BLOCK_PATH;
    } catch {
        try { fs.mkdirSync(path.dirname(_TMP_BLOCK_PATH), { recursive: true }); } catch {}
        return _TMP_BLOCK_PATH;
    }
}
const LIST_IP_PATH = _resolveBanPath();

const PERM_BAN_DURATION  = 24 * 60 * 60 * 1000;
const TEMP_BAN_DURATION  = 30 * 60 * 1000;
const SUSPECT_DURATION   = 10 * 60 * 1000;
const VERIFIED_DURATION  = 15 * 60 * 1000;

// ── Persistent ban list ───────────────────────────────────────────────────────

let _permBanned = new Map();

(function loadPermBanned() {
    try {
        const raw = JSON.parse(fs.readFileSync(LIST_IP_PATH, 'utf-8'));
        const now = Date.now();
        if (Array.isArray(raw)) {
            for (const entry of raw) {
                if (typeof entry === 'string') {
                    _permBanned.set(entry, now + PERM_BAN_DURATION);
                } else if (entry && typeof entry.ip === 'string' && entry.exp > now) {
                    _permBanned.set(entry.ip, entry.exp);
                }
            }
        }
    } catch (_) {}
})();

let _savePending = false;
function savePermBanned() {
    if (_savePending) return;
    _savePending = true;
    setImmediate(async () => {
        _savePending = false;
        try {
            const now = Date.now();
            const list = [];
            for (const [ip, exp] of _permBanned) {
                if (exp > now) list.push({ ip, exp });
                else _permBanned.delete(ip);
            }
            await fs.promises.writeFile(LIST_IP_PATH, JSON.stringify(list, null, 2), 'utf-8');
        } catch (e) {
            log(`[DDoS] Không thể ghi listIP.json: ${e.message}`, 'ERROR');
        }
    });
}

const _permBanCbs = [];
function onPermBan(fn) { if (typeof fn === 'function') _permBanCbs.push(fn); }

function permBan(ip, opts = {}) {
    const exp = Date.now() + PERM_BAN_DURATION;
    const isNew = !_permBanned.has(ip);
    _permBanned.set(ip, exp);
    _suspect.delete(ip); _verified.delete(ip);
    savePermBanned();
    const expStr = new Date(exp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    log(`[DDoS] BAN-24H: ${ip} (hết hạn ${expStr})`, 'WARN');
    if (isNew && !opts.silent) {
        for (const fn of _permBanCbs) try { fn({ ip, exp, reason: opts.reason || 'rate-limit' }); } catch (_) {}
    }
}

function isPermBanned(ip) {
    if (!_permBanned.has(ip)) return false;
    if (Date.now() > _permBanned.get(ip)) { _permBanned.delete(ip); savePermBanned(); return false; }
    return true;
}

function unban(ip) {
    _permBanned.delete(ip); _tempBanned.delete(ip); _suspect.delete(ip); _verified.delete(ip);
    delete _tracker[ip];
    savePermBanned();
    log(`[DDoS] UNBAN: ${ip}`, 'WARN');
}

// ── Temp ban ──────────────────────────────────────────────────────────────────

const _tempBanned = new Map();

function tempBan(ip) {
    _tempBanned.set(ip, Date.now() + TEMP_BAN_DURATION);
    _suspect.delete(ip); _verified.delete(ip); delete _tracker[ip];
    log(`[DDoS] TEMP-BAN 30p: ${ip}`, 'WARN');
}

function isTempBanned(ip) {
    if (!_tempBanned.has(ip)) return false;
    if (Date.now() > _tempBanned.get(ip)) { _tempBanned.delete(ip); return false; }
    return true;
}

// ── Suspect / Verified ────────────────────────────────────────────────────────

const _suspect  = new Map();
const _verified = new Map();

function markSuspect(ip) {
    const existing = _suspect.get(ip) || { strikes: 0 };
    _suspect.set(ip, { exp: Date.now() + SUSPECT_DURATION, strikes: existing.strikes });
    log(`[DDoS] SUSPECT (yêu cầu captcha): ${ip}`, 'WARN');
}

function isSuspect(ip) {
    if (!_suspect.has(ip)) return false;
    const s = _suspect.get(ip);
    if (Date.now() > s.exp) { _suspect.delete(ip); return false; }
    return true;
}

function markVerified(ip) {
    _verified.set(ip, Date.now() + VERIFIED_DURATION);
    _suspect.delete(ip);
    if (_tracker[ip]) { _tracker[ip].strikes = Math.max(0, (_tracker[ip].strikes || 1) - 1); _tracker[ip].count = 0; }
    log(`[DDoS] VERIFIED (captcha pass): ${ip}`, 'WARN');
}

function isVerified(ip) {
    if (!_verified.has(ip)) return false;
    if (Date.now() > _verified.get(ip)) { _verified.delete(ip); return false; }
    return true;
}

function retryAfterSeconds(ip) {
    if (_permBanned.has(ip)) return Math.ceil((_permBanned.get(ip) - Date.now()) / 1000);
    if (_tempBanned.has(ip)) return Math.ceil((_tempBanned.get(ip) - Date.now()) / 1000);
    return 1800;
}

// ── Sliding-window rate tracker ───────────────────────────────────────────────
// Dùng sliding window thay fixed window: chính xác hơn, không bị reset bằng cách
// gửi đúng lúc window reset. Mỗi IP lưu mảng timestamps trong windowMs gần nhất.

const MAX_TRACKER_IPS = 20_000;
const _tracker = Object.create(null);

const CFG_DEFAULT = {
    windowMs: 10_000,
    maxReq: 80,
    strikesForTemp: 3,
    strikesForPerm: 6,
};

function getConfig() {
    const l = (global.config || {}).limit || {};
    return {
        windowMs:       l.time              || CFG_DEFAULT.windowMs,
        maxReq:         l['request-limit']  || CFG_DEFAULT.maxReq,
        strikesForTemp: l['strikes-for-temp']|| CFG_DEFAULT.strikesForTemp,
        strikesForPerm: l['strikes-for-perm']|| CFG_DEFAULT.strikesForPerm,
    };
}

function isWhitelisted(ip) {
    const cfg = global.config || {};
    const wl = Array.isArray(cfg.whitelist) ? cfg.whitelist : [];
    const admins = Array.isArray(cfg.ADMIN) ? cfg.ADMIN : [];
    return wl.includes(ip) || admins.includes(ip);
}

// Trả về: true (ok) | false (bị ban) | 'challenge' (cần captcha)
function track(ip) {
    const { windowMs, maxReq, strikesForTemp, strikesForPerm } = getConfig();
    const now = Date.now();
    const cutoff = now - windowMs;

    if (!_tracker[ip]) {
        // Evict khi đầy: xoá entry cũ nhất trực tiếp (O(1))
        const keys = Object.keys(_tracker);
        if (keys.length >= MAX_TRACKER_IPS) delete _tracker[keys[0]];
        _tracker[ip] = { hits: [now], strikes: 0 };
        return true;
    }

    const t = _tracker[ip];
    // Sliding window: lọc ra chỉ giữ hits trong windowMs gần nhất
    t.hits = t.hits.filter(ts => ts > cutoff);
    t.hits.push(now);

    if (t.hits.length > maxReq) {
        t.strikes++;
        t.hits = []; // reset window sau khi vi phạm

        if (t.strikes >= strikesForPerm) {
            permBan(ip);
            delete _tracker[ip];
            return false;
        }
        if (t.strikes >= strikesForTemp) {
            tempBan(ip);
            return false;
        }
        // Lần đầu / đầu vi phạm → yêu cầu captcha
        markSuspect(ip);
        return 'challenge';
    }

    return true;
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

setInterval(() => {
    const now = Date.now();
    const { windowMs } = getConfig();

    for (const [ip, exp] of _permBanned) {
        if (now > exp) { _permBanned.delete(ip); log(`[DDoS] AUTO-UNBAN (hết 24h): ${ip}`, 'WARN'); }
    }
    savePermBanned();
    for (const [ip, exp] of _tempBanned) { if (now > exp) _tempBanned.delete(ip); }
    for (const [ip, s]   of _suspect)    { if (now > s.exp) _suspect.delete(ip); }
    for (const [ip, exp] of _verified)   { if (now > exp) _verified.delete(ip); }

    // Xoá tracker IP không hoạt động lâu hơn 5 phút
    for (const ip of Object.keys(_tracker)) {
        const t = _tracker[ip];
        const lastHit = t.hits && t.hits.length ? t.hits[t.hits.length - 1] : 0;
        if (now - lastHit > 5 * 60 * 1000) delete _tracker[ip];
    }
}, 60_000).unref();

// ── Express middleware ────────────────────────────────────────────────────────

const _getIP = require('ipware')().get_ip;
const BYPASS_PATHS = new Set(['/challenge', '/healthz', '/readyz']);

function middleware(req, res, next) {
    if (BYPASS_PATHS.has(req.path)) return next();

    const ip = (req.headers['cf-connecting-ip'] || '').trim()
        || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || (req.headers['x-real-ip'] || '').trim()
        || req.ip
        || (_getIP(req).clientIp)
        || '0.0.0.0';

    if (isWhitelisted(ip)) {
        const isAdmin = (global.config?.ADMIN || []).includes(ip);
        log(`${isAdmin ? 'ADMIN' : 'IP'}: ${ip} - ${decodeURIComponent(req.url)}`, 'STATUS');
        return next();
    }

    if (isPermBanned(ip)) {
        const secs = retryAfterSeconds(ip);
        log(`[DDoS] BLOCKED(24h-ban): ${ip} → ${req.url}`, 'WARN');
        res.set('Retry-After', String(secs));
        return res.status(429).json({ status: false, message: `IP của bạn đã bị tạm khoá. Thử lại sau ${Math.ceil(secs / 3600)} giờ.` });
    }

    if (isTempBanned(ip)) {
        const secs = retryAfterSeconds(ip);
        log(`[DDoS] BLOCKED(temp): ${ip} → ${req.url}`, 'WARN');
        res.set('Retry-After', String(secs));
        return res.status(429).json({ status: false, message: 'Quá nhiều request. Thử lại sau 30 phút.' });
    }

    if (isVerified(ip)) {
        log(`IP: ${ip} - ${decodeURIComponent(req.url)}`, 'STATUS');
        return next();
    }

    if (isSuspect(ip)) {
        log(`[DDoS] CHALLENGE(suspect): ${ip} → ${req.url}`, 'WARN');
        return _sendChallenge(res, ip);
    }

    const result = track(ip);

    if (result === 'challenge') {
        log(`[DDoS] CHALLENGE(new): ${ip} → ${req.url}`, 'WARN');
        return _sendChallenge(res, ip);
    }

    if (!result) {
        const secs = retryAfterSeconds(ip);
        log(`[DDoS] BLOCKED(new-ban): ${ip} → ${req.url}`, 'WARN');
        res.set('Retry-After', String(secs));
        return res.status(429).json({
            status: false,
            message: isPermBanned(ip) ? 'IP của bạn đã bị tạm khoá 24 giờ.' : 'Quá nhiều request. Thử lại sau 30 phút.',
        });
    }

    log(`IP: ${ip} - ${decodeURIComponent(req.url)}`, 'STATUS');
    next();
}

function _sendChallenge(res, ip) {
    const tsCfg = global.config?.turnstile || {};
    const siteKey = (tsCfg.siteKey && tsCfg.siteKey !== 'NHAP_SITE_KEY_CUA_BAN') ? tsCfg.siteKey : null;
    if (!siteKey) {
        tempBan(ip);
        return res.status(429).json({ status: false, message: 'Quá nhiều request. Thử lại sau 30 phút.' });
    }
    return res.status(429).json({
        status: false, challenge: true, siteKey,
        message: 'Vui lòng xác minh bạn không phải bot để tiếp tục.',
    });
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function getStats() {
    return {
        permBanned:  _permBanned.size,
        tempBanned:  _tempBanned.size,
        suspects:    _suspect.size,
        verified:    _verified.size,
        tracked:     Object.keys(_tracker).length,
    };
}

module.exports = { middleware, permBan, unban, isPermBanned, isTempBanned, markVerified, isSuspect, isVerified, onPermBan, getStats };
