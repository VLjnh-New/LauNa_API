'use strict';
const axios = require('axios');

async function downloadViaTikWM(url) {
    const { data: res } = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`, { timeout: 15000 });
    if (res.code !== 0 || !res.data) throw new Error(`TikWM: ${res.msg || 'không có data'}`);
    const d = res.data;
    return {
        title: d.title || '',
        author: d.author?.nickname || 'Douyin User',
        videoUrl: d.play || d.wmplay || null,
        audioUrl: d.music || null,
        images: d.images || [],
        cover: d.cover || d.origin_cover || null
    };
}

async function downloadViaSaveTik(url) {
    const params = new URLSearchParams();
    params.append('q', url);
    params.append('cursor', '0');
    params.append('page', '0');
    params.append('lang', 'vi');
    const { data: resData } = await axios.post('https://savetik.io/api/ajaxSearch', params.toString(), {
        timeout: 15000,
        headers: {
            'accept': '*/*',
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'origin': 'https://savetik.io',
            'referer': 'https://savetik.io/vi/douyin-video-downloader',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
        }
    });
    if (!resData || resData.status !== 'ok' || !resData.data) throw new Error('SaveTik: status không ok');
    const html = resData.data;
    const result = { title: '', author: 'Douyin User', videoUrl: null, audioUrl: null, images: [], cover: null };
    const titleMatch = html.match(/<h3>([\s\S]*?)<\/h3>/);
    if (titleMatch) result.title = titleMatch[1].replace(/#\S+/g, '').replace(/<[^>]+>/g, '').trim();
    const coverMatch = html.match(/<div class="image-tik">[\s\S]*?<img src="([^"]+)"/);
    if (coverMatch) result.cover = coverMatch[1].replace(/&amp;/g, '&');
    const imageDataMatch = html.match(/data-imageData="([^"]+)"/);
    if (imageDataMatch) {
        try { result.images = Buffer.from(imageDataMatch[1], 'base64').toString('utf-8').split(';').filter(u => u.startsWith('http')); } catch {}
    }
    const aTags = [...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    for (const match of aTags) {
        const href = match[1].replace(/&amp;/g, '&');
        const text = match[2].toLowerCase();
        if ((text.includes('mp3') || text.includes('âm thanh')) && !result.audioUrl && href.startsWith('http')) result.audioUrl = href;
        else if ((text.includes('video') || text.includes('mp4')) && href.startsWith('http') && !href.includes('#')) {
            if (!result.videoUrl) result.videoUrl = href;
            if (text.includes('hd') || text.includes('không logo')) result.videoUrl = href;
        }
    }
    if (!result.videoUrl && result.images.length === 0) throw new Error('Không tìm thấy media');
    return result;
}

function isStoryDouyin(url) {
    return /\/note\/|note\.douyin\.com|aweme_type=15[01]|\/share\/slides\//i.test(String(url || ''));
}

async function downloadViaAllFallback(url) {
    try {
        const { downloadAuto } = require('./all');
        const r = await downloadAuto(url, { type: 'auto' });
        const d = r?.data || {};
        return {
            title:    d.title || 'Douyin',
            author:   d.author || 'Douyin User',
            videoUrl: d.videoUrl || (Array.isArray(d.medias) ? d.medias.find(m => /video|mp4/i.test(m.type || m.ext || ''))?.url : null) || null,
            audioUrl: d.audioUrl || (Array.isArray(d.medias) ? d.medias.find(m => /audio|mp3/i.test(m.type || m.ext || ''))?.url : null) || null,
            images:   Array.isArray(d.images) ? d.images : (Array.isArray(d.medias) ? d.medias.filter(m => /image|jpg|jpeg|png|webp/i.test(m.type || m.ext || '')).map(m => m.url) : []),
            cover:    d.cover || d.thumbnail || null,
            via:      r.provider
        };
    } catch { return null; }
}

// Chỉ gọi các provider Douyin trực tiếp — dùng cho /download/all (tránh đệ quy)
async function downloadDouyinCore(url) {
    let result = null;
    try { result = await downloadViaSaveTik(url); } catch {}
    if (!result) { try { result = await downloadViaTikWM(url); } catch {} }
    return result;
}

async function downloadDouyin(url) {
    let result = null;

    if (isStoryDouyin(url)) {
        result = await downloadViaAllFallback(url);
    }
    if (!result) result = await downloadDouyinCore(url);
    if (!result) result = await downloadViaAllFallback(url);

    if (!result) throw new Error('Không thể tải video Douyin (kể cả dạng story).');
    return result;
}

module.exports = {
    downloadDouyin,
    downloadDouyinCore,
    name: '/download/douyin',
    index: async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: "Thiếu tham số 'url'", example: '/download/douyin?url=https://v.douyin.com/...' });
        try {
            const result = await downloadDouyin(url);
            return res.json({ status: true, data: result });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[DOUYIN] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tải video Douyin' });
        }
    }
};
