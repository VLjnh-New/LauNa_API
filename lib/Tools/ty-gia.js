'use strict';

/**
 * /tools/ty-gia — Tỷ giá ngoại tệ realtime (hỗ trợ 166 đồng tiền).
 *
 * Cách dùng:
 *   /tools/ty-gia                          (tỷ giá tất cả theo USD)
 *   /tools/ty-gia?base=VND                 (tỷ giá theo VND)
 *   /tools/ty-gia?base=USD&to=VND          (USD → VND)
 *   /tools/ty-gia?base=EUR&to=VND,JPY,GBP  (EUR → nhiều đồng tiền)
 *   /tools/ty-gia?amount=1000000&from=VND&to=USD  (đổi tiền)
 *
 * Tham số:
 *   base/from : đồng tiền gốc (3 ký tự ISO 4217, mặc định USD)
 *   to        : đồng tiền đích, nhiều cái cách bởi dấu phẩy (tuỳ chọn)
 *   amount    : số tiền cần quy đổi (tuỳ chọn, mặc định 1)
 *
 * Cache: 30 phút/base.
 * Backend: open.er-api.com (free, không cần key, cập nhật hàng giờ).
 */

const axios = require('axios');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 50, ttl: 30 * 60 * 1000 });

const POPULAR_CURRENCIES = ['USD','EUR','GBP','JPY','CNY','KRW','AUD','CAD','SGD','THB','VND','HKD','TWD','MYR','IDR','PHP','INR','CHF'];

const CURRENCY_NAMES = {
    USD:'Đô la Mỹ', EUR:'Euro', GBP:'Bảng Anh', JPY:'Yên Nhật', CNY:'Nhân dân tệ',
    KRW:'Won Hàn Quốc', AUD:'Đô la Úc', CAD:'Đô la Canada', SGD:'Đô la Singapore',
    THB:'Baht Thái', VND:'Đồng Việt Nam', HKD:'Đô la Hồng Kông', TWD:'Đô la Đài Loan',
    MYR:'Ringgit Malaysia', IDR:'Rupiah Indonesia', PHP:'Peso Philippines',
    INR:'Rupee Ấn Độ', CHF:'Franc Thụy Sĩ'
};

async function getRates(base) {
    const key = base.toUpperCase();
    const cached = cache.get(key);
    if (cached) return cached;
    const r = await axios.get(`https://open.er-api.com/v6/latest/${key}`, { timeout: 10_000 });
    if (r.data?.result !== 'success') throw new Error(r.data?.['error-type'] || 'Không lấy được tỷ giá');
    const data = { base: r.data.base_code, rates: r.data.rates, time: r.data.time_last_update_utc };
    cache.set(key, data);
    return data;
}

function formatRate(rate) {
    if (rate >= 1000) return +rate.toFixed(2);
    if (rate >= 1)    return +rate.toFixed(4);
    return +rate.toFixed(6);
}

module.exports = {
    name: '/tools/ty-gia',
    index: async (req, res) => {
        const base   = ((req.query.base || req.query.from || 'USD').toUpperCase()).slice(0, 3);
        const toRaw  = req.query.to || '';
        const amount = Math.abs(parseFloat(req.query.amount) || 1);

        if (!/^[A-Z]{3}$/.test(base)) {
            return res.status(400).json({ status: false, message: "Mã tiền tệ không hợp lệ (phải là 3 ký tự ISO 4217, vd: USD, VND, EUR)" });
        }

        try {
            const data = await getRates(base);

            // Các đồng tiền cần trả
            const toList = toRaw
                ? toRaw.split(',').map(x => x.trim().toUpperCase()).filter(x => /^[A-Z]{3}$/.test(x))
                : POPULAR_CURRENCIES.filter(c => c !== base);

            const invalid = toList.filter(c => !data.rates[c]);
            if (invalid.length && toRaw) {
                return res.status(400).json({ status: false, message: `Không nhận ra mã tiền: ${invalid.join(', ')}` });
            }

            const results = {};
            for (const c of toList) {
                if (!data.rates[c]) continue;
                const rate = data.rates[c];
                results[c] = {
                    name:        CURRENCY_NAMES[c] || c,
                    rate:        formatRate(rate),
                    converted:   amount === 1 ? undefined : formatRate(amount * rate),
                };
            }

            return res.json({
                status:    true,
                base,
                baseName:  CURRENCY_NAMES[base] || base,
                amount:    amount === 1 ? undefined : amount,
                rates:     results,
                updatedAt: data.time,
                note:      'Cập nhật mỗi giờ. 166 đồng tiền hỗ trợ.',
                tip:       toRaw ? undefined : `Dùng ?base=${base}&to=VND,JPY để lọc theo đồng tiền cụ thể`,
                creator:   'Ljzi'
            });

        } catch (e) {
            const log = require('../../utils/logger');
            log(`[TY-GIA] lỗi: ${e.message}`, 'WARN');
            const code = /không nhận ra|invalid|unsupported/i.test(e.message || '') ? 400 : 502;
            return res.status(code).json({
                status: false,
                message: code === 400 ? 'Đồng tiền không hợp lệ' : 'Lỗi lấy tỷ giá',
                hint: code === 502 ? 'Thử lại sau vài giây' : undefined
            });
        }
    }
};
