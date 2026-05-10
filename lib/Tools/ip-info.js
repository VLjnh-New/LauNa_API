'use strict';

/**
 * /ip-info — Tra cứu IP / ASN / GeoIP / ISP.
 *
 * Cách dùng:
 *   /ip-info                    -> IP của bạn
 *   /ip-info?ip=8.8.8.8
 *   /ip-info?ip=2001:4860:4860::8888
 *
 * Nguồn: ip-api.com (free 45req/min, không cần key) + fallback ipwho.is.
 */

const axios = require('axios');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 2000, ttl: 30 * 60 * 1000 });

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

function clientIp(req) {
    const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return xff || req.ip || req.connection?.remoteAddress || null;
}

async function lookupIpApi(ip) {
    const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,countryCode,region,regionName,city,district,zip,lat,lon,timezone,offset,currency,isp,org,as,asname,reverse,mobile,proxy,hosting,query`;
    const r = await axios.get(url, { timeout: 8000, validateStatus: () => true });
    if (r.status !== 200 || r.data?.status !== 'success') {
        const msg = r.data?.message || `HTTP ${r.status}`;
        const err = new Error(msg);
        err.code = msg;
        throw err;
    }
    const d = r.data;
    return {
        ip: d.query,
        country: d.country, countryCode: d.countryCode,
        region: d.regionName, regionCode: d.region,
        city: d.city, district: d.district, zip: d.zip,
        lat: d.lat, lon: d.lon,
        timezone: d.timezone, utcOffset: d.offset,
        currency: d.currency,
        isp: d.isp, org: d.org, asn: d.as, asnName: d.asname,
        reverse: d.reverse,
        flags: { mobile: !!d.mobile, proxy: !!d.proxy, hosting: !!d.hosting },
        source: 'ip-api.com'
    };
}

async function lookupIpwho(ip) {
    const url = `https://ipwho.is/${encodeURIComponent(ip)}`;
    const r = await axios.get(url, { timeout: 8000, validateStatus: () => true });
    if (r.status !== 200 || r.data?.success === false) {
        throw new Error(r.data?.message || `HTTP ${r.status}`);
    }
    const d = r.data;
    return {
        ip: d.ip,
        country: d.country, countryCode: d.country_code,
        region: d.region, regionCode: null,
        city: d.city, district: null, zip: d.postal,
        lat: d.latitude, lon: d.longitude,
        timezone: d.timezone?.id, utcOffset: d.timezone?.utc,
        currency: d.currency?.code,
        isp: d.connection?.isp, org: d.connection?.org, asn: d.connection?.asn ? 'AS' + d.connection.asn : null, asnName: d.connection?.org,
        reverse: null,
        flags: { mobile: false, proxy: false, hosting: false },
        source: 'ipwho.is'
    };
}

module.exports = {
    name: '/ip-info',
    index: async (req, res) => {
        let ip = (req.query.ip || '').toString().trim();
        if (!ip) ip = clientIp(req) || '';
        if (ip === '::1' || ip === '127.0.0.1') ip = '';

        if (ip && !IPV4_RE.test(ip) && !IPV6_RE.test(ip)) {
            return res.status(400).json({ status: false, message: 'IP không hợp lệ.', example: '/ip-info?ip=8.8.8.8' });
        }

        const cacheKey = ip || '__self__';
        const cached = cache.get(cacheKey);
        if (cached) return res.json({ status: true, ...cached, cached: true });

        try {
            let info;
            try {
                info = await lookupIpApi(ip);
            } catch (e1) {
                info = await lookupIpwho(ip);
            }
            cache.set(cacheKey, info);
            return res.json({ status: true, ...info });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[IP-INFO] lỗi: ${e.message}`, 'WARN');
            return res.status(502).json({ status: false, message: 'Lookup IP thất bại' });
        }
    }
};
