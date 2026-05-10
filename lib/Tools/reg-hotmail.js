'use strict';

/**
 * /tools/reg/hotmail — Tự động tạo tài khoản Microsoft Hotmail/Outlook/Live
 *
 * Flow đầy đủ:
 *   1. GET session signup.live.com  → cookies, apiCanary, uaid, DFP
 *   2. CheckAvailableSigninNames    → kiểm tra email
 *   3. mail.tm (→ emailnator dotGmail → Guerrilla) → inbox tạm thời
 *   4. SendOtt (Email, SignUp)      → gửi OTT tới email tạm
 *   5. Poll inbox → parse OTT      → ConsumeOneTimeToken (Email)
 *   6. CreateAccount (EASI)        → nếu thành công → trả kết quả
 *   7. Nếu 1312 (phone required)   → thử SMS từ nhiều service miễn phí
 *   8. Nếu SMS OK                  → ConsumeOneTimeToken (SMS) → CreateAccount
 *
 * Params:
 *   domain          hotmail.com | outlook.com | live.com  (default: hotmail.com)
 *   first_name      tên  (random nếu bỏ)
 *   last_name       họ   (random nếu bỏ)
 *   birth_year      năm sinh  (random 1988-2000 nếu bỏ)
 *   country         mã quốc gia  (default: US)
 *   username        tên đăng nhập cụ thể (không gồm @domain)
 */

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { randomBytes } = require('crypto');
const emailnator = require('../../utils/emailnator');
const tempmail   = require('../../utils/tempmail');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const SIGNUP = 'https://signup.live.com';

// ─── Random helpers ─────────────────────────────────────────────────────────

const FIRST = ['James','John','Robert','Michael','William','David','Richard','Joseph','Thomas','Charles',
    'Christopher','Daniel','Matthew','Anthony','Donald','Mark','Paul','Steven','Andrew','Kenneth',
    'Joshua','Kevin','Brian','George','Timothy','Ronald','Edward','Jason','Jeffrey','Ryan',
    'Jacob','Gary','Nicholas','Eric','Jonathan','Stephen','Larry','Justin','Scott','Brandon'];
const LAST  = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
    'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin',
    'Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson',
    'Walker','Young','Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores'];

const rndItem = a => a[Math.floor(Math.random() * a.length)];
const rndInt  = (l, h) => Math.floor(Math.random() * (h - l + 1)) + l;
const rndStr  = (n = 8) => randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n).toLowerCase();
const sleep   = ms => new Promise(r => setTimeout(r, ms));
const dec     = s => (s || '').replace(/\\u([\da-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

function genPassword() {
    const up = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lo = 'abcdefghjkmnpqrstuvwxyz',
          di = '23456789', sy = '!@#$%&*';
    let pw = rndItem([...up]) + rndItem([...lo]) + rndItem([...di]) + rndItem([...sy]);
    const pool = up + lo + di;
    for (let i = 0; i < 7; i++) pw += pool[Math.floor(Math.random() * pool.length)];
    return pw.split('').sort(() => Math.random() - 0.5).join('');
}

function genUsername(fn, ln) {
    const n = rndInt(100, 9999);
    return rndItem([
        `${fn.toLowerCase()}${ln.toLowerCase()}${n}`,
        `${fn.toLowerCase()}${n}${ln.toLowerCase()}`,
        `${fn.toLowerCase()}.${ln.toLowerCase()}${n}`,
        `${rndStr(4)}${fn.toLowerCase()}${n}`,
    ]);
}

// ─── HTTP ────────────────────────────────────────────────────────────────────

function makeHttp(proxy = null) {
    const cfg = {
        baseURL: SIGNUP,
        timeout: 25000,
        headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9',
                   'Origin': SIGNUP, 'Referer': SIGNUP + '/signup?lic=1' },
        maxRedirects: 3,
        validateStatus: () => true,
    };
    if (proxy) {
        // Dùng HttpsProxyAgent để tunnel HTTPS qua HTTP proxy (CONNECT method)
        // axios.proxy option KHÔNG hoạt động với HTTPS — cần httpsAgent
        const proxyUrl = `http://${proxy.ip}:${proxy.port}`;
        cfg.httpsAgent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false });
        cfg.proxy   = false;  // Tắt proxy mặc định của axios để tránh conflict
        cfg.timeout = 12000;  // Proxy timeout ngắn hơn để fail nhanh
    }
    return axios.create(cfg);
}

