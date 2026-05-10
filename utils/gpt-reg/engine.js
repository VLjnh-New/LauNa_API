'use strict';

const crypto          = require('crypto');
const { request: undiciRequest, Agent } = require('undici');
const { HttpSession } = require('./http');

// Firefox 122 TLS profile for undici — bypasses JA3 fingerprint detection
const FF_CIPHERS = [
    'TLS_AES_128_GCM_SHA256',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_256_GCM_SHA384',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-CHACHA20-POLY1305',
    'ECDHE-RSA-CHACHA20-POLY1305',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-AES256-SHA',
    'ECDHE-RSA-AES256-SHA',
    'DHE-RSA-AES128-GCM-SHA256',
    'DHE-RSA-AES256-GCM-SHA384',
].join(':');

const FF_TLS_CONNECT = {
    rejectUnauthorized: false,
    ciphers:    FF_CIPHERS,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.3',
};

console.log('[gpt-reg] using undici with Firefox TLS profile (no system curl needed)');

const { USER_AGENT, generateRequirementsToken } = require('./sentinel');
const { buildAuthUrl, exchangeCode } = require('./oauth');

const sleep = ms => new Promise(r => setTimeout(r, ms));
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const NAMES   = ['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles','Emma','Olivia','Ava','Isabella','Sophia','Mia','Charlotte','Amelia','Harper','Evelyn','Alex','Jordan','Taylor','Morgan','Casey','Riley','Jamie','Avery','Quinn','Skyler','Liam','Noah','Ethan','Lucas','Mason','Oliver','Elijah','Aiden','Henry','Sebastian'];
const SPECIAL = '!@#$%^&*.-';
const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789' + SPECIAL;

