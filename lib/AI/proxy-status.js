'use strict';

const { getCooldownStatus } = require('../../utils/http/hf-space');
const { neutralTransport } = require('../../utils/security/url-cloak');
const crypto = require('crypto');

function tagBase(base) {
    return 'svc-' + crypto.createHash('sha1').update(String(base || '')).digest('hex').slice(0, 8);
}

module.exports = {
    name: "/ai/proxy",
    index: (req, res) => {
        const pool = global.proxyPool;
        if (!pool) {
            return res.status(200).json({
                status:  false,
                message: "Proxy pool chưa được khởi động",
            });
        }
        const stats = pool.getStats();
        const safeCooldowns = (getCooldownStatus() || []).map(c => ({
            tier:        neutralTransport(c.transport),
            service:     tagBase(c.base),
            secondsLeft: c.secondsLeft,
        }));
        return res.status(200).json({
            status:      true,
            total:       stats.total,
            isRefreshing: stats.isRefreshing,
            lastRefresh: stats.lastRefresh,
            cooldowns:   safeCooldowns,
            note:        "cooldowns liệt kê (tier, service) đang bị 429, sẽ tự reset khi hết secondsLeft",
        });
    },
};
