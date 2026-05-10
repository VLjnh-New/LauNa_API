'use strict';

/**
 * /tools/phat-nguoi
 *
 * Tra cứu phạt nguội theo biển số xe (nguồn: api.checkphatnguoi.vn — Cục CSGT).
 * Hỗ trợ cả ô tô và xe máy.
 *
 * Cách dùng:
 *   /tools/phat-nguoi?bienso=30A12345
 *   /tools/phat-nguoi?bienso=29B112233
 */

const axios = require('axios');
const { LRUCache } = require('lru-cache');

const URL = 'https://api.checkphatnguoi.vn/phatnguoi';
const { randomUA } = require('../../utils/http/browser-headers');

const cache = new LRUCache({ max: 500, ttl: 10 * 60 * 1000 });

function normalizePlate(s) {
    return String(s || '').toUpperCase().replace(/[\s.\-]/g, '');
}

module.exports = {
    name: '/tools/phat-nguoi',
    index: async (req, res) => {
        const raw = (req.query.bienso || req.query.plate || '').toString().trim();
        if (!raw) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'bienso'.",
                example: '/tools/phat-nguoi?bienso=30A12345'
            });
        }

        const bienso = normalizePlate(raw);
        if (!/^[0-9]{2}[A-Z]{1,2}[0-9]{4,6}$/.test(bienso)) {
            return res.status(400).json({
                status: false,
                message: "Biển số không hợp lệ. Ví dụ đúng: 30A12345, 29B112233."
            });
        }

        const cached = cache.get(bienso);
        if (cached) return res.json(cached);

        try {
            const r = await axios.post(URL, { bienso }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Origin': 'https://checkphatnguoi.vn',
                    'Referer': 'https://checkphatnguoi.vn/',
                    'User-Agent': randomUA()
                },
                timeout: 20000
            });

            const body = r.data || {};

            if (body.status !== 1 || !Array.isArray(body.data) || body.data.length === 0) {
                const out = {
                    status: true,
                    data: {
                        bienso,
                        total: 0,
                        violations: [],
                        message: body.message || 'Không có vi phạm phạt nguội nào được ghi nhận.'
                    }
                };
                cache.set(bienso, out);
                return res.json(out);
            }

            const info = body.data_info || {};
            const violations = body.data.map(v => ({
                bienKiemSoat: v['Biển kiểm soát'] || null,
                mauBien: v['Màu biển'] || null,
                loaiPhuongTien: v['Loại phương tiện'] || null,
                thoiGian: v['Thời gian vi phạm'] || null,
                diaDiem: v['Địa điểm vi phạm'] || null,
                hanhVi: v['Hành vi vi phạm'] || null,
                trangThai: v['Trạng thái'] || null,
                donViPhatHien: v['Đơn vị phát hiện vi phạm'] || null,
                noiGiaiQuyet: Array.isArray(v['Nơi giải quyết vụ việc']) ? v['Nơi giải quyết vụ việc'] : []
            }));

            const out = {
                status: true,
                data: {
                    bienso,
                    capNhatLuc: info.latest || null,
                    total: Number(info.total) || violations.length,
                    chuaXuPhat: Number(info.chuaxuphat) || 0,
                    daXuPhat: Number(info.daxuphat) || 0,
                    nguon: 'Cục Cảnh sát giao thông',
                    violations
                }
            };
            cache.set(bienso, out);
            return res.json(out);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[PHAT-NGUOI] lỗi: ${e.message}`, 'WARN');
            const status = e.response?.status || 500;
            return res.status(status >= 500 ? 502 : status).json({
                status: false,
                message: 'Lỗi tra cứu phạt nguội'
            });
        }
    }
};
