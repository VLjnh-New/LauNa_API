'use strict';

const axios = require('axios');
const cheerio = require('cheerio');

const SITE = 'https://downcloudme.com';
const LANDING = `${SITE}/enTc/`;
const ENDPOINT = `${SITE}/download`;
const REFERER_PATH = '/enTc/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const NONCE_TTL = 10 * 60 * 1000;

let cache = { nonce: null, cookie: null, at: 0 };

function parseSetCookie(headers) {
    const raw = headers?.['set-cookie'] || [];
    return raw.map(c => String(c).split(';')[0]).filter(Boolean).join('; ');
}

async function getNonce() {
    const now = Date.now();
    if (cache.nonce && now - cache.at < NONCE_TTL) return cache;
    const r = await axios.get(LANDING, {
        headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*' },
        timeout: 15000,
        validateStatus: s => s >= 200 && s < 400
    });
    const m = String(r.data).match(/name=["']downloader_verify["']\s+value=["']([^"']+)["']/i);
    if (!m) throw new Error('Không lấy được downloader_verify');
    cache = { nonce: m[1], cookie: parseSetCookie(r.headers), at: now };
    return cache;
}

function sanitizeFilename(s) {
    return String(s || '')
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 150) || 'track';
}

async function resolveDcm(url) {
    let info;
    try {
        info = await getNonce();
    } catch (e) {
        cache = { nonce: null, cookie: null, at: 0 };
        throw new Error('Lỗi khởi tạo phiên: ' + e.message);
    }

    const form = new URLSearchParams();
    form.set('downloader_verify', info.nonce);
    form.set('_wp_http_referer', REFERER_PATH);
    form.set('url', url);

    let r;
    try {
        r = await axios.post(ENDPOINT, form.toString(), {
            headers: {
                'User-Agent': UA,
                'Origin': SITE,
                'Referer': LANDING,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                ...(info.cookie ? { 'Cookie': info.cookie } : {})
            },
            timeout: 30000,
            maxRedirects: 5,
            validateStatus: s => s >= 200 && s < 400
        });
    } catch (e) {
        cache = { nonce: null, cookie: null, at: 0 };
        throw new Error('POST /download lỗi: ' + e.message);
    }

    const $ = cheerio.load(r.data);
    const btn = $('[data-direct]').first();
    const direct = btn.attr('data-direct');
    if (!direct) {
        cache = { nonce: null, cookie: null, at: 0 };
        throw new Error('Không tìm thấy link tải trong phản hồi');
    }
    const filename = btn.attr('data-filename') || '';
    let title = '';
    $('h3').each((_, el) => {
        if (title) return;
        const t = $(el).text().trim();
        if (t && !/preparing|downloading|keep it/i.test(t)) title = t;
    });
    if (!title && filename) title = filename.replace(/-?\d+\.mp3$/i, '').trim();

    let thumbnail = '';
    $('img').each((_, el) => {
        if (thumbnail) return;
        const src = $(el).attr('src') || '';
        if (/sndcdn\.com\/artworks/i.test(src)) thumbnail = src;
    });

    return {
        title: title || 'track',
        filename: filename || (sanitizeFilename(title) + '.mp3'),
        thumbnail,
        directUrl: direct,
        source: 'downcloudme.com'
    };
}

module.exports = {
    name: '/download/dcm',
    desc: 'Lấy link MP3 SoundCloud qua downcloudme.com. Trả JSON gồm title, thumbnail, directUrl. Thêm &stream=1 để stream file MP3 trực tiếp về client.',
    index: async (req, res) => {
        const url = req.query.url;
        if (!url || !/^https?:\/\//i.test(url)) {
            return res.status(400).json({
                status: false,
                message: "Thiếu hoặc sai tham số 'url'",
                example: '/download/dcm?url=https://soundcloud.com/...'
            });
        }

        let info;
        try {
            info = await resolveDcm(url);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[DCM] resolveDcm lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: 'Không lấy được thông tin media' });
        }

        if (!req.query.stream || req.query.stream === '0') {
            return res.json({ status: true, data: info });
        }

        const range = req.headers.range;
        const reqHeaders = { 'User-Agent': UA };
        if (range) reqHeaders['Range'] = range;

        let upstream;
        try {
            upstream = await axios.get(info.directUrl, {
                headers: reqHeaders,
                responseType: 'stream',
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: s => s >= 200 && s < 400
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[DCM] stream lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: 'Stream upstream lỗi' });
        }

        const safeName = sanitizeFilename(info.filename || (info.title + '.mp3'));
        const asciiName = safeName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]+/g, '_');
        res.status(upstream.status === 206 ? 206 : 200);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-store');
        if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
        if (upstream.headers['content-range']) res.setHeader('Content-Range', upstream.headers['content-range']);

        upstream.data.on('error', () => { try { res.end(); } catch {} });
        req.on('close', () => { try { upstream.data.destroy(); } catch {} });
        upstream.data.pipe(res);
    }
};
