'use strict';

/**
 * Kiểm tra & cập nhật quota của API key.
 *
 * File apikeys.json là một mảng object:
 *   [
 *     { apikey: 'VLjnh-xxxxxxxxxxxx', type: 'admin' },
 *     { apikey: 'launa-prem-xyz789',  type: 'premium' },
 *     { apikey: 'launa-free-abc123',  type: 'free',
 *       ip: '1.2.3.4', hourlyLimit: 60,
 *       hourly: { hour: '2026-04-21T11', used: 5 },
 *       createdAt: '...' }
 *   ]
 *
 *  - File rỗng / mảng rỗng    → API public, không cần key
 *  - type = 'admin'           → không trừ lượt, không giới hạn
 *  - type = 'premium'         → không trừ lượt
 *  - type = 'free'            → giới hạn N request mỗi GIỜ (auto reset).
 *
 * FIX: Sử dụng in-memory cache thay vì readFileSync/writeFileSync mỗi request.
 *      Flush xuống disk async mỗi 5 giây khi có thay đổi (dirty flag).
 */

const fs           = require('fs');
const path         = require('path');
const { randomBytes } = require('crypto');

// Trên serverless (Leapcell…) chỉ /tmp là writable.
// Ưu tiên /tmp; nếu không có thì fallback về data/ (read-only — chỉ đọc được).
const _BUNDLED_PATH = path.join(process.cwd(), 'data', 'apikeys.json');
const _TMP_PATH     = '/tmp/launa-apikeys.json';
function _resolveKeyPath() {
    try {
        fs.accessSync(path.dirname(_BUNDLED_PATH), fs.constants.W_OK);
        return _BUNDLED_PATH;
    } catch {
        return _TMP_PATH;
    }
}
const DEFAULT_PATH = _resolveKeyPath();

// ─── In-memory store ─────────────────────────────────────────────────────────

let _keys    = [];
let _dirty   = false;
let _loaded  = false;
let _flushing = false;

function getFilePath() {
    return global.APIKEY || DEFAULT_PATH;
}

function ensureLoaded() {
    if (_loaded) return;
    _loaded = true;
    try {
        const filePath = getFilePath();
        if (!fs.existsSync(filePath)) {
            // Nếu dùng /tmp và chưa có file → seed từ bundled data/apikeys.json
            let seed = '[]';
            if (filePath !== _BUNDLED_PATH && fs.existsSync(_BUNDLED_PATH)) {
                try { seed = fs.readFileSync(_BUNDLED_PATH, 'utf-8').trim() || '[]'; } catch {}
            }
            fs.writeFileSync(filePath, seed, 'utf-8');
            try { _keys = JSON.parse(seed); if (!Array.isArray(_keys)) _keys = []; } catch { _keys = []; }
            return;
        }
        const raw = fs.readFileSync(filePath, 'utf-8').trim() || '[]';
        const data = JSON.parse(raw);
        _keys = Array.isArray(data) ? data : [];
    } catch (e) {
        _keys = [];
    }
}

async function flushAsync() {
    if (!_dirty || _flushing) return;
    _flushing = true;
    const snapshot = JSON.stringify(_keys, null, 2);
    try {
        await fs.promises.writeFile(getFilePath(), snapshot, 'utf-8');
        _dirty = false;
    } catch (e) {
        // log nhẹ, không crash
        if (typeof global.log === 'function') global.log(`[APIKEY] Flush lỗi: ${e.message}`, 'WARN');
    } finally {
        _flushing = false;
    }
}

// Flush mỗi 5 giây nếu có thay đổi
const _flushTimer = setInterval(flushAsync, 5000);
if (_flushTimer.unref) _flushTimer.unref();

