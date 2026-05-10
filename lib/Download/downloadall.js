'use strict';

/**
 * Provider: downloadall.app/api/analyze
 * Trả về dữ liệu đã chuẩn hoá theo format `{medias:[...], ...}` để khớp với hasMedia() trong all.js.
 *
 * LƯU Ý: server downloadall.app hiện chạy demo mode (luôn trả BigBuckBunny.mp4) cho tới khi
 * họ cấu hình COBALT_API_URL. Khi backend của họ bật lên, provider này tự động trả kết quả thật.
 */

const axios = require('axios');

const ENDPOINT = 'https://downloadall.app/api/analyze';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const TIMEOUT = 15_000;

async function analyze(url) {
    const { data, status } = await axios.post(ENDPOINT, { url }, {
        timeout: TIMEOUT,
        headers: {
            'content-type':    'application/json',
            'accept':          'application/json, text/plain, */*',
            'origin':          'https://downloadall.app',
            'referer':         'https://downloadall.app/',
            'user-agent':      UA,
            'accept-language': 'en-US,en;q=0.9'
        },
        validateStatus: () => true
    });
    if (status >= 400) {
        const err = new Error(`downloadall.app trả ${status}`);
        err.upstream = data;
        throw err;
    }
    return data;
}

function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.status === 'error') {
        const err = new Error(raw.text || 'downloadall.app báo lỗi');
        err.upstream = raw;
        throw err;
    }

    const medias = [];
    if (Array.isArray(raw.picker)) {
        for (const p of raw.picker) {
            if (p && typeof p.url === 'string' && /^https?:\/\//i.test(p.url)) {
                medias.push({
                    type:      p.type || 'video',
                    url:       p.url,
                    thumbnail: p.thumb || undefined
                });
            }
        }
    }
    if (typeof raw.url === 'string' && /^https?:\/\//i.test(raw.url) && !medias.some(m => m.url === raw.url)) {
        medias.push({
            type: raw.status === 'audio' ? 'audio' : 'video',
            url:  raw.url
        });
    }

    if (!medias.length) return null;
    return {
        source:   'downloadall',
        status:   raw.status || 'ok',
        filename: raw.filename || undefined,
        medias
    };
}

async function downloadAll(url) {
    const raw  = await analyze(url);
    const norm = normalize(raw);
    if (!norm) {
        const err = new Error('downloadall.app không trả media');
        err.upstream = raw;
        throw err;
    }
    return norm;
}

module.exports = { analyze, normalize, downloadAll, helper: true };
