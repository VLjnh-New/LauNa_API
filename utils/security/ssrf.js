'use strict';

/**
 * SSRF guard: kiểm tra URL user gửi vào không trỏ tới mạng nội bộ
 * (localhost, private IPv4, link-local, cloud metadata, IPv6 loopback...).
 *
 * Dùng khi server fetch URL do user cung cấp (download, image proxy, ...).
 *
 * Usage:
 *   const { assertSafeUrl, isSafeUrl } = require('../utils/security/ssrf');
 *   try { assertSafeUrl(req.query.url); } catch (e) { return res.status(400).json({status:false, message:e.message}); }
 */

const dns = require('dns').promises;
const net = require('net');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_HOSTS = new Set([
    'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
    'metadata.google.internal'
]);

function isPrivateIPv4(ip) {
    const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
    if (a === 10) return true;                            // 10.0.0.0/8
    if (a === 127) return true;                            // loopback
    if (a === 0) return true;                              // 0.0.0.0/8
    if (a === 169 && b === 254) return true;               // link-local + AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;      // 172.16.0.0/12
    if (a === 192 && b === 168) return true;               // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT
    if (a >= 224) return true;                             // multicast / reserved
    return false;
}

function isPrivateIPv6(ip) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
    if (lower.startsWith('fe80')) return true;                          // link-local
    if (lower.startsWith('::ffff:')) {                                  // IPv4-mapped
        return isPrivateIPv4(lower.slice(7));
    }
    return false;
}

function isPrivateIp(ip) {
    const fam = net.isIP(ip);
    if (fam === 4) return isPrivateIPv4(ip);
    if (fam === 6) return isPrivateIPv6(ip);
    return false;
}

async function assertSafeUrl(input, { allowedProtocols = ALLOWED_PROTOCOLS } = {}) {
    if (!input || typeof input !== 'string') {
        throw new Error('URL không hợp lệ');
    }
    let u;
    try {
        u = new URL(input);
    } catch {
        throw new Error('URL không parse được');
    }

    if (!allowedProtocols.has(u.protocol)) {
        throw new Error(`Protocol "${u.protocol}" không được phép`);
    }

    const hostname = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!hostname) throw new Error('Hostname trống');
    if (BLOCKED_HOSTS.has(hostname)) {
        throw new Error('Hostname không được phép');
    }

    // Nếu hostname đã là IP, check trực tiếp
    if (net.isIP(hostname)) {
        if (isPrivateIp(hostname)) throw new Error('Không được trỏ vào IP nội bộ');
        return true;
    }

    // Resolve DNS, chặn nếu bất kỳ A/AAAA nào trỏ vào private range (chống DNS rebinding ở mức cơ bản)
    let addrs = [];
    try {
        addrs = await dns.lookup(hostname, { all: true });
    } catch {
        throw new Error('Không resolve được hostname');
    }
    for (const a of addrs) {
        if (isPrivateIp(a.address)) {
            throw new Error('Hostname trỏ vào IP nội bộ');
        }
    }
    return true;
}

async function isSafeUrl(input, opts) {
    try { await assertSafeUrl(input, opts); return true; } catch { return false; }
}

/** Express middleware kiểm tra ?url= */
function ssrfQueryGuard(paramName = 'url') {
    return async function (req, res, next) {
        const v = req.query?.[paramName];
        if (!v) return next(); // để route tự báo "thiếu url"
        try {
            await assertSafeUrl(v);
            next();
        } catch (e) {
            return res.status(400).json({
                status: false,
                message: `URL bị từ chối vì lý do bảo mật: ${e.message}`
            });
        }
    };
}

module.exports = { assertSafeUrl, isSafeUrl, isPrivateIp, ssrfQueryGuard };
