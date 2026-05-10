'use strict';
const axios = require('axios');
const { randomUA } = require('../../utils/http/browser-headers');

let SPOTIFY_TOKEN = '';
let CLIENT_TOKEN = '';
let TOKEN_EXPIRY = 0;
let CLIENT_TOKEN_EXPIRY = 0;

function convertMs(ms) {
    const m = Math.floor(ms / 60000);
    const s = ((ms % 60000) / 1000).toFixed(0);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function spotifyHeaders() {
    return {
        'User-Agent': randomUA(),
        'referer': 'https://open.spotify.com/',
        'origin': 'https://open.spotify.com'
    };
}

async function refreshSpotifyToken() {
    if (SPOTIFY_TOKEN && Date.now() < TOKEN_EXPIRY) return;
    try {
        const res = await axios.get('https://open.spotify.com/get_access_token?reason=transport&productType=web_player', {
            headers: spotifyHeaders(),
            timeout: 8000
        });
        if (res.data?.accessToken) {
            SPOTIFY_TOKEN = res.data.accessToken;
            TOKEN_EXPIRY = res.data.accessTokenExpirationTimestampMs || (Date.now() + 3000000);
        }
    } catch {}
}

async function refreshClientToken() {
    if (CLIENT_TOKEN && Date.now() < CLIENT_TOKEN_EXPIRY) return;
    try {
        const res = await axios.post('https://clienttoken.spotify.com/v1/clienttoken', {
            client_data: {
                client_version: '1.2.52.442',
                client_id: 'd8a5ed958d274c2e8ee717e6a4b0971d',
                js_sdk_data: {
                    device_brand: 'unknown',
                    device_model: 'unknown',
                    os: 'windows',
                    os_version: 'NT 10.0',
                    device_id: '8d2e8e4b4c4e4b4e8e4b4c4e4b4e8e4b',
                    device_type: 'computer'
                }
            }
        }, {
            headers: {
                ...spotifyHeaders(),
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 8000
        });
        if (res.data?.granted_token?.token) {
            CLIENT_TOKEN = res.data.granted_token.token;
            CLIENT_TOKEN_EXPIRY = Date.now() + (res.data.granted_token.expires_after_seconds || 3600) * 1000;
        }
    } catch {}
}

async function ensureTokens() {
    await Promise.all([refreshSpotifyToken(), refreshClientToken()]);
}

async function searchSpotify(query) {
    await ensureTokens();
    if (SPOTIFY_TOKEN && CLIENT_TOKEN) {
        try {
            const res = await axios({
                method: 'POST',
                url: 'https://api-partner.spotify.com/pathfinder/v2/query',
                headers: {
                    'authorization': `Bearer ${SPOTIFY_TOKEN}`,
                    'client-token': CLIENT_TOKEN,
                    'app-platform': 'WebPlayer',
                    'user-agent': randomUA(),
                    'content-type': 'application/json;charset=UTF-8',
                    'origin': 'https://open.spotify.com',
                    'referer': 'https://open.spotify.com/'
                },
                data: {
                    operationName: 'searchTracks',
                    variables: { searchTerm: query, offset: 0, limit: 10, numberOfTopResults: 5, includePreReleases: false, includeAudiobooks: true },
                    extensions: { persistedQuery: { version: 1, sha256Hash: '59ee4a659c32e9ad894a71308207594a65ba67bb6b632b183abe97303a51fa55' } }
                },
                timeout: 8000
            });
            const items = res.data?.data?.searchV2?.tracksV2?.items || [];
            if (items.length > 0) {
                return items.map(item => {
                    const track = item.item.data;
                    const album = track.albumOfTrack;
                    const artistList = track.artists.items.map(a => a.profile.name).join(', ');
                    const cover = album.coverArt.sources.find(s => s.width === 640)?.url || album.coverArt.sources[0]?.url;
                    return { id: track.id, title: track.name, artist: artistList, album: album.name, duration: convertMs(track.duration.totalMilliseconds), thumbnail: cover };
                });
            }
        } catch {}
    }
    const res = await axios.get(`https://spotifydown.com/api/search?query=${encodeURIComponent(query)}`, {
        headers: { 'referer': 'https://spotifydown.com/', 'origin': 'https://spotifydown.com' },
        timeout: 8000
    });
    return (res.data?.trackList || []).slice(0, 10).map(t => ({
        id: t.id, title: t.name, artist: t.artists, album: t.album, thumbnail: t.cover, duration: t.duration || null
    }));
}

async function downloadSpotify(trackId) {
    const res = await axios.get(`https://spotifydown.com/api/download/${trackId}`, {
        headers: { 'referer': 'https://spotifydown.com/', 'origin': 'https://spotifydown.com' },
        timeout: 15000
    });
    if (!res.data?.success || !res.data?.link) throw new Error(res.data?.message || 'Không tải được bài hát.');
    return { trackId, downloadUrl: res.data.link, metadata: res.data.metadata };
}

ensureTokens().catch(() => {});

module.exports = {
    name: '/music/spotify',
    index: async (req, res) => {
        const query = req.query.query;
        const id = req.query.id;
        if (!query && !id) return res.status(400).json({ status: false, message: "Thiếu tham số 'query' hoặc 'id'", example: '/music/spotify?query=tên bài hát hoặc /music/spotify?id=trackId' });
        try {
            if (id) {
                const result = await downloadSpotify(id);
                return res.json({ status: true, data: result });
            }
            const tracks = await searchSpotify(query);
            if (!tracks.length) return res.json({ status: true, data: [] });
            let downloadInfo = null;
            try { downloadInfo = await downloadSpotify(tracks[0].id); } catch {}
            return res.json({ status: true, data: { tracks, first: downloadInfo ? { ...tracks[0], ...downloadInfo } : tracks[0] } });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[SPOTIFY] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tìm nhạc Spotify' });
        }
    }
};
