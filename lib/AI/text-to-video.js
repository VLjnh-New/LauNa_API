'use strict';

const axios = require('axios');
const { runSpace } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE = 'https://lightricks-ltx-video-distilled.hf.space/';
const REFERER = 'https://taoanhdep.com/';
const FN_INDEX = 4;       // /text_to_video
const TRIGGER_ID = 17;
const NEG_DEFAULT = 'worst quality, inconsistent motion, blurry, jittery, distorted';

function clampInt(v, def, min, max) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
}
function clampFloat(v, def, min, max) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
}

function extractVideoUrl(item) {
    if (!item) return null;
    if (item.video) {
        if (item.video.url) return item.video.url;
        if (item.video.path) return `${BASE}file=${item.video.path}`;
    }
    if (item.url) return item.url;
    if (item.path) return `${BASE}file=${item.path}`;
    if (typeof item === 'string') return item;
    return null;
}

module.exports = {
    name: '/ai/text-to-video',
    index: async (req, res) => {
        const { prompt, negative, width, height, duration, seed, guidance, format } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'prompt'",
                model: 'Lightricks/LTX-Video-Distilled',
                params: {
                    prompt:   'Mô tả video muốn tạo (TIẾNG ANH cho kết quả tốt nhất)',
                    negative: '(tuỳ chọn) Negative prompt — bỏ trống dùng mặc định',
                    width:    '(tuỳ chọn) chiều rộng 256-1280 — mặc định 704',
                    height:   '(tuỳ chọn) chiều cao 256-1280 — mặc định 512',
                    duration: '(tuỳ chọn) độ dài video (giây) 1-8 — mặc định 2',
                    seed:     '(tuỳ chọn) seed cố định — mặc định ngẫu nhiên',
                    guidance: '(tuỳ chọn) CFG guidance 0-10 — mặc định 1',
                    format:   '(tuỳ chọn) url (mặc định JSON link) | mp4 (binary trực tiếp)'
                },
                example: '/ai/text-to-video?prompt=A cat playing piano in a jazz bar&duration=3'
            });
        }

        try {
            const w   = clampInt(width,    704, 256, 1280);
            const h   = clampInt(height,   512, 256, 1280);
            const dur = clampFloat(duration, 2, 1, 8);
            const seedVal   = seed ? +seed : 42;
            const randomize = !seed;
            const cfg = clampFloat(guidance, 1, 0, 10);

            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: FN_INDEX,
                triggerId: TRIGGER_ID,
                tiers: tiersFor(useProxy),
                buildData: () => [
                    String(prompt),                       // 0 prompt
                    String(negative || NEG_DEFAULT),      // 1 negative_prompt
                    null,                                 // 2 input_image_filepath
                    null,                                 // 3 input_video_filepath
                    h,                                    // 4 height_ui
                    w,                                    // 5 width_ui
                    'text-to-video',                      // 6 mode
                    dur,                                  // 7 duration_ui
                    9,                                    // 8 ui_frames_to_use
                    seedVal,                              // 9 seed_ui
                    randomize,                            // 10 randomize_seed
                    cfg,                                  // 11 ui_guidance_scale
                    true                                  // 12 improve_texture_flag
                ],
                sseTimeoutMs: 600_000  // 10 phút (LTX text→video trên ZeroGPU có thể chậm)
            });

            const videoUrl  = extractVideoUrl(out.data?.[0]);
            const finalSeed = out.data?.[1];
            if (!videoUrl) throw new Error('Không tìm thấy URL video kết quả');
            const fullUrl = videoUrl.startsWith('/') ? BASE.replace(/\/$/, '') + videoUrl : videoUrl;

            if (format === 'mp4') {
                const r = await axios.get(fullUrl, {
                    responseType: 'arraybuffer', timeout: 180_000,
                    headers: { Referer: REFERER, 'User-Agent': randomUA() },
                    validateStatus: s => s < 400
                });
                res.set('Content-Type', r.headers['content-type'] || 'video/mp4');
                res.set('Cache-Control', 'no-store');
                return res.send(Buffer.from(r.data));
            }

            const { cloak } = require('../../utils/security/url-cloak');
            return res.json({
                status: true,
                video_url: cloak(req, fullUrl),
                seed: finalSeed,
                width: w, height: h, duration: dur,
                transport: out.transport,
                viaProxy: out.viaProxy
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/text-to-video').catch(() => {});
            const log = require('../../utils/logger');
            log(`[TEXT-TO-VIDEO] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({
                status: false,
                message: 'Lỗi tạo video AI',
                hint: 'LTX-Video Space có thể đang ngủ — gọi lại sau 30-60s.'
            });
        }
    }
};
