'use strict';

const { listMessages } = require('../../utils/tempmail');

module.exports = {
    name: '/tempmail/inbox',
    index: async (req, res) => {
        const email = (req.query.email || '').trim();
        if (!email) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'email'",
                example: '/tempmail/inbox?email=abc@xyz.com',
            });
        }
        try {
            const out = await listMessages(email);
            return res.status(200).json({ status: true, ...out });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[TEMPMAIL-INBOX] lỗi: ${e.message}`, 'WARN');
            return res.status(404).json({ status: false, message: 'Hộp thư không tồn tại hoặc lỗi kết nối' });
        }
    },
};
