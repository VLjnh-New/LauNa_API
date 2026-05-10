'use strict';

const express = require('express');
const http = require('node:http');
const { WebSocketServer } = require('ws');
const { state } = require('./state');
const { logger } = require('./logger');
const { dashboardHTML } = require('./dashboardHtml');

function basicAuth(user, pass) {
    return (req, res, next) => {
        if (!user) return next();
        const hdr = req.headers.authorization || '';
        if (!hdr.startsWith('Basic ')) {
            res.set('WWW-Authenticate', 'Basic realm="Mini Shield"');
            return res.status(401).send('Unauthorized');
        }
        const [u, p] = Buffer.from(hdr.slice(6), 'base64').toString().split(':');
        if (u !== user || p !== pass) {
            res.set('WWW-Authenticate', 'Basic realm="Mini Shield"');
            return res.status(401).send('Unauthorized');
        }
        next();
    };
}

function buildDashboardApp(cfg, basePath = '') {
    const app = express();
    app.use(basicAuth(cfg.dashboard.username, cfg.dashboard.password));
    app.use(express.json());

    app.get('/', (_req, res) => {
        res.type('html').send(dashboardHTML(basePath));
    });

    app.get('/api/stats', (_req, res) => {
        res.json({
            ...state.stats,
            uptimeSec: Math.floor((Date.now() - state.stats.startedAt) / 1000),
            bannedCount: state.bannedIps.size,
            history: state.history,
        });
    });

    app.get('/api/recent', (_req, res) => {
        res.json(state.recent);
    });

    app.get('/api/banned', (_req, res) => {
        const list = [...state.bannedIps.entries()].map(([ip, e]) => ({
            ip,
            reason: e.reason,
            until: e.until,
            remainingSec: Math.max(0, Math.floor((e.until - Date.now()) / 1000)),
        }));
        res.json(list);
    });

    app.post('/api/unban', (req, res) => {
        const ip = String((req.body && req.body.ip) || '');
        if (!ip) return res.status(400).json({ ok: false, error: 'missing ip' });
        state.unban(ip);
        logger.info(`Đã gỡ ban: ${ip}`);
        res.json({ ok: true });
    });

    app.post('/api/ban', (req, res) => {
        const ip = String((req.body && req.body.ip) || '');
        const minutes = Number((req.body && req.body.minutes) || 10);
        if (!ip) return res.status(400).json({ ok: false, error: 'missing ip' });
        state.ban(ip, minutes * 60_000, 'Thủ công từ dashboard');
        logger.info(`Đã ban thủ công: ${ip} (${minutes} phút)`);
        res.json({ ok: true });
    });

    app.get('/api/health', (_req, res) => res.json({ ok: true }));

    return app;
}

function attachDashboardWS(server, wsPath) {
    const wss = new WebSocketServer({ server, path: wsPath });

    state.on('attack', (ev) => {
        const msg = JSON.stringify({ type: 'attack', data: ev });
        for (const c of wss.clients) {
            if (c.readyState === c.OPEN) c.send(msg);
        }
    });

    setInterval(() => {
        if (wss.clients.size === 0) return;
        const snapshot = JSON.stringify({
            type: 'stats',
            data: {
                ...state.stats,
                uptimeSec: Math.floor((Date.now() - state.stats.startedAt) / 1000),
                bannedCount: state.bannedIps.size,
                history: state.history,
            },
        });
        for (const c of wss.clients) {
            if (c.readyState === c.OPEN) c.send(snapshot);
        }
    }, 1000).unref();

    return wss;
}

function startDashboard(cfg) {
    const app = buildDashboardApp(cfg, '');
    const server = http.createServer(app);
    attachDashboardWS(server, '/ws');
    server.listen(cfg.dashboard.port, '0.0.0.0', () => {
        logger.info(`📊 Dashboard: http://0.0.0.0:${cfg.dashboard.port}`);
    });
}

module.exports = { buildDashboardApp, attachDashboardWS, startDashboard };
