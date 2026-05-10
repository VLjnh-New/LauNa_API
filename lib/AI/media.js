'use strict';

/**
 * /ai/media — Endpoint trung gian che link upstream thật.
 * Nhận token đã mã hoá → giải mã ra URL gốc → fetch & stream về client.
 *
 * Chỉ chấp nhận host nằm trong whitelist (chống SSRF).
 *
 * Dùng: GET /ai/media?id=<token>
 *       (token được sinh bởi utils/security/url-cloak.cloak())
 */

const axios = require('axios');
const { decode } = require('../../utils/security/url-cloak');

const ALLOWED_HOST_RE = [
    /\.hf\.space$/i,
    /(^|\.)huggingface\.co$/i,
    /(^|\.)taoanhdep\.com$/i,
    /(^|\.)pollinations\.ai$/i,
];

function isAllowed(rawUrl) {
    try {
        const u = new URL(rawUrl);
        if (!/^https?:$/.test(u.protocol)) return false;
        return ALLOWED_HOST_RE.some(re => re.test(u.hostname));
    } catch { return false; }
}

function refererFor(rawUrl) {
    try {
        const u = new URL(rawUrl);
        const host = u.hostname;
        // HF Space `/gradio_api/file=...` chỉ phục vụ khi Referer = root của chính Space đó
        if (/\.hf\.space$/i.test(host))      return `${u.protocol}//${host}/`;
        if (/taoanhdep\.com$/i.test(host))   return 'https://taoanhdep.com/';
        if (/pollinations\.ai$/i.test(host)) return 'https://pollinations.ai/';
        return `${u.protocol}//${host}/`;
    } catch { return 'https://taoanhdep.com/'; }
}

module.exports = {
    name: '/ai/media',
    index: async (req, res) => {
        const id = req.query.id || req.query.t;
        if (!id) {
            return res.status(400).json({
                status:  false,
                message: 'Thiếu tham số id',
            });
        }

        let real;
        try {
            real = decode(id);
        } catch (_) {
            return res.status(400).json({ status: false, message: 'Token không hợp lệ' });
        }

        if (!isAllowed(real)) {
            return res.status(403).json({ status: false, message: 'Đích không được phép' });
        }

        try {
            const upstream = await axios.get(real, {
                responseType: 'stream',
                timeout:      120_000,
                maxContentLength:   200 * 1024 * 1024,
                maxBodyLength:      200 * 1024 * 1024,
                maxRedirects: 3,
                headers: {
                    'Referer':    refererFor(real),
                    'User-Agent': 'Mozilla/5.0 (compatible; LauNa-API/4.0)',
                    'Accept':     '*/*',
                },
                validateStatus: s => s < 500,
            });

            if (upstream.status >= 400) {
                return res.status(upstream.status).json({
                    status:  false,
                    message: `Upstream trả về ${upstream.status}`,
                });
            }

            const ct = upstream.headers['content-type'] || 'application/octet-stream';
            res.set('Content-Type', ct);

            const cl = upstream.headers['content-length'];
            if (cl) res.set('Content-Length', cl);

            res.set('Cache-Control',  'public, max-age=600');
            res.set('X-Robots-Tag',   'noindex');
            res.set('Cross-Origin-Resource-Policy', 'cross-origin');
            res.removeHeader('X-Powered-By');

            upstream.data.on('error', () => { try { res.end(); } catch (_) {} });
            upstream.data.pipe(res);
        } catch (e) {
            const code = e?.response?.status && e.response.status < 600 ? e.response.status : 502;
            return res.status(code).json({
                status:  false,
                message: 'Không tải được tài nguyên',
            });
        }
    },
};
