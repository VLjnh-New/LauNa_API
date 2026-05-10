'use strict';

const axios   = require("axios");
const cheerio = require("cheerio");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

function parseLines(text, https = false, source = "?") {
    return text.split("\n")
        .map(l => l.trim())
        .filter(l => /^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(l))
        .map(l => { const [ip, port] = l.split(":"); return { ip, port, https, source, code: "??" }; });
}



// Trọng số nguồn dựa trên benchmark live-rate (cao = ưu tiên).
// Đo bằng /proxy/api/stats refetch; cập nhật khi cần.
const SOURCE_WEIGHTS = {
    // ── Đã verify/checked sẵn ──────────────────────────────────
    'elliottophellia-checked': 120,
    'murongpig-checked':       115,
    'saisuiu-verified':        110,
    'proxyscrape-elite':       100,
    // ── Nguồn cũ ───────────────────────────────────────────────
    'free-proxy-list':          95,
    'monosans-http':            85,
    'sslproxies':               75,
    'proxyscrape':              55,
    'geonode':                  45,
    'TheSpeedX-http':           35,
    'giftedtech':               35,
    // ── Nguồn mới live cao ─────────────────────────────────────
    'zevtyardt-http':           80,
    'rdavydov-http':            75,
    'aliilapro-http':           70,
    'vakhov-http':              70,
    'andigwandi-http':          65,
    'mmpx12-http':              60,
    'zaeem20-http':             55,
    'jetkai-http':              50,
    'roosterkid-http':          45,
    'shiftytr-http':            40,
    'zloi-http':                40,
};
function srcWeight(label) {
    if (!label) return 1;
    if (label in SOURCE_WEIGHTS) return SOURCE_WEIGHTS[label];
    if (label.startsWith('user:')) return 50; // nguồn do user thêm: ưu tiên trung bình
    return 20;
}

