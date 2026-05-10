'use strict';

const https = require('https');
const http  = require('http');
const net   = require('net');
const zlib  = require('zlib');
const { URL } = require('url');
const { USER_AGENT } = require('./sentinel');

// Firefox 120 TLS profile — matches cipher suite and curve order
const FF_TLS = {
    ciphers: [
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
        'AES128-GCM-SHA256',
        'AES256-GCM-SHA384',
        'AES128-SHA256',
        'AES256-SHA256',
    ].join(':'),
    ecdhCurve:        'X25519:P-256:P-384:P-521',
    minVersion:       'TLSv1.2',
    maxVersion:       'TLSv1.3',
    honorCipherOrder: false,
    rejectUnauthorized: false,
};

const BASE_HEADERS = {
    'User-Agent':       USER_AGENT,
    'Accept':           'application/json, text/javascript, */*; q=0.01',
    'Accept-Language':  'en-US,en;q=0.5',
    'Accept-Encoding':  'gzip, deflate, br',
    'Connection':       'keep-alive',
    'Sec-Fetch-Dest':   'empty',
    'Sec-Fetch-Mode':   'cors',
    'Sec-Fetch-Site':   'same-origin',
};

function decompress(buf, enc) {
    enc = (enc || '').toLowerCase();
    try {
        if (enc === 'gzip')    return zlib.gunzipSync(buf).toString('utf8');
        if (enc === 'deflate') return zlib.inflateSync(buf).toString('utf8');
        if (enc === 'br')      return zlib.brotliDecompressSync(buf).toString('utf8');
    } catch {}
    return buf.toString('utf8');
}

class CookieJar {
    constructor() { this._store = new Map(); }

    set(name, value, domain = '', path = '/') {
        this._store.set(`${name}@${domain}${path}`, { name, value, domain: domain.replace(/^\./, ''), path });
    }

    setCookies(headers, urlObj) {
        const list = Array.isArray(headers) ? headers : (headers ? [headers] : []);
        for (const h of list) {
            if (!h) continue;
            const parts = h.split(';');
            const [rawName, ...rest] = (parts[0] || '').split('=');
            const name  = rawName.trim();
            const value = rest.join('=').trim();
            if (!name) continue;
            let domain = urlObj.hostname, path = '/';
            for (let i = 1; i < parts.length; i++) {
                const a = parts[i].trim();
                if (/^domain=/i.test(a)) domain = a.slice(7).trim().replace(/^\./, '');
                if (/^path=/i.test(a))   path   = a.slice(5).trim();
            }
            this._store.set(`${name}@${domain}${path}`, { name, value, domain, path });
        }
    }

    get(name) {
        for (const [, c] of this._store) if (c.name === name) return c.value;
        return null;
    }

    header(urlObj) {
        const host = urlObj.hostname, path = urlObj.pathname || '/';
        const pairs = [];
        for (const [, c] of this._store) {
            const cd = (c.domain || '').replace(/^\./, '');
            if (cd && host !== cd && !host.endsWith('.' + cd)) continue;
            if (path !== c.path && !path.startsWith(c.path === '/' ? '/' : c.path + '/')) continue;
            pairs.push(`${c.name}=${c.value}`);
        }
        return pairs.join('; ');
    }
}

