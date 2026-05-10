'use strict';

const axios = require('axios');
const { downloadSoundCloud } = require('../Music/soundcloud');

function sanitizeFilename(s) {
    return String(s || '')
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'track';
}

function asciiFallback(s) {
    return String(s || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7e]+/g, '_')
        .replace(/_+/g, '_')
        .trim() || 'track';
}

module.exports = {
    name: '/download/scl',
    desc: 'Tải SoundCloud về MP3 (Content-Disposition attachment, tên file <title> - <author>.mp3). Stream trực tiếp từ SoundCloud CDN qua server.',
    index: async (req, res) => {
        const url = req.query.url;
        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                example: '/download/scl?url=https://soundcloud.com/...'
            });
        }

        let info;
        try {
            info = await downloadSoundCloud(url);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[SCL] downloadSoundCloud lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: 'Không lấy được link stream SoundCloud' });
        }

        const baseName = sanitizeFilename(`${info.title} - ${info.author}`);
        const filenameAscii = asciiFallback(baseName) + '.mp3';
        const filenameUtf8 = encodeURIComponent(baseName + '.mp3');

        const range = req.headers.range;
        const reqHeaders = { 'User-Agent': 'Mozilla/5.0' };
        if (range) reqHeaders['Range'] = range;

        let upstream;
        try {
            upstream = await axios.get(info.streamUrl, {
                headers: reqHeaders,
                responseType: 'stream',
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: s => s >= 200 && s < 400
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[SCL] stream lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: 'Stream upstream lỗi' });
        }

        res.status(upstream.status === 206 ? 206 : 200);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${filenameAscii}"; filename*=UTF-8''${filenameUtf8}`);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-LauNa-Track-Title', encodeURIComponent(info.title));
        res.setHeader('X-LauNa-Track-Author', encodeURIComponent(info.author));
        res.setHeader('X-LauNa-Track-Duration', String(info.duration || ''));
        if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
        if (upstream.headers['content-range']) res.setHeader('Content-Range', upstream.headers['content-range']);

        upstream.data.on('error', () => { try { res.end(); } catch {} });
        req.on('close', () => { try { upstream.data.destroy(); } catch {} });
        upstream.data.pipe(res);
    }
};
