'use strict';

/**
 * Thông tin tài khoản nhận tiền (VietinBank + MoMo cá nhân).
 *
 * Ưu tiên đọc từ env, fallback file data/payment-config.json để admin sửa được
 * qua bot mà không phải redeploy.
 *
 * Env hỗ trợ:
 *   PAYMENT_VIETINBANK_STK
 *   PAYMENT_VIETINBANK_NAME
 *   PAYMENT_MOMO_PHONE
 *   PAYMENT_MOMO_NAME
 *
 * FIX: Dùng in-memory cache + async flush thay vì sync read/write mỗi lần gọi.
 */

const fs = require('fs');
const path = require('path');

const FILE = path.join(process.cwd(), 'data', 'payment-config.json');

// ─── In-memory cache ─────────────────────────────────────────────────────────

let _cache = null;
let _dirty = false;
let _flushing = false;

function ensureLoaded() {
    if (_cache !== null) return;
    try {
        _cache = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
    } catch {
        _cache = {};
    }
}

async function flushAsync() {
    if (!_dirty || _flushing) return;
    _flushing = true;
    const snapshot = JSON.stringify(_cache, null, 2);
    try {
        const dir = path.dirname(FILE);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(FILE, snapshot);
        _dirty = false;
    } catch (e) {
        if (typeof global.log === 'function') global.log(`[PAYMENT-CFG] Flush lỗi: ${e.message}`, 'WARN');
    } finally {
        _flushing = false;
    }
}

const _flushTimer = setInterval(flushAsync, 5000);
if (_flushTimer.unref) _flushTimer.unref();

// ─── Public API ───────────────────────────────────────────────────────────────

function get() {
    ensureLoaded();
    return {
        vietinbank: {
            stk:  process.env.PAYMENT_VIETINBANK_STK  || _cache.vietinbank?.stk  || '',
            name: process.env.PAYMENT_VIETINBANK_NAME || _cache.vietinbank?.name || ''
        },
        momo: {
            phone: process.env.PAYMENT_MOMO_PHONE || _cache.momo?.phone || '',
            name:  process.env.PAYMENT_MOMO_NAME  || _cache.momo?.name  || ''
        }
    };
}

function setVietinbank(stk, name) {
    ensureLoaded();
    _cache.vietinbank = { stk: String(stk).trim(), name: String(name || '').trim() };
    _dirty = true;
    return _cache.vietinbank;
}

function setMomo(phone, name) {
    ensureLoaded();
    _cache.momo = { phone: String(phone).trim(), name: String(name || '').trim() };
    _dirty = true;
    return _cache.momo;
}

function isReady() {
    const c = get();
    return !!(c.vietinbank.stk || c.momo.phone);
}

module.exports = { get, setVietinbank, setMomo, isReady };
