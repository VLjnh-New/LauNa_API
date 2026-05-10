'use strict';
const axios = require('axios');
let bic3Fetch = null;
try {
    ({ bic3Fetch } = require('./3bic'));
} catch {}

async function downloadViaTikWM(url) {
    const { data: res } = await axios.get('https://www.tikwm.com/api/', {
        params: { url, hd: 1 },
        timeout: 20000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' }
    });
    if (!res || res.code !== 0 || !res.data) return null;
    const d = res.data;
    let images = [];
    let videoUrl = null;
    if (d.images && Array.isArray(d.images) && d.images.length > 0) {
        images = d.images.filter(Boolean);
    } else {
        videoUrl = d.hdplay || d.play || null;
    }
    return {
        title: d.title || 'Video TikTok',
        author: d.author?.nickname || d.author?.unique_id || null,
        avatar: d.author?.avatar || null,
        videoUrl,
        audioUrl: d.music_info?.play || d.music || null,
        cover: d.origin_cover || d.cover || null,
        images,
        stats: {
            views: d.play_count || 0,
            likes: d.digg_count || 0,
            comments: d.comment_count || 0,
            shares: d.share_count || 0
        }
    };
}

async function downloadViaSnapTik(url) {
    const { data } = await axios.post('https://snaptik.fit/api/tiktok', { url }, {
        timeout: 15000,
        headers: {
            'accept': '*/*',
            'content-type': 'application/json',
            'origin': 'https://snaptik.fit',
            'referer': 'https://snaptik.fit/vi',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    if (!data || !data.download_link) return null;
    const links = data.download_link;
    const stats = data.statistics || {};
    const author = data.author || {};
    let images = data.images || [];
    let videoUrl = links.no_watermark_hd || links.no_watermark || null;
    if (Array.isArray(videoUrl)) {
        if (videoUrl.length > 1) { images = images.concat(videoUrl); videoUrl = null; }
        else videoUrl = videoUrl[0] || null;
    }
    return {
        title: data.description || 'Video TikTok',
        author: author.nickname || null,
        avatar: author.avatar || null,
        videoUrl,
        audioUrl: links.mp3 || null,
        cover: data.cover || null,
        images,
        stats: {
            views: stats.play_count || 0,
            likes: stats.digg_count || 0,
            comments: stats.comment_count || 0,
            shares: stats.repost_count || 0
        }
    };
}

function isStoryUrl(url) {
    return /\/story\/|aweme_type=15[01]|tiktok\.com\/.+\/photo\//i.test(String(url || ''));
}

async function downloadViaAllFallback(url) {
    try {
        const { downloadAuto } = require('./all');
        const r = await downloadAuto(url, { type: 'auto' });
        const d = r?.data || {};
        // Chuẩn hoá về shape của /download/tiktok
        return {
            title:    d.title || 'TikTok',
            author:   d.author || null,
            avatar:   d.avatar || null,
            videoUrl: d.videoUrl || (Array.isArray(d.medias) ? d.medias.find(m => /video|mp4/i.test(m.type || m.ext || ''))?.url : null) || null,
            audioUrl: d.audioUrl || (Array.isArray(d.medias) ? d.medias.find(m => /audio|mp3/i.test(m.type || m.ext || ''))?.url : null) || null,
            cover:    d.cover || d.thumbnail || null,
            images:   Array.isArray(d.images) ? d.images : (Array.isArray(d.medias) ? d.medias.filter(m => /image|jpg|jpeg|png|webp/i.test(m.type || m.ext || '')).map(m => m.url) : []),
            stats:    d.stats || { views: 0, likes: 0, comments: 0, shares: 0 },
            via:      r.provider
        };
    } catch { return null; }
}

// Chỉ gọi các provider TikTok trực tiếp (không fallback chéo) — dùng cho /download/all
async function downloadTikTokCore(url) {
    let result = null;
    try { result = await downloadViaTikWM(url); } catch {}
    if (!result) { try { result = await downloadViaSnapTik(url); } catch {} }
    if (!result && bic3Fetch) {
        try {
            const r = await bic3Fetch(url);
            if (r) result = {
                title:    r.title,
                author:   null,
                avatar:   null,
                videoUrl: r.videoUrl,
                audioUrl: r.audioUrl,
                cover:    null,
                images:   [],
                stats:    { views: 0, likes: 0, comments: 0, shares: 0 }
            };
        } catch {}
    }
    return result;
}

async function downloadTikTok(url) {
    let result = null;

    // Story / photo post: ưu tiên fallback chuỗi vì tikwm/snaptik thường bỏ qua
    if (isStoryUrl(url)) {
        result = await downloadViaAllFallback(url);
    }
    if (!result) result = await downloadTikTokCore(url);
    // Cuối cùng: chuỗi fallback chung (vidssave + downr + j2dl + ...)
    if (!result) result = await downloadViaAllFallback(url);

    if (!result) throw new Error('Không thể tải video TikTok từ link này (kể cả dạng story).');
    return result;
}

module.exports = {
    downloadTikTok,
    downloadTikTokCore,
    name: '/download/tiktok',
    index: async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: "Thiếu tham số 'url'", example: '/download/tiktok?url=https://www.tiktok.com/...' });
        try {
            const result = await downloadTikTok(url);
            return res.json({ status: true, data: result });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[TIKTOK] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tải video TikTok' });
        }
    }
};
