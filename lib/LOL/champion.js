'use strict';

/**
 * /lol/champion
 *
 * Tra cứu chi tiết một tướng LoL: vai trò, độ khó, mô tả, bộ kỹ năng và toàn bộ trang phục.
 *
 * Cách dùng:
 *   /lol/champion?name=Ahri
 *   /lol/champion?name=lux
 *   /lol/champion?slug=ahri
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');

const LIST_URL = 'https://www.leagueoflegends.com/vi-vn/champions/';
const { randomUA } = require('../../utils/http/browser-headers');

const listCache = new LRUCache({ max: 1, ttl: 30 * 60 * 1000 });
const detailCache = new LRUCache({ max: 200, ttl: 30 * 60 * 1000 });

async function getAllChampions() {
    const cached = listCache.get('all');
    if (cached) return cached;
    const res = await axios.get(LIST_URL, {
        headers: { 'User-Agent': randomUA(), 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
        timeout: 15000
    });
    const $ = cheerio.load(res.data);
    const data = JSON.parse($('#__NEXT_DATA__').html() || '{}');
    const blades = data?.props?.pageProps?.page?.blades || [];
    const items = blades.find(b => b.type === 'characterCardGrid')?.items || [];
    const list = items.map(item => {
        const url = item.action?.payload?.url || '';
        const slug = url.split('/').filter(Boolean).pop() || '';
        return { name: item.title, slug, image: item.media?.url || null, link: `https://www.leagueoflegends.com${url}` };
    });
    listCache.set('all', list);
    return list;
}

async function getChampionDetail(link) {
    const cached = detailCache.get(link);
    if (cached) return cached;

    const res = await axios.get(link, {
        headers: { 'User-Agent': randomUA(), 'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8' },
        timeout: 15000
    });
    const $ = cheerio.load(res.data);
    const data = JSON.parse($('#__NEXT_DATA__').html() || '{}');
    const blades = data?.props?.pageProps?.page?.blades || [];

    const skillsTab = blades.find(b => b.type === 'iconTab');
    const skinsTab = blades.find(b => b.type === 'landingMediaCarousel');
    const masthead = blades.find(b => b.type === 'characterMasthead');

    const skins = (skinsTab?.groups || []).map(s => ({
        name: s.label,
        image: s.content?.media?.url || null
    }));

    const skills = (skillsTab?.groups || []).map(skill => ({
        name: skill.content?.title || '',
        description: skill.content?.description?.body || '',
        image: skill.thumbnail?.url || null
    }));

    const detail = {
        roles: masthead?.role?.roles?.map(r => r.name) || [],
        difficulty: masthead?.difficulty?.name || null,
        description: masthead?.description?.body || '',
        skills,
        skins
    };

    detailCache.set(link, detail);
    return detail;
}

module.exports = {
    name: '/lol/champion',
    index: async (req, res) => {
        const name = (req.query.name || '').toString().trim();
        const slug = (req.query.slug || '').toString().trim().toLowerCase();
        if (!name && !slug) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'name' hoặc 'slug'.",
                example: '/lol/champion?name=Ahri'
            });
        }

        try {
            const list = await getAllChampions();
            const champ = list.find(c =>
                (slug && c.slug.toLowerCase() === slug) ||
                (name && c.name.toLowerCase() === name.toLowerCase())
            ) || list.find(c => name && c.name.toLowerCase().includes(name.toLowerCase()));

            if (!champ) {
                return res.status(404).json({
                    status: false,
                    message: `Không tìm thấy tướng: ${name || slug}`
                });
            }

            const detail = await getChampionDetail(champ.link);
            return res.json({
                status: true,
                data: {
                    name: champ.name,
                    slug: champ.slug,
                    image: champ.image,
                    link: champ.link,
                    ...detail
                }
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LOL-CHAMP] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy thông tin tướng LoL' });
        }
    }
};
