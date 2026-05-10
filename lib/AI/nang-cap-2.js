'use strict';

/**
 * Nâng cấp ảnh bằng Upscaler-Pro v2 — phiên bản mới nhất với nhiều thuật toán + face restore.
 *
 *   GET /ai/nang-cap-2?url=<image_url>
 *        &model=<name>          (tuỳ chọn — mặc định "Lanczos")
 *        &scale=<1..4>          (tuỳ chọn — mặc định 1.5)
 *        &output=png|jpg|webp   (tuỳ chọn — mặc định png)
 *        &face_restore=true|false (tuỳ chọn — mặc định false)
 *        &format=json|image
 *
 * Backend: tuan2308/Upscaler-pro-2 (HuggingFace Space).
 * Khác /ai/nang-cap (Upscaler-pro v1) — bản v2 có thêm face_restore và nhiều model hơn.
 */

const { runSpace, detectMime } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { fetchBuffer } = require('../../utils/http');

const BASE    = 'https://tuan2308-upscaler-pro-2.hf.space/';
const REFERER = 'https://taoanhdep.com/nang-cap-chat-luong-anh-bang-ai-v2/';

const ALLOWED_MODELS = new Set([
    'None', 'Lanczos', 'Nearest', 'Latent',
    'Latent (antialiased)', 'Latent (bicubic)', 'Latent (bicubic antialiased)',
    'Latent (nearest)', 'Latent (nearest-exact)',
    'ESRGAN_4x', 'R-ESRGAN General 4xV3', 'R-ESRGAN General WDN 4xV3',
    'R-ESRGAN AnimeVideo', 'R-ESRGAN 4x+', 'R-ESRGAN 4x+ Anime6B', 'R-ESRGAN 2x+',
    'ScuNET GAN', 'ScuNET PSNR', 'RealESRNet_x4plus',
    '4x-UltraSharp', 'Real-ESRGAN-Anime-finetuning',
    '4x_foolhardy_Remacri', 'Remacri4xExtraSmoother', 'AnimeSharp4x',
    'lollypop', 'RealisticRescaler4x', 'NickelbackFS4x'
]);
const ALLOWED_OUTPUT = new Set(['png', 'jpg']);

function clampNum(v, lo, hi, def) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}

module.exports = {
    name: '/ai/nang-cap-2',
    index: async (req, res) => {
        const q = req.query;
        if (!q.url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:          'URL ảnh nguồn (jpg/png/webp, ≤ 12MB)',
                    model:        '(tuỳ chọn) Lanczos (mặc định) | R-ESRGAN 4x+ | R-ESRGAN 4x+ Anime6B | R-ESRGAN AnimeVideo | 4x-UltraSharp | RealESRNet_x4plus | …',
                    scale:        '(tuỳ chọn) hệ số phóng 1-4, mặc định 1.5',
                    output:       '(tuỳ chọn) png (mặc định) | jpg',
                    face_restore: '(tuỳ chọn) true|false, mặc định false (bật để khôi phục mặt)',
                    format:       '(tuỳ chọn) json (mặc định) | image'
                },
                example: '/ai/nang-cap-2?url=https://i.imgur.com/xxxx.jpg&model=RealESRGAN_x4plus&scale=2&face_restore=true'
            });
        }

        const model       = ALLOWED_MODELS.has(q.model) ? q.model : 'Lanczos';
        const scale       = clampNum(q.scale, 1, 4, 1.5);
        const output      = ALLOWED_OUTPUT.has((q.output || '').toLowerCase()) ? q.output.toLowerCase() : 'png';
        const faceRestore = q.face_restore === 'true';

        try {
            const fb = await fetchBuffer(q.url);
            const buf = fb?.buffer || fb;
            if (!buf || !buf.length) throw new Error('Không tải được ảnh nguồn');
            if (buf.length > 12 * 1024 * 1024) throw new Error('Ảnh quá lớn (giới hạn 12MB)');
            const { ext, ct } = detectMime(buf);

            const t0 = Date.now();
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: 0,        // /upscale
                triggerId: 10,
                tiers: tiersFor(useProxy),
                image: { buf, ext, ct },
                buildData: (meta) => [meta, model, scale, output, faceRestore]
            });
            const took = Date.now() - t0;

            // returns: [Result (image obj), value_14 (string)]
            const arr = out.data || [];
            const outUrl = arr[0]?.url || arr[0]?.image?.url;
            if (!outUrl) throw new Error('Không tìm thấy URL ảnh kết quả');

            if (q.format === 'image') {
                const o = await fetchBuffer(outUrl);
                const ob = o?.buffer || o;
                const mime = output === 'jpg' || output === 'jpeg' ? 'image/jpeg'
                           : output === 'webp' ? 'image/webp' : 'image/png';
                res.set('Content-Type', mime);
                res.set('Cache-Control', 'no-store');
                return res.send(ob);
            }

            const { cloak, sanitizeString } = require('../../utils/security/url-cloak');
            return res.json({
                status:   true,
                source:   q.url,
                image:    cloak(req, outUrl),
                model, scale, output, face_restore: faceRestore,
                tookMs:   took,
                viaProxy: out.viaProxy,
                creator:  'Ljzi'
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/nang-cap-2').catch(() => {});
            const { sanitizeString } = require('../../utils/security/url-cloak');
            const msg = sanitizeString(String(e?.message || e));
            const code = /quá lớn|Thiếu|tải được ảnh/.test(msg) ? 400 : 502;
            return res.status(code).json({
                status:  false,
                message: msg,
                hint:    code === 502 ? 'Space có thể đang quá tải, thử lại sau 10-30s.' : undefined
            });
        }
    }
};
