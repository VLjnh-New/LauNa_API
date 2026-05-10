'use strict';

const { request } = require('undici');
const { isAdminKey } = require('./apikey');

async function verify(token, ip) {
    const cfg = global.config?.turnstile || {};
    const secretKey = cfg.secretKey;
    if (!secretKey || secretKey === 'NHAP_SECRET_KEY_CUA_BAN') {
        // Production: fail-closed để không bị bypass khi quên set secret
        if (process.env.NODE_ENV === 'production') return false;
        return true;
    }
    if (!token) return false;
    try {
        const params = new URLSearchParams({ secret: secretKey, response: token });
        if (ip) params.set('remoteip', ip);
        const { body } = await request('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString()
        });
        const data = await body.json();
        return data.success === true;
    } catch {
        return false;
    }
}

function getIp(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.socket?.remoteAddress
        || '';
}

function middleware(req, res, next) {
    const cfg = global.config?.turnstile || {};
    if (!cfg.secretKey || cfg.secretKey === 'NHAP_SECRET_KEY_CUA_BAN') {
        if (process.env.NODE_ENV === 'production') {
            return res.status(503).json({ status: false, message: 'Captcha chưa được cấu hình.' });
        }
        return next();
    }

    // Admin / premium apikey bypass captcha (dùng in-memory store, tránh require() hot-path)
    try {
        const apikey = req.query?.apikey || req.headers?.['x-api-key'];
        if (apikey && isAdminKey(apikey)) return next();
    } catch {}

    const token = req.body?.['cf-turnstile-response']
        || req.query?.['cf-turnstile-response']
        || req.headers?.['cf-turnstile-response'];
    verify(token, getIp(req)).then(ok => {
        if (!ok) return res.status(403).json({ status: false, message: 'Xác minh captcha thất bại. Vui lòng thử lại.' });
        next();
    }).catch(() => next());
}

module.exports = { verify, middleware };
