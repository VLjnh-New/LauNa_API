'use strict';

/**
 * Quản lý đơn thanh toán — lưu JSON tại data/payment-orders.json
 * (đơn giản, không phụ thuộc DB; dễ migrate sang Postgres sau).
 *
 * Status: pending → user_paid → approved | rejected | expired
 *
 * FIX: Dùng in-memory cache + async flush thay vì sync read/write mỗi thao tác.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(process.cwd(), 'data', 'payment-orders.json');
const TTL_MS = 30 * 60 * 1000;
const KEEP_RECENT_DAYS = 30;

// ─── In-memory store ─────────────────────────────────────────────────────────

let _list = null;
let _dirty = false;
let _flushing = false;

function ensureLoaded() {
    if (_list !== null) return;
    try {
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        _list = Array.isArray(raw) ? raw : [];
    } catch {
        _list = [];
    }
}

async function flushAsync() {
    if (!_dirty || _flushing) return;
    _flushing = true;
    const snapshot = JSON.stringify(_list, null, 2);
    try {
        const dir = path.dirname(FILE);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(FILE, snapshot);
        _dirty = false;
    } catch (e) {
        if (typeof global.log === 'function') global.log(`[ORDERS] Flush lỗi: ${e.message}`, 'WARN');
    } finally {
        _flushing = false;
    }
}

const _flushTimer = setInterval(flushAsync, 5000);
if (_flushTimer.unref) _flushTimer.unref();

function load() {
    ensureLoaded();
    return _list;
}

function save(list) {
    _list = list;
    _dirty = true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function genOrderId() {
    const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
    return 'LAUNA-' + s;
}

function cleanup(list) {
    const cutoff = Date.now() - KEEP_RECENT_DAYS * 24 * 3600 * 1000;
    for (const o of list) {
        if (o.status === 'pending' && new Date(o.expiresAt).getTime() < Date.now()) {
            o.status = 'expired';
        }
    }
    for (let i = list.length - 1; i >= 0; i--) {
        if (new Date(list[i].createdAt).getTime() < cutoff
            && ['expired', 'rejected'].includes(list[i].status)) {
            list.splice(i, 1);
        }
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

function create({ telegramId, telegramUsername, plan, channel }) {
    const list = load();
    const order = {
        id: genOrderId(),
        telegramId,
        telegramUsername: telegramUsername || '',
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        type: plan.type,
        days: plan.days,
        channel,
        status: 'pending',
        apiKey: null,
        rejectReason: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
        userPaidAt: null,
        approvedAt: null,
        approvedBy: null
    };
    list.push(order);
    cleanup(list);
    save(list);
    return order;
}

function get(orderId) {
    return load().find(o => o.id === orderId) || null;
}

function update(orderId, patch) {
    const list = load();
    const o = list.find(x => x.id === orderId);
    if (!o) return null;
    Object.assign(o, patch);
    save(list);
    return o;
}

function markUserPaid(orderId) {
    return update(orderId, { status: 'user_paid', userPaidAt: new Date().toISOString() });
}

function approve(orderId, adminUsername, apiKey) {
    return update(orderId, {
        status: 'approved',
        apiKey,
        approvedAt: new Date().toISOString(),
        approvedBy: adminUsername || ''
    });
}

function reject(orderId, adminUsername, reason) {
    return update(orderId, {
        status: 'rejected',
        rejectReason: reason || '',
        approvedAt: new Date().toISOString(),
        approvedBy: adminUsername || ''
    });
}

function listPending(limit = 20) {
    return load()
        .filter(o => o.status === 'pending' || o.status === 'user_paid')
        .filter(o => new Date(o.expiresAt).getTime() > Date.now() || o.status === 'user_paid')
        .sort((a, b) => (b.userPaidAt || b.createdAt).localeCompare(a.userPaidAt || a.createdAt))
        .slice(0, limit);
}

function listByUser(telegramId, limit = 10) {
    return load()
        .filter(o => o.telegramId === telegramId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);
}

module.exports = {
    genOrderId, create, get, update,
    markUserPaid, approve, reject,
    listPending, listByUser
};
