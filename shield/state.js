'use strict';

const { EventEmitter } = require('node:events');

class ShieldState extends EventEmitter {
    constructor() {
        super();
        this.stats = {
            totalRequests: 0,
            passedRequests: 0,
            blockedRequests: 0,
            challengeIssued: 0,
            challengeSolved: 0,
            startedAt: Date.now(),
            rps: 0,
            peakRps: 0,
        };
        this.bannedIps = new Map();
        this.violations = new Map();
        this.recent = [];
        this.history = {
            passed: new Array(60).fill(0),
            blocked: new Array(60).fill(0),
        };
    }

    recordAttack(ev) {
        const full = { ts: Date.now(), ...ev };
        this.recent.unshift(full);
        if (this.recent.length > 100) this.recent.pop();
        this.emit('attack', full);
    }

    isBanned(ip) {
        const entry = this.bannedIps.get(ip);
        if (!entry) return { banned: false };
        if (entry.until < Date.now()) {
            this.bannedIps.delete(ip);
            return { banned: false };
        }
        return { banned: true, reason: entry.reason };
    }

    ban(ip, durationMs, reason) {
        this.bannedIps.set(ip, { until: Date.now() + durationMs, reason });
    }

    unban(ip) {
        this.bannedIps.delete(ip);
    }

    bumpViolation(ip, windowMs) {
        const now = Date.now();
        const v = this.violations.get(ip);
        if (!v || v.resetAt < now) {
            this.violations.set(ip, { count: 1, resetAt: now + windowMs });
            return 1;
        }
        v.count++;
        return v.count;
    }

    cleanupExpired() {
        const now = Date.now();
        for (const [ip, e] of this.bannedIps) if (e.until < now) this.bannedIps.delete(ip);
        for (const [ip, v] of this.violations) if (v.resetAt < now) this.violations.delete(ip);
    }
}

const state = new ShieldState();

let lastTotal = 0;
let secondPassed = 0;
let secondBlocked = 0;

function startStatsTicker() {
    setInterval(() => {
        const total = state.stats.totalRequests;
        const rps = total - lastTotal;
        lastTotal = total;
        state.stats.rps = rps;
        if (rps > state.stats.peakRps) state.stats.peakRps = rps;

        state.history.passed.shift();
        state.history.passed.push(secondPassed);
        state.history.blocked.shift();
        state.history.blocked.push(secondBlocked);
        secondPassed = 0;
        secondBlocked = 0;

        state.cleanupExpired();
    }, 1000).unref();
}

function tickPassed() { secondPassed++; }
function tickBlocked() { secondBlocked++; }

module.exports = { state, startStatsTicker, tickPassed, tickBlocked };
