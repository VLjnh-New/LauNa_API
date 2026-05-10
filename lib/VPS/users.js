'use strict';

/**
 *  GET  /vps/users                       → Danh sách VPS đang hoạt động (mask token)
 *  GET  /vps/users?token=<full_token>    → Lấy link noVNC theo token (dùng để client poll)
 *  POST /vps/users  body { github_token, vnc_link }
 *                                        → Workflow Windows gọi về để báo link tunnel
 *  POST /vps/users  body { github_token } (không có vnc_link)
 *                                        → Hỏi link đã được lưu chưa
 */

const store = require('./_store');

module.exports = {
    name: '/vps/users',
    methods: {
        get: async (req, res) => {
            const token = (req.query.token || '').trim();
            if (token) {
                const rec = store.get(token);
                if (!rec) return res.status(404).json({ status: false, message: 'Chưa có link, thử lại sau' });
                return res.json({ status: true, remote_link: rec.link, updatedAt: rec.updatedAt });
            }
            const users = store.list();
            return res.json({ status: true, total: users.length, users });
        },

        post: async (req, res) => {
            const githubToken = String(req.body?.github_token || '').trim();
            const vncLink = String(req.body?.vnc_link || '').trim();

            if (!githubToken) {
                return res.status(400).json({ status: false, message: "Thiếu 'github_token'" });
            }

            if (vncLink) {
                store.save(githubToken, vncLink);
                return res.json({ status: true, message: 'Đã lưu link VPS' });
            }

            const rec = store.get(githubToken);
            if (rec) return res.json({ status: true, remote_link: rec.link, updatedAt: rec.updatedAt });
            return res.status(404).json({ status: false, message: 'Chưa có link' });
        }
    }
};
