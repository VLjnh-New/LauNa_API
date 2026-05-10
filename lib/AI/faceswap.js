'use strict';

const axios = require('axios');
const FormData = require('form-data');
const https = require('https');
const { sleep, fetchBuffer } = require('../../utils/http');
const taoanhdep = require('../../utils/taoanhdep/api');
const { shouldUseProxy, noteBlocked, axiosFor, explicitProxyFlag } = require('../../utils/ai-proxy-helper');
const { randomUA } = require('../../utils/http/browser-headers');

// ─── Provider 1: Gradio HF Space (tonyassi/face-swap) ────────────────────────

const GRADIO = {
    base: 'https://tonyassi-face-swap.hf.space',
    upload: '/gradio_api/upload',
    call: '/gradio_api/call/swap_faces'
};

async function gradioUpload(imgBuf, ext, ct, useProxy = false) {
    const fd = new FormData();
    fd.append('files', imgBuf, { filename: `img.${ext}`, contentType: ct });
    const ax = axiosFor(useProxy);
    const r = await ax({
        method: 'post',
        url: GRADIO.base + GRADIO.upload,
        data: fd,
        headers: { ...fd.getHeaders(), 'User-Agent': randomUA() },
        timeout: 30000
    });
    if (!Array.isArray(r.data) || !r.data[0]) throw new Error('Upload Gradio thất bại');
    return r.data[0];
}

function gradioSSE(eventId, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
        const req = https.get({
            hostname: new URL(GRADIO.base).hostname,
            path: `${GRADIO.call}/${eventId}`,
            headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache', 'User-Agent': randomUA() }
        }, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`SSE status ${res.statusCode}`));
            let buf = '';
            res.on('data', chunk => {
                buf += chunk.toString();
                const parts = buf.split('\n\n');
                buf = parts.pop();
                for (const part of parts) {
                    const lines = part.split('\n');
                    const evt = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
                    const dataLine = lines.find(l => l.startsWith('data:'));
                    if (!evt) continue;

                    if ((evt === 'complete' || evt === 'process_completed') && dataLine) {
                        try {
                            const data = JSON.parse(dataLine.slice(5).trim());
                            const outputs = Array.isArray(data) ? data : data?.output?.data;
                            const out = outputs?.[0];
                            if (!out) return reject(new Error('Gradio không trả về kết quả'));
                            const url = out.url || (out.path ? `${GRADIO.base}/gradio_api/file=${out.path}` : null);
                            if (url) return resolve(url);
                            return reject(new Error('Không tìm thấy URL ảnh kết quả'));
                        } catch {
                            return reject(new Error('Parse kết quả Gradio thất bại'));
                        }
                    }
                    if (evt === 'error') {
                        const errMsg = dataLine ? dataLine.slice(5).trim() : 'null';
                        if (errMsg === 'null' || errMsg === '') {
                            return reject(new Error('Không phát hiện khuôn mặt trong ảnh'));
                        }
                        return reject(new Error(`Gradio lỗi: ${errMsg}`));
                    }
                }
            });
            res.on('end', () => reject(new Error('SSE kết thúc không có kết quả')));
            res.on('error', reject);
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout chờ Gradio')); });
        req.on('error', reject);
    });
}

async function doGradioSwap(targetImg, sourceImg, useProxy = false) {
    const [targetPath, sourcePath] = await Promise.all([
        gradioUpload(targetImg.buffer, targetImg.ext, targetImg.contentType, useProxy),
        gradioUpload(sourceImg.buffer, sourceImg.ext, sourceImg.contentType, useProxy)
    ]);

    const mkFile = path => ({ path, orig_name: 'img.jpg', meta: { _type: 'gradio.FileData' } });
    const ax = axiosFor(useProxy);
    const sub = await ax({
        method: 'post',
        url: GRADIO.base + GRADIO.call,
        data: { data: [mkFile(sourcePath), mkFile(targetPath)] },
        headers: { 'Content-Type': 'application/json', 'User-Agent': randomUA() },
        timeout: 20000
    });
    const eventId = sub.data?.event_id;
    if (!eventId) throw new Error('Không nhận được event_id');

    return gradioSSE(eventId);
}

