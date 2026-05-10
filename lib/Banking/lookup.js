'use strict';

/**
 * /bank-lookup — Tra cứu tên chủ STK ngân hàng VN (anti-scam).
 *
 * Cách dùng:
 *   /bank-lookup?bank=mb&stk=0123456789
 *   /bank-lookup?bank=970422&stk=0123456789
 *
 * Phương pháp: dùng VietQR Quick Link API (api.vietqr.io/v2/lookup) —
 * cần CLIENT_ID + API_KEY cấp free tại my.vietqr.io.
 *
 * Set env:
 *   VIETQR_CLIENT_ID
 *   VIETQR_API_KEY
 *
 * Nếu chưa có key, endpoint trả lỗi 503 + hướng dẫn lấy free.
 */

const axios = require('axios');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 2000, ttl: 60 * 60 * 1000 });
const VIETQR_LOOKUP = 'https://api.vietqr.io/v2/lookup';
const BANKS_URL = 'https://api.vietqr.io/v2/banks';

const banksCache = new LRUCache({ max: 1, ttl: 6 * 60 * 60 * 1000 });
async function loadBanks() {
    const cached = banksCache.get('list');
    if (cached) return cached;
    const r = await axios.get(BANKS_URL, { timeout: 12000 });
    const data = r.data?.data || [];
    banksCache.set('list', data);
    return data;
}
function findBank(banks, key) {
    const k = String(key || '').trim().toLowerCase();
    if (!k) return null;
    return banks.find(b =>
        String(b.bin) === k ||
        b.shortName?.toLowerCase() === k ||
        b.code?.toLowerCase() === k
    ) || null;
}

module.exports = {
    name: '/bank-lookup',
    index: async (req, res) => {
        const bankKey = (req.query.bank || req.query.bin || '').toString().trim();
        const stk = (req.query.stk || req.query.acc || '').toString().trim();

        if (!bankKey || !stk) {
            return res.status(400).json({
                status: false,
                message: "Thiếu 'bank' và 'stk'.",
                example: '/bank-lookup?bank=mb&stk=0123456789'
            });
        }
        if (!/^\d{4,20}$/.test(stk)) {
            return res.status(400).json({ status: false, message: 'STK chỉ chứa 4-20 chữ số.' });
        }

        const clientId = process.env.VIETQR_CLIENT_ID;
        const apiKey = process.env.VIETQR_API_KEY;
        if (!clientId || !apiKey) {
            return res.status(503).json({
                status: false,
                message: 'Server chưa cấu hình VIETQR_CLIENT_ID + VIETQR_API_KEY.',
                hint: 'Đăng ký free tại https://my.vietqr.io → Tích hợp → Lấy CLIENT_ID + API_KEY → Set env và restart.'
            });
        }

        try {
            const banks = await loadBanks();
            const bank = findBank(banks, bankKey);
            if (!bank) {
                return res.status(404).json({ status: false, message: `Không tìm thấy ngân hàng "${bankKey}".` });
            }

            const cacheKey = `${bank.bin}:${stk}`;
            const cached = cache.get(cacheKey);
            if (cached) return res.json({ ...cached, cached: true });

            const r = await axios.post(VIETQR_LOOKUP, {
                bin: bank.bin,
                accountNumber: stk
            }, {
                headers: {
                    'x-client-id': clientId,
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 15000,
                validateStatus: () => true
            });

            if (r.status !== 200 || !r.data?.data) {
                return res.status(r.status >= 400 ? r.status : 502).json({
                    status: false,
                    message: r.data?.desc || r.data?.message || `VietQR trả HTTP ${r.status}`,
                    raw: r.data
                });
            }

            const out = {
                status: true,
                bank: { bin: bank.bin, code: bank.code, shortName: bank.shortName, name: bank.name, logo: bank.logo },
                accountNumber: r.data.data.accountNumber || stk,
                accountName: r.data.data.accountName,
                source: 'vietqr.io'
            };
            cache.set(cacheKey, out);
            return res.json(out);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[BANK-LOOKUP] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tra cứu ngân hàng' });
        }
    }
};
