'use strict';

const BAD_UA_PATTERNS = [
    /\b(curl|wget|libwww|python-requests|python-urllib|java-http-client|go-http-client)\b/i,
    /\b(masscan|nmap|nikto|sqlmap|acunetix|metasploit|wpscan|dirbuster|gobuster)\b/i,
    /\b(scrapy|httpclient|okhttp|axios\/0)\b/i,
    /^Mozilla\/5\.0$/,
];

const GOOD_BOT_PATTERNS = [
    /Googlebot/i,
    /Bingbot/i,
    /DuckDuckBot/i,
    /Slurp/i,
];

function detect(ua, opts) {
    if (!ua || ua.trim().length === 0) {
        return { verdict: opts.blockEmptyUA ? 'block' : 'suspicious', reason: 'Empty User-Agent' };
    }

    for (const p of GOOD_BOT_PATTERNS) {
        if (p.test(ua)) return { verdict: 'ok', reason: 'Verified crawler' };
    }

    for (const p of BAD_UA_PATTERNS) {
        if (p.test(ua)) {
            return { verdict: opts.blockKnownBadUA ? 'block' : 'suspicious', reason: `Bad UA: ${ua.slice(0, 60)}` };
        }
    }

    if (/Mozilla\/5\.0.*\b(Chrome|Firefox|Safari|Edge|OPR)\b/i.test(ua)) {
        return { verdict: 'ok' };
    }

    return { verdict: 'suspicious', reason: 'Non-browser UA' };
}

module.exports = { detect };
