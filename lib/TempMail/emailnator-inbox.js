'use strict';

const { listMessages } = require('../../utils/emailnator');

module.exports = {
    name: '/emailnator/inbox',
    params: ['email'],
    index: async (req, res) => {
        const email = (req.query.email || '').trim();
        if (!email) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'email'",
                example: '/emailnator/inbox?email=abc@gmail.com',
            });
        }
        try {
            const out = await listMessages(email);
            return res.status(200).json({ status: true, ...out });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[EMAILNATOR-INBOX] lỗi: ${e.message}`, 'WARN');
            return res.status(404).json({ status: false, message: e.message || 'Hộp thư không tồn tại hoặc lỗi kết nối' });
        }
    },
};
