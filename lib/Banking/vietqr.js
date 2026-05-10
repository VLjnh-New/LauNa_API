'use strict';

/**
 * /vietqr — Tạo ảnh QR chuyển khoản nhanh chuẩn NAPAS / VietQR.
 *
 * Cách dùng:
 *   /vietqr?bank=mb&stk=0123456789&amount=50000&note=ung+ho+launa&name=NGUYEN+VAN+A
 *   /vietqr?bank=970422&stk=0123456789  (mã NAPAS 6 số cũng OK)
 *   /vietqr?banks=1   (liệt kê toàn bộ ngân hàng hỗ trợ)
 *
 * Nguồn: img.vietqr.io (free, không cần key, public CDN của VietQR.io).
 */

const axios = require('axios');
const { LRUCache } = require('lru-cache');

const BANKS_URL = 'https://api.vietqr.io/v2/banks';
const QR_BASE = 'https://img.vietqr.io/image';
const TEMPLATES = ['compact', 'compact2', 'qr_only', 'print'];

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
        b.code?.toLowerCase() === k ||
        b.name?.toLowerCase().includes(k)
    ) || null;
}

module.exports = {
    name: '/vietqr',
    index: async (req, res) => {
        try {
            const banks = await loadBanks();

            if (req.query.banks || req.query.list) {
                return res.json({
                    status: true,
                    total: banks.length,
                    banks: banks.map(b => ({ bin: b.bin, code: b.code, shortName: b.shortName, name: b.name, logo: b.logo, supportTransfer: b.transferSupported === 1 }))
                });
            }

            const bankKey = (req.query.bank || req.query.bin || '').toString().trim();
            const stk = (req.query.stk || req.query.acc || req.query.account || '').toString().trim();
            const amount = (req.query.amount || req.query.money || '').toString().trim();
            const note = (req.query.note || req.query.addInfo || '').toString().trim();
            const name = (req.query.name || req.query.accountName || '').toString().trim();
            const tplRaw = (req.query.template || 'compact2').toString().trim().toLowerCase();
            const template = TEMPLATES.includes(tplRaw) ? tplRaw : 'compact2';

            if (!bankKey || !stk) {
                return res.status(400).json({
                    status: false,
                    message: "Thiếu 'bank' và/hoặc 'stk'.",
                    example: '/vietqr?bank=mb&stk=0123456789&amount=50000&note=ung+ho',
                    hint: 'Gọi /vietqr?banks=1 để xem danh sách bank hỗ trợ.'
                });
            }

            if (!/^\d{4,20}$/.test(stk)) {
                return res.status(400).json({ status: false, message: 'STK chỉ chứa 4-20 chữ số.' });
            }
            if (amount && !/^\d{1,12}$/.test(amount)) {
                return res.status(400).json({ status: false, message: 'Amount phải là số nguyên VND.' });
            }

            const bank = findBank(banks, bankKey);
            if (!bank) {
                return res.status(404).json({ status: false, message: `Không tìm thấy ngân hàng "${bankKey}". Gọi /vietqr?banks=1 để xem danh sách.` });
            }

            const qs = new URLSearchParams();
            if (amount) qs.set('amount', amount);
            if (note) qs.set('addInfo', note);
            if (name) qs.set('accountName', name);

            const qrUrl = `${QR_BASE}/${bank.bin}-${stk}-${template}.png${qs.toString() ? '?' + qs.toString() : ''}`;

            return res.json({
                status: true,
                qrUrl,
                bank: { bin: bank.bin, code: bank.code, shortName: bank.shortName, name: bank.name, logo: bank.logo },
                account: { stk, name: name || null },
                amount: amount ? Number(amount) : null,
                note: note || null,
                template,
                tip: 'Bấm vào qrUrl để xem ảnh QR. Có thể nhúng thẳng <img src="qrUrl">.'
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[VIETQR] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tạo VietQR' });
        }
    }
};
