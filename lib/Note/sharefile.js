'use strict';

const { randomUUID } = require('crypto');
const { query } = require('../../utils/data/db');
const log = require('../../utils/logger');

module.exports = {
    name: '/api/Note/sharefile',
    methods: {
        get: async (req, res) => {
            const { id } = req.query;
            try {
                if (id) {
                    const r = await query(
                        'SELECT id, nickname, link, description, created_at AS "createdAt" FROM sharefiles WHERE id=$1',
                        [String(id)]
                    );
                    if (!r.rows[0]) return res.status(404).json({ status: false, message: 'Không tìm thấy file' });
                    return res.json({ status: true, data: r.rows[0] });
                }
                const r = await query(
                    'SELECT id, nickname, link, description, created_at AS "createdAt" FROM sharefiles ORDER BY created_at DESC LIMIT 500'
                );
                return res.json({ status: true, total: r.rowCount, data: r.rows });
            } catch (e) {
                log(`[SHAREFILE] GET lỗi: ${e.message}`, 'WARN');
                return res.status(500).json({ status: false, message: 'Lỗi truy vấn danh sách file' });
            }
        },

        post: async (req, res) => {
            const { nickname, link, description } = req.body;
            if (!nickname || !link) {
                return res.status(400).json({
                    status: false,
                    message: 'Thiếu trường bắt buộc',
                    required: { nickname: 'Biệt danh người chia sẻ', link: 'Link file', description: 'Mô tả (tuỳ chọn)' }
                });
            }
            try { new URL(link); } catch {
                return res.status(400).json({ status: false, message: 'Link file không hợp lệ' });
            }

            const entry = {
                id: randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase(),
                nickname: String(nickname).trim().slice(0, 50),
                link: String(link).trim(),
                description: String(description || '').trim().slice(0, 200)
            };

            try {
                const r = await query(
                    `INSERT INTO sharefiles(id, nickname, link, description)
                     VALUES ($1,$2,$3,$4)
                     RETURNING id, nickname, link, description, created_at AS "createdAt"`,
                    [entry.id, entry.nickname, entry.link, entry.description]
                );
                // Trim danh sách: giữ 500 bản ghi mới nhất
                await query(
                    `DELETE FROM sharefiles WHERE id IN (
                        SELECT id FROM sharefiles ORDER BY created_at DESC OFFSET 500
                    )`
                ).catch(() => {});
                return res.status(201).json({
                    status: true,
                    message: 'Chia sẻ thành công',
                    data: r.rows[0]
                });
            } catch (e) {
                log(`[SHAREFILE] POST lỗi: ${e.message}`, 'WARN');
                return res.status(500).json({ status: false, message: 'Lỗi khi lưu file' });
            }
        },

        delete: async (req, res) => {
            const { id } = req.query;
            if (!id) return res.status(400).json({ status: false, message: 'Thiếu id' });
            try {
                const r = await query(
                    `DELETE FROM sharefiles WHERE id=$1
                     RETURNING id, nickname, link, description, created_at AS "createdAt"`,
                    [String(id)]
                );
                if (!r.rows[0]) return res.status(404).json({ status: false, message: 'Không tìm thấy file' });
                return res.json({ status: true, message: 'Đã xoá', data: r.rows[0] });
            } catch (e) {
                log(`[SHAREFILE] DELETE lỗi: ${e.message}`, 'WARN');
                return res.status(500).json({ status: false, message: 'Lỗi khi xoá file' });
            }
        }
    }
};
