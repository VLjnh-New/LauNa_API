'use strict';
const axios = require('axios');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER V1 — snaptik.fans
// Source: https://snaptik.fans  |  Loại: Followers (free, ~500/24h)
// ═══════════════════════════════════════════════════════════════════════════════
const V1_BASE = 'https://snaptik.fans';

async function v1GetSession() {
    const r = await axios.get(V1_BASE + '/', {
        headers: { 'User-Agent': UA },
        timeout: 8000,
        maxRedirects: 3,
    });
    const raw = r.headers['set-cookie'] || [];
    const sid = raw.map(c => c.split(';')[0]).find(c => c.startsWith('PHPSESSID='));
    return sid || null;
}

async function v1LookupUser(username, cookie) {
    const r = await axios.post(V1_BASE + '/ajax/', `q=${encodeURIComponent(username)}`, {
        headers: {
            'User-Agent':       UA,
            'Content-Type':     'application/x-www-form-urlencoded',
            'Origin':           V1_BASE,
            'Referer':          V1_BASE + '/',
            'X-Requested-With': 'XMLHttpRequest',
            ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 10000,
    });
    return r.data;
}

async function v1SubmitOrder(username, ip, cookie) {
    const qs = `username=${encodeURIComponent(username)}&ip=${encodeURIComponent(ip)}&useragent=${encodeURIComponent(UA)}`;
    const r = await axios.get(`${V1_BASE}/offers?${qs}`, {
        headers: {
            'User-Agent':       UA,
            'Referer':          V1_BASE + '/',
            'Accept':           'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 10000,
    });
    return r.data;
}

async function v1CheckStatus(uid, cookie) {
    const r = await axios.get(`${V1_BASE}/complete?uid=${encodeURIComponent(uid)}`, {
        headers: {
            'User-Agent': UA,
            'Referer':    V1_BASE + '/',
            ...(cookie ? { Cookie: cookie } : {}),
        },
        timeout: 8000,
    });
    return String(r.data).trim();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER V2 — tikfollowers.com
// Source: https://tikfollowers.com  |  Loại: Followers / Likes / Views / Shares
// Tested: 2025-05-02 — 12 followers delivered thành công
// ═══════════════════════════════════════════════════════════════════════════════
const V2_BASE = 'https://tikfollowers.com';

const V2_HEADERS = (refPath = '/') => ({
    'Content-Type':     'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent':       UA,
    'Origin':           V2_BASE,
    'Referer':          V2_BASE + refPath,
});

// Bước 1: tìm user/video → trả về token + user_id / aweme_id
async function v2Search(input, type) {
    const refMap = {
        getUserDetails: '/free-tiktok-followers',
        videoDetails:   '/free-tiktok-likes',
    };
    const r = await axios.post(`${V2_BASE}/api/search`,
        { input, type },
        { headers: V2_HEADERS(refMap[type] || '/'), timeout: 12000 }
    );
    if (!r.data || r.data.status === 'error') {
        throw new Error(r.data?.message || 'v2 search thất bại');
    }
    return r.data;
}

// Bước 2: gửi yêu cầu buff
async function v2Process(searchData, processType) {
    const refMap = {
        followers:    '/free-tiktok-followers',
        like:         '/free-tiktok-likes',
        video_views:  '/free-tiktok-video-views',
        video_shares: '/free-tiktok-video-shares',
    };
    const payload = { ...searchData, type: processType };
    const r = await axios.post(`${V2_BASE}/api/process`,
        payload,
        { headers: V2_HEADERS(refMap[processType] || '/'), timeout: 15000 }
    );
    if (!r.data || r.data.status === 'error') {
        throw new Error(r.data?.message || 'v2 process thất bại');
    }
    return r.data;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDER V3 — tikfames.com (reCAPTCHA v3 bypass qua CapSolver)
// Source: https://tikfames.com  |  Loại: Followers / Likes / Views / Comments / Shares
// Flow:
//   1. Lookup user_id + sec_uid từ tikfollowers.com (không cần captcha)
//   2. Lấy reCAPTCHA v3 token qua CapSolver (cần CAPSOLVER_KEY)
//   3. POST /api/process đến tikfames.com với token + user data
// Tested: server validate reCAPTCHA v3 token thật — phải dùng CapSolver
// ═══════════════════════════════════════════════════════════════════════════════

const V3_BASE    = 'https://tikfames.com';
const V3_SITEKEY = '6LcW1kgqAAAAAN8SJbkhdM8cLgrxEjoXZXYZNIMj';
const CAPSOLVER  = 'https://api.capsolver.com';

const V3_HEADERS = (refPath = '/') => ({
    'Content-Type': 'application/json',
    'User-Agent':   UA,
    'Origin':       V3_BASE,
    'Referer':      V3_BASE + refPath,
});

// Lấy reCAPTCHA v3 token qua CapSolver
async function v3GetRecaptchaToken(capsolverKey, pageUrl, pageAction = 'submit') {
    const create = await axios.post(`${CAPSOLVER}/createTask`, {
        clientKey: capsolverKey,
        task: {
            type:       'ReCaptchaV3TaskProxyLess',
            websiteURL: pageUrl,
            websiteKey: V3_SITEKEY,
            pageAction,
            minScore:   0.5,
        },
    }, { timeout: 20000 });

    if (create.data.errorId) {
        throw new Error(`CapSolver tạo task thất bại: ${create.data.errorDescription}`);
    }
    const taskId = create.data.taskId;

    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const poll = await axios.post(`${CAPSOLVER}/getTaskResult`, {
            clientKey: capsolverKey, taskId,
        }, { timeout: 15000 });

        if (poll.data.status === 'ready')  return poll.data.solution.gRecaptchaResponse;
        if (poll.data.status === 'failed') throw new Error(`CapSolver thất bại: ${poll.data.errorDescription}`);
    }
    throw new Error('CapSolver timeout (>120s)');
}

// Bước lookup user/video dùng lại tikfollowers.com
async function v3LookupUser(username) {
    const r = await axios.post(`${V2_BASE}/api/search`,
        { input: username, type: 'getUserDetails' },
        { headers: V2_HEADERS('/free-tiktok-followers'), timeout: 12000 }
    );
    if (!r.data?.success) throw new Error(r.data?.message || 'Không tìm thấy user');
    return r.data;
}

async function v3LookupVideo(videoUrl) {
    const r = await axios.post(`${V2_BASE}/api/search`,
        { input: videoUrl, type: 'videoDetails' },
        { headers: V2_HEADERS('/free-tiktok-likes'), timeout: 12000 }
    );
    if (!r.data?.success) throw new Error(r.data?.message || 'Không tìm thấy video');
    return r.data;
}

// Gửi buff đến tikfames.com
async function v3Process(payload, refPath) {
    const r = await axios.post(`${V3_BASE}/api/process`, payload, {
        headers: V3_HEADERS(refPath),
        timeout: 20000,
    });
    if (!r.data) throw new Error('Không nhận được phản hồi từ tikfames.com');
    if (r.data.success === false) throw new Error(r.data.message || 'tikfames trả lỗi');
    return r.data;
}

const V3_TYPE_CONFIG = {
    followers: { action: 'followers', refPath: '/free-tiktok-followers', needsVideo: false },
    likes:     { action: 'likes',     refPath: '/free-tiktok-likes',     needsVideo: true  },
    views:     { action: 'views',     refPath: '/free-tiktok-views',     needsVideo: true  },
    comments:  { action: 'comments',  refPath: '/free-tiktok-comments',  needsVideo: true  },
    shares:    { action: 'shares',    refPath: '/free-tiktok-shares',    needsVideo: true  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
async function resolveIp(clientIp) {
    if (clientIp && clientIp !== '127.0.0.1' && !clientIp.startsWith('10.') && !clientIp.startsWith('192.168.')) {
        return clientIp;
    }
    try {
        const r = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
        return r.data.ip || '1.1.1.1';
    } catch {
        return '1.1.1.1';
    }
}

const PROVIDERS = {
    v1: { name: 'snaptik.fans',     supported: ['followers'],                                         url: 'https://snaptik.fans'   },
    v2: { name: 'tikfollowers.com', supported: ['followers', 'likes', 'views', 'shares'],             url: 'https://tikfollowers.com' },
    v3: { name: 'tikfames.com',     supported: ['followers', 'likes', 'views', 'comments', 'shares'], url: 'https://tikfames.com', requires: 'CAPSOLVER_KEY' },
};

const V2_TYPE_MAP = {
    followers: 'followers',
    likes:     'like',
    views:     'video_views',
    shares:    'video_shares',
};

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
module.exports = {
    name:   '/buff/tiktok',
    params: ['provider', 'type', 'username', 'url', 'action', 'uid'],

    index: async (req, res) => {
        const provider = String(req.query.provider || 'v1').toLowerCase();
        const type     = String(req.query.type     || 'followers').toLowerCase();
        const username = String(req.query.username || '').trim().replace(/^@/, '');
        const videoUrl = String(req.query.url      || '').trim();
        const action   = String(req.query.action   || 'submit').toLowerCase();
        const uid      = String(req.query.uid      || '').trim();

        // ── Liệt kê providers ──────────────────────────────────────────────
        if (action === 'list') {
            return res.json({
                status:    true,
                providers: Object.entries(PROVIDERS).map(([k, v]) => ({
                    provider:  k,
                    name:      v.name,
                    supported: v.supported,
                    url:       v.url,
                })),
                usage: {
                    followers_v1:  '/buff/tiktok?provider=v1&username=taikhoan',
                    followers_v2:  '/buff/tiktok?provider=v2&username=taikhoan&type=followers',
                    likes_v2:      '/buff/tiktok?provider=v2&url=https://tiktok.com/...&type=likes',
                    views_v2:      '/buff/tiktok?provider=v2&url=https://tiktok.com/...&type=views',
                    shares_v2:     '/buff/tiktok?provider=v2&url=https://tiktok.com/...&type=shares',
                    followers_v3:  '/buff/tiktok?provider=v3&username=taikhoan&type=followers&capsolver_key=CAP-...',
                    likes_v3:      '/buff/tiktok?provider=v3&url=https://tiktok.com/...&type=likes&capsolver_key=CAP-...',
                    comments_v3:   '/buff/tiktok?provider=v3&url=https://tiktok.com/...&type=comments&capsolver_key=CAP-...',
                    status_v1:     '/buff/tiktok?action=status&uid=...',
                },
            });
        }

        // ── Validate provider ──────────────────────────────────────────────
        if (!PROVIDERS[provider]) {
            return res.status(400).json({
                status:  false,
                message: `Provider không hợp lệ: '${provider}'. Dùng: v1, v2, v3`,
                tip:     'Xem danh sách tại: /buff/tiktok?action=list',
            });
        }

        // ════════════════════════════════════════════════════════════
        //  PROVIDER V1 — snaptik.fans
        // ════════════════════════════════════════════════════════════
        if (provider === 'v1') {

            // Kiểm tra trạng thái đơn
            if (action === 'status') {
                if (!uid) return res.status(400).json({
                    status:  false,
                    message: "Thiếu 'uid'. Ví dụ: /buff/tiktok?action=status&uid=...",
                });
                try {
                    const cookie = await v1GetSession();
                    const raw    = await v1CheckStatus(uid, cookie);
                    const done   = raw === '1';
                    return res.json({
                        status:     true,
                        provider:   'v1 (snaptik.fans)',
                        uid,
                        done,
                        message: done
                            ? 'Đơn hoàn thành! Follower sẽ đến trong 24–72h.'
                            : 'Đơn đang chờ xử lý.',
                        status_url: `${V1_BASE}/status?id=${uid}`,
                    });
                } catch (e) {
                    return res.status(500).json({ status: false, message: 'Lỗi kiểm tra trạng thái: ' + e.message });
                }
            }

            if (!username || username.length < 2) {
                return res.status(400).json({
                    status:  false,
                    message: "Thiếu 'username'.",
                    example: '/buff/tiktok?provider=v1&username=taikhoan',
                    note:    'v1 chỉ hỗ trợ buff Followers (~500/24h)',
                });
            }

            try {
                const cookie = await v1GetSession();
                const user   = await v1LookupUser(username, cookie);
                if (user.error) {
                    return res.status(404).json({
                        status:  false,
                        message: 'Không tìm thấy tài khoản: ' + (user.error || username),
                    });
                }

                const cfIp  = req.headers['cf-connecting-ip'];
                const xffIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
                const ip    = await resolveIp(cfIp || xffIp || req.ip || '');

                const order = await v1SubmitOrder(user.username || username, ip, cookie);
                if (!order || !order.uid) {
                    return res.status(502).json({
                        status:  false,
                        message: 'Không nhận được mã đơn từ snaptik.fans. Tài khoản có thể đã buff trong 24h gần nhất.',
                    });
                }

                return res.json({
                    status:   true,
                    provider: 'v1 (snaptik.fans)',
                    message:  'Gửi đơn buff thành công!',
                    user: {
                        username:  user.username,
                        name:      user.name,
                        followers: user.followers,
                        avatar:    user.avatar,
                    },
                    order: {
                        uid:        order.uid,
                        status_url: `${V1_BASE}/status?id=${order.uid}`,
                        check_api:  `/buff/tiktok?action=status&uid=${order.uid}`,
                        note:       'Follower sẽ đến trong 24–72h.',
                    },
                });
            } catch (e) {
                const log = require('../../utils/logger');
                log(`[BUFF-TIKTOK-V1] ${e.message}`, 'WARN');
                return res.status(500).json({ status: false, message: 'Lỗi kết nối snaptik.fans: ' + e.message });
            }
        }

        // ════════════════════════════════════════════════════════════
        //  PROVIDER V2 — tikfollowers.com
        // ════════════════════════════════════════════════════════════
        if (provider === 'v2') {
            const supported = ['followers', 'likes', 'views', 'shares'];
            if (!supported.includes(type)) {
                return res.status(400).json({
                    status:   false,
                    message:  `v2 không hỗ trợ type '${type}'. Dùng: ${supported.join(', ')}`,
                });
            }

            // Followers cần username, còn lại cần video url
            const needsVideoUrl = type !== 'followers';

            if (!needsVideoUrl && (!username || username.length < 2)) {
                return res.status(400).json({
                    status:  false,
                    message: "Buff followers cần tham số 'username'.",
                    example: '/buff/tiktok?provider=v2&type=followers&username=taikhoan',
                });
            }

            if (needsVideoUrl && !videoUrl) {
                return res.status(400).json({
                    status:  false,
                    message: `Buff ${type} cần tham số 'url' (URL video TikTok).`,
                    example: `/buff/tiktok?provider=v2&type=${type}&url=https://www.tiktok.com/@user/video/...`,
                });
            }

            try {
                let searchResult;
                if (!needsVideoUrl) {
                    searchResult = await v2Search(username, 'getUserDetails');
                } else {
                    searchResult = await v2Search(videoUrl, 'videoDetails');
                }

                const processType = V2_TYPE_MAP[type];
                const processResult = await v2Process(searchResult, processType);

                return res.json({
                    status:   true,
                    provider: 'v2 (tikfollowers.com)',
                    type,
                    message:  processResult.message || `Buff ${type} thành công!`,
                    user: !needsVideoUrl ? {
                        username:  searchResult.username,
                        nickname:  searchResult.nickname,
                        followers: searchResult.followers_count,
                        avatar:    searchResult.profilePic,
                    } : undefined,
                    video: needsVideoUrl ? {
                        video_id: searchResult.aweme_id,
                        author:   searchResult.author?.unique_id,
                    } : undefined,
                    result: {
                        amount:  processResult.data?.amount_processed,
                        type:    processType,
                        success: processResult.success,
                    },
                });

            } catch (e) {
                const log = require('../../utils/logger');
                log(`[BUFF-TIKTOK-V2] ${e.message}`, 'WARN');
                return res.status(500).json({ status: false, provider: 'v2', message: e.message });
            }
        }

        // ════════════════════════════════════════════════════════════
        //  PROVIDER V3 — tikfames.com (reCAPTCHA v3 via CapSolver)
        // ════════════════════════════════════════════════════════════
        if (provider === 'v3') {
            const capsolverKey = req.query.capsolver_key || req.body?.capsolver_key || process.env.CAPSOLVER_KEY || null;
            if (!capsolverKey) {
                return res.status(400).json({
                    status:  false,
                    message: "v3 yêu cầu 'capsolver_key'.",
                    example: '/buff/tiktok?provider=v3&username=taikhoan&type=followers&capsolver_key=CAP-...',
                });
            }

            const supported = Object.keys(V3_TYPE_CONFIG);
            if (!supported.includes(type)) {
                return res.status(400).json({
                    status:  false,
                    message: `v3 không hỗ trợ type '${type}'. Dùng: ${supported.join(', ')}`,
                });
            }

            const cfg = V3_TYPE_CONFIG[type];

            if (cfg.needsVideo && !videoUrl) {
                return res.status(400).json({
                    status:  false,
                    message: `Buff ${type} cần tham số 'url' (URL video TikTok).`,
                    example: `/buff/tiktok?provider=v3&type=${type}&url=https://www.tiktok.com/@user/video/...&capsolver_key=CAP-...`,
                });
            }

            if (!cfg.needsVideo && (!username || username.length < 2)) {
                return res.status(400).json({
                    status:  false,
                    message: "Buff followers cần tham số 'username'.",
                    example: '/buff/tiktok?provider=v3&type=followers&username=taikhoan&capsolver_key=CAP-...',
                });
            }

            try {
                // Bước 1: lookup thông tin user/video qua tikfollowers.com
                let lookupData;
                if (!cfg.needsVideo) {
                    lookupData = await v3LookupUser(username);
                } else {
                    lookupData = await v3LookupVideo(videoUrl);
                }

                // Bước 2: lấy reCAPTCHA v3 token qua CapSolver
                const pageUrl = `${V3_BASE}${cfg.refPath}`;
                const token   = await v3GetRecaptchaToken(capsolverKey, pageUrl, cfg.action);

                // Bước 3: gửi buff
                const payload = {
                    recaptchaToken: token,
                    type:           cfg.action,
                    username:       lookupData.username || username,
                    user_id:        lookupData.user_id  || '',
                    sec_uid:        lookupData.sec_uid  || '',
                    aweme_id:       lookupData.aweme_id || '',
                };
                const result = await v3Process(payload, cfg.refPath);

                return res.json({
                    status:   true,
                    provider: 'v3 (tikfames.com)',
                    type,
                    message:  result.message || `Buff ${type} thành công!`,
                    user: !cfg.needsVideo ? {
                        username:  lookupData.username,
                        nickname:  lookupData.nickname,
                        followers: lookupData.followers_count,
                    } : undefined,
                    video: cfg.needsVideo ? {
                        video_id: lookupData.aweme_id,
                        author:   lookupData.author?.unique_id,
                    } : undefined,
                    result: {
                        success: result.success !== false,
                        raw:     result,
                    },
                });

            } catch (e) {
                const log = require('../../utils/logger');
                log(`[BUFF-TIKTOK-V3] ${e.message}`, 'WARN');
                return res.status(500).json({ status: false, provider: 'v3', message: e.message });
            }
        }

        return res.status(400).json({ status: false, message: 'Provider không hợp lệ.' });
    },
};
