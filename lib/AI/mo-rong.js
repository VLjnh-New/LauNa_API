'use strict';

const axios = require('axios');
const { fetchBuffer } = require('../../utils/http');
const { runSpace } = require('../../utils/http/hf-space');
const { shouldUseProxy, noteBlocked, tiersFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE = 'https://jallenjia-diffusers-image-outpaint.hf.space/';
const REFERER = 'https://taoanhdep.com/mo-rong-hinh-anh-bang-ai/';
const FN_INDEX = 7;  // /infer endpoint (lấy từ /config)

const RATIO_SIZES = {
    '1/1':  { width: 1024, height: 1024 },
    '16/9': { width: 1280, height: 720  },
    '9/16': { width: 720,  height: 1280 },
    '4/3':  { width: 1024, height: 768  },
    '3/4':  { width: 768,  height: 1024 },
    '2/3':  { width: 768,  height: 1152 },
    '3/2':  { width: 1152, height: 768  }
};

const ALIGNMENTS = ['Middle', 'Left', 'Right', 'Top', 'Bottom'];

function getOverlapFlags(alignment) {
    switch (alignment) {
        case 'Left':   return { left: false, right: true,  top: true,  bottom: true  };
        case 'Right':  return { left: true,  right: false, top: true,  bottom: true  };
        case 'Top':    return { left: true,  right: true,  top: false, bottom: true  };
        case 'Bottom': return { left: true,  right: true,  top: true,  bottom: false };
        default:       return { left: true,  right: true,  top: true,  bottom: true  };
    }
}

function extractUrl(item) {
    if (!item) return null;
    if (item.url) return item.url;
    if (item.path) return `${BASE}file=${item.path}`;
    if (typeof item === 'string') return item.startsWith('http') ? item : `${BASE}file=${item}`;
    return null;
}

async function doMoRong({ imgBuf, ext, ct, width, height, alignment, overlapPct, steps, prompt, useProxy = false }) {
    const flags = getOverlapFlags(alignment);

    const out = await runSpace({
        base: BASE,
        referer: REFERER,
        fnIndex: FN_INDEX,
        triggerId: null,
        tiers: tiersFor(useProxy),
        gradioPrefix: '',  // Space này không dùng prefix gradio_api/
        image: { buf: imgBuf, ext, ct, origName: `image.${ext}` },
        buildData: meta => [
            meta, width, height, overlapPct, steps,
            'Full', 50, prompt || '', alignment,
            flags.left, flags.right, flags.top, flags.bottom
        ],
        sseTimeoutMs: 300_000
    });

    // /infer trả ImageSlider [original, result] hoặc FileData đơn
    const first = out.data?.[0];
    let imgUrl;
    if (Array.isArray(first)) imgUrl = extractUrl(first[1]) || extractUrl(first[0]);
    else                      imgUrl = extractUrl(first);
    if (!imgUrl) throw new Error('Không tìm thấy URL ảnh kết quả');
    if (imgUrl.startsWith('/')) imgUrl = BASE.replace(/\/$/, '') + imgUrl;

    const r = await axios.get(imgUrl, {
        responseType: 'arraybuffer', timeout: 30000,
        headers: { 'Referer': REFERER, 'User-Agent': randomUA() },
        validateStatus: s => s < 400
    });
    const mime = r.headers['content-type'] || 'image/png';
    return {
        image: `data:${mime};base64,${Buffer.from(r.data).toString('base64')}`,
        transport: out.transport,
        viaProxy: out.viaProxy
    };
}

module.exports = {
    name: '/ai/mo-rong',
    index: async (req, res) => {
        const { url, ratio, alignment, overlap, steps, prompt, format } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:       'URL ảnh cần mở rộng',
                    ratio:     `(tuỳ chọn) Tỷ lệ khung hình — mặc định: 16/9 | ${Object.keys(RATIO_SIZES).join(' | ')}`,
                    alignment: `(tuỳ chọn) Vị trí ảnh gốc — mặc định: Middle | ${ALIGNMENTS.join(' | ')}`,
                    overlap:   '(tuỳ chọn) Độ chồng lấp biên (%) — mặc định: 10 (0-50)',
                    steps:     '(tuỳ chọn) Số bước sinh ảnh — mặc định: 8 (1-20)',
                    prompt:    '(tuỳ chọn) Mô tả nội dung muốn mở rộng (tiếng Anh)',
                    format:    '(tuỳ chọn) base64 (mặc định) | img'
                },
                ratios: Object.keys(RATIO_SIZES),
                example: '/ai/mo-rong?url=https://example.com/photo.jpg&ratio=16/9&alignment=Middle'
            });
        }

        const ratioKey = ratio || '16/9';
        const size = RATIO_SIZES[ratioKey] || RATIO_SIZES['16/9'];
        const alignVal = ALIGNMENTS.includes(alignment) ? alignment : 'Middle';
        const overlapVal = Math.min(50, Math.max(0, parseInt(overlap) || 10));
        const stepsVal = Math.min(20, Math.max(1, parseInt(steps) || 8));

        try {
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const img = await fetchBuffer(url);
            const result = await doMoRong({
                imgBuf: img.buffer, ext: img.ext, ct: img.contentType,
                width: size.width, height: size.height,
                alignment: alignVal, overlapPct: overlapVal, steps: stepsVal,
                prompt: prompt || '',
                useProxy
            });

            if (format === 'img') {
                const raw = result.image.split(',')[1];
                const mime = result.image.split(';')[0].slice(5);
                res.set('Content-Type', mime);
                res.set('Cache-Control', 'no-store');
                return res.send(Buffer.from(raw, 'base64'));
            }

            return res.json({
                status: true,
                ratio: ratioKey,
                width: size.width,
                height: size.height,
                alignment: alignVal,
                image: result.image,
                provider: result.viaProxy ? 'proxy' : 'direct',
                transport: result.transport
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/mo-rong').catch(() => {});
            const log = require('../../utils/logger');
            log(`[AI-MO-RONG] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi mở rộng ảnh' });
        }
    }
};
