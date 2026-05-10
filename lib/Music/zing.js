'use strict';
const axios = require('axios');
const CryptoJS = require('crypto-js');
const { randomUA } = require('../../utils/http/browser-headers');

const BASE_URL = 'https://zingmp3.vn';
const API_KEY    = 'X5BM3w8N7MKozC0B85o4KMlzLZKhV00y';
const SECRET_KEY = 'acOrvUS15XRW2o9JksiK1KgQ6Vbds8ZW';
const VERSION = '1.13.12';
function makeHeaders() {
    return {
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9,vi;q=0.8',
        'referer': 'https://zingmp3.vn/',
        'user-agent': randomUA()
    };
}
const paramsAllow = ['ctime', 'id', 'type', 'page', 'count', 'version'];

let cachedCookie = '';
let cookieExpiry = 0;

async function getCookie() {
    if (cachedCookie && Date.now() < cookieExpiry) return cachedCookie;
    try {
        const res = await axios.get(BASE_URL, { headers: makeHeaders(), timeout: 5000 });
        const cookies = res.headers['set-cookie'];
        if (cookies?.length > 0) {
            cachedCookie = cookies.map(c => c.split(';')[0]).join('; ');
            cookieExpiry = Date.now() + 3600000;
        }
        return cachedCookie;
    } catch { return 'zpsid=;'; }
}

function getSig(path, params) {
    const sortedKeys = Object.keys(params).sort();
    let strParams = '';
    for (const key of sortedKeys) {
        if (paramsAllow.includes(key) && params[key]) strParams += `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`;
    }
    const hash256 = CryptoJS.SHA256(strParams).toString();
    return CryptoJS.HmacSHA512(path + hash256, SECRET_KEY).toString();
}

async function searchZing(query) {
    const apiPath = '/api/v2/search';
    const ctime = Math.floor(Date.now() / 1000).toString();
    const params = { q: query, type: 'song', count: '10', ctime, version: VERSION, apiKey: API_KEY };
    const sig = getSig(apiPath, params);
    const cookie = await getCookie();
    const response = await axios.get(BASE_URL + apiPath, { params: { ...params, sig }, headers: { ...makeHeaders(), Cookie: cookie }, timeout: 10000 });
    if (response.data?.err !== 0) throw new Error(`Zing API Error: ${response.data?.msg}`);
    return (response.data?.data?.items || []).map(i => ({
        encodeId: i.encodeId || i.id,
        title: i.title,
        artistsNames: i.artistsNames || i.artists?.map(a => a.name).join(', ') || 'Unknown',
        thumbnail: i.thumbnail,
        duration: i.duration,
        album: i.album?.title || null
    }));
}

async function getStreamZing(encodeId) {
    const apiPath = '/api/v2/song/get/streaming';
    const ctime = Math.floor(Date.now() / 1000).toString();
    const params = { id: encodeId, ctime, version: VERSION, apiKey: API_KEY };
    const sig = getSig(apiPath, params);
    const cookie = await getCookie();
    const response = await axios.get(BASE_URL + apiPath, { params: { ...params, sig }, headers: { ...makeHeaders(), Cookie: cookie }, timeout: 10000 });
    return response.data?.data || null;
}

module.exports = {
    name: '/music/zing',
    index: async (req, res) => {
        const query = req.query.query;
        const encodeId = req.query.id;
        if (!query && !encodeId) return res.status(400).json({ status: false, message: "Thiếu tham số 'query' hoặc 'id'", example: '/music/zing?query=tên bài hát hoặc /music/zing?id=encodeId' });
        try {
            if (encodeId) {
                const stream = await getStreamZing(encodeId);
                if (!stream) return res.status(404).json({ status: false, message: 'Không lấy được link stream.' });
                const streamUrl = stream['128'] || stream['320'] || stream.default;
                return res.json({ status: true, data: { encodeId, streamUrl, streams: stream } });
            }
            const songs = await searchZing(query);
            if (songs.length === 0) return res.json({ status: true, data: [] });
            const first = songs[0];
            const stream = await getStreamZing(first.encodeId);
            const streamUrl = stream ? (stream['128'] || stream['320'] || stream.default) : null;
            return res.json({ status: true, data: { songs, first: { ...first, streamUrl: streamUrl === 'VIP' ? null : streamUrl, isVIP: streamUrl === 'VIP' } } });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[ZING] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tải nhạc ZingMP3' });
        }
    }
};
