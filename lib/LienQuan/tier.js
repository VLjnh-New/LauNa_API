'use strict';

/**
 * /lienquan/tier
 *
 * Bảng xếp hạng tướng theo meta hiện tại (curated). Có thể lọc theo lane.
 *
 * Cách dùng:
 *   /lienquan/tier
 *   /lienquan/tier?lane=mid
 *
 * Lưu ý: Đây là tier list được biên tập tay dựa trên meta phổ biến — dữ liệu
 * "win-rate real-time" của Garena không công khai nên không thể lấy tự động.
 * Cập nhật định kỳ trong file này.
 */

const TIER_LIST = {
    updatedAt: '2026-04-01',
    season: 'Mùa hiện hành',
    lanes: {
        top: {
            S: ['Florentino', 'Yena', 'Allain', 'Quillen'],
            A: ['Arthur', 'Wukong', 'Lu Bu', 'Omen'],
            B: ['Astrid', 'Yan', 'Riktor']
        },
        jungle: {
            S: ['Nakroth', 'Murad', 'Riktor', 'Zuka'],
            A: ['Butterfly', 'Wukong', 'Keera', 'Ryoma'],
            B: ['Quillen', 'Lu Bu']
        },
        mid: {
            S: ['Tulen', 'Lauriel', 'Liliana', 'Dirak'],
            A: ['Veera', 'Krixi', 'Ilumia', 'Diaochan'],
            B: ['Natalya', 'Azzenka', 'Tel\'Annas']
        },
        ad: {
            S: ['Capheny', 'Tel\'Annas', 'Violet', 'Slimz'],
            A: ['Yorn', 'Lindis', 'Valhein', 'Wisp'],
            B: ['Hayate', 'Moren']
        },
        support: {
            S: ['Krizzix', 'Alice', 'Annette', 'Mina'],
            A: ['Toro', 'Ormarr', 'Thane', 'Grakk'],
            B: ['Chaugnar', 'Lumburr']
        }
    }
};

const LANE_ALIAS = {
    top: 'top', 'duong-tren': 'top', 'duongtren': 'top',
    mid: 'mid', 'duong-giua': 'mid', 'duonggiua': 'mid',
    jungle: 'jungle', rung: 'jungle',
    ad: 'ad', adc: 'ad', 'xa-thu': 'ad', 'xathu': 'ad',
    support: 'support', 'ho-tro': 'support', 'hotro': 'support', roam: 'support'
};

module.exports = {
    name: '/lienquan/tier',
    index: async (req, res) => {
        const laneRaw = (req.query.lane || '').toString().trim().toLowerCase();
        try {
            if (laneRaw) {
                const key = LANE_ALIAS[laneRaw];
                if (!key) {
                    return res.status(400).json({
                        status: false,
                        message: `Lane không hợp lệ: ${laneRaw}`,
                        validLanes: Object.keys(LANE_ALIAS)
                    });
                }
                return res.json({
                    status: true,
                    updatedAt: TIER_LIST.updatedAt,
                    season: TIER_LIST.season,
                    lane: key,
                    tiers: TIER_LIST.lanes[key]
                });
            }
            return res.json({
                status: true,
                updatedAt: TIER_LIST.updatedAt,
                season: TIER_LIST.season,
                data: TIER_LIST.lanes,
                note: 'Lọc theo lane: /lienquan/tier?lane=mid|top|jungle|ad|support'
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LQ-TIER] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy bảng xếp hạng Liên Quân' });
        }
    }
};
