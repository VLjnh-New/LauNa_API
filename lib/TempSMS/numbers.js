'use strict';

const { listNumbers } = require('../../utils/tempsms');
const log = require('../../utils/logger');

module.exports = {
    name: '/tempsms/numbers',
    index: async (req, res) => {
        try {
            const out = await listNumbers();
            return res.status(200).json({
                status: true,
                source: 'sms-online.co',
                ...out,
                hint: 'Đây là số công cộng — ai cũng đọc được. Đa số dịch vụ lớn (Google, Facebook) đã chặn các số này.',
            });
        } catch (e) {
            log(`[TEMPSMS] listNumbers lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy danh sách số SMS' });
        }
    },
};
