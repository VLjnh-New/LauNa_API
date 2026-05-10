'use strict';

/**
 * Proxy thẳng tới downloadall.app/api/analyze — không phụ thuộc provider nào khác.
 *
 *   POST /tools/downloadall      body: { "url": "<media_url>" }
 *   GET  /tools/downloadall?url=<media_url>     (tiện gọi nhanh từ trình duyệt)
 *   GET  /tools/downloadall?url=<media_url>&dl=1  (stream file thật về client)
 *
 * Trả nguyên response của downloadall.app — các status có thể gặp:
 *   - "picker"   : { picker: [{type, url, thumb}, ...] }  (nhiều media)
 *   - "redirect" : { url: "<direct_link>" }
 *   - "stream"   : { url: "<stream_link>", filename }
 *   - "tunnel"   : { url: "<tunnel_link>", filename }
 *   - "error"    : { text: "..." }
 *
 * LƯU Ý: hiện tại server downloadall.app đang chạy ở chế độ DEMO
 * (luôn trả BigBuckBunny.mp4 cho mọi URL) cho tới khi họ cấu hình COBALT_API_URL.
 * Endpoint này sẽ tự động trả kết quả thật khi họ bật backend lên.
 */

const axios = require('axios');
const { analyze } = require('../Download/downloadall');

const { randomUA } = require('../../utils/http/browser-headers');
const TIMEOUT = 30_000;

function pickStreamUrl(data) {
    if (!data || typeof data !== 'object') return null;
    if (typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) return data.url;
    if (Array.isArray(data.picker) && data.picker.length) {
        const first = data.picker.find(p => p && typeof p.url === 'string' && /^https?:\/\//i.test(p.url));
        if (first) return first.url;
    }
    return null;
}

async function streamTo(res, fileUrl, filename) {
    const upstream = await axios.get(fileUrl, {
        responseType: 'stream',
        timeout: TIMEOUT,
        headers: { 'user-agent': UA, 'referer': 'https://downloadall.app/' },
        validateStatus: () => true,
        maxRedirects: 5
    });
    if (upstream.status >= 400) {
        return res.status(upstream.status).json({ status: false, message: `Upstream ${upstream.status}` });
    }
    const ct = upstream.headers['content-type'];
    if (ct) res.setHeader('Content-Type', ct);
    const len = upstream.headers['content-length'];
    if (len) res.setHeader('Content-Length', len);
    const safeName = (filename || fileUrl.split('/').pop().split('?')[0] || 'download.bin')
        .replace(/[^\w.\-]+/g, '_').slice(0, 120);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    upstream.data.pipe(res);
}

async function handle(req, res) {
    const url = ((req.method === 'POST' ? req.body?.url : req.query.url) || '').trim();
    if (!url) {
        return res.status(400).json({
            status: false,
            message: "Thiếu tham số 'url'",
            example_get:  '/tools/downloadall?url=https://www.facebook.com/watch?v=...',
            example_post: 'POST /tools/downloadall  body: {"url":"..."}'
        });
    }
    if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ status: false, message: 'URL phải bắt đầu bằng http:// hoặc https://' });
    }

    let data;
    try {
        data = await analyze(url);
    } catch (e) {
        const log = require('../../utils/logger');
        log(`[DOWNLOADALL] analyze lỗi: ${e.message}`, 'WARN');
        return res.status(502).json({ status: false, message: 'Lỗi gọi downloadall.app' });
    }

    if (req.method === 'GET' && (req.query.dl === '1' || req.query.dl === 'true')) {
        const fileUrl = pickStreamUrl(data);
        if (!fileUrl) {
            return res.status(404).json({ status: false, message: 'Không có link tải trong response', upstream: data });
        }
        try {
            return await streamTo(res, fileUrl, data.filename);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[DOWNLOADALL] stream lỗi: ${e.message}`, 'WARN');
            if (!res.headersSent) {
                return res.status(502).json({ status: false, message: 'Lỗi stream file' });
            }
            return res.end();
        }
    }

    return res.status(200).json(data);
}

module.exports = {
    name: '/tools/downloadall',
    methods: {
        get:  handle,
        post: handle
    }
};
