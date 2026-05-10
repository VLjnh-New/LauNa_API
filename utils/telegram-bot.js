'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { Telegraf, Markup } = require('telegraf');
const log = require('./logger');

const ddos = require('./security/ddos');
const paymentBot = require('./bot/payment');

let paymentApi = null; // gán sau khi register

// Dùng cùng path với ddos.js — /tmp nếu filesystem read-only
const _DEFAULT_BLOCK = path.join(process.cwd(), 'data', 'block', 'listIP.json');
const _TMP_BLOCK     = path.join('/tmp', 'launa-block', 'listIP.json');
function _resolveBlockPath() {
    try { fs.accessSync(path.dirname(_DEFAULT_BLOCK), fs.constants.W_OK); return _DEFAULT_BLOCK; }
    catch { return _TMP_BLOCK; }
}
const BLOCK_PATH = _resolveBlockPath();

// Đọc từ env TELEGRAM_ADMIN_USERNAMES (ngăn cách bằng dấu phẩy) hoặc fallback hardcode
const ADMIN_USERNAMES = process.env.TELEGRAM_ADMIN_USERNAMES
    ? process.env.TELEGRAM_ADMIN_USERNAMES.split(',').map(s => s.trim()).filter(Boolean)
    : ['Lizjiii'];

let started = false;
let bot = null;

// ────────────── Helpers ──────────────
// Dùng shared in-memory store từ apikey.js thay vì đọc file trực tiếp
const _apikeyStore = require('./security/apikey');

function loadKeys() {
    return _apikeyStore.listKeys();
}

function saveKeys(data) {
    _apikeyStore.setKeys(data);
}

function loadBans() {
    try {
        const raw = JSON.parse(fs.readFileSync(BLOCK_PATH, 'utf-8'));
        if (!Array.isArray(raw)) return [];
        const now = Date.now();
        return raw
            .map(e => typeof e === 'string' ? { ip: e, exp: now + 24 * 60 * 60 * 1000 } : e)
            .filter(e => e && e.ip && (!e.exp || e.exp > now));
    } catch {
        return [];
    }
}

function isAdmin(ctx) {
    const uname = ctx.from && ctx.from.username;
    if (!uname) return false;
    return ADMIN_USERNAMES.some(n => n.toLowerCase() === uname.toLowerCase());
}

