'use strict';

/**
 * Pool User-Agent + Client Hints "đồng bộ gia đình" (Chrome → có Sec-Ch-Ua,
 * Firefox/Safari → không có). Mục đích: mỗi request gửi đi giống 1 trình duyệt
 * thật mở tab, giảm khả năng bị nghi bot.
 *
 * KHÔNG bypass được fingerprint TLS (JA3/JA4) — đó là tầng dưới axios.
 *
 * ua-fetcher tự động load UA mới nhất từ GitHub/web mỗi 24h.
 * Khi chưa fetch xong thì fallback về BROWSERS hardcode bên dưới.
 */

let uaFetcher = null;
try { uaFetcher = require('./ua-fetcher'); } catch { uaFetcher = null; }

// 100 UA (2024-2026): Chrome/Edge/Firefox/Safari/Samsung/Opera trên Win/Mac/Linux/Android/iOS
const BROWSERS = [
    // ── Chrome Windows ─────────────────────────────────────────────────────────
    { family:'chrome', ver:120, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
    { family:'chrome', ver:121, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36' },
    { family:'chrome', ver:122, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
    { family:'chrome', ver:123, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36' },
    { family:'chrome', ver:124, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
    { family:'chrome', ver:125, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
    { family:'chrome', ver:126, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
    { family:'chrome', ver:127, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36' },
    { family:'chrome', ver:128, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
    { family:'chrome', ver:129, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36' },
    { family:'chrome', ver:130, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
    { family:'chrome', ver:131, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    { family:'chrome', ver:132, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36' },
    { family:'chrome', ver:133, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36' },
    { family:'chrome', ver:134, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36' },
    { family:'chrome', ver:135, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36' },
    // Windows 11
    { family:'chrome', ver:132, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36' },
    { family:'chrome', ver:134, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36' },

    // ── Chrome macOS ────────────────────────────────────────────────────────────
    { family:'chrome', ver:124, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
    { family:'chrome', ver:126, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
    { family:'chrome', ver:128, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
    { family:'chrome', ver:130, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
    { family:'chrome', ver:131, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    { family:'chrome', ver:132, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36' },
    { family:'chrome', ver:133, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36' },
    { family:'chrome', ver:134, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36' },
    { family:'chrome', ver:135, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_3_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36' },

    // ── Chrome Linux ────────────────────────────────────────────────────────────
    { family:'chrome', ver:125, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
    { family:'chrome', ver:128, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36' },
    { family:'chrome', ver:131, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' },
    { family:'chrome', ver:133, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36' },
    { family:'chrome', ver:134, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; CrOS x86_64 15329.44.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36' },

    // ── Chrome Android ──────────────────────────────────────────────────────────
    { family:'chrome', ver:124, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:126, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:128, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:130, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:131, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:132, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:133, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:134, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:135, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:132, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 14; Redmi Note 13 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:133, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 14; OPPO Find X7 Ultra) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36' },

    // ── Edge Windows ────────────────────────────────────────────────────────────
    { family:'edge', ver:120, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0' },
    { family:'edge', ver:122, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0' },
    { family:'edge', ver:124, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0' },
    { family:'edge', ver:126, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0' },
    { family:'edge', ver:128, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0' },
    { family:'edge', ver:130, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0' },
    { family:'edge', ver:131, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0' },
    { family:'edge', ver:132, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36 Edg/132.0.0.0' },
    { family:'edge', ver:133, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0' },
    { family:'edge', ver:134, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0' },
    // Edge macOS
    { family:'edge', ver:131, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0' },
    { family:'edge', ver:133, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0' },

    // ── Firefox Windows ─────────────────────────────────────────────────────────
    { family:'firefox', ver:115, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0' },
    { family:'firefox', ver:120, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0' },
    { family:'firefox', ver:122, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0' },
    { family:'firefox', ver:124, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0' },
    { family:'firefox', ver:126, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0' },
    { family:'firefox', ver:128, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0' },
    { family:'firefox', ver:130, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0' },
    { family:'firefox', ver:132, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0' },
    { family:'firefox', ver:133, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0' },
    { family:'firefox', ver:134, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0' },
    // Firefox macOS
    { family:'firefox', ver:128, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0' },
    { family:'firefox', ver:132, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0' },
    { family:'firefox', ver:134, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0' },
    // Firefox Linux
    { family:'firefox', ver:126, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0' },
    { family:'firefox', ver:130, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0' },
    { family:'firefox', ver:133, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0' },
    // Firefox Android
    { family:'firefox', ver:130, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0' },
    { family:'firefox', ver:133, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Android 15; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0' },

    // ── Safari macOS ────────────────────────────────────────────────────────────
    { family:'safari', ver:16, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15' },
    { family:'safari', ver:17, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15' },
    { family:'safari', ver:17, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15' },
    { family:'safari', ver:18, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' },
    { family:'safari', ver:18, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15' },
    { family:'safari', ver:18, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15' },

    // ── Safari iOS ──────────────────────────────────────────────────────────────
    { family:'safari', ver:16, platform:'iOS', mobile:true,
      ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1' },
    { family:'safari', ver:17, platform:'iOS', mobile:true,
      ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1' },
    { family:'safari', ver:17, platform:'iOS', mobile:true,
      ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
    { family:'safari', ver:18, platform:'iOS', mobile:true,
      ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
    { family:'safari', ver:18, platform:'iOS', mobile:true,
      ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' },
    { family:'safari', ver:18, platform:'iOS', mobile:true,
      ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1' },
    // iPad
    { family:'safari', ver:17, platform:'iOS', mobile:false,
      ua:'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
    { family:'safari', ver:18, platform:'iOS', mobile:false,
      ua:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1' },

    // ── Samsung Internet ────────────────────────────────────────────────────────
    { family:'chrome', ver:120, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36' },
    { family:'chrome', ver:124, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36' },

    // ── Opera ───────────────────────────────────────────────────────────────────
    { family:'chrome', ver:124, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0' },
    { family:'chrome', ver:130, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/114.0.0.0' },
    { family:'chrome', ver:124, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0' },
    // Opera Android
    { family:'chrome', ver:130, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 OPR/78.0.0.0' },

    // ── Brave (dựa Chrome, không có Sec-Ch-Ua đặc biệt) ───────────────────────
    { family:'chrome', ver:130, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
    { family:'chrome', ver:132, platform:'macOS', mobile:false,
      ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36' },

    // ── Vivaldi ─────────────────────────────────────────────────────────────────
    { family:'chrome', ver:128, platform:'Windows', mobile:false,
      ua:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.36 Safari/537.36 Vivaldi/6.9.3447.46' },
    { family:'chrome', ver:130, platform:'Linux', mobile:false,
      ua:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Vivaldi/7.0.3495.15' },

    // ── UC Browser Android ──────────────────────────────────────────────────────
    { family:'chrome', ver:120, platform:'Android', mobile:true,
      ua:'Mozilla/5.0 (Linux; U; Android 14; en-US; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.144 UCBrowser/16.5.0.1031 Mobile Safari/537.36' },
];

const ACCEPT_LANGS = [
    'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
    'vi,en-US;q=0.9,en;q=0.8',
    'vi-VN,vi;q=0.9,en;q=0.8',
    'en-US,en;q=0.9,vi;q=0.8',
    'vi-VN,vi;q=0.8,en-GB;q=0.6,en;q=0.5',
    'en-US,en;q=0.9',
    'en-GB,en;q=0.9,vi;q=0.7',
    'zh-CN,zh;q=0.9,en;q=0.8',
    'ja-JP,ja;q=0.9,en;q=0.8',
    'ko-KR,ko;q=0.9,en;q=0.8',
];

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function pickBrowser({ family, mobile } = {}) {
    // Ưu tiên dùng pool live từ ua-fetcher nếu đã sẵn sàng
    if (uaFetcher) {
        const entries = uaFetcher.getEntries(BROWSERS);
        if (entries.length > 0) {
            const picked = uaFetcher.pickEntry(entries, { family, mobile });
            if (picked) return picked;
        }
    }
    // Fallback về hardcode BROWSERS
    let pool = BROWSERS;
    if (family) pool = pool.filter(b => b.family === family);
    if (mobile !== undefined) pool = pool.filter(b => !!b.mobile === mobile);
    return pickRandom(pool.length ? pool : BROWSERS);
}

function chromeBrandList(ver) {
    const brands = [
        `"Chromium";v="${ver}"`,
        `"Google Chrome";v="${ver}"`,
        `"Not?A_Brand";v="99"`,
    ];
    return brands.sort(() => Math.random() - 0.5).join(', ');
}

function edgeBrandList(ver) {
    const brands = [
        `"Microsoft Edge";v="${ver}"`,
        `"Chromium";v="${ver}"`,
        `"Not?A_Brand";v="99"`,
    ];
    return brands.sort(() => Math.random() - 0.5).join(', ');
}

/**
 * Trả về full header object trông giống browser thật cho 1 request HTTP API.
 *   purpose: 'cors'  → fetch/xhr (POST upload, POST queue/join)
 *           'sse'    → text/event-stream listener
 *           'doc'    → request HTML
 */
function browserHeaders({ referer = 'https://taoanhdep.com/', origin = 'https://taoanhdep.com', purpose = 'cors' } = {}) {
    const b = pickBrowser();
    const h = {
        'User-Agent':      b.ua,
        'Accept-Language': pickRandom(ACCEPT_LANGS),
        'Accept-Encoding': 'gzip, deflate, br',
        'Origin':          origin,
        'Referer':         referer,
        'DNT':             '1',
    };

    if (purpose === 'sse') {
        h['Accept']          = 'text/event-stream';
        h['Cache-Control']   = 'no-cache';
        h['Sec-Fetch-Dest']  = 'empty';
        h['Sec-Fetch-Mode']  = 'cors';
        h['Sec-Fetch-Site']  = 'cross-site';
    } else {
        h['Accept']         = '*/*';
        h['Sec-Fetch-Dest'] = 'empty';
        h['Sec-Fetch-Mode'] = 'cors';
        h['Sec-Fetch-Site'] = 'cross-site';
    }

    if (b.family === 'chrome' || b.family === 'edge') {
        h['Sec-Ch-Ua']          = b.family === 'edge' ? edgeBrandList(b.ver) : chromeBrandList(b.ver);
        h['Sec-Ch-Ua-Mobile']   = b.mobile ? '?1' : '?0';
        h['Sec-Ch-Ua-Platform'] = `"${b.platform}"`;
    }

    return h;
}

/**
 * Trả về 1 UA random duy nhất.
 */
function randomUA() {
    return pickBrowser().ua;
}

/**
 * Thống kê UA pool hiện tại (hardcode + fetched).
 */
function uaStats() {
    const fetcher = uaFetcher ? uaFetcher.getStats() : null;
    return {
        hardcoded: BROWSERS.length,
        fetched: fetcher,
    };
}

module.exports = { browserHeaders, randomUA, pickBrowser, uaStats, BROWSERS };
