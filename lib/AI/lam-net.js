'use strict';

const axios = require('axios');
const { fetchBuffer } = require('../../utils/http');
const taoanhdep = require('../../utils/taoanhdep/api');

const REFERER = 'https://taoanhdep.com/lam-net-anh-bang-ai/';

async function doLamNet(imgBuf, ext, ct, useV2 = true) {
    // taoanhdep cung cấp 2 model: net-anh-nguoi (v1) và net-anh-nguoi-v2.
    // Thử model ưu tiên trước; nếu lỗi không phải rate-limit thì thử model còn lại.
    const slugs = useV2
        ? ['net-anh-nguoi-v2', 'net-anh-nguoi']
        : ['net-anh-nguoi',    'net-anh-nguoi-v2'];

    let lastError = 'Lỗi không xác định';

    for (const slug of slugs) {
        try {
            const result = await taoanhdep.call(slug, {
                file: { buf: imgBuf, ext, contentType: ct }
            });
            let img = result.image;
            // Nếu API trả URL thay vì base64 → fetch về và mã hoá base64
            if (/^https?:\/\//i.test(img)) {
                const fetched = await axios.get(img, {
                    responseType: 'arraybuffer', timeout: 20000,
                    headers: { 'Referer': REFERER },
                    validateStatus: s => s < 400
                });
                const mime = fetched.headers['content-type'] || 'image/jpeg';
                img = `data:${mime};base64,${Buffer.from(fetched.data).toString('base64')}`;
            }
            return img;
        } catch (e) {
            lastError = e.message || 'Lỗi xử lý';
            // Nếu rate-limit → thử model khác (cũng cùng backend, nhưng có thể khác queue)
            // Nếu lỗi khác → cũng thử model khác để fallback
        }
    }
    throw new Error(lastError);
}

module.exports = {
    name: '/ai/lam-net',
    index: async (req, res) => {
        const { url, version, format } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:     'URL ảnh cần làm nét (ảnh người cho chất lượng tốt nhất)',
                    version: '(tuỳ chọn) 2 (mặc định) | 1 — dùng model v1',
                    format:  '(tuỳ chọn) base64 | img — mặc định trả JSON với base64'
                },
                example: '/ai/lam-net?url=https://example.com/anh.jpg'
            });
        }

        try {
            const useV2 = version !== '1';
            const img = await fetchBuffer(url);
            const b64DataUrl = await doLamNet(img.buffer, img.ext, img.contentType, useV2);

            if (format === 'img') {
                const raw = b64DataUrl.includes(',') ? b64DataUrl.split(',')[1] : b64DataUrl;
                const mime = b64DataUrl.startsWith('data:') ? b64DataUrl.split(';')[0].slice(5) : 'image/jpeg';
                res.set('Content-Type', mime);
                res.set('Cache-Control', 'no-store');
                return res.send(Buffer.from(raw, 'base64'));
            }

            return res.json({ status: true, version: useV2 ? 2 : 1, image: b64DataUrl });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[AI-LAM-NET] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi làm nét ảnh' });
        }
    }
};
