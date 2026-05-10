'use strict';

const { fetchBuffer } = require('../../utils/http');
const taoanhdep = require('../../utils/taoanhdep/api');

module.exports = {
    name: '/ai/lam-dep',
    index: async (req, res) => {
        const { url, format } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:    'URL ảnh khuôn mặt cần làm đẹp (xóa mụn, sáng da)',
                    format: '(tuỳ chọn) base64 | img — mặc định trả JSON với base64'
                },
                example: '/ai/lam-dep?url=https://example.com/anh.jpg',
                note: 'Hiệu quả nhất với ảnh khuôn mặt rõ nét'
            });
        }

        try {
            const img = await fetchBuffer(url);
            const result = await taoanhdep.call('lam-dep', {
                image: { buf: img.buffer, ext: img.ext, contentType: img.contentType }
            });

            if (format === 'img') {
                const b64DataUrl = result.image;
                const raw = b64DataUrl.includes(',') ? b64DataUrl.split(',')[1] : b64DataUrl;
                const mime = b64DataUrl.startsWith('data:') ? b64DataUrl.split(';')[0].slice(5) : `image/${result.format}`;
                res.set('Content-Type', mime);
                res.set('Cache-Control', 'no-store');
                return res.send(Buffer.from(raw, 'base64'));
            }

            return res.json({ status: true, format: result.format, image: result.image });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[AI-LAM-DEP] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi làm đẹp ảnh' });
        }
    }
};
