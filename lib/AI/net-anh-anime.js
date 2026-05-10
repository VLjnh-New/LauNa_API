'use strict';

const axios = require('axios');
const { fetchBuffer } = require('../../utils/http');
const { runSpace } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE = 'https://tuan2308-upscaler-2.hf.space/';
const REFERER = 'https://taoanhdep.com/lam-net-anh-anime-bang-ai/';

const MODELS = [
    'RealESRGAN_x4plus_anime_6B',
    'RealESRGAN_x4plus',
    'RealESRNet_x4plus',
    'RealESRGAN_x2plus',
    'realesr-general-x4v3'
];

async function downloadAsBase64(url) {
    const r = await axios.get(url, {
        responseType: 'arraybuffer', timeout: 20000,
        headers: { 'Referer': REFERER, 'User-Agent': randomUA() },
        validateStatus: s => s < 400
    });
    const mime = r.headers['content-type'] || 'image/png';
    return `data:${mime};base64,${Buffer.from(r.data).toString('base64')}`;
}

module.exports = {
    name: '/ai/net-anh-anime',
    index: async (req, res) => {
        const { url, model, scale, face, format } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:    'URL ảnh anime cần làm nét',
                    model:  `(tuỳ chọn) Model dùng — mặc định: RealESRGAN_x4plus_anime_6B | ${MODELS.join(' | ')}`,
                    scale:  '(tuỳ chọn) Hệ số phóng to — 1-6, mặc định: 2',
                    face:   '(tuỳ chọn) Làm nét khuôn mặt — true | false (mặc định: false)',
                    format: '(tuỳ chọn) base64 (mặc định) | img'
                },
                example: '/ai/net-anh-anime?url=https://example.com/anime.jpg&scale=4'
            });
        }

        const modelName = MODELS.includes(model) ? model : 'RealESRGAN_x4plus_anime_6B';
        const scaleVal = Math.min(6, Math.max(1, parseInt(scale) || 2));
        const faceEnhance = face === 'true';

        try {
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const img = await fetchBuffer(url);
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: 1,
                triggerId: 17,
                tiers: tiersFor(useProxy),
                image: { buf: img.buffer, ext: img.ext, ct: img.contentType, origName: 'image.jpg' },
                buildData: meta => [meta, modelName, 0.5, faceEnhance, scaleVal],
                sseTimeoutMs: 180_000
            });

            const imgUrl = out.data?.[0]?.url;
            if (!imgUrl) throw new Error('Không tìm thấy URL ảnh kết quả');

            const dataUrl = await downloadAsBase64(imgUrl);

            if (format === 'img') {
                const raw = dataUrl.split(',')[1];
                const mime = dataUrl.split(';')[0].slice(5);
                res.set('Content-Type', mime);
                res.set('Cache-Control', 'no-store');
                return res.send(Buffer.from(raw, 'base64'));
            }

            return res.json({
                status: true,
                model: modelName,
                scale: scaleVal,
                image: dataUrl,
                provider: out.viaProxy ? 'proxy' : 'direct',
                transport: out.transport
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/net-anh-anime').catch(() => {});
            const log = require('../../utils/logger');
            log(`[AI-ANIME] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi chuyển ảnh anime' });
        }
    }
};