const SOURCES = [
    {
        url: "https://free-proxy-list.net/",
        parse: ($) => {
            const list = [];
            $("table tbody tr").each((_, row) => {
                const c = $(row).find("td").map((_, td) => $(td).text().trim()).get();
                if (/^\d{1,3}(\.\d{1,3}){3}$/.test(c[0]))
                    list.push({ ip: c[0], port: c[1], code: c[2] || "??", https: c[6]?.toLowerCase() === "yes", source: "free-proxy-list" });
            });
            return list;
        }
    },
    {
        url: "https://www.sslproxies.org/",
        parse: ($) => {
            const list = [];
            $("table tbody tr").each((_, row) => {
                const c = $(row).find("td").map((_, td) => $(td).text().trim()).get();
                if (/^\d{1,3}(\.\d{1,3}){3}$/.test(c[0]))
                    list.push({ ip: c[0], port: c[1], code: c[2] || "??", https: true, source: "sslproxies" });
            });
            return list;
        }
    },
    { url: "https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all&simplified=true", parse: ($) => parseLines($.root().text(), false, "proxyscrape") },
    { url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",                          parse: ($) => parseLines($.root().text(), false, "TheSpeedX-http") },
    { url: "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt",                    parse: ($) => parseLines($.root().text(), false, "monosans-http") },
    {
        url: "https://proxies.giftedtech.co.ke/files/proxies.json",
        parse: ($) => {
            try {
                const data = JSON.parse($.root().text()) || {};
                const list = [];
                for (const line of (data.http || [])) {
                    const m = /^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/.exec(String(line).trim());
                    if (m) list.push({ ip: m[1], port: m[2], code: "??", https: false, source: "giftedtech" });
                }
                return list;
            } catch { return []; }
        }
    },
    {
        url: "https://proxylist.geonode.com/api/proxy-list?limit=500&page=1&sort_by=lastChecked&sort_type=desc&protocols=http%2Chttps",
        parse: ($) => {
            try {
                return (JSON.parse($.root().text()).data || []).map(p => ({
                    ip: p.ip, port: String(p.port), code: p.country || "??",
                    https: (p.protocols || []).includes("https"), source: "geonode"
                }));
            } catch { return []; }
        }
    },

    // ── Nguồn mới — live rate cao ─────────────────────────────────────────────

    // Checked sẵn — live rate cao nhất
    { url: "https://raw.githubusercontent.com/elliottophellia/yakumo/master/results/http/global/http_checked.txt",       parse: ($) => parseLines($.root().text(), false, "elliottophellia-checked") },
    { url: "https://raw.githubusercontent.com/MuRongPIG/Proxy-Master/main/http_checked.txt",                            parse: ($) => parseLines($.root().text(), false, "murongpig-checked") },
    { url: "https://raw.githubusercontent.com/saisuiu/Lionkings-Http-Proxys-Proxies/main/cnfree.txt",                   parse: ($) => parseLines($.root().text(), false, "saisuiu-verified") },
    { url: "https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&timeout=500&anonymity=elite&simplified=true", parse: ($) => parseLines($.root().text(), false, "proxyscrape-elite") },

    // Pool lớn — raw nhưng được update thường xuyên
    { url: "https://raw.githubusercontent.com/zevtyardt/proxy-list/main/http.txt",                                      parse: ($) => parseLines($.root().text(), false, "zevtyardt-http") },
    { url: "https://raw.githubusercontent.com/rdavydov/proxy-list/main/proxies/http.txt",                               parse: ($) => parseLines($.root().text(), false, "rdavydov-http") },
    { url: "https://raw.githubusercontent.com/ALIILAPRO/Proxy/main/http.txt",                                           parse: ($) => parseLines($.root().text(), false, "aliilapro-http") },
    { url: "https://raw.githubusercontent.com/vakhov/fresh-proxy-list/master/http.txt",                                 parse: ($) => parseLines($.root().text(), false, "vakhov-http") },
    { url: "https://raw.githubusercontent.com/andigwandi/free-proxy/main/proxy_list.txt",                               parse: ($) => parseLines($.root().text(), false, "andigwandi-http") },
    { url: "https://raw.githubusercontent.com/mmpx12/proxy-list/master/http.txt",                                       parse: ($) => parseLines($.root().text(), false, "mmpx12-http") },
    { url: "https://raw.githubusercontent.com/Zaeem20/FREE_PROXIES_LIST/master/http.txt",                               parse: ($) => parseLines($.root().text(), false, "zaeem20-http") },
    { url: "https://raw.githubusercontent.com/jetkai/proxy-list/main/online-proxies/txt/proxies-http.txt",              parse: ($) => parseLines($.root().text(), false, "jetkai-http") },
    { url: "https://raw.githubusercontent.com/roosterkid/openproxylist/main/HTTPS_RAW.txt",                             parse: ($) => parseLines($.root().text(), false, "roosterkid-http") },
    { url: "https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt",                                     parse: ($) => parseLines($.root().text(), false, "shiftytr-http") },
    { url: "https://raw.githubusercontent.com/zloi-user/hideip.me/main/http.txt",                                       parse: ($) => parseLines($.root().text(), false, "zloi-http") },
];

async function fetchSource(src) {
    try {
        const res = await axios.get(src.url, { headers: { "User-Agent": UA }, timeout: 12000 });
        const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        return src.parse(cheerio.load(body));
    } catch { return []; }
}

async function getProxies(limit = 60, extraSources = []) {
    const extras = (extraSources || []).map(url => ({
        url,
        parse: ($) => parseLines($.root().text(), false, `user:${url.slice(0, 60)}`),
        _userUrl: url,
    }));
    const allSources = [...SOURCES, ...extras];
    const settled = await Promise.allSettled(allSources.map(fetchSource));

    // Báo cáo kết quả về cho user-source store (nếu có)
    let proxyStore;
    try { proxyStore = require('../data/proxy-store'); } catch { proxyStore = null; }
    if (proxyStore) {
        for (let i = 0; i < extras.length; i++) {
            const r = settled[SOURCES.length + i];
            const list = r.status === 'fulfilled' ? r.value : [];
            proxyStore.recordSourceFetch(extras[i]._userUrl, list.length, r.status === 'fulfilled' && list.length > 0).catch(() => {});
        }
    }

    const all = settled.flatMap(r => r.status === "fulfilled" ? r.value : []);
    // Ưu tiên proxy từ nguồn có live-rate cao: weight desc, random tiebreak.
    // Weighted random (Efraimidis–Spirakis): key = U^(1/w). Càng cao càng ưu tiên,
    // nhưng vẫn pha trộn → tránh độc canh 1 nguồn, vẫn lọt nhiều proxy nguồn khoẻ.
    const ranked = all
        .map(p => {
            const w = Math.max(1, srcWeight(p.source));
            const u = Math.random() || 1e-9;
            return { p, key: Math.pow(u, 1 / w) };
        })
        .sort((a, b) => b.key - a.key)
        .map(x => x.p);
    const seen   = new Set();
    const unique = ranked.filter(p => { const k = `${p.ip}:${p.port}`; if (seen.has(k)) return false; seen.add(k); return true; });
    return unique.slice(0, limit);
}

module.exports = { getProxies };