function parseProxy(proxyStr) {
    if (!proxyStr) return null;
    try {
        const url = proxyStr.includes('://') ? proxyStr : 'http://' + proxyStr;
        const u   = new URL(url);
        // URL.port returns '' for default ports (80→http, 443→https), so extract from raw string
        let port;
        if (u.port) {
            port = parseInt(u.port);
        } else {
            const hostPart = url.replace(/^[a-z]+:\/\/(?:[^@]*@)?/, '');
            const m = hostPart.match(/:(\d+)(?:[/?#]|$)/);
            port = m ? parseInt(m[1]) : (u.protocol === 'https:' ? 443 : 8080);
        }
        return {
            host:     u.hostname,
            port,
            protocol: u.protocol.replace(':', ''),
            auth:     u.username ? `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}` : null,
        };
    } catch { return null; }
}

function connectThroughProxy(proxy, targetHost, targetPort, timeout) {
    return new Promise((resolve, reject) => {
        const sock = net.createConnection({ host: proxy.host, port: proxy.port }, () => {
            let connectLine = `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n`;
            if (proxy.auth) connectLine += `Proxy-Authorization: Basic ${Buffer.from(proxy.auth).toString('base64')}\r\n`;
            connectLine += '\r\n';
            sock.write(connectLine);
        });
        let buf = '';
        const t = setTimeout(() => { sock.destroy(); reject(new Error('Proxy CONNECT timeout')); }, timeout || 20000);
        sock.on('data', chunk => {
            buf += chunk.toString('binary');
            if (buf.includes('\r\n\r\n')) {
                clearTimeout(t);
                sock.removeAllListeners('data');
                const statusLine = buf.split('\r\n')[0];
                if (/HTTP\/[\d.]+ 200/.test(statusLine)) {
                    resolve(sock);
                } else {
                    sock.destroy();
                    reject(new Error(`Proxy CONNECT rejected: ${statusLine}`));
                }
            }
        });
        sock.on('error', e => { clearTimeout(t); reject(e); });
        sock.on('timeout', () => { clearTimeout(t); sock.destroy(); reject(new Error('Proxy connection timeout')); });
    });
}

class HttpSession {
    constructor({ timeout = 35000, proxy = null } = {}) {
        this.timeout = timeout;
        this.cookies = new CookieJar();
        this._proxy  = parseProxy(proxy);
    }

    async request(method, urlStr, { headers: extra = {}, data = null, json = null, allowRedirects = true, maxRedirects = 12, timeout } = {}) {
        const ms = timeout || this.timeout;
        let body = null;
        const eh = { ...extra };
        if (json !== null && json !== undefined) {
            body = JSON.stringify(json);
            eh['Content-Type'] = eh['Content-Type'] || 'application/json';
        } else if (data !== null && data !== undefined) {
            body = typeof data === 'string' ? data : JSON.stringify(data);
        }

        let current = urlStr, redirects = 0, currentMethod = method;
        while (true) {
            const urlObj   = new URL(current);
            const isHttps  = urlObj.protocol === 'https:';
            const cookie   = this.cookies.header(urlObj);
            const reqH     = { ...BASE_HEADERS, ...eh };
            if (cookie) reqH['Cookie'] = cookie;
            if (body)   reqH['Content-Length'] = Buffer.byteLength(body);

            const res = await new Promise(async (resolve, reject) => {
                const targetHost = urlObj.hostname;
                const targetPort = parseInt(urlObj.port) || (isHttps ? 443 : 80);
                const reqPath    = urlObj.pathname + urlObj.search;

                try {
                    let socket = null;

                    if (this._proxy && isHttps && (this._proxy.protocol === 'http' || this._proxy.protocol === 'https')) {
                        socket = await connectThroughProxy(this._proxy, targetHost, targetPort, ms);
                    }

                    const reqOpts = {
                        hostname: socket ? null : targetHost,
                        host:     socket ? null : targetHost,
                        port:     socket ? null : targetPort,
                        path:     reqPath,
                        method:   currentMethod,
                        headers:  reqH,
                        timeout:  ms,
                        rejectUnauthorized: false,
                    };

                    let req;
                    if (socket) {
                        req = https.request({ ...reqOpts, ...FF_TLS, hostname: targetHost, port: targetPort, socket, createConnection: () => socket });
                    } else if (this._proxy && !isHttps) {
                        reqOpts.hostname = this._proxy.host;
                        reqOpts.port     = this._proxy.port;
                        reqOpts.path     = current;
                        if (this._proxy.auth) reqH['Proxy-Authorization'] = `Basic ${Buffer.from(this._proxy.auth).toString('base64')}`;
                        req = http.request({ ...reqOpts });
                    } else {
                        req = (isHttps ? https : http).request({ ...FF_TLS, hostname: targetHost, port: targetPort, path: reqPath, method: currentMethod, headers: reqH, timeout: ms });
                    }

                    req.on('response', r => {
                        if (r.headers['set-cookie']) this.cookies.setCookies(r.headers['set-cookie'], urlObj);
                        const chunks = [];
                        r.on('data', c => chunks.push(c));
                        r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, text: decompress(Buffer.concat(chunks), r.headers['content-encoding']) }));
                    });
                    req.on('error', reject);
                    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${currentMethod} ${current}`)); });
                    if (body) req.write(body);
                    req.end();
                } catch (e) { reject(e); }
            });

            const isRedir = [301, 302, 303, 307, 308].includes(res.status);
            if (isRedir && allowRedirects && redirects < maxRedirects) {
                const loc = res.headers['location'];
                if (loc) {
                    current = new URL(loc, current).toString();
                    if ([301, 302, 303].includes(res.status)) { currentMethod = 'GET'; body = null; }
                    redirects++;
                    continue;
                }
            }
            return {
                status: res.status,
                statusCode: res.status,
                headers: res.headers,
                text: res.text,
                url: current,
                location: res.headers['location'] || null,
                json() { try { return JSON.parse(res.text); } catch { throw new Error(`JSON parse: ${res.text.slice(0, 200)}`); } },
            };
        }
    }

    get(url, opts = {})  { return this.request('GET',  url, opts); }
    post(url, opts = {}) { return this.request('POST', url, opts); }
}

module.exports = { HttpSession, CookieJar };
