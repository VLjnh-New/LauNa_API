'use strict';

/**
 * /music/lyric
 *
 * Lấy lời bài hát (plain + synced LRC) từ LRCLIB (https://lrclib.net) — miễn phí, không cần API key.
 *
 * Cách dùng:
 *   /music/lyric?q=ten bai - ten ca si
 *   /music/lyric?title=Shape of You&artist=Ed Sheeran
 *   /music/lyric?title=Shape of You&artist=Ed Sheeran&album=Divide&duration=233
 *
 * Phản hồi:
 *   { status, data: { id, title, artist, album, duration, instrumental,
 *                     plainLyrics, syncedLyrics, lines: [{ time, text }] } }
 */

const axios = require('axios');

const BASE_URL = 'https://lrclib.net/api';
const HEADERS = {
    'User-Agent': 'LauNa-API (https://github.com/) lyric-fetcher',
    'Accept': 'application/json'
};
const TIMEOUT = 10000;

function parseSynced(lrc) {
    if (!lrc || typeof lrc !== 'string') return [];
    const lines = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]\s*(.*)/;
    for (const raw of lrc.split(/\r?\n/)) {
        const m = raw.match(re);
        if (!m) continue;
        const min = parseInt(m[1], 10) || 0;
        const sec = parseInt(m[2], 10) || 0;
        let frac = 0;
        if (m[3]) {
            const f = m[3].padEnd(3, '0').slice(0, 3);
            frac = parseInt(f, 10) / 1000;
        }
        const time = +(min * 60 + sec + frac).toFixed(3);
        const text = (m[4] || '').trim();
        lines.push({ time, text });
    }
    return lines;
}

function format(track) {
    if (!track) return null;
    return {
        id: track.id,
        title: track.trackName || track.name || null,
        artist: track.artistName || null,
        album: track.albumName || null,
        duration: track.duration || null,
        instrumental: !!track.instrumental,
        plainLyrics: track.plainLyrics || null,
        syncedLyrics: track.syncedLyrics || null,
        lines: parseSynced(track.syncedLyrics)
    };
}

function splitQuery(q) {
    // "Shape of You - Ed Sheeran"  hoặc  "Ed Sheeran - Shape of You"
    const sep = q.match(/\s[-–—|]\s/);
    if (!sep) return { title: q, artist: '' };
    const i = sep.index;
    const left = q.slice(0, i).trim();
    const right = q.slice(i + sep[0].length).trim();
    // Heuristic đơn giản: phần ngắn hơn thường là tên ca sĩ
    if (left.length > right.length) return { title: left, artist: right };
    return { title: right, artist: left };
}

async function getExact({ title, artist, album, duration }) {
    const params = { track_name: title, artist_name: artist };
    if (album) params.album_name = album;
    if (duration) params.duration = duration;
    try {
        const res = await axios.get(`${BASE_URL}/get`, { params, headers: HEADERS, timeout: TIMEOUT, validateStatus: s => s < 500 });
        if (res.status === 200) return format(res.data);
        return null;
    } catch { return null; }
}

async function search({ title, artist, query }) {
    const params = {};
    if (query) params.q = query;
    if (title) params.track_name = title;
    if (artist) params.artist_name = artist;
    try {
        const res = await axios.get(`${BASE_URL}/search`, { params, headers: HEADERS, timeout: TIMEOUT });
        if (Array.isArray(res.data)) return res.data;
        return [];
    } catch { return []; }
}

module.exports = {
    name: '/music/lyric',
    index: async (req, res) => {
        const q = (req.query.q || req.query.query || '').toString().trim();
        let title = (req.query.title || req.query.track || '').toString().trim();
        let artist = (req.query.artist || '').toString().trim();
        const album = (req.query.album || '').toString().trim();
        const duration = parseInt(req.query.duration, 10) || 0;

        if (!q && !title) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số. Truyền 'q' hoặc 'title' (kèm 'artist' nếu có).",
                examples: [
                    '/music/lyric?q=Shape of You - Ed Sheeran',
                    '/music/lyric?title=Shape of You&artist=Ed Sheeran',
                    '/music/lyric?title=Shape of You&artist=Ed Sheeran&duration=233'
                ]
            });
        }

        if (!title && q) {
            const sp = splitQuery(q);
            title = sp.title;
            if (!artist) artist = sp.artist;
        }

        try {
            // 1) Match chính xác nếu có đủ title + artist
            if (title && artist) {
                const exact = await getExact({ title, artist, album, duration });
                if (exact && (exact.plainLyrics || exact.syncedLyrics || exact.instrumental)) {
                    return res.json({ status: true, source: 'lrclib:get', data: exact });
                }
            }

            // 2) Search fuzzy
            const list = await search({ title, artist, query: q });
            if (!list.length) {
                return res.status(404).json({ status: false, message: 'Không tìm thấy lời bài hát phù hợp.' });
            }

            // Ưu tiên kết quả có syncedLyrics, sau đó plainLyrics
            list.sort((a, b) => {
                const sa = (a.syncedLyrics ? 2 : 0) + (a.plainLyrics ? 1 : 0);
                const sb = (b.syncedLyrics ? 2 : 0) + (b.plainLyrics ? 1 : 0);
                return sb - sa;
            });

            const best = format(list[0]);
            const candidates = list.slice(0, 8).map(t => ({
                id: t.id,
                title: t.trackName,
                artist: t.artistName,
                album: t.albumName,
                duration: t.duration,
                hasSynced: !!t.syncedLyrics,
                hasPlain: !!t.plainLyrics
            }));

            return res.json({ status: true, source: 'lrclib:search', data: best, candidates });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[LYRIC] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tìm lời bài hát' });
        }
    }
};
