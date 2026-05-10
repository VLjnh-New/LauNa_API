'use strict';

const axios = require('axios');
const https = require('https');
const { proxyPool } = require('../../utils/http/proxy-pool');
const { shouldUseProxy, noteBlocked, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { sleep } = require('../../utils/http');
const { cloak, neutralProvider } = require('../../utils/security/url-cloak');
const { randomUA } = require('../../utils/http/browser-headers');

// ─── Model configs (từ taoanhdep.com/tao-anh-tu-van-ban-bang-ai/) ────────────

const MODELS = {
    zimage: {
        label: 'Z Image Turbo',
        base: 'https://tuan2308-z-image-turbo.hf.space/',
        supportsNeg: false, supportsGui: false,
        defaults: { step: 9, stepMax: 20, width: 512, height: 512 },
        buildData: (p) => ({
            data: [p.prompt, p.height, p.width, p.step, p.seed, false],
            fn_index: 2, trigger_id: 16, session_hash: p.hash
        }),
        extractUrl: (out) => out?.data?.[0]?.url
    },
    flux2: {
        label: 'FLUX.2 Schnell',
        base: 'https://warshanks-flux-2-klein-9b.hf.space/',
        supportsNeg: false, supportsGui: true,
        defaults: { step: 20, stepMax: 100, gui: 7, guiMax: 10, width: 512, height: 512 },
        buildData: (p) => ({
            data: [p.prompt, [], 'Distilled (4 steps)', p.seed, true, p.width, p.height, p.step, p.gui, false],
            fn_index: 6, trigger_id: 7, session_hash: p.hash
        }),
        extractUrl: (out) => out?.data?.[0]?.url
    },
    animagine31: {
        label: 'Animagine XL 3.1',
        base: 'https://tuan2308-animagine-xl-3-1.hf.space/',
        supportsNeg: true, supportsGui: true,
        defaults: { step: 28, stepMax: 50, gui: 7, guiMax: 12, width: 832, height: 1216 },
        buildData: (p) => ({
            data: [p.prompt, p.negative, p.seed, p.width, p.height, p.gui, p.step,
                'Euler a', 'Custom', '(None)', 'Standard v3.1', false, 0.55, 1.5, true],
            event_data: null, fn_index: 5, trigger_id: 50, session_hash: p.hash
        }),
        extractUrl: (out) => out?.data?.[0]?.[0]?.image?.url
    },
    animagine40: {
        label: 'Animagine XL 4.0',
        base: 'https://tuan2308-animagine-xl-4-0.hf.space/',
        supportsNeg: true, supportsGui: true,
        defaults: { step: 28, stepMax: 50, gui: 5, guiMax: 12, width: 832, height: 1216 },
        buildData: (p) => ({
            data: [p.prompt, p.negative, p.seed, p.width, p.height, p.gui, p.step,
                'Euler a', 'Custom', '(None)', false, 0.55, 1.5, true],
            event_data: null, fn_index: 5, trigger_id: 43, session_hash: p.hash
        }),
        extractUrl: (out) => out?.data?.[0]?.[0]?.image?.url
    }
};

const MODEL_ALIASES = {
    'zimage': 'zimage', 'z-image': 'zimage', 'z image': 'zimage', 'zimagturbo': 'zimage',
    'flux2': 'flux2', 'flux.2': 'flux2', 'flux 2': 'flux2', 'fluxschnell': 'flux2',
    'animagine31': 'animagine31', 'animagine3.1': 'animagine31', 'animaginexl31': 'animagine31',
    'animagine40': 'animagine40', 'animagine4.0': 'animagine40', 'animaginexl40': 'animagine40'
};

function resolveModel(key) {
    if (!key) return 'zimage';
    const norm = String(key).toLowerCase().replace(/[^a-z0-9.]/g, '');
    return MODEL_ALIASES[norm] || MODEL_ALIASES[key.toLowerCase()] || 'zimage';
}

function randomHash() {
    return Math.random().toString(36).substring(2, 12);
}

// ─── Queue Join (direct hoặc qua taoanhdep proxy) ────────────────────────────

async function joinQueue(base, body, useProxy = false) {
    const joinUrl = useProxy
        ? `https://api.taoanhdep.com/join-v2?apiu=${encodeURIComponent(base)}`
        : `${base}gradio_api/queue/join?__theme=system`;

    const headers = { 'Content-Type': 'application/json', 'Origin': 'https://taoanhdep.com', 'User-Agent': randomUA() };
    if (useProxy) headers['X-Client-URL'] = 'https://taoanhdep.com/tao-anh-tu-van-ban-bang-ai/';

    const fn = useProxy
        ? (opts) => proxyPool.axios(opts)
        : (opts) => axios(opts);

    const r = await fn({
        method: 'post', url: joinUrl, data: JSON.stringify(body),
        headers, timeout: 30000, validateStatus: () => true
    });

    if (r.status !== 200) throw new Error(`Join queue thất bại (${r.status})`);

    const data = r.data;
    const result = data?.result || data;
    const eventId = result?.event_id;
    if (!eventId) throw new Error(`Không nhận được event_id: ${JSON.stringify(data).slice(0, 100)}`);
    return eventId;
}

// ─── SSE Listener ─────────────────────────────────────────────────────────────

function listenSSE(base, sessionHash, extractUrl, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
        const sseUrl = `${base}gradio_api/queue/data?session_hash=${sessionHash}`;
        const urlObj = new URL(sseUrl);

        const req = https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Origin': 'https://taoanhdep.com',
                'User-Agent': randomUA()
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`SSE HTTP ${res.statusCode}`));
            }

            let buf = '';
            let settled = false;

            const done = (fn, arg) => {
                if (settled) return;
                settled = true;
                res.destroy();
                fn(arg);
            };

            res.on('data', chunk => {
                buf += chunk.toString();
                const parts = buf.split('\n\n');
                buf = parts.pop();

                for (const part of parts) {
                    const dataLine = part.split('\n').find(l => l.startsWith('data:'));
                    if (!dataLine) continue;

                    let json;
                    try { json = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }

                    if (json.msg === 'process_completed') {
                        const err = json.output?.error;
                        if (err) {
                            return done(reject, new Error(`GPU/Server lỗi: ${err}`));
                        }
                        const url = extractUrl(json.output);
                        if (!url) return done(reject, new Error('Không tìm thấy URL ảnh trong kết quả'));
                        return done(resolve, url);
                    }
                }
            });

            res.on('end', () => done(reject, new Error('SSE kết thúc không có kết quả')));
            res.on('error', e => done(reject, e));
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            reject(new Error('Timeout chờ AI sinh ảnh (3 phút)'));
        });
        req.on('error', reject);
    });
}

