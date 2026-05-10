'use strict';

const { createInbox, TTL_MS } = require('../../utils/emailnator');

const VALID_TYPES = new Set(['domain', 'plusGmail', 'dotGmail', 'googleMail']);

module.exports = {
    name: '/emailnator/create',
    params: ['type'],
    index: async (req, res) => {
        const typeParam = (req.query.type || 'domain').trim();
        const types = typeParam.split(',').map(t => t.trim()).filter(t => VALID_TYPES.has(t));
        if (types.length === 0) {
            return res.status(400).json({
                status: false,
                message: `Tham số 'type' không hợp lệ. Giá trị cho phép: domain, plusGmail, dotGmail, googleMail`,
                example: '/emailnator/create?type=domain',
            });
        }
        try {
            const inbox = await createInbox(types);
            return res.status(200).json({
                status: true,
                message: `Đã tạo hộp thư tạm Emailnator (TTL ${Math.round(TTL_MS / 60_000)} phút)`,
                data: {
                    email: inbox.email,
                    createdAt: inbox.createdAt,
                    expiresAt: inbox.expiresAt,
                    ttlSeconds: Math.round(TTL_MS / 1000),
                },
                hint: {
                    inbox: `/emailnator/inbox?email=${encodeURIComponent(inbox.email)}`,
                    read:  `/emailnator/read?email=${encodeURIComponent(inbox.email)}&id=<MSG_ID>`,
                },
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[EMAILNATOR-CREATE] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tạo hộp thư Emailnator: ' + e.message });
        }
    },
};
