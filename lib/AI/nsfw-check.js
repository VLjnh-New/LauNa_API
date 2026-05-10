'use strict';

/**
 * Kiểm tra ảnh có nội dung NSFW không.
 *
 *   GET /ai/nsfw-check?url=<image_url>
 *
 * Backend: elysiatools.com (NSFWJS model — 5 nhãn: Neutral, Porn, Drawing, Hentai, Sexy).
 * Không cần API key, hoàn toàn miễn phí.
 * - Tự xoay User-Agent ngẫu nhiên mỗi request (100 UA pool).
 * - Fallback qua proxy pool khi bị block IP.
 *
 * Response:
 *   {
 *     status: true,
 *     isSafe: true/false,
 *     confidence: 100,
 *     recommendation: "Safe" | "Unsafe",
 *     predictions: [{ category, probability, risk }],
 *     tookMs: 1200,
 *     creator: "Ljzi"
 *   }
 */

const axios    = require('axios');
const FormData = require('form-data');
const { fetchBuffer }   = require('../../utils/http');
const { browserHeaders } = require('../../utils/http/browser-headers');
const { proxyPool }      = require('../../utils/http/proxy-pool');

const UPLOAD_URL  = 'https://elysiatools.com/upload/nsfw-image-detector';
const ANALYZE_URL = 'https://elysiatools.com/en/api/tools/nsfw-image-detector';
const REFERER     = 'https://elysiatools.com/en/tools/nsfw-image-detector';
const ORIGIN      = 'https://elysiatools.com';

const RETRYABLE = /429|timeout|ECONNRESET|ETIMEDOUT|ECONNREFUSED|socket hang up|ENOTFOUND/i;
const MAX_TRIES = 3;

function makeHeaders(extra = {}) {
    return {
        ...browserHeaders({ referer: REFERER, origin: ORIGIN, purpose: 'cors' }),
        ...extra,
    };
}

async function doRequest(config, attempt = 0) {
    try {
        // Lần 1 gọi thẳng, lần 2+ qua proxy
        if (attempt === 0) {
            return await axios({ ...config, validateStatus: () => true });
        }
        return await proxyPool.axios({ ...config, validateStatus: () => true });
    } catch (e) {
        if (attempt < MAX_TRIES - 1 && RETRYABLE.test(String(e?.message || ''))) {
            return doRequest(config, attempt + 1);
        }
        throw e;
    }
}

async function checkNsfw(imgBuf, ext) {
    const ct = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

    // ── Bước 1: Upload ảnh ────────────────────────────────────────────────────
    const fd = new FormData();
    fd.append('file', imgBuf, { filename: `image.${ext || 'jpg'}`, contentType: ct });

    const upResp = await doRequest({
        method:  'post',
        url:     UPLOAD_URL,
        data:    fd,
        headers: makeHeaders(fd.getHeaders()),
        timeout: 25_000,
    });

    if (upResp.status === 429) throw Object.assign(new Error('Rate limit (upload)'), { status: 429 });
    if (upResp.status !== 200 || !upResp.data?.filePath) {
        throw new Error(`Upload thất bại (HTTP ${upResp.status})`);
    }

    // ── Bước 2: Phân tích NSFW ────────────────────────────────────────────────
    const anaResp = await doRequest({
        method:  'post',
        url:     ANALYZE_URL,
        data:    JSON.stringify({ imageFile: upResp.data.filePath, sensitivity: 0.5, analysisMode: 'model' }),
        headers: makeHeaders({ 'Content-Type': 'application/json' }),
        timeout: 40_000,
    });

    if (anaResp.status === 429) throw Object.assign(new Error('Rate limit (analyze)'), { status: 429 });
    if (anaResp.status !== 200) throw new Error(`Phân tích thất bại (HTTP ${anaResp.status})`);

    const inner = anaResp.data?.data?.data;
    if (!inner?.success) throw new Error(inner?.error || 'Phân tích thất bại, thử lại sau');

    return inner;
}

module.exports = {
    name: '/ai/nsfw-check',
    index: async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status:  false,
                message: "Thiếu tham số 'url'",
                params: {
                    url: 'URL ảnh cần kiểm tra NSFW (jpg/png/webp, ≤ 20MB)',
                },
                example: '/ai/nsfw-check?url=https://example.com/anh.jpg',
                note:    'Trả về 5 nhãn: Neutral, Porn, Drawing, Hentai, Sexy kèm % xác suất'
            });
        }

        try {
            const t0  = Date.now();
            const img = await fetchBuffer(url);
            const buf = img?.buffer || img;

            if (!buf || !buf.length) throw new Error('Không tải được ảnh nguồn');
            if (buf.length > 20 * 1024 * 1024) throw new Error('Ảnh quá lớn (giới hạn 20MB)');

            const result = await checkNsfw(buf, img.ext || 'jpg');
            const tookMs = Date.now() - t0;

            return res.json({
                status:         true,
                isSafe:         result.isSafe,
                confidence:     result.confidence,
                recommendation: result.recommendation,
                predictions:    result.predictions,
                tookMs,
                creator:        'Ljzi'
            });
        } catch (e) {
            const msg  = String(e?.message || e);
            const code = /quá lớn|Thiếu|tải được ảnh/.test(msg) ? 400
                       : e?.status === 429 ? 429 : 502;
            return res.status(code).json({
                status:  false,
                message: msg,
                hint:    code === 429 ? 'Đang bị giới hạn tốc độ, thử lại sau vài giây.'
                       : code === 502 ? 'Server xử lý ảnh có thể bận, thử lại sau vài giây.'
                       : undefined
            });
        }
    }
};
