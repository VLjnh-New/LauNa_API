'use strict';

/**
 * /lienquan/skins
 *
 * Danh sách trang phục của một tướng Liên Quân (scrape từ trang chính thức Garena).
 * Bao gồm: skins (tên, ảnh, icon) + skills (kèm mô tả).
 *
 * Cách dùng:
 *   /lienquan/skins?name=Airi
 *   /lienquan/skins?name=violet
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');

const BASE_URL = 'https://lienquan.garena.vn/hoc-vien/tuong-skin/';
const { randomUA } = require('../../utils/http/browser-headers');

const heroListCache = new LRUCache({ max: 1, ttl: 30 * 60 * 1000 });
const heroDetailCache = new LRUCache({ max: 200, ttl: 30 * 60 * 1000 });

const resolveSrc = (src) => {
    if (!src) return null;
    return src.startsWith('http') ? src : `https://lienquan.garena.vn${src}`;
};

async function getAllHeroes() {
    const cached = heroListCache.get('all');
    if (cached) return cached;

    const res = await axios.get(BASE_URL, { headers: { 'User-Agent': randomUA() }, timeout: 15000 });
    const $ = cheerio.load(res.data);
    const heroes = [];
    $('a.st-heroes__item').each((_, el) => {
        const name = $(el).find('img').attr('alt');
        const image = resolveSrc($(el).find('img').attr('src'));
        const link = resolveSrc($(el).attr('href'));
        if (name && link) heroes.push({ name, image, link });
    });
    heroListCache.set('all', heroes);
    return heroes;
}

async function getHeroDetail(link) {
    const cached = heroDetailCache.get(link);
    if (cached) return cached;

    const res = await axios.get(link, { headers: { 'User-Agent': randomUA() }, timeout: 15000 });
    const $ = cheerio.load(res.data);

    const skinThumbs = [];
    $('ul.hero__skins--list li').each((_, el) => {
        const title = $(el).find('a').attr('title')?.trim();
        const thumb = resolveSrc($(el).find('img').attr('src'));
        if (title && thumb) skinThumbs.push({ name: title, avatar: thumb });
    });

    const skins = [];
    $('section.hero__skins .hero__skins--detail').each((i, el) => {
        const h3 = $(el).find('h3');
        const name = h3.clone().children('img').remove().end().text().trim();
        const icon = resolveSrc(h3.find('img').attr('src'));
        const image = resolveSrc($(el).find('picture img').attr('src'));
        const avatar = skinThumbs[i]?.avatar || image;
        skins.push({ name, icon, image, avatar });
    });

    const skills = [];
    $('section.hero__skills .hero__skills--detail').each((i, el) => {
        const name = $(el).find('h3').text().trim();
        const description = $(el).find('article').text().trim();
        const image = resolveSrc(
            $(`ul.hero__skills--list li:nth-child(${i + 1}) img`).attr('src')
        );
        skills.push({ name, description, image });
    });

    const detail = { skins, skills };
    heroDetailCache.set(link, detail);
    return detail;
}

module.exports = {
    name: '/lienquan/skins',
    index: async (req, res) => {
        const name = (req.query.name || req.query.hero || '').toString().trim();
        if (!name) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'name'.",
                example: '/lienquan/skins?name=Airi'
            });
        }

        try {
            const heroes = await getAllHeroes();
            const lower = name.toLowerCase();
            const hero = heroes.find(h => h.name.toLowerCase() === lower)
                      || heroes.find(h => h.name.toLowerCase().includes(lower));

            if (!hero) {
                return res.status(404).json({
                    status: false,
                    message: `Không tìm thấy tướng: ${name}`
                });
            }

            const detail = await getHeroDetail(hero.link);
            return res.json({
                status: true,
                data: {
                    name: hero.name,
                    image: hero.image,
                    link: hero.link,
                    skins: detail.skins,
                    skills: detail.skills
                }
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LQ-SKINS] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy skin Liên Quân' });
        }
    }
};
