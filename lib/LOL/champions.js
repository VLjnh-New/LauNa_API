'use strict';

/**
 * /lol/champions
 *
 * Trả về danh sách toàn bộ tướng League of Legends (scrape từ trang chính thức).
 *
 * Tham số:
 *   ?q=tu khoa     Lọc theo tên (chứa, không phân biệt hoa/thường)
 *   ?limit=200     Giới hạn số kết quả (mặc định 500)
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');

const BASE_URL = 'https://www.leagueoflegends.com/vi-vn/champions/';
const { randomUA } = require('../../utils/http/browser-headers');

const cache = new LRUCache({ max: 1, ttl: 30 * 60 * 1000 });

async function fetchAllChampions() {
    const cached = cache.get('all');
    if (cached) return cached;

    const res = await axios.get(BASE_URL, {
        headers: { 'User-Agent': randomUA(), 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
        timeout: 15000
    });

    const $ = cheerio.load(res.data);
    const jsonRaw = $('#__NEXT_DATA__').html();
    if (!jsonRaw) throw new Error('Không đọc được dữ liệu trang LoL');

    const data = JSON.parse(jsonRaw);
    const blades = data?.props?.pageProps?.page?.blades || [];
    const grid = blades.find(b => b.type === 'characterCardGrid');
    const items = grid?.items || [];

    const list = items.map(item => {
        const url = item.action?.payload?.url || '';
        const slug = url.split('/').filter(Boolean).pop() || '';
        return {
            name: item.title,
            slug,
            image: item.media?.url || null,
            link: url ? `https://www.leagueoflegends.com${url}` : null
        };
    });

    cache.set('all', list);
    return list;
}

module.exports = {
    name: '/lol/champions',
    index: async (req, res) => {
        const q = (req.query.q || '').toString().trim().toLowerCase();
        let limit = parseInt(req.query.limit, 10);
        if (!Number.isFinite(limit) || limit <= 0) limit = 500;

        try {
            let list = await fetchAllChampions();
            if (q) list = list.filter(c => c.name.toLowerCase().includes(q));
            return res.json({
                status: true,
                total: list.length,
                data: list.slice(0, limit)
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LOL-CHAMPS] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy danh sách tướng LoL' });
        }
    }
};
