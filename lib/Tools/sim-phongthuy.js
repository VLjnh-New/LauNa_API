'use strict';

/**
 * /tools/sim-phongthuy
 *
 * Tra cứu phong thuỷ 4 số cuối của số điện thoại (nguồn: simphongthuyuytin.com).
 *
 * Cách dùng:
 *   /tools/sim-phongthuy?sim=8888
 *   /tools/sim-phongthuy?sim=1234
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { LRUCache } = require('lru-cache');

const URL = 'https://simphongthuyuytin.com/phong-thuy-4-so-duoi';
const { randomUA } = require('../../utils/http/browser-headers');

const cache = new LRUCache({ max: 500, ttl: 24 * 60 * 60 * 1000 });

module.exports = {
    name: '/tools/sim-phongthuy',
    index: async (req, res) => {
        const sim = (req.query.sim || req.query.so || '').toString().trim();
        if (!sim) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'sim'.",
                example: '/tools/sim-phongthuy?sim=8888'
            });
        }
        if (!/^\d{2,4}$/.test(sim)) {
            return res.status(400).json({
                status: false,
                message: "Tham số 'sim' phải là 2-4 chữ số."
            });
        }

        const cached = cache.get(sim);
        if (cached) return res.json(cached);

        try {
            const r = await axios.get(URL, {
                headers: {
                    'User-Agent': randomUA(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Referer': 'https://simphongthuyuytin.com/'
                },
                params: { sodienthoai: sim },
                timeout: 15000
            });

            const $ = cheerio.load(r.data);
            const fourLastDigits = $('.ket-qua h2').first().text().replace('4 số cuối:', '').trim();
            const numberLogic = $('.ket-qua h2').eq(1).text().replace('Số lý:', '').trim();
            const comment = $('.ket-qua h3').first().text().trim();
            const conclusion = $('.ket-qua h3 span').text().trim();

            if (!fourLastDigits) {
                return res.status(404).json({
                    status: false,
                    message: 'Không tìm thấy thông tin phong thuỷ cho số này.'
                });
            }

            const out = {
                status: true,
                data: {
                    sim: fourLastDigits,
                    soLy: numberLogic,
                    yNghia: comment,
                    ketLuan: conclusion
                }
            };
            cache.set(sim, out);
            return res.json(out);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[SIM-PHONGTHUY] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi phân tích SIM phong thủy' });
        }
    }
};