const http = makeHttp();

function parseCookies(headers) {
    const ck = {};
    for (const c of (headers?.['set-cookie'] || [])) {
        const [p] = c.split(';');
        const eq = p.indexOf('=');
        if (eq > 0) ck[p.slice(0, eq).trim()] = p.slice(eq + 1).trim();
    }
    return ck;
}

function cookieStr(ck) {
    return Object.entries(ck).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ─── Session ─────────────────────────────────────────────────────────────────

async function getSession(hc = http) {
    const r = await hc.get('/signup?lic=1', {
        headers: { Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
    const html = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    const ck   = parseCookies(r.headers);

    const get  = key => { const m = html.match(new RegExp(`"${key}"\\s*:\\s*"([^"]{1,600})"`)); return m ? m[1] : ''; };
    const getN = key => { const m = html.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));           return m ? m[1] : ''; };

    const apiCanary = dec(get('apiCanary'));
    const uaid      = get('sUnauthSessionID');
    const hpgid     = getN('hpgid') || '200225';
    const hipFid    = (() => { const m = html.match(/"oCaptchaInfo"\s*:\s*(\{[^}]+\})/); try { return m ? JSON.parse(m[1]).sHipFid || '' : ''; } catch { return ''; } })();
    const dfpRaw    = dec(get('urlDfp'));
    const dfpUrl    = dfpRaw.replace(/\\u003a/g,':').replace(/\\u002f/g,'/').replace(/\\u003f/g,'?').replace(/\\u003d/g,'=').replace(/\\u0026/g,'&');

    if (!apiCanary) throw new Error('Không lấy được session (apiCanary trống)');

    // DFP fingerprint
    if (dfpUrl.startsWith('http')) {
        try {
            const rd = await hc.get(dfpUrl, { baseURL: '' });
            Object.assign(ck, parseCookies(rd.headers));
        } catch (_) {}
    }

    return { cookies: ck, apiCanary, uaid, hpgid, hipFid };
}

function msHdr(sess) {
    return {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
        'canary':       sess.apiCanary,
        'hpgid':        String(sess.hpgid),
        'Cookie':       cookieStr(sess.cookies),
    };
}

function upd(sess, r) {
    Object.assign(sess.cookies, parseCookies(r.headers));
    if (r.data?.apiCanary) sess.apiCanary = r.data.apiCanary;
}

// ─── MS API calls ─────────────────────────────────────────────────────────────

async function checkName(email, sess, hc = http) {
    const r = await hc.post('/API/CheckAvailableSigninNames',
        { signInName: email, uaid: sess.uaid },
        { headers: msHdr(sess) });
    upd(sess, r);
    const d = r.data;
    return !d?.error && d?.isAvailable !== false;
}

async function sendOtt(channel, proofId, sess, extra = {}, hc = http) {
    const r = await hc.post('/API/Proofs/SendOtt', {
        action: 'SignUp', channel, proofId,
        uaid: sess.uaid, hpgid: parseInt(sess.hpgid),
        ...extra,
    }, { headers: msHdr(sess) });
    upd(sess, r);
    return r.data;
}

async function consumeOtt(channelType, pii, ott, sess, hc = http) {
    const r = await hc.post('/API/ConsumeOneTimeToken', {
        action:         'OnlyVerifyNoConsume',
        channelType,
        destinationPii: pii,
        ottPurpose:     'VerificationCode',
        ott,
        uaid:           sess.uaid,
        hpgid:          parseInt(sess.hpgid),
    }, { headers: msHdr(sess) });
    upd(sess, r);
    return r.data;
}

async function createAccount(opts, sess, hc = http) {
    const { email, password, firstName, lastName, birthDay, birthMonth, birthYear,
            country, verCode, verSlt } = opts;
    const r = await hc.post('/API/CreateAccount', {
        RequestTimeStamp:           new Date().toISOString(),
        MemberName:                 email,
        CheckAvailStateMap:         { [email]: 'AvailableIdIe' },
        EvictionWarningShown:       {},
        FirstName:                  firstName,
        LastName:                   lastName,
        MemberNameChangeCount:      1,
        MemberNameAvailableCount:   1,
        MemberNameUnavailableCount: 0,
        BirthDay:                   String(birthDay),
        BirthMonth:                 String(birthMonth),
        BirthYear:                  String(birthYear),
        Country:                    country,
        SuggestedAccountType:       'EASI',
        SiteId:                     68692,
        IsRDM:                      0,
        uiflvr:                     1001,
        scid:                       100118,
        uaid:                       sess.uaid,
        hpgid:                      parseInt(sess.hpgid),
        Password:                   password,
        IsOptOutEmail:              false,
        IsOptOutEmailDefault:       true,
        IsOptOutEmailShown:         false,
        LW:                         false,
        IsReadOnlyUser:             false,
        LiveDomainConnectOptIn:     0,
        WReply:                     null,
        ReturnUrl:                  null,
        SignupReturnUrl:            null,
        HFId:                       sess.hipFid || '',
        HPId:                       '',
        HType:                      '',
        HSol:                       '',
        encAttemptToken:            '',
        RiskAssessmentDetails:      '',
        VerificationCode:           verCode || '',
        VerificationCodeSlt:        verSlt  || '',
        IsUserConsentedToChinaPIPL: false,
        PrivateAccessToken:         '',
    }, { headers: msHdr(sess) });
    upd(sess, r);
    return r.data;
}

// ─── mail.tm (primary OTT receiver) ──────────────────────────────────────────

async function tmGetInbox() {
    const inbox = await tempmail.createInbox();
    return { email: inbox.email, provider: 'mailtm' };
}

async function tmPollOtt(email, maxWait = 75000) {
    const deadline = Date.now() + maxWait;
    const seenIds = new Set();
    while (Date.now() < deadline) {
        await sleep(5000);
        try {
            const { items } = await tempmail.listMessages(email);
            for (const msg of items) {
                if (seenIds.has(msg.id)) continue;
                seenIds.add(msg.id);
                try {
                    const data = await tempmail.readMessage(email, msg.id);
                    const body = [data.text, data.html, JSON.stringify(data)]
                        .filter(Boolean).join(' ').replace(/<[^>]+>/g, ' ');
                    const match = body.match(/\b(\d{4,8})\b/);
                    if (match) return match[1];
                } catch (_) {}
            }
        } catch (_) {}
    }
    return null;
}

// ─── Emailnator dotGmail (secondary OTT receiver) ────────────────────────────

async function enGetInbox() {
    // Dùng dotGmail thay vì plusGmail — Microsoft từ chối '+' alias (error 1035)
    const inbox = await emailnator.createInbox(['dotGmail']);
    // Pre-seed seenIds với các email có sẵn để chỉ đọc email MỚI sau khi SendOtt
    let existingIds = new Set();
    try {
        const { items } = await emailnator.listMessages(inbox.email);
        for (const m of items) existingIds.add(m.id);
    } catch (_) {}
    return { email: inbox.email, provider: 'emailnator', existingIds };
}

async function enPollOtt(email, maxWait = 75000, ctx = {}) {
    const deadline = Date.now() + maxWait;
    // Bắt đầu từ các ID đã biết trước (để bỏ qua email cũ)
    const seenIds = new Set(ctx.existingIds || []);
    while (Date.now() < deadline) {
        await sleep(3000);
        try {
            const { items } = await emailnator.listMessages(email);
            for (const msg of items) {
                if (seenIds.has(msg.id)) continue;
                seenIds.add(msg.id);
                try {
                    const data = await emailnator.readMessage(email, msg.id);
                    const body = (typeof data.html === 'string' ? data.html : JSON.stringify(data))
                        .replace(/<[^>]+>/g, ' ');
                    // Tìm OTT: cụm số 6-8 chữ số (MS OTT thường 6-8 số)
                    const match = body.match(/\b(\d{6,8})\b/);
                    if (match) return match[1];
                } catch (_) {}
            }
        } catch (_) {}
    }
    return null;
}

// ─── Guerrilla Mail (fallback) ────────────────────────────────────────────────

async function gmGetInbox() {
    const r = await axios.get('https://api.guerrillamail.com/ajax.php?f=get_email_address&lang=en',
        { timeout: 15000, headers: { 'User-Agent': UA } });
    return { email: r.data.email_addr, sid: r.data.sid_token };
}

async function gmPollOtt(sid, maxWait = 70000) {
    const deadline = Date.now() + maxWait;
    while (Date.now() < deadline) {
        await sleep(5000);
        try {
            const r = await axios.get(
                `https://api.guerrillamail.com/ajax.php?f=check_email&seq=0&sid_token=${encodeURIComponent(sid)}`,
                { timeout: 12000, headers: { 'User-Agent': UA } });
            for (const msg of (r.data?.list || [])) {
                try {
                    const m2 = await axios.get(
                        `https://api.guerrillamail.com/ajax.php?f=fetch_email&email_id=${msg.mail_id}&sid_token=${encodeURIComponent(sid)}`,
                        { timeout: 10000, headers: { 'User-Agent': UA } });
                    const body = (m2.data?.mail_body || '').replace(/<[^>]+>/g, ' ');
                    const match = body.match(/\b(\d{4,8})\b/);
                    if (match) return match[1];
                } catch (_) {}
            }
        } catch (_) {}
    }
    return null;
}

// ─── SMS service multi-source ─────────────────────────────────────────────────

const SMS_COUNTRY_ISO = {
    '1':   'US',  '44':  'GB',  '46':  'SE',  '49':  'DE',
    '33':  'FR',  '31':  'NL',  '48':  'PL',  '380': 'UA',
    '7':   'RU',  '91':  'IN',  '82':  'KR',  '81':  'JP',
    '61':  'AU',  '47':  'NO',  '358': 'FI',  '420': 'CZ',
    '60':  'MY',  '65':  'SG',  '66':  'TH',
};

function getIso(num) {
    const n = String(num).replace(/\D/g, '');
    for (const [code, iso] of Object.entries(SMS_COUNTRY_ISO)) {
        if (n.startsWith(code)) return iso;
    }
    return 'US';
}

async function getSmsNumbers() {
    const numbers = [];
    const fetchHtml = async url => {
        try {
            const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
            return String(r.data || '');
        } catch { return ''; }
    };

    // Source 1: sms-online.co
    try {
        const html = await fetchHtml('https://sms-online.co/receive-free-sms');
        for (const m of html.matchAll(/\/receive-free-sms\/(\d{7,15})/g)) {
            numbers.push('+' + m[1]);
        }
    } catch (_) {}

    // Source 2: receive-sms-online.info
    try {
        const html = await fetchHtml('https://receive-sms-online.info/');
        for (const m of html.matchAll(/href="[^"]*?(\d{8,15})[^"]*"/g)) {
            if (m[1].length >= 8 && m[1].length <= 15) numbers.push('+' + m[1]);
        }
    } catch (_) {}

    // Source 3: quackr.io (try page)
    try {
        const html = await fetchHtml('https://quackr.io/temporary-numbers');
        for (const m of html.matchAll(/\+(\d{8,15})/g)) {
            numbers.push('+' + m[1]);
        }
    } catch (_) {}

    // Source 4: hs3x.com (Canadian numbers)
    try {
        const html = await fetchHtml('https://hs3x.com/');
        for (const m of html.matchAll(/read-sms-(\d{8,15})\.html/g)) {
            numbers.push('+' + m[1]);
        }
    } catch (_) {}

    return [...new Set(numbers)].filter(n => n.length >= 9 && n.length <= 17);
}

async function smsGetInbox(number) {
    const num = String(number).replace(/\D/g, '');
    const UA2 = UA;
    const fetchHtml = async url => {
        try {
            const r = await axios.get(url, { timeout: 12000, headers: { 'User-Agent': UA2, 'Accept': 'text/html' } });
            return String(r.data || '');
        } catch { return ''; }
    };

    const sources = [
        `https://sms-online.co/receive-free-sms/${num}`,
        `https://receive-sms-online.info/${num}-`,
        `https://hs3x.com/read-sms-${num}.html`,
    ];

    for (const url of sources) {
        const html = await fetchHtml(url);
        if (!html) continue;
        // Find most recent MS OTT
        const blocks = html.split(/microsoft|Microsoft/i);
        for (let i = 1; i < blocks.length; i++) {
            const text = blocks[i].replace(/<[^>]+>/g, ' ').slice(0, 500);
            const m = text.match(/\b(\d{4,8})\b/);
            if (m) return m[1];
        }
    }
    return null;
}

// ─── SMS verification attempt ─────────────────────────────────────────────────

async function trySmsVerification(email, sess, caOpts) {
    const log = require('../../utils/logger');
    log('[REG-HOTMAIL] 1312: thử SMS verification...', 'INFO');

    const numbers = await getSmsNumbers();
    log(`[REG-HOTMAIL] tìm được ${numbers.length} số SMS`, 'INFO');

    for (const num of numbers.slice(0, 10)) {
        const iso = getIso(num);
        try {
            const ottR = await sendOtt('SMS', num, sess, { proofCountryIso: iso });
            const code = ottR?.error?.code;
            if (code) {
                // 1208 = IP-based SMS block, 1348 = VoIP block — cả 2 đều bị chặn từ IP này
                // Thử số tiếp theo
                continue;
            }
            // OK — MS đã gửi OTT tới số này
            log(`[REG-HOTMAIL] SMS SendOtt OK: ${num}`, 'INFO');

            // Poll inbox SMS (tối đa 90s)
            const deadline = Date.now() + 90000;
            let smsOtt = null;
            while (Date.now() < deadline && !smsOtt) {
                await sleep(8000);
                smsOtt = await smsGetInbox(num);
            }

            if (!smsOtt) {
                log(`[REG-HOTMAIL] SMS OTT timeout cho ${num}`, 'WARN');
                continue;
            }

            log(`[REG-HOTMAIL] SMS OTT nhận được: ${smsOtt}`, 'INFO');

            // ConsumeOTT (SMS)
            const cr = await consumeOtt('SMS', num, smsOtt, sess);
            if (cr?.error) {
                log(`[REG-HOTMAIL] ConsumeOTT SMS lỗi: ${cr.error.code}`, 'WARN');
                continue;
            }

            // CreateAccount với SMS OTT
            const car = await createAccount({ ...caOpts, verCode: smsOtt, verSlt: '' }, sess);
            if (!car?.error) return { success: true, data: car };
            log(`[REG-HOTMAIL] CreateAccount sau SMS: ${car.error?.code}`, 'WARN');

        } catch (e) {
            log(`[REG-HOTMAIL] SMS ${num} lỗi: ${e.message.slice(0, 60)}`, 'WARN');
        }
    }

    return { success: false, numbers_tried: Math.min(numbers.length, 10) };
}

// ─── Core registration logic (proxy-aware) ───────────────────────────────────

/**
 * Thực hiện toàn bộ flow đăng ký MS qua một hc (http client, có thể có proxy).
 * Trả về:
 *   { ok: true, result }          → thành công
 *   { ok: false, code, ... }      → lỗi xử lý được
 *   throw Error                   → lỗi kết nối / timeout (caller retry proxy khác)
 */
async function doRegister({ username, email, password, firstName, lastName,
    birthDay, birthMonth, birthYear, country, domain, log }, hc = http) {

    // ── Bước 1: Session ─────────────────────────────────────────────────────
    const sess = await getSession(hc);

    // ── Bước 2: Kiểm tra email ───────────────────────────────────────────────
    let finalEmail = email, finalUsername = username;
    let avail = await checkName(finalEmail, sess, hc);
    if (!avail) {
        finalUsername = genUsername(firstName, lastName);
        finalEmail    = `${finalUsername}@${domain}`;
        avail         = await checkName(finalEmail, sess, hc);
        if (!avail) return { ok: false, code: 'EMAIL_TAKEN', status: 409,
            message: 'Email đã tồn tại. Thử lại để lấy username khác.' };
    }
    log(`[REG-HOTMAIL] email trống: ${finalEmail}`, 'INFO');

    const caOpts = { email: finalEmail, password, firstName, lastName,
                     birthDay, birthMonth, birthYear, country };

    // ── Bước 3: Email OTT ────────────────────────────────────────────────────
    const emailProviders = [
        {
            name: 'emailnator-dotGmail',
            getInbox: enGetInbox,
            pollOtt:  (em, ctx) => enPollOtt(em, 55000, ctx),
        },
        {
            name: 'mail.tm',
            getInbox: tmGetInbox,
            pollOtt:  (em) => tmPollOtt(em, 55000),
        },
        {
            name: 'guerrilla',
            getInbox: async () => { const gm = await gmGetInbox(); return { email: gm.email, sid: gm.sid }; },
            pollOtt:  (em, ctx) => gmPollOtt(ctx?.sid, 55000),
        },
    ];

    let selectedProvider = null, ottEmail, ottCtx = {};
    for (const p of emailProviders) {
        try {
            log(`[REG-HOTMAIL] thử inbox provider: ${p.name}...`, 'INFO');
            const inbox = await p.getInbox();
            ottEmail = inbox.email;
            ottCtx   = inbox;
            const sendResult = await sendOtt('Email', ottEmail, sess, {}, hc);
            if (sendResult?.error) {
                log(`[REG-HOTMAIL] SendOtt lỗi (${p.name}): code=${sendResult.error.code}`, 'WARN');
                if (String(sendResult.error.code) === '1035') continue;
                return { ok: false, code: sendResult.error.code, status: 500,
                    message: `SendOtt Email thất bại: code=${sendResult.error.code}` };
            }
            log(`[REG-HOTMAIL] SendOtt OK với ${p.name}: ${ottEmail}`, 'INFO');
            selectedProvider = p;
            break;
        } catch (err) {
            log(`[REG-HOTMAIL] provider ${p.name} lỗi: ${err.message.slice(0, 80)}`, 'WARN');
        }
    }
    if (!selectedProvider) return { ok: false, code: '1035', status: 500,
        message: 'Tất cả email provider bị Microsoft chặn (error 1035).' };

    // ── Bước 4: Poll OTT ────────────────────────────────────────────────────
    log('[REG-HOTMAIL] đang chờ OTT...', 'INFO');
    const ott = await selectedProvider.pollOtt(ottEmail, ottCtx);
    if (!ott) return { ok: false, code: 'OTT_TIMEOUT', status: 504,
        message: 'Timeout chờ OTT email từ Microsoft (>80s).' };
    log(`[REG-HOTMAIL] OTT nhận: ${ott}`, 'INFO');

    // ── Bước 5: Consume OTT ─────────────────────────────────────────────────
    const conR = await consumeOtt('Email', ottEmail, ott, sess, hc);
    if (conR?.error) return { ok: false, code: conR.error.code, status: 400,
        message: `ConsumeOTT thất bại: code=${conR.error.code}` };
    log('[REG-HOTMAIL] ConsumeOTT Email OK', 'INFO');

    // ── Bước 6: CreateAccount ────────────────────────────────────────────────
    const car = await createAccount({ ...caOpts, verCode: ott, verSlt: '' }, sess, hc);
    if (!car?.error) {
        log(`[REG-HOTMAIL] ✅ tạo OK: ${finalEmail}`, 'INFO');
        return { ok: true, email: finalEmail, username: finalUsername };
    }

    const errCode  = String(car.error.code  || '');
    const errField = String(car.error.field || '');

    if (errCode === '1062' || errCode === '1043')
        return { ok: false, code: errCode, status: 409,
            message: `Email "${finalEmail}" đã được dùng. Thử lại.` };

    if (errCode === '1347')
        return { ok: false, code: '1347', status: 503, reason: 'RISK_BLOCKED',
            message: 'Microsoft chặn đăng ký do risk API (1347).' };

    if (['1040', '1041', '1042', '1059', '1346'].includes(errCode))
        return { ok: false, code: errCode, status: 400, reason: 'CAPTCHA_REQUIRED',
            message: `Microsoft yêu cầu giải captcha Arkose (code=${errCode}).` };

    // 1312 = MS yêu cầu số điện thoại (IP bị đánh dấu)
    if (errCode === '1312' && errField === 'phoneNumber') {
        return { ok: false, code: '1312', status: 503, need1312: true,
            email: finalEmail, username: finalUsername, sess,
            caOpts: { ...caOpts, verCode: ott, verSlt: '' } };
    }

    return { ok: false, code: errCode, status: 400,
        message: `Tạo tài khoản thất bại: code=${errCode} field=${errField}`,
        raw_error: car.error };
}

// ─── Route ───────────────────────────────────────────────────────────────────

module.exports = {
    name:    '/tools/reg/hotmail',
    methods: { get: handler, post: handler },
    params:  ['domain', 'first_name', 'last_name', 'birth_year', 'country', 'username'],
};

async function handler(req, res) {
    const log = require('../../utils/logger');

    const domain    = (req.query.domain     || req.body?.domain     || 'hotmail.com').toLowerCase().trim();
    const firstName =  req.query.first_name || req.body?.first_name || rndItem(FIRST);
    const lastName  =  req.query.last_name  || req.body?.last_name  || rndItem(LAST);
    const country   = (req.query.country    || req.body?.country    || 'US').toUpperCase();
    const customUsr =  req.query.username   || req.body?.username   || null;

    const birthYear  = parseInt(req.query.birth_year || req.body?.birth_year || rndInt(1988, 2000));
    const birthMonth = rndInt(1, 12);
    const birthDay   = rndInt(1, 28);

    const allowed = ['hotmail.com', 'outlook.com', 'live.com', 'msn.com'];
    if (!allowed.includes(domain)) {
        return res.status(400).json({ status: false,
            message: `Domain không hợp lệ. Dùng: ${allowed.join(', ')}` });
    }

    const username = customUsr || genUsername(firstName, lastName);
    const email    = `${username}@${domain}`;
    const password = genPassword();
    const regArgs  = { username, email, password, firstName, lastName,
                       birthDay, birthMonth, birthYear, country, domain, log };

    log(`[REG-HOTMAIL] bắt đầu: ${email}`, 'INFO');

    // ── Lấy proxy pool ────────────────────────────────────────────────────────
    const pool = global.proxyPool;
    const MAX_PROXY_TRIES = 5;

    // ── Helper xử lý kết quả doRegister ─────────────────────────────────────
    async function handleResult(r) {
        if (r.ok) {
            return res.json(buildSuccess(r.email, password, firstName, lastName,
                birthDay, birthMonth, birthYear, country, domain, r.username));
        }

        // 1312 → thử SMS (chỉ sau khi hết proxy)
        if (r.need1312) {
            log('[REG-HOTMAIL] 1312: thử SMS multi-source...', 'INFO');
            const smsResult = await trySmsVerification(r.email, r.sess, r.caOpts);
            if (smsResult.success) {
                log(`[REG-HOTMAIL] ✅ tạo OK qua SMS: ${r.email}`, 'INFO');
                return res.json(buildSuccess(r.email, password, firstName, lastName,
                    birthDay, birthMonth, birthYear, country, domain, r.username));
            }
            return res.status(503).json({
                status: false,
                message: 'Microsoft yêu cầu xác minh SĐT. IP server và tất cả proxy đều bị chặn SMS.',
                error_code: '1312', reason: 'IP_SMS_BLOCKED',
                tip: 'Dùng residential proxy để bypass.',
                numbers_tried: smsResult.numbers_tried,
                account_draft: {
                    email: r.email, password, firstName, lastName,
                    birthday: `${birthDay}/${birthMonth}/${birthYear}`, country,
                },
            });
        }

        return res.status(r.status || 400).json({ status: false,
            message: r.message, error_code: r.code,
            ...(r.reason ? { reason: r.reason } : {}),
            ...(r.raw_error ? { raw_error: r.raw_error } : {}) });
    }

    try {
        // ── Lần 1: Thử không proxy (direct) ─────────────────────────────────
        log('[REG-HOTMAIL] thử kết nối trực tiếp...', 'INFO');
        let saved1312 = null; // Lưu sess+caOpts từ lần 1312 đầu tiên để dùng cho SMS
        try {
            const r = await doRegister(regArgs, http);
            if (!r.need1312) return handleResult(r);
            // 1312: lưu lại để dùng SMS sau nếu proxy cũng thất bại
            saved1312 = r;
            log('[REG-HOTMAIL] 1312 direct → thử proxy pool...', 'INFO');
        } catch (e) {
            log(`[REG-HOTMAIL] direct thất bại: ${e.message.slice(0, 80)}`, 'WARN');
        }

        // ── Thử qua proxy pool — chỉ retry createAccount (~2s/proxy) ──────────
        // Dùng lại sess từ lần direct đã có OTT consumed → tránh OTT polling (~80s)
        if (saved1312 && pool && pool.getStats().total > 0) {
            const { sess: s1312, caOpts: ca1312 } = saved1312;
            const tried = new Set();
            for (let i = 0; i < MAX_PROXY_TRIES; i++) {
                const px = pool.pick(tried);
                if (!px) break;
                const pxKey = `${px.ip}:${px.port}`;
                tried.add(pxKey);
                log(`[REG-HOTMAIL] proxy #${i + 1} createAccount: ${pxKey}`, 'INFO');
                try {
                    const hc  = makeHttp(px);
                    // ca1312 đã chứa verCode (OTT email đã consume từ lần direct)
                    const car = await createAccount(ca1312, s1312, hc);
                    if (!car?.error) {
                        log(`[REG-HOTMAIL] ✅ proxy ${pxKey} bypass 1312!`, 'INFO');
                        return res.json(buildSuccess(
                            ca1312.email, password, firstName, lastName,
                            birthDay, birthMonth, birthYear, country, domain,
                            ca1312.email.split('@')[0]
                        ));
                    }
                    const ec = String(car.error.code || '');
                    if (ec === '1312') {
                        log(`[REG-HOTMAIL] proxy ${pxKey} cũng 1312`, 'WARN');
                        pool.markFail(px.ip, px.port);
                    } else if (['1040','1041','1042','1059','1346','1347'].includes(ec)) {
                        log(`[REG-HOTMAIL] proxy ${pxKey} captcha/risk (${ec})`, 'WARN');
                        pool.markFail(px.ip, px.port);
                    } else {
                        // Lỗi khác (session expire, etc) → bỏ qua proxy này
                        log(`[REG-HOTMAIL] proxy ${pxKey} err=${ec}`, 'WARN');
                    }
                } catch (e) {
                    log(`[REG-HOTMAIL] proxy ${pxKey} lỗi: ${e.message.slice(0, 60)}`, 'WARN');
                    pool.markFail(px.ip, px.port);
                }
            }
            log('[REG-HOTMAIL] hết proxy khả dụng, fallback SMS...', 'WARN');
        } else if (!saved1312) {
            log('[REG-HOTMAIL] direct fail hoàn toàn, fallback SMS...', 'WARN');
        } else {
            log('[REG-HOTMAIL] pool chưa sẵn sàng, fallback SMS...', 'WARN');
        }

        // ── Fallback cuối: SMS dùng sess+caOpts đã lưu từ lần 1312 trước ────
        // KHÔNG gọi lại doRegister nữa — tiết kiệm ~80s OTT polling
        if (saved1312) return handleResult(saved1312);

        // Trường hợp cực kỳ hiếm: direct bị lỗi kết nối, proxy cũng thất bại hết
        return res.status(503).json({ status: false,
            message: 'Không thể kết nối Microsoft. Thử lại sau.',
            error_code: 'CONNECT_FAILED' });

    } catch (e) {
        log(`[REG-HOTMAIL] lỗi: ${e.message}`, 'WARN');
        return res.status(500).json({ status: false, message: 'Lỗi kết nối: ' + e.message });
    }
}

function buildSuccess(email, password, firstName, lastName, bDay, bMonth, bYear, country, domain, username) {
    return {
        status:  true,
        message: 'Tạo tài khoản Microsoft thành công!',
        account: {
            email,
            password,
            username,
            firstName,
            lastName,
            birthday:  `${bDay}/${bMonth}/${bYear}`,
            country,
            domain,
            login_url: 'https://outlook.live.com/mail/',
        },
        creator: 'LauNa',
    };
}
