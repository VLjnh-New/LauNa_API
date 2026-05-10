'use strict';

const https = require('https');

const BASE   = 'smvmail.com';
const OTP_RE = /(?<!\d)(\d{6})(?!\d)/;

function randAlpha(n) {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length: n }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function apiGet(path) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: BASE, port: 443, path, method: 'GET',
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
            rejectUnauthorized: false, timeout: 15000,
        }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => {
                try { resolve(JSON.parse(raw)); }
                catch { resolve({}); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('smvmail timeout')); });
        req.end();
    });
}

class SmvmailService {
    constructor() { this._seenIds = new Map(); }

    async testConnection() {
        const d = await apiGet('/api/email?email=test@smvmail.com&page=1');
        return d?.status === true;
    }

    async createEmail() {
        const local = 'gpt' + randAlpha(10);
        const email = `${local}@smvmail.com`;
        this._seenIds.set(email, new Set());
        return { email, mailToken: `smvmail:${email}` };
    }

    async getVerificationCode(email, { timeout = 120 } = {}) {
        const seenIds = this._seenIds.get(email) || new Set();
        this._seenIds.set(email, seenIds);
        const deadline = Date.now() + timeout * 1000;

        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, 5000));
            try {
                const data = await apiGet(`/api/email?email=${encodeURIComponent(email)}&page=1`);
                const docs = data?.data?.docs || [];
                for (const msg of docs) {
                    const id = String(msg._id || msg.id || '');
                    if (!id || seenIds.has(id)) continue;
                    seenIds.add(id);

                    const from = (msg.from || '').toLowerCase();
                    const subj = (msg.subject || '').toLowerCase();
                    const isOai = from.includes('openai') || subj.includes('openai')
                        || subj.includes('verify') || subj.includes('confirm')
                        || subj.includes('chatgpt');

                    if (!isOai) continue;

                    let m = OTP_RE.exec(msg.subject || '');
                    if (m) return m[1];

                    const body = (msg.text || '') + ' ' + (msg.html || '').replace(/<[^>]+>/g, ' ');
                    m = OTP_RE.exec(body);
                    if (m) return m[1];
                }
            } catch (_) {}
        }
        return null;
    }
}

module.exports = { SmvmailService };
