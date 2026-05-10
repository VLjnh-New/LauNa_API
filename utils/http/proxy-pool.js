'use strict';

const axios            = require("axios");
const { getProxies }   = require("./proxy-scraper");

let proxyStore = null;
try { proxyStore = require('../data/proxy-store'); } catch { proxyStore = null; }

const POOL_SIZE     = 300;
const MIN_POOL      = 50;
const MAX_PING_MS   = 3000;
const CHECK_TIMEOUT = 5000;
const CHECK_URL     = "http://www.gstatic.com/generate_204"; // Google stable, trả 204 nhanh, không log IP
const CONCURRENCY   = 40;
const REFRESH_MS    = 15 * 60 * 1000;

let pool        = [];
let refreshing  = false;
let lastRefresh = 0;

async function checkOne({ ip, port, ...rest }) {
    const t0 = Date.now();
    try {
        await axios.get(CHECK_URL, { proxy: { host: ip, port: +port }, timeout: CHECK_TIMEOUT });
        const ms = Date.now() - t0;
        return ms <= MAX_PING_MS ? { ip, port, ms, failCount: 0, ...rest } : null;
    } catch { return null; }
}

async function checkBatch(proxies) {
    const alive = [];
    for (let i = 0; i < proxies.length; i += CONCURRENCY) {
        const res = await Promise.all(proxies.slice(i, i + CONCURRENCY).map(checkOne));
        alive.push(...res.filter(Boolean));
    }
    return alive.sort((a, b) => a.ms - b.ms);
}

async function loadDbProxies() {
    if (!proxyStore) return [];
    try {
        const rows = await proxyStore.listProxies({ aliveOnly: true, limit: POOL_SIZE * 3 });
        return rows.map(r => ({
            ip: r.ip, port: String(r.port),
            https: (r.protocol || 'http') === 'https',
            source: r.source || 'db',
        }));
    } catch { return []; }
}

async function loadUserSources() {
    if (!proxyStore) return [];
    try {
        const rows = await proxyStore.listSources();
        return rows.map(r => r.url);
    } catch { return []; }
}

async function persistAlive(alive) {
    if (!proxyStore || !alive.length) return;
    try {
        await proxyStore.saveProxiesBulk(alive.map(p => ({
            ip: p.ip, port: +p.port,
            protocol: p.https ? 'https' : 'http',
            source: p.source || 'pool',
            alive: true, ms: p.ms,
        })));
    } catch {}
}

async function refetch() {
    if (refreshing) return;
    refreshing = true;
    try {
        const userSources = await loadUserSources();
        // Ưu tiên proxy từ DB (đã từng alive) + scraper mới + nguồn user
        const dbProxies   = await loadDbProxies();
        const scraped     = await getProxies(POOL_SIZE * 5, userSources);
        const seen        = new Set();
        const merged      = [...dbProxies, ...scraped].filter(p => {
            const k = `${p.ip}:${p.port}`;
            if (seen.has(k)) return false;
            seen.add(k); return true;
        });

        const live = await checkBatch(merged);
        if (live.length > 0) {
            pool = live.slice(0, POOL_SIZE);
            lastRefresh = Date.now();
            // Backup proxy alive vào DB cho lần restart sau
            persistAlive(pool).catch(() => {});
        }
    } catch { /* silent */ } finally { refreshing = false; }
}

function pick(excludeKeys) {
    if (!pool.length) return null;
    const top = pool.slice(0, Math.min(40, pool.length));
    const candidates = excludeKeys && excludeKeys.size
        ? top.filter(p => !excludeKeys.has(`${p.ip}:${p.port}`))
        : top;
    const list = candidates.length ? candidates : top;
    return list[Math.floor(Math.random() * list.length)];
}

function markFail(ip, port, weight = 1) {
    const p = pool.find(x => x.ip === ip && x.port === port);
    if (!p) return;
    p.failCount = (p.failCount || 0) + weight;
    if (p.failCount >= 3) {
        pool = pool.filter(x => !(x.ip === ip && x.port === port));
        // Lưu thất bại vào DB (đánh dấu chết nếu fail lặp lại)
        if (proxyStore) proxyStore.markProxyFail(ip, +port).catch(() => {});
        if (pool.length < MIN_POOL && !refreshing) refetch();
    }
}

function markRateLimited(ip, port) {
    // 429 → coi như chết ngay lập tức cho upstream này (tránh lặp lại lên cùng IP)
    markFail(ip, port, 3);
}

async function axiosProxy(config, retries = 2) {
    const tried = new Set();
    let lastErr;
    for (let i = 0; i <= retries; i++) {
        const p = pick(tried);
        if (!p) {
            // Hết proxy khả dụng → gọi thẳng (không proxy)
            return axios(config);
        }
        tried.add(`${p.ip}:${p.port}`);
        try {
            const res = await axios({ ...config, proxy: { host: p.ip, port: +p.port } });
            if (res && res.status === 429) {
                markRateLimited(p.ip, p.port);
                lastErr = new Error(`HTTP 429 via ${p.ip}:${p.port}`);
                continue;
            }
            return res;
        } catch (e) {
            const status = e?.response?.status;
            if (status === 429) markRateLimited(p.ip, p.port);
            else markFail(p.ip, p.port);
            lastErr = e;
        }
    }
    throw lastErr || new Error('Pool proxy: hết lượt thử');
}

const proxyPool = {
    async init() {
        await refetch();
        setInterval(() => { if (Date.now() - lastRefresh >= REFRESH_MS) refetch(); }, 5 * 60 * 1000).unref();
    },
    pick,
    markFail,
    getStats: () => ({ total: pool.length, refreshing, lastRefresh: lastRefresh ? new Date(lastRefresh).toISOString() : null, proxies: pool.map(p => `${p.ip}:${p.port} ${p.ms}ms`) }),
    getAxiosProxy: () => { const p = pick(); return p ? { proxy: { host: p.ip, port: +p.port } } : {}; },
    axios: axiosProxy,
    get:  (url, cfg = {}) => axiosProxy({ ...cfg, method: "get",  url }),
    post: (url, data, cfg = {}) => axiosProxy({ ...cfg, method: "post", url, data }),
    refresh: refetch
};

module.exports = { proxyPool };
