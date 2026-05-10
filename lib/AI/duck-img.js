'use strict';

const { duckFetch } = require('./duck-core');
const log           = require('../../utils/logger');

// ─── Parse SSE image response ─────────────────────────────────────────────────
//   partial-image = PROGRESSIVE UPDATE (mỗi event cùng id thay thế event trước)
//   generated-image = bản hoàn chỉnh (ưu tiên)
//   KHÔNG concat/join các result — chỉ lấy cái cuối cùng
function parseSseImage(raw) {
    const byId = new Map();
    const order = [];
    let generatedImage = null;
    let title = '';

    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const chunk = t.slice(5).trim();
        if (chunk === '[DONE]') break;

        const ctrlM = chunk.match(/^\[CHAT_TITLE:(.+)\]$/);
        if (ctrlM) { title = ctrlM[1]; continue; }
        if (chunk.startsWith('[')) continue;

        try {
            const obj = JSON.parse(chunk);
            if (obj.role === 'generated-image' && obj.result) {
                generatedImage = obj.result;
            } else if (obj.role === 'partial-image' && obj.result) {
                if (!byId.has(obj.id)) order.push(obj.id);
                byId.set(obj.id, obj.result);
            }
        } catch {}
    }

    const base64 = generatedImage
        || (order.length ? byId.get(order[order.length - 1]) : '');

    return { base64: base64 || '', title };
}

// ─── Route ────────────────────────────────────────────────────────────────────
module.exports = {
    name:   '/ai/duck/img',
    params: ['prompt'],

    index: async (req, res) => {
        const prompt = (req.query.prompt || '').trim();

        if (!prompt) {
            return res.status(400).json({
                status:  false,
                message: "Thiếu tham số 'prompt'",
                params:  { prompt: 'Mô tả ảnh (tiếng Anh hiệu quả hơn)' },
                note:    'Trả về ảnh JPEG trực tiếp. Tự động rotate domain + proxy + UA.',
                example: '/ai/duck/img?prompt=A dragon flying over mountains, fantasy art',
            });
        }

        try {
            const raw = await duckFetch({
                path: '/duckchat/v1/chat',
                body: {
                    model:                'image-generation',
                    messages:             [{ role: 'user', content: prompt }],
                    canUseTools:          true,
                    canUseApproxLocation: null,
                    metadata: { toolChoice: { NewsSearch: false, VideosSearch: false, LocalSearch: false, WeatherForecast: false } },
                },
            });

            const { base64, title } = parseSseImage(raw);
            if (!base64) throw new Error('Duck.ai không trả về ảnh.');

            const imgBuf = Buffer.from(base64, 'base64');
            res.setHeader('Content-Type', 'image/jpeg');
            res.setHeader('Content-Length', imgBuf.length);
            if (title) res.setHeader('X-Image-Title', title.replace(/[^\x20-\x7E]/g, '').trim());
            res.setHeader('Cache-Control', 'public, max-age=300');
            return res.end(imgBuf);
        } catch (e) {
            log(`[DUCK-IMG] ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: e.message });
        }
    },
};
