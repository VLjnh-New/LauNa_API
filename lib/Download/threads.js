'use strict';

const axios = require('axios');
const crypto = require('crypto');

const MAGICIAN_API = 'https://magician.snapthreads.app';
const DECRYPT_KEY = '9d819cd8e332d9cbdac77b19c0e24546';

function decrypt(iv, payload) {
    const keyBuf = Buffer.from(DECRYPT_KEY, 'utf8');
    const ivBuf = Buffer.from(iv, 'hex');
    const payBuf = Buffer.from(payload, 'hex');
    const tag = payBuf.slice(-16);
    const ciphertext = payBuf.slice(0, -16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, ivBuf);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(dec.toString());
}

function normalizeUrl(input) {
    input = input.trim();
    // If it's just a username (e.g. @nasa or nasa), build profile URL
    if (!input.startsWith('http')) {
        const username = input.startsWith('@') ? input : '@' + input;
        return `https://www.threads.com/${username}`;
    }
    // Normalize threads.net → threads.com
    return input.replace('threads.net', 'threads.com');
}

function parsePost(raw) {
    let post = raw.post;
    // Handle quoted/reposted
    if (post.text_post_app_info?.share_info?.quoted_post) {
        post = post.text_post_app_info.share_info.quoted_post;
    }
    if (post.text_post_app_info?.share_info?.reposted_post) {
        post = post.text_post_app_info.share_info.reposted_post;
    }

    const hasCarouselVideos = post.carousel_media?.some(m => m.video_versions?.length > 0);
    const hasCarouselPhotos = post.carousel_media?.some(m => m.image_versions2?.candidates?.length > 0 && m.video_versions === null);

    const user = {
        username: post.user?.username,
        full_name: post.user?.full_name,
        is_verified: post.user?.is_verified,
        avatar: post.user?.profile_pic_url
    };

    const caption = post.caption?.text || '';
    const taken_at = post.taken_at;

    // Mixed carousel (photos + videos)
    if (hasCarouselPhotos && hasCarouselVideos && post.carousel_media) {
        const videos = post.carousel_media
            .filter(m => m.video_versions?.length > 0)
            .map(m => {
                const thumb = m.image_versions2?.candidates?.find(c => c.width === m.original_width && c.height === m.original_height)
                    || m.image_versions2?.candidates?.[0];
                return {
                    url: m.video_versions[0].url,
                    width: m.original_width,
                    height: m.original_height,
                    has_audio: m.has_audio,
                    thumbnail: thumb?.url
                };
            }).filter(Boolean);
        const photos = post.carousel_media
            .filter(m => m.image_versions2?.candidates?.length > 0 && m.video_versions === null)
            .map(m => ({
                url: m.image_versions2.candidates[0].url,
                width: m.original_width,
                height: m.original_height
            }));
        return { user, type: 'photos_and_videos', media: { photos, videos }, caption, taken_at };
    }

    // Carousel videos only
    if (hasCarouselVideos && post.carousel_media) {
        const videos = post.carousel_media
            .filter(m => m.video_versions?.length > 0)
            .map(m => {
                const thumb = m.image_versions2?.candidates?.find(c => c.width === m.original_width && c.height === m.original_height)
                    || m.image_versions2?.candidates?.[0];
                return {
                    ...m.video_versions[0],
                    has_audio: m.has_audio,
                    thumbnail: thumb?.url
                };
            }).filter(Boolean);
        return { user, type: 'videos', media: videos, caption, taken_at };
    }

    // Carousel photos only
    if (hasCarouselPhotos && post.carousel_media) {
        const photos = post.carousel_media
            .filter(m => m.image_versions2?.candidates?.length > 0)
            .map(m => m.image_versions2.candidates[0]);
        return { user, type: 'photos', media: photos, caption, taken_at };
    }

    // Single video
    if (post.video_versions?.length > 0) {
        const thumb = post.image_versions2?.candidates?.find(c => c.width === post.original_width && c.height === post.original_height)
            || post.image_versions2?.candidates?.[0];
        return {
            user,
            type: 'video',
            media: post.video_versions[0],
            width: post.original_width,
            height: post.original_height,
            caption,
            taken_at,
            has_audio: post.has_audio,
            thumbnail: thumb
        };
    }

    // Single photo
    if (post.video_versions === null && post.carousel_media === null && post.image_versions2) {
        const candidates = post.image_versions2.candidates;
        const best = candidates.find(c => c.width === post.original_width && c.height === post.original_height)
            || candidates[0];
        if (best) {
            return { user, type: 'photo', media: [best], caption, taken_at };
        }
    }

    // Text only
    return { user, type: 'text', media: null, caption, taken_at };
}

