'use strict';

/**
 * Xoá nền ảnh bằng AI (BiRefNet) — sản phẩm trả về PNG nền trong suốt.
 *
 *   GET /ai/xoa-nen-ai?url=<image_url>&format=json|image
 *
 * Backend: tuan2308/background-removal (HuggingFace Space).
 * Khác với /ai/xoa-nen (dùng `sharp` local) — route này dùng AI nên kết quả mượt hơn nhiều
 * cho ảnh phức tạp (tóc, viền mềm, vật thể nhiều chi tiết).
 */

const { runSpace, detectMime } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { fetchBuffer } = require('../../utils/http');

const BASE    = 'https://tuan2308-background-removal.hf.space/';
const REFERER = 'https://taoanhdep.com/xoa-nen-anh-online-bang-ai/';

module.exports = {
    name: '/ai/xoa-nen-ai',
    index: async (req, res) => {
        const { url, format } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:    'URL ảnh cần xoá nền (jpg/png/webp, ≤ 12MB)',
                    format: '(tuỳ chọn) json (mặc định) | image (trả PNG trong suốt trực tiếp)'
                },
                example: '/ai/xoa-nen-ai?url=https://i.imgur.com/xxxx.jpg'
            });
        }

        try {
            const fb = await fetchBuffer(url);
            const buf = fb?.buffer || fb;
            if (!buf || !buf.length) throw new Error('Không tải được ảnh nguồn');
            if (buf.length > 12 * 1024 * 1024) throw new Error('Ảnh quá lớn (giới hạn 12MB)');
            const { ext, ct } = detectMime(buf);

            const t0 = Date.now();
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const out = await runSpace({
                base: BASE,
                referer: REFERER,
                fnIndex: 2,        // /image
                triggerId: 13,
                tiers: tiersFor(useProxy),
                image: { buf, ext, ct },
                buildData: (meta) => [meta]
            });
            const took = Date.now() - t0;

            // returns: data[0] = tuple[Original, ProcessedImage] (mỗi cái là FileData)
            const arr = out.data || [];
            const tuple = Array.isArray(arr[0]) ? arr[0] : arr;
            // Phần tử thứ 2 trong tuple là ảnh đã xoá nền (PNG trong suốt)
            const processed = tuple[1] || tuple[0];
            const outUrl = processed?.url || processed?.image?.url;
            if (!outUrl) throw new Error('Không tìm thấy URL ảnh đã xoá nền');

            if (format === 'image') {
                const o = await fetchBuffer(outUrl);
                const ob = o?.buffer || o;
                res.set('Content-Type', 'image/png');
                res.set('Cache-Control', 'no-store');
                res.set('Content-Disposition', 'inline; filename="no-bg.png"');
                return res.send(ob);
            }

            const { cloak, sanitizeString } = require('../../utils/security/url-cloak');
            return res.json({
                status:   true,
                source:   url,
                image:    cloak(req, outUrl),
                tookMs:   took,
                viaProxy: out.viaProxy,
                creator:  'Ljzi'
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/xoa-nen-ai').catch(() => {});
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
