'use strict';

/**
 * /lienquan/heroes
 *
 * Trả về danh sách toàn bộ tướng Liên Quân (Arena of Valor).
 * Tham số:
 *   ?q=tu khoa    Lọc theo tên (chứa)
 *   ?limit=200    Giới hạn số kết quả
 */

const { getHeroList } = require('../../utils/lienquan/fandom');

module.exports = {
    name: '/lienquan/heroes',
    index: async (req, res) => {
        const q = (req.query.q || '').toString().trim().toLowerCase();
        let limit = parseInt(req.query.limit, 10);
        if (!Number.isFinite(limit) || limit <= 0) limit = 500;

        try {
            let list = await getHeroList();
            if (q) list = list.filter(n => n.toLowerCase().includes(q));
            const data = list.slice(0, limit).map(name => ({
                name,
                slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            }));
            return res.json({
                status: true,
                total: list.length,
                data
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LQ-HEROES] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy danh sách tướng Liên Quân' });
        }
    }
};