// ─── Provider 2: taoanhdep.com `/doi-mat` (qua helper chung) ─────────────────

async function doTaoanhdepSwap(targetImg, sourceImg) {
    const result = await taoanhdep.call('doi-mat', {
        target:      { buf: targetImg.buffer, ext: targetImg.ext, contentType: targetImg.contentType },
        source:      { buf: sourceImg.buffer, ext: sourceImg.ext, contentType: sourceImg.contentType },
        enhancer:    'false',
        'check-nsfw': 'false'
    });
    return result.image; // base64 data URL
}

// ─── Main logic with retry + fallback ────────────────────────────────────────

async function doFaceSwap({ targetUrl, sourceUrl, format = 'url', useProxy = false }) {
    const [targetImg, sourceImg] = await Promise.all([
        fetchBuffer(targetUrl),
        fetchBuffer(sourceUrl)
    ]);

    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const resultUrl = await doGradioSwap(targetImg, sourceImg, useProxy);
            if (format === 'base64') {
                const imgResp = await axios.get(resultUrl, { responseType: 'arraybuffer', timeout: 20000, headers: { 'User-Agent': randomUA() } });
                const b64 = Buffer.from(imgResp.data).toString('base64');
                const mime = imgResp.headers['content-type'] || 'image/webp';
                return { image: `data:${mime};base64,${b64}`, format: 'base64', provider: 'primary', _rawUrl: null };
            }
            return { image: resultUrl, format: 'url', provider: 'primary', _rawUrl: resultUrl };
        } catch (e) {
            lastError = e;
            if (e.message.includes('khuôn mặt') || e.message.includes('face')) throw e;
            if (attempt < 2) await sleep(3000);
        }
    }

    try {
        const b64DataUrl = await doTaoanhdepSwap(targetImg, sourceImg);
        if (format === 'url') {
            return { image: b64DataUrl, format: 'base64', provider: 'backup', note: 'Provider chính không khả dụng, kết quả trả về base64' };
        }
        return { image: b64DataUrl, format: 'base64', provider: 'backup' };
    } catch (e2) {
        const { sanitizeString } = require('../../utils/security/url-cloak');
        throw new Error(sanitizeString(`Tất cả provider thất bại. Primary: ${lastError?.message} | Backup: ${e2.message}`));
    }
}

// ─── Route ───────────────────────────────────────────────────────────────────

module.exports = {
    name: '/ai/faceswap',
    index: async (req, res) => {
        const { target, source, format } = req.query;

        if (!target || !source) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'target' hoặc 'source'",
                params: {
                    target: 'URL ảnh nền (ảnh cần thay khuôn mặt)',
                    source: 'URL khuôn mặt cần ghép vào',
                    format: '(tuỳ chọn) url (mặc định) | base64'
                },
                example: '/ai/faceswap?target=https://i.imgur.com/anh-nen.jpg&source=https://i.imgur.com/mat.jpg'
            });
        }

        try {
            const useProxy = await shouldUseProxy(req, explicitProxyFlag(req));
            const result = await doFaceSwap({
                targetUrl: target,
                sourceUrl: source,
                format: format === 'base64' ? 'base64' : 'url',
                useProxy
            });
            const { cloak } = require('../../utils/security/url-cloak');
            const { _rawUrl, ...safe } = result;
            if (_rawUrl) safe.image = cloak(req, _rawUrl);
            return res.json({ status: true, ...safe });
        } catch (e) {
            noteBlocked(req, e, '/ai/faceswap').catch(() => {});
            const log = require('../../utils/logger');
            log(`[FACESWAP] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi xử lý faceswap' });
        }
    }
};