function genPassword(len = 16) {
    len = Math.max(12, len);
    const chars = [
        pick('abcdefghijklmnopqrstuvwxyz'),
        pick('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        pick('0123456789'),
        pick(SPECIAL),
    ];
    while (chars.length < len) chars.push(pick(CHARSET));
    for (let i = chars.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}

function genUserInfo() {
    const name  = pick(NAMES);
    const year  = 1970 + Math.floor(Math.random() * 30);
    const month = 1 + Math.floor(Math.random() * 12);
    const maxD  = [1,3,5,7,8,10,12].includes(month) ? 31 : month === 2 ? 28 : 30;
    const day   = 1 + Math.floor(Math.random() * maxD);
    return { name, birthdate: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` };
}

function tryJson(raw) {
    try { return typeof raw === 'string' ? JSON.parse(raw) : {}; } catch { return {}; }
}

const EP = {
    sentinel:         'https://sentinel.openai.com/backend-api/sentinel/req',
    signup:           'https://auth.openai.com/api/accounts/authorize/continue',
    register:         'https://auth.openai.com/api/accounts/user/register',
    send_otp:         'https://auth.openai.com/api/accounts/email-otp/send',
    validate_otp:     'https://auth.openai.com/api/accounts/email-otp/validate',
    create_account:   'https://auth.openai.com/api/accounts/create_account',
    select_workspace: 'https://auth.openai.com/api/accounts/workspace/select',
};

class RegistrationEngine {
    constructor({ mailService, proxyUrl = null, logger = null, taskId = null }) {
        this.mailService = mailService;
        this.proxyUrl    = proxyUrl;
        this._log        = msg => { const l = `[${new Date().toLocaleTimeString('vi-VN', { hour12: false })}][${this.taskId}] ${msg}`; this._logs.push(l); try { logger && logger(l); } catch {} };
        this.taskId      = taskId || crypto.randomUUID().slice(0, 8);
        this._logs       = [];
        this.email       = null;
        this.password    = null;
        this.deviceId    = null;
        this.session     = null;
        this.oauthCtx    = null;
    }

    // ── undici wrapper với Firefox TLS fingerprint (thay thế system curl) ─────
    // Dùng undici + custom TLS ciphers để bypass JA3 fingerprint detection
    // mà không cần system curl binary.
    async _curlExec(url, opts = {}) {
        const { method = 'GET', data = null, headers = {}, followRedirects = false, maxTime = 35 } = opts;
        if (!this.session) this.session = new HttpSession({ timeout: maxTime * 1000, proxy: this.proxyUrl });

        const allHeaders = {
            'user-agent':       USER_AGENT,
            'accept':           'application/json',
            'accept-language':  'en-US,en;q=0.5',
            'accept-encoding':  'gzip, deflate, br',
            'sec-fetch-dest':   'empty',
            'sec-fetch-mode':   'cors',
            'sec-fetch-site':   'same-origin',
            'x-requested-with': 'XMLHttpRequest',
            'dnt':              '1',
            ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
        };
        if (data && !Object.keys(allHeaders).some(k => k === 'content-type')) {
            allHeaders['content-type'] = 'application/json';
        }

        // Inject cookies từ HttpSession CookieJar
        try {
            const cookieHdr = this.session.cookies.header(new URL(url));
            if (cookieHdr) allHeaders['cookie'] = cookieHdr;
        } catch {}

        const connectOpts = { ...FF_TLS_CONNECT };
        if (this.proxyUrl) {
            try {
                const pu = new URL(this.proxyUrl.startsWith('http') ? this.proxyUrl : 'http://' + this.proxyUrl);
                connectOpts.proxy = { uri: pu.origin, token: pu.username ? `Basic ${Buffer.from(`${decodeURIComponent(pu.username)}:${decodeURIComponent(pu.password)}`).toString('base64')}` : undefined };
            } catch {}
        }

        try {
            const agent = new Agent({ connect: connectOpts, bodyTimeout: maxTime * 1000, headersTimeout: maxTime * 1000 });
            const res = await undiciRequest(url, {
                method,
                headers:         allHeaders,
                body:            data ? String(data) : undefined,
                maxRedirections: followRedirects ? 12 : 0,
                dispatcher:      agent,
            });

            const chunks = [];
            for await (const chunk of res.body) chunks.push(chunk);
            const body = Buffer.concat(chunks).toString('utf8');

            // Capture response cookies into session
            const rawCookies = res.headers['set-cookie'];
            if (rawCookies) {
                const list = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
                try { this.session.cookies.setCookies(list, new URL(url)); } catch {}
            }

            const respH = {};
            for (const [k, v] of Object.entries(res.headers)) {
                respH[k.toLowerCase()] = Array.isArray(v) ? v[v.length - 1] : v;
            }

            return { status: res.statusCode, body: body.trim(), headers: respH };
        } catch (e) {
            return { status: 0, body: '', headers: {}, error: e.message };
        }
    }

    // ── HTTP wrapper (replaces curl) ──────────────────────────────────────────
    async _curl(url, opts = {}) {
        const { method = 'GET', data = null, headers = {}, followRedirects = true, maxTime = 35 } = opts;
        if (!this.session) this.session = new HttpSession({ timeout: maxTime * 1000, proxy: this.proxyUrl });
        try {
            const mergedHeaders = { 'X-Requested-With': 'XMLHttpRequest', 'Sec-Fetch-Site': 'same-origin', ...headers };
            const reqOpts = {
                headers:        mergedHeaders,
                allowRedirects: followRedirects,
                timeout:        maxTime * 1000,
            };
            if (data !== null) {
                reqOpts.data = data;
                if (!Object.keys(mergedHeaders).some(k => k.toLowerCase() === 'content-type')) {
                    mergedHeaders['Content-Type'] = 'application/json';
                }
            }
            const r = await this.session.request(method, url, reqOpts);
            return { status: r.status, body: r.text, headers: r.headers };
        } catch (e) {
            return { status: 0, body: '', headers: {}, error: e.message };
        }
    }

    // navigate (follow all redirects, capture cookies)
    async _curlNav(url, referer = null) {
        if (!this.session) this.session = new HttpSession({ timeout: 35000, proxy: this.proxyUrl });
        try {
            const extraH = {
                'Accept':                  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Sec-Fetch-Dest':          'document',
                'Sec-Fetch-Mode':          'navigate',
                'Sec-Fetch-Site':          referer ? 'same-origin' : 'none',
                'Sec-Fetch-User':          '?1',
                'Upgrade-Insecure-Requests': '1',
            };
            if (referer) extraH['Referer'] = referer;
            const r = await this.session.get(url, { headers: extraH, allowRedirects: true, timeout: 30000 });
            return { status: r.status };
        } catch (e) {
            return { status: 0 };
        }
    }

    // navigate WITH body capture
    async _curlNavBody(url, referer = null) {
        if (!this.session) this.session = new HttpSession({ timeout: 35000, proxy: this.proxyUrl });
        try {
            const extraH = {
                'Accept':                  'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Sec-Fetch-Dest':          'document',
                'Sec-Fetch-Mode':          'navigate',
                'Sec-Fetch-Site':          referer ? 'same-origin' : 'none',
                'Sec-Fetch-User':          '?1',
                'Upgrade-Insecure-Requests': '1',
            };
            if (referer) extraH['Referer'] = referer;
            const r = await this.session.get(url, { headers: extraH, allowRedirects: true, timeout: 30000 });
            return { body: r.text || '', status: r.status, finalUrl: r.url || '' };
        } catch (e) {
            return { body: '', status: 0, finalUrl: '' };
        }
    }

    _extractSessionId(html) {
        // Try multiple patterns — OpenAI has changed this format
        const patterns = [
            /"session_id"\s*:\s*"(authsess_[a-zA-Z0-9]+)"/,
            /session_id['":\s]+(authsess_[a-zA-Z0-9]+)/,
            /"sessionId"\s*:\s*"(authsess_[a-zA-Z0-9]+)"/,
        ];
        for (const p of patterns) {
            const m = p.exec(html || '');
            if (m) return m[1];
        }
        return null;
    }

    _extractVerifierId(html) {
        const m = (html || '').match(/"verifier_id"\s*:\s*"([a-zA-Z0-9_-]+)"/);
        return m ? m[1] : null;
    }

    _jarCookie(name) {
        if (this.session) return this.session.cookies.get(name);
        return null;
    }

    _cleanup() {}

    // ── Bước 1: Kiểm tra IP ──────────────────────────────────────────────────
    async checkIp() {
        this.session = new HttpSession({ timeout: 35000, proxy: this.proxyUrl });
        try {
            const r   = await this.session.get('https://cloudflare.com/cdn-cgi/trace', {
                timeout: 20000, headers: { Accept: 'text/plain' },
            });
            const m   = /loc=([A-Z]+)/.exec(r.text);
            const loc = m ? m[1] : 'UNKNOWN';
            // Countries completely blocked by OpenAI
            const blocked = ['CN', 'HK', 'MO', 'TW'];
            if (blocked.includes(loc)) return { ok: false, loc, reason: 'country_blocked', msg: `OpenAI không hỗ trợ quốc gia ${loc}` };
            // Countries where OpenAI blocks registration without a US/EU proxy
            const needProxy = ['IN', 'VN', 'PK', 'BD', 'RU', 'BY', 'CU', 'IR', 'KP', 'SY'];
            if (needProxy.includes(loc) && !this.proxyUrl) {
                return { ok: false, loc, reason: 'proxy_required', msg: `IP từ ${loc} bị OpenAI chặn đăng ký — cần proxy US/EU` };
            }
            return { ok: true, loc };
        } catch (e) {
            const msg = e.message || '';
            const isProxyErr = msg.includes('Proxy') || msg.includes('CONNECT') || msg.includes('timeout') || msg.includes('connect');
            return { ok: false, loc: 'ERROR', reason: isProxyErr ? 'proxy_dead' : 'network', msg: e.message };
        }
    }

    // ── Bước 2: OAuth navigate → lấy oai-did ─────────────────────────────────
    async getDeviceId() {
        this.oauthCtx = buildAuthUrl('signup');
        for (let i = 1; i <= 3; i++) {
            try {
                this._log(`getDeviceId attempt ${i}...`);
                await this._curlNav(this.oauthCtx.authUrl);
                const did = this._jarCookie('oai-did') || crypto.randomUUID();
                this.deviceId = did;
                this._log(`Device ID: ${did.slice(0, 8)}...`);
                return did;
            } catch (e) {
                this._log(`getDeviceId lỗi ${i}: ${e.message}`);
                if (i < 3) { await sleep(i * 1500); this.oauthCtx = buildAuthUrl('signup'); }
            }
        }
        const fb = crypto.randomUUID();
        this.deviceId = fb;
        return fb;
    }

    // ── Lấy sentinel token ────────────────────────────────────────────────────
    async getSentinel(did, flow = 'authorize_continue', retries = 3) {
        if (!this.session) this.session = new HttpSession({ timeout: 35000, proxy: this.proxyUrl });
        for (let i = 1; i <= retries; i++) {
            try {
                const r = await this.session.post(EP.sentinel, {
                    headers: {
                        origin:   'https://sentinel.openai.com',
                        referer:  'https://sentinel.openai.com/backend-api/sentinel/frame.html?sv=20260219f9f6',
                        'content-type': 'text/plain;charset=UTF-8',
                    },
                    data: JSON.stringify({ p: generateRequirementsToken(did, USER_AGENT), id: did, flow }),
                    allowRedirects: false,
                });
                if (r.status !== 200) {
                    this._log(`Sentinel HTTP ${r.status} (attempt ${i})`);
                    if (i < retries) { await sleep(2000 * i); continue; }
                    return null;
                }
                const tok = tryJson(r.text).token || null;
                if (tok) { this._log(`Sentinel OK (flow=${flow})`); return tok; }
                this._log(`Sentinel: no token (attempt ${i})`);
                if (i < retries) await sleep(2000);
            } catch (e) {
                this._log(`Sentinel lỗi ${i}: ${e.message}`);
                if (i < retries) await sleep(2000 * i);
            }
        }
        return null;
    }

    _sentinelHeader(token, did, flow = 'authorize_continue') {
        if (!token || !did) return null;
        const p = generateRequirementsToken(did, USER_AGENT);
        return JSON.stringify({ p, t: '', c: token, id: did, flow });
    }

    // ── Bước 4: Submit email form ─────────────────────────────────────────────
    async submitEmailForm(email, did, sentinel, max = 4) {
        let sen = sentinel;
        for (let i = 1; i <= max; i++) {
            try {
                const body   = JSON.stringify({ username: { value: email, kind: 'email' }, screen_hint: 'signup' });
                const extraH = {
                    accept:  'application/json',
                    origin:  'https://auth.openai.com',
                    referer: 'https://auth.openai.com/create-account',
                };
                const sh = this._sentinelHeader(sen, did);
                if (sh) extraH['openai-sentinel-token'] = sh;

                const r = await this._curl(EP.signup, { method: 'POST', data: body, headers: extraH, followRedirects: false });
                this._log(`Email form HTTP ${r.status} (attempt ${i})`);

                if (r.status === 0) {
                    this._log(`Email form curl lỗi: ${r.error || 'network/timeout'}`);
                    if (i < max) { await sleep(3000 * i); continue; }
                    return { ok: false, error: `curl timeout/network: ${r.error || ''}` };
                }
                if (r.status === 429) {
                    this._log('Rate limited, waiting...');
                    if (i < max) { await sleep(Math.min(20000, 6000 * i)); continue; }
                    return { ok: false, error: 'Rate limited (429)' };
                }
                if (r.status === 409) {
                    this._log(`Sentinel stale (409), rebuilding OAuth ctx (attempt ${i})...`);
                    this.oauthCtx = buildAuthUrl('signup');
                    await this._curlNav(this.oauthCtx.authUrl);
                    sen = await this.getSentinel(did, 'authorize_continue');
                    if (i < max) { await sleep(2000 * i); continue; }
                    return { ok: false, error: 'Sentinel conflict (409)' };
                }
                // 302 redirect to error page
                if ([301,302,303,307,308].includes(r.status)) {
                    const loc = r.headers['location'] || '';
                    if (loc.includes('/error')) {
                        const payload = this._decodePayload(loc);
                        const code    = payload?.errorCode || payload?.kind || 'AuthApiFailure';
                        this._log(`Email form redirect error: ${code}`);
                        if (code === 'invalid_state' && i < max) {
                            // Rebuild OAuth context and retry
                            this.oauthCtx = buildAuthUrl('signup');
                            await this._curlNav(this.oauthCtx.authUrl);
                            sen = await this.getSentinel(did);
                            await sleep(2000);
                            continue;
                        }
                        return { ok: false, error: `Email form: ${code}` };
                    }
                    // Redirect to continue URL (success)
                    return { ok: true, page: 'redirect', isExist: false, continueUrl: loc, updatedSentinel: sen };
                }
                if (r.status !== 200) {
                    this._log(`Email form body: ${r.body.slice(0, 200)}`);
                    if (i < max) { await sleep(3000 * i); continue; }
                    return { ok: false, error: `HTTP ${r.status}` };
                }

                const d           = tryJson(r.body);
                const page        = d?.page?.type || '';
                const isExist     = page === 'email_otp_verification';
                const continueUrl = d?.continue_url || 'https://auth.openai.com/create-account/password';
                return { ok: true, page, isExist, continueUrl, updatedSentinel: sen };
            } catch (e) {
                this._log(`Email form lỗi ${i}: ${e.message}`);
                if (i < max) { await sleep(2000 * i); continue; }
                return { ok: false, error: e.message };
            }
        }
        return { ok: false, error: 'max attempts' };
    }

    // ── Bước 5: Navigate password page → lấy session_id ─────────────────────
    async navigatePasswordPage(pwUrl) {
        this._log(`Navigate password page: ${pwUrl}`);
        const nav = await this._curlNavBody(pwUrl, 'https://auth.openai.com/create-account');
        this._log(`Password page HTTP ${nav.status}, finalUrl: ${(nav.finalUrl||'').slice(0,60)}`);

        // Nếu bị redirect sang error page
        if ((nav.finalUrl || '').includes('/error')) {
            const m = (nav.finalUrl || '').match(/payload=([^&\s]+)/);
            if (m) {
                let s = decodeURIComponent(m[1]);
                while (s.length % 4) s += '=';
                const payload = tryJson(Buffer.from(s, 'base64').toString('utf8'));
                this._log(`Password page error: ${JSON.stringify(payload)}`);
            }
            return { ok: false, sessionId: null };
        }

        const sessionId   = this._extractSessionId(nav.body);
        const verifierId  = this._extractVerifierId(nav.body);
        this._log(`session_id: ${sessionId || '(không tìm thấy)'} | verifier_id: ${verifierId || '(không tìm thấy)'}`);
        return { ok: true, sessionId, verifierId, html: nav.body };
    }

    // ── Bước 6: Đăng ký mật khẩu ─────────────────────────────────────────────
    async registerPassword(email, password, did, sentinel, sessionId = null, max = 3) {
        for (let i = 1; i <= max; i++) {
            try {
                const body   = JSON.stringify({ password, username: email });
                const extraH = {
                    accept:           'application/json',
                    'content-type':   'application/json',
                    origin:           'https://auth.openai.com',
                    referer:          'https://auth.openai.com/create-account/password',
                    'Sec-Fetch-Site': 'same-origin',
                    'DNT':            '1',
                };
                const sh = this._sentinelHeader(sentinel, did);
                if (sh) extraH['openai-sentinel-token'] = sh;

                const regEp = sessionId
                    ? `${EP.register}?session_id=${encodeURIComponent(sessionId)}`
                    : EP.register;

                const r = await this._curlExec(regEp, { method: 'POST', data: body, headers: extraH, followRedirects: false });
                this._log(`Register HTTP ${r.status} (attempt ${i})`);

                if (r.status === 0) {
                    this._log(`Register curl lỗi: ${r.error || 'network/timeout'}`);
                    if (i < max) { await sleep(3000 * i); continue; }
                    return { ok: false, error: `curl network error: ${r.error || ''}` };
                }
                if (r.status === 200) return { ok: true };

                if ([301, 302, 303, 307, 308].includes(r.status)) {
                    const loc = r.headers['location'] || '';
                    if (!loc.includes('/error')) return { ok: true };

                    const payload  = this._decodePayload(loc);
                    const errCode  = payload?.errorCode;
                    const retryUrl = payload?.retryUrl || '';
                    const errKind  = payload?.kind || 'AuthApiFailure';
                    this._log(`Register error ${i}: code=${JSON.stringify(errCode)} kind=${errKind} retry=${retryUrl.slice(0,60)}`);

                    // errorCode: null + retryUrl:/log-in = IP bị block tại endpoint register
                    // → đây là proxy xấu (IP không hợp lệ), đánh dấu proxyFailed
                    if ((errCode === null || errCode === undefined) && retryUrl.includes('/log-in')) {
                        return { ok: false, error: 'IP bị block tại register (proxy IP không hợp lệ)', proxyFailed: true };
                    }

                    // invalid_state → rebuild OAuth session + fresh sentinel
                    if (errCode === 'invalid_state' && i < max) {
                        this._log('Rebuilding OAuth session (invalid_state)...');
                        this.oauthCtx = buildAuthUrl('signup');
                        await this._curlNav(this.oauthCtx.authUrl);
                        const freshSentinel = await this.getSentinel(did);
                        if (freshSentinel) sentinel = freshSentinel;
                        await sleep(3000 * i);
                        continue;
                    }
                    if (i < max) { await sleep(3000 * i); continue; }
                    return { ok: false, error: `${errKind}: ${errCode || 'null'}` };
                }

                this._log(`Register HTTP ${r.status} body: ${r.body.slice(0, 200)}`);
                if (i < max) { await sleep(5000 * i); continue; }
                return { ok: false, error: tryJson(r.body)?.error?.message || `HTTP ${r.status}` };
            } catch (e) {
                this._log(`Register lỗi ${i}: ${e.message}`);
                if (i < max) { await sleep(2000 * i); continue; }
                return { ok: false, error: e.message };
            }
        }
        return { ok: false, error: 'max attempts' };
    }

    // ── Bước 7: Gửi OTP ──────────────────────────────────────────────────────
    async sendOtp(did, sentinel) {
        for (let i = 1; i <= 3; i++) {
            try {
                const extraH = {
                    referer: 'https://auth.openai.com/create-account/password',
                    accept:  'application/json',
                };
                const sh = this._sentinelHeader(sentinel, did);
                if (sh) extraH['openai-sentinel-token'] = sh;
                const r = await this._curlExec(EP.send_otp, { method: 'POST', headers: extraH, followRedirects: false });
                this._log(`Send OTP HTTP ${r.status}`);
                if (r.status === 200 || [301,302,303,307,308].includes(r.status)) {
                    const loc = r.headers['location'] || '';
                    if (loc.includes('/error')) {
                        const payload = this._decodePayload(loc);
                        this._log(`OTP send error: ${JSON.stringify(payload)}`);
                        if (i < 3) { await sleep(3000); continue; }
                        return false;
                    }
                    return true;
                }
                this._log(`OTP send body: ${r.body.slice(0,200)}`);
                if (i < 3) { await sleep(3000); continue; }
                return false;
            } catch (e) { this._log(`Send OTP lỗi: ${e.message}`); if (i < 3) await sleep(2000); }
        }
        return false;
    }

    // ── Bước 8: Xác nhận OTP ─────────────────────────────────────────────────
    async validateOtp(code, did, sentinel) {
        try {
            const extraH = {
                referer: 'https://auth.openai.com/email-verification',
                accept:  'application/json',
                origin:  'https://auth.openai.com',
            };
            const sh = this._sentinelHeader(sentinel, did);
            if (sh) extraH['openai-sentinel-token'] = sh;

            const r = await this._curlExec(EP.validate_otp, {
                method: 'POST', data: JSON.stringify({ code }),
                headers: extraH, followRedirects: false,
            });
            this._log(`Validate OTP HTTP ${r.status}`);
            if (r.status !== 200) {
                if ([301,302,303,307,308].includes(r.status)) {
                    const loc = r.headers['location'] || '';
                    if (loc.includes('/error')) {
                        const p = this._decodePayload(loc);
                        return { ok: false, error: p?.errorCode || 'OTP invalid' };
                    }
                }
                return { ok: false, error: `HTTP ${r.status}` };
            }
            const d = tryJson(r.body);
            return {
                ok: true,
                workspaceId: d?.workspace_id || d?.default_workspace_id || null,
                continueUrl: d?.continue_url || null,
            };
        } catch (e) { return { ok: false, error: e.message }; }
    }

    // ── Chờ OTP ───────────────────────────────────────────────────────────────
    async _waitOtp(email, did, sentinel, max = 3) {
        const tried = new Set();
        for (let i = 1; i <= max; i++) {
            this._log(`Chờ OTP (${i}/${max})...`);
            const code = await this.mailService.getVerificationCode(email, { timeout: 90 });
            if (!code) {
                this._log(`OTP attempt ${i}: timeout`);
                if (i < max) { await sleep(2000); continue; }
                return { ok: false, error: 'OTP timeout' };
            }
            if (tried.has(code)) {
                this._log(`OTP ${code} trùng`);
                if (i < max) { await sleep(2000); continue; }
                return { ok: false, error: 'OTP duplicate' };
            }
            tried.add(code);
            this._log(`OTP: ${code}`);
            const v = await this.validateOtp(code, did, sentinel);
            if (v.ok) return v;
            this._log(`OTP validate fail: ${v.error || '?'}`);
            if (i < max) await sleep(2000);
        }
        return { ok: false, error: 'OTP validation failed' };
    }

    // ── Bước 9: Tạo tài khoản ─────────────────────────────────────────────────
    async createAccount(soToken) {
        try {
            await this._curlNav('https://auth.openai.com/about-you', 'https://auth.openai.com/email-verification');
            const info   = genUserInfo();
            const extraH = {
                referer: 'https://auth.openai.com/about-you',
                accept:  'application/json',
                origin:  'https://auth.openai.com',
            };
            if (soToken) extraH['openai-sentinel-so-token'] = soToken;
            const r = await this._curlExec(EP.create_account, {
                method: 'POST', data: JSON.stringify(info),
                headers: extraH, followRedirects: false,
            });
            this._log(`Create account HTTP ${r.status}`);
            if (r.status !== 200) {
                const loc = r.headers['location'] || '';
                if (loc.includes('/error')) {
                    const p = this._decodePayload(loc);
                    this._log(`Create account error: ${JSON.stringify(p)}`);
                    return { ok: false, error: p?.errorCode || `HTTP ${r.status}` };
                }
                if ([301,302,303,307,308].includes(r.status)) return { ok: true };
                this._log(`Create account body: ${r.body.slice(0, 200)}`);
                return { ok: false, error: tryJson(r.body)?.error?.message || `HTTP ${r.status}` };
            }
            const d = tryJson(r.body);
            return {
                ok: true,
                workspaceId: d?.workspace_id || d?.default_workspace_id ||
                             (Array.isArray(d?.workspaces) ? d.workspaces[0]?.id : null) || null,
                accountId:   d?.account_id || d?.chatgpt_account_id || null,
                continueUrl: d?.continue_url || null,
            };
        } catch (e) { return { ok: false, error: e.message }; }
    }

    // ── Workspace ID từ cookie ────────────────────────────────────────────────
    _getWorkspaceFromCookie() {
        const cookie = this._jarCookie('oai-client-auth-session');
        if (!cookie) return null;
        try {
            const seg = cookie.split('.')[0];
            const pad = '='.repeat((4 - seg.length % 4) % 4);
            const obj = JSON.parse(Buffer.from(seg + pad, 'base64').toString('utf8'));
            const wss = obj?.workspaces;
            if (Array.isArray(wss) && wss.length > 0) return String(wss[0]?.id || '').trim() || null;
        } catch {}
        return null;
    }

    // ── Bước 10: Chọn workspace ───────────────────────────────────────────────
    async _selectWorkspace(workspaceId) {
        try {
            const r = await this._curlExec(EP.select_workspace, {
                method: 'POST', data: JSON.stringify({ workspace_id: workspaceId }),
                headers: {
                    referer: 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent',
                    accept:  'application/json',
                    origin:  'https://auth.openai.com',
                },
                followRedirects: false,
            });
            this._log(`Select workspace HTTP ${r.status}`);
            const loc = r.headers['location'];
            if ([301,302,303,307,308].includes(r.status) && loc) return new URL(loc, EP.select_workspace).toString();
            return tryJson(r.body)?.continue_url || null;
        } catch (e) { this._log(`selectWorkspace lỗi: ${e.message}`); return null; }
    }

    // ── Theo redirect → lấy OAuth code ───────────────────────────────────────
    async _followRedirects(startUrl) {
        const isCallback = url => {
            try {
                const u = new URL(url);
                return (u.pathname.includes('/auth/callback') || u.pathname.includes('/api/auth/callback/openai'))
                    && (u.searchParams.has('code') || u.searchParams.has('error'));
            } catch { return false; }
        };
        let current = startUrl;
        for (let i = 0; i < 14; i++) {
            if (isCallback(current)) return current;
            try {
                const r   = await this._curlExec(current, { followRedirects: false, maxTime: 22 });
                if (![301,302,303,307,308].includes(r.status)) break;
                const loc = r.headers['location'];
                if (!loc) break;
                const next = new URL(loc, current).toString();
                if (isCallback(next)) return next;
                current = next;
            } catch (e) { this._log(`Redirect lỗi: ${e.message}`); break; }
        }
        return null;
    }

    async _completeTokens(result) {
        let workspaceId = result.workspaceId || this._getWorkspaceFromCookie();
        this._log(`WorkspaceID: ${workspaceId || '(không có)'}`);

        let startUrl = null;
        if (workspaceId) startUrl = await this._selectWorkspace(workspaceId);
        startUrl = startUrl || this.oauthCtx?.authUrl;

        if (startUrl) {
            this._log('Đang theo redirect OAuth callback...');
            const cbUrl = await this._followRedirects(startUrl);
            if (cbUrl) {
                this._log('Đổi code lấy token...');
                try {
                    const toks = await exchangeCode({ callbackUrl: cbUrl, state: this.oauthCtx.state, codeVerifier: this.oauthCtx.codeVerifier });
                    result.accessToken  = toks.accessToken  || null;
                    result.refreshToken = toks.refreshToken || null;
                    result.idToken      = toks.idToken      || null;
                    result.accountId    = result.accountId  || toks.accountId || null;
                    this._log(`Token: access=${result.accessToken ? 'YES' : 'NO'}, refresh=${result.refreshToken ? 'YES' : 'NO'}`);
                } catch (e) { this._log(`Token exchange lỗi: ${e.message}`); }
            } else {
                this._log('Không tìm thấy callback URL');
            }
        }
        result.deviceId     = this.deviceId;
        result.sessionToken = this._jarCookie('oai-client-auth-session') || null;
        result.success      = !!(result.accessToken || result.refreshToken || result.sessionToken);
        this._log(`=== ${result.success ? 'THÀNH CÔNG ✓' : 'THẤT BẠI ✗'} === ${result.email}`);
        return result;
    }

    _decodePayload(loc) {
        const m = (loc || '').match(/[?&]payload=([^&\s]+)/);
        if (!m) return null;
        try {
            let s = decodeURIComponent(m[1]);
            while (s.length % 4) s += '=';
            return JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
        } catch { return null; }
    }

    // ── Entry point ───────────────────────────────────────────────────────────
    async run() {
        const result = {
            success: false, email: null, password: null,
            accessToken: null, refreshToken: null, idToken: null, sessionToken: null,
            deviceId: null, accountId: null, workspaceId: null,
            error: null, proxyFailed: false,
        };
        try {
            // Bước 1: Kiểm tra IP
            this._log('Bước 1: Kiểm tra IP...');
            const ip = await this.checkIp();
            if (!ip.ok) {
                const reason = ip.reason || 'unknown';
                if (reason === 'proxy_required') {
                    result.error = ip.msg || `Cần proxy US/EU — IP từ ${ip.loc}`;
                } else if (reason === 'proxy_dead') {
                    result.error       = `Proxy không kết nối được: ${ip.msg}`;
                    result.proxyFailed = !!this.proxyUrl;
                } else {
                    result.error       = `IP bị block: ${ip.loc} — ${ip.msg || ''}`;
                    result.proxyFailed = !!this.proxyUrl;
                }
                return result;
            }
            this._log(`IP OK: ${ip.loc}${this.proxyUrl ? ' [proxy]' : ''}`);

            // Bước 2: Tạo email
            this._log('Bước 2: Tạo email...');
            const einfo = await this.mailService.createEmail();
            this.email  = result.email = einfo.email;
            this._log(`Email: ${this.email}`);

            // Bước 3: Device ID qua OAuth navigate
            this._log('Bước 3: Lấy device ID...');
            const did = await this.getDeviceId();

            // Bước 4: Sentinel tokens (2 flows song song)
            this._log('Bước 4: Lấy sentinel tokens...');
            const [sentinel_ac, sentinel_so] = await Promise.all([
                this.getSentinel(did, 'authorize_continue'),
                this.getSentinel(did, 'oauth_create_account'),
            ]);
            if (!sentinel_ac) { result.error = 'Không lấy được sentinel token'; return result; }

            // Bước 5: Submit email form
            this._log('Bước 5: Gửi email form...');
            const emailRes = await this.submitEmailForm(this.email, did, sentinel_ac);
            if (!emailRes.ok) { result.error = `Email form: ${emailRes.error}`; return result; }
            if (emailRes.isExist) { result.error = 'Email đã tồn tại'; return result; }
            const activeSentinel = emailRes.updatedSentinel || sentinel_ac;

            // Bước 5b: Navigate password page → lấy session_id
            const pwUrl = emailRes.continueUrl || 'https://auth.openai.com/create-account/password';
            this._log('Bước 5b: Lấy session_id...');
            const pwInfo   = await this.navigatePasswordPage(pwUrl);
            const sessionId = pwInfo.sessionId;

            // Bước 6: Đăng ký mật khẩu
            this._log('Bước 6: Đăng ký mật khẩu...');
            this.password   = genPassword();
            result.password = this.password;

            // Lấy fresh sentinel riêng cho register (tránh expired)
            this._log('Lấy fresh sentinel cho register...');
            const regSentinel = await this.getSentinel(did, 'authorize_continue') || activeSentinel;

            const regRes = await this.registerPassword(this.email, this.password, did, regSentinel, sessionId);
            if (!regRes.ok) {
                result.error       = `Register: ${regRes.error}`;
                result.proxyFailed = !!(regRes.proxyFailed && this.proxyUrl);
                return result;
            }

            // Bước 7: Gửi OTP
            this._log('Bước 7: Gửi OTP...');
            const otpSentinel = await this.getSentinel(did, 'authorize_continue') || regSentinel;
            if (!await this.sendOtp(did, otpSentinel)) { result.error = 'Gửi OTP thất bại'; return result; }

            // Bước 8: Chờ & xác nhận OTP
            this._log('Bước 8: Chờ OTP email...');
            const otp = await this._waitOtp(this.email, did, otpSentinel);
            if (!otp.ok) { result.error = `OTP: ${otp.error || 'thất bại'}`; return result; }
            if (otp.workspaceId) result.workspaceId = otp.workspaceId;

            // Bước 9: Tạo tài khoản (name + birthdate)
            this._log('Bước 9: Tạo tài khoản...');
            const accRes = await this.createAccount(sentinel_so);
            if (!accRes.ok) { result.error = `Create account: ${accRes.error}`; return result; }
            if (accRes.workspaceId) result.workspaceId = accRes.workspaceId;
            if (accRes.accountId)   result.accountId   = accRes.accountId;

            // Bước 10: OAuth tokens
            this._log('Bước 10: Lấy OAuth token...');
            return await this._completeTokens(result);

        } catch (e) {
            this._log(`Lỗi nghiêm trọng: ${e.message}`);
            result.error = e.message;
            return result;
        } finally {
            this._cleanup();
        }
    }
}

module.exports = { RegistrationEngine };
