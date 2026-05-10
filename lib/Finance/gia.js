'use strict';

/**
 * /gia — Giá vàng SJC + Tỷ giá USD/EUR Vietcombank + Giá xăng Petrolimex.
 *
 * Cách dùng:
 *   /gia              (cả 3 loại)
 *   /gia?type=vang
 *   /gia?type=usd
 *   /gia?type=xang
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 10, ttl: 10 * 60 * 1000 });
const { randomUA } = require('../../utils/http/browser-headers');

async function getVang() {
    // PNJ public API — có đủ SJC + nhẫn trơn + nữ trang. Giá raw: nghìn VND/chỉ.
    // Quy đổi: 1 lượng = 10 chỉ → VND/lượng = raw * 10000.
    try {
        const r = await axios.get('https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price', {
            headers: { 'User-Agent': randomUA(), 'Accept': 'application/json' },
            timeout: 12000
        });
        const arr = Array.isArray(r.data?.data) ? r.data.data : [];
        const items = arr.map(d => {
            const buy = Number(d.giamua) || 0;
            const sell = Number(d.giaban) || 0;
            return {
                ma: d.masp,
                ten: d.tensp,
                muaVao: buy ? buy * 10000 : null,
                banRa: sell ? sell * 10000 : null
            };
        }).filter(x => x.muaVao || x.banRa);
        return {
            source: 'pnj.com.vn',
            chiNhanh: r.data?.chinhanh || null,
            updated: r.data?.updateDate || null,
            items,
            donVi: 'VND/lượng',
            ghiChu: 'Bao gồm vàng miếng SJC, nhẫn trơn PNJ và nữ trang các tuổi.'
        };
    } catch (e) {
        // Fallback: cafef.vn HTML
        const r = await axios.get('https://cafef.vn/du-lieu/gia-vang-hom-nay.chn', {
            headers: { 'User-Agent': randomUA() }, timeout: 12000
        });
        const $ = cheerio.load(r.data);
        const items = [];
        $('table tr').each((_, tr) => {
            const tds = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
            if (tds.length >= 3 && /\d/.test(tds[1])) {
                const buy = parseInt(tds[1].replace(/[^\d]/g, ''), 10);
                const sell = parseInt(tds[2].replace(/[^\d]/g, ''), 10);
                if (buy || sell) items.push({ ten: tds[0], muaVao: buy || null, banRa: sell || null });
            }
        });
        if (!items.length) throw new Error('Không lấy được dữ liệu vàng từ PNJ và cafef');
        return { source: 'cafef.vn', items, donVi: 'VND/lượng' };
    }
}

async function getUsd() {
    // Vietcombank public exchange rate
    const r = await axios.get('https://www.vietcombank.com.vn/api/exchangerates', {
        params: { date: new Date().toISOString().slice(0, 10) },
        headers: { 'User-Agent': randomUA(), 'Accept': 'application/json' },
        timeout: 12000
    });
    const data = r.data?.Data || [];
    const items = data.map(d => ({
        ma: d.currencyCode,
        ten: d.currencyName,
        muaTienMat: d.cash ? Number(d.cash) : null,
        muaChuyenKhoan: d.transfer ? Number(d.transfer) : null,
        banRa: d.sell ? Number(d.sell) : null
    }));
    return { source: 'vietcombank.com.vn', updated: r.data?.UpdatedDate, items, donVi: 'VND' };
}

async function getXang() {
    // Petrolimex public page
    const r = await axios.get('https://www.petrolimex.com.vn/', {
        headers: { 'User-Agent': randomUA() }, timeout: 12000
    });
    const $ = cheerio.load(r.data);
    const items = [];
    $('table.table-fuel-price tbody tr, .table-fuel-price tr').each((_, tr) => {
        const tds = $(tr).find('td').map((_, td) => $(td).text().trim()).get();
        if (tds.length >= 2 && /\d/.test(tds[1])) {
            items.push({ ten: tds[0], gia: tds[1].replace(/[^\d]/g, ''), donVi: 'VND/lít' });
        }
    });
    if (items.length === 0) {
        // Fallback: look for any element with "Vùng 1"
        const text = $('body').text();
        const m = text.match(/Xăng RON 95-V[^\d]*([\d.,]+).*?Xăng RON 95-III[^\d]*([\d.,]+).*?Xăng E5 RON 92-II[^\d]*([\d.,]+)/s);
        if (m) {
            items.push({ ten: 'Xăng RON 95-V', gia: m[1].replace(/[^\d]/g, '') });
            items.push({ ten: 'Xăng RON 95-III', gia: m[2].replace(/[^\d]/g, '') });
            items.push({ ten: 'Xăng E5 RON 92-II', gia: m[3].replace(/[^\d]/g, '') });
        }
    }
    return { source: 'petrolimex.com.vn', items, donVi: 'VND/lít' };
}

const HANDLERS = { vang: getVang, usd: getUsd, xang: getXang };

module.exports = {
    name: '/gia',
    index: async (req, res) => {
        const type = (req.query.type || '').toString().toLowerCase();
        const cacheKey = type || 'all';
        const cached = cache.get(cacheKey);
        if (cached) return res.json({ ...cached, cached: true });

        try {
            if (type && HANDLERS[type]) {
                const data = await HANDLERS[type]();
                const out = { status: true, type, ...data };
                cache.set(cacheKey, out);
                return res.json(out);
            }

            const [vang, usd, xang] = await Promise.allSettled([getVang(), getUsd(), getXang()]);
            const out = {
                status: true,
                vang: vang.status === 'fulfilled' ? vang.value : { error: vang.reason?.message },
                tyGia: usd.status === 'fulfilled' ? usd.value : { error: usd.reason?.message },
                xang: xang.status === 'fulfilled' ? xang.value : { error: xang.reason?.message }
            };
            cache.set(cacheKey, out);
            return res.json(out);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[GIA] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy dữ liệu giá' });
        }
    }
};
