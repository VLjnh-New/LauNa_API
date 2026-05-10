'use strict';

const axios  = require('axios');
const crypto = require('crypto');

const URI          = '/lv/v1/cc_web/replicate/search_templates';
const BASE_URL     = 'https://edit-api-sg.capcut.com';
const VERSION_CODE = '5.8.0';
const PLATFORM     = '7';
const MAX_RESULTS  = 10;

function makeSign(deviceTime) {
    const raw = `9e2c|${URI.slice(-7)}|${PLATFORM}|${VERSION_CODE}|${deviceTime}||11ac`;
    return crypto.createHash('md5').update(raw).digest('hex');
}

function buildHeaders() {
    const deviceTime = Math.floor(Date.now() / 1000).toString();
    return {
        'accept':           'application/json, text/plain, */*',
        'accept-language':  'vi-VN,vi;q=0.9,en;q=0.8',
        'app-sdk-version':  '48.0.0',
        'appvr':            VERSION_CODE,
        'content-type':     'application/json',
        'device-time':      deviceTime,
        'lan':              'vi-VN',
        'loc':              'va',
        'origin':           'https://www.capcut.com',
        'pf':               PLATFORM,
        'priority':         'u=1, i',
        'referer':          'https://www.capcut.com/',
        'sec-ch-ua':        '"Google Chrome";v="138", "Chromium";v="138", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest':   'empty',
        'sec-fetch-mode':   'cors',
        'sec-fetch-site':   'same-site',
        'sign':             makeSign(deviceTime),
        'sign-ver':         '1',
        'user-agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    };
}

async function searchCapcut(query, limit = MAX_RESULTS) {
    const body = {
        cc_web_version: 0,
        count:          limit,
        cursor:         '0',
        query,
        scene:          2,
        sdk_version:    '86.0.0',
        search_version: 2,
    };

    const response = await axios.post(`${BASE_URL}${URI}`, body, {
        headers: buildHeaders(),
        timeout: 15000,
    });

    const ret = response?.data?.ret;
    if (ret !== '0' && ret !== 0) {
        throw new Error(`CapCut API lỗi: ${response?.data?.errmsg || 'unknown'}`);
    }

    return response?.data?.data?.video_templates || [];
}

function formatTemplate(t) {
    const author = t.author || {};
    return {
        id:          String(t.id || ''),
        title:       t.title || '',
        shortTitle:  t.short_title || null,
        author: {
            id:       String(author.uid || author.web_uid || ''),
            username: author.unique_id || null,
            name:     author.name || null,
            avatar:   author.avatar_url || null,
        },
        cover:       t.optimized_cover_url || t.cover_url || null,
        videoCover:  t.video_dynamic_cover || t.dynamic_cover || null,
        videoUrl:    t.video_url || null,
        templateUrl: t.template_url || null,
        duration:    t.duration ? Math.round(t.duration / 1000) : null,
        fragments:   t.fragment_count || null,
        stats: {
            views:     t.play_amount    || 0,
            likes:     t.like_count     || 0,
            usage:     t.usage_amount   || 0,
            favorites: t.favorite_count || 0,
            shares:    t.share_count    || 0,
        },
        tags:       Array.isArray(t.template_tags_v2) ? t.template_tags_v2.map(tag => tag.name || tag).filter(Boolean) : [],
        createTime: t.create_time || null,
    };
}

module.exports = {
    name: '/capcut/search',
    index: async (req, res) => {
        const q     = req.query.q || req.query.query || req.query.keyword;
        const limit = Math.min(parseInt(req.query.limit) || MAX_RESULTS, 50);

        if (!q) {
            return res.status(400).json({
                status:  false,
                message: "Thiếu tham số 'q'",
                example: '/capcut/search?q=dance&limit=10',
            });
        }

        try {
            const raw     = await searchCapcut(q, limit);
            const results = raw.slice(0, limit).map(formatTemplate);
            return res.json({
                status: true,
                query:  q,
                total:  results.length,
                data:   results,
            });
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[CAPCUT] lỗi tìm kiếm: ${e.message}`, 'WARN');
            return res.status(500).json({
                status:  false,
                message: 'Lỗi tìm kiếm template CapCut',
            });
        }
    },
};
