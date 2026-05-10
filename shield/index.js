'use strict';

const path = require('node:path');
const { loadConfig } = require('./config');
const { logger, setLogLevel } = require('./logger');
const { startProxy } = require('./proxy');
const { buildDashboardApp, startDashboard } = require('./dashboard');
const { startStatsTicker } = require('./state');

function applyEnvOverrides(cfg, skipPortEnv) {
    // Khi caller đã chỉ định port (opts.port), bỏ qua $PORT để tránh xung đột
    // với PORT của ứng dụng nội bộ (LauNa).
    const envPort = skipPortEnv
        ? NaN
        : (process.env.SHIELD_PORT
            ? Number(process.env.SHIELD_PORT)
            : (process.env.PORT ? Number(process.env.PORT) : NaN));
    const upstream = process.env.PROXY_UPSTREAM;
    const dashUser = process.env.DASHBOARD_USERNAME;
    const dashPass = process.env.DASHBOARD_PASSWORD;
    const basePath = (process.env.DASHBOARD_BASE_PATH != null
        ? process.env.DASHBOARD_BASE_PATH
        : '/__shield').replace(/\/$/, '');

    if (upstream) {
        cfg.proxy.upstream = upstream;
        cfg.demoBackend.enabled = false;
        logger.info(`Upstream từ env: ${upstream}`);
    }
    if (dashUser !== undefined) cfg.dashboard.username = dashUser;
    if (dashPass !== undefined) cfg.dashboard.password = dashPass;

    if (Number.isFinite(envPort) && envPort > 0) {
        cfg.proxy.port = envPort;
        cfg.dashboard.port = envPort;
        logger.info(`Phát hiện cổng=${envPort} → chạy chung 1 cổng (chế độ hosted)`);
        return { combined: true, basePath };
    }

    if (cfg.proxy.port === cfg.dashboard.port) {
        return { combined: true, basePath };
    }

    return { combined: false, basePath };
}

/**
 * Programmatic entry point. Pass overrides explicitly so the calling app
 * (LauNa's index.js) can drive port/upstream selection cleanly.
 */
function startShield(opts = {}) {
    const configPath = opts.configPath
        || process.env.SHIELD_CONFIG
        || path.resolve(process.cwd(), 'shield/config.yaml');

    let cfg;
    try {
        cfg = loadConfig(configPath);
        logger.info(`Đã nạp cấu hình: ${configPath}`);
    } catch (e) {
        logger.error('Không nạp được cấu hình:', e.message);
        throw e;
    }

    if (opts.port) {
        cfg.proxy.port = opts.port;
        cfg.dashboard.port = opts.port;
    }
    if (opts.upstream) {
        cfg.proxy.upstream = opts.upstream;
        cfg.demoBackend.enabled = false;
    }
    if (opts.basePath != null) {
        cfg.__overrideBasePath = opts.basePath.replace(/\/$/, '');
    }

    setLogLevel(cfg.logging.level);

    const { combined, basePath: envBase } = applyEnvOverrides(cfg, !!opts.port);
    const basePath = cfg.__overrideBasePath != null ? cfg.__overrideBasePath : envBase;

    startStatsTicker();

    if (combined) {
        const dashApp = buildDashboardApp(cfg, basePath);
        return startProxy(cfg, { dashboardApp: dashApp, dashboardBasePath: basePath });
    } else {
        startDashboard(cfg);
        return startProxy(cfg);
    }
}

module.exports = { startShield };

// Allow running stand-alone via: node shield/index.js
if (require.main === module) {
    startShield();
}
