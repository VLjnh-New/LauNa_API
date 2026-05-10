'use strict';

/**
 * /stats — Stats public của profile mạng xã hội.
 *
 * Cách dùng:
 *   /stats?platform=tiktok&user=mrbeast
 *   /stats?platform=youtube&user=@MrBeast
 *   /stats?platform=youtube&channel=UCX6OQ3DkcsbYNE6H8uQQuVA
 *   /stats?platform=instagram&user=instagram
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 1000, ttl: 30 * 60 * 1000 });
const { randomUA } = require('../../utils/http/browser-headers');

async function statsTikTok(user) {
    const username = user.replace(/^@/, '');
    const url = `https://www.tiktok.com/@${encodeURIComponent(username)}`;
    const r = await axios.get(url, { headers: { 'User-Agent': randomUA() }, timeout: 15000, validateStatus: () => true });
    if (r.status !== 200) throw new Error(`TikTok HTTP ${r.status}`);
    const html = String(r.data);
    const m = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)</);
    if (!m) {
        // Fallback meta scrape
        const followers = html.match(/"followerCount":(\d+)/)?.[1];
        const likes = html.match(/"heartCount":(\d+)/)?.[1];
        const videos = html.match(/"videoCount":(\d+)/)?.[1];
        const nick = html.match(/"nickname":"([^"]+)"/)?.[1];
        if (!followers && !nick) throw new Error('Không parse được dữ liệu TikTok');
        return { platform: 'tiktok', username, nickname: nick, followers: +followers || null, likes: +likes || null, videos: +videos || null, url };
    }
    try {
        const data = JSON.parse(m[1]);
        const u = data?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
        if (!u) throw new Error('Không có dữ liệu user');
        return {
            platform: 'tiktok',
            username,
            nickname: u.user.nickname,
            avatar: u.user.avatarLarger,
            verified: !!u.user.verified,
            bio: u.user.signature,
            followers: u.stats.followerCount,
            following: u.stats.followingCount,
            likes: u.stats.heartCount,
            videos: u.stats.videoCount,
            url
        };
    } catch (e) {
        throw new Error('Parse JSON TikTok lỗi: ' + e.message);
    }
}

async function statsYouTube(input) {
    let url;
    if (/^UC[\w-]{20,}$/.test(input)) {
        url = `https://www.youtube.com/channel/${encodeURIComponent(input)}/about`;
    } else {
        const handle = input.startsWith('@') ? input : '@' + input;
        url = `https://www.youtube.com/${encodeURIComponent(handle)}/about`;
    }
    const r = await axios.get(url, { headers: { 'User-Agent': randomUA() }, timeout: 15000, validateStatus: () => true });
    if (r.status !== 200) throw new Error(`YouTube HTTP ${r.status}`);
    const html = String(r.data);
    const channelId = html.match(/"channelId":"(UC[\w-]{20,})"/)?.[1];
    const name = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || html.match(/"title":"([^"]+)"/)?.[1];
    const subText = html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/)?.[1] ||
                    html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/)?.[1];
    const videosCount = html.match(/"videosCountText":\{"runs":\[\{"text":"([\d.,]+)"/)?.[1];
    const viewsCount = html.match(/"viewCountText":\{"simpleText":"([\d.,\s]+lượt xem|[\d.,\s]+views)"/)?.[1];
    const avatar = html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/)?.[1];
    const desc = html.match(/<meta property="og:description" content="([^"]+)"/)?.[1];

    return {
        platform: 'youtube',
        channelId,
        name,
        avatar,
        description: desc,
        subscribersText: subText,
        totalVideos: videosCount,
        totalViews: viewsCount,
        url
    };
}

async function statsInstagram(user) {
    const username = user.replace(/^@/, '');
    const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;
    const r = await axios.get(url, { headers: { 'User-Agent': randomUA() }, timeout: 15000, validateStatus: () => true });
    if (r.status !== 200) throw new Error(`Instagram HTTP ${r.status} (có thể bị chặn)`);
    const html = String(r.data);
    const $ = cheerio.load(html);
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const ogTitle = $('meta[property="og:title"]').attr('content') || '';
    // og:description thường: "1.2M Followers, 50 Following, 100 Posts - See Instagram photos and videos from..."
    const m = ogDesc.match(/^([\d.,KMB]+)\s+Followers,\s+([\d.,KMB]+)\s+Following,\s+([\d.,KMB]+)\s+Posts/);
    if (!m) throw new Error('Instagram chặn scrape, không lấy được stats');
    return {
        platform: 'instagram',
        username,
        nameTitle: ogTitle,
        followersText: m[1],
        followingText: m[2],
        postsText: m[3],
        url
    };
}

const HANDLERS = { tiktok: statsTikTok, youtube: statsYouTube, instagram: statsInstagram, ig: statsInstagram, yt: statsYouTube, tt: statsTikTok };

module.exports = {
    name: '/stats',
    index: async (req, res) => {
        const platform = (req.query.platform || req.query.p || '').toString().toLowerCase().slice(0, 50);
        const user = (req.query.user || req.query.u || req.query.channel || req.query.username || '').toString().trim().slice(0, 200);

        if (!platform || !user) {
            return res.status(400).json({
                status: false,
                message: "Thiếu 'platform' và/hoặc 'user'.",
                example: '/stats?platform=tiktok&user=mrbeast',
                supported: ['tiktok', 'youtube', 'instagram']
            });
        }
        const handler = HANDLERS[platform];
        if (!handler) {
            return res.status(400).json({ status: false, message: `Platform không hỗ trợ: ${platform}`, supported: ['tiktok', 'youtube', 'instagram'] });
        }

        const cacheKey = `${platform}:${user.toLowerCase()}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json({ ...cached, cached: true });

        try {
            const data = await handler(user);
            const out = { status: true, ...data };
            cache.set(cacheKey, out);
            return res.json(out);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[STATS] ${platform}/${user} lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: 'Lỗi lấy thống kê' });
        }
    }
};
