'use strict';

const axios = require('axios');
const FormData = require('form-data');
const https = require('https');
const { proxyPool } = require('./proxy-pool');

function listenSSE(sseUrl, extractResult, origin, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(sseUrl);
        let settled = false;

        const done = (fn, arg) => {
            if (settled) return;
            settled = true;
            fn(arg);
        };

        const req = https.get({
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Origin': origin || 'https://taoanhdep.com'
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
                    const dataLine = part.split('\n').find(l => l.startsWith('data:'));
                    if (!dataLine) continue;
                    let json;
                    try { json = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
                    if (json.msg === 'process_completed') {
                        const err = json.output?.error;
                        if (err) return done(reject, new Error(`Lỗi xử lý: ${err}`));
                        try {
                            const result = extractResult(json.output);
                            if (result == null) return done(reject, new Error('Không tìm thấy kết quả trong output'));
                            res.destroy();
                            return done(resolve, result);
                        } catch (e) {
                            return done(reject, e);
                        }
                    }
                }
            });
            res.on('end', () => done(reject, new Error('SSE kết thúc không có kết quả')));
            res.on('error', e => done(reject, e));
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy();
            done(reject, new Error(`Timeout chờ AI xử lý (${Math.round(timeoutMs / 60000)} phút)`));
        });
        req.on('error', reject);
    });
}

async function uploadImageToGradio(uploadUrl, imgBuf, ext, ct, extraHeaders = {}, useProxy = false) {
    const fd = new FormData();
    fd.append('files', imgBuf, { filename: `image.${ext}`, contentType: ct });
    const headers = { ...fd.getHeaders(), 'Origin': 'https://taoanhdep.com', ...extraHeaders };
    const fn = useProxy ? opts => proxyPool.axios(opts) : opts => axios(opts);
    const r = await fn({ method: 'post', url: uploadUrl, data: fd, headers, timeout: 30000, validateStatus: () => true });
    const raw = r.data;
    const arr = Array.isArray(raw) ? raw : (raw?.result && Array.isArray(raw.result) ? raw.result : null);
    if (!arr || !arr[0]) throw new Error('Upload ảnh thất bại');
    return arr[0];
}

async function joinGradioQueue(queueUrl, body, extraHeaders = {}, useProxy = false) {
    const headers = { 'Content-Type': 'application/json', 'Origin': 'https://taoanhdep.com', ...extraHeaders };
    const fn = useProxy ? opts => proxyPool.axios(opts) : opts => axios(opts);
    const r = await fn({
        method: 'post', url: queueUrl, data: JSON.stringify(body),
        headers, timeout: 30000, validateStatus: () => true
    });
    if (r.status !== 200) throw new Error(`Join queue thất bại (${r.status})`);
    const data = r.data;
    const result = data?.result || data;
    const eventId = result?.event_id;
    if (!eventId) throw new Error(`Không nhận được event_id: ${JSON.stringify(data).slice(0, 100)}`);
    return eventId;
}

module.exports = { listenSSE, uploadImageToGradio, joinGradioQueue };
