'use strict';

/**
 * /ship-track — Tra cứu vận đơn unified cho 5 hãng vận chuyển VN:
 *   GHTK · GHN · J&T Express · Viettel Post · Vietnam Post
 *
 * Cách dùng:
 *   /ship-track?code=S12345678901
 *   /ship-track?code=GHN1234567890&carrier=ghn   (force carrier)
 */

const axios = require('axios');
const { LRUCache } = require('lru-cache');

const cache = new LRUCache({ max: 2000, ttl: 5 * 60 * 1000 });
const { randomUA } = require('../../utils/http/browser-headers');

function detectCarrier(code) {
    const c = code.toUpperCase();
    if (/^S\d{10,15}$/.test(c) || /^G\d{10,15}$/.test(c)) return 'ghtk';
    if (/^GHN/i.test(c) || /^[A-Z0-9]{10,12}$/.test(c)) return 'ghn';
    if (/^JT/i.test(c) || /^6\d{11,12}$/.test(c)) return 'jt';
    if (/^EJ/i.test(c) || /^00\d{11,13}$/.test(c)) return 'vtp';
    if (/^E[A-Z]\d{9}VN$/i.test(c)) return 'vnpost';
    return null;
}

async function trackGhtk(code) {
    const url = `https://i.ghtk.vn/services/shipment/v1/${encodeURIComponent(code)}`;
    const r = await axios.get(url, { headers: { 'User-Agent': randomUA() }, timeout: 12000, validateStatus: () => true });
    if (r.status !== 200 || !r.data?.success) return null;
    const o = r.data.order || {};
    return {
        carrier: 'GHTK',
        trackingCode: code,
        status: o.status_text || o.label_id,
        from: o.pick_address,
        to: o.address,
        receiver: o.customer_fullname,
        weight: o.weight,
        cod: o.pick_money,
        history: (o.history || []).map(h => ({ time: h.action_time, status: h.action, note: h.action_text || h.reason }))
    };
}

async function trackGhn(code) {
    const url = `https://donhang.ghn.vn/?order_code=${encodeURIComponent(code)}`;
    const r = await axios.get(url, { headers: { 'User-Agent': randomUA() }, timeout: 15000, validateStatus: () => true });
    if (r.status !== 200) return null;
    // GHN public page is SPA — use API instead
    try {
        const api = await axios.post('https://donhang.ghn.vn/api/v2/orders/tracking', {
            order_code: code
        }, {
            headers: { 'Content-Type': 'application/json', 'User-Agent': randomUA() },
            timeout: 12000,
            validateStatus: () => true
        });
        if (api.status === 200 && api.data?.data) {
            const d = api.data.data;
            return {
                carrier: 'GHN',
                trackingCode: code,
                status: d.current_status_name || d.status,
                from: d.from_address || d.from_district_name,
                to: d.to_address || d.to_district_name,
                receiver: d.to_name,
                weight: d.weight,
                cod: d.cod_amount,
                history: (d.tracking_logs || d.logs || []).map(h => ({ time: h.action_at || h.timestamp, status: h.status_name || h.action, note: h.description }))
            };
        }
    } catch {}
    return null;
}

async function trackJt(code) {
    const url = `https://jtexpress.vn/api/order/v2/getOrderTracesAction`;
    const r = await axios.post(url, { billCode: code }, {
        headers: { 'User-Agent': randomUA(), 'Content-Type': 'application/json', 'Origin': 'https://jtexpress.vn' },
        timeout: 12000,
        validateStatus: () => true
    });
    if (r.status !== 200 || !r.data?.data?.[0]) return null;
    const d = r.data.data[0];
    return {
        carrier: 'J&T Express',
        trackingCode: code,
        status: d.statusName || d.signStatus,
        from: d.sendProvince,
        to: d.receiveProvince,
        receiver: d.receiverName,
        weight: d.weight,
        cod: d.codMoney,
        history: (d.details || []).map(h => ({ time: h.scanTime, status: h.scanType, note: h.scanRemark || h.problemTypeName }))
    };
}

async function trackVtp(code) {
    const url = `https://partner.viettelpost.vn/v2/order/tracking?orderNumber=${encodeURIComponent(code)}`;
    const r = await axios.get(url, { headers: { 'User-Agent': randomUA() }, timeout: 12000, validateStatus: () => true });
    if (r.status !== 200 || !r.data?.data) return null;
    const d = r.data.data;
    return {
        carrier: 'Viettel Post',
        trackingCode: code,
        status: d.STATUS_NAME || d.statusName,
        from: d.SENDER_PROVINCE_NAME,
        to: d.RECEIVER_PROVINCE_NAME,
        receiver: d.RECEIVER_FULLNAME,
        weight: d.PRODUCT_WEIGHT,
        cod: d.MONEY_COLLECTION,
        history: (d.PARTNER_TRACKING || []).map(h => ({ time: h.STATUS_DATE, status: h.STATUS_NAME, note: h.NOTE }))
    };
}

async function trackVnpost(code) {
    const url = `https://www.vnpost.vn/api/api/MainPage/GetTracking?ItemCode=${encodeURIComponent(code)}`;
    const r = await axios.get(url, { headers: { 'User-Agent': randomUA() }, timeout: 12000, validateStatus: () => true });
    if (r.status !== 200 || !r.data?.Data) return null;
    const d = r.data.Data;
    return {
        carrier: 'Vietnam Post',
        trackingCode: code,
        status: d.LastStatus || d.Status,
        from: d.SenderProvince,
        to: d.ReceiverProvince,
        receiver: d.ReceiverName,
        weight: d.Weight,
        cod: d.CodAmount,
        history: (d.Tracks || []).map(h => ({ time: h.Date, status: h.Status, note: h.Location }))
    };
}

const TRACKERS = { ghtk: trackGhtk, ghn: trackGhn, jt: trackJt, vtp: trackVtp, vnpost: trackVnpost };

module.exports = {
    name: '/ship-track',
    index: async (req, res) => {
        const code = (req.query.code || req.query.bill || '').toString().trim();
        const carrier = (req.query.carrier || '').toString().toLowerCase();

        if (!code) {
            return res.status(400).json({ status: false, message: "Thiếu 'code'.", example: '/ship-track?code=S12345678901' });
        }

        const cacheKey = `${carrier || 'auto'}:${code}`;
        const cached = cache.get(cacheKey);
        if (cached) return res.json({ ...cached, cached: true });

        const tryList = carrier && TRACKERS[carrier]
            ? [carrier]
            : (detectCarrier(code) ? [detectCarrier(code), ...Object.keys(TRACKERS).filter(k => k !== detectCarrier(code))] : Object.keys(TRACKERS));

        const errors = [];
        for (const name of tryList) {
            try {
                const result = await TRACKERS[name](code);
                if (result) {
                    const out = { status: true, ...result };
                    cache.set(cacheKey, out);
                    return res.json(out);
                }
                errors.push({ carrier: name, error: 'Không tìm thấy đơn' });
            } catch (e) {
                const log = require('../../utils/logger');
                log(`[TRACK] ${name} lỗi: ${e.message}`, 'WARN');
                errors.push({ carrier: name, error: 'Lỗi tra cứu vận đơn' });
            }
        }

        return res.status(404).json({
            status: false,
            message: 'Không tra được vận đơn ở 5 hãng.',
            triedCarriers: tryList,
            errors
        });
    }
};
