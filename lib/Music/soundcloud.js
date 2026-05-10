'use strict';
const axios = require('axios');
const { randomUA } = require('../../utils/http/browser-headers');

const SC_API = 'https://api-v2.soundcloud.com';
function makeHeaders() {
    return {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
        'Origin': 'https://soundcloud.com',
        'Referer': 'https://soundcloud.com/',
        'User-Agent': randomUA(),
        'Host': 'api-v2.soundcloud.com',
        'Connection': 'keep-alive'
    };
}

const CLIENT_ID_TTL = 20 * 60 * 1000;
let cachedClientId = null;
let clientIdFetchedAt = 0;

async function fetchFreshClientId() {
    try {
        const { data } = await axios.get('https://soundcloud.com/', {
            headers: { 'User-Agent': randomUA() },
            timeout: 10000
        });
        const splitted = data.split('<script crossorigin src="');
        const urls = splitted.filter(r => r.startsWith('https')).map(r => r.split('"')[0]);
        if (!urls.length) throw new Error('Không tìm thấy script URL');
        for (let i = urls.length - 1; i >= Math.max(0, urls.length - 5); i--) {
            try {
                const data2 = await axios.get(urls[i], { timeout: 10000 });
                const id = data2.data.split(',client_id:"')[1]?.split('"')[0];
                if (id && id.length > 10) return id;
            } catch {}
        }
        throw new Error('Không parse được client_id từ scripts');
    } catch (e) {
        throw e;
    }
}

async function getClientID(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedClientId && now - clientIdFetchedAt < CLIENT_ID_TTL) {
        return cachedClientId;
    }
    cachedClientId = null;
    try {
        cachedClientId = await fetchFreshClientId();
        clientIdFetchedAt = Date.now();
        return cachedClientId;
    } catch {
        cachedClientId = null;
        clientIdFetchedAt = 0;
        throw new Error('Không lấy được client_id từ SoundCloud');
    }
}

function is401(err) {
    return err?.response?.status === 401 || err?.response?.status === 403;
}

async function searchSoundCloud(query, limit = 10) {
    let clientId;
    try {
        clientId = await getClientID();
    } catch (e) {
        throw new Error('Không lấy được client_id: ' + e.message);
    }
    const params = { client_id: clientId, q: query, limit, offset: 0, linked_partitioning: 1, app_version: 1763043258, app_locale: 'en' };
    const url = `${SC_API}/search/tracks?${new URLSearchParams(params).toString()}`;
    try {
        const response = await axios.get(url, { headers: makeHeaders(), timeout: 10000 });
        return (response.data?.collection || []).filter(item => item.kind === 'track');
    } catch (e) {
        if (is401(e)) {
            cachedClientId = null;
            clientIdFetchedAt = 0;
            const newId = await getClientID(true);
            const params2 = { client_id: newId, q: query, limit, offset: 0, linked_partitioning: 1, app_version: 1763043258, app_locale: 'en' };
            const url2 = `${SC_API}/search/tracks?${new URLSearchParams(params2).toString()}`;
            const response2 = await axios.get(url2, { headers: makeHeaders(), timeout: 10000 });
            return (response2.data?.collection || []).filter(item => item.kind === 'track');
        }
        throw e;
    }
}

async function downloadSoundCloud(permalink_url) {
    let clientId;
    try {
        clientId = await getClientID();
    } catch (e) {
        throw new Error('Không lấy được client_id: ' + e.message);
    }

    let finalUrl = permalink_url;
    if (finalUrl.includes('on.soundcloud.com')) {
        const r = await axios.get(finalUrl, { headers: { 'User-Agent': randomUA() }, timeout: 10000 });
        finalUrl = r.request?.res?.responseUrl || r.config?.url || finalUrl;
    }
    const cleanUrl = finalUrl.replace('m.soundcloud.com', 'soundcloud.com').split('?')[0];

    async function resolveAndStream(cid) {
        const resolveRes = await axios.get(
            `${SC_API}/resolve?url=${encodeURIComponent(cleanUrl)}&client_id=${cid}`,
            { headers: makeHeaders(), timeout: 10000 }
        );
        const trackData = resolveRes.data;
        if (!trackData?.media?.transcodings?.length) throw new Error('Không tìm thấy media để tải.');
        const progressive = trackData.media.transcodings.find(t => t.format?.protocol === 'progressive') || trackData.media.transcodings[0];
        const streamRes = await axios.get(
            `${progressive.url}?client_id=${cid}`,
            { headers: makeHeaders(), timeout: 10000 }
        );
        const streamUrl = streamRes.data?.url;
        if (!streamUrl) throw new Error('Không lấy được link stream.');
        return {
            title: trackData.title,
            author: trackData.user?.username || 'SoundCloud Artist',
            thumbnail: (trackData.artwork_url || trackData.user?.avatar_url || '').replace('-large', '-t500x500'),
            duration: Math.floor((trackData.duration || 0) / 1000),
            likes: trackData.likes_count || 0,
            plays: trackData.playback_count || 0,
            streamUrl
        };
    }

    try {
        return await resolveAndStream(clientId);
    } catch (e) {
        if (is401(e)) {
            cachedClientId = null;
            clientIdFetchedAt = 0;
            const newId = await getClientID(true);
            return await resolveAndStream(newId);
        }
        throw e;
    }
}

module.exports = {
    searchSoundCloud,
    downloadSoundCloud,
    name: '/music/soundcloud',
    index: async (req, res) => {
        const query = req.query.query;
        const url = req.query.url;
        if (!query && !url) return res.status(400).json({ status: false, message: "Thiếu tham số 'query' hoặc 'url'", example: '/music/soundcloud?query=tên bài hát hoặc /music/soundcloud?url=https://soundcloud.com/...' });
        try {
            if (url) {
                const result = await downloadSoundCloud(url);
                return res.json({ status: true, data: result });
            }
            const tracks = await searchSoundCloud(query);
            if (!tracks.length) return res.json({ status: true, data: [] });
            const first = tracks[0];
            let streamInfo = null;
            try { streamInfo = await downloadSoundCloud(first.permalink_url); } catch {}
            return res.json({
                status: true,
                data: {
                    tracks: tracks.map(t => ({
                        id: t.id,
                        title: t.title,
                        author: t.user?.username,
                        thumbnail: (t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t500x500'),
                        duration: Math.floor((t.duration || 0) / 1000),
                        permalink_url: t.permalink_url
                    })),
                    first: streamInfo ? { ...streamInfo, id: first.id } : null
                }
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[SOUNDCLOUD] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tải nhạc SoundCloud: ' + e.message });
        }
    }
};
