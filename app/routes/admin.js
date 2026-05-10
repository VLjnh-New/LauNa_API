'use strict';

/**
 * Admin API — chỉ dành cho admin key
 *
 * GET  /admin/stats        — tổng quan hệ thống (memory, cache, requests, usage)
 * GET  /admin/logs         — access log gần nhất
 * GET  /admin/cache        — cache stats + danh sách keys
 * POST /admin/cache/clear  — xoá cache (body: {pattern?})
 * GET  /admin/keys         — danh sách API keys (ẩn giá trị)
 * POST /admin/keys/create  — tạo key mới
 * POST /admin/keys/revoke  — thu hồi key
 * GET  /admin/usage        — top keys, top IPs, totals (usage-tracker)
 * GET  /admin/usage/key    — IPs của 1 key (?key=...)
 * GET  /admin/usage/ip     — keys của 1 IP (?ip=...)
 */

const express  = require('express');
const { z }    = require('zod');
const router   = express.Router();
const tracker  = require('../../utils/data/usage-tracker');

const accessLog  = require('../middleware/access-log');
const resCache   = require('../middleware/response-cache');
const { version } = require('../../package.json');
const log = require('../../utils/logger');
const { isAdminReq } = require('../../utils/security/admin-check');
const { listKeys, createAdminKey, revokeKey } = require('../../utils/security/apikey');

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const createKeySchema = z.object({
    type:         z.enum(['admin', 'premium', 'free']).default('free'),
    note:         z.string().max(200).optional().default(''),
    hourlyLimit:  z.number().int().min(1).max(100_000).optional(),
    ip:           z.string().ip().optional(),
});

const revokeKeySchema = z.object({
    apikey: z.string().min(1).max(200),
});

// ─── Admin auth guard ──────────────────────────────────────────────────────────

function adminGuard(req, res, next) {
    if (!isAdminReq(req)) {
        return res.status(403).json({ status: false, message: 'Admin key required' });
    }
    next();
}

router.use('/admin', adminGuard);

// ─── GET /admin/stats ──────────────────────────────────────────────────────────

router.get('/admin/stats', (req, res) => {
    const mem = process.memoryUsage();
    const { loadedRoutes } = require('../server');
    const totalRoutes = Object.values(loadedRoutes || {}).reduce((s, r) => s + r.length, 0);
    const hours = Number(req.query.hours) || 24;

    res.json({
        status: true,
        data: {
            version,
            env: process.env.NODE_ENV || 'development',
            uptime: Math.floor(process.uptime()),
            pid: process.pid,
            node: process.version,
            memory: {
                rss:      `${Math.round(mem.rss / 1024 / 1024)}MB`,
                heap:     `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
                heapTotal:`${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
            },
            routes: {
                total: totalRoutes,
                categories: Object.keys(loadedRoutes || {}).length,
            },
            cache: resCache.getStats(),
            requests: accessLog.getStats(),
            usage: tracker.totals(hours),
            redis: !!process.env.REDIS_URL,
            ffmpeg: !!(() => { try { return require('ffmpeg-static'); } catch { return null; } })(),
        }
    });
});

// ─── GET /admin/logs ───────────────────────────────────────────────────────────

router.get('/admin/logs', (req, res) => {
    const { limit, method, status, path: pathFilter } = req.query;
    const logs = accessLog.getLogs({
        limit: Math.min(Number(limit) || 100, 500),
        method, status, path: pathFilter
    });
    res.json({
        status: true,
        data: logs,
        meta: { count: logs.length, stats: accessLog.getStats() }
    });
});

// ─── GET /admin/cache ──────────────────────────────────────────────────────────

router.get('/admin/cache', (req, res) => {
    res.json({
        status: true,
        data: {
            stats: resCache.getStats(),
            keys: resCache.listKeys().slice(0, 200),
        }
    });
});

// ─── POST /admin/cache/clear ───────────────────────────────────────────────────

router.post('/admin/cache/clear', express.json(), (req, res) => {
    const { pattern } = req.body || {};
    const result = resCache.clearCache(pattern);
    log(`[ADMIN] Cache cleared: ${JSON.stringify(result)}`, 'WARN');
    res.json({ status: true, data: result });
});

// ─── GET /admin/keys ───────────────────────────────────────────────────────────

router.get('/admin/keys', (req, res) => {
    try {
        const arr = listKeys();
        const masked = arr.map(k => ({
            ...k,
            apikey: k.apikey ? k.apikey.slice(0, 8) + '****' : '???',
        }));
        res.json({ status: true, data: masked, meta: { total: arr.length } });
    } catch (e) {
        log(`[ADMIN] /admin/keys lỗi: ${e.message}`, 'ERROR');
        res.status(500).json({ status: false, message: 'Lỗi truy vấn danh sách key' });
    }
});

// ─── POST /admin/keys/create ───────────────────────────────────────────────────

router.post('/admin/keys/create', express.json(), (req, res) => {
    const parsed = createKeySchema.safeParse(req.body || {});
    if (!parsed.success) {
        return res.status(400).json({ status: false, message: parsed.error.errors.map(e => e.message).join(', ') });
    }
    const { type, note, hourlyLimit, ip } = parsed.data;
    const result = createAdminKey(type, note, hourlyLimit, ip);
    if (!result.status) {
        return res.status(400).json(result);
    }
    log(`[ADMIN] Key mới: ${result.data.apikey} (${type})`, 'WARN');
    res.status(201).json(result);
});

// ─── POST /admin/keys/revoke ───────────────────────────────────────────────────

router.post('/admin/keys/revoke', express.json(), (req, res) => {
    const parsed = revokeKeySchema.safeParse(req.body || {});
    if (!parsed.success) {
        return res.status(400).json({ status: false, message: 'Thiếu hoặc sai định dạng apikey' });
    }
    const { apikey } = parsed.data;
    const result = revokeKey(apikey);
    if (!result.status) {
        return res.status(404).json(result);
    }
    const masked = String(apikey).slice(0, 8) + '****';
    log(`[ADMIN] Key đã thu hồi: ${masked}`, 'WARN');
    res.json({ status: true, data: { revoked: masked } });
});

// ─── GET /admin/usage — top keys, top IPs, totals ─────────────────────────────

router.get('/admin/usage', (req, res) => {
    const hours = Math.min(Number(req.query.hours) || 24, 168); // tối đa 7 ngày
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    res.json({
        status: true,
        data: {
            period: `${hours}h`,
            totals:  tracker.totals(hours),
            topKeys: tracker.topKeys(hours, limit),
            topIps:  tracker.topIps(hours, limit),
        }
    });
});

// ─── GET /admin/usage/key — IPs của 1 key ─────────────────────────────────────

router.get('/admin/usage/key', (req, res) => {
    const { key } = req.query;
    if (!key) return res.status(400).json({ status: false, message: 'Thiếu ?key=' });
    const ips = tracker.ipsForKey(key);
    res.json({ status: true, data: { key, ips, count: ips.length } });
});

// ─── GET /admin/usage/ip — keys của 1 IP ──────────────────────────────────────

router.get('/admin/usage/ip', (req, res) => {
    const { ip } = req.query;
    if (!ip) return res.status(400).json({ status: false, message: 'Thiếu ?ip=' });
    const keys = tracker.keysForIp(ip);
    res.json({ status: true, data: { ip, keys, count: keys.length } });
});

module.exports = router;
