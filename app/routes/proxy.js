'use strict';

const router = require('express').Router();
const log = require('../../utils/logger');
const proxyStore = require('../../utils/data/proxy-store');
const { clientIp } = require('../../utils/ai-proxy-helper');
const { getBasePage, getProxyPageBody, getProxyPageStyles, getProxyPageScript } = require('../views');

// ─── Web page ─────────────────────────────────────────────────────────────────

router.get('/proxy', function (req, res) {
    res.send(getBasePage('LauNa · Proxy Pool', getProxyPageBody(), getProxyPageStyles() + getProxyPageScript(), { active: 'proxy' }));
});

// ─── JSON API ─────────────────────────────────────────────────────────────────

router.get('/proxy/api/stats', async function (req, res) {
    try {
        const pool = global.proxyPool ? global.proxyPool.getStats() : { total: 0 };
        const db = await proxyStore.countProxies();
        const sources = await proxyStore.listSources();
        const auto = await proxyStore.listAutoProxy({ limit: 1000 });
        return res.json({
            status: true,
            pool,
            db,
            sources: { total: sources.length },
            autoProxyClients: auto.length,
        });
    } catch (e) {
        log(`[PROXY] /proxy/api/stats lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi truy vấn thống kê proxy' });
    }
});

router.get('/proxy/api/list', async function (req, res) {
    try {
        const aliveOnly = req.query.alive !== '0';
        const proxies = await proxyStore.listProxies({ aliveOnly, limit: 500 });
        return res.json({ status: true, proxies });
    } catch (e) {
        log(`[PROXY] /proxy/api/list lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi truy vấn danh sách proxy' });
    }
});

router.post('/proxy/api/submit', async function (req, res) {
    try {
        const text = String(req.body?.proxies || req.body?.text || req.query.proxies || '').slice(0, 200_000);
        if (!text.trim()) return res.status(400).json({ status: false, message: 'Thiếu danh sách proxy' });
        const ip = clientIp(req);
        const parsed = proxyStore.parseProxyText(text);
        if (!parsed.length) return res.status(400).json({ status: false, message: 'Không tìm thấy proxy hợp lệ trong input' });

        let added = 0, skipped = 0;
        for (const p of parsed) {
            const ok = await proxyStore.saveProxy({ ...p, source: 'user', addedByIp: ip, alive: true });
            if (ok) added++; else skipped++;
        }
        // Trigger refresh để sớm đưa vào pool
        if (added > 0 && global.proxyPool?.refresh) {
            global.proxyPool.refresh().catch(() => {});
        }
        return res.json({ status: true, added, skipped, total: parsed.length });
    } catch (e) {
        log(`[PROXY] /proxy/api/submit lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi khi lưu proxy' });
    }
});

router.post('/proxy/api/delete', async function (req, res) {
    try {
        const ip = String(req.query.ip || req.body?.ip || '').trim();
        const port = parseInt(req.query.port || req.body?.port, 10);
        if (!ip || !port) return res.status(400).json({ status: false, message: 'Thiếu ip/port' });
        const ok = await proxyStore.deleteProxy(ip, port);
        return res.json({ status: ok });
    } catch (e) {
        log(`[PROXY] /proxy/api/delete lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi khi xoá proxy' });
    }
});

router.get('/proxy/api/sources', async function (req, res) {
    try {
        const sources = await proxyStore.listSources();
        return res.json({ status: true, sources });
    } catch (e) {
        log(`[PROXY] /proxy/api/sources lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi truy vấn nguồn proxy' });
    }
});

router.post('/proxy/api/sources/add', async function (req, res) {
    try {
        const url = String(req.body?.url || req.query.url || '').trim();
        if (!/^https?:\/\//i.test(url)) return res.status(400).json({ status: false, message: 'URL không hợp lệ' });
        // SSRF guard: chặn URL trỏ vào mạng nội bộ
        const { isSafeUrl } = require('../../utils/security/ssrf');
        if (!await isSafeUrl(url)) {
            return res.status(400).json({ status: false, message: 'URL bị từ chối vì lý do bảo mật' });
        }
        const ok = await proxyStore.addSource(url, clientIp(req));
        if (!ok) return res.status(500).json({ status: false, message: 'Không lưu được (DB tắt?)' });
        if (global.proxyPool?.refresh) global.proxyPool.refresh().catch(() => {});
        return res.json({ status: true });
    } catch (e) {
        log(`[PROXY] /proxy/api/sources/add lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi khi thêm nguồn proxy' });
    }
});

router.post('/proxy/api/sources/delete', async function (req, res) {
    try {
        const url = String(req.body?.url || req.query.url || '').trim();
        if (!url) return res.status(400).json({ status: false, message: 'Thiếu url' });
        const ok = await proxyStore.deleteSource(url);
        return res.json({ status: ok });
    } catch (e) {
        log(`[PROXY] /proxy/api/sources/delete lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi khi xoá nguồn proxy' });
    }
});

router.get('/proxy/api/my-status', async function (req, res) {
    try {
        const ip = clientIp(req);
        const auto = await proxyStore.listAutoProxy({ limit: 1000 });
        const me = auto.find(c => c.client_ip === ip);
        return res.json({
            status: true,
            ip,
            autoProxy: !!me,
            reason: me?.reason || null,
            expiresAt: me?.expires_at || null,
            hits: me?.hits || 0,
        });
    } catch (e) {
        log(`[PROXY] /proxy/api/my-status lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi truy vấn trạng thái' });
    }
});

router.post('/proxy/api/my-status/clear', async function (req, res) {
    try {
        const ip = clientIp(req);
        const ok = await proxyStore.clearAutoProxy(ip);
        return res.json({ status: ok, ip });
    } catch (e) {
        log(`[PROXY] /proxy/api/my-status/clear lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi khi xoá trạng thái' });
    }
});

router.get('/proxy/api/auto-list', async function (req, res) {
    try {
        const clients = await proxyStore.listAutoProxy({ limit: 100 });
        return res.json({ status: true, clients });
    } catch (e) {
        log(`[PROXY] /proxy/api/auto-list lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi truy vấn danh sách' });
    }
});

module.exports = router;
