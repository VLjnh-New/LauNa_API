'use strict';

/**
 * Logger nhỏ gọn cho LauNa API.
 *
 *   log(message)            → log info
 *   log(message, 'API')     → log endpoint hit (xanh lá)
 *   log(message, 'WARN')    → cảnh báo (vàng)
 *   log(message, 'ERROR')   → lỗi (đỏ)
 *   log.banner('Hello')     → in banner màu ngẫu nhiên (chalk)
 *   log.recent(n, levels)   → đọc N entry gần nhất từ ring buffer
 *   log.subscribe(fn)       → đăng ký callback nhận mỗi entry
 *
 * Không phụ thuộc cấu hình — luôn ghi ra stdout. Pino có thể wrap thêm.
 */

const chalk = require('chalk');

// ── Bảng màu ANSI cho từng level ─────────────────────────────────────────────
const LEVEL_COLORS = {
    INFO:  '\x1b[36m', // cyan
    API:   '\x1b[32m', // green
    WARN:  '\x1b[33m', // yellow
    ERROR: '\x1b[31m', // red
    DEBUG: '\x1b[35m', // magenta
};
const RESET = '\x1b[0m';

function timestamp() {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ── Ring buffer (last N entries) ─────────────────────────────────────────────
const RING_MAX = 300;
const ring = [];
const subscribers = [];

/**
 * Ghi log với level chỉ định.
 * @param {string} message  - Nội dung log
 * @param {string} [type]   - INFO | API | WARN | ERROR | DEBUG | STATUS | HOST UPTIME | ...
 */
function log(message, type = 'INFO') {
    const level = String(type).toUpperCase();
    const color = LEVEL_COLORS[level] || LEVEL_COLORS.INFO;
    console.log(`${color}[${level}]${RESET} ${message}`);

    // Ghi vào ring buffer (lưu cả raw, không có ANSI codes)
    const entry = { ts: Date.now(), level, message: String(message) };
    ring.push(entry);
    if (ring.length > RING_MAX) ring.shift();

    // Báo cho subscribers (không chặn nếu fail)
    for (const fn of subscribers) {
        try { fn(entry); } catch (_) {}
    }
}

// ── Banner đa sắc cho startup ────────────────────────────────────────────────
const BANNER_COLORS = ['blue', 'yellow', 'green', 'red', 'magenta', 'yellowBright', 'blueBright', 'magentaBright'];

log.banner = (data) => {
    const pick = BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)];
    console.log(chalk[pick](data));
};

/**
 * Đọc N entry gần nhất, có thể lọc theo level.
 * @param {number} n
 * @param {string[]} [levels] vd ['ERROR','WARN']
 */
log.recent = (n = 50, levels = null) => {
    let arr = ring;
    if (levels && levels.length) {
        const set = new Set(levels.map(l => String(l).toUpperCase()));
        arr = ring.filter(e => set.has(e.level));
    }
    return arr.slice(-n);
};

/**
 * Đăng ký callback nhận mọi entry mới. Trả về hàm unsubscribe.
 */
log.subscribe = (fn) => {
    if (typeof fn !== 'function') return () => {};
    subscribers.push(fn);
    return () => {
        const i = subscribers.indexOf(fn);
        if (i >= 0) subscribers.splice(i, 1);
    };
};

module.exports = log;
