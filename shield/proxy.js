'use strict';

const http = require('node:http');
const httpProxy = require('http-proxy');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');

const { logger } = require('./logger');
const { state, tickPassed, tickBlocked } = require('./state');
const { clientIp, ipInList } = require('./ipUtil');
const { RateLimiter } = require('./rateLimiter');
const { inspect } = require('./waf');
const { detect: detectBot } = require('./botDetect');
const { challengePage, makeToken, verifyToken } = require('./challenge');
const { attachDashboardWS } = require('./dashboard');

function denyHTML(reason, status) {
    return `<!doctype html><meta charset="utf-8"><title>Bị chặn (${status})</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;
font-family:system-ui,sans-serif;background:#0b0d12;color:#eaeaea}
.box{background:#1a1f2b;border:1px solid #2a3142;border-radius:14px;
padding:30px 40px;max-width:480px;text-align:center}
h1{margin:0 0 8px;color:#ff6b6b}p{color:#9aa3b8;margin:6px 0}</style>
<div class="box"><h1>Truy cập bị từ chối</h1>
<p>${reason}</p>
<p style="font-size:12px;opacity:.6">Mini Shield · Mã ${status}</p></div>`;
}

function readBody(req, max) {
    return new Promise((resolve) => {
        const chunks = [];
        let total = 0;
        let aborted = false;
        req.on('data', (c) => {
            if (aborted) return;
            total += c.length;
            if (total > max) {
                aborted = true;
                return resolve(null); // signal: oversized, body discarded
            }
            chunks.push(c);
        });
        req.on('end', () => {
            if (aborted) return;
            try {
                resolve(Buffer.concat(chunks).toString('utf8'));
            } catch {
                resolve(null);
            }
        });
        req.on('error', () => resolve(null));
    });
}

function bufferToStream(s) {
    return Readable.from([Buffer.from(s, 'utf8')]);
}

function parseCookie(header, name) {
    if (!header) return undefined;
    for (const part of header.split(';')) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return rest.join('=');
    }
    return undefined;
}

