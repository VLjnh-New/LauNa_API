'use strict';

const axios = require('axios');

const BASE = 'https://smvmail.com';
const http = axios.create({ baseURL: BASE, timeout: 15_000 });

module.exports = {
    name: '/smvmail/inbox',
    params: ['email', 'page'],
    index: async (req, res) => {
        const email = (req.query.email || '').trim();
        const page  = parseInt(req.query.page) || 1;

        if (!email) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'email'",
                example: '/smvmail/inbox?email=abc@smvmail.com',
            });
        }

        if (!email.toLowerCase().endsWith('@smvmail.com')) {
            return res.status(400).json({
                status: false,
                message: "Email phải có đuôi @smvmail.com",
                example: '/smvmail/inbox?email=abc@smvmail.com',
            });
        }

        try {
            const { data } = await http.get('/api/email', {
                params: { email, page },
            });

            if (!data?.status) {
                return res.status(400).json({ status: false, message: data?.message || 'Lỗi từ smvmail' });
            }

            return res.status(200).json({
                status: true,
                email,
                page,
                data: data.data,
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[SMVMAIL-INBOX] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi kết nối đến smvmail.com' });
        }
    },
};
