'use strict';

const { getInbox } = require('../../utils/tempsms');
const log = require('../../utils/logger');

module.exports = {
    name: '/tempsms/inbox',
    index: async (req, res) => {
        const number = (req.query.number || '').trim();
        if (!number) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'number'",
                example: '/tempsms/inbox?number=12018577757',
                hint: "Lấy danh sách số ở /tempsms/numbers",
            });
        }
        try {
            const out = await getInbox(number);
            return res.status(200).json({ status: true, source: 'sms-online.co', ...out });
        } catch (e) {
            log(`[TEMPSMS] getInbox lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi lấy tin nhắn SMS' });
        }
    },
};
