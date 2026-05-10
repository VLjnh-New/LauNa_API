'use strict';

/**
 * /img-tool — Xử lý ảnh: convert format, resize, strip EXIF, optimize.
 *
 * Cách dùng:
 *   GET  /img-tool?url=https://...&format=webp&w=800&q=85&strip=1
 *   POST /img-tool   (multipart không hỗ trợ — dùng URL hoặc base64 trong body)
 *
 * Tham số:
 *   url      URL ảnh nguồn (bắt buộc)
 *   format   jpg|png|webp|avif (default giữ nguyên)
 *   w, h     resize chiều rộng/cao (giữ tỉ lệ nếu chỉ 1 chiều)
 *   q        quality 1-100 (default 80)
 *   strip    1 = xoá EXIF (default 1)
 *   fit      cover|contain|fill|inside|outside (default inside)
 */

const sharp = require('sharp');
const { fetchBuffer } = require('../../utils/http');

const ALLOWED = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', avif: 'avif' };

module.exports = {
    name: '/img-tool',
    index: async (req, res) => {
        const url = (req.query.url || req.body?.url || '').toString().trim();
        const format = (req.query.format || '').toString().toLowerCase();
        const w = parseInt(req.query.w || req.query.width || '0', 10);
        const h = parseInt(req.query.h || req.query.height || '0', 10);
        const q = Math.min(100, Math.max(1, parseInt(req.query.q || '80', 10)));
        const strip = req.query.strip !== '0';
        const fit = (req.query.fit || 'inside').toString();

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu 'url'.",
                example: '/img-tool?url=https://picsum.photos/1600&format=webp&w=800&q=80'
            });
        }
        if (format && !ALLOWED[format]) {
            return res.status(400).json({ status: false, message: `format không hỗ trợ. Cho phép: ${Object.keys(ALLOWED).join(', ')}.` });
        }
        if (w < 0 || w > 8000 || h < 0 || h > 8000) {
            return res.status(400).json({ status: false, message: 'w/h phải trong khoảng 0-8000.' });
        }

        try {
            const { buffer } = await fetchBuffer(url);

            let pipe = sharp(buffer, { failOn: 'none' });
            if (strip) pipe = pipe.rotate(); // auto orient + drop EXIF

            if (w || h) {
                pipe = pipe.resize({
                    width: w || null,
                    height: h || null,
                    fit,
                    withoutEnlargement: true
                });
            }

            const meta = await sharp(buffer).metadata();
            const targetFmt = format ? ALLOWED[format] : (meta.format === 'jpeg' ? 'jpeg' : meta.format);

            switch (targetFmt) {
                case 'jpeg': pipe = pipe.jpeg({ quality: q, mozjpeg: true }); break;
                case 'png':  pipe = pipe.png({ quality: q, compressionLevel: 9, palette: true }); break;
                case 'webp': pipe = pipe.webp({ quality: q }); break;
                case 'avif': pipe = pipe.avif({ quality: q }); break;
                default:     pipe = pipe.toFormat(targetFmt);
            }

            const out = await pipe.toBuffer({ resolveWithObject: true });

            res.setHeader('Content-Type', `image/${targetFmt === 'jpeg' ? 'jpeg' : targetFmt}`);
            res.setHeader('X-Original-Size', meta.size || buffer.length);
            res.setHeader('X-Output-Size', out.info.size);
            res.setHeader('X-Output-Width', out.info.width);
            res.setHeader('X-Output-Height', out.info.height);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.end(out.data);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[IMG-TOOL] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi xử lý ảnh' });
        }
    }
};