// ─── Main: sinh ảnh với retry + fallback ─────────────────────────────────────

async function generateImage(params, preferProxy = false) {
    const modelKey = resolveModel(params.model);
    const cfg = MODELS[modelKey];

    const p = {
        prompt:   params.prompt,
        negative: params.negative || 'lowres, bad anatomy, bad hands, error, missing fingers',
        seed:     (() => { const s = parseInt(params.seed ?? -1); return s < 0 ? Math.floor(Math.random() * 2147483647) : s; })(),
        width:    Math.min(1536, Math.max(256, parseInt(params.width  || cfg.defaults.width))),
        height:   Math.min(1536, Math.max(256, parseInt(params.height || cfg.defaults.height))),
        step:     Math.min(cfg.defaults.stepMax || 100, Math.max(1, parseInt(params.steps || cfg.defaults.step))),
        gui:      cfg.supportsGui ? Math.min(cfg.defaults.guiMax || 20, Math.max(1, parseFloat(params.guidance || cfg.defaults.gui || 7))) : 7,
        hash:     randomHash()
    };

    const body = cfg.buildData(p);
    let lastError;

    // Nếu IP đã từng bị block hoặc client yêu cầu ?proxy=1 → đi proxy ngay từ attempt 1
    const order = preferProxy ? [true, false] : [false, true];
    for (const useProxy of order) {
        try {
            p.hash = randomHash();
            body.session_hash = p.hash;
            const bodyWithHash = { ...cfg.buildData(p) };

            const eventId = await joinQueue(cfg.base, bodyWithHash, useProxy);
            const imgUrl  = await listenSSE(cfg.base, p.hash, cfg.extractUrl, 180000);
            return { url: imgUrl, model: modelKey, modelLabel: cfg.label, provider: useProxy ? 'proxy' : 'direct' };
        } catch (e) {
            lastError = e;
            if (!e.message.includes('GPU') && !e.message.includes('timeout') && !e.message.includes('queue')) throw e;
            if (attempt < 2) await sleep(3000);
        }
    }
    throw lastError || new Error('Không thể sinh ảnh');
}

// ─── Route ───────────────────────────────────────────────────────────────────

module.exports = {
    name: '/ai/tao-anh',
    index: async (req, res) => {
        const { prompt, model, negative, width, height, steps, guidance, seed, format } = req.query;

        if (!prompt) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'prompt'",
                params: {
                    prompt:    'Mô tả ảnh cần tạo (tiếng Anh cho kết quả tốt nhất)',
                    model:     '(tuỳ chọn) zimage (mặc định) | flux2 | animagine31 | animagine40',
                    negative:  '(tuỳ chọn) Mô tả những gì KHÔNG muốn có trong ảnh (chỉ animagine hỗ trợ)',
                    width:     '(tuỳ chọn) Chiều rộng ảnh px — mặc định 512',
                    height:    '(tuỳ chọn) Chiều cao ảnh px — mặc định 512',
                    steps:     '(tuỳ chọn) Số bước sinh ảnh — càng cao càng chất lượng',
                    guidance:  '(tuỳ chọn) Guidance scale — mặc định 7 (flux2/animagine)',
                    seed:      '(tuỳ chọn) Seed cố định — mặc định -1 (ngẫu nhiên)',
                    format:    '(tuỳ chọn) url (mặc định) | base64'
                },
                models: Object.entries(MODELS).map(([k, v]) => ({
                    key: k, label: v.label,
                    supportsNegativePrompt: v.supportsNeg,
                    defaults: v.defaults
                })),
                example: '/ai/tao-anh?prompt=a+beautiful+anime+girl+in+a+garden&model=zimage'
            });
        }

        try {
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const result = await generateImage({ prompt, model, negative, width, height, steps, guidance, seed }, useProxy);

            if (format === 'base64') {
                const imgResp = await axios.get(result.url, {
                    responseType: 'arraybuffer', timeout: 30000,
                    headers: { 'Referer': 'https://taoanhdep.com/', 'User-Agent': randomUA() },
                    validateStatus: s => s < 400
                });
                const mime = imgResp.headers['content-type'] || 'image/png';
                const b64 = Buffer.from(imgResp.data).toString('base64');
                return res.json({
                    status: true,
                    model: result.modelLabel,
                    image: `data:${mime};base64,${b64}`,
                    format: 'base64',
                    provider: neutralProvider(result.provider)
                });
            }

            return res.json({
                status: true,
                model: result.modelLabel,
                image: cloak(req, result.url),
                format: 'url',
                provider: neutralProvider(result.provider)
            });
        } catch (e) {
            noteBlocked(req, e, '/ai/tao-anh').catch(() => {});
            const log = require('../../utils/logger');
            log(`[AI-TAO-ANH] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tạo ảnh AI' });
        }
    }
};
