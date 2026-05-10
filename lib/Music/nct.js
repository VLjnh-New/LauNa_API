'use strict';
const axios = require('axios');

let cachedToken = null;
let tokenExpiry = 0;

function randomDeviceId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16).toUpperCase();
    });
}

async function refreshNCTToken() {
    if (cachedToken && Date.now() < tokenExpiry - 24 * 60 * 60 * 1000) return;
    const deviceId = randomDeviceId();
    const deviceInfo = JSON.stringify({ AdID: '', AppName: 'WEB', AppVersion: '1', DeviceID: deviceId, DeviceName: '', Network: '', OsName: 'WEB', OsVersion: 'WEB', Provider: 'NCTCorp', UserName: '', isVN: false });
    const endpoints = [
        { url: 'https://graph.nhaccuatui.com/api/v3/users/login/anonymous', data: { deviceId, deviceInfo } },
        { url: 'https://graph.nhaccuatui.com/api/v3/auth/anonymous', data: { deviceId, deviceInfo } }
    ];
    for (const ep of endpoints) {
        try {
            const res = await axios.post(ep.url, ep.data, {
                headers: { 'content-type': 'application/json', 'origin': 'https://www.nhaccuatui.com', 'referer': 'https://www.nhaccuatui.com/', 'user-agent': 'Mozilla/5.0', 'x-nct-appid': '6', 'x-nct-deviceid': deviceId, 'x-nct-os': 'web', 'x-nct-version': '1', 'x-nct-time': Date.now().toString() },
                timeout: 8000
            });
            const token = res.data?.data?.access_token || res.data?.access_token;
            if (token) { cachedToken = token; tokenExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000; return; }
        } catch {}
    }
}

async function searchNCT(query) {
    await refreshNCTToken();
    const headers = { 'authorization': cachedToken ? `Bearer ${cachedToken}` : undefined, 'content-type': 'application/json', 'origin': 'https://www.nhaccuatui.com', 'referer': 'https://www.nhaccuatui.com/', 'user-agent': 'Mozilla/5.0', 'x-nct-appid': '6', 'x-nct-os': 'web', 'x-nct-version': '1' };
    if (!headers.authorization) delete headers.authorization;
    const { data } = await axios.post('https://graph.nhaccuatui.com/api/v3/search', { keyword: query, limit: 10, page: 1, type: 'song' }, { headers, timeout: 10000 });
    return data?.data?.songs || data?.songs || [];
}

async function getStreamNCT(songKey) {
    await refreshNCTToken();
    const headers = { 'authorization': cachedToken ? `Bearer ${cachedToken}` : undefined, 'content-type': 'application/json', 'origin': 'https://www.nhaccuatui.com', 'referer': 'https://www.nhaccuatui.com/', 'user-agent': 'Mozilla/5.0', 'x-nct-appid': '6', 'x-nct-os': 'web', 'x-nct-version': '1' };
    if (!headers.authorization) delete headers.authorization;
    const { data } = await axios.post('https://graph.nhaccuatui.com/api/v3/songs/stream', { key: songKey }, { headers, timeout: 10000 });
    return data?.data?.url || data?.url || null;
}

module.exports = {
    name: '/music/nct',
    index: async (req, res) => {
        const query = req.query.query;
        const key = req.query.key;
        if (!query && !key) return res.status(400).json({ status: false, message: "Thiếu tham số 'query' hoặc 'key'", example: '/music/nct?query=tên bài hát hoặc /music/nct?key=songKey' });
        try {
            if (key) {
                const streamUrl = await getStreamNCT(key);
                if (!streamUrl) return res.status(404).json({ status: false, message: 'Không lấy được link stream.' });
                return res.json({ status: true, data: { key, streamUrl } });
            }
            const songs = await searchNCT(query);
            if (!songs.length) return res.json({ status: true, data: [] });
            const first = songs[0];
            let streamUrl = null;
            try { streamUrl = await getStreamNCT(first.key || first.songKey); } catch {}
            return res.json({
                status: true,
                data: {
                    songs: songs.map(s => ({ key: s.key || s.songKey, title: s.name || s.title, artist: s.artistName || s.artists, thumbnail: s.image || s.bgImage, duration: s.duration })),
                    first: { ...songs[0], streamUrl }
                }
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[NCT] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tìm nhạc NCT' });
        }
    }
};