function startProxy(cfg, opts = {}) {
    const dashApp = opts.dashboardApp;
    const dashBase = (opts.dashboardBasePath || '').replace(/\/$/, '');
    const dashWsPath = dashBase + '/ws';

    const limiter = new RateLimiter(
        cfg.rateLimit.windowMs,
        cfg.rateLimit.maxRequests,
        cfg.rateLimit.burst
    );

    const proxy = httpProxy.createProxyServer({
        target: cfg.proxy.upstream,
        changeOrigin: true,
        xfwd: true,
        proxyTimeout: cfg.proxy.proxyTimeout || 30_000,
        timeout: cfg.proxy.proxyTimeout || 0,
        ws: true,
    });

    proxy.on('error', (err, _req, res) => {
        logger.warn('Lỗi upstream:', err.message);
        if (res && 'writeHead' in res && !res.headersSent) {
            try {
                res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(denyHTML('Backend không phản hồi.', 502));
            } catch (_) {}
        }
    });

    function handleVerify(req, res, ip) {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
            try {
                const { seed, nonce, difficulty } = JSON.parse(raw);
                const h = crypto.createHash('sha256').update(`${seed}:${nonce}`).digest('hex');
                if (typeof difficulty !== 'number' || difficulty < 1 || difficulty > 8) {
                    throw new Error('bad difficulty');
                }
                if (!h.startsWith('0'.repeat(difficulty))) throw new Error('bad hash');
                const token = makeToken(ip, cfg.challenge.cookieTTLms);
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Set-Cookie':
                        `${cfg.challenge.cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; ` +
                        `Max-Age=${Math.floor(cfg.challenge.cookieTTLms / 1000)}`,
                });
                res.end(JSON.stringify({ ok: true }));
                state.stats.challengeSolved++;
            } catch {
                res.writeHead(400);
                res.end(JSON.stringify({ ok: false }));
            }
        });
    }

    async function evaluate(req, ip) {
        // 0. Whitelist
        if (ipInList(ip, cfg.whitelistIps)) return { ok: true };

        // 1. Static blacklist
        if (ipInList(ip, cfg.blacklistIps)) {
            return { ok: false, status: 403, reason: 'IP nằm trong danh sách đen.',
                     type: 'blacklist', detail: ip };
        }

        // 2. Active ban
        const ban = state.isBanned(ip);
        if (ban.banned) {
            return { ok: false, status: 403, reason: 'IP của bạn đang bị tạm khoá.',
                     type: 'ban', detail: ban.reason || '' };
        }

        // 3. Rate limit
        if (cfg.rateLimit.enabled && !limiter.hit(ip)) {
            const v = state.bumpViolation(ip, cfg.rateLimit.windowMs * 5);
            if (cfg.ban.enabled && v >= cfg.ban.maxViolations) {
                state.ban(ip, cfg.ban.durationMs, 'Vượt giới hạn tốc độ liên tục');
            }
            return { ok: false, status: 429, reason: 'Quá nhiều yêu cầu. Vui lòng chờ giây lát.',
                     type: 'rate_limit', detail: `${v} vi phạm` };
        }

        // 4. WAF inspection (URL + headers always; body only if explicitly allowed)
        if (cfg.waf.enabled) {
            const headers = {};
            for (const [k, v] of Object.entries(req.headers)) {
                if (typeof v === 'string') headers[k] = v;
                else if (Array.isArray(v)) headers[k] = v.join(', ');
            }

            // FIX: only buffer the body when maxBodyBytes > 0. If we read it
            // when maxBodyBytes==0, we'd consume the request stream and the
            // proxied upstream would receive an empty body for every POST.
            let body;
            const method = (req.method || 'GET').toUpperCase();
            const wantsBody = cfg.waf.maxBodyBytes > 0
                && (method === 'POST' || method === 'PUT' || method === 'PATCH');
            if (wantsBody) {
                const result = await readBody(req, cfg.waf.maxBodyBytes);
                if (result !== null) {
                    body = result;
                    req._buffered = body;
                }
            }

            const hit = inspect({ url: req.url || '/', headers, body });
            if (hit) {
                if (cfg.waf.blockOnMatch) {
                    const v = state.bumpViolation(ip, 60_000);
                    if (cfg.ban.enabled && v >= cfg.ban.maxViolations) {
                        state.ban(ip, cfg.ban.durationMs, `WAF: ${hit.rule.name}`);
                    }
                    return {
                        ok: false, status: 403,
                        reason: 'Yêu cầu chứa nội dung độc hại.',
                        type: 'waf',
                        detail: `${hit.rule.id} · ${hit.rule.name} · ${hit.field}`,
                    };
                } else {
                    // Log-only mode: record but don't block
                    state.recordAttack({
                        ip, type: 'waf',
                        detail: `[LOG] ${hit.rule.id} · ${hit.rule.name} · ${hit.field}`,
                        path: req.url || '/',
                        ua: (req.headers['user-agent'] || '').slice(0, 200),
                    });
                }
            }
        }

        // 5. Bot / UA check
        let suspicious = false;
        if (cfg.botDetect.enabled) {
            const bot = detectBot(req.headers['user-agent'], cfg.botDetect);
            if (bot.verdict === 'block') {
                return { ok: false, status: 403, reason: 'Trình duyệt không hợp lệ.',
                         type: 'bot', detail: bot.reason || '' };
            }
            if (bot.verdict === 'suspicious') suspicious = true;
        }

        // 6. JS Proof-of-Work for suspicious clients
        if (
            cfg.challenge.enabled &&
            suspicious &&
            cfg.challenge.triggerWhenSuspicious &&
            !verifyToken(parseCookie(req.headers.cookie, cfg.challenge.cookieName), ip)
        ) {
            return { ok: false, status: 403, reason: '__challenge__',
                     type: 'challenge', detail: 'PoW required' };
        }

        return { ok: true };
    }

    const server = http.createServer(async (req, res) => {
        state.stats.totalRequests++;
        const ip = clientIp(req, cfg.proxy.trustProxy);
        const url = req.url || '/';

        // Internal endpoints
        if (url === '/__shield/verify' && req.method === 'POST') {
            return handleVerify(req, res, ip);
        }

        // Combined-port mode: dashboard mounted at dashBase
        if (dashApp && dashBase && (url === dashBase || url.startsWith(dashBase + '/'))) {
            if (state.isBanned(ip).banned || ipInList(ip, cfg.blacklistIps)) {
                res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
                return res.end(denyHTML('IP của bạn đang bị tạm khoá.', 403));
            }
            const stripped = url.slice(dashBase.length) || '/';
            req.url = stripped;
            return dashApp(req, res);
        }

        const decision = await evaluate(req, ip);

        if (decision.ok) {
            state.stats.passedRequests++;
            tickPassed();
            const buffered = req._buffered;
            if (buffered !== undefined) {
                proxy.web(req, res, { buffer: bufferToStream(buffered) });
            } else {
                proxy.web(req, res);
            }
            return;
        }

        state.stats.blockedRequests++;
        tickBlocked();
        state.recordAttack({
            ip, type: decision.type, detail: decision.detail,
            path: url, ua: (req.headers['user-agent'] || '').slice(0, 200),
        });
        logger.warn(`Chặn ${ip} ${decision.type} → ${decision.detail}`);

        if (decision.reason === '__challenge__') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            state.stats.challengeIssued++;
            res.end(challengePage({
                difficulty: cfg.challenge.difficulty,
                cookieName: cfg.challenge.cookieName,
                cookieTTLms: cfg.challenge.cookieTTLms,
                returnTo: url,
            }));
            return;
        }

        res.writeHead(decision.status, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(denyHTML(decision.reason, decision.status));
    });

    if (dashApp) {
        attachDashboardWS(server, dashWsPath);
    }

    server.on('upgrade', (req, socket, head) => {
        if (dashApp && req.url === dashWsPath) return;
        const ip = clientIp(req, cfg.proxy.trustProxy);
        if (state.isBanned(ip).banned || ipInList(ip, cfg.blacklistIps)) {
            socket.destroy();
            return;
        }
        proxy.ws(req, socket, head);
    });

    server.listen(cfg.proxy.port, '0.0.0.0', () => {
        logger.info(`🛡️  Proxy chạy trên http://0.0.0.0:${cfg.proxy.port} → ${cfg.proxy.upstream}`);
        if (dashApp) {
            logger.info(`📊 Dashboard mounted: http://0.0.0.0:${cfg.proxy.port}${dashBase}/`);
        }
    });

    setInterval(() => limiter.cleanup(), 60_000).unref();

    return server;
}

module.exports = { startProxy };
