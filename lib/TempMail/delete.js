'use strict';

const { destroyInbox } = require('../../utils/tempmail');
const log = require('../../utils/logger');

module.exports = {
    name: '/tempmail/delete',
    index: async (req, res) => {
        const email = (req.query.email || '').trim();
        if (!email) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'email'",
                example: '/tempmail/delete?email=abc@xyz.com',
            });
        }
        try {
            const ok = await destroyInbox(email);
            if (!ok) return res.status(404).json({ status: false, message: 'Hộp thư không tồn tại hoặc đã hết hạn' });
            return res.status(200).json({ status: true, message: 'Đã xoá hộp thư', email });
        } catch (e) {
            log(`[TEMPMAIL] destroyInbox lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi xoá hộp thư' });
        }
    },
};
