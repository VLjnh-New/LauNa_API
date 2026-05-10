'use strict';

const axios = require('axios');

const BASE = 'https://smvmail.com';
const http = axios.create({ baseURL: BASE, timeout: 15_000 });

async function findMessageById(email, id) {
    let page = 1;
    while (true) {
        const { data } = await http.get('/api/email', { params: { email, page } });
        if (!data?.status) throw new Error(data?.message || 'Lỗi từ smvmail');
        const docs = data?.data?.docs || [];
        const msg = docs.find(m => String(m._id || m.id) === id);
        if (msg) return msg;
        if (!data.data.hasNextPage) return null;
        page++;
    }
}

module.exports = {
    name: '/smvmail/read',
    params: ['email', 'id'],
    index: async (req, res) => {
        const email = (req.query.email || '').trim();
        const id    = (req.query.id || '').trim();

        if (!email || !id) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'email' hoặc 'id'",
                example: '/smvmail/read?email=abc@smvmail.com&id=MSG_ID',
            });
        }

        if (!email.toLowerCase().endsWith('@smvmail.com')) {
            return res.status(400).json({
                status: false,
                message: "Email phải có đuôi @smvmail.com",
            });
        }

        try {
            const msg = await findMessageById(email, id);
            if (!msg) {
                return res.status(404).json({ status: false, message: 'Không tìm thấy email với id đó' });
            }
            return res.status(200).json({ status: true, data: msg });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[SMVMAIL-READ] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi kết nối đến smvmail.com' });
        }
    },
};
