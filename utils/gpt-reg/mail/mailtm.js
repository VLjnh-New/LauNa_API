'use strict';

const https  = require('https');
const BASE    = 'api.mail.tm';
const OTP_RE  = /(?<!\d)(\d{6})(?!\d)/;

function apiReq(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const body = data ? JSON.stringify(data) : null;
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        if (body)  headers['Content-Length'] = Buffer.byteLength(body);
        const req = https.request({
            hostname: BASE, port: 443, path, method, headers,
            rejectUnauthorized: false, timeout: 20000,
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); } catch { resolve({ status: res.statusCode, data: raw }); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('mail.tm timeout')); });
        if (body) req.write(body);
        req.end();
    });
}

let _domain = null, _domainAt = 0;
async function getDomain() {
    if (_domain && Date.now() - _domainAt < 300_000) return _domain;
    const r = await apiReq('GET', '/domains?page=1');
    const members = Array.isArray(r.data) ? r.data : (r.data?.['hydra:member'] || []);
    const active = members.filter(d => d.isActive && !d.isPrivate);
    if (!active.length) throw new Error('mail.tm: không có domain');
    _domain = active[Math.floor(Math.random() * active.length)].domain;
    _domainAt = Date.now();
    return _domain;
}

function randAlpha(n) {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

class MailTmService {
    constructor() { this._accounts = new Map(); }
    async testConnection() { await getDomain(); return true; }
    async createEmail() {
        const domain = await getDomain();
        const login = randAlpha(12);
        const address = `${login}@${domain}`;
        const password = randAlpha(16) + 'A1!';
        const r = await apiReq('POST', '/accounts', { address, password });
        if (!r.data?.id) throw new Error(`mail.tm: tạo lỗi: ${JSON.stringify(r.data).slice(0, 100)}`);
        const tok = await apiReq('POST', '/token', { address, password });
        if (!tok.data?.token) throw new Error('mail.tm: lấy token lỗi');
        this._accounts.set(address, { token: tok.data.token, seenIds: new Set() });
        return { email: address, mailToken: `mailtm:${address}` };
    }
    async getVerificationCode(email, { timeout = 120 } = {}) {
        const acc = this._accounts.get(email);
        if (!acc) throw new Error(`mail.tm: không có account ${email}`);
        const deadline = Date.now() + timeout * 1000;
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 4000));
            try {
                const r = await apiReq('GET', '/messages?page=1', null, acc.token);
                const msgs = r.data?.['hydra:member'] || [];
                for (const msg of msgs) {
                    const id = msg.id || msg['@id'];
                    if (!id || acc.seenIds.has(id)) continue;
                    acc.seenIds.add(id);
                    let m = OTP_RE.exec(msg.subject || '');
                    if (m) return m[1];
                    const full = await apiReq('GET', `/messages/${id.replace(/.*\/messages\//, '')}`, null, acc.token);
                    const text = (full.data?.text || '') + ' ' + (full.data?.html || '').replace(/<[^>]+>/g, ' ');
                    m = OTP_RE.exec(text);
                    if (m) return m[1];
                }
            } catch (_) {}
        }
        return null;
    }
}

module.exports = { MailTmService };
