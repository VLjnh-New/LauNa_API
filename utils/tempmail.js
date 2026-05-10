'use strict';

const axios = require('axios');
const { randomBytes } = require('crypto');
const { namespace } = require('./data/cache');
const db = require('./data/db');

const API = 'https://api.mail.tm';
const TTL_MS = 10 * 60_000;

const cache = namespace('tempmail', { max: 500, ttl: TTL_MS });

const http = axios.create({ baseURL: API, timeout: 20_000, headers: { 'Accept': 'application/json' } });

function rand(n = 10) {
    return randomBytes(n).toString('base64url').replace(/[-_]/g, '').slice(0, n).toLowerCase();
}

async function getDomain() {
    const { data } = await http.get('/domains?page=1');
    const list = data['hydra:member'] || data || [];
    const active = list.find(d => d.isActive !== false) || list[0];
    if (!active) throw new Error('Không lấy được domain mail.tm');
    return active.domain;
}

async function createInbox() {
    const domain = await getDomain();
    const local = 'lna' + rand(10);
    const address = `${local}@${domain}`;
    const password = rand(16) + 'A1!';

    const acc = await http.post('/accounts', { address, password });
    const tok = await http.post('/token', { address, password });

    const record = {
        email: address,
        password,
        token: tok.data.token,
        accountId: acc.data.id,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    };

    cache.set(address, record);

    if (db.isEnabled()) {
        try {
            await db.query(
                `INSERT INTO tempmail_inboxes(email, password, token, account_id, expires_at)
                 VALUES ($1,$2,$3,$4, NOW() + INTERVAL '10 minutes')
                 ON CONFLICT (email) DO UPDATE SET token=EXCLUDED.token, expires_at=EXCLUDED.expires_at`,
                [record.email, record.password, record.token, record.accountId]
            );
        } catch (_) {}
    }

    return record;
}

async function loadInbox(email) {
    const c = cache.get(email);
    if (c) return c;

    if (!db.isEnabled()) return null;
    try {
        const r = await db.query(
            `SELECT email, password, token, account_id AS "accountId",
                    created_at AS "createdAt", expires_at AS "expiresAt"
             FROM tempmail_inboxes
             WHERE email=$1 AND expires_at > NOW()`,
            [email]
        );
        if (!r.rows[0]) return null;
        cache.set(email, r.rows[0]);
        return r.rows[0];
    } catch {
        return null;
    }
}

async function destroyInbox(email) {
    const inbox = await loadInbox(email);
    cache.delete(email);
    if (db.isEnabled()) {
        try { await db.query('DELETE FROM tempmail_inboxes WHERE email=$1', [email]); } catch (_) {}
    }
    if (inbox?.token && inbox?.accountId) {
        try {
            await http.delete(`/accounts/${inbox.accountId}`, {
                headers: { Authorization: `Bearer ${inbox.token}` },
            });
        } catch (_) {}
    }
    return !!inbox;
}

async function listMessages(email) {
    const inbox = await loadInbox(email);
    if (!inbox) throw new Error('Hộp thư không tồn tại hoặc đã hết hạn');
    const { data } = await http.get('/messages?page=1', {
        headers: { Authorization: `Bearer ${inbox.token}` },
    });
    const items = (data['hydra:member'] || []).map(m => ({
        id: m.id,
        from: m.from,
        subject: m.subject,
        intro: m.intro,
        seen: m.seen,
        hasAttachments: m.hasAttachments,
        size: m.size,
        createdAt: m.createdAt,
    }));
    return { email: inbox.email, expiresAt: inbox.expiresAt, total: items.length, items };
}

async function readMessage(email, id) {
    const inbox = await loadInbox(email);
    if (!inbox) throw new Error('Hộp thư không tồn tại hoặc đã hết hạn');
    const { data } = await http.get(`/messages/${id}`, {
        headers: { Authorization: `Bearer ${inbox.token}` },
    });
    return {
        id: data.id,
        from: data.from,
        to: data.to,
        subject: data.subject,
        text: data.text,
        html: data.html,
        attachments: data.attachments,
        createdAt: data.createdAt,
    };
}

async function purgeExpired() {
    if (!db.isEnabled()) return 0;
    try {
        const r = await db.query('DELETE FROM tempmail_inboxes WHERE expires_at <= NOW() RETURNING email');
        return r.rowCount || 0;
    } catch {
        return 0;
    }
}

setInterval(() => { purgeExpired().catch(() => {}); }, 60_000).unref?.();

module.exports = {
    createInbox,
    loadInbox,
    destroyInbox,
    listMessages,
    readMessage,
    purgeExpired,
    TTL_MS,
};
