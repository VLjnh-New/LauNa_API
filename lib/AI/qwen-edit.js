'use strict';

/**
 * Qwen-Image-Edit-2511 (Fast LoRAs) — chỉnh sửa ảnh bằng AI với 17 phong cách LoRA.
 *
 *   GET /ai/qwen-edit?url=<image_url>&prompt=<text>
 *        &lora=<lora_name>           (tuỳ chọn — mặc định "Photo-to-Anime")
 *        &steps=<1..50>              (tuỳ chọn — mặc định 4)
 *        &guidance=<1.0..10.0>       (tuỳ chọn — mặc định 1.0)
 *        &seed=<0..2147483647>       (tuỳ chọn — mặc định 0)
 *        &randomize=true|false       (tuỳ chọn — mặc định true; false thì dùng seed cố định)
 *        &format=json|image          (tuỳ chọn — mặc định json)
 *
 * Backend: Gradio Space `tuan2308-qwen-image-edit-2511-loras-fast` trên HuggingFace.
 * Có proxy fallback (api.taoanhdep.com) khi gọi trực tiếp HF bị chặn / lỗi mạng.
 */

const axios = require('axios');
const FormData = require('form-data');
const https = require('https');
const { proxyPool } = require('../../utils/http/proxy-pool');
const { shouldUseProxy, noteBlocked, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { fetchBuffer } = require('../../utils/http');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE    = 'https://tuan2308-qwen-image-edit-2511-loras-fast.hf.space/';
const REFERER = 'https://taoanhdep.com/qwen-image-edit-loras-fast/';
const ORIGIN  = 'https://taoanhdep.com';

const DEFAULT_LORA     = 'Photo-to-Anime';
const DEFAULT_STEPS    = 4;
const DEFAULT_GUIDANCE = 1.0;
const DEFAULT_SEED     = 0;
const SSE_TIMEOUT      = 300_000; // 5 phút (HF cold-start có thể lâu)
const MAX_INPUT_BYTES  = 12 * 1024 * 1024;

// Đầy đủ 17 LoRA mà Space hỗ trợ (lấy từ /gradio_api/info)
const ALLOWED_LORAS = [
    'Multiple-Angles',
    'Photo-to-Anime',
    'Anime-V2',
    'Light-Migration',
    'Upscaler',
    'Style-Transfer',
    'Manga-Tone',
    'Anything2Real',
    'Fal-Multiple-Angles',
    'Polaroid-Photo',
    'Unblur-Anything',
    'Midnight-Noir-Eyes-Spotlight',
    'Hyper-Realistic-Portrait',
    'Ultra-Realistic-Portrait',
    'Pixar-Inspired-3D',
    'Noir-Comic-Book',
    'Any-light'
];
const LORA_SET = new Set(ALLOWED_LORAS);

/* ── helpers ─────────────────────────────────────────────────────────────── */

function randomHash() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
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

function clampNum(v, lo, hi, def) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}

function clampInt(v, lo, hi, def) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}

/* ── upload ──────────────────────────────────────────────────────────────── */

