'use strict';

/**
 * Biến ảnh Anime thành ảnh thực tế bằng AI (Qwen-Image-Edit / "Anything2Real" LoRA).
 *
 *   GET /ai/anime2real?url=<image_url>
 *        &prompt=<custom>     (tuỳ chọn — override prompt mặc định)
 *        &lora=<name>         (tuỳ chọn — mặc định "Anything2Real")
 *        &steps=<1..8>        (tuỳ chọn — mặc định 4)
 *        &format=json|image   (tuỳ chọn — mặc định json)
 *
 * Backend: Gradio Space `tuan2308-qwen-image-edit-2511-loras-fast` trên HuggingFace.
 * Reverse-engineer từ taoanhdep.com/bien-anh-anime-thanh-anh-thuc-te-bang-ai/
 */

const axios = require('axios');
const FormData = require('form-data');
const https = require('https');
const { proxyPool } = require('../../utils/http/proxy-pool');
const { shouldUseProxy, noteBlocked, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { fetchBuffer } = require('../../utils/http');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE    = 'https://tuan2308-qwen-image-edit-2511-loras-fast.hf.space/';
const REFERER = 'https://taoanhdep.com/bien-anh-anime-thanh-anh-thuc-te-bang-ai/';
const ORIGIN  = 'https://taoanhdep.com';

const DEFAULT_PROMPT =
    'Transform your photos into realistic, lifelike images. If there are people in the photo, ' +
    'their faces and features will have an Asian style, with natural lighting, realistic colors, and high detail.';

const DEFAULT_LORA  = 'Anything2Real';
const DEFAULT_STEPS = 4;
const SSE_TIMEOUT   = 240_000; // 4 phút (HF Space cold start có thể chậm)

const ALLOWED_LORAS = new Set([
    'Anything2Real',  // anime → real (mặc định)
    'Real2Anything',  // real  → anime
    'None'
]);

/* ── helpers ─────────────────────────────────────────────────────────────── */

function randomHash() {
    return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
}

function detectMime(buf) {
    if (!buf || buf.length < 12) return { ext: 'jpg', ct: 'image/jpeg' };
    const h = buf.slice(0, 12);
    if (h[0] === 0xFF && h[1] === 0xD8) return { ext: 'jpg',  ct: 'image/jpeg' };
    if (h[0] === 0x89 && h[1] === 0x50) return { ext: 'png',  ct: 'image/png'  };
    if (h.slice(0, 4).toString() === 'RIFF' && h.slice(8, 12).toString() === 'WEBP')
        return { ext: 'webp', ct: 'image/webp' };
    if (h[0] === 0x47 && h[1] === 0x49) return { ext: 'gif',  ct: 'image/gif'  };
    return { ext: 'jpg', ct: 'image/jpeg' };
}

/* ── upload ──────────────────────────────────────────────────────────────── */

async function uploadImage(imgBuf, ext, ct, useProxy = false) {
    const fd = new FormData();
    fd.append('files', imgBuf, { filename: `photo.${ext}`, contentType: ct });

    const uploadUrl = useProxy
        ? `https://api.taoanhdep.com/uploads-v2?apiu=${encodeURIComponent(BASE)}`
        : `${BASE}gradio_api/upload?upload_id=${randomHash().slice(0, 12)}`;

    const headers = { ...fd.getHeaders(), Origin: ORIGIN, Referer: REFERER, 'User-Agent': randomUA() };
    if (useProxy) headers['X-Client-URL'] = REFERER;

    const fn = useProxy ? opts => proxyPool.axios(opts) : opts => axios(opts);
    const r = await fn({
        method: 'post',
        url: uploadUrl,
        data: fd,
        headers,
        timeout: 60_000,
        maxBodyLength: Infinity,
        validateStatus: () => true
    });

    if (r.status >= 400) throw new Error(`Upload HTTP ${r.status}`);

    const raw = r.data;
    const arr = Array.isArray(raw) ? raw : (raw?.result && Array.isArray(raw.result) ? raw.result : null);
    if (!arr || !arr[0]) throw new Error('Upload ảnh thất bại (response không hợp lệ)');
    return arr[0];
}

/* ── queue join ──────────────────────────────────────────────────────────── */

async function joinQueue({ filePath, fileSize, prompt, lora, steps, sessionHash }, useProxy = false) {
    const queueUrl = useProxy
        ? `https://taoanhdep.com/public/proxy-ai/join-v2.php?apiu=${encodeURIComponent(BASE)}`
        : `${BASE}gradio_api/queue/join?__theme=systemt`;

    const body = {
        data: [
            [{
                image: {
                    path: filePath,
                    url: BASE + filePath,
                    orig_name: 'photo.jpg',
                    size: fileSize || null,
                    mime_type: 'image/jpeg',
                    meta: { _type: 'gradio.FileData' }
                },
                caption: null
            }],
            prompt,
            lora,
            0,
            true,
            1,
            steps
        ],
        fn_index: 1,
        trigger_id: 8,
        session_hash: sessionHash
    };

    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, Referer: REFERER, 'User-Agent': randomUA() };
    if (useProxy) headers['X-Client-URL'] = REFERER;

    const fn = useProxy ? opts => proxyPool.axios(opts) : opts => axios(opts);
    const r = await fn({
        method: 'post',
        url: queueUrl,
        data: JSON.stringify(body),
        headers,
        timeout: 120_000,
        validateStatus: () => true
    });

    if (r.status >= 400) throw new Error(`Queue HTTP ${r.status}`);

    const data = r.data;
    const result = data?.result || data;
    const eventId = result?.event_id;
    if (!eventId) {
        const snippet = JSON.stringify(data).slice(0, 200);
        throw new Error(`Không nhận được event_id (${snippet})`);
    }
    return eventId;
}

