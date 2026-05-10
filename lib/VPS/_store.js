'use strict';

// Store đơn giản cho danh sách VPS user (token -> vnc_link).
// helper:true để auto-loader bỏ qua, không expose endpoint riêng.
// FIX: Dùng in-memory cache + async flush thay vì sync read/write mỗi thao tác.
module.exports.helper = true;

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'data', 'vpsuser.json');

// ─── In-memory store ─────────────────────────────────────────────────────────

let _data = null;
let _dirty = false;
let _flushing = false;

function ensureDir() {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function ensureLoaded() {
    if (_data !== null) return;
    try {
        if (!fs.existsSync(FILE)) { _data = {}; return; }
        _data = JSON.parse(fs.readFileSync(FILE, 'utf8') || '{}');
    } catch { _data = {}; }
}

async function flushAsync() {
    if (!_dirty || _flushing) return;
    _flushing = true;
    const snapshot = JSON.stringify(_data, null, 2);
    try {
        ensureDir();
        await fs.promises.writeFile(FILE, snapshot, 'utf8');
        _dirty = false;
    } catch (e) {
        try { require('../../utils/logger')(`[VPS] Flush lỗi: ${e.message}`, 'WARN'); } catch {}
    } finally {
        _flushing = false;
    }
}

const _flushTimer = setInterval(flushAsync, 5000);
if (_flushTimer.unref) _flushTimer.unref();

// ─── Public API ───────────────────────────────────────────────────────────────

function load() {
    ensureLoaded();
    return _data;
}

function save(token, link) {
    try {
        ensureLoaded();
        _data[token] = { link, updatedAt: new Date().toISOString() };
        _dirty = true;
        return true;
    } catch { return false; }
}

function get(token) {
    ensureLoaded();
    return _data[token] || null;
}

function list() {
    ensureLoaded();
    return Object.entries(_data).map(([token, v]) => ({
        token: token.slice(0, 10) + '***',
        link: v.link,
        updatedAt: v.updatedAt
    }));
}

function remove(token) {
    try {
        ensureLoaded();
        if (!_data[token]) return false;
        delete _data[token];
        _dirty = true;
        return true;
    } catch { return false; }
}

// ─── Auto-prune (TTL 8h) ─────────────────────────────────────────────────────

const TTL_MS = 8 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function pruneStale() {
    try {
        ensureLoaded();
        const now = Date.now();
        let removed = 0;
        for (const [token, v] of Object.entries(_data)) {
            const ts = v && v.updatedAt ? Date.parse(v.updatedAt) : 0;
            if (!ts || (now - ts) > TTL_MS) {
                delete _data[token];
                removed++;
            }
        }
        if (removed > 0) {
            _dirty = true;
            try { require('../../utils/logger')(`[VPS] Auto-prune: dọn ${removed} entry quá hạn`, 'API'); } catch {}
        }
        return removed;
    } catch { return 0; }
}

let _sweepTimer = null;
function startAutoPrune() {
    if (_sweepTimer) return;
    pruneStale();
    _sweepTimer = setInterval(pruneStale, SWEEP_INTERVAL_MS);
    if (_sweepTimer.unref) _sweepTimer.unref();
}
startAutoPrune();

module.exports.load = load;
module.exports.save = save;
module.exports.get = get;
module.exports.list = list;
module.exports.remove = remove;
module.exports.pruneStale = pruneStale;
module.exports.TTL_MS = TTL_MS;