async function uploadImage(imgBuf, ext, ct, useProxy) {
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

async function joinQueue(opts, useProxy) {
    const { filePath, fileSize, prompt, lora, seed, randomize, guidance, steps, sessionHash, ct } = opts;

    const queueUrl = useProxy
        ? `https://taoanhdep.com/public/proxy-ai/join-v2.php?apiu=${encodeURIComponent(BASE)}`
        : `${BASE}gradio_api/queue/join?__theme=systemt`;

    const body = {
        data: [
            // gallery input: list[{ image: FileData, caption }]
            [{
                image: {
                    path: filePath,
                    url: BASE + filePath,
                    orig_name: 'photo.jpg',
                    size: fileSize || null,
                    mime_type: ct || 'image/jpeg',
                    meta: { _type: 'gradio.FileData' }
                },
                caption: null
            }],
            prompt,
            lora,
            seed,
            randomize,
            guidance,
            steps
        ],
        fn_index: 1,
        trigger_id: 8,
        session_hash: sessionHash
    };

    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, Referer: REFERER, 'User-Agent': randomUA() };
    if (useProxy) headers['X-Client-URL'] = REFERER;

    const fn = useProxy ? o => proxyPool.axios(o) : o => axios(o);
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
                        // Output Image (id 11) là ImageData → output.data[0].url
                        // Seed (id 16) là số → output.data[1]
                        const data = json.output?.data || [];
                        const url = data?.[0]?.url
                                 || data?.[0]?.image?.url
                                 || data?.[0]?.[0]?.image?.url
                                 || data?.[0]?.[0]?.url;
                        const seedOut = typeof data?.[1] === 'number' ? data[1] : null;
                        if (!url) {
                            res.destroy();
                            return done(reject, new Error('Không tìm thấy URL ảnh kết quả'));
                        }
                        res.destroy();
                        return done(resolve, { url, seed: seedOut });
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

/* ── orchestrator (direct → proxy fallback) ─────────────────────────────── */

async function runEdit(params, preferProxy = false) {
    let lastError;
    const order = preferProxy ? [true, false] : [false, true];
    for (const useProxy of order) {
        try {
            const filePath    = await uploadImage(params.imgBuf, params.ext, params.ct, useProxy);
            const sessionHash = randomHash();
            await joinQueue({
                filePath,
                fileSize: params.imgBuf.length,
                ct: params.ct,
                prompt:    params.prompt,
                lora:      params.lora,
                seed:      params.seed,
                randomize: params.randomize,
                guidance:  params.guidance,
                steps:     params.steps,
                sessionHash
            }, useProxy);
            const out = await listenSSE(sessionHash);
            return { ...out, viaProxy: useProxy };
        } catch (e) {
            lastError = e;
            const msg = String(e?.message || '');
            // Chỉ retry với proxy khi lỗi hạ tầng (network, GPU, HF 5xx). Lỗi prompt/4xx → bỏ.
            if (!/GPU|timeout|ECONN|ETIMEDOUT|EAI_AGAIN|HTTP 5\d\d|HTTP 429|cURL|SSE HTTP/i.test(msg)) break;
        }
    }
    throw lastError || new Error('Không thể xử lý ảnh');
}

/* ── route ──────────────────────────────────────────────────────────────── */

module.exports = {
    name: '/ai/qwen-edit',
    index: async (req, res) => {
        const { url, prompt, lora, steps, guidance, seed, randomize, format } = req.query;

        if (!url || !prompt) {
            return res.status(400).json({
                status: false,
                message: !url ? "Thiếu tham số 'url'" : "Thiếu tham số 'prompt'",
                params: {
                    url:       'URL ảnh nguồn (jpg/png/webp/gif, ≤ 12MB)',
                    prompt:    'Mô tả chỉnh sửa muốn áp dụng (tiếng Anh hiệu quả nhất)',
                    lora:      `(tuỳ chọn) Phong cách LoRA — mặc định "${DEFAULT_LORA}"`,
                    steps:     '(tuỳ chọn) Số bước denoise 1-50 — mặc định 4 (nhanh)',
                    guidance:  '(tuỳ chọn) CFG guidance 1.0-10.0 — mặc định 1.0',
                    seed:      '(tuỳ chọn) Seed 0-2147483647 — mặc định 0',
                    randomize: '(tuỳ chọn) true|false — random seed mỗi lần (mặc định true)',
                    format:    '(tuỳ chọn) json (mặc định) | image (trả binary trực tiếp)'
                },
                loras: ALLOWED_LORAS,
                example: `/ai/qwen-edit?url=https://i.imgur.com/xxxx.jpg&prompt=${encodeURIComponent('change background to neon city at night')}&lora=Light-Migration&steps=8`
            });
        }

        const finalPrompt    = String(prompt).trim().slice(0, 1500);
        const finalLora      = LORA_SET.has(lora) ? lora : DEFAULT_LORA;
        const finalSteps     = clampInt(steps, 1, 50, DEFAULT_STEPS);
        const finalGuidance  = clampNum(guidance, 1.0, 10.0, DEFAULT_GUIDANCE);
        const finalSeed      = clampInt(seed, 0, 2147483647, DEFAULT_SEED);
        const finalRandomize = randomize === 'false' ? false : (randomize === 'true' ? true : true);

        if (!finalPrompt) {
            return res.status(400).json({ status: false, message: "Tham số 'prompt' không được rỗng" });
        }

        try {
            // 1. Tải ảnh nguồn
            const fb = await fetchBuffer(url);
            const imgBuf = fb?.buffer || fb;
            if (!imgBuf || !imgBuf.length) throw new Error('Không tải được ảnh nguồn');
            if (imgBuf.length > MAX_INPUT_BYTES) {
                throw new Error(`Ảnh quá lớn (${(imgBuf.length / 1024 / 1024).toFixed(1)}MB > 12MB)`);
            }
            const { ext, ct } = detectMime(imgBuf);

            // 2. Gọi AI
            const t0 = Date.now();
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const out = await runEdit({
                imgBuf, ext, ct,
                prompt:    finalPrompt,
                lora:      finalLora,
                seed:      finalSeed,
                randomize: finalRandomize,
                guidance:  finalGuidance,
                steps:     finalSteps
            }, useProxy);
            const took = Date.now() - t0;

            // 3. Trả kết quả
            if (format === 'image') {
                const outFb = await fetchBuffer(out.url);
                const outBuf = outFb?.buffer || outFb;
                res.set('Content-Type', 'image/png');
                res.set('Cache-Control', 'no-store');
                res.set('Content-Disposition', 'inline; filename="qwen-edit.png"');
                return res.send(outBuf);
            }

            const { cloak, sanitizeString } = require('../../utils/security/url-cloak');
            return res.json({
                status:    true,
                source:    url,
                image:     cloak(req, out.url),
                prompt:    finalPrompt,
                lora:      finalLora,
                steps:     finalSteps,
                guidance:  finalGuidance,
                seed:      out.seed ?? finalSeed,
                randomize: finalRandomize,
                tookMs:    took,
                viaProxy:  out.viaProxy,
                creator:   'Ljzi'
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/qwen-edit').catch(() => {});
            const { sanitizeString } = require('../../utils/security/url-cloak');
            const msg = sanitizeString(String(e?.message || e));
            const code = /quá lớn|Thiếu|không được rỗng|tải được ảnh/.test(msg) ? 400 : 502;
            return res.status(code).json({
                status:  false,
                message: msg,
                hint:    code === 502
                    ? 'HuggingFace Space có thể đang quá tải hoặc cold-start. Thử lại sau 10-30s.'
                    : undefined
            });
        }
    }
};