/* ── SSE listener ───────────────────────────────────────────────────────── */

function listenSSE(sessionHash, timeoutMs = SSE_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const sseUrl = `${BASE}gradio_api/queue/data?session_hash=${sessionHash}`;
        const urlObj = new URL(sseUrl);
        let settled = false;

        const done = (fn, arg) => {
            if (settled) return;
            settled = true;
            try { fn(arg); } catch {}
        };

        const req = https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: {
                Accept: 'text/event-stream',
                'Cache-Control': 'no-cache',
                Origin: ORIGIN,
                Referer: REFERER,
                'User-Agent': randomUA()
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                return done(reject, new Error(`SSE HTTP ${res.statusCode}`));
            }
            let buf = '';
            res.on('data', chunk => {
                buf += chunk.toString();
                const parts = buf.split('\n\n');
                buf = parts.pop();
                for (const part of parts) {
                    const line = part.split('\n').find(l => l.startsWith('data:'));
                    if (!line) continue;
                    let json;
                    try { json = JSON.parse(line.slice(5).trim()); } catch { continue; }

                    if (json.msg === 'process_completed') {
                        const err = json.output?.error;
                        if (err) {
                            res.destroy();
                            return done(reject, new Error(String(err)));
                        }
                        const url = json.output?.data?.[0]?.[0]?.image?.url
                                 || json.output?.data?.[0]?.[0]?.url
                                 || json.output?.data?.[0]?.url;
                        if (!url) {
                            res.destroy();
                            return done(reject, new Error('Không tìm thấy URL ảnh kết quả'));
                        }
                        res.destroy();
                        return done(resolve, url);
                    }

                    if (json.msg === 'unexpected_error') {
                        res.destroy();
                        return done(reject, new Error(json.message || 'unexpected_error'));
                    }
                }
            });
            res.on('end',   () => done(reject, new Error('SSE kết thúc không có kết quả')));
            res.on('error', e  => done(reject, e));
        });

        req.setTimeout(timeoutMs, () => { req.destroy(); done(reject, new Error('Timeout chờ xử lý ảnh')); });
        req.on('error', e => done(reject, e));
    });
}

/* ── orchestrator ───────────────────────────────────────────────────────── */

