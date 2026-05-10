'use strict';

/**
 * Nén video qua videosmaller.com (server họ xử lý — không tốn CPU mình).
 *
 *   GET /tools/nen-video?url=<video_url>
 *        &scale=<320|480|640|854|1280>   (tuỳ chọn — width muốn thu nhỏ)
 *        &lowquality=1                   (tuỳ chọn — bật "low compression / best quality")
 *        &mute=1                         (tuỳ chọn — bỏ audio)
 *
 * Hỗ trợ: mp4, mov, avi, mpeg, mkv, mpg, wmv, webm, flv, vob, ogg, yuv, rm, rmvb, asf, amv, mpv, m4v, 3gp
 * Trả về JSON: { status, filename, originalBytes, compressedBytes, savedPercent, downloadUrl, ... }
 */

const axios = require('axios');

const { randomUA } = require('../../utils/http/browser-headers');
const ENDPOINT = 'https://www.videosmaller.com/';
const MAX_DOWNLOAD = 500 * 1024 * 1024; // VideoSmaller giới hạn 500MB
const FETCH_TIMEOUT  = 60_000;
const UPLOAD_TIMEOUT = 300_000; // nén video có thể mất vài phút

const ALLOWED_EXT = new Set([
    'avi','mpeg','mkv','mpg','mp4','mov','wmv','webm',
    'flv','vob','ogg','yuv','rm','rmvb','asf','amv','mpv','m4v','3gp'
]);

const ALLOWED_SCALES = new Set(['320','480','640','854','1280']);

/* ── helpers ─────────────────────────────────────────────────────────────── */

function guessFilename(url, contentType) {
    try {
        const u = new URL(url);
        const last = (u.pathname.split('/').pop() || '').split('?')[0];
        if (last && /\.[a-z0-9]{2,5}$/i.test(last)) return decodeURIComponent(last);
    } catch {}
    const map = {
        'video/mp4':       'video.mp4',
        'video/quicktime': 'video.mov',
        'video/x-msvideo': 'video.avi',
        'video/x-matroska':'video.mkv',
        'video/webm':      'video.webm',
        'video/3gpp':      'video.3gp',
        'video/x-flv':     'video.flv'
    };
    return map[(contentType || '').split(';')[0].trim().toLowerCase()] || 'video.mp4';
}

function humanSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const u = ['B','KB','MB','GB'];
    let i = 0, n = bytes;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(2)} ${u[i]}`;
}

function parseSizeLabel(s) {
    // "12.34MB" / "1.2 GB" / "987KB" → bytes
    if (!s) return null;
    const m = String(s).trim().match(/([\d.,]+)\s*(B|KB|MB|GB|TB)/i);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    const mul = { B:1, KB:1024, MB:1024**2, GB:1024**3, TB:1024**4 }[m[2].toUpperCase()];
    return Math.round(n * mul);
}

/**
 * VideoSmaller trả về trang HTML có dạng:
 *   <a class="..." href="https://www.videosmaller.com/v/<hash>/<filename>"...>Download File</a>
 *   <p>Original size: 12.34MB → Compressed size: 5.67MB (-54.05%)</p>
 * Cấu trúc đôi khi đổi → bắt nhiều pattern.
 */
function parseResponseHtml(html) {
    // Lỗi (alert-danger / alert-warning)
    const errMatch = html.match(/class="[^"]*alert-(?:danger|warning)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const errorText = errMatch ? errMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null;

    // Link tải — VideoSmaller dùng backend fileconverto.com
    const linkMatch = html.match(/href="(https?:\/\/[^"]*fileconverto\.com\/download\.php\?hash=[a-f0-9]+)"/i)
                   || html.match(/href="(https?:\/\/[^"]+\/download\.php\?hash=[a-f0-9]+)"/i);

    const delMatch  = html.match(/href="(https?:\/\/[^"]*fileconverto\.com\/delete-file\.php\?hash=[a-f0-9]+)"/i)
                   || html.match(/href="(https?:\/\/[^"]+\/delete-file\.php\?hash=[a-f0-9]+)"/i);

    // "Download File (2.72MB => 2.33MB, -14.12%)"  (cả "=>" lẫn "=&gt;")
    const sizesMatch = html.match(/\(\s*([\d.,]+\s*[KMGT]?B)\s*(?:=&gt;|=>|→|->|to)\s*([\d.,]+\s*[KMGT]?B)\s*,\s*(-?[\d.]+)\s*%\s*\)/i);

    if (!linkMatch) {
        return { ok: false, errorText: errorText || null };
    }

    const originalSize   = sizesMatch ? sizesMatch[1].trim() : null;
    const compressedSize = sizesMatch ? sizesMatch[2].trim() : null;
    const savedPercent   = sizesMatch ? Math.abs(parseFloat(sizesMatch[3])) : null;

    return {
        ok: true,
        downloadUrl: linkMatch[1],
        deleteUrl:   delMatch ? delMatch[1] : null,
        originalSize,
        compressedSize,
        compressedBytes: parseSizeLabel(compressedSize),
        savedPercent,
        errorText: null
    };
}

/* ── core ────────────────────────────────────────────────────────────────── */

async function compress(url, opts = {}) {
    // 1) Tải file gốc
    const head = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: FETCH_TIMEOUT,
        maxContentLength: MAX_DOWNLOAD,
        maxBodyLength:    MAX_DOWNLOAD,
        headers: { 'User-Agent': randomUA(), 'Referer': new URL(url).origin + '/' },
        validateStatus: s => s >= 200 && s < 400
    });

    const buf = Buffer.from(head.data);
    if (!buf.length) throw new Error('File rỗng hoặc không tải được');
    if (buf.length > MAX_DOWNLOAD) throw new Error('File vượt quá giới hạn 500MB của VideoSmaller');

    const filename = guessFilename(url, head.headers['content-type']);
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
        throw new Error(`Định dạng .${ext} không được hỗ trợ. Cho phép: ${[...ALLOWED_EXT].join(', ')}`);
    }

    // 2) Lấy cookie phiên (VideoSmaller hay set PHPSESSID)
    let cookie = '';
    try {
        const ping = await fetch(ENDPOINT, { headers: { 'User-Agent': randomUA(), 'Accept': 'text/html' } });
        const sc = ping.headers.get('set-cookie');
        if (sc) cookie = sc.split(',').map(c => c.split(';')[0].trim()).join('; ');
    } catch { /* không bắt buộc */ }

    // 3) Build form
    const form = new FormData();
    const mime = head.headers['content-type'] || 'video/mp4';
    form.append('upfile', new Blob([buf], { type: mime }), filename);
    if (opts.lowquality) form.append('lowcompression', '1');
    if (opts.mute)       form.append('removeaudio', '1');
    form.append('scale', opts.scale && ALLOWED_SCALES.has(String(opts.scale)) ? String(opts.scale) : '');
    form.append('submitfile', '1');

    // 4) Upload
    const headers = {
        'User-Agent': randomUA(),
        'Referer':    ENDPOINT,
        'Origin':     'https://www.videosmaller.com',
        'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };
    if (cookie) headers['Cookie'] = cookie;

    const res = await fetch(ENDPOINT, {
        method:  'POST',
        body:    form,
        headers,
        signal:  AbortSignal.timeout(UPLOAD_TIMEOUT)
    });

    if (!res.ok) throw new Error(`videosmaller trả mã ${res.status}`);
    const html = await res.text();
    const parsed = parseResponseHtml(html);
    if (!parsed.ok) {
        throw new Error(parsed.errorText || 'Không lấy được link tải sau khi nén (server có thể đang bận hoặc file quá lớn).');
    }

    return {
        filename,
        originalBytes:   buf.length,
        originalSize:    parsed.originalSize || humanSize(buf.length),
        compressedSize:  parsed.compressedSize,
        compressedBytes: parsed.compressedBytes,
        savedPercent:    parsed.savedPercent,
        downloadUrl:     parsed.downloadUrl,
        deleteUrl:       parsed.deleteUrl
    };
}

/* ── route handler ───────────────────────────────────────────────────────── */

module.exports = {
    name: '/tools/nen-video',
    index: async function (req, res) {
        const url = (req.query.url || '').trim();
        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                example: '/tools/nen-video?url=https://example.com/video.mp4&scale=854&lowquality=1'
            });
        }
        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).json({ status: false, message: 'URL phải bắt đầu bằng http:// hoặc https://' });
        }

        const opts = {
            scale:      req.query.scale,
            lowquality: req.query.lowquality === '1' || req.query.lowquality === 'true',
            mute:       req.query.mute === '1' || req.query.mute === 'true'
        };

        try {
            const r = await compress(url, opts);
            return res.status(200).json({
                status: true,
                filename:        r.filename,
                originalBytes:   r.originalBytes,
                originalSize:    r.originalSize,
                compressedBytes: r.compressedBytes,
                compressedSize:  r.compressedSize,
                savedPercent:    r.savedPercent,
                downloadUrl:     r.downloadUrl,
                deleteUrl:       r.deleteUrl,
                source:          'videosmaller.com',
                note:            'Link tải có thời hạn ngắn — tải về ngay.'
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[NEN-VIDEO] lỗi: ${e.message}`, 'WARN');
            const msg = e.response ? `Tải file gốc lỗi (HTTP ${e.response.status})` : 'Lỗi nén video';
            return res.status(500).json({ status: false, message: msg });
        }
    }
};
