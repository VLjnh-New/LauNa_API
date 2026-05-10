'use strict';
const axios = require('axios');
const http = require('http');
const https = require('https');

const XOR_KEY = 'IFYOUWANTTHEARTISTSTOGETPAIDDONOTDOWNLOADFROMMIXCLOUD';
const xorDecrypt = (cipher) => {
    try {
        if (!cipher) return null;
        const data = Buffer.from(cipher, 'base64');
        return Array.from(data).map((b, i) => String.fromCharCode(b ^ XOR_KEY.charCodeAt(i % XOR_KEY.length))).join('');
    } catch { return null; }
};

const axiosInstance = axios.create({
    httpAgent: new http.Agent({ keepAlive: false }),
    httpsAgent: new https.Agent({ keepAlive: false })
});

const gql = (query, variables) => axiosInstance.post('https://app.mixcloud.com/graphql', { query, variables }, {
    headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'origin': 'https://www.mixcloud.com',
        'referer': 'https://www.mixcloud.com/',
        'x-mixcloud-client-version': 'e2a7e6d33e00252014cbbd99294f9caab2325e6d',
        'x-mixcloud-platform': 'www',
        'Connection': 'close'
    },
    timeout: 10000
});

async function downloadMixcloud(inputUrl) {
    let urlPath = inputUrl.split('?')[0].replace(/https?:\/\/www\.mixcloud\.com/, '').replace(/\/$/, '');
    if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;
    const parts = urlPath.split('/').filter(Boolean);
    if (parts.length < 2) throw new Error('Link không hợp lệ (cần cả tên người dùng và tên bài).');
    const [username, slug] = parts;
    const mainQuery = `query GetMixFull($l: CloudcastLookup!) {
      cloudcastLookup(lookup: $l) {
        ... on Cloudcast {
          id name audioLength isExclusive
          owner { displayName username }
          picture { urlRoot }
          streamInfo(timestamper: false) { url hlsUrl }
        }
      }
    }`;
    let cc = null;
    for (const t of [{ u: username, s: slug }, { u: decodeURIComponent(username), s: decodeURIComponent(slug) }]) {
        try {
            const resp = await gql(mainQuery, { l: { username: t.u, slug: t.s } });
            cc = resp?.data?.data?.cloudcastLookup;
            if (cc) break;
        } catch {}
    }
    if (!cc) {
        try {
            const rest = await axiosInstance.get(`https://api.mixcloud.com/${username}/${slug}/`, { timeout: 8000, headers: { 'Connection': 'close', 'User-Agent': 'Mozilla/5.0' } });
            if (rest.data?.key) {
                const p = rest.data.key.split('/').filter(Boolean);
                if (p.length >= 2) { const resp = await gql(mainQuery, { l: { username: p[0], slug: p[1] } }); cc = resp?.data?.data?.cloudcastLookup; }
            }
        } catch {}
    }
    if (!cc) throw new Error('Không tìm thấy bài hát trên Mixcloud.');
    const rawUrl = cc.streamInfo?.url || cc.streamInfo?.hlsUrl;
    if (!rawUrl) throw new Error(cc.isExclusive ? 'Bài này là Mixcloud Select, không thể tải.' : 'Lỗi bản quyền, không có link stream.');
    return {
        title: cc.name,
        author: cc.owner?.displayName || cc.owner?.username,
        duration: cc.audioLength,
        cover: cc.picture?.urlRoot ? cc.picture.urlRoot + '500x500' : null,
        streamUrl: xorDecrypt(rawUrl),
        hlsUrl: xorDecrypt(cc.streamInfo?.hlsUrl)
    };
}

module.exports = {
    downloadMixcloud,
    name: '/download/mixcloud',
    index: async (req, res) => {
        const url = req.query.url;
        if (!url) return res.status(400).json({ status: false, message: "Thiếu tham số 'url'", example: '/download/mixcloud?url=https://www.mixcloud.com/user/mix-name/' });
        try {
            const result = await downloadMixcloud(url);
            return res.json({ status: true, data: result });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[MIXCLOUD] lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({ status: false, message: 'Lỗi tải nhạc Mixcloud' });
        }
    }
};
