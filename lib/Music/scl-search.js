'use strict';

/**
 * /music/scl-search
 *
 * Tìm track trên SoundCloud, trả về list rút gọn cho music player ở web.
 * Dùng `q` (hoặc `query`) làm từ khoá, `limit` mặc định 20 (tối đa 50).
 * Mỗi item gồm: id, title, author, thumbnail, duration, permalink_url.
 * Khi user bấm Play mới gọi tiếp /music/soundcloud?url=... để lấy streamUrl.
 */

const { searchSoundCloud } = require('./soundcloud');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

module.exports = {
    name: '/music/scl-search',
    index: async (req, res) => {
        const query = (req.query.q || req.query.query || '').toString().trim();
        if (!query) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'q'",
                example: '/music/scl-search?q=edm remix&limit=20'
            });
        }

        let limit = parseInt(req.query.limit, 10);
        if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
        if (limit > MAX_LIMIT) limit = MAX_LIMIT;

        try {
            const tracks = await searchSoundCloud(query, limit);
            const data = tracks.map((t) => ({
                id: t.id,
                title: t.title,
                author: t.user?.username || 'SoundCloud Artist',
                thumbnail: (t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t500x500'),
                duration: Math.floor((t.duration || 0) / 1000),
                permalink_url: t.permalink_url
            }));
            return res.json({ status: true, data });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[SCL-SEARCH] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tìm kiếm SoundCloud' });
        }
    }
};
