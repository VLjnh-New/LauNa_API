'use strict';
const axios = require('axios');
const log   = require('../../utils/logger');

const BASE = 'https://snapvie.com';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const PLATFORM_MAP = {
    'youtube.com': 'youtube',  'youtu.be': 'youtube',
    'tiktok.com':  'tiktok',   'vt.tiktok.com': 'tiktok',
    'douyin.com':  'douyin',
    'instagram.com':'instagram',
    'facebook.com':'facebook', 'fb.watch': 'facebook', 'fb.me': 'facebook', 'm.facebook.com': 'facebook',
    'twitter.com': 'twitter',  'x.com': 'twitter',
    'reddit.com':  'reddit',
    'linkedin.com':'linkedin',
    'pinterest.com':'pinterest',
    'snapchat.com':'snapchat',
    'telegram.me': 'telegram', 't.me': 'telegram',
    'bilibili.com':'bilibili',
    'weibo.com':   'weibo',
    'amazon.com':  'amazon',   'amazon.co': 'amazon',
    'douyin.com':  'douyin',
    'ximalaya.com':'ximalaya',
};

const SUPPORTED_PLATFORMS = new Set(Object.values(PLATFORM_MAP));

function detectPlatform(url) {
    try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        for (const [domain, platform] of Object.entries(PLATFORM_MAP)) {
            if (host === domain || host.endsWith('.' + domain)) return platform;
        }
    } catch { /* invalid URL */ }
    return null;
}

function normalizeFormats(formats = []) {
    return formats.map(f => ({
        quality:    f.quality     || 'unknown',
        ext:        f.ext         || 'mp4',
        url:        f.url         || '',
        has_audio:  f.has_audio   ?? true,
        audio_only: f.is_audio_only ?? false,
        codec:      f.codec_label || '',
        bitrate:    f.bitrate     || null,
        size:       f.filesize    || null,
        format_id:  f.format_id   || '',
        stream_context_id: f.stream_context_id || null,
    })).filter(f => f.url);
}

async function snapvieExtract(url, bypassCache = false) {
    const cleanUrl = (url || '').trim();
    if (!cleanUrl) throw new Error('URL rỗng');

    const platform = detectPlatform(cleanUrl);
    const referer  = platform ? `${BASE}/${platform}` : BASE;

    const res = await axios.post(
        `${BASE}/api/proxy/extract`,
        { url: cleanUrl, bypass_cache: bypassCache },
        {
            headers: {
                'Content-Type': 'application/json',
                'Accept':       'application/json',
                'Origin':       BASE,
                'Referer':      referer,
                'User-Agent':   UA,
            },
            timeout: 45000,
            validateStatus: () => true,
        }
    );

    if (res.status !== 200) {
        const msg = res.data?.error || res.data?.message || `HTTP ${res.status}`;
        throw new Error(`[Snapvie] ${msg}`);
    }

    const d = res.data;
    if (d.status === 'error' || d.error) {
        throw new Error(`[Snapvie] ${d.error || d.message || 'Extraction failed'}`);
    }

    const meta    = d.metadata || {};
    const formats = normalizeFormats(meta.formats);

    if (!formats.length) throw new Error('[Snapvie] Không có format nào');

    return {
        source:    d.platform || platform || 'snapvie',
        title:     meta.title       || '',
        author:    meta.channel     || meta.author || '',
        thumbnail: meta.thumbnail   || '',
        duration:  meta.duration    || null,
        views:     meta.view_count  || null,
        medias:    formats,
        _raw:      d,
    };
}

// ── dedup inflight ────────────────────────────────────────────────────────────
const _inflight = new Map();

async function downloadAll(url) {
    const key = (url || '').trim();
    if (_inflight.has(key)) return _inflight.get(key);
    const p = snapvieExtract(key)
        .then(data => {
            log(`[Snapvie] OK — ${data.medias.length} format(s) | ${key.slice(0, 70)}`, 'API');
            return data;
        })
        .catch(e => {
            log(`[Snapvie] Lỗi: ${e.message}`, 'WARN');
            throw e;
        })
        .finally(() => _inflight.delete(key));
    _inflight.set(key, p);
    return p;
}

// ── Route ─────────────────────────────────────────────────────────────────────
module.exports = {
    downloadAll,
    snapvieExtract,
    detectPlatform,
    SUPPORTED_PLATFORMS,
    name: '/download/snapvie',
    index: async (req, res) => {
        const url         = req.query.url;
        const bypassCache = ['1','true','yes'].includes(String(req.query.bypass_cache || '').toLowerCase());

        if (!url) return res.status(400).json({
            status:  false,
            message: "Thiếu tham số 'url'",
            example: '/download/snapvie?url=https://youtu.be/...',
            supported_platforms: [...SUPPORTED_PLATFORMS].sort(),
        });

        try {
            const data = await downloadAll(url);
            return res.json({ status: true, data });
        } catch (e) {
            log(`[Snapvie] Route error: ${e.message}`, 'ERROR');
            return res.status(500).json({ status: false, message: 'Lỗi tải media Snapvie' });
        }
    },
};
