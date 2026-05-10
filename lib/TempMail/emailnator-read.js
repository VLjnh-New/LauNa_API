'use strict';

const { readMessage } = require('../../utils/emailnator');

module.exports = {
    name: '/emailnator/read',
    params: ['email', 'id'],
    index: async (req, res) => {
        const email = (req.query.email || '').trim();
        const id    = (req.query.id || '').trim();
        if (!email || !id) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'email' hoặc 'id'",
                example: '/emailnator/read?email=abc@gmail.com&id=MSG_ID',
            });
        }
        try {
            const data = await readMessage(email, id);
            return res.status(200).json({ status: true, data });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[EMAILNATOR-READ] lỗi: ${e.message}`, 'WARN');
            return res.status(404).json({ status: false, message: e.message || 'Không tìm thấy tin nhắn hoặc lỗi kết nối' });
        }
    },
};
