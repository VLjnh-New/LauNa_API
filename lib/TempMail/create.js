'use strict';

const { createInbox, TTL_MS } = require('../../utils/tempmail');

module.exports = {
    name: '/tempmail/create',
    index: async (req, res) => {
        try {
            const inbox = await createInbox();
            return res.status(200).json({
                status: true,
                message: `Đã tạo hộp thư tạm (TTL ${Math.round(TTL_MS / 60000)} phút)`,
                data: {
                    email: inbox.email,
                    createdAt: inbox.createdAt,
                    expiresAt: inbox.expiresAt,
                    ttlSeconds: Math.round(TTL_MS / 1000),
                },
                hint: {
                    inbox:  `/tempmail/inbox?email=${encodeURIComponent(inbox.email)}`,
                    read:   `/tempmail/read?email=${encodeURIComponent(inbox.email)}&id=<MSG_ID>`,
                    delete: `/tempmail/delete?email=${encodeURIComponent(inbox.email)}`,
                },
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[TEMPMAIL-CREATE] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tạo hộp thư' });
        }
    },
};
