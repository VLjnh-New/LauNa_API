'use strict';

const axios = require('axios');
const { namespace } = require('./data/cache');

const BASE = 'https://www.emailnator.com';
const TTL_MS = 10 * 60_000;

const cache = namespace('emailnator', { max: 500, ttl: TTL_MS });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function getSession() {
    const res = await axios.get(BASE, {
        timeout: 15_000,
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        },
        maxRedirects: 5,
    });

    const setCookies = res.headers['set-cookie'] || [];
    let xsrfRaw = '';
    let session = '';

    for (const cookie of setCookies) {
        const kv = cookie.split(';')[0];
        const eqIdx = kv.indexOf('=');
        if (eqIdx === -1) continue;
        const name = kv.slice(0, eqIdx).trim();
        const value = kv.slice(eqIdx + 1).trim();
        if (name === 'XSRF-TOKEN') xsrfRaw = value;
        else if (name === 'gmailnator_session') session = value;
    }

    if (!xsrfRaw || !session) throw new Error('Emailnator: không lấy được session cookie');

    const xsrfDecoded = decodeURIComponent(xsrfRaw);
    return { xsrfRaw, xsrfDecoded, session };
}

function buildClient(sess) {
    const cookieStr = `XSRF-TOKEN=${sess.xsrfRaw}; gmailnator_session=${sess.session}`;
    return axios.create({
        baseURL: BASE,
        timeout: 20_000,
        headers: {
            'User-Agent': UA,
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': BASE + '/',
            'Origin': BASE,
            'X-XSRF-TOKEN': sess.xsrfDecoded,
            'Cookie': cookieStr,
        },
    });
}

/**
 * type: mảng gồm các giá trị trong ["domain","plusGmail","dotGmail","googleMail"]
 */
async function createInbox(types) {
    const emailTypes = Array.isArray(types) && types.length > 0
        ? types
        : ['domain'];

    const sess = await getSession();
    const http = buildClient(sess);

    const { data } = await http.post('/generate-email', { email: emailTypes });
    const email = data.email?.[0];
    if (!email) throw new Error('Emailnator: server không trả về địa chỉ email');

    const record = {
        email,
        sess,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    };

    cache.set(email, record);
    return record;
}

async function loadInbox(email) {
    return cache.get(email) || null;
}

async function listMessages(email) {
    const inbox = await loadInbox(email);
    if (!inbox) throw new Error('Hộp thư không tồn tại hoặc đã hết hạn');

    const http = buildClient(inbox.sess);
    const { data } = await http.post('/message-list', { email });

    const items = (data.messageData || [])
        .filter(m => m.messageID !== 'ADSVPN')
        .map(m => ({
            id: m.messageID,
            from: m.from,
            subject: m.subject,
            time: m.time,
        }));

    return { email: inbox.email, expiresAt: inbox.expiresAt, total: items.length, items };
}

async function readMessage(email, messageID) {
    const inbox = await loadInbox(email);
    if (!inbox) throw new Error('Hộp thư không tồn tại hoặc đã hết hạn');

    const http = buildClient(inbox.sess);
    const { data } = await http.post('/message-list', { email, messageID });

    if (typeof data === 'string') {
        return { id: messageID, html: data };
    }
    return { id: messageID, ...data };
}

module.exports = {
    createInbox,
    loadInbox,
    listMessages,
    readMessage,
    TTL_MS,
};
