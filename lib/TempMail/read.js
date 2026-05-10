'use strict';

const { readMessage } = require('../../utils/tempmail');

module.exports = {
    name: '/tempmail/read',
    index: async (req, res) => {
        const email = (req.query.email || '').trim();
        const id    = (req.query.id || '').trim();
        if (!email || !id) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'email' hoặc 'id'",
                example: '/tempmail/read?email=abc@xyz.com&id=MSG_ID',
            });
        }
        try {
            const data = await readMessage(email, id);
            return res.status(200).json({ status: true, data });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[TEMPMAIL-READ] lỗi: ${e.message}`, 'WARN');
            return res.status(404).json({ status: false, message: 'Không tìm thấy email hoặc lỗi kết nối' });
        }
    },
};
