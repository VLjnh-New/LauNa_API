'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { router, loadedRoutes } = require('./server.js');
const log = require('../utils/logger');
const checkAPI = require('../utils/security/apikey');
const config = require('../utils/config-loader');
const sec = require('./config/security');
const app = express();

// ─── Globals ──────────────────────────────────────────────────────────────────

global.checkAPI = checkAPI.check_api_key;
global.config = config;
// KHÔNG set global.APIKEY ở đây — để apikey.js tự resolve /tmp nếu read-only
global._404 = process.cwd() + '/public/_404.html';

app.set('trust proxy', true);
app.set('json spaces', 4);

// ─── Request timeout ──────────────────────────────────────────────────────────

app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    const isHeavy = sec.heavyTimeoutPrefixes.some(pfx => p.startsWith(pfx));
    const timeoutMs = isHeavy ? 120_000 : 60_000;
    const timer = setTimeout(() => {
        if (!res.headersSent) res.status(504).json({ status: false, message: 'Request timeout. Thử lại sau.' });
    }, timeoutMs);
    res.on('finish', () => clearTimeout(timer));
    res.on('close',  () => clearTimeout(timer));
    next();
});

const responseEnhancer = require('./middleware/response-enhancer');
app.use(responseEnhancer);

const accessLog = require('./middleware/access-log');
app.use(accessLog.middleware);

const responseCache = require('./middleware/response-cache');
app.use(responseCache.middleware);

// ─── Proxy pool ───────────────────────────────────────────────────────────────

const { proxyPool } = require('../utils/http/proxy-pool');
global.proxyPool = proxyPool;
proxyPool.init().catch(e => log(`Proxy pool lỗi khởi động: ${e.message}`, 'PROXY'));

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false,
    hsts: process.env.NODE_ENV === 'production'
        ? { maxAge: 15552000, includeSubDomains: true, preload: false }
        : false,
    referrerPolicy: { policy: 'no-referrer-when-downgrade' }
}));
app.disable('x-powered-by');

app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => req.headers['x-no-compression'] ? false : compression.filter(req, res)
}));

app.use((req, res, next) => {
    res.setHeader('Vary', 'Accept-Encoding');
    if (req.method === 'GET' && sec.htmlCachePaths.includes(req.path)) {
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }
    next();
});

// Body parsers
app.use('/challenge', express.json({ limit: '4kb' }));
app.use(express.json({ limit: '2mb' }));
app.use(cors());

// ─── Telegram Webhook (TRƯỚC security middleware) ─────────────────────────────
// Phải mount trước DDoS/rate-limit để Telegram không bị chặn.
// Body đã được parse bởi express.json() ở trên.
app.post('/tg-webhook/:hash', (req, res) => {
    const tgBot = require('../utils/telegram-bot');
    // Trả 200 ngay lập tức để Telegram không timeout chờ response.
    // Bot xử lý update bất đồng bộ sau đó (webhookReply: false).
    if (!tgBot.handleWebhookUpdate(req.body)) {
        return res.sendStatus(503);
    }
    res.sendStatus(200);
});

// ─── Security ─────────────────────────────────────────────────────────────────

const ddos = require('../utils/security/ddos');
app.use(ddos.middleware);

const turnstile = require('../utils/security/turnstile');
sec.turnstilePaths.forEach(p => app.post(p, turnstile.middleware));
app.get('/download/all', turnstile.middleware);

const { createLimiter } = require('../utils/security/rate-limit');

// Per-route rate limits
sec.rateLimits.forEach(({ paths, windowMs, max, name, message }) => {
    paths.forEach(p => app.use(p, createLimiter({ windowMs, max, name, message })));
});

// AI rate limits
const _aiHeavy = createLimiter(sec.aiRateLimits.heavy);
const _aiMed   = createLimiter(sec.aiRateLimits.medium);
sec.aiRateLimits.heavy.paths.forEach(p => app.use(p, _aiHeavy));
sec.aiRateLimits.medium.paths.forEach(p => app.use(p, _aiMed));

// SSRF guard
const { ssrfQueryGuard } = require('../utils/security/ssrf');
const ssrfGuard = ssrfQueryGuard('url');
sec.ssrfPaths.forEach(p => app.use(p, ssrfGuard));

