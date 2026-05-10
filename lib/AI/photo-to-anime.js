'use strict';

/**
 * Chuyển ảnh thành tranh anime bằng Space Photo-to-Anime của tuan2308.
 * (Khác với LoRA "Photo-to-Anime" trong /ai/qwen-edit — đây là Space chuyên dụng,
 *  có thể cho kết quả khác.)
 *
 *   GET /ai/photo-to-anime?url=<image_url>
 *        &steps=<1..50>            (tuỳ chọn — mặc định 4)
 *        &guidance=<1..10>         (tuỳ chọn — mặc định 1.0)
 *        &width=<256..1536>        (tuỳ chọn — mặc định 1024)
 *        &height=<256..1536>       (tuỳ chọn — mặc định 1024)
 *        &seed=<0..2147483647>     (tuỳ chọn — mặc định 0)
 *        &randomize=true|false     (tuỳ chọn — mặc định true)
 *        &format=json|image
 *
 * Backend: tuan2308/Photo-to-Anime (HuggingFace Space).
 */

const { runSpace, detectMime } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { fetchBuffer } = require('../../utils/http');

const BASE    = 'https://tuan2308-photo-to-anime.hf.space/';
const REFERER = 'https://taoanhdep.com/tao-anh-anime/';

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
    name: '/ai/photo-to-anime',
    index: async (req, res) => {
        const q = req.query;
        if (!q.url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:       'URL ảnh nguồn (jpg/png/webp, ≤ 12MB)',
                    steps:     '(tuỳ chọn) 1-50, mặc định 4',
                    guidance:  '(tuỳ chọn) 1-10, mặc định 1.0',
                    width:     '(tuỳ chọn) 256-1536, mặc định 1024',
                    height:    '(tuỳ chọn) 256-1536, mặc định 1024',
                    seed:      '(tuỳ chọn) 0-2147483647',
                    randomize: '(tuỳ chọn) true|false, mặc định true',
                    format:    '(tuỳ chọn) json (mặc định) | image'
                },
                example: '/ai/photo-to-anime?url=https://i.imgur.com/xxxx.jpg'
            });
        }

        const steps     = clampInt(q.steps, 1, 50, 4);
        const guidance  = clampNum(q.guidance, 1, 10, 1.0);
        const width     = clampInt(q.width,  256, 1536, 1024);
        const height    = clampInt(q.height, 256, 1536, 1024);
        const seed      = clampInt(q.seed, 0, 2147483647, 0);
        const randomize = q.randomize === 'false' ? false : true;

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
                fnIndex: 0,           // /convert_to_anime
                triggerId: 15,
                tiers: tiersFor(useProxy),
                image: { buf, ext, ct },
                buildData: (meta) => [meta, seed, randomize, guidance, steps, height, width]
            });
            const took = Date.now() - t0;

            // returns: [Anime Result (image obj), Seed]
            const arr = out.data || [];
            const outUrl = arr[0]?.url || arr[0]?.image?.url;
            const seedOut = typeof arr[1] === 'number' ? arr[1] : seed;
            if (!outUrl) throw new Error('Không tìm thấy URL ảnh kết quả');

            if (q.format === 'image') {
                const o = await fetchBuffer(outUrl);
                const ob = o?.buffer || o;
                res.set('Content-Type', 'image/png');
                res.set('Cache-Control', 'no-store');
                return res.send(ob);
            }

            const { cloak, sanitizeString } = require('../../utils/security/url-cloak');
            return res.json({
                status:   true,
                source:   q.url,
                image:    cloak(req, outUrl),
                seed:     seedOut,
                steps, guidance, width, height, randomize,
                tookMs:   took,
                viaProxy: out.viaProxy,
                creator:  'Ljzi'
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/photo-to-anime').catch(() => {});
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
