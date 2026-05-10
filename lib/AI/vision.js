'use strict';

const { askGeminiVision, GEMINI_MODEL } = require('../../utils/gemini-vision');
const { shouldUseProxy, noteBlocked } = require('../../utils/ai-proxy-helper');

module.exports = {
    name: '/gemini/vision',
    index: async (req, res) => {
        const url    = req.query.url;
        const base64 = req.query.base64 || req.body?.base64;
        const prompt = req.query.prompt || req.body?.prompt || 'Mô tả chi tiết nội dung trong ảnh này';
        const explicit = req.query.proxy === '1' || req.query.proxy === 'true' || req.body?.proxy === true;
        const useProxy = await shouldUseProxy(req, explicit);

        if (!url && !base64) {
            return res.status(400).json({
                status:  false,
                message: "Thiếu ảnh — truyền 'url' (URL ảnh) hoặc 'base64' (chuỗi base64)",
                example: {
                    url_mode:    '/gemini/vision?url=https://example.com/image.jpg&prompt=Mô tả ảnh này',
                    base64_mode: "POST /gemini/vision  body: { base64: 'data:image/jpeg;base64,...', prompt: '...' }",
                },
                model: GEMINI_MODEL,
            });
        }

        try {
            const result = await askGeminiVision(url || base64, prompt, useProxy);
            return res.status(200).json({
                status: true,
                model:  GEMINI_MODEL,
                prompt,
                proxy:  useProxy,
                result,
            });
        } catch (e) {
            noteBlocked(req, e, '/gemini/vision').catch(() => {});
            const log = require('../../utils/logger');
            log(`[VISION] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({
                status:  false,
                message: 'Lỗi phân tích ảnh AI',
            });
        }
    },
};