const requestCounter = require('./middleware/request-counter');
app.use(requestCounter);

// Static assets
app.use(express.static(process.cwd() + '/public', { maxAge: '7d', index: false }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use(require('./routes/system'));
app.use(require('./routes/core'));
app.use(require('./routes/challenge'));

const aiSupport = require('../lib/AI/support.js');
app.get(aiSupport.name, aiSupport.handleChat);
app.get(aiSupport.name + '/stream', aiSupport.handleStream);
app.get(aiSupport.name + '/models', aiSupport.handleModels);

const freeKeyIssue = require('../lib/Key/getkey.js');
app.get('/api/_internal/freekey-issue', freeKeyIssue.handler);

app.use('/', router);
app.use(require('./routes/proxy'));
app.use(require('./routes/admin'));
app.use(require('./routes/pages'));

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.use(function (req, res) {
    const { loadedRoutes } = require('./server.js');
    const allRoutes = Object.values(loadedRoutes || {}).flatMap(r => r.map(x => x.name));
    const path = req.path.toLowerCase();
    const suggestion = allRoutes.find(r => {
        const parts = r.toLowerCase().split('/').filter(Boolean);
        return parts.some(p => path.includes(p) && p.length > 3);
    });
    res.status(404).json({
        status: false,
        message: `Không tìm thấy endpoint: ${req.method} ${req.path}`,
        hint: suggestion ? `Có phải bạn muốn gọi: ${suggestion} ?` : 'Xem danh sách endpoint tại /api hoặc /docs',
        error: { message: 'Route not found', status: 404 }
    });
});

// ─── Global error handler ─────────────────────────────────────────────────────

const CONTACT_FB = 'https://www.facebook.com/share/17HTQyZzmg/';

app.use(function (err, req, res, next) {
    const status = err.status || err.statusCode || 500;
    log(err.stack || err.message, status >= 500 ? 'ERROR' : 'WARN');
    const isClientError = status >= 400 && status < 500;
    const publicMessage = isClientError && err.expose !== false
        ? (err.message || 'Yêu cầu không hợp lệ')
        : 'Đã xảy ra lỗi server';
    res.status(status).json({ status: false, message: publicMessage, error: { message: publicMessage, status }, contact: CONTACT_FB });
});

process.on('unhandledRejection', (reason) => log(`Unhandled Rejection: ${reason && reason.stack || reason}`, 'ERROR'));
process.on('uncaughtException', (err) => { log(`Uncaught Exception: ${err && err.stack || err}`, 'ERROR'); process.exit(1); });

// ─── Start ────────────────────────────────────────────────────────────────────

app.set('port', (config.server && config.server.port) || 5000);
app.set('host', (config.server && config.server.host) || '0.0.0.0');

const server = app.listen(app.get('port'), app.get('host'), function () {
    log(`API LauNa is running on port ${app.get('port')}`, 'HOST UPTIME');
    Promise.resolve()
        .then(() => require('../utils/telegram-bot').startBot())
        .catch(e => log('Không khởi động được Telegram bot: ' + (e && e.message || e), 'ERROR'));

    // ── Self-ping để chống Render free tier ngủ ────────────────────────────
    const pingMs = Number(process.env.SELF_PING_INTERVAL_MS) || 0;
    if (pingMs > 0) {
        const http = require('http');
        const selfPort = app.get('port');
        const pingTimer = setInterval(() => {
            const req = http.get(`http://127.0.0.1:${selfPort}/healthz`, (res) => {
                res.resume();
            });
            req.on('error', () => {});
            req.end();
        }, pingMs);
        pingTimer.unref();
        log(`[KEEP-ALIVE] Self-ping /healthz mỗi ${pingMs / 1000}s để chống sleep.`, 'INFO');
    }
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
    log(`Nhận ${signal}, đang đóng server...`, 'SHUTDOWN');
    server.close(() => { log('Server đã đóng.', 'SHUTDOWN'); process.exit(0); });
    setTimeout(() => { log('Đóng cưỡng chế sau 10s.', 'SHUTDOWN'); process.exit(1); }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

module.exports = { app, server };
