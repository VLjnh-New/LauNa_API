'use strict';

/**
 * /ai/capcut-edit — AI Video Editor "kiểu CapCut" qua HF Space
 *   Upstream: innoai/ai-video-editor2 (Gradio v5)
 *   Mô hình : Qwen2.5-Coder-32B-Instruct hoặc DeepSeek-V3 sinh lệnh
 *             FFMPEG → render video theo natural-language instruction.
 *
 * Cách dùng:
 *   GET  /ai/capcut-edit?video=<url>&prompt=<instructions>
 *   GET  /ai/capcut-edit?files=url1,url2,url3&prompt=...
 *   POST /ai/capcut-edit  body JSON: { video|file|files, prompt, model?, top_p?, temperature?, format? }
 *
 * Tham số:
 *   video|file|files : URL media (video/ảnh/audio). Có thể nhiều URL cách bởi dấu phẩy.
 *   prompt           : Hướng dẫn edit ("cắt 5s đầu", "ghép ảnh thành slideshow 30fps", ...)
 *   model            : "deepseek" (mặc định) | "qwen"
 *   top_p            : 0..1 (mặc định 0.7)
 *   temperature      : 0..5 (mặc định 0.1)
 *   format           : "json" (mặc định, trả URL đã che) | "mp4" (stream binary)
 *
 * Link upstream được che qua /ai/media (xem utils/security/url-cloak.js).
 */

