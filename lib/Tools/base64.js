'use strict';

/**
 * /tools/base64 — Encode / Decode Base64 thuần server-side.
 *
 * Cách dùng:
 *   /tools/base64?action=encode&text=Hello World
 *   /tools/base64?action=decode&text=SGVsbG8gV29ybGQ=
 *   /tools/base64?action=encode&url=https://example.com/file.txt   (encode nội dung file)
 *   /tools/base64?action=decode&url=https://example.com/data.b64   (decode file text)
 *
 * Hỗ trợ:
 *   - encode : text → base64
 *   - decode : base64 → text  (nếu không decode được sẽ trả lỗi rõ ràng)
 *   - Gửi qua GET ?text=... hoặc POST body JSON { action, text }
 *   - Hỗ trợ Base64 URL-safe (- và _ thay + và /) tự động
 *
 * Giới hạn: text ≤ 2MB, URL fetch ≤ 5MB.
 */

const axios = require('axios');

const MAX_TEXT = 2 * 1024 * 1024;   // 2MB text
const MAX_URL  = 5 * 1024 * 1024;   // 5MB từ URL

function toStandardBase64(s) {
    return s.replace(/-/g, '+').replace(/_/g, '/');
}

module.exports = {
    name: '/tools/base64',
    methods: {
        get:  handler,
        post: handler,
    }
};

async function handler(req, res) {
    const body   = req.body || {};
    const action = (req.query.action || body.action || 'encode').toLowerCase();
    const text   = req.query.text ?? body.text ?? null;
    const url    = req.query.url  || body.url  || null;

    if (!['encode', 'decode'].includes(action)) {
        return res.status(400).json({
            status:  false,
            message: "Tham số 'action' phải là 'encode' hoặc 'decode'",
            params: {
                action: 'encode | decode',
                text:   'Văn bản cần xử lý (GET param hoặc POST JSON body)',
                url:    '(tuỳ chọn) URL tới file text cần xử lý thay vì truyền thẳng text',
            },
            examples: [
                '/tools/base64?action=encode&text=Hello World',
                '/tools/base64?action=decode&text=SGVsbG8gV29ybGQ=',
            ]
        });
    }

    try {
        let input;

        if (url) {
            const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 15_000, maxContentLength: MAX_URL });
            if (r.data.byteLength > MAX_URL) throw new Error('File từ URL quá lớn (giới hạn 5MB)');
            if (action === 'encode') {
                input = Buffer.from(r.data);
            } else {
                input = Buffer.from(r.data).toString('utf8').trim();
            }
        } else {
            if (text === null) {
                return res.status(400).json({ status: false, message: "Thiếu tham số 'text' hoặc 'url'" });
            }
            if (Buffer.byteLength(String(text)) > MAX_TEXT) {
                return res.status(400).json({ status: false, message: 'Text quá lớn (giới hạn 2MB)' });
            }
            input = String(text);
        }

        let result, bytes;

        if (action === 'encode') {
            const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
            result = buf.toString('base64');
            bytes  = buf.length;
        } else {
            const cleaned = toStandardBase64(String(input).replace(/\s/g, ''));
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
                return res.status(400).json({ status: false, message: 'Chuỗi không phải Base64 hợp lệ' });
            }
            const buf = Buffer.from(cleaned, 'base64');
            result = buf.toString('utf8');
            bytes  = buf.length;
        }

        return res.json({
            status: true,
            action,
            result,
            inputLength:  Buffer.isBuffer(input) ? input.length : Buffer.byteLength(String(input)),
            outputLength: Buffer.byteLength(result),
            bytes,
            creator: 'Ljzi'
        });

    } catch (e) {
        const log = require('../../utils/logger');
        log(`[BASE64] lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi xử lý base64' });
    }
}
