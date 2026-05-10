'use strict';

/**
 * /lienquan/random
 *
 * Random tướng Liên Quân. Có thể lọc theo lane (vị trí) hoặc class.
 *
 * Cách dùng:
 *   /lienquan/random
 *   /lienquan/random?lane=mid
 *   /lienquan/random?lane=jungle&count=5
 *   /lienquan/random?class=tank
 *
 * Lane hỗ trợ: top (đường trên / ad-rừng) | mid (pháp sư) | jungle (rừng) |
 *              ad / adc (xạ thủ) | support (hỗ trợ) | roam (đường dưới đôi)
 */

const { getHeroList, getHero } = require('../../utils/lienquan/fandom');

// Bảng phân lane theo lớp tướng (xấp xỉ — vẫn random trong nhóm phù hợp)
const LANE_CLASS = {
    top: ['Warrior', 'Tank'],
    'duong-tren': ['Warrior', 'Tank'],
    mid: ['Mage'],
    'duong-giua': ['Mage'],
    jungle: ['Assassin', 'Warrior'],
    rung: ['Assassin', 'Warrior'],
    ad: ['Marksman'],
    adc: ['Marksman'],
    'xa-thu': ['Marksman'],
    support: ['Support', 'Tank'],
    'ho-tro': ['Support', 'Tank'],
    roam: ['Tank', 'Support']
};

function pick(arr, n) {
    const a = [...arr];
    const out = [];
    while (a.length && out.length < n) {
        const i = Math.floor(Math.random() * a.length);
        out.push(a.splice(i, 1)[0]);
    }
    return out;
}

module.exports = {
    name: '/lienquan/random',
    index: async (req, res) => {
        const lane = (req.query.lane || req.query.position || '').toString().trim().toLowerCase();
        const cls = (req.query.class || '').toString().trim().toLowerCase();
        let count = parseInt(req.query.count, 10);
        if (!Number.isFinite(count) || count <= 0) count = 1;
        if (count > 10) count = 10;

        try {
            const list = await getHeroList();
            let pool = list;

            if (lane || cls) {
                // Cần lọc theo class -> phải fetch chi tiết. Chọn ngẫu nhiên dần
                // và xác minh, để tránh fetch toàn bộ ~120 tướng.
                const wanted = cls
                    ? [cls.charAt(0).toUpperCase() + cls.slice(1).toLowerCase()]
                    : (LANE_CLASS[lane] || []);
                if (!wanted.length) {
                    return res.status(400).json({
                        status: false,
                        message: `Lane/class không hợp lệ: ${lane || cls}`,
                        validLanes: Object.keys(LANE_CLASS),
                        validClasses: ['Warrior', 'Tank', 'Assassin', 'Mage', 'Marksman', 'Support']
                    });
                }
                const chosen = [];
                const tried = new Set();
                let attempts = 0;
                while (chosen.length < count && tried.size < pool.length && attempts < 40) {
                    attempts++;
                    const candidates = pool.filter(n => !tried.has(n));
                    if (!candidates.length) break;
                    const pickName = candidates[Math.floor(Math.random() * candidates.length)];
                    tried.add(pickName);
                    try {
                        const hero = await getHero(pickName);
                        if (!hero) continue;
                        const matches = wanted.some(w => hero.class.some(c => c.toLowerCase() === w.toLowerCase()));
                        if (matches) chosen.push(hero);
                    } catch { /* skip */ }
                }
                if (!chosen.length) {
                    return res.status(404).json({ status: false, message: 'Không random được tướng phù hợp.' });
                }
                return res.json({ status: true, lane: lane || null, class: cls || null, count: chosen.length, data: chosen });
            }

            // Không filter -> random nhanh từ list, không fetch chi tiết
            const names = pick(pool, count);
            return res.json({
                status: true,
                count: names.length,
                data: names.map(name => ({
                    name,
                    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
                    detail: `/lienquan/hero?name=${encodeURIComponent(name)}`
                }))
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LQ-RANDOM] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi random tướng Liên Quân' });
        }
    }
};
