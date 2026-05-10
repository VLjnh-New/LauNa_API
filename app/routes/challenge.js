'use strict';

const express = require('express');
const router = express.Router();
const { verify } = require('../../utils/security/turnstile');
const { markVerified } = require('../../utils/security/ddos');
const _getIP = require('ipware')().get_ip;

router.post('/challenge', async (req, res) => {
    const ipInfo = _getIP(req);
    const ip = ipInfo.clientIp || req.ip || '0.0.0.0';
    const token = req.body?.token || req.body?.['cf-turnstile-response'];

    if (!token) {
        return res.status(400).json({ status: false, message: 'Thiếu token captcha.' });
    }

    const ok = await verify(token, ip).catch(() => false);
    if (!ok) {
        return res.status(403).json({ status: false, message: 'Xác minh thất bại. Vui lòng thử lại.' });
    }

    markVerified(ip);
    return res.json({ status: true, message: 'Xác minh thành công! Bạn có thể tiếp tục.' });
});

module.exports = router;
