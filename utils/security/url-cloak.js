'use strict';

/**
 * URL cloak — che link upstream thật (HF Space, taoanhdep, pollinations, ...).
 *  encode(url)        -> token base64url (AES-256-GCM, có IV + tag)
 *  decode(token)      -> url gốc
 *  cloak(req, url)    -> "https://<host>/ai/media?id=<token>"
 *  sanitize(value)    -> deep-clone, thay mọi URL upstream nhạy cảm thành "[upstream]"
 *
 * Khoá AES được tạo ngẫu nhiên lần đầu rồi lưu vào data/.media-cloak-key
 * (hoặc lấy từ env MEDIA_CLOAK_KEY = hex 64 ký tự).
 */

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const KEY_FILE = path.join(process.cwd(), 'data', '.media-cloak-key');

function loadKey() {
    const env = process.env.MEDIA_CLOAK_KEY;
    if (env && /^[0-9a-f]{64}$/i.test(env)) return Buffer.from(env, 'hex');
    try {
        const txt = fs.readFileSync(KEY_FILE, 'utf8').trim();
        if (/^[0-9a-f]{64}$/i.test(txt)) return Buffer.from(txt, 'hex');
    } catch (_) {}
    const k = crypto.randomBytes(32);
    try {
        fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
        fs.writeFileSync(KEY_FILE, k.toString('hex'), { mode: 0o600 });
    } catch (_) {}
    return k;
}

const KEY = loadKey();

function encode(url) {
    if (!url) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const ct = Buffer.concat([cipher.update(String(url), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64url');
}

function decode(token) {
    const buf = Buffer.from(String(token || ''), 'base64url');
    if (buf.length < 28) throw new Error('Token quá ngắn');
    const iv  = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct  = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function publicBase(req) {
    try {
        const fwdProto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
        const proto    = fwdProto || req.protocol || 'https';
        const host     = req.headers['x-forwarded-host'] || req.get('host');
        return `${proto}://${host}`;
    } catch {
        return '';
    }
}

function cloak(req, url) {
    if (!url || typeof url !== 'string') return url;
    if (!/^https?:\/\//i.test(url)) return url;
    const tok = encode(url);
    return `${publicBase(req)}/ai/media?id=${tok}`;
}

function cloakArray(req, arr) {
    if (!Array.isArray(arr)) return arr;
    return arr.map(u => cloak(req, u));
}

/* ── sanitizer cho chuỗi / object ──────────────────────────────────────── */

const URL_PATTERNS = [
    /https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.hf\.space[^\s'"<>)]*/gi,
    /https?:\/\/(?:[a-z0-9-]+\.)*huggingface\.co[^\s'"<>)]*/gi,
    /https?:\/\/(?:[a-z0-9-]+\.)*taoanhdep\.com[^\s'"<>)]*/gi,
    /https?:\/\/(?:[a-z0-9-]+\.)*pollinations\.ai[^\s'"<>)]*/gi,
    /https?:\/\/generativelanguage\.googleapis\.com[^\s'"<>)]*/gi,
    /https?:\/\/(?:[a-z0-9-]+\.)*googleapis\.com[^\s'"<>)]*/gi,
    /https?:\/\/[a-z0-9-]+\.val\.run[^\s'"<>)]*/gi,
];

const KEYWORD_MAP = [
    [/\bhuggingface\.co\b/gi, '[upstream]'],
    [/\b[a-z0-9-]+\.hf\.space\b/gi, '[upstream]'],
    [/\bapi\.taoanhdep\.com\b/gi, '[upstream]'],
    [/\btaoanhdep\.com\b/gi, '[upstream]'],
    [/\bpollinations\.ai\b/gi, '[upstream]'],
    [/\bgenerativelanguage\.googleapis\.com\b/gi, '[upstream]'],
];

function sanitizeString(s) {
    if (typeof s !== 'string' || !s) return s;
    let out = s;
    for (const re of URL_PATTERNS)  out = out.replace(re, '[upstream]');
    for (const [re, rep] of KEYWORD_MAP) out = out.replace(re, rep);
    return out;
}

function sanitize(v) {
    if (v == null) return v;
    if (typeof v === 'string') return sanitizeString(v);
    if (Array.isArray(v)) return v.map(sanitize);
    if (typeof v === 'object') {
        const o = {};
        for (const k of Object.keys(v)) o[k] = sanitize(v[k]);
        return o;
    }
    return v;
}

/* ── neutralize transport / provider strings ───────────────────────────── */

function neutralTransport(t) {
    if (!t) return t;
    const s = String(t).toLowerCase();
    if (s === 'direct')    return 'primary';
    if (s === 'hf-pool')   return 'pool';
    if (s === 'taoanhdep') return 'backup';
    return 'primary';
}

function neutralProvider(p) {
    if (!p) return p;
    const s = String(p).toLowerCase();
    if (s === 'gradio')     return 'primary';
    if (s === 'taoanhdep')  return 'backup';
    if (s === 'pollinations' || /pollinations/i.test(s)) return 'primary';
    return 'primary';
}

module.exports = {
    encode, decode,
    cloak, cloakArray,
    sanitize, sanitizeString,
    neutralTransport, neutralProvider,
    publicBase,
};
