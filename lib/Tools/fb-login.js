'use strict';

/**
 * Facebook Login (FB4A) - chuyển từ script Python.
 *
 *   POST /tools/fb-login
 *   Body JSON:
 *     {
 *       "uid_phone_mail": "100000xxxxxxxxx" | "email@x.com" | "+84xxxxxxxxx",
 *       "password": "<plain hoặc đã #PWD_FB4A:...>",
 *       "twwwoo2fa": "<2FA secret base32>"   (optional),
 *       "machine_id": "<24 ký tự>"           (optional, nếu báo sai mật khẩu thì lấy 'datr' của cookie acc đó),
 *       "convert_token_to": "FB_LITE" | ["FB_LITE","MESSENGER_ANDROID",...]  (optional),
 *       "convert_all_tokens": true|false     (optional)
 *     }
 *
 *   GET  /tools/fb-login   → trả ví dụ + danh sách app key hỗ trợ.
 *
 * Trả về:
 *   {
 *     status: true,
 *     original_token: { token_prefix, access_token },
 *     cookies: { dict, string },
 *     converted_tokens: { FB_LITE: {...}, ... }   (nếu có)
 *   }
 */

const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { TOTP } = require('totp-generator');

// ─── Constants ────────────────────────────────────────────────────────────────

const API_URL      = 'https://b-graph.facebook.com/auth/login';
const ACCESS_TOKEN = '350685531728|62f8ce9f74b12f84c123cc23437a4a32';
const API_KEY      = '882a8490361da98702bf97a021ddc14d';
const SIG          = '214049b9f17c38bd767de53752b53946';
const PWD_FETCH_TOKEN = '438142079694454|fc0a7caa49b192f64f6f5a6d9643bb28';

const APPS = {
    FB_ANDROID:           { name: 'Facebook For Android',           app_id: '350685531728'    },
    MESSENGER_ANDROID:    { name: 'Facebook Messenger For Android', app_id: '256002347743983' },
    FB_LITE:              { name: 'Facebook For Lite',              app_id: '275254692598279' },
    MESSENGER_LITE:       { name: 'Facebook Messenger For Lite',    app_id: '200424423651082' },
    ADS_MANAGER_ANDROID:  { name: 'Ads Manager App For Android',    app_id: '438142079694454' },
    PAGES_MANAGER_ANDROID:{ name: 'Pages Manager For Android',      app_id: '121876164619130' }
};

const BASE_HEADERS = {
    'content-type':              'application/x-www-form-urlencoded',
    'x-fb-net-hni':              '45201',
    'zero-rated':                '0',
    'x-fb-sim-hni':              '45201',
    'x-fb-connection-quality':   'EXCELLENT',
    'x-fb-friendly-name':        'authenticate',
    'x-fb-connection-bandwidth': '78032897',
    'x-tigon-is-retry':          'False',
    'authorization':             'OAuth null',
    'x-fb-connection-type':      'WIFI',
    'x-fb-device-group':         '3342',
    'priority':                  'u=3,i',
    'x-fb-http-engine':          'Liger',
    'x-fb-client-ip':            'True',
    'x-fb-server-cluster':       'True',
    'x-fb-request-analytics-tags': '{"network_tags":{"product":"350685531728","retry_attempt":"0"},"application_tags":"unknown"}',
    'user-agent': 'Dalvik/2.1.0 (Linux; U; Android 9; 23113RKC6C Build/PQ3A.190705.08211809) [FBAN/FB4A;FBAV/417.0.0.33.65;FBPN/com.facebook.katana;FBLC/vi_VN;FBBV/480086274;FBCR/MobiFone;FBMF/Redmi;FBBD/Redmi;FBDV/23113RKC6C;FBSV/9;FBCA/x86:armeabi-v7a;FBDM/{density=1.5,width=1280,height=720};FB_FW/1;FBRV/0;]'
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randDigits(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
    return s;
}

function randAlnum(n) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    const buf = crypto.randomBytes(n);
    for (let i = 0; i < n; i++) s += chars[buf[i] % chars.length];
    return s;
}

