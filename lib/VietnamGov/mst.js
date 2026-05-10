'use strict';

/**
 * /mst — Tra cứu Mã số thuế (cá nhân + doanh nghiệp).
 *
 * Cách dùng:
 *   /mst?q=0123456789       (theo MST)
 *   /mst?q=Công+ty+ABC      (theo tên DN)
 *
 * Nguồn: masothue.com (scrape HTML) — dữ liệu đồng bộ Tổng cục Thuế.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 1000, ttl: 24 * 60 * 60 * 1000 });
const { randomUA } = require('../../utils/http/browser-headers');

const SEARCH_URL = (q) => `https://masothue.com/Search/?q=${encodeURIComponent(q)}&type=auto`;

function parseDetail($) {
    const tableRows = {};
    $('.table-taxinfo tr, table tr').each((_, tr) => {
        const $tr = $(tr);
        const tds = $tr.find('td');
        if (tds.length >= 2) {
            const k = $(tds[0]).text().trim();
            const v = $(tds[1]).text().trim();
            if (k) tableRows[k] = v;
        }
    });

    const tenDoanhNghiep = $('.taxinfor-name h1').text().trim()
        || $('h1').first().text().trim()
        || tableRows['Tên chính thức']
        || tableRows['Tên quốc tế'];

    return {
        mst: tableRows['Mã số thuế'] || tableRows['MST'],
        tenDoanhNghiep,
        tenViTat: tableRows['Tên viết tắt'],
        diaChi: tableRows['Địa chỉ'],
        nguoiDaiDien: tableRows['Người đại diện'],
        dienThoai: tableRows['Điện thoại'],
        ngayCap: tableRows['Ngày hoạt động'] || tableRows['Ngày cấp'],
        loaiHinh: tableRows['Loại hình DN'] || tableRows['Loại hình hoạt động'],
        nganhNghe: tableRows['Ngành nghề kinh doanh chính'] || tableRows['Ngành nghề kinh doanh'],
        quanLyThue: tableRows['Quản lý bởi'],
        trangThai: tableRows['Tình trạng'] || tableRows['Trạng thái']
    };
}

async function fetchDetail(url) {
    const r = await axios.get(url, {
        headers: { 'User-Agent': randomUA(), 'Accept-Language': 'vi-VN,vi;q=0.9' },
        timeout: 15000,
        maxRedirects: 5,
        validateStatus: () => true
    });
    if (r.status !== 200) throw new Error(`masothue.com HTTP ${r.status}`);
    const $ = cheerio.load(r.data);
    return parseDetail($);
}

module.exports = {
    name: '/mst',
    index: async (req, res) => {
        const q = (req.query.q || req.query.mst || req.query.cccd || req.query.name || '').toString().trim();
        if (!q) {
            return res.status(400).json({
                status: false,
                message: "Thiếu 'q' (MST hoặc tên DN).",
                example: '/mst?q=0123456789'
            });
        }

        const cached = cache.get(q.toLowerCase());
        if (cached) return res.json({ ...cached, cached: true });

        try {
            const r = await axios.get(SEARCH_URL(q), {
                headers: { 'User-Agent': randomUA(), 'Accept-Language': 'vi-VN,vi;q=0.9' },
                timeout: 15000,
                maxRedirects: 5,
                validateStatus: () => true
            });
            if (r.status !== 200) throw new Error(`masothue.com HTTP ${r.status}`);

            const $ = cheerio.load(r.data);
            // Nếu là chi tiết 1 DN (search bằng MST), masothue.com auto-redirect vào trang detail
            const isDetail = $('.taxinfor-name h1').length > 0 || $('.table-taxinfo').length > 0;

            if (isDetail) {
                const data = parseDetail($);
                const out = { status: true, query: q, total: 1, data };
                cache.set(q.toLowerCase(), out);
                return res.json(out);
            }

            // Trang search list — lấy top 10 link và fetch song song
            const links = [];
            $('.tax-listing h3 a, .taxinfor-list a, h3 a[href^="/"]').each((_, a) => {
                const href = $(a).attr('href');
                const text = $(a).text().trim();
                if (href && text && !links.find(l => l.href === href)) {
                    links.push({ href: 'https://masothue.com' + href, name: text });
                    if (links.length >= 10) return false;
                }
            });

            if (links.length === 0) {
                return res.status(404).json({ status: false, message: 'Không tìm thấy kết quả nào.', query: q });
            }

            const details = await Promise.allSettled(links.map(l => fetchDetail(l.href)));
            let cleaned = details.filter(d => d.status === 'fulfilled' && d.value.mst).map(d => d.value);

            // Nếu user search bằng MST số → ưu tiên kết quả khớp chính xác MST
            if (/^\d{10,13}$/.test(q)) {
                const exact = cleaned.find(d => String(d.mst).replace(/[^\d]/g, '') === q);
                if (exact) cleaned = [exact];
            }

            const out = {
                status: true,
                query: q,
                total: cleaned.length,
                data: cleaned.length === 1 ? cleaned[0] : cleaned
            };
            cache.set(q.toLowerCase(), out);
            return res.json(out);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[MST] lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: 'Lỗi tra cứu MST' });
        }
    }
};