const axios       = require('axios');
const FormData    = require('form-data');
const https       = require('https');
const { URL }     = require('url');
const { shouldUseProxy, noteBlocked, axiosFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
async function fetchMedia(rawUrl, useProxy = false) {
    const u = String(rawUrl || '').trim();
    if (!/^https?:\/\//i.test(u)) throw new Error(`URL không hợp lệ: ${u.slice(0, 60)}`);
    const ax = axiosFor(useProxy);
    const r = await ax.get(u, {
        responseType: 'arraybuffer',
        timeout: 60_000,
        maxRedirects: 5,
        maxContentLength: 80 * 1024 * 1024,
        maxBodyLength:    80 * 1024 * 1024,
        validateStatus: () => true,
        headers: {
            'User-Agent': require('../../utils/http/browser-headers').randomUA(),
            'Accept': '*/*',
        },
    });
    if (r.status >= 400) throw new Error(`Không tải được file (HTTP ${r.status})`);
    return { buffer: Buffer.from(r.data), contentType: r.headers['content-type'] || 'application/octet-stream' };
}
const { randomHash, fileData } = require('../../utils/http/hf-space');
const { browserHeaders } = require('../../utils/http/browser-headers');
const { cloak, sanitizeString } = require('../../utils/security/url-cloak');

const BASE     = 'https://innoai-ai-video-editor2.hf.space/';
const REFERER  = 'https://innoai-ai-video-editor2.hf.space/';
const ORIGIN   = 'https://innoai-ai-video-editor2.hf.space';
const FN_INDEX = 0;

const ACCEPT_EXT = new Set([
    'png','jpg','jpeg','webp','tiff','bmp','gif','svg',
    'mp3','wav','ogg','flac','m4a',
    'mp4','avi','mov','mkv','flv','wmv','webm','mpg','mpeg','m4v','3gp','3g2','3gpp'
]);

const MAX_FILES_BYTES = 80 * 1024 * 1024;   // tổng 80MB cho phiên upload
const MAX_FILE_BYTES  = 60 * 1024 * 1024;   // 60MB / file

const MODEL_MAP = {
    'deepseek': 'deepseek-ai/DeepSeek-V3',
    'deepseek-v3': 'deepseek-ai/DeepSeek-V3',
    'v3': 'deepseek-ai/DeepSeek-V3',
    'qwen': 'Qwen/Qwen2.5-Coder-32B-Instruct',
    'qwen2.5': 'Qwen/Qwen2.5-Coder-32B-Instruct',
    'qwen-coder': 'Qwen/Qwen2.5-Coder-32B-Instruct',
};
const DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3';

function pickModel(s) {
    if (!s) return DEFAULT_MODEL;
    const k = String(s).trim().toLowerCase();
    if (MODEL_MAP[k]) return MODEL_MAP[k];
    if (k === 'deepseek-ai/deepseek-v3' || k === 'qwen/qwen2.5-coder-32b-instruct') return s;
    return DEFAULT_MODEL;
}

function clamp(n, min, max, def) {
    const v = parseFloat(n);
    if (!Number.isFinite(v)) return def;
    return Math.min(Math.max(v, min), max);
}

function parseUrls(q) {
    const raw = q.files || q.file || q.video || q.url || '';
    if (!raw) return [];
    return String(raw).split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
}

function extOf(srcUrl, ct) {
    if (ct) {
        const m = String(ct).toLowerCase();
        if (m.includes('mp4'))  return 'mp4';
        if (m.includes('webm')) return 'webm';
        if (m.includes('mpeg')) return 'mp3';
        if (m.includes('jpeg')) return 'jpg';
        if (m.includes('png'))  return 'png';
        if (m.includes('webp')) return 'webp';
        if (m.includes('gif'))  return 'gif';
    }
    try {
        const p = new URL(srcUrl).pathname.toLowerCase();
        const m = p.match(/\.([a-z0-9]{2,5})(?:$|\?)/);
        if (m && ACCEPT_EXT.has(m[1])) return m[1];
    } catch (_) {}
    return 'mp4';
}

/* ── Upload nhiều file lên Gradio cùng lúc ────────────────────────────── */
async function uploadAllFiles(files, useProxy = false) {
    const fd = new FormData();
    for (const f of files) {
        fd.append('files', f.buf, { filename: f.name, contentType: f.ct });
    }
    const url = `${BASE}gradio_api/upload?upload_id=${randomHash().slice(0, 12)}`;
    const headers = {
        ...browserHeaders({ referer: REFERER, origin: ORIGIN, purpose: 'cors' }),
        ...fd.getHeaders(),
    };
    const ax = axiosFor(useProxy);
    const r = await ax.post(url, fd, {
        headers,
        timeout: 90_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true,
    });
    if (r.status >= 400) throw new Error(`Upload HTTP ${r.status}`);
    const arr = Array.isArray(r.data) ? r.data
              : (r.data?.result && Array.isArray(r.data.result) ? r.data.result : null);
    if (!arr || arr.length !== files.length) {
        throw new Error('Upload không trả về đủ file path');
    }
    return arr;
}

/* ── join queue ──────────────────────────────────────────────────────── */
async function joinQueue(body, useProxy = false) {
    const url = `${BASE}gradio_api/queue/join?__theme=system`;
    const ax = axiosFor(useProxy);
    const r = await ax.post(url, body, {
        timeout: 60_000,
        headers: {
            'Content-Type': 'application/json',
            'Origin':       ORIGIN,
            'Referer':      REFERER,
        },
        validateStatus: () => true,
    });
    if (r.status >= 400) throw new Error(`Queue join HTTP ${r.status}`);
    return r.data;
}

/* ── listen SSE result ───────────────────────────────────────────────── */
function listenSSE(sessionHash, timeoutMs = 360_000) {
    return new Promise((resolve, reject) => {
        const u = new URL(`${BASE}gradio_api/queue/data?session_hash=${sessionHash}`);
        let settled = false;
        const finish = (fn, v) => { if (settled) return; settled = true; try { req.destroy(); } catch (_) {} fn(v); };

        const req = https.get({
            hostname: u.hostname,
            path: u.pathname + u.search,
            headers: {
                Accept:        'text/event-stream',
                'Cache-Control': 'no-cache',
                Referer:       REFERER,
                Origin:        ORIGIN,
            },
        }, (res) => {
            if (res.statusCode !== 200) {
                return finish(reject, new Error(`SSE HTTP ${res.statusCode}`));
            }
            let buf = '';
            res.on('data', (chunk) => {
                buf += chunk.toString('utf8');
                const parts = buf.split('\n\n');
                buf = parts.pop();
                for (const part of parts) {
                    const line = part.split('\n').find(l => l.startsWith('data:'));
                    if (!line) continue;
                    let json;
                    try { json = JSON.parse(line.slice(5).trim()); } catch (_) { continue; }
                    if (json.msg === 'process_completed') {
                        if (json.success === false) {
                            let err = String(json.output?.error || 'Space xử lý thất bại');
                            if (/^API Error$/i.test(err) || /401|403|unauthor|api[_ ]?key/i.test(err)) {
                                err = 'Mô hình hiện không khả dụng (Space thiếu token cho model này). Hãy dùng model "deepseek".';
                            }
                            return finish(reject, new Error(err));
                        }
                        return finish(resolve, json.output?.data || []);
                    }
                    if (json.msg === 'unexpected_error') {
                        return finish(reject, new Error(json.message || 'unexpected_error'));
                    }
                }
            });
            res.on('end',   () => finish(reject, new Error('SSE kết thúc không có kết quả')));
            res.on('error', (e) => finish(reject, e));
        });
        req.setTimeout(timeoutMs, () => finish(reject, new Error('Timeout chờ Space xử lý')));
        req.on('error', (e) => finish(reject, e));
    });
}

/* ── Trích URL video & lệnh ffmpeg từ output ─────────────────────────── */
function extractResult(out) {
    const v = out?.[0];
    let videoUrl = null;
    if (typeof v === 'string') videoUrl = v;
    else if (v?.video?.url) videoUrl = v.video.url;
    else if (v?.url) videoUrl = v.url;
    else if (v?.path) videoUrl = `${BASE}gradio_api/file=${v.path}`;

    let cmd = null;
    for (let i = 1; i < (out?.length || 0); i++) {
        const x = out[i];
        const s = typeof x === 'string' ? x
                : typeof x?.value === 'string' ? x.value
                : typeof x?.markdown === 'string' ? x.markdown
                : null;
        if (!s) continue;
        const m = s.match(/```(?:bash|sh|ffmpeg)?\s*([\s\S]*?)```/);
        const c = (m ? m[1] : s).trim();
        if (c) { cmd = c.slice(0, 2000); break; }
    }
    return { videoUrl, command: cmd };
}

/* ── Route handler ───────────────────────────────────────────────────── */
async function handle(req, res) {
    const q = { ...(req.query || {}), ...(req.body || {}) };
    const urls   = parseUrls(q);
    const prompt = String(q.prompt || q.instructions || q.text || '').trim();
    const format = String(q.format || 'json').toLowerCase();
    const model  = pickModel(q.model);
    const topP   = clamp(q.top_p ?? q.topP, 0, 1, 0.7);
    const temp   = clamp(q.temperature ?? q.temp, 0, 5, 0.1);

    if (!urls.length || !prompt) {
        return res.status(400).json({
            status:  false,
            message: "Thiếu tham số 'video|file|files' và/hoặc 'prompt'",
            usage: {
                method: 'GET hoặc POST',
                params: {
                    video:       'URL video/ảnh/audio (1 cái) — hoặc dùng `files` cho nhiều cái cách bởi dấu phẩy',
                    prompt:      'Hướng dẫn edit (vd: "cắt 5 giây đầu rồi thêm fade in")',
                    model:       '(tuỳ chọn) "deepseek" (mặc định) | "qwen"',
                    top_p:       '(tuỳ chọn) 0..1, mặc định 0.7',
                    temperature: '(tuỳ chọn) 0..5, mặc định 0.1',
                    format:      '(tuỳ chọn) "json" (mặc định) | "mp4" (stream binary)',
                },
                example: '/ai/capcut-edit?video=https://example.com/clip.mp4&prompt=cắt%205s%20đầu%20và%20thêm%20fade%20in',
            },
        });
    }

    try {
        const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));

        // 1. Tải media nguồn
        let totalBytes = 0;
        const fetched = [];
        for (let i = 0; i < urls.length; i++) {
            const fb = await fetchMedia(urls[i], useProxy);
            const buf = fb.buffer;
            const ct  = fb.contentType || 'application/octet-stream';
            if (!buf || !buf.length) throw new Error(`Không tải được file #${i + 1}`);
            if (buf.length > MAX_FILE_BYTES) {
                throw new Error(`File #${i + 1} quá lớn (>${MAX_FILE_BYTES / 1024 / 1024}MB)`);
            }
            totalBytes += buf.length;
            if (totalBytes > MAX_FILES_BYTES) {
                throw new Error(`Tổng dung lượng vượt ${MAX_FILES_BYTES / 1024 / 1024}MB`);
            }
            const ext  = extOf(urls[i], ct);
            const name = `media_${i + 1}.${ext}`;
            fetched.push({ buf, ct, ext, name });
        }

        // 2. Upload lên Space
        const paths = await uploadAllFiles(fetched, useProxy);
        const fileMetas = paths.map((p, i) => fileData(BASE, p, fetched[i].buf.length, fetched[i].ct, fetched[i].name));

        // 3. Submit queue: data = [filesArray, prompt, top_p, temperature, model]
        const sessionHash = randomHash();
        await joinQueue({
            data:         [fileMetas, prompt, topP, temp, model],
            event_data:   null,
            fn_index:     FN_INDEX,
            trigger_id:   8,
            session_hash: sessionHash,
        }, useProxy);

        // 4. SSE chờ kết quả
        const t0 = Date.now();
        const out = await listenSSE(sessionHash);
        const took = Date.now() - t0;

        const { videoUrl, command } = extractResult(out);
        if (!videoUrl) throw new Error('Không tìm thấy URL video kết quả');

        // 5a. Stream MP4 trực tiếp
        if (format === 'mp4') {
            const r = await axios.get(videoUrl, {
                responseType: 'arraybuffer',
                timeout: 180_000,
                headers: { Referer: REFERER },
                validateStatus: s => s < 400,
            });
            res.set('Content-Type', r.headers['content-type'] || 'video/mp4');
            res.set('Cache-Control', 'no-store');
            res.set('Content-Disposition', 'inline; filename="capcut-edit.mp4"');
            return res.send(Buffer.from(r.data));
        }

        // 5b. JSON với link đã che
        return res.json({
            status:    true,
            model:     model.split('/').pop(),
            prompt,
            inputs:    urls,
            video_url: cloak(req, videoUrl),
            ffmpeg:    command,
            tookMs:    took,
            params:    { top_p: topP, temperature: temp, format },
            creator:   'Ljzi',
        });
    } catch (e) {
        noteBlocked(req, e, '/ai/capcut-edit').catch(() => {});
        const msg  = sanitizeString(String(e?.message || e));
        const code = /Thiếu|quá lớn|tải được|không hợp lệ/i.test(msg) ? 400 : 502;
        return res.status(code).json({
            status:  false,
            message: msg,
            hint:    code === 502
                ? 'Space có thể đang quá tải / cold-start. Thử lại sau 30-60s.'
                : undefined,
        });
    }
}

module.exports = {
    name: '/ai/capcut-edit',
    methods: {
        get:  handle,
        post: handle,
    },
};