async function transform({ imgBuf, ext, ct, prompt, lora, steps }, preferProxy = false) {
    let lastError;
    const order = preferProxy ? [true, false] : [false, true];
    for (const useProxy of order) {
        try {
            const filePath    = await uploadImage(imgBuf, ext, ct, useProxy);
            const sessionHash = randomHash();
            await joinQueue({ filePath, fileSize: imgBuf.length, prompt, lora, steps, sessionHash }, useProxy);
            const url = await listenSSE(sessionHash);
            return { url, viaProxy: useProxy };
        } catch (e) {
            lastError = e;
            const msg = String(e?.message || '');
            // Chỉ retry với proxy khi lỗi GPU/network — lỗi prompt hay HTTP 4xx thì bỏ
            if (!/GPU|timeout|ECONNRESET|ETIMEDOUT|HTTP 5\d\d|cURL/i.test(msg)) break;
        }
    }
    throw lastError || new Error('Không thể xử lý ảnh');
}

/* ── route ──────────────────────────────────────────────────────────────── */

module.exports = {
    name: '/ai/anime2real',
    index: async (req, res) => {
        const { url, prompt, lora, steps, format } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                params: {
                    url:    'URL ảnh anime (jpg/png/webp, ≤ 10MB khuyến nghị)',
                    prompt: '(tuỳ chọn) prompt mô tả phong cách realistic muốn áp',
                    lora:   '(tuỳ chọn) Anything2Real (mặc định) | Real2Anything | None',
                    steps:  '(tuỳ chọn) số bước denoise 1-8 (mặc định 4)',
                    format: '(tuỳ chọn) json (mặc định) | image (trả binary trực tiếp)'
                },
                example: '/ai/anime2real?url=https://i.imgur.com/xxxxxx.jpg'
            });
        }

        // Validate inputs
        const finalPrompt = (typeof prompt === 'string' && prompt.trim()) ? prompt.trim().slice(0, 1000) : DEFAULT_PROMPT;
        const finalLora   = ALLOWED_LORAS.has(lora) ? lora : DEFAULT_LORA;
        let finalSteps    = parseInt(steps, 10);
        if (!Number.isFinite(finalSteps) || finalSteps < 1 || finalSteps > 8) finalSteps = DEFAULT_STEPS;

        try {
            // 1. Tải ảnh nguồn
            const fb = await fetchBuffer(url);
            const imgBuf = fb?.buffer || fb;
            if (!imgBuf || !imgBuf.length) throw new Error('Không tải được ảnh nguồn');
            if (imgBuf.length > 12 * 1024 * 1024) throw new Error('Ảnh quá lớn (giới hạn 12MB)');

            const { ext, ct } = detectMime(imgBuf);

            // 2. Gọi AI
            const t0 = Date.now();
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const { url: outUrl, viaProxy } = await transform({
                imgBuf, ext, ct,
                prompt: finalPrompt,
                lora:   finalLora,
                steps:  finalSteps
            }, useProxy);
            const took = Date.now() - t0;

            // 3. Trả kết quả
            if (format === 'image') {
                const out = await fetchBuffer(outUrl);
                const outBuf = out?.buffer || out;
                res.set('Content-Type', 'image/png');
                res.set('Content-Disposition', 'inline; filename="anime2real.png"');
                return res.send(outBuf);
            }

            const { cloak, sanitizeString } = require('../../utils/security/url-cloak');
            return res.json({
                status: true,
                source: url,
                image:  cloak(req, outUrl),
                prompt: finalPrompt,
                lora:   finalLora,
                steps:  finalSteps,
                tookMs: took,
                viaProxy,
                creator: 'Ljzi'
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/anime2real').catch(() => {});
            const { sanitizeString } = require('../../utils/security/url-cloak');
            const msg = sanitizeString(String(e?.message || e));
            const code = /quá lớn|Thiếu/.test(msg) ? 400 : 502;
            return res.status(code).json({
                status: false,
                message: msg,
                hint: code === 502
                    ? 'Backend HuggingFace có thể đang quá tải/cold-start, thử lại sau 10-30s.'
                    : undefined
            });
        }
    }
};
