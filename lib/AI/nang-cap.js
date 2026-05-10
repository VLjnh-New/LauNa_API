'use strict';

const axios = require('axios');
const { fetchBuffer } = require('../../utils/http');
const { runSpace } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE = 'https://tuan2308-upscaler-pro.hf.space/';
const REFERER = 'https://taoanhdep.com/nang-cap-chat-luong-anh-bang-ai/';

const MODELS = [
    'R-ESRGAN 4x+',
    'R-ESRGAN 4x+ Anime6B',
    'R-ESRGAN General 4xV3',
    'R-ESRGAN 2x+',
    'ESRGAN_4x',
    'RealESRNet_x4plus',
    'Lanczos',
    '4x-UltraSharp',
    'Real-ESRGAN-Anime-finetuning',
    'AnimeSharp4x',
    'ScuNET GAN',
    'ScuNET PSNR'
];

async function downloadAsBase64(url) {
    const r = await axios.get(url, {
        responseType: 'arraybuffer', timeout: 30000,
        headers: { 'Referer': REFERER, 'User-Agent': randomUA() },
        validateStatus: s => s < 400
    });
    const mime = r.headers['content-type'] || 'image/png';
    return `data:${mime};base64,${Buffer.from(r.data).toString('base64')}`;
}

module.exports = {
    name: '/ai/nang-cap',
    index: async (req, res) => {
        const { url, model, scale, face, format } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:    'URL ảnh cần nâng cấp chất lượng',
                    model:  `(tuỳ chọn) Model — mặc định: R-ESRGAN 4x+ | ${MODELS.slice(0, 5).join(' | ')} | ...`,
                    scale:  '(tuỳ chọn) Hệ số phóng to — 1.0-4.0, mặc định: 2',
                    face:   '(tuỳ chọn) Làm nét khuôn mặt (GFPGAN) — true | false (mặc định: false)',
                    format: '(tuỳ chọn) base64 (mặc định) | img'
                },
                models: MODELS,
                example: '/ai/nang-cap?url=https://example.com/photo.jpg&scale=2&face=true'
            });
        }

        const modelName = MODELS.includes(model) ? model : 'R-ESRGAN 4x+';
        const scaleVal = Math.min(4.0, Math.max(1.0, parseFloat(scale) || 2.0));
        const faceEnhance = face === 'true';

        try {
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const img = await fetchBuffer(url);
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: 0,
                triggerId: 10,
                tiers: tiersFor(useProxy),
                image: { buf: img.buffer, ext: img.ext, ct: img.contentType, origName: 'photo.jpg' },
                buildData: meta => [meta, modelName, scaleVal, 'png', faceEnhance],
                sseTimeoutMs: 300_000
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
            noteBlocked(req, e, '/ai/nang-cap').catch(() => {});
            const log = require('../../utils/logger');
            log(`[AI-NANG-CAP] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi nâng cấp ảnh' });
        }
    }
};
