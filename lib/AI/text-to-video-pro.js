'use strict';

const axios = require('axios');
const { runSpace } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE      = 'https://rahul7star-wan2-2-t2v-a14b.hf.space/';
const REFERER   = 'https://taoanhdep.com/';
const FN_INDEX  = 2;
const TRIGGER_ID = 20;
const MODEL_LABEL = 'Wan-AI/Wan2.2-T2V-A14B';
const NEG_DEFAULT = 'Bright tones, overexposed, static, blurred details, subtitles, style, work, painting, image, still, overall gray, worst quality, low quality, JPEG compression residue, ugly, deformed, extra fingers, poorly drawn hands, poorly drawn face, malformed limbs, fused fingers, motionless image, cluttered background, three legs, many people in the background, walking backwards';

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
        if (item.video.url)  return item.video.url;
        if (item.video.path) return `${BASE}file=${item.video.path}`;
    }
    if (item.url)  return item.url;
    if (item.path) return `${BASE}file=${item.path}`;
    if (typeof item === 'string') return item;
    return null;
}

module.exports = {
    name: '/ai/text-to-video-pro',
    index: async (req, res) => {
        const { prompt, negative, width, height, duration, seed, guidance, steps, format } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'prompt'",
                model: MODEL_LABEL,
                params: {
                    prompt:   'Mô tả video muốn tạo (TIẾNG ANH cho kết quả tốt nhất)',
                    negative: '(tuỳ chọn) negative prompt — bỏ trống dùng mặc định',
                    width:    '(tuỳ chọn) chiều rộng 256-1280 — mặc định 896',
                    height:   '(tuỳ chọn) chiều cao 256-1280 — mặc định 512',
                    duration: '(tuỳ chọn) độ dài video (giây) 1-5 — mặc định 2',
                    steps:    '(tuỳ chọn) inference steps 1-30 — mặc định 4',
                    seed:     '(tuỳ chọn) seed cố định — mặc định ngẫu nhiên',
                    guidance: '(tuỳ chọn) CFG guidance 0-10 — mặc định 1',
                    format:   '(tuỳ chọn) "mp4" để trả file binary | mặc định JSON link'
                },
                example: '/ai/text-to-video-pro?prompt=A red panda eating bamboo, cinematic 4k&duration=2'
            });
        }

        try {
            const w     = clampInt(width,    896, 256, 1280);
            const h     = clampInt(height,   512, 256, 1280);
            const dur   = clampFloat(duration, 2, 1, 5);
            const seedVal   = seed ? +seed : 42;
            const randomize = !seed;
            const cfg   = clampFloat(guidance, 1, 0, 10);
            const stepsN = clampInt(steps, 4, 1, 30);

            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: FN_INDEX,
                triggerId: TRIGGER_ID,
                tiers: tiersFor(useProxy),
                buildData: () => [
                    null,                            // 0 input image (T2V → null)
                    String(prompt),                  // 1 prompt
                    h,                               // 2 height
                    w,                               // 3 width
                    String(negative || NEG_DEFAULT), // 4 negative
                    dur,                             // 5 duration (s)
                    cfg,                             // 6 guidance scale
                    stepsN,                          // 7 inference steps
                    seedVal,                         // 8 seed
                    randomize                        // 9 randomize_seed
                ],
                sseTimeoutMs: 600_000
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
                res.set('X-Model', MODEL_LABEL);
                return res.send(Buffer.from(r.data));
            }

            const { cloak } = require('../../utils/security/url-cloak');
            return res.json({
                status: true,
                model: MODEL_LABEL,
                video_url: cloak(req, fullUrl),
                seed: finalSeed,
                width: w, height: h, duration: dur, steps: stepsN,
                transport: out.transport,
                viaProxy: out.viaProxy
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/text-to-video-pro').catch(() => {});
            const log = require('../../utils/logger');
            log(`[TEXT-TO-VIDEO-PRO] lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({
                status: false,
                model: MODEL_LABEL,
                message: 'Lỗi tạo video AI',
                hint: 'Wan 2.2 Space có thể đang ngủ/quá tải — gọi lại sau 30-60s.'
            });
        }
    }
};