function extractTokenPrefix(token) {
    if (!token) return '';
    for (let i = 0; i < token.length; i++) {
        const c = token[i];
        if (c >= 'a' && c <= 'z') return token.slice(0, i);
    }
    return token;
}

function pemFromKey(key) {
    if (typeof key !== 'string') return key;
    if (key.includes('-----BEGIN')) return key;
    const body = key.replace(/\s+/g, '').match(/.{1,64}/g).join('\n');
    return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

// ─── Password encryption (FB PWD_FB4A) ────────────────────────────────────────

async function getPublicKey() {
    const url = 'https://b-graph.facebook.com/pwd_key_fetch';
    const params = {
        version: '2',
        flow: 'CONTROLLER_INITIALIZATION',
        method: 'GET',
        fb_api_req_friendly_name: 'pwdKeyFetch',
        fb_api_caller_class: 'com.facebook.auth.login.AuthOperations',
        access_token: PWD_FETCH_TOKEN
    };
    const { data } = await axios.post(url, null, { params, timeout: 20_000 });
    return {
        public_key: data && data.public_key,
        key_id: String((data && data.key_id) || '25')
    };
}

async function encryptPassword(password, publicKey, keyId) {
    if (!publicKey) {
        const k = await getPublicKey();
        publicKey = k.public_key;
        keyId = k.key_id;
    }
    if (!publicKey) throw new Error('Không lấy được public key từ FB');

    const randKey = crypto.randomBytes(32);
    const iv      = crypto.randomBytes(12);
    const currentTime = Math.floor(Date.now() / 1000);

    const encryptedRandKey = crypto.publicEncrypt(
        { key: pemFromKey(publicKey), padding: crypto.constants.RSA_PKCS1_PADDING },
        randKey
    );

    const cipher = crypto.createCipheriv('aes-256-gcm', randKey, iv);
    cipher.setAAD(Buffer.from(String(currentTime), 'utf8'));
    const enc1 = cipher.update(password, 'utf8');
    const enc2 = cipher.final();
    const encryptedPasswd = Buffer.concat([enc1, enc2]);
    const authTag = cipher.getAuthTag();

    const lenBuf = Buffer.alloc(2);
    lenBuf.writeInt16LE(encryptedRandKey.length, 0);

    const buf = Buffer.concat([
        Buffer.from([1, parseInt(keyId, 10)]),
        iv,
        lenBuf,
        encryptedRandKey,
        authTag,
        encryptedPasswd
    ]);

    const encoded = buf.toString('base64');
    return `#PWD_FB4A:2:${currentTime}:${encoded}`;
}

// ─── Token conversion (auth.getSessionforApp) ────────────────────────────────

async function convertToken(accessToken, targetApp) {
    const app = APPS[targetApp];
    if (!app) return null;
    try {
        const { data } = await axios.post(
            'https://api.facebook.com/method/auth.getSessionforApp',
            new URLSearchParams({
                access_token: accessToken,
                format: 'json',
                new_app_id: app.app_id,
                generate_session_cookies: '1'
            }).toString(),
            {
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                timeout: 20_000,
                validateStatus: () => true
            }
        );

        if (!data || !data.access_token) return null;

        const cookiesDict = {};
        let cookiesString = '';
        if (Array.isArray(data.session_cookies)) {
            for (const c of data.session_cookies) {
                cookiesDict[c.name] = c.value;
                cookiesString += `${c.name}=${c.value}; `;
            }
        }

        return {
            token_prefix: extractTokenPrefix(data.access_token),
            access_token: data.access_token,
            cookies: { dict: cookiesDict, string: cookiesString.replace(/; $/, '') }
        };
    } catch {
        return null;
    }
}

// ─── Build request body ──────────────────────────────────────────────────────

function buildBody(ctx) {
    const params = new URLSearchParams();
    const fields = {
        format: 'json',
        email: ctx.uid_phone_mail,
        password: ctx.password,
        credentials_type: 'password',
        generate_session_cookies: '1',
        locale: 'vi_VN',
        client_country_code: 'VN',
        api_key: API_KEY,
        access_token: ACCESS_TOKEN,
        adid: ctx.adid,
        device_id: ctx.device_id,
        generate_analytics_claim: '1',
        community_id: '',
        linked_guest_account_userid: '',
        cpl: 'true',
        try_num: '1',
        family_device_id: ctx.device_id,
        secure_family_device_id: ctx.secure_family_device_id,
        sim_serials: `["${ctx.sim_serial}"]`,
        openid_flow: 'android_login',
        openid_provider: 'google',
        openid_tokens: '[]',
        account_switcher_uids: `["${ctx.uid_phone_mail}"]`,
        fb4a_shared_phone_cpl_experiment: 'fb4a_shared_phone_nonce_cpl_at_risk_v3',
        fb4a_shared_phone_cpl_group: 'enable_v3_at_risk',
        enroll_misauth: 'false',
        error_detail_type: 'button_with_disabled',
        source: 'login',
        machine_id: ctx.machine_id,
        jazoest: ctx.jazoest,
        meta_inf_fbmeta: 'V2_UNTAGGED',
        advertiser_id: ctx.adid,
        encrypted_msisdn: '',
        currently_logged_in_userid: '0',
        fb_api_req_friendly_name: 'authenticate',
        fb_api_caller_class: 'Fb4aAuthHandler',
        sig: SIG
    };
    for (const [k, v] of Object.entries(fields)) params.append(k, v);
    return params.toString();
}

// ─── Response parsing ────────────────────────────────────────────────────────

async function parseSuccess(json, convertList) {
    const originalToken = json.access_token;
    const originalPrefix = extractTokenPrefix(originalToken);

    const result = {
        status: true,
        original_token: {
            token_prefix: originalPrefix,
            access_token: originalToken
        },
        cookies: {}
    };

    if (Array.isArray(json.session_cookies)) {
        const cookiesDict = {};
        let cookiesString = '';
        for (const c of json.session_cookies) {
            cookiesDict[c.name] = c.value;
            cookiesString += `${c.name}=${c.value}; `;
        }
        result.cookies = { dict: cookiesDict, string: cookiesString.replace(/; $/, '') };
    }

    if (convertList && convertList.length) {
        result.converted_tokens = {};
        for (const target of convertList) {
            const conv = await convertToken(originalToken, target);
            if (conv) result.converted_tokens[target] = conv;
        }
    }

    return result;
}

async function handle2FA(errorData, ctx, convertList) {
    if (!ctx.twwwoo2fa) {
        return { status: false, error: 'Cần mã 2FA nhưng chưa được cung cấp' };
    }

    let twofactor_code;
    try {
        const secret = String(ctx.twwwoo2fa).replace(/\s+/g, '');
        const gen = await TOTP.generate(secret);
        twofactor_code = gen.otp;
    } catch (e) {
        const log = require('../../utils/logger');
        log(`[FB-LOGIN] 2FA lỗi: ${e.message}`, 'WARN');
        return { status: false, error: 'Lỗi tạo mã 2FA' };
    }

    const data = new URLSearchParams({
        locale: 'vi_VN',
        format: 'json',
        email: ctx.uid_phone_mail,
        device_id: ctx.device_id,
        access_token: ACCESS_TOKEN,
        generate_session_cookies: 'true',
        generate_machine_id: '1',
        twofactor_code,
        credentials_type: 'two_factor',
        error_detail_type: 'button_with_disabled',
        first_factor: errorData.login_first_factor,
        password: ctx.password,
        userid: String(errorData.uid),
        machine_id: errorData.login_first_factor
    }).toString();

    const { data: json } = await axios.post(API_URL, data, {
        headers: BASE_HEADERS,
        timeout: 30_000,
        validateStatus: () => true
    });

    if (json && json.access_token) {
        return await parseSuccess(json, convertList);
    }
    if (json && json.error) {
        return { status: false, error: json.error.message || 'Unknown error' };
    }
    return { status: false, error: 'Phản hồi 2FA không hợp lệ' };
}

// ─── Core login ──────────────────────────────────────────────────────────────

async function login(opts) {
    const uid_phone_mail = String(opts.uid_phone_mail || '').trim();
    const rawPassword    = String(opts.password || '');
    const twwwoo2fa      = String(opts.twwwoo2fa || '').replace(/\s+/g, '');
    const machine_id     = opts.machine_id || randAlnum(24);

    let convertList = [];
    if (opts.convert_all_tokens) {
        convertList = Object.keys(APPS);
    } else if (opts.convert_token_to) {
        convertList = Array.isArray(opts.convert_token_to)
            ? opts.convert_token_to
            : [opts.convert_token_to];
        convertList = convertList.filter(k => APPS[k]);
    }

    if (!uid_phone_mail) return { status: false, error: 'Thiếu uid_phone_mail' };
    if (!rawPassword)    return { status: false, error: 'Thiếu password' };

    const password = rawPassword.startsWith('#PWD_FB4A')
        ? rawPassword
        : await encryptPassword(rawPassword);

    const ctx = {
        uid_phone_mail,
        password,
        twwwoo2fa,
        device_id: uuidv4(),
        adid: uuidv4(),
        secure_family_device_id: uuidv4(),
        machine_id,
        jazoest: randDigits(5),
        sim_serial: randDigits(20)
    };

    const body = buildBody(ctx);

    let json;
    try {
        const resp = await axios.post(API_URL, body, {
            headers: BASE_HEADERS,
            timeout: 30_000,
            validateStatus: () => true
        });
        if (typeof resp.data === 'string') {
            try { json = JSON.parse(resp.data); }
            catch { return { status: false, error: 'Response không phải JSON hợp lệ' }; }
        } else {
            json = resp.data;
        }
    } catch (e) {
        const log = require('../../utils/logger');
        log(`[FB-LOGIN] API call lỗi: ${e.message}`, 'WARN');
        return { status: false, error: 'Lỗi gọi Facebook API' };
    }

    if (json && json.access_token) {
        return await parseSuccess(json, convertList);
    }

    if (json && json.error) {
        const errorData = (json.error.error_data) || {};
        if (errorData.login_first_factor && errorData.uid) {
            return await handle2FA(errorData, ctx, convertList);
        }
        return {
            status: false,
            error: json.error.message || 'Unknown error',
            error_user_msg: json.error.error_user_msg
        };
    }

    return { status: false, error: 'Unknown response format' };
}

// ─── Route export ────────────────────────────────────────────────────────────

const HELP = {
    status: true,
    name: '/tools/fb-login',
    method: 'POST',
    body_example: {
        uid_phone_mail: '100000xxxxxxxxx',
        password: '<plain text mật khẩu>',
        twwwoo2fa: '<base32 2FA secret>  (optional)',
        machine_id: '<24 ký tự>           (optional)',
        convert_token_to: 'FB_LITE',
        convert_all_tokens: false
    },
    supported_apps: Object.fromEntries(
        Object.entries(APPS).map(([k, v]) => [k, v.name])
    ),
    note: 'Nếu báo sai mật khẩu, lấy giá trị "datr" trong cookie tài khoản đó gán vào machine_id.'
};

module.exports = {
    name: '/tools/fb-login',
    methods: {
        get: (req, res) => res.json(HELP),
        post: async (req, res) => {
            try {
                const result = await login(req.body || {});
                if (result.status) return res.json(result);
                return res.status(400).json(result);
            } catch (e) {
                const log = require('../../utils/logger');
                log(`[FB-LOGIN] lỗi: ${e.message}`, 'WARN');
                return res.status(500).json({ status: false, error: 'Lỗi đăng nhập Facebook' });
            }
        }
    }
};
