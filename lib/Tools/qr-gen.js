'use strict';

/**
 * /tools/qr-gen — Tạo QR code từ bất kỳ văn bản / URL nào.
 *
 * Cách dùng:
 *   /tools/qr-gen?text=https://example.com
 *   /tools/qr-gen?text=Xin chào&size=300&color=000000&bg=ffffff&format=png
 *   /tools/qr-gen?text=abc&format=json          (trả URL ảnh thay vì binary)
 *
 * Tham số:
 *   text    : Nội dung QR (bắt buộc) — URL, text, số điện thoại, ...
 *   size    : Kích thước px (50–2000, mặc định 300)
 *   color   : Màu QR hex không # (mặc định 000000 = đen)
 *   bg      : Màu nền hex không # (mặc định ffffff = trắng)
 *   margin  : Viền trắng 0–50 module (mặc định 1)
 *   ecc     : Mức sửa lỗi L|M|Q|H (mặc định M)
 *   format  : png (mặc định, binary) | json (trả URL)
 *
 * Backend: api.qrserver.com (free, không cần key, max 2000×2000).
 */

const axios = require('axios');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 500, ttl: 60 * 60 * 1000 });

const SIZE_MAX = 2000;
const SIZE_MIN = 50;
const ECC_SET  = new Set(['L', 'M', 'Q', 'H']);

function clampInt(v, lo, hi, def) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}

function sanitizeHex(v, def) {
    if (!v) return def;
    const h = String(v).replace(/[^0-9a-fA-F]/g, '');
    return h.length === 3 || h.length === 6 ? h : def;
}

module.exports = {
    name: '/tools/qr-gen',
    index: async (req, res) => {
        const { text, format } = req.query;

        if (!text || !text.trim()) {
            return res.status(400).json({
                status:  false,
                message: "Thiếu tham số 'text'",
                params: {
                    text:   'Nội dung QR (URL, text, số điện thoại, ...)',
                    size:   '(tuỳ chọn) kích thước px 50–2000, mặc định 300',
                    color:  '(tuỳ chọn) màu QR hex không #, mặc định 000000',
                    bg:     '(tuỳ chọn) màu nền hex không #, mặc định ffffff',
                    margin: '(tuỳ chọn) viền trắng 0–50, mặc định 1',
                    ecc:    '(tuỳ chọn) mức sửa lỗi L|M|Q|H, mặc định M',
                    format: '(tuỳ chọn) png (ảnh binary, mặc định) | json (trả URL)',
                },
                example: '/tools/qr-gen?text=https://example.com&size=400'
            });
        }

        const size   = clampInt(req.query.size, SIZE_MIN, SIZE_MAX, 300);
        const color  = sanitizeHex(req.query.color, '000000');
        const bg     = sanitizeHex(req.query.bg, 'ffffff');
        const margin = clampInt(req.query.margin, 0, 50, 1);
        const ecc    = ECC_SET.has((req.query.ecc || '').toUpperCase()) ? req.query.ecc.toUpperCase() : 'M';

        const cacheKey = `${text}|${size}|${color}|${bg}|${margin}|${ecc}`;

        try {
            const params = new URLSearchParams({
                data:             text.trim(),
                size:             `${size}x${size}`,
                color:            color,
                bgcolor:          bg,
                qzone:            String(margin),
                ecc:              ecc,
                format:           'png',
                'margin-top':     '0',
            });
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?${params.toString()}`;

            if (format === 'json') {
                return res.json({
                    status: true,
                    url:    qrUrl,
                    text:   text.trim(),
                    size, color, bg, margin, ecc,
                    creator: 'Ljzi'
                });
            }

            let imgBuf = cache.get(cacheKey);
            if (!imgBuf) {
                const r = await axios.get(qrUrl, { responseType: 'arraybuffer', timeout: 15_000 });
                imgBuf = Buffer.from(r.data);
                cache.set(cacheKey, imgBuf);
            }

            res.set('Content-Type', 'image/png');
            res.set('Cache-Control', 'public, max-age=3600');
            return res.send(imgBuf);

        } catch (e) {
            const log = require('../../utils/logger');
            log(`[QR-GEN] lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: 'Tạo QR thất bại' });
        }
    }
};
