'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const { namespace } = require('./data/cache');

const BASE = 'https://sms-online.co';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const numbersCache  = namespace('tempsms:numbers',  { max: 5,   ttl: 5 * 60_000 });
const inboxCache    = namespace('tempsms:inbox',    { max: 100, ttl: 30_000 });

const COUNTRY_NAMES = {
    us: 'Mỹ', gb: 'Anh', ca: 'Canada', se: 'Thuỵ Điển', fi: 'Phần Lan',
    fr: 'Pháp', de: 'Đức', nl: 'Hà Lan', be: 'Bỉ', ch: 'Thuỵ Sĩ',
    pl: 'Ba Lan', es: 'Tây Ban Nha', ru: 'Nga', ua: 'Ukraine',
    cn: 'Trung Quốc', hk: 'Hồng Kông', tw: 'Đài Loan', jp: 'Nhật',
    kr: 'Hàn Quốc', my: 'Malaysia', sg: 'Singapore', th: 'Thái Lan',
    vn: 'Việt Nam', id: 'Indonesia', ph: 'Philippines', in: 'Ấn Độ',
    pr: 'Puerto Rico', mx: 'Mexico', br: 'Brazil', au: 'Úc', nz: 'New Zealand',
};

async function fetchHtml(url) {
    const { data } = await axios.get(url, {
        timeout: 15_000,
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
        },
    });
    return data;
}

async function listNumbers() {
    const cached = numbersCache.get('list');
    if (cached) return cached;

    const html = await fetchHtml(`${BASE}/receive-free-sms`);
    const $ = cheerio.load(html);
    const seen = new Set();
    const items = [];

    $('a[href*="/receive-free-sms/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const m = href.match(/\/receive-free-sms\/(\d{6,15})/);
        if (!m) return;
        const number = m[1];
        if (seen.has(number)) return;

        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (!text || text.toLowerCase() === 'open') return;

        const flagClass = $(el).find('span[class*="flag-icon-"]').attr('class') || '';
        const cm = flagClass.match(/flag-icon-([a-z]{2})/);
        const cc = cm ? cm[1] : '';

        seen.add(number);
        items.push({
            number,
            display: text,
            country: cc,
            countryName: COUNTRY_NAMES[cc] || cc.toUpperCase() || 'Khác',
        });
    });

    const out = { total: items.length, items };
    numbersCache.set('list', out);
    return out;
}

async function getInbox(number) {
    const num = String(number).replace(/\D/g, '');
    if (!num || num.length < 6) throw new Error('Số điện thoại không hợp lệ');

    const cached = inboxCache.get(num);
    if (cached) return cached;

    const html = await fetchHtml(`${BASE}/receive-free-sms/${num}`);
    const $ = cheerio.load(html);
    const items = [];

    $('.list-item').each((_, el) => {
        const $el = $(el);
        if ($el.find('ins.adsbygoogle').length) return;
        const from = $el.find('.list-item-title').text().replace(/\s+/g, ' ').trim();
        const time = $el.find('.list-item-meta').text().replace(/\s+/g, ' ').trim();
        const $body = $el.find('.list-item-content');
        if (!from && !$body.length) return;
        const text = $body.text().replace(/\s+/g, ' ').trim();
        if (!text) return;
        items.push({ from: from || '—', time: time || '—', text });
    });

    const out = { number: num, total: items.length, items };
    inboxCache.set(num, out);
    return out;
}

module.exports = { listNumbers, getInbox };