// Reload cache từ disk (dùng khi file bị sửa bên ngoài)
function reloadCache() {
    try {
        const filePath = getFilePath();
        if (!fs.existsSync(filePath)) { _keys = []; return; }
        const raw = fs.readFileSync(filePath, 'utf-8').trim() || '[]';
        const data = JSON.parse(raw);
        _keys = Array.isArray(data) ? data : [];
        _dirty = false;
    } catch { _keys = []; }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function currentHourKey() {
    return new Date().toISOString().slice(0, 13);
}

function defaultHourlyLimit() {
    const cfg = (global.config && global.config.freeKey) || {};
    return Number(cfg.requestsPerHour) || Number(cfg.hourlyLimit) || 60;
}

function normalizeIp(ip) {
    if (!ip) return '';
    let s = String(ip).trim().toLowerCase();
    if (s.startsWith('::ffff:')) s = s.slice(7);
    if (s === '::1') s = '127.0.0.1';
    const comma = s.indexOf(',');
    if (comma >= 0) s = s.slice(0, comma).trim();
    return s;
}

// ─── isAdminKey / isAdminReq (dùng chung cho các route) ─────────────────────

function isAdminKey(key) {
    if (!key) return false;
    ensureLoaded();
    return _keys.some(k =>
        String(k.apikey || '').trim() === String(key).trim() &&
        String(k.type || '').toLowerCase() === 'admin'
    );
}

function isAdminReq(req) {
    const key = req.query.apikey || req.headers['x-api-key'] || req.headers['apikey'];
    return isAdminKey(key);
}

// ─── check_api_key ───────────────────────────────────────────────────────────

function check_api_key(apikey, ip) {
    ensureLoaded();
    const reqIp = normalizeIp(ip);

    try {
        if (_keys.length === 0) return { error: 0, public: true };

        if (!apikey) return { error: 1, msg: 'Thiếu api key' };

        const input = String(apikey).trim();
        const entry = _keys.find(k => String(k.apikey || k.key || '').trim() === input);
        if (!entry) return { error: 1, msg: 'APIKEY không chính xác' };

        const type = String(entry.type || 'free').toLowerCase();
        if (type === 'admin')   return { error: 0, type: 'admin'   };
        if (type === 'premium') return { error: 0, type: 'premium' };

        // ─── Free key ────────────────────────────────────────────────────────
        const hour  = currentHourKey();
        const limit = Number(entry.hourlyLimit) || defaultHourlyLimit();
        if (!entry.hourly || entry.hourly.hour !== hour) {
            entry.hourly = { hour, used: 0 };
        }
        if (entry.hourly.used >= limit) {
            const remainMin = 60 - new Date().getUTCMinutes();
            return {
                error: 1,
                msg: `APIKEY đã đạt giới hạn ${limit} request/giờ. Thử lại sau ~${remainMin} phút.`
            };
        }

        entry.hourly.used += 1;
        if ('request' in entry) delete entry.request;
        _dirty = true;

        return {
            error: 0,
            type: 'free',
            hourlyLimit: limit,
            used: entry.hourly.used,
            remaining: Math.max(0, limit - entry.hourly.used)
        };
    } catch (e) {
        const log = require('../logger');
        log(`[APIKEY] check_api_key lỗi: ${e.message}`, 'WARN');
        return { error: 1, msg: 'Lỗi xác thực API key' };
    }
}

// ─── findFreeKeyByIp ─────────────────────────────────────────────────────────

function findFreeKeyByIp(ip) {
    ensureLoaded();
    const reqIp = normalizeIp(ip);
    if (!reqIp) return null;
    return _keys.find(k =>
        String(k.type || '').toLowerCase() === 'free' &&
        normalizeIp(k.ip) === reqIp
    ) || null;
}

// ─── createKey ───────────────────────────────────────────────────────────────

function createKey(hourlyLimit, ip) {
    ensureLoaded();
    const reqIp = normalizeIp(ip);
    const limit = Number(hourlyLimit) || defaultHourlyLimit();

    if (!reqIp) {
        return { status: false, message: 'Không xác định được IP của bạn — không thể tạo key.' };
    }

    try {
        const exist = _keys.find(k =>
            String(k.type || '').toLowerCase() === 'free' &&
            normalizeIp(k.ip) === reqIp
        );
        if (exist) {
            return {
                status: true,
                reused: true,
                apikey: exist.apikey,
                hourlyLimit: Number(exist.hourlyLimit) || limit,
                ip: reqIp
            };
        }

        const suffix = randomBytes(8).toString('hex');
        const apikey = `launa-free-${suffix}`;
        const hour   = currentHourKey();

        const newEntry = {
            apikey,
            type: 'free',
            ip: reqIp,
            hourlyLimit: limit,
            hourly: { hour, used: 0 },
            createdAt: new Date().toISOString()
        };
        _keys.push(newEntry);
        _dirty = true;

        return { status: true, reused: false, apikey, hourlyLimit: limit, ip: reqIp };
    } catch (e) {
        const log = require('../logger');
        log(`[APIKEY] createKey lỗi: ${e.message}`, 'WARN');
        return { status: false, message: 'Lỗi tạo key' };
    }
}

// ─── createAdminKey (dùng bởi admin route & telegram bot) ────────────────────

function createAdminKey(type, note, hourlyLimit, ip) {
    ensureLoaded();
    const validTypes = new Set(['admin', 'premium', 'free']);
    if (!validTypes.has(type)) return { status: false, message: `type phải là: ${[...validTypes].join(', ')}` };

    const prefix = type === 'admin' ? 'admin' : type === 'premium' ? 'prem' : 'free';
    const newKey = {
        apikey: `launa-${prefix}-${randomBytes(6).toString('hex')}`,
        type,
        note: note || '',
        createdAt: new Date().toISOString(),
        ...(type === 'free' && hourlyLimit ? { hourlyLimit: Number(hourlyLimit) } : {}),
        ...(ip ? { ip } : {}),
    };
    _keys.push(newKey);
    _dirty = true;
    return { status: true, data: newKey };
}

// ─── revokeKey ───────────────────────────────────────────────────────────────

function revokeKey(apikey) {
    ensureLoaded();
    const before = _keys.length;
    _keys = _keys.filter(k => String(k.apikey || k.key || '').trim() !== String(apikey).trim());
    if (_keys.length === before) return { status: false, message: 'Không tìm thấy key.' };
    _dirty = true;
    return { status: true, message: 'Đã thu hồi key.' };
}

// ─── listKeys / getKeys ───────────────────────────────────────────────────────

function listKeys() {
    ensureLoaded();
    return _keys;
}

/**
 * Ghi đè toàn bộ mảng key (dùng bởi telegram-bot để backward-compat).
 * Đánh dấu dirty để flush async.
 */
function setKeys(arr) {
    if (!Array.isArray(arr)) return;
    _keys = arr;
    _loaded = true;
    _dirty = true;
}

module.exports = {
    check_api_key,
    createKey,
    createAdminKey,
    revokeKey,
    findFreeKeyByIp,
    isAdminKey,
    isAdminReq,
    listKeys,
    setKeys,
    reloadCache,
};
