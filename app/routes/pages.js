'use strict';

const express = require('express');
const router  = express.Router();

const {
    getBasePage, htmlEscape,
    getHomePageBody, getHomePageScript,
    getHealthPageBody, getHealthPageScript,
    getDownloadPageBody, getDownloadPageScript,
    getApiCatalogPageBody, getApiCatalogPageStyles, getApiCatalogPageScript,
    getTempMailPageBody, getTempMailPageStyles, getTempMailPageScript,
    getTempSmsPageBody, getTempSmsPageStyles, getTempSmsPageScript,
    getVpsPageBody, getVpsPageStyles, getVpsPageScript,
    getVoicePageBody, getVoicePageStyles, getVoicePageScript,
    getFbLoginPageBody, getFbLoginPageStyles, getFbLoginPageScript,
    getToolsVnPageBody, getToolsVnPageStyles, getToolsVnPageScript
} = require('../views');

// ─── Home ─────────────────────────────────────────────────────────────────────

router.get('/', async function (req, res) {
    const { loadedRoutes } = require('../server.js');
    const { getStats } = require('../../utils/data/stats');
    const data = await getStats().catch(() => ({ total: 0, byCategory: {}, hourly: [] }));
    const totalRoutes = Object.values(loadedRoutes).reduce((acc, r) => acc + r.length, 0);
    const totalCategories = Object.keys(loadedRoutes).length;
    const hourlyJson = JSON.stringify(Array.isArray(data.hourly) ? data.hourly : []);
    const byCategoryJson = JSON.stringify(data.byCategory && typeof data.byCategory === 'object' ? data.byCategory : {});
    res.send(getBasePage('LauNa Home',
        getHomePageBody(data.total, totalRoutes, totalCategories),
        getHomePageScript(hourlyJson, byCategoryJson)
    ));
});

router.get('/stats', function (req, res) { res.redirect(301, '/'); });

// ─── Health ───────────────────────────────────────────────────────────────────

router.get('/health', function (req, res) {
    res.send(getBasePage('LauNa Health', getHealthPageBody(), getHealthPageScript(), { active: 'health' }));
});

// ─── Legacy redirect ──────────────────────────────────────────────────────────

router.get('/bothosting', function (req, res) { res.redirect(301, '/'); });

// ─── Download ─────────────────────────────────────────────────────────────────

router.get('/download', function (req, res) {
    res.send(getBasePage('LauNa Download', getDownloadPageBody(), getDownloadPageScript(), { active: 'download' }));
});

// ─── API Catalog ──────────────────────────────────────────────────────────────

router.get('/api', async function (req, res) {
    const { loadedRoutes } = require('../server.js');
    const { getStats } = require('../../utils/data/stats');
    const data = await getStats().catch(() => ({ total: 0, byCategory: {}, hourly: [] }));
    const totalRoutes = Object.values(loadedRoutes).reduce((acc, r) => acc + r.length, 0);
    const totalCategories = Object.keys(loadedRoutes).length;
    const icons = { 'AI': '◇', 'Download': '↓', 'Music': '♪', 'Note': '✎', 'Share File': '⇆', 'FreeFire': '◈', 'Khác': '⚙' };
    const HIDDEN_ROUTES = new Set(['/api/Note/sharefile', '/download/all', '/download/snapsave', '/getkey', '/api/_internal/freekey-issue']);

    const visibleCats = Object.entries(loadedRoutes);
    const chipHtml = `<button class="chip is-active" data-cat="">All</button>` +
        visibleCats.map(([cat, r]) =>
            `<button class="chip" data-cat="${htmlEscape(cat)}">${htmlEscape(cat)} <span style="opacity:.6;margin-left:4px;">${r.length}</span></button>`
        ).join('');

    const categoryHtml = visibleCats.map(([category, routes]) => {
        const visibleRoutes = routes.filter(r => !HIDDEN_ROUTES.has(r.name));
        const routeLinks = visibleRoutes.map(route => {
            const params = route.params.join(', ');
            const href = route.name + (params ? '?' + route.params.map(p => p + '=').join('&') : '');
            return `
            <div class="route-item" data-route="${htmlEscape(route.name.toLowerCase())}" data-params="${htmlEscape(params.toLowerCase())}">
                <span class="route-method">GET</span>
                <div class="route-info">
                    <span class="route-name">${htmlEscape(route.name)}</span>
                    <span class="route-params">${htmlEscape(params ? '? ' + params : '— không tham số')}</span>
                </div>
                <a href="${htmlEscape(href)}" target="_blank" class="btn route-btn">Test ↗</a>
            </div>`;
        }).join('');
        return `
        <article class="card category-card is-collapsed" data-category="${htmlEscape(category)}">
            <div class="category-header" role="button" tabindex="0" aria-expanded="false">
                <span class="category-icon">${icons[category] || '◆'}</span>
                <h2>${htmlEscape(category)}</h2>
                <span class="pill">${visibleRoutes.length} endpoints</span>
                <span class="category-toggle" aria-hidden="true">▾</span>
            </div>
            <div class="route-list">${routeLinks}</div>
        </article>`;
    }).join('');

    const siteKey = global.config?.turnstile?.siteKey || '';
    const requestsPerHour = global.config?.freeKey?.requestsPerHour || 60;

    res.send(getBasePage('LauNa API Catalog',
        getApiCatalogPageBody({ total: data.total, totalRoutes, totalCategories, chipHtml, categoryHtml, requestsPerHour }),
        getApiCatalogPageStyles() + getApiCatalogPageScript(siteKey),
        { active: 'api' }
    ));
});

// ─── Short URL redirect ───────────────────────────────────────────────────────

router.get('/s/:code', async function (req, res) {
    try {
        const shortener = require('../../lib/Tools/shortener');
        const target = await shortener._resolve(req.params.code);
        if (!target) return res.status(404).send('Short URL không tồn tại.');
        res.redirect(302, target);
    } catch (e) {
        const log = require('../../utils/logger');
        log(`[PAGES] short-redirect lỗi: ${e.message}`, 'WARN');
        res.status(500).send('Lỗi redirect');
    }
});

// ─── Tool pages ───────────────────────────────────────────────────────────────

router.get('/tools-vn', function (req, res) {
    res.send(getBasePage('LauNa · Bộ Tool Việt Nam', getToolsVnPageBody(), getToolsVnPageStyles() + getToolsVnPageScript(), { active: 'tools-vn' }));
});

router.get('/tempmail', function (req, res) {
    res.send(getBasePage('LauNa · Mail Ảo 10 phút', getTempMailPageBody(), getTempMailPageStyles() + getTempMailPageScript(), { active: 'tempmail' }));
});

router.get('/tempsms', function (req, res) {
    res.send(getBasePage('LauNa · SĐT Ảo Public', getTempSmsPageBody(), getTempSmsPageStyles() + getTempSmsPageScript(), { active: 'tempsms' }));
});

router.get('/vps', function (req, res) {
    res.send(getBasePage('LauNa · VPS Manager', getVpsPageBody(), getVpsPageStyles() + getVpsPageScript(), { active: 'vps' }));
});

router.get('/voice', function (req, res) {
    res.send(getBasePage('LauNa · Voice Studio', getVoicePageBody(), getVoicePageStyles() + getVoicePageScript(), { active: 'voice' }));
});

router.get('/fb-login', function (req, res) {
    res.send(getBasePage('LauNa · FB Login (Get Token)', getFbLoginPageBody(), getFbLoginPageStyles() + getFbLoginPageScript(), { active: 'fblogin' }));
});

module.exports = router;