async function downloadThreads(url) {
    const normalized = normalizeUrl(url);
    const apiUrl = `${MAGICIAN_API}?url=${encodeURIComponent(normalized)}`;
    const response = await axios.get(apiUrl, {
        timeout: 12000,
        headers: { 'Accept': 'application/json' },
        validateStatus: () => true
    });

    if (!response.data?.iv || !response.data?.payload) {
        throw new Error('API không trả về dữ liệu hợp lệ');
    }

    const decrypted = decrypt(response.data.iv, response.data.payload);

    if (decrypted.status === 'error') {
        throw new Error(decrypted.message || 'Không tìm thấy nội dung');
    }

    const raw = decrypted.data;

    if (raw.type === 'profile') {
        const u = raw.profile?.user;
        const avatar = u?.hd_profile_pic_url_info?.url || u?.profile_pic_url;
        return {
            type: 'profile',
            username: u?.username,
            full_name: u?.full_name,
            biography: u?.biography,
            followers: u?.follower_count,
            is_verified: u?.is_verified,
            images: avatar ? [{ url: avatar }] : []
        };
    }

    if (raw.type === 'default' && raw.thread_items) {
        const items = raw.thread_items.map(parsePost).filter(Boolean);
        const medias = [];

        for (const item of items) {
            if (!item.media) continue;
            if (item.type === 'video' || item.type === 'photo') {
                const media = Array.isArray(item.media) ? item.media : [item.media];
                media.forEach(m => {
                    if (m?.url) medias.push({
                        url: m.url,
                        type: item.type,
                        width: m.width || item.width,
                        height: m.height || item.height,
                        thumbnail: item.thumbnail?.[0]?.url || m.thumbnail,
                        has_audio: item.has_audio
                    });
                });
            } else if (item.type === 'photos' || item.type === 'videos') {
                const media = Array.isArray(item.media) ? item.media : [item.media];
                media.forEach(m => {
                    if (m?.url) medias.push({
                        url: m.url,
                        type: item.type.slice(0, -1),
                        width: m.width,
                        height: m.height,
                        thumbnail: m.thumbnail
                    });
                });
            } else if (item.type === 'photos_and_videos') {
                (item.media?.photos || []).forEach(m => {
                    if (m?.url) medias.push({ url: m.url, type: 'photo', width: m.width, height: m.height });
                });
                (item.media?.videos || []).forEach(m => {
                    if (m?.url) medias.push({ url: m.url, type: 'video', width: m.width, height: m.height, thumbnail: m.thumbnail, has_audio: m.has_audio });
                });
            }
        }

        const first = items[0];
        return {
            type: 'post',
            medias,
            caption: first?.caption || '',
            user: first?.user || null,
            taken_at: first?.taken_at || null,
            posts: items
        };
    }

    throw new Error('Định dạng dữ liệu không xác định');
}

module.exports = {
    name: '/download/threads',
    downloadThreads,
    index: async (req, res) => {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                examples: [
                    '/download/threads?url=https://www.threads.com/@nasa/post/ABC123',
                    '/download/threads?url=@nasa',
                    '/download/threads?url=https://www.threads.com/@zuck'
                ]
            });
        }

        const normalized = normalizeUrl(url);

        try {
            const apiUrl = `${MAGICIAN_API}?url=${encodeURIComponent(normalized)}`;
            const response = await axios.get(apiUrl, {
                timeout: 12000,
                headers: { 'Accept': 'application/json' },
                validateStatus: () => true
            });

            if (!response.data?.iv || !response.data?.payload) {
                return res.status(502).json({ status: false, message: 'API không trả về dữ liệu hợp lệ' });
            }

            const decrypted = decrypt(response.data.iv, response.data.payload);

            if (decrypted.status === 'error') {
                return res.status(404).json({
                    status: false,
                    message: decrypted.message || 'Không tìm thấy nội dung',
                    data: decrypted.data
                });
            }

            const raw = decrypted.data;

            // Profile
            if (raw.type === 'profile') {
                const u = raw.profile?.user;
                return res.json({
                    status: true,
                    type: 'profile',
                    data: {
                        username: u?.username,
                        full_name: u?.full_name,
                        biography: u?.biography,
                        followers: u?.follower_count,
                        is_verified: u?.is_verified,
                        avatar: u?.profile_pic_url,
                        avatar_hd: u?.hd_profile_pic_url_info?.url || u?.profile_pic_url
                    }
                });
            }

            // Post(s)
            if (raw.type === 'default' && raw.thread_items) {
                const items = raw.thread_items.map(parsePost).filter(Boolean);
                return res.json({
                    status: true,
                    type: 'post',
                    count: items.length,
                    data: items.length === 1 ? items[0] : items
                });
            }

            return res.json({ status: true, data: raw });

        } catch (e) {
            const log = require('../../utils/logger');
            log(`[THREADS] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tải media Threads' });
        }
    }
};
