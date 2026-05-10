'use strict';

/**
 * Endpoint nội bộ phát free API key.
 * KHÔNG được auto-load qua app/server.js (xem INTERNAL_FILES).
 * Được mount thủ công trong app/main.js tại một path ẩn.
 *
 * Đặc điểm:
 *  - Không giới hạn theo ngày / IP
 *  - Vẫn xác minh Turnstile để chống bot
 *  - Mỗi key có giới hạn lượt request (config.freeKey.requests, mặc định 200)
 */

const { createKey } = require('../../utils/security/apikey');
const { verify }    = require('../../utils/security/turnstile');
const _getIP = require('ipware')().get_ip;

function getIp(req) {
    const cf = req.headers['cf-connecting-ip'];
    if (cf) return String(cf).trim();
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        const first = String(xff).split(',')[0].trim();
        if (first) return first;
    }
    const real = req.headers['x-real-ip'];
    if (real) return String(real).trim();
    if (req.ip) return req.ip;
    try { return _getIP(req).clientIp || ''; } catch { return ''; }
}

async function handler(req, res) {
    const cfg          = global.config?.freeKey || {};
    const hourlyLimit  = Number(cfg.requestsPerHour) || Number(cfg.hourlyLimit) || 60;
    const ip           = getIp(req);

    // Xác minh Turnstile captcha (nếu được cấu hình)
    const tsToken = req.query['cf-turnstile-response'] || req.headers['cf-turnstile-response'];
    const tsCfg   = global.config?.turnstile || {};
    const needTs  = tsCfg.secretKey && tsCfg.secretKey !== 'NHAP_SECRET_KEY_CUA_BAN';

    if (needTs) {
        if (!tsToken) {
            return res.status(400).json({
                status: false,
                message: 'Cần xác minh captcha.'
            });
        }
        const ok = await verify(tsToken, ip).catch(() => false);
        if (!ok) {
            return res.status(403).json({
                status: false,
                message: 'Xác minh captcha thất bại. Vui lòng thử lại.'
            });
        }
    }

    const result = createKey(hourlyLimit, ip);
    if (!result.status) {
        return res.status(500).json({ status: false, message: result.message });
    }

    const limit = result.hourlyLimit || hourlyLimit;
    return res.json({
        status: true,
        message: result.reused
            ? 'IP của bạn đã có sẵn API key — trả lại key cũ.'
            : 'Tạo API key thành công!',
        data: {
            apikey:      result.apikey,
            type:        'free',
            ip:          result.ip,
            reused:      !!result.reused,
            hourlyLimit: limit,
            note:        `Key gắn với IP ${result.ip || 'của bạn'}, giới hạn ${limit} request mỗi giờ (tự reset).`,
            usage:       `Thêm ?apikey=${result.apikey} vào mọi request API.`
        }
    });
}

module.exports = { handler };
