'use strict';

const fs = require('node:fs');
const yaml = require('js-yaml');

const DEFAULTS = {
    proxy: { port: 8080, upstream: 'http://127.0.0.1:8081', trustProxy: true, proxyTimeout: 30000 },
    dashboard: { port: 5000, username: 'admin', password: 'changeme' },
    demoBackend: { enabled: false, port: 8081 },
    rateLimit: { enabled: false, windowMs: 1000, maxRequests: 30, burst: 60 },
    ban: { enabled: false, maxViolations: 5, durationMs: 600000 },
    waf: { enabled: true, blockOnMatch: false, maxBodyBytes: 0 },
    botDetect: { enabled: false, blockEmptyUA: false, blockKnownBadUA: false },
    challenge: {
        enabled: false,
        difficulty: 4,
        cookieName: 'ms_pow',
        cookieTTLms: 3600000,
        triggerWhenSuspicious: false,
    },
    whitelistIps: [],
    blacklistIps: [],
    logging: { level: 'info' },
};

function deepMerge(base, override) {
    if (!override || typeof override !== 'object') return base;
    const out = Array.isArray(base) ? base.slice() : { ...base };
    for (const k of Object.keys(override)) {
        const v = override[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object') {
            out[k] = deepMerge(base[k], v);
        } else if (v !== null && v !== undefined) {
            out[k] = v;
        }
    }
    return out;
}

function loadConfig(path) {
    let parsed = {};
    try {
        const raw = fs.readFileSync(path, 'utf8');
        parsed = yaml.load(raw) || {};
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
    }
    if (typeof parsed !== 'object') {
        throw new Error(`Config rỗng hoặc không hợp lệ: ${path}`);
    }
    return deepMerge(DEFAULTS, parsed);
}

module.exports = { loadConfig, DEFAULTS };
