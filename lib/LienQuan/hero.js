'use strict';

/**
 * /lienquan/hero
 *
 * Tra cứu thông tin chi tiết một tướng Liên Quân: class, role, giá vàng/quân huy,
 * chỉ số (HP, giáp, sát thương, tốc chạy...), skill và ảnh splash.
 *
 * Cách dùng:
 *   /lienquan/hero?name=Airi
 *   /lienquan/hero?name=Tulen
 *   /lienquan/hero?name=violet
 */

const { getHero } = require('../../utils/lienquan/fandom');

module.exports = {
    name: '/lienquan/hero',
    index: async (req, res) => {
        const name = (req.query.name || req.query.hero || '').toString().trim();
        if (!name) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'name'.",
                example: '/lienquan/hero?name=Airi'
            });
        }
        try {
            const hero = await getHero(name);
            if (!hero) {
                return res.status(404).json({ status: false, message: `Không tìm thấy tướng: ${name}` });
            }
            return res.json({ status: true, data: hero });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LQ-HERO] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy thông tin tướng Liên Quân' });
        }
    }
};
