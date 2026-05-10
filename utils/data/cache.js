'use strict';

/**
 * LRU cache đơn giản, không cần dependency ngoài.
 * Dùng cho các response idempotent (vd. tìm nhạc, danh sách model).
 */
class LRU {
    constructor({ max = 200, ttl = 60_000 } = {}) {
        this.max = max;
        this.ttl = ttl;
        this.map = new Map();
    }

    get(key) {
        const entry = this.map.get(key);
        if (!entry) return undefined;
        if (entry.exp < Date.now()) {
            this.map.delete(key);
            return undefined;
        }
        // refresh recency
        this.map.delete(key);
        this.map.set(key, entry);
        return entry.value;
    }

    set(key, value, ttl) {
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, { value, exp: Date.now() + (ttl || this.ttl) });
        if (this.map.size > this.max) {
            const oldestKey = this.map.keys().next().value;
            this.map.delete(oldestKey);
        }
    }

    delete(key) { this.map.delete(key); }
    clear()     { this.map.clear(); }
    get size()  { return this.map.size; }
}

const caches = new Map();
function namespace(name, opts) {
    if (!caches.has(name)) caches.set(name, new LRU(opts));
    return caches.get(name);
}

module.exports = { LRU, namespace, caches };
