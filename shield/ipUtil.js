'use strict';

function clientIp(req, trustProxy) {
    if (trustProxy) {
        const xff = req.headers['x-forwarded-for'];
        if (typeof xff === 'string' && xff.length > 0) {
            return xff.split(',')[0].trim();
        }
    }
    const raw = (req.socket && req.socket.remoteAddress) || 'unknown';
    return raw.startsWith('::ffff:') ? raw.slice(7) : raw;
}

function ip4ToInt(ip) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipMatches(ip, entry) {
    if (entry === ip) return true;
    if (!entry.includes('/')) return false;
    const [net, maskStr] = entry.split('/');
    const mask = Number(maskStr);
    const ipInt = ip4ToInt(ip);
    const netInt = ip4ToInt(net);
    if (ipInt === null || netInt === null || Number.isNaN(mask)) return false;
    const maskBits = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
    return (ipInt & maskBits) === (netInt & maskBits);
}

function ipInList(ip, list) {
    if (!Array.isArray(list)) return false;
    return list.some((entry) => entry && ipMatches(ip, entry));
}

module.exports = { clientIp, ipMatches, ipInList };
