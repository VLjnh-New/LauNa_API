'use strict';

class RateLimiter {
    constructor(windowMs, maxRequests, burst) {
        this.windowMs = windowMs;
        this.maxRequests = maxRequests;
        this.burst = burst;
        this.buckets = new Map();
    }

    hit(ip) {
        const now = Date.now();
        let b = this.buckets.get(ip);
        if (!b) {
            b = { tokens: this.burst, lastRefill: now, windowStart: now, windowCount: 0 };
            this.buckets.set(ip, b);
        }

        const elapsed = now - b.lastRefill;
        const refill = (elapsed / this.windowMs) * this.maxRequests;
        if (refill > 0) {
            b.tokens = Math.min(this.burst, b.tokens + refill);
            b.lastRefill = now;
        }

        if (now - b.windowStart > this.windowMs) {
            b.windowStart = now;
            b.windowCount = 0;
        }
        b.windowCount++;

        if (b.tokens < 1) return false;
        b.tokens--;
        return true;
    }

    cleanup() {
        const now = Date.now();
        for (const [ip, b] of this.buckets) {
            if (now - b.lastRefill > this.windowMs * 60) this.buckets.delete(ip);
        }
    }

    size() {
        return this.buckets.size;
    }
}

module.exports = { RateLimiter };
