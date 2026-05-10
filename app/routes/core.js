'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const router  = express.Router();
const log     = require('../../utils/logger');
const { isAdminReq } = require('../../utils/security/admin-check');

const CODE_STORAGE = path.resolve(process.cwd(), 'data/upcode');
const CODE_MAX_BYTES = 256 * 1024; // 256KB — đủ cho mọi đoạn code hợp lý

// ─── GET /total_request ───────────────────────────────────────────────────────

router.get('/total_request', async function (req, res) {
    try {
        const { getStats } = require('../../utils/data/stats');
        const stats = await getStats();
        res.status(200).json(stats);
    } catch (e) {
        log(`[CORE] /total_request lỗi: ${e.message}`, 'WARN');
        res.status(500).json({ status: false, message: 'Lỗi truy vấn thống kê' });
    }
});

// ─── Static assets ────────────────────────────────────────────────────────────

const AVATAR_PATH = path.resolve(process.cwd(), 'public/avatar.png');
let _avatarExists = null; // cache once at first request
function serveAvatar(req, res, notFoundStatus) {
    if (_avatarExists === false) return res.status(notFoundStatus).end();
    if (_avatarExists) {
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        return res.sendFile(AVATAR_PATH);
    }
    fs.promises.access(AVATAR_PATH).then(() => {
        _avatarExists = true;
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        res.sendFile(AVATAR_PATH);
    }).catch(() => {
        _avatarExists = false;
        res.status(notFoundStatus).end();
    });
}

router.get('/favicon.ico', (req, res) => serveAvatar(req, res, 204));
router.get('/avatar.png',  (req, res) => serveAvatar(req, res, 404));

// ─── POST /upcode — chỉ admin ─────────────────────────────────────────────────

router.post('/upcode', function (req, res) {
    if (!isAdminReq(req)) {
        return res.status(403).json({ status: false, message: 'Chỉ admin mới được dùng /upcode.' });
    }

    const code = req.body?.code;
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ status: false, message: "Thiếu tham số 'code'" });
    }
    if (Buffer.byteLength(code, 'utf-8') > CODE_MAX_BYTES) {
        return res.status(413).json({ status: false, message: `Code quá lớn (tối đa ${CODE_MAX_BYTES / 1024}KB)` });
    }

    const id = ((Math.random() + 1).toString(36).substring(2)).toUpperCase();
    fs.promises.mkdir(CODE_STORAGE, { recursive: true })
        .then(() => fs.promises.writeFile(path.join(CODE_STORAGE, `_${id}.js`), code, 'utf-8'))
        .then(() => {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            return res.status(201).json({ status: true, url: `${baseUrl}/upcode/raw?id=${id}` });
        })
        .catch(err => {
            log(`[CORE] /upcode lỗi ghi file: ${err.message}`, 'ERROR');
            if (!res.headersSent) res.status(500).json({ status: false, message: 'Không thể lưu code' });
        });
});

// ─── GET /upcode/raw — public read (chỉ đọc, không execute) ─────────────────

router.get('/upcode/raw', function (req, res) {
    const id = req.query.id;
    if (!id || !/^[A-Z0-9]{6,20}$/.test(id)) {
        return res.status(400).json({ status: false, message: "id không hợp lệ" });
    }
    const filePath = path.join(CODE_STORAGE, `_${id}.js`);
    fs.promises.access(filePath).then(() => {
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.set('X-Content-Type-Options', 'nosniff');
        res.sendFile(filePath);
    }).catch(() => {
        res.status(404).json({ status: false, message: 'Không tìm thấy code' });
    });
});

module.exports = router;
