'use strict';

const axios = require('axios');

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function fetchBuffer(url) {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) throw new Error(`URL không hợp lệ: ${trimmed.slice(0, 60)}`);
    const resp = await axios.get(trimmed, {
        responseType: 'arraybuffer',
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
        maxRedirects: 5,
        validateStatus: () => true
    });
    if (resp.status >= 400) throw new Error(`Không thể tải ảnh (HTTP ${resp.status})`);
    const ct = resp.headers['content-type'] || 'image/jpeg';
    if (!ct.startsWith('image/')) throw new Error(`URL không phải ảnh (content-type: ${ct.split(';')[0]})`);
    const ext = ct.split('/').pop().split(';')[0].replace('jpeg', 'jpg') || 'jpg';
    return { buffer: Buffer.from(resp.data), ext, contentType: ct };
}

async function retryAsync(fn, maxAttempts, delayMs = 3000) {
    let lastError;
    for (let i = 1; i <= maxAttempts; i++) {
        try {
            return await fn(i);
        } catch (e) {
            lastError = e;
            if (i < maxAttempts) await sleep(delayMs);
        }
    }
    throw lastError;
}

module.exports = { sleep, fetchBuffer, retryAsync };
