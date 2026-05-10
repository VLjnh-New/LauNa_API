'use strict';

/**
 * /shortener — URL shortener tự host trên LauNa.
 *
 * Endpoints (1 file phục vụ nhiều route):
 *   POST/GET /shortener/create?url=https://...&alias=xyz   -> tạo short link
 *   GET      /shortener/info?code=xyz                       -> xem info + click count
 *   GET      /s/:code                                       -> redirect (bind ngoài qua app/routes/pages.js)
 *
 * Cần Postgres (LAUNA_DATABASE_URL hoặc DATABASE_URL).
 *
 * Auto tạo bảng short_urls khi gọi lần đầu.
 */

const crypto = require('crypto');
const dbMod = require('../../utils/data/db');

let initialized = false;
async function ensureSchema() {
    if (initialized) return;
    if (!dbMod.isEnabled()) throw new Error('DB chưa cấu hình. Set LAUNA_DATABASE_URL.');
    await dbMod.query(`
        CREATE TABLE IF NOT EXISTS short_urls (
            code        VARCHAR(32) PRIMARY KEY,
            target_url  TEXT NOT NULL,
            clicks      BIGINT NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_ip  TEXT,
            last_click  TIMESTAMPTZ
        )
    `);
    initialized = true;
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // bỏ chữ dễ nhầm
function genCode(len = 6) {
    const buf = crypto.randomBytes(len);
    let out = '';
    for (let i = 0; i < len; i++) out += ALPHABET[buf[i] % ALPHABET.length];
    return out;
}

function isSafeUrl(s) {
    try {
        const u = new URL(s);
        if (!/^https?:$/.test(u.protocol)) return false;
        if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|::1)/.test(u.hostname)) return false;
        return true;
    } catch { return false; }
}

async function createShort(req, res) {
    const target = (req.query.url || req.body?.url || '').toString().trim();
    let alias = (req.query.alias || req.body?.alias || '').toString().trim().toLowerCase();
    if (!target) return res.status(400).json({ status: false, message: "Thiếu 'url'.", example: '/shortener/create?url=https://example.com' });
    if (target.length > 2048) return res.status(400).json({ status: false, message: 'URL quá dài (tối đa 2048 ký tự).' });
    if (!isSafeUrl(target)) return res.status(400).json({ status: false, message: 'URL không hợp lệ (chỉ http/https công khai).' });
    if (alias && !/^[a-z0-9_-]{3,32}$/.test(alias)) return res.status(400).json({ status: false, message: "alias chỉ nhận a-z/0-9/-/_ độ dài 3-32." });

    try {
        await ensureSchema();
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;

        let code = alias;
        if (!code) {
            for (let i = 0; i < 10; i++) {
                code = genCode(6);
                const ex = await dbMod.query('SELECT 1 FROM short_urls WHERE code=$1', [code]);
                if (ex.rowCount === 0) break;
            }
        } else {
            const ex = await dbMod.query('SELECT 1 FROM short_urls WHERE code=$1', [code]);
            if (ex.rowCount > 0) return res.status(409).json({ status: false, message: `alias "${code}" đã tồn tại.` });
        }

        await dbMod.query('INSERT INTO short_urls (code, target_url, created_ip) VALUES ($1, $2, $3)', [code, target, ip]);
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0];
        return res.json({ status: true, code, shortUrl: `${proto}://${host}/s/${code}`, target });
    } catch (e) {
        const log = require('./../../utils/logger');
        log(`[SHORTENER] createShort lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi tạo short URL' });
    }
}

async function infoShort(req, res) {
    const code = (req.query.code || '').toString().trim().toLowerCase();
    if (!code) return res.status(400).json({ status: false, message: "Thiếu 'code'." });
    try {
        await ensureSchema();
        const r = await dbMod.query('SELECT code, target_url, clicks, created_at, last_click FROM short_urls WHERE code=$1', [code]);
        if (r.rowCount === 0) return res.status(404).json({ status: false, message: 'Không tìm thấy.' });
        const row = r.rows[0];
        return res.json({ status: true, code: row.code, target: row.target_url, clicks: Number(row.clicks), createdAt: row.created_at, lastClick: row.last_click });
    } catch (e) {
        const log = require('./../../utils/logger');
        log(`[SHORTENER] infoShort lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi tra cứu short URL' });
    }
}

// Helper dùng ngoài cho /s/:code redirect
async function resolveAndCount(code) {
    await ensureSchema();
    const r = await dbMod.query('UPDATE short_urls SET clicks = clicks + 1, last_click = NOW() WHERE code=$1 RETURNING target_url', [code.toLowerCase()]);
    return r.rows[0]?.target_url || null;
}

// Auto-loader đọc `name` để map route. Trả về 1 endpoint chính, route extra add ở pages.js
module.exports = {
    name: '/shortener/create',
    index: createShort,
    _info: infoShort,           // dùng nội bộ
    _resolve: resolveAndCount   // dùng nội bộ
};
