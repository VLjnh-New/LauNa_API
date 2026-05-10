'use strict';

/**
 * Config loader: ưu tiên đọc từ environment variables (Secrets),
 * fallback về config.json để giữ tương thích ngược.
 *
 * Env vars được hỗ trợ:
 *   PORT                          → server.port
 *   HOST                          → server.host
 *   LAUNA_DATABASE_URL | DATABASE_URL → database.connectionString
 *   REDIS_URL                     → redis.url
 *   TURNSTILE_SITE_KEY            → turnstile.siteKey
 *   TURNSTILE_SECRET_KEY          → turnstile.secretKey
 *   TELEGRAM_BOT_TOKEN            → telegram.botToken
 *   TELEGRAM_ADMIN_ID             → telegram.adminId
 *   FREE_KEY_HOURLY_LIMIT         → freeKey.requestsPerHour
 *   ADMIN_KEY                     → thêm key admin vào list (nếu chưa có)
 *   NODE_ENV                      → production | development
 *   DASHBOARD_PASSWORD            → shield dashboard password
 *
 * Cảnh báo nếu phát hiện secret còn trong config.json (đã commit).
 */

const path = require('path');
const log = require('./logger');

let _cached = null;

function loadFileConfig() {
    try {
        return require(path.join(process.cwd(), 'config.json'));
    } catch {
        return {};
    }
}

function isPlaceholder(v) {
    if (!v || typeof v !== 'string') return true;
    const t = v.trim();
    if (!t) return true;
    return /^NHAP_/i.test(t) || t === 'CHANGEME' || t === 'YOUR_KEY';
}

function load() {
    if (_cached) return _cached;

    const file = loadFileConfig();
    const env = process.env;

    const database = {
        ...(file.database || {}),
        connectionString:
            env.LAUNA_DATABASE_URL ||
            env.DATABASE_URL ||
            file.database?.connectionString ||
            ''
    };

    const redis = {
        ...(file.redis || {}),
        url: env.REDIS_URL || file.redis?.url || ''
    };

    const turnstile = {
        ...(file.turnstile || {}),
        siteKey:   env.TURNSTILE_SITE_KEY   || file.turnstile?.siteKey   || '',
        secretKey: env.TURNSTILE_SECRET_KEY || file.turnstile?.secretKey || ''
    };

    const server = {
        ...(file.server || {}),
        port: Number(env.PORT) || file.server?.port || 5000,
        host: env.HOST || file.server?.host || '0.0.0.0'
    };

    const telegram = {
        ...(file.telegram || {}),
        botToken: env.TELEGRAM_BOT_TOKEN || file.telegram?.botToken || '',
        adminId:  env.TELEGRAM_ADMIN_ID  || file.telegram?.adminId  || ''
    };

    const freeKey = {
        ...(file.freeKey || {}),
        requestsPerHour: Number(env.FREE_KEY_HOURLY_LIMIT) || file.freeKey?.requestsPerHour || 60
    };

    const merged = { ...file, database, redis, turnstile, server, telegram, freeKey };

    // Cảnh báo bảo mật nếu secret còn nằm trong config.json (file commit)
    const fileHasDb = !isPlaceholder(file.database?.connectionString);
    const fileHasTs = !isPlaceholder(file.turnstile?.secretKey);
    if (fileHasDb || fileHasTs) {
        const which = [
            fileHasDb && 'database.connectionString',
            fileHasTs && 'turnstile.secretKey'
        ].filter(Boolean).join(', ');
        log(`[CONFIG] CẢNH BÁO BẢO MẬT: secret còn trong config.json (${which}). ` +
            `Hãy chuyển sang Secrets/env và rotate ngay.`, 'WARN');
    }

    _cached = merged;
    return merged;
}

module.exports = load();
module.exports.reload = function reload() {
    _cached = null;
    return load();
};
