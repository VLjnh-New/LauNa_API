'use strict';

const axios = require('axios');

const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

function httpClient(useProxy) {
    if (useProxy && global.proxyPool) return (cfg) => global.proxyPool.axios(cfg);
    return (cfg) => axios(cfg);
}

function parseBase64Input(input) {
    const m = String(input).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (m) return { mimeType: m[1], data: m[2] };
    return { mimeType: 'image/jpeg', data: String(input).replace(/^data:.*;base64,/, '') };
}

async function fetchImageAsBase64(url, useProxy = false) {
    const client = httpClient(useProxy);
    const resp = await client({
        method: 'get',
        url,
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: 20 * 1024 * 1024,
        headers: { 'User-Agent': 'Mozilla/5.0 LauNa-API' },
    });
    const mimeType = (resp.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
    if (!mimeType.startsWith('image/')) throw new Error(`URL không phải ảnh (content-type: ${mimeType})`);
    const data = Buffer.from(resp.data).toString('base64');
    return { mimeType, data };
}

async function callGemini(body, apiKey, useProxy) {
    const client = httpClient(useProxy);
    const { data } = await client({
        method: 'post',
        url: GEMINI_ENDPOINT,
        params: { key: apiKey },
        data: body,
        timeout: 60000,
        headers: { 'Content-Type': 'application/json' },
    });
    return data;
}

async function askGeminiVision(imageInput, prompt, useProxy = false) {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Thiếu GOOGLE_API_KEY trong biến môi trường');

    let imagePart;
    try {
        imagePart = /^https?:\/\//i.test(imageInput)
            ? await fetchImageAsBase64(imageInput, useProxy)
            : parseBase64Input(imageInput);
    } catch (e) {
        // Tải ảnh trực tiếp lỗi → thử qua proxy nếu chưa dùng
        if (!useProxy && global.proxyPool && /^https?:\/\//i.test(imageInput)) {
            imagePart = await fetchImageAsBase64(imageInput, true);
        } else {
            throw e;
        }
    }

    const body = {
        contents: [{
            parts: [
                { inline_data: { mime_type: imagePart.mimeType, data: imagePart.data } },
                { text: prompt },
            ],
        }],
    };

    try {
        const data = await callGemini(body, apiKey, useProxy);
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n').trim();
        if (!text) throw new Error('Gemini không trả về nội dung');
        return text;
    } catch (e) {
        // Nếu request trực tiếp fail và proxy chưa được dùng → retry qua proxy
        if (!useProxy && global.proxyPool) {
            const data = await callGemini(body, apiKey, true);
            const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('\n').trim();
            if (!text) throw new Error('Gemini không trả về nội dung');
            return text;
        }
        throw e;
    }
}

module.exports = { askGeminiVision, fetchImageAsBase64, parseBase64Input, GEMINI_MODEL };
