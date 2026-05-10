'use strict';

/**
 * /lich-am — Đổi dương lịch ↔ âm lịch + ngày tốt xấu + giờ hoàng đạo + can chi.
 *
 * Cách dùng:
 *   /lich-am                    (hôm nay)
 *   /lich-am?date=28/04/2026
 *   /lich-am?date=2026-04-28
 */

const lich = require('../../utils/lich-am');

function parseDate(s) {
    if (!s) {
        const d = new Date(Date.now() + 7 * 60 * 60 * 1000); // VN time
        return [d.getUTCDate(), d.getUTCMonth() + 1, d.getUTCFullYear()];
    }
    const m1 = String(s).match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m1) return [+m1[1], +m1[2], +m1[3]];
    const m2 = String(s).match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m2) return [+m2[3], +m2[2], +m2[1]];
    return null;
}

module.exports = {
    name: '/lich-am',
    index: async (req, res) => {
        const dateStr = (req.query.date || req.query.d || '').toString().trim();
        const parsed = parseDate(dateStr);
        if (!parsed) {
            return res.status(400).json({
                status: false,
                message: "Định dạng ngày không hợp lệ. Dùng dd/mm/yyyy hoặc yyyy-mm-dd.",
                example: '/lich-am?date=28/04/2026'
            });
        }
        const [d, m, y] = parsed;
        if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) {
            return res.status(400).json({ status: false, message: 'Ngày ngoài khoảng cho phép (1900-2100).' });
        }

        try {
            const info = lich.fullInfo(d, m, y);
            return res.json({ status: true, ...info });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LICHVN] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tính lịch âm' });
        }
    }
};