function fmtBytes(n) {
    if (!n) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(1)} ${u[i]}`;
}

function fmtUptime(sec) {
    sec = Math.floor(sec);
    const d = Math.floor(sec / 86400); sec %= 86400;
    const h = Math.floor(sec / 3600);  sec %= 3600;
    const m = Math.floor(sec / 60);    sec %= 60;
    const parts = [];
    if (d) parts.push(d + 'd');
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    parts.push(sec + 's');
    return parts.join(' ');
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function shortKey(k) {
    if (!k) return '';
    if (k.length <= 22) return k;
    return k.slice(0, 14) + '…' + k.slice(-4);
}

function genApiKey(type) {
    const rnd = require('crypto').randomBytes(8).toString('hex');
    if (type === 'admin')   return 'launa-admin-' + rnd;
    if (type === 'premium') return 'launa-prem-' + rnd;
    return 'launa-free-' + rnd;
}

// ────────────── Awaiting-text state (per chat) ──────────────
// Khi user bấm nút "Ban IP" / "Unban IP" / "Đổi limit" → bot hỏi IP/limit
// và lưu chế độ chờ ở đây. Tin nhắn text tiếp theo của admin sẽ được hiểu là
// payload trả lời.

const waiting = new Map(); // chatId -> { mode, args, ts }

function setWait(chatId, mode, args) {
    waiting.set(chatId, { mode, args: args || {}, ts: Date.now() });
}
function getWait(chatId) {
    const w = waiting.get(chatId);
    if (!w) return null;
    if (Date.now() - w.ts > 5 * 60 * 1000) { waiting.delete(chatId); return null; }
    return w;
}
function clearWait(chatId) { waiting.delete(chatId); }

// ────────────── Screens (text + keyboard) ──────────────

function screenMenu() {
    const text =
        '<b>🤖 LauNa Admin</b>\n' +
        'Chọn chức năng bên dưới hoặc dùng lệnh /help để xem chi tiết.';
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('📥 Đơn chờ duyệt', 'orders_refresh'), Markup.button.callback('⚙️ Payment', 'pcfg_open')],
        [Markup.button.callback('📊 Stats', 'stats'),       Markup.button.callback('💚 Health', 'health')],
        [Markup.button.callback('📈 Top users', 'top:24'),  Markup.button.callback('🚨 Errors', 'errors')],
        [Markup.button.callback('🔑 API Keys', 'keys'),     Markup.button.callback('🚫 Banned IPs', 'bans')],
        [Markup.button.callback('🔍 Search', 'search'),     Markup.button.callback('💾 Backup', 'backup')],
        [Markup.button.callback('🌐 Proxies', 'proxies'),   Markup.button.callback('🧹 Cache', 'cache')],
        [Markup.button.callback('🗄️ DB Clean', 'dbclean')],
        [Markup.button.callback('➕ Tạo key', 'newkey'),    Markup.button.callback('🚫 Ban IP', 'banprompt')],
        [Markup.button.callback('🔔 Notify', 'notify'),     Markup.button.callback('♻️ Restart', 'restart_ask')],
        [Markup.button.callback('❓ Help', 'help')]
    ]);
    return { text, ...kb };
}

// ────────────── Top users screen ──────────────

function screenTop(hours = 24) {
    const usage = require('./data/usage-tracker');
    const tot = usage.totals(hours);
    const tk = usage.topKeys(hours, 10);
    const ti = usage.topIps(hours, 10);

    const head = `<b>📈 Top users (${hours}h)</b>\n` +
        `Tổng request: <b>${tot.total.toLocaleString()}</b> · ` +
        `Keys: <b>${tot.uniqueKeys}</b> · IPs: <b>${tot.uniqueIps}</b>\n`;

    const keyLines = tk.length
        ? tk.map((e, i) =>
            `${i + 1}. <code>${escapeHtml(shortKey(e.key))}</code> — <b>${e.count.toLocaleString()}</b>`
          ).join('\n')
        : '  <i>(chưa có)</i>';

    const ipLines = ti.length
        ? ti.map((e, i) =>
            `${i + 1}. <code>${escapeHtml(e.ip)}</code> — <b>${e.count.toLocaleString()}</b>`
          ).join('\n')
        : '  <i>(chưa có)</i>';

    const text = `${head}\n<b>Top API Keys:</b>\n${keyLines}\n\n<b>Top IPs:</b>\n${ipLines}`;
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('1h', 'top:1'), Markup.button.callback('24h', 'top:24'),
         Markup.button.callback('7d', 'top:168')],
        [Markup.button.callback('🔄 Làm mới', 'top:' + hours), Markup.button.callback('« Menu', 'menu')]
    ]);
    return { text, ...kb };
}

// ────────────── Recent errors screen ──────────────

function screenErrors() {
    const entries = log.recent(30, ['ERROR', 'WARN']);
    let body;
    if (!entries.length) {
        body = '<b>🚨 Recent errors</b>\n\n✅ Không có lỗi nào trong buffer.';
    } else {
        const lines = entries.slice().reverse().map(e => {
            const t = new Date(e.ts).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
            const icon = e.level === 'ERROR' ? '🔴' : '🟡';
            return `${icon} <code>${t}</code> ${escapeHtml(e.message.slice(0, 200))}`;
        }).join('\n');
        body = `<b>🚨 Recent errors/warns (${entries.length})</b>\n\n${lines}`;
    }
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Làm mới', 'errors'), Markup.button.callback('« Menu', 'menu')]
    ]);
    return { text: body, ...kb };
}

// ────────────── Cache screen ──────────────

function screenCache() {
    const { caches } = require('./data/cache');
    const lines = [];
    let total = 0;
    for (const [name, c] of caches) {
        lines.push(`  • ${escapeHtml(name)}: <b>${c.size}</b>`);
        total += c.size;
    }
    const body =
        `<b>🧹 Cache</b>\n\n` +
        `Tổng entries: <b>${total}</b>\n` +
        `Namespaces: <b>${caches.size}</b>\n\n` +
        (lines.length ? lines.join('\n') : '  <i>(chưa có cache)</i>');
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🗑 Clear all', 'cache_clear')],
        [Markup.button.callback('🔄', 'cache'), Markup.button.callback('« Menu', 'menu')]
    ]);
    return { text: body, ...kb };
}

// ────────────── DB Clean screen ──────────────

async function screenDbClean() {
    const { query, isEnabled } = require('./data/db');
    if (!isEnabled()) {
        return {
            text: '<b>🗄️ DB Clean</b>\n\n❌ Database chưa được cấu hình.',
            ...Markup.inlineKeyboard([[Markup.button.callback('« Menu', 'menu')]])
        };
    }
    try {
        const cutoff30 = new Date(Date.now() - 30 * 86400_000)
            .toISOString().slice(0, 13); // 'YYYY-MM-DDTHH'
        const [rHourly, rHourlyAll, rNotes, rTempmail, rProxies, rAutoProxy, rShortUrls, rSharefiles] =
            await Promise.all([
                query(`SELECT COUNT(*) FROM request_hourly WHERE hour < $1`, [cutoff30]),
                query(`SELECT COUNT(*) FROM request_hourly`),
                query(`SELECT COUNT(*) FROM notes WHERE expires_at IS NOT NULL AND expires_at <= NOW()`),
                query(`SELECT COUNT(*) FROM tempmail_inboxes WHERE expires_at <= NOW()`),
                query(`SELECT COUNT(*) FROM user_proxies WHERE alive = false`),
                query(`SELECT COUNT(*) FROM auto_proxy_clients WHERE expires_at <= NOW()`),
                query(`SELECT COUNT(*) FROM short_urls WHERE hits = 0 AND created_at < NOW() - INTERVAL '30 days'`),
                query(`SELECT COUNT(*) FROM sharefiles WHERE created_at < NOW() - INTERVAL '90 days'`),
            ]);
        const n = r => Number(r.rows[0].count);
        const body =
            `<b>🗄️ DB Clean</b>\n\n` +
            `Các mục có thể xoá:\n\n` +
            `  • Hourly stats >30d: <b>${n(rHourly)}</b> / ${n(rHourlyAll)} rows\n` +
            `  • Notes hết hạn: <b>${n(rNotes)}</b>\n` +
            `  • TempMail hết hạn: <b>${n(rTempmail)}</b>\n` +
            `  • Proxy chết (alive=false): <b>${n(rProxies)}</b>\n` +
            `  • Auto-proxy expired: <b>${n(rAutoProxy)}</b>\n` +
            `  • Short URLs không dùng (>30d): <b>${n(rShortUrls)}</b>\n` +
            `  • Sharefiles cũ (>90d): <b>${n(rSharefiles)}</b>`;
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('🗑 Hourly >30d',       'dbc:hourly'),
             Markup.button.callback('🗑 Notes hết hạn',     'dbc:notes')],
            [Markup.button.callback('🗑 TempMail hết hạn',  'dbc:tempmail'),
             Markup.button.callback('🗑 Proxy chết',        'dbc:proxies')],
            [Markup.button.callback('🗑 Auto-proxy expired','dbc:autoproxy'),
             Markup.button.callback('🗑 ShortURL cũ',       'dbc:shorturls')],
            [Markup.button.callback('🗑 Sharefiles cũ',     'dbc:sharefiles'),
             Markup.button.callback('🔥 Dọn tất cả',        'dbc:all')],
            [Markup.button.callback('🔄 Làm mới', 'dbclean'), Markup.button.callback('« Menu', 'menu')]
        ]);
        return { text: body, ...kb };
    } catch (e) {
        return {
            text: `<b>🗄️ DB Clean</b>\n\n❌ Lỗi truy vấn: ${escapeHtml(e.message)}`,
            ...Markup.inlineKeyboard([[Markup.button.callback('🔄', 'dbclean'), Markup.button.callback('« Menu', 'menu')]])
        };
    }
}

// ────────────── Proxy pool screen ──────────────

function screenProxies() {
    let body;
    try {
        const pp = global.proxyPool;
        if (!pp) {
            body = '<b>🌐 Proxy pool</b>\n\n❌ Pool chưa khởi động.';
        } else {
            const s = pp.getStats();
            const last = s.lastRefresh
                ? new Date(s.lastRefresh).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                : '(chưa)';
            const sample = (s.proxies || []).slice(0, 8)
                .map((p, i) => `  ${i + 1}. <code>${escapeHtml(p)}</code>`).join('\n');
            body =
                `<b>🌐 Proxy pool</b>\n\n` +
                `Đang sống: <b>${s.total}</b>\n` +
                `Refresh cuối: ${escapeHtml(last)}\n` +
                `Đang refresh: ${s.refreshing ? '🟡 yes' : '✅ no'}\n\n` +
                `<b>Mẫu (top 8):</b>\n${sample || '  <i>(rỗng)</i>'}`;
        }
    } catch (e) {
        body = '❌ Lỗi đọc proxy pool: ' + e.message;
    }
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh pool', 'proxy_refresh')],
        [Markup.button.callback('🔄', 'proxies'), Markup.button.callback('« Menu', 'menu')]
    ]);
    return { text: body, ...kb };
}

// ────────────── Search screen ──────────────

function screenSearchPrompt() {
    const text =
        '<b>🔍 Search key/IP</b>\n\n' +
        'Gửi 1 trong các giá trị:\n' +
        '  • IP (vd <code>1.2.3.4</code>) → liệt kê key đã dùng từ IP đó\n' +
        '  • Tiền tố key (vd <code>launa-free-</code>) → liệt kê key trùng prefix\n' +
        '  • Apikey đầy đủ → xem chi tiết + IP đã dùng\n\n' +
        'Gõ /menu để huỷ.';
    const kb = Markup.inlineKeyboard([[Markup.button.callback('« Menu', 'menu')]]);
    return { text, ...kb };
}

function doSearch(query) {
    const usage = require('./data/usage-tracker');
    const keys = loadKeys();
    const isIp = /^[0-9a-f.:]+$/i.test(query) && (query.includes('.') || query.includes(':'));
    const isFullKey = /^launa-(admin|prem|free)-[0-9a-f]{16,}$/i.test(query);

    if (isIp) {
        const found = usage.keysForIp(query);
        const lines = found.length
            ? found.slice(0, 30).map((k, i) => {
                const meta = keys.find(x => x.apikey === k);
                const t = meta ? meta.type : '?';
                return `${i + 1}. <code>${escapeHtml(shortKey(k))}</code> · <b>${t}</b>`;
            }).join('\n')
            : '<i>(không có key nào ghi nhận từ IP này)</i>';
        return `<b>🔍 IP <code>${escapeHtml(query)}</code></b>\n\n` +
               `Keys đã dùng: ${found.length}\n\n${lines}`;
    }

    if (isFullKey) {
        const k = keys.find(x => x.apikey === query);
        const ips = usage.ipsForKey(query);
        if (!k && !ips.length) return `❌ Không tìm thấy key <code>${escapeHtml(query)}</code>.`;
        const meta = k
            ? `Loại: <b>${k.type}</b> · Limit: ${k.hourlyLimit || '∞'}/h\n` +
              `Tạo: ${k.createdAt || '?'}\n` +
              (k.note ? `Note: ${escapeHtml(k.note)}\n` : '')
            : '<i>(không có metadata trong apikeys.json)</i>\n';
        const ipLines = ips.length
            ? ips.slice(0, 20).map((ip, i) => `${i + 1}. <code>${escapeHtml(ip)}</code>`).join('\n')
            : '<i>(chưa có IP)</i>';
        return `<b>🔍 Key <code>${escapeHtml(shortKey(query))}</code></b>\n\n${meta}\n` +
               `<b>IPs (${ips.length}):</b>\n${ipLines}`;
    }

    // Prefix search
    const prefix = query.toLowerCase();
    const matches = keys.filter(k => String(k.apikey).toLowerCase().includes(prefix));
    if (!matches.length) return `❌ Không key nào khớp prefix <code>${escapeHtml(query)}</code>.`;
    const lines = matches.slice(0, 25).map((k, i) =>
        `${i + 1}. <code>${escapeHtml(k.apikey)}</code> · <b>${k.type}</b>`
    ).join('\n');
    return `<b>🔍 Prefix <code>${escapeHtml(query)}</code></b>\n\n` +
           `Tìm thấy: ${matches.length}\n\n${lines}` +
           (matches.length > 25 ? `\n<i>...và ${matches.length - 25} key khác</i>` : '');
}

// ────────────── Notify settings screen ──────────────

function screenNotify(chatId) {
    const subscribed = isSubscribedChat(chatId);
    const all = listSubscribedChats();
    const text =
        `<b>🔔 Notification</b>\n\n` +
        `Chat hiện tại: ${subscribed ? '✅ <b>đã đăng ký</b>' : '❌ chưa đăng ký'}\n` +
        `Tổng chat đăng ký: <b>${all.length}</b>\n\n` +
        `Khi đăng ký, bot sẽ nhắn riêng khi:\n` +
        `  • Có log <b>ERROR</b> mới (gom 30s)\n` +
        `  • IP bị <b>perm-ban</b>\n` +
        `  • RSS RAM vượt <b>${RAM_ALERT_MB} MB</b>`;
    const kb = Markup.inlineKeyboard([
        subscribed
            ? [Markup.button.callback('🔕 Tắt notify chat này', 'notify_off')]
            : [Markup.button.callback('🔔 Bật notify chat này', 'notify_on')],
        [Markup.button.callback('🔄', 'notify'), Markup.button.callback('« Menu', 'menu')]
    ]);
    return { text, ...kb };
}

async function screenStats() {
    let body = '';
    try {
        const { getStats } = require('./data/stats');
        const s = await getStats();
        const cats = Object.entries(s.byCategory || {})
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `  • ${k}: <b>${Number(v).toLocaleString()}</b>`)
            .join('\n') || '  (chưa có dữ liệu)';
        const last24 = (s.hourly || []).slice(-24).reduce((a, x) => a + (Number(x.n) || 0), 0);
        body =
            `<b>📊 Thống kê request</b>\n` +
            `Tổng: <b>${Number(s.total || 0).toLocaleString()}</b>\n` +
            `24h gần nhất: <b>${last24.toLocaleString()}</b>\n\n` +
            `<b>Theo nhóm:</b>\n${cats}`;
    } catch (e) {
        body = '❌ Lỗi đọc stats: ' + e.message;
    }
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Làm mới', 'stats'), Markup.button.callback('« Menu', 'menu')]
    ]);
    return { text: body, ...kb };
}

function screenHealth() {
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const load = os.loadavg();
    const port = (global.config && global.config.server && global.config.server.port) || 5000;
    const text =
        `<b>💚 Server Health</b>\n` +
        `PID: <code>${process.pid}</code>\n` +
        `Uptime: <b>${fmtUptime(process.uptime())}</b>\n` +
        `Port: <b>${port}</b>\n` +
        `Node: <code>${process.version}</code>\n\n` +
        `<b>RAM (process):</b>\n` +
        `  RSS: ${fmtBytes(mem.rss)}\n` +
        `  Heap: ${fmtBytes(mem.heapUsed)} / ${fmtBytes(mem.heapTotal)}\n\n` +
        `<b>RAM (host):</b> ${fmtBytes(totalMem - freeMem)} / ${fmtBytes(totalMem)}\n` +
        `<b>Load avg:</b> ${load.map(n => n.toFixed(2)).join(' · ')}\n` +
        `<b>OS:</b> ${os.type()} ${os.release()}`;
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Làm mới', 'health'), Markup.button.callback('« Menu', 'menu')]
    ]);
    return { text, ...kb };
}

function screenKeys() {
    const keys = loadKeys();
    let body;
    const rows = [];
    if (!keys.length) {
        body = '<b>🔑 API Keys</b>\n\n📭 Chưa có API key nào.';
    } else {
        const lines = keys.slice(0, 20).map((k, i) => {
            const t = String(k.type || 'free').toLowerCase();
            const used = k.hourly?.used || 0;
            const lim = k.hourlyLimit || '∞';
            const ipStr = k.ip ? ` · <code>${escapeHtml(k.ip)}</code>` : '';
            return `${i + 1}. <code>${escapeHtml(k.apikey)}</code>\n` +
                   `   <b>${t}</b> · ${used}/${lim}/h${ipStr}`;
        }).join('\n');
        const more = keys.length > 20 ? `\n\n<i>...và ${keys.length - 20} key khác</i>` : '';
        body = `<b>🔑 API Keys (${keys.length})</b>\n\n${lines}${more}`;

        // Mỗi hàng: nút đổi type + nút xoá
        for (const k of keys.slice(0, 8)) {
            if (String(k.type).toLowerCase() === 'admin') continue;
            const t = String(k.type || 'free').toLowerCase();
            const target = t === 'free' ? 'premium' : 'free';
            const icon = target === 'premium' ? '⬆️' : '⬇️';
            rows.push([
                Markup.button.callback(`${icon} ${target}`, 'ktype:' + target + ':' + k.apikey),
                Markup.button.callback(`🗑 ${shortKey(k.apikey)}`, 'kdel:' + k.apikey)
            ]);
        }
    }
    rows.push([Markup.button.callback('➕ Tạo key', 'newkey'), Markup.button.callback('🔄', 'keys')]);
    rows.push([Markup.button.callback('« Menu', 'menu')]);
    return { text: body, ...Markup.inlineKeyboard(rows) };
}

function screenBans() {
    const list = loadBans();
    let body;
    const rows = [];
    if (!list.length) {
        body = '<b>🚫 Banned IPs</b>\n\n📭 Không có IP nào đang bị ban.';
    } else {
        const lines = list.slice(0, 30).map((e, i) => {
            const exp = e.exp ? new Date(e.exp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '?';
            return `${i + 1}. <code>${escapeHtml(e.ip)}</code> — ${exp}`;
        }).join('\n');
        const more = list.length > 30 ? `\n\n<i>...và ${list.length - 30} IP khác</i>` : '';
        body = `<b>🚫 Banned IPs (${list.length})</b>\n\n${lines}${more}`;

        for (const e of list.slice(0, 10)) {
            rows.push([Markup.button.callback(`✅ Unban ${e.ip}`, 'ubn:' + e.ip)]);
        }
    }
    rows.push([Markup.button.callback('➕ Ban IP mới', 'banprompt'), Markup.button.callback('🔄', 'bans')]);
    rows.push([Markup.button.callback('« Menu', 'menu')]);
    return { text: body, ...Markup.inlineKeyboard(rows) };
}

function screenNewKey() {
    const text =
        '<b>➕ Tạo API key mới</b>\n\n' +
        'Chọn loại key cần tạo:\n' +
        '• <b>Admin</b>: không giới hạn\n' +
        '• <b>Premium</b>: không giới hạn\n' +
        '• <b>Free</b>: giới hạn req/giờ';
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Admin', 'mk:admin:0'), Markup.button.callback('💎 Premium', 'mk:premium:0')],
        [Markup.button.callback('🆓 Free 60/h', 'mk:free:60'), Markup.button.callback('🆓 Free 100/h', 'mk:free:100')],
        [Markup.button.callback('🆓 Free 500/h', 'mk:free:500'), Markup.button.callback('🆓 Free 1000/h', 'mk:free:1000')],
        [Markup.button.callback('« Menu', 'menu')]
    ]);
    return { text, ...kb };
}

function screenRestartAsk() {
    const text =
        '<b>♻️ Khởi động lại server?</b>\n\n' +
        '⚠️ Server sẽ thoát process. Trên Replit cần bấm Run lại nếu workflow không tự restart.';
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Xác nhận restart', 'restart_yes'),
         Markup.button.callback('❌ Huỷ', 'menu')]
    ]);
    return { text, ...kb };
}

function screenHelp() {
    const text = [
        '<b>📖 Hướng dẫn nhanh</b>',
        '',
        'Bạn có thể thao tác bằng <b>nút bấm</b> hoặc <b>lệnh</b>:',
        '',
        '<b>📊 Trạng thái</b>',
        '/stats · /health · /top [hours] · /errors',
        '',
        '<b>🔑 API Key</b>',
        '/keys — danh sách',
        '/key_add &lt;admin|premium|free&gt; [limit]',
        '/key_del &lt;apikey&gt;',
        '/key_limit &lt;apikey&gt; &lt;limit&gt;',
        '/key_type &lt;apikey&gt; &lt;free|premium&gt;',
        '/search &lt;ip|prefix|apikey&gt;',
        '',
        '<b>🚫 Ban IP</b>',
        '/bans · /ban &lt;ip&gt; · /unban &lt;ip&gt;',
        '',
        '<b>⚙️ Server</b>',
        '/cache · /cache_clear · /proxies · /proxy_refresh',
        '/backup · /notify_on · /notify_off · /restart · /menu'
    ].join('\n');
    const kb = Markup.inlineKeyboard([[Markup.button.callback('« Menu', 'menu')]]);
    return { text, ...kb };
}

// ────────────── Send / edit helpers ──────────────

async function send(ctx, payload) {
    return ctx.replyWithHTML(payload.text, {
        reply_markup: payload.reply_markup,
        disable_web_page_preview: true
    });
}

async function show(ctx, payload) {
    // Edit nếu callback, không thì send
    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(payload.text, {
                parse_mode: 'HTML',
                reply_markup: payload.reply_markup,
                disable_web_page_preview: true
            });
            return;
        } catch (e) {
            // Nếu edit lỗi (vd nội dung trùng), thôi gửi mới
        }
    }
    return send(ctx, payload);
}

// ────────────── Action handlers ──────────────

async function actionDeleteKey(ctx, apikey) {
    const keys = loadKeys();
    const entry = keys.find(k => k.apikey === apikey);
    if (!entry) {
        await ctx.answerCbQuery('Không tìm thấy key', { show_alert: true });
        return show(ctx, screenKeys());
    }
    if (String(entry.type).toLowerCase() === 'admin') {
        await ctx.answerCbQuery('Không xoá admin key qua bot', { show_alert: true });
        return;
    }
    const text =
        `<b>🗑 Xác nhận xoá key</b>\n\n` +
        `<code>${escapeHtml(apikey)}</code>\n` +
        `Loại: <b>${entry.type}</b>\n\n` +
        `Bạn có chắc?`;
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Xoá', 'kdy:' + apikey),
         Markup.button.callback('❌ Huỷ', 'keys')]
    ]);
    return show(ctx, { text, ...kb });
}

async function actionConfirmDeleteKey(ctx, apikey) {
    const keys = loadKeys();
    const after = keys.filter(k => k.apikey !== apikey);
    if (after.length === keys.length) {
        await ctx.answerCbQuery('Không tìm thấy key', { show_alert: true });
    } else {
        saveKeys(after);
        await ctx.answerCbQuery('Đã xoá ✅');
    }
    return show(ctx, screenKeys());
}

async function actionMakeKey(ctx, type, limit) {
    if (!['admin', 'premium', 'free'].includes(type)) {
        await ctx.answerCbQuery('Type không hợp lệ');
        return;
    }
    const keys = loadKeys();
    const apikey = genApiKey(type);
    const entry = {
        apikey,
        type,
        note: `Created via Telegram by @${ctx.from.username}`,
        createdAt: new Date().toISOString()
    };
    if (type === 'free') {
        entry.hourlyLimit = Number(limit) > 0 ? Number(limit) : 60;
        entry.hourly = { hour: new Date().toISOString().slice(0, 13), used: 0 };
    }
    keys.push(entry);
    saveKeys(keys);
    await ctx.answerCbQuery('Đã tạo ✅');
    const text =
        `✅ <b>Tạo key thành công</b>\n\n` +
        `Loại: <b>${type}</b>` +
        (type === 'free' ? ` · ${entry.hourlyLimit}/h` : '') + `\n` +
        `<code>${apikey}</code>\n\n` +
        `<i>Bấm vào key để copy.</i>`;
    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Xem danh sách', 'keys'), Markup.button.callback('« Menu', 'menu')]
    ]);
    return show(ctx, { text, ...kb });
}

async function actionUnban(ctx, ip) {
    ddos.unban(ip);
    await ctx.answerCbQuery(`Đã gỡ ban ${ip} ✅`);
    return show(ctx, screenBans());
}

async function actionRestart(ctx) {
    await ctx.editMessageText('♻️ Đang khởi động lại server trong 1 giây...', { parse_mode: 'HTML' });
    log(`[BOT] Nhận lệnh /restart từ @${ctx.from.username}`, 'WARN');
    setTimeout(() => process.exit(0), 1000);
}

// ────────────── Register handlers ──────────────

function registerHandlers(b) {
    // Auth middleware: admin được tất cả; user thường chỉ được lệnh/action public.
    b.use(async (ctx, next) => {
        if (isAdmin(ctx)) return next();

        const text   = ctx.message?.text || '';
        const cbData = ctx.callbackQuery?.data || '';
        const isStart = text === '/start' || text.startsWith('/start ') || text.startsWith('/start@');
        const isHelp  = text === '/help'  || text.startsWith('/help ')  || text.startsWith('/help@');

        if (isStart || isHelp || paymentBot.isUserCommand(text) || paymentBot.isUserAction(cbData)) {
            return next();
        }

        if (ctx.callbackQuery) {
            try { await ctx.answerCbQuery('⛔️ Không có quyền', { show_alert: true }); } catch {}
            return;
        }
        if (text.startsWith('/')) {
            await ctx.reply(
                '👋 Xin chào! Bot này có các lệnh sau cho bạn:\n' +
                '/buy — Mua API key\n' +
                '/myorders — Đơn của tôi\n' +
                '/help — Trợ giúp'
            );
        }
        return;
    });

    // /start cho user thường → menu mua key
    b.start(async (ctx) => {
        if (isAdmin(ctx)) return send(ctx, screenMenu());
        return ctx.replyWithHTML(
            `👋 Xin chào <b>${escapeHtml(ctx.from.first_name || 'bạn')}</b>!\n\n` +
            `Đây là bot bán API key của <b>LauNa API</b>.\n\n` +
            `• /buy — Xem bảng giá & mua key\n` +
            `• /myorders — Xem đơn của bạn\n` +
            `• /help — Trợ giúp`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💎 Mua API Key', callback_data: 'buy' }],
                        [{ text: '📋 Đơn của tôi', callback_data: 'myorders' }]
                    ]
                }
            }
        );
    });
    b.help(async (ctx) => {
        if (isAdmin(ctx)) return send(ctx, screenHelp());
        return ctx.replyWithHTML(
            `<b>📖 Trợ giúp</b>\n\n` +
            `• /buy — Xem bảng giá & mua API key\n` +
            `• /myorders — Xem đơn của bạn\n\n` +
            `<i>Sau khi chuyển khoản, bấm nút "Tôi đã CK". Admin sẽ duyệt trong vài phút và gửi key về đây.</i>`
        );
    });

    // ── Slash commands (admin) ──
    b.command('menu', ctx => send(ctx, screenMenu()));
    b.command('stats',  async ctx => send(ctx, await screenStats()));
    b.command('health', ctx => send(ctx, screenHealth()));
    b.command('keys',   ctx => send(ctx, screenKeys()));
    b.command('bans',   ctx => send(ctx, screenBans()));

    b.command('key_add', async (ctx) => {
        const args = (ctx.message.text || '').split(/\s+/).slice(1);
        const type = (args[0] || 'free').toLowerCase();
        const lim = Number(args[1]) || 60;
        if (!['admin', 'premium', 'free'].includes(type)) {
            return ctx.reply('Cú pháp: /key_add <admin|premium|free> [limit]');
        }
        const keys = loadKeys();
        const apikey = genApiKey(type);
        const entry = {
            apikey, type,
            note: `Created via Telegram by @${ctx.from.username}`,
            createdAt: new Date().toISOString()
        };
        if (type === 'free') {
            entry.hourlyLimit = lim;
            entry.hourly = { hour: new Date().toISOString().slice(0, 13), used: 0 };
        }
        keys.push(entry);
        saveKeys(keys);
        await ctx.replyWithHTML(
            `✅ Tạo key <b>${type}</b>\n<code>${apikey}</code>` +
            (type === 'free' ? `\nLimit: ${lim}/h` : '')
        );
    });

    b.command('key_del', async (ctx) => {
        const target = ((ctx.message.text || '').split(/\s+/)[1] || '').trim();
        if (!target) return ctx.reply('Cú pháp: /key_del <apikey>');
        const keys = loadKeys();
        const entry = keys.find(k => k.apikey === target);
        if (!entry) return ctx.reply('❌ Không tìm thấy key.');
        if (String(entry.type).toLowerCase() === 'admin') {
            return ctx.reply('⛔️ Không xoá admin key qua bot.');
        }
        saveKeys(keys.filter(k => k.apikey !== target));
        await ctx.replyWithHTML(`🗑️ Đã xoá <code>${escapeHtml(target)}</code>`);
    });

    b.command('key_limit', async (ctx) => {
        const args = (ctx.message.text || '').split(/\s+/).slice(1);
        const target = (args[0] || '').trim();
        const lim = Number(args[1]);
        if (!target || !Number.isFinite(lim) || lim <= 0) {
            return ctx.reply('Cú pháp: /key_limit <apikey> <limit>');
        }
        const keys = loadKeys();
        const entry = keys.find(k => k.apikey === target);
        if (!entry) return ctx.reply('❌ Không tìm thấy key.');
        entry.hourlyLimit = lim;
        saveKeys(keys);
        await ctx.replyWithHTML(`✅ Limit <code>${escapeHtml(target)}</code> → <b>${lim}</b>/h`);
    });

    b.command('ban', async (ctx) => {
        const ip = ((ctx.message.text || '').split(/\s+/)[1] || '').trim();
        if (!ip) return ctx.reply('Cú pháp: /ban <ip>');
        ddos.permBan(ip);
        await ctx.replyWithHTML(`🚫 Đã ban <code>${escapeHtml(ip)}</code> 24h.`);
    });

    b.command('unban', async (ctx) => {
        const ip = ((ctx.message.text || '').split(/\s+/)[1] || '').trim();
        if (!ip) return ctx.reply('Cú pháp: /unban <ip>');
        ddos.unban(ip);
        await ctx.replyWithHTML(`✅ Đã gỡ ban <code>${escapeHtml(ip)}</code>.`);
    });

    b.command('restart', async (ctx) => send(ctx, screenRestartAsk()));

    // ── New slash commands ──
    b.command('top', ctx => {
        const h = Number((ctx.message.text || '').split(/\s+/)[1]) || 24;
        return send(ctx, screenTop(h));
    });
    b.command('errors',        ctx => send(ctx, screenErrors()));
    b.command('cache',         ctx => send(ctx, screenCache()));
    b.command('cache_clear',   async ctx => {
        const n = clearAllCaches();
        await ctx.replyWithHTML(`🧹 Đã xoá <b>${n}</b> cache namespace.`);
        return send(ctx, screenCache());
    });
    b.command('proxies',       ctx => send(ctx, screenProxies()));
    b.command('proxy_refresh', async ctx => {
        try {
            if (global.proxyPool && global.proxyPool.refresh) {
                global.proxyPool.refresh().catch(() => {});
                await ctx.reply('🔄 Đang refresh proxy pool...');
            } else await ctx.reply('❌ Pool chưa khởi động.');
        } catch (e) { await ctx.reply('❌ ' + e.message); }
    });
    b.command('db_clean', async ctx => send(ctx, await screenDbClean()));
    b.command('backup', ctx => actionBackup(ctx));
    b.command('search', async ctx => {
        const q = (ctx.message.text || '').split(/\s+/).slice(1).join(' ').trim();
        if (!q) {
            setWait(ctx.chat.id, 'search');
            return send(ctx, screenSearchPrompt());
        }
        return ctx.replyWithHTML(doSearch(q), { disable_web_page_preview: true });
    });
    b.command('key_type', async (ctx) => {
        const args = (ctx.message.text || '').split(/\s+/).slice(1);
        const target = (args[0] || '').trim();
        const newType = (args[1] || '').toLowerCase();
        if (!target || !['free', 'premium'].includes(newType)) {
            return ctx.reply('Cú pháp: /key_type <apikey> <free|premium>');
        }
        const ok = setKeyType(target, newType);
        if (!ok) return ctx.reply('❌ Không tìm thấy key (hoặc là admin).');
        await ctx.replyWithHTML(`✅ <code>${escapeHtml(target)}</code> → <b>${newType}</b>`);
    });
    b.command('notify_on',  async ctx => {
        addSubscribedChat(ctx.chat.id);
        return ctx.reply('🔔 Đã bật notify cho chat này.');
    });
    b.command('notify_off', async ctx => {
        removeSubscribedChat(ctx.chat.id);
        return ctx.reply('🔕 Đã tắt notify cho chat này.');
    });

    // ── Callback queries (button clicks) ──
    b.action('menu',          async ctx => { await ctx.answerCbQuery(); return show(ctx, screenMenu()); });
    b.action('stats',         async ctx => { await ctx.answerCbQuery(); return show(ctx, await screenStats()); });
    b.action('health',        async ctx => { await ctx.answerCbQuery(); return show(ctx, screenHealth()); });
    b.action('keys',          async ctx => { await ctx.answerCbQuery(); return show(ctx, screenKeys()); });
    b.action('bans',          async ctx => { await ctx.answerCbQuery(); return show(ctx, screenBans()); });
    b.action('newkey',        async ctx => { await ctx.answerCbQuery(); return show(ctx, screenNewKey()); });
    b.action('restart_ask',   async ctx => { await ctx.answerCbQuery(); return show(ctx, screenRestartAsk()); });
    b.action('restart_yes',   async ctx => { await ctx.answerCbQuery(); return actionRestart(ctx); });
    b.action('help',          async ctx => { await ctx.answerCbQuery(); return show(ctx, screenHelp()); });
    b.action('errors',        async ctx => { await ctx.answerCbQuery(); return show(ctx, screenErrors()); });
    b.action('cache',         async ctx => { await ctx.answerCbQuery(); return show(ctx, screenCache()); });
    b.action('proxies',       async ctx => { await ctx.answerCbQuery(); return show(ctx, screenProxies()); });
    b.action('notify',        async ctx => { await ctx.answerCbQuery(); return show(ctx, screenNotify(ctx.chat.id)); });
    b.action('backup',        async ctx => { await ctx.answerCbQuery('Đang gửi...'); return actionBackup(ctx); });
    b.action('dbclean',       async ctx => { await ctx.answerCbQuery(); return show(ctx, await screenDbClean()); });
    b.action(/^dbc:(.+)$/,    async ctx => actionDbClean(ctx, ctx.match[1]));

    b.action(/^top:(\d+)$/, async ctx => {
        await ctx.answerCbQuery();
        return show(ctx, screenTop(Number(ctx.match[1]) || 24));
    });

    b.action('cache_clear', async ctx => {
        const n = clearAllCaches();
        await ctx.answerCbQuery(`🧹 Đã xoá ${n} namespace`, { show_alert: true });
        return show(ctx, screenCache());
    });

    b.action('proxy_refresh', async ctx => {
        try {
            if (global.proxyPool && global.proxyPool.refresh) {
                global.proxyPool.refresh().catch(() => {});
                await ctx.answerCbQuery('🔄 Đang refresh...');
            } else await ctx.answerCbQuery('Pool chưa khởi động', { show_alert: true });
        } catch (e) { await ctx.answerCbQuery('❌ ' + e.message, { show_alert: true }); }
        return show(ctx, screenProxies());
    });

    b.action('search', async (ctx) => {
        await ctx.answerCbQuery();
        setWait(ctx.chat.id, 'search');
        return show(ctx, screenSearchPrompt());
    });

    b.action('notify_on', async ctx => {
        addSubscribedChat(ctx.chat.id);
        await ctx.answerCbQuery('🔔 Đã bật');
        return show(ctx, screenNotify(ctx.chat.id));
    });
    b.action('notify_off', async ctx => {
        removeSubscribedChat(ctx.chat.id);
        await ctx.answerCbQuery('🔕 Đã tắt');
        return show(ctx, screenNotify(ctx.chat.id));
    });

    b.action('banprompt', async (ctx) => {
        await ctx.answerCbQuery();
        setWait(ctx.chat.id, 'ban');
        const text = '<b>🚫 Ban IP</b>\n\nGửi địa chỉ IP cần ban (vd <code>1.2.3.4</code>).\nGõ /menu để huỷ.';
        const kb = Markup.inlineKeyboard([[Markup.button.callback('« Menu', 'menu')]]);
        return show(ctx, { text, ...kb });
    });

    b.action(/^kdel:(.+)$/,  async ctx => actionDeleteKey(ctx, ctx.match[1]));
    b.action(/^kdy:(.+)$/,   async ctx => actionConfirmDeleteKey(ctx, ctx.match[1]));
    b.action(/^mk:([^:]+):(\d+)$/, async ctx => actionMakeKey(ctx, ctx.match[1], ctx.match[2]));
    b.action(/^ubn:(.+)$/,   async ctx => actionUnban(ctx, ctx.match[1]));
    b.action(/^ktype:(free|premium):(.+)$/, async ctx => {
        const ok = setKeyType(ctx.match[2], ctx.match[1]);
        await ctx.answerCbQuery(ok ? `→ ${ctx.match[1]}` : '❌ Không đổi được', { show_alert: !ok });
        return show(ctx, screenKeys());
    });

    // ── Đăng ký module thanh toán ──
    paymentApi = paymentBot.register(b, {
        isAdmin, loadKeys, saveKeys, genApiKey, notifyAdmins, log
    });

    // ── Bắt text trả lời cho prompt (ban IP / search / payment) ──
    b.on('text', async (ctx) => {
        const txt = (ctx.message.text || '').trim();
        if (txt.startsWith('/')) return; // command đã có handler riêng

        // Ưu tiên payment waiting (admin sửa cấu hình / nhập lý do từ chối)
        if (paymentApi && await paymentApi.handleText(ctx)) return;

        const w = getWait(ctx.chat.id);
        if (!w) {
            if (isAdmin(ctx)) return send(ctx, screenMenu());
            return; // user thường gõ text vu vơ → bỏ qua
        }
        clearWait(ctx.chat.id);
        if (w.mode === 'ban') {
            const ip = txt;
            if (!/^[0-9a-f.:]+$/i.test(ip) || ip.length > 45) {
                return ctx.reply('❌ IP không hợp lệ.');
            }
            ddos.permBan(ip);
            await ctx.replyWithHTML(`🚫 Đã ban <code>${escapeHtml(ip)}</code> 24h.`);
            return send(ctx, screenBans());
        }
        if (w.mode === 'search') {
            return ctx.replyWithHTML(doSearch(txt), { disable_web_page_preview: true });
        }
    });
}

// ────────────── Helpers cho actions mới ──────────────

function clearAllCaches() {
    const { caches } = require('./data/cache');
    let n = 0;
    for (const c of caches.values()) {
        if (typeof c.clear === 'function') c.clear();
        else if (c.map && typeof c.map.clear === 'function') c.map.clear();
        n++;
    }
    return n;
}

function setKeyType(apikey, newType) {
    const keys = loadKeys();
    const e = keys.find(k => k.apikey === apikey);
    if (!e) return false;
    if (String(e.type).toLowerCase() === 'admin') return false;
    e.type = newType;
    if (newType === 'premium') {
        delete e.hourlyLimit;
        delete e.hourly;
    } else if (newType === 'free' && !e.hourlyLimit) {
        e.hourlyLimit = 100;
        e.hourly = { hour: new Date().toISOString().slice(0, 13), used: 0 };
    }
    saveKeys(keys);
    return true;
}

async function actionDbClean(ctx, type) {
    const { query, isEnabled } = require('./data/db');
    if (!isEnabled()) {
        await ctx.answerCbQuery('❌ DB chưa cấu hình', { show_alert: true });
        return;
    }
    const cutoff30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 13);
    const cleaners = {
        hourly:    () => query(`DELETE FROM request_hourly WHERE hour < $1`, [cutoff30]),
        notes:     () => query(`DELETE FROM notes WHERE expires_at IS NOT NULL AND expires_at <= NOW()`),
        tempmail:  () => query(`DELETE FROM tempmail_inboxes WHERE expires_at <= NOW()`),
        proxies:   () => query(`DELETE FROM user_proxies WHERE alive = false`),
        autoproxy: () => query(`DELETE FROM auto_proxy_clients WHERE expires_at <= NOW()`),
        shorturls: () => query(`DELETE FROM short_urls WHERE hits = 0 AND created_at < NOW() - INTERVAL '30 days'`),
        sharefiles:() => query(`DELETE FROM sharefiles WHERE created_at < NOW() - INTERVAL '90 days'`),
    };
    const labels = {
        hourly: 'Hourly >30d', notes: 'Notes hết hạn', tempmail: 'TempMail hết hạn',
        proxies: 'Proxy chết', autoproxy: 'Auto-proxy expired',
        shorturls: 'ShortURL cũ', sharefiles: 'Sharefiles cũ',
    };
    try {
        let total = 0;
        if (type === 'all') {
            for (const fn of Object.values(cleaners)) {
                const r = await fn();
                total += r.rowCount || 0;
            }
            await ctx.answerCbQuery(`✅ Đã dọn tất cả: xoá ${total} rows`);
        } else if (cleaners[type]) {
            const r = await cleaners[type]();
            total = r.rowCount || 0;
            await ctx.answerCbQuery(`✅ Xoá ${total} rows (${labels[type] || type})`);
        } else {
            await ctx.answerCbQuery('❌ Loại không hợp lệ', { show_alert: true });
            return;
        }
        log(`[BOT] DB clean [${type}]: xoá ${total} rows bởi @${ctx.from?.username}`, 'INFO');
    } catch (e) {
        await ctx.answerCbQuery(`❌ ${e.message.slice(0, 60)}`, { show_alert: true });
        log(`[BOT] DB clean [${type}] lỗi: ${e.message}`, 'ERROR');
        return;
    }
    return show(ctx, await screenDbClean());
}

async function actionBackup(ctx) {
    try {
        // Ghi keys từ in-memory store ra buffer để gửi qua Telegram (không cần file trên disk)
        const keysJson = JSON.stringify(loadKeys(), null, 2);
        const keysBuf  = Buffer.from(keysJson, 'utf-8');
        await ctx.replyWithDocument(
            { source: keysBuf, filename: 'apikeys.json' },
            { caption: `📦 apikeys.json — ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` }
        );
        // Block list vẫn đọc từ file (managed bởi ddos.js)
        if (fs.existsSync(BLOCK_PATH)) {
            await ctx.replyWithDocument(
                { source: BLOCK_PATH, filename: path.basename(BLOCK_PATH) },
                { caption: `📦 ${path.basename(BLOCK_PATH)} — ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` }
            );
        }
    } catch (e) {
        await ctx.reply('❌ Backup lỗi: ' + e.message);
    }
}

function describeError(e) {
    if (!e) return 'unknown error';
    const parts = [];
    if (e.code) parts.push(e.code);
    if (e.cause && e.cause.code && e.cause.code !== e.code) parts.push(e.cause.code);
    if (e.message) parts.push(e.message);
    else if (e.cause && e.cause.message) parts.push(e.cause.message);
    return parts.filter(Boolean).join(' — ') || (e.toString && e.toString()) || 'unknown error';
}

function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`${label} timeout sau ${ms}ms`)), ms);
        promise.then(
            v => { clearTimeout(t); resolve(v); },
            e => { clearTimeout(t); reject(e); }
        );
    });
}

// ────────────── Network agent ──────────────
// Render free tier hay route api.telegram.org qua IPv6 và bị nghẽn → ép IPv4.
// Optional: BOT_PROXY_URL = http(s)://[user:pass@]host:port → đi qua proxy HTTPS.

function buildAgent() {
    const proxyUrl = process.env.BOT_PROXY_URL || process.env.HTTPS_PROXY || '';
    if (proxyUrl) {
        try {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            log(`[BOT] Dùng HTTPS proxy: ${proxyUrl.replace(/\/\/[^@]+@/, '//***@')}`, 'INFO');
            return new HttpsProxyAgent(proxyUrl, {
                keepAlive: true,
                timeout: 30_000
            });
        } catch (e) {
            log(`[BOT] Không nạp được HttpsProxyAgent (${describeError(e)}), fallback IPv4 trực tiếp.`, 'WARN');
        }
    }
    return new https.Agent({
        family: 4,            // ép IPv4 — fix 90% lỗi cold-start trên Render/Cloud Run
        keepAlive: true,
        keepAliveMsecs: 10_000,
        timeout: 30_000,
        maxSockets: 50
    });
}

const COMMANDS = [
    // User-facing
    { command: 'buy',          description: '💎 Mua API key' },
    { command: 'myorders',     description: '📋 Đơn của tôi' },
    { command: 'help',         description: 'Hướng dẫn' },
    // Admin
    { command: 'menu',         description: 'Mở menu chính (admin)' },
    { command: 'orders',       description: '📥 Đơn chờ duyệt (admin)' },
    { command: 'approve',      description: '✅ Duyệt đơn (admin)' },
    { command: 'reject',       description: '❌ Từ chối đơn (admin)' },
    { command: 'payment_setup',description: '⚙️ Cấu hình STK/MoMo (admin)' },
    { command: 'stats',        description: 'Thống kê request' },
    { command: 'health',       description: 'Tình trạng server' },
    { command: 'top',          description: 'Top API key + IP' },
    { command: 'errors',       description: 'Log ERROR/WARN gần nhất' },
    { command: 'keys',         description: 'Danh sách API key' },
    { command: 'bans',         description: 'Danh sách IP bị ban' },
    { command: 'search',       description: 'Tìm key theo IP/prefix' },
    { command: 'cache',        description: 'Trạng thái cache' },
    { command: 'cache_clear',  description: 'Xoá toàn bộ cache' },
    { command: 'proxies',      description: 'Trạng thái proxy pool' },
    { command: 'proxy_refresh',description: 'Refresh proxy pool' },
    { command: 'backup',       description: 'Backup apikeys + listIP' },
    { command: 'notify_on',    description: 'Bật notify chat này' },
    { command: 'notify_off',   description: 'Tắt notify chat này' },
    { command: 'db_clean',     description: 'Dọn dẹp database (xoá dữ liệu hết hạn)' },
    { command: 'restart',      description: 'Khởi động lại server' }
];

// ────────────── Notification subsystem ──────────────
// Lưu danh sách chat đã đăng ký nhận thông báo vào data/admin-chats.json.

const _ADMIN_CHATS_DEFAULT = path.join(process.cwd(), 'data', 'admin-chats.json');
const _ADMIN_CHATS_TMP    = '/tmp/launa-admin-chats.json';
function _resolveAdminChatsPath() {
    try { fs.accessSync(path.dirname(_ADMIN_CHATS_DEFAULT), fs.constants.W_OK); return _ADMIN_CHATS_DEFAULT; }
    catch { return _ADMIN_CHATS_TMP; }
}
const ADMIN_CHATS_PATH = _resolveAdminChatsPath();
const RAM_ALERT_MB = Number(process.env.RAM_ALERT_MB) || 450;
const ERROR_BATCH_MS = 30_000;

let _adminChats = new Set();
let _errorBuffer = [];
let _errorFlushTimer = null;
let _lastRamAlertAt = 0;
let _notifySetup = false;

function loadAdminChats() {
    try {
        const raw = JSON.parse(fs.readFileSync(ADMIN_CHATS_PATH, 'utf-8'));
        _adminChats = new Set(Array.isArray(raw) ? raw : []);
    } catch { _adminChats = new Set(); }
}

function saveAdminChats() {
    const snapshot = JSON.stringify([..._adminChats], null, 2);
    setImmediate(async () => {
        try {
            await fs.promises.mkdir(path.dirname(ADMIN_CHATS_PATH), { recursive: true });
            await fs.promises.writeFile(ADMIN_CHATS_PATH, snapshot);
        } catch (e) {
            log(`[BOT] Không lưu được admin-chats.json: ${e.message}`, 'WARN');
        }
    });
}

function addSubscribedChat(id)    { _adminChats.add(id); saveAdminChats(); }
function removeSubscribedChat(id) { _adminChats.delete(id); saveAdminChats(); }
function isSubscribedChat(id)     { return _adminChats.has(id); }
function listSubscribedChats()    { return [..._adminChats]; }

async function notifyAdmins(text, opts = {}) {
    if (!bot || !_adminChats.size) return;
    for (const chatId of _adminChats) {
        try {
            await bot.telegram.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
                disable_notification: !!opts.silent,
                reply_markup: opts.reply_markup
            });
        } catch (e) {
            // Chat có thể bị block bot → xoá
            if (/blocked|chat not found|kicked/i.test(e.message || '')) {
                _adminChats.delete(chatId);
                saveAdminChats();
            }
        }
    }
}

function flushErrorBuffer() {
    _errorFlushTimer = null;
    if (!_errorBuffer.length) return;
    const items = _errorBuffer.splice(0, 10);
    const more = _errorBuffer.length;
    _errorBuffer.length = 0;
    const lines = items.map(e => {
        const t = new Date(e.ts).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
        return `🔴 <code>${t}</code> ${escapeHtml(e.message.slice(0, 250))}`;
    }).join('\n');
    const tail = more > 0 ? `\n\n<i>...và ${more} lỗi khác bị bỏ qua</i>` : '';
    notifyAdmins(`<b>🚨 ${items.length} lỗi mới</b>\n\n${lines}${tail}`);
}

function setupNotifications() {
    if (_notifySetup) return;
    _notifySetup = true;
    loadAdminChats();

    // 1) Subscribe log.ERROR → gom 30s rồi push
    log.subscribe((entry) => {
        if (entry.level !== 'ERROR') return;
        // Tránh feedback loop nếu chính bot log lỗi gửi tin
        if (/^\[BOT\]/.test(entry.message)) return;
        _errorBuffer.push(entry);
        if (_errorBuffer.length > 100) _errorBuffer.shift();
        if (!_errorFlushTimer) {
            _errorFlushTimer = setTimeout(flushErrorBuffer, ERROR_BATCH_MS);
            _errorFlushTimer.unref && _errorFlushTimer.unref();
        }
    });

    // 2) Subscribe ddos.permBan → notify ngay
    ddos.onPermBan(({ ip, exp, reason }) => {
        const expStr = new Date(exp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        notifyAdmins(
            `<b>🚫 IP bị ban 24h</b>\n\n` +
            `IP: <code>${escapeHtml(ip)}</code>\n` +
            `Lý do: ${escapeHtml(reason || 'rate-limit')}\n` +
            `Hết hạn: ${expStr}`
        );
    });

    // 3) Theo dõi RAM RSS, alert nếu vượt ngưỡng (cooldown 30 phút)
    const ramTimer = setInterval(() => {
        const rssMB = process.memoryUsage().rss / 1024 / 1024;
        if (rssMB < RAM_ALERT_MB) return;
        if (Date.now() - _lastRamAlertAt < 30 * 60 * 1000) return;
        _lastRamAlertAt = Date.now();
        notifyAdmins(
            `<b>⚠️ RAM cao</b>\n\n` +
            `RSS: <b>${rssMB.toFixed(1)} MB</b> (ngưỡng ${RAM_ALERT_MB} MB)\n` +
            `Uptime: ${fmtUptime(process.uptime())}`
        );
    }, 60_000);
    ramTimer.unref && ramTimer.unref();

    log(`[BOT] Notifications sẵn sàng — ${_adminChats.size} chat đăng ký, ngưỡng RAM ${RAM_ALERT_MB} MB.`, 'INFO');

    // 4) Auto DB clean mỗi 24h — xoá dữ liệu hết hạn để tránh tràn DB
    const autoDbClean = setInterval(async () => {
        const { query: dbQ, isEnabled: dbOk } = require('./data/db');
        if (!dbOk()) return;
        try {
            const cutoff30 = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 13);
            const results = await Promise.all([
                dbQ(`DELETE FROM request_hourly WHERE hour < $1`, [cutoff30]),
                dbQ(`DELETE FROM notes WHERE expires_at IS NOT NULL AND expires_at <= NOW()`),
                dbQ(`DELETE FROM tempmail_inboxes WHERE expires_at <= NOW()`),
                dbQ(`DELETE FROM auto_proxy_clients WHERE expires_at <= NOW()`),
                dbQ(`DELETE FROM user_proxies WHERE alive = false`),
            ]);
            const total = results.reduce((s, r) => s + (r.rowCount || 0), 0);
            if (total > 0) log(`[BOT] Auto DB clean: xoá ${total} rows.`, 'INFO');
        } catch (e) {
            log(`[BOT] Auto DB clean lỗi: ${e.message}`, 'WARN');
        }
    }, 24 * 60 * 60 * 1000);
    autoDbClean.unref && autoDbClean.unref();
}

let watchdogTimer = null;
let consecutiveFails = 0;

function stopWatchdog() {
    if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
    }
}

function startWatchdog(b) {
    stopWatchdog();
    consecutiveFails = 0;
    // Mỗi 5 phút ping getMe; fail 2 lần liên tiếp → coi như polling chết → relaunch.
    watchdogTimer = setInterval(async () => {
        try {
            await withTimeout(b.telegram.getMe(), 15_000, 'watchdog getMe()');
            consecutiveFails = 0;
        } catch (e) {
            consecutiveFails++;
            log(`[BOT] Watchdog ping fail (${consecutiveFails}/2): ${describeError(e)}`, 'WARN');
            if (consecutiveFails >= 2) {
                consecutiveFails = 0;
                log('[BOT] Watchdog: bot có vẻ chết, thử relaunch polling…', 'WARN');
                try { await b.stop('watchdog-restart'); } catch {}
                b.launch({ dropPendingUpdates: true })
                    .catch(err => log(`[BOT] Relaunch polling lỗi: ${describeError(err)}`, 'ERROR'));
            }
        }
    }, 5 * 60 * 1000);
    watchdogTimer.unref && watchdogTimer.unref();
}

async function tryGetMe(b) {
    try {
        return await withTimeout(b.telegram.getMe(), 15_000, 'getMe()');
    } catch (e) {
        log(`[BOT] getMe() thất bại, tiếp tục khởi động: ${describeError(e)}`, 'WARN');
        return null;
    }
}

async function startInPollingMode(b) {
    const me = await tryGetMe(b);
    if (me) log(`[BOT] Telegram admin bot online: @${me.username} (id ${me.id})`, 'INFO');
    try { await b.telegram.setMyCommands(COMMANDS); } catch {}
    // launch() trong polling mode resolve chỉ khi bot stop → KHÔNG await.
    // Nếu polling chết giữa chừng (network drop), watchdog sẽ relaunch.
    b.launch({ dropPendingUpdates: true })
        .catch(e => log(`[BOT] launch() polling lỗi: ${describeError(e)}`, 'ERROR'));
    startWatchdog(b);
    started = true;
}

async function startInWebhookMode(b, webhookUrl) {
    const me = await tryGetMe(b);
    if (me) log(`[BOT] Telegram admin bot online: @${me.username} (id ${me.id}) — chế độ webhook`, 'INFO');
    try { await b.telegram.setMyCommands(COMMANDS); } catch {}
    // Đăng ký webhook với Telegram
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;
    await withTimeout(
        b.telegram.setWebhook(webhookUrl, { drop_pending_updates: true, secret_token: secret }),
        15_000, 'setWebhook()'
    );
    log(`[BOT] Webhook đã đăng ký: ${webhookUrl}`, 'INFO');
    started = true;
    // Express sẽ mount handler — xem getWebhookHandler()
}

async function startBot() {
    if (started) return;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        log('[BOT] TELEGRAM_BOT_TOKEN chưa có — bỏ qua khởi động bot Telegram.', 'WARN');
        return;
    }

    const agent = buildAgent();
    bot = new Telegraf(token, {
        handlerTimeout: 90_000,
        telegram: {
            agent,
            apiRoot: process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org'
        }
    });
    registerHandlers(bot);
    setupNotifications();

    bot.catch((err, ctx) => {
        log(`[BOT] Lỗi xử lý update: ${describeError(err)}`, 'ERROR');
        try { ctx.reply('❌ Lỗi: ' + describeError(err)); } catch {}
    });

    process.once('SIGINT',  () => { stopWatchdog(); try { bot && bot.stop('SIGINT');  } catch {} });
    process.once('SIGTERM', () => { stopWatchdog(); try { bot && bot.stop('SIGTERM'); } catch {} });

    const webhookBase = process.env.BOT_WEBHOOK_URL || '';
    const useWebhook = !!webhookBase;
    const fullWebhookUrl = useWebhook
        ? webhookBase.replace(/\/+$/, '') + getWebhookPath()
        : null;

    // Ở webhook mode cũng cần tháo webhook cũ trước khi chuyển sang polling
    // (lần deploy trước có thể đã set webhook). Làm best-effort, không chặn.
    if (!useWebhook) {
        try {
            await withTimeout(bot.telegram.deleteWebhook({ drop_pending_updates: true }), 10_000, 'deleteWebhook()');
        } catch (e) {
            log(`[BOT] deleteWebhook (chuyển sang polling) lỗi: ${describeError(e)}`, 'WARN');
        }
    }

    // Retry để chịu được mạng chập chờn lúc cold-start.
    // Dùng delays ngắn hơn trên serverless (Leapcell/Render) để fail nhanh.
    const delays = [3_000, 6_000, 15_000, 30_000];
    const maxAttempts = delays.length + 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (useWebhook) await startInWebhookMode(bot, fullWebhookUrl);
            else            await startInPollingMode(bot);
            return;
        } catch (e) {
            const msg = describeError(e);
            const isAuthErr = /401|unauthorized/i.test(msg);
            if (isAuthErr) {
                log(`[BOT] Token không hợp lệ, dừng thử khởi động: ${msg}`, 'ERROR');
                return;
            }
            if (attempt >= maxAttempts) {
                log(`[BOT] Không khởi động được sau ${attempt} lần thử: ${msg}`, 'ERROR');
                return;
            }
            const wait = delays[attempt - 1];
            log(`[BOT] Khởi động thất bại (lần ${attempt}/${maxAttempts}): ${msg}. ` +
                `Thử lại sau ${Math.round(wait / 1000)}s.`, 'WARN');
            await new Promise(r => setTimeout(r, wait));
        }
    }
}

// ────────────── Webhook helpers (cho Express mount) ──────────────

function getWebhookPath() {
    // Path bí mật, suy ra từ token để client lạ không đoán được.
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    const hash = require('crypto').createHash('sha256')
        .update(token + '|launa-webhook').digest('hex').slice(0, 24);
    return `/tg-webhook/${hash}`;
}

function getWebhookHandler() {
    if (!bot) return null;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET || undefined;
    return bot.webhookCallback(getWebhookPath(), { secretToken: secret });
}

// Gọi trực tiếp từ Express route — không cần path-matching của Telegraf.
// req.body phải đã được parse bởi express.json() trước đó.
// webhookReply: false → bot.handleUpdate không cần res, xử lý bất đồng bộ.
function handleWebhookUpdate(body) {
    if (!bot || !body) return false;
    try {
        bot.handleUpdate(body).catch(e =>
            log(`[BOT] handleWebhookUpdate async lỗi: ${e.message}`, 'ERROR')
        );
        return true;
    } catch (e) {
        log(`[BOT] handleWebhookUpdate lỗi: ${e.message}`, 'ERROR');
        return false;
    }
}

module.exports = { startBot, getWebhookPath, getWebhookHandler, handleWebhookUpdate };
