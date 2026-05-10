'use strict';

/**
 * Tạo ảnh anime chất lượng cao bằng Animagine XL 4.0.
 *
 *   GET /ai/anime-xl?prompt=<text>
 *        &negative=<text>            (tuỳ chọn)
 *        &width=<256..1536>          (tuỳ chọn — mặc định 832)
 *        &height=<256..1536>         (tuỳ chọn — mặc định 1216)
 *        &steps=<1..50>              (tuỳ chọn — mặc định 28)
 *        &guidance=<1..15>           (tuỳ chọn — mặc định 5)
 *        &sampler=<name>             (tuỳ chọn — mặc định "Euler a")
 *        &style=<name>               (tuỳ chọn — mặc định "(None)")
 *        &aspect=<ratio>             (tuỳ chọn — mặc định "832 x 1216")
 *        &seed=<0..2147483647>       (tuỳ chọn — mặc định 0)
 *        &upscale=true|false         (tuỳ chọn — mặc định false)
 *        &upscale_by=<1..2>          (tuỳ chọn — mặc định 1.5)
 *        &upscale_strength=<0..1>    (tuỳ chọn — mặc định 0.55)
 *        &quality_tags=true|false    (tuỳ chọn — mặc định true)
 *        &format=json|image
 *
 * Backend: tuan2308/animagine-xl-4.0 (HuggingFace Space).
 */

const { runSpace } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { fetchBuffer } = require('../../utils/http');

const BASE    = 'https://tuan2308-animagine-xl-4-0.hf.space/';
const REFERER = 'https://taoanhdep.com/tao-anh-anime-bang-ai/';

const DEFAULT_NEG =
    'lowres, bad anatomy, bad hands, text, error, missing finger, extra digits, fewer digits, ' +
    'cropped, worst quality, low quality, low score, bad score, average score, signature, watermark, username, blurry';

const ALLOWED_SAMPLERS = new Set(['DPM++ 2M Karras', 'DPM++ SDE Karras', 'DPM++ 2M SDE Karras', 'Euler', 'Euler a', 'DDIM']);

function clampInt(v, lo, hi, def) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}
function clampNum(v, lo, hi, def) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}

module.exports = {
    name: '/ai/anime-xl',
    index: async (req, res) => {
        const q = req.query;

        if (!q.prompt) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'prompt'",
                params: {
                    prompt:           'Mô tả nhân vật/cảnh anime muốn tạo (English tốt nhất)',
                    negative:         '(tuỳ chọn) prompt phủ định',
                    width:            '(tuỳ chọn) 256-1536, mặc định 832',
                    height:           '(tuỳ chọn) 256-1536, mặc định 1216',
                    steps:            '(tuỳ chọn) 1-50, mặc định 28',
                    guidance:         '(tuỳ chọn) 1-15, mặc định 5',
                    sampler:          '(tuỳ chọn) Euler a (mặc định) | Euler | DPM++ 2M Karras | DPM++ SDE Karras | DPM++ 2M SDE Karras | DDIM',
                    style:            '(tuỳ chọn) tên style preset, mặc định "(None)"',
                    aspect:           '(tuỳ chọn) ratio, mặc định "832 x 1216"',
                    seed:             '(tuỳ chọn) 0-2147483647',
                    upscale:          '(tuỳ chọn) true|false, mặc định false',
                    upscale_by:       '(tuỳ chọn) 1-2, mặc định 1.5',
                    upscale_strength: '(tuỳ chọn) 0-1, mặc định 0.55',
                    quality_tags:     '(tuỳ chọn) true|false, mặc định true',
                    format:           '(tuỳ chọn) json (mặc định) | image'
                },
                example: '/ai/anime-xl?prompt=' + encodeURIComponent('1girl, silver hair, blue eyes, cyberpunk city, masterpiece')
            });
        }

        const prompt    = String(q.prompt).trim().slice(0, 1500);
        const negative  = q.negative ? String(q.negative).trim().slice(0, 1500) : DEFAULT_NEG;
        const width     = clampInt(q.width,  256, 1536, 832);
        const height    = clampInt(q.height, 256, 1536, 1216);
        const steps     = clampInt(q.steps,  1, 50, 28);
        const guidance  = clampNum(q.guidance, 1, 15, 5);
        const sampler   = ALLOWED_SAMPLERS.has(q.sampler) ? q.sampler : 'Euler a';
        const style     = q.style || '(None)';
        const aspect    = q.aspect || `${width} x ${height}`;
        const seed      = clampInt(q.seed, 0, 2147483647, 0);
        const upscale   = q.upscale === 'true';
        const upBy      = clampNum(q.upscale_by, 1, 2, 1.5);
        const upStrength = clampNum(q.upscale_strength, 0, 1, 0.55);
        const qualityTags = q.quality_tags !== 'false';

        try {
            const t0 = Date.now();
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: 5,
                triggerId: null,
                tiers: tiersFor(useProxy),
                data: [
                    prompt, negative, seed, width, height, guidance, steps,
                    sampler, aspect, style, upscale, upStrength, upBy, qualityTags
                ]
            });
            const took = Date.now() - t0;

            // out.data[0] = array of generated images
            const images = out.data?.[0] || [];
            const first = images[0];
            const url = first?.image?.url || first?.url;
            if (!url) throw new Error('Không tìm thấy ảnh kết quả');

            if (q.format === 'image') {
                const fb = await fetchBuffer(url);
                const buf = fb?.buffer || fb;
                res.set('Content-Type', 'image/png');
                res.set('Cache-Control', 'no-store');
                return res.send(buf);
            }

            const { cloak, cloakArray } = require('../../utils/security/url-cloak');
            return res.json({
                status:    true,
                image:     cloak(req, url),
                images:    cloakArray(req, images.map(i => i?.image?.url || i?.url).filter(Boolean)),
                prompt, negative, width, height, steps, guidance, sampler, style, aspect, seed,
                upscale, upscale_by: upBy, upscale_strength: upStrength,
                tookMs:    took,
                viaProxy:  out.viaProxy,
                creator:   'Ljzi'
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/anime-xl').catch(() => {});
            const msg = String(e?.message || e);
            return res.status(502).json({
                status: false,
                message: msg,
                hint: 'Space có thể quá tải/cold-start, thử lại sau 10-30s.'
            });
        }
    }
};
