'use strict';

/**
 * Định nghĩa các gói API key bán qua bot.
 * Giá đọc từ env vars (ưu tiên) hoặc giá trị mặc định:
 *   PLAN_PREM30_PRICE   (mặc định 30000)
 *   PLAN_PREM90_PRICE   (mặc định 80000)
 *   PLAN_PREM365_PRICE  (mặc định 250000)
 *   PLAN_PREM30_DAYS    (mặc định 30)
 *   PLAN_PREM90_DAYS    (mặc định 90)
 *   PLAN_PREM365_DAYS   (mặc định 365)
 */

function envNum(key, fallback) {
    const v = process.env[key];
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

const PLANS = {
    prem30: {
        id: 'prem30',
        name: 'Premium 30 ngày',
        get price() { return envNum('PLAN_PREM30_PRICE', 30000); },
        type: 'premium',
        get days() { return envNum('PLAN_PREM30_DAYS', 30); },
        get desc() { return `Không giới hạn request · ${this.days} ngày`; }
    },
    prem90: {
        id: 'prem90',
        name: 'Premium 90 ngày',
        get price() { return envNum('PLAN_PREM90_PRICE', 80000); },
        type: 'premium',
        get days() { return envNum('PLAN_PREM90_DAYS', 90); },
        get desc() { return `Không giới hạn request · ${this.days} ngày`; }
    },
    prem365: {
        id: 'prem365',
        name: 'Premium 365 ngày',
        get price() { return envNum('PLAN_PREM365_PRICE', 250000); },
        type: 'premium',
        get days() { return envNum('PLAN_PREM365_DAYS', 365); },
        get desc() { return `Không giới hạn request · ${this.days} ngày`; }
    }
};

function getPlan(id) {
    return PLANS[id] || null;
}

function listPlans() {
    return Object.values(PLANS);
}

function fmtVND(n) {
    return Number(n).toLocaleString('vi-VN') + 'đ';
}

module.exports = { PLANS, getPlan, listPlans, fmtVND };
