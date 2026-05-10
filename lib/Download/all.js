'use strict';
const log = require('../../utils/logger');

// ─── Circuit Breaker ───────────────────────────────────────────────────────────
// Provider bị lỗi liên tiếp sẽ bị skip tạm thời, tránh lãng phí timeout
const CB_FAIL_THRESHOLD = 3;   // số lỗi liên tiếp để mở circuit
const CB_RESET_MS       = 60_000; // 1 phút rồi thử lại

const _cb = Object.create(null); // { providerName: { fails: 0, openUntil: 0 } }

function cbIsOpen(name) {
    const s = _cb[name];
    if (!s) return false;
    if (s.openUntil && Date.now() < s.openUntil) return true;
    if (s.openUntil && Date.now() >= s.openUntil) {
        s.fails = 0; s.openUntil = 0; // half-open: thử lại
    }
    return false;
}

function cbRecordFail(name) {
    if (!_cb[name]) _cb[name] = { fails: 0, openUntil: 0 };
    _cb[name].fails++;
    if (_cb[name].fails >= CB_FAIL_THRESHOLD) {
        _cb[name].openUntil = Date.now() + CB_RESET_MS;
        log(`[CB] ${name} circuit OPEN (${CB_FAIL_THRESHOLD} lỗi liên tiếp) — skip ${CB_RESET_MS / 1000}s`, 'WARN');
    }
}

function cbRecordSuccess(name) {
    if (_cb[name]) { _cb[name].fails = 0; _cb[name].openUntil = 0; }
}

function getHostType(url) {
    const value = String(url || '').toLowerCase();
    if (/tiktok\.com|vt\.tiktok\.com/.test(value)) return 'tiktok';
    if (/douyin\.com/.test(value)) return 'douyin';
    if (/youtube\.com|youtu\.be/.test(value)) return 'youtube';
    if (/mixcloud\.com/.test(value)) return 'mixcloud';
    if (/soundcloud\.com|on\.soundcloud\.com/.test(value)) return 'soundcloud';
    if (/facebook\.com|fb\.watch|fb\.me|m\.facebook\.com/.test(value)) return 'facebook';
    if (/threads\.com|threads\.net/.test(value)) return 'threads';
    if (/instagram\.com/.test(value)) return 'instagram';
    if (/twitter\.com|x\.com/.test(value)) return 'twitter';
    if (/reddit\.com/.test(value)) return 'reddit';
    if (/linkedin\.com/.test(value)) return 'linkedin';
    if (/pinterest\.com/.test(value)) return 'pinterest';
    if (/snapchat\.com/.test(value)) return 'snapchat';
    if (/t\.me|telegram\.me/.test(value)) return 'telegram';
    if (/bilibili\.com/.test(value)) return 'bilibili';
    if (/weibo\.com/.test(value)) return 'weibo';
    if (/amazon\.com|amazon\.co/.test(value)) return 'amazon';
    if (/ximalaya\.com/.test(value)) return 'ximalaya';
    return 'generic';
}

function collectLinks(input, path = '', output = []) {
    if (!input) return output;
    if (typeof input === 'string') {
        if (/^https?:\/\//i.test(input) && /(url|link|media|stream|download|thumbnail|cover|image|audio|video|file|hls|medias|images)/i.test(path)) {
            output.push(input);
        }
        return output;
    }
    if (Array.isArray(input)) {
        input.forEach((item, index) => collectLinks(item, `${path}[${index}]`, output));
        return output;
    }
    if (typeof input === 'object') {
        Object.entries(input).forEach(([key, value]) => collectLinks(value, path ? `${path}.${key}` : key, output));
    }
    return output;
}

function hasMedia(data) {
    if (!data || data.error) return false;
    if (Array.isArray(data.medias) && data.medias.some(m => m && (m.url || m.download_url || m.fileUrl))) return true;
    if (Array.isArray(data.images) && data.images.length) return true;
    if (data.type === 'profile' && Array.isArray(data.images) && data.images.length) return true;
    if (data.type === 'post' && Array.isArray(data.medias) && data.medias.length) return true;
    return Boolean(data.videoUrl || data.audioUrl || data.fileUrl || data.streamUrl || data.hlsUrl || collectLinks(data).length);
}

// Chuẩn hóa data từ mọi provider về shape thống nhất có `medias` array
function normalizeData(data) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data.medias) && data.medias.length) return data;

    const medias = [];
    if (data.videoUrl) medias.push({ type: 'video', quality: 'default', ext: 'mp4', url: data.videoUrl, has_audio: true });
    if (data.audioUrl) medias.push({ type: 'audio', quality: 'audio', ext: 'mp3', url: data.audioUrl, has_audio: true, is_audio_only: true });
    if (data.fileUrl)  medias.push({ type: 'video', quality: 'default', ext: 'mp4', url: data.fileUrl,  has_audio: true });
    if (data.streamUrl) medias.push({ type: 'video', quality: 'default', ext: 'mp4', url: data.streamUrl, has_audio: true });
    if (Array.isArray(data.images) && data.images.length) {
        for (const img of data.images) {
            const url = typeof img === 'string' ? img : img?.url;
            if (url) medias.push({ type: 'image', quality: 'original', ext: 'jpg', url, has_audio: false });
        }
    }
    if (medias.length) data.medias = medias;
    return data;
}

function makeProviders(type, opts = {}) {
    const requestedType = type === 'video' || type === 'audio' ? type : 'video';
    const { downloadTikTokCore } = require('./tiktok');
    const { downloadDouyinCore } = require('./douyin');
    const { downloadMixcloud } = require('./mixcloud');
    const { downloadSoundCloud } = require('../Music/soundcloud');
    const { downloadAll: j2Download } = require('./j2dl');
    const { downloadAll: vidssaveDownload } = require('./vidssave');
    const { downrFetch } = require('./downr');
    const { downloadAll: snapsaveDownload } = require('./snapsave');
    const { downloadThreads } = require('./threads');
    const { downloadAll: snapvieDownload } = require('./snapvie');

    const SNAPVIE_TYPES = ['youtube', 'tiktok', 'douyin', 'facebook', 'instagram', 'twitter', 'reddit', 'linkedin', 'pinterest', 'snapchat', 'telegram', 'bilibili', 'weibo', 'amazon', 'ximalaya', 'generic'];
    const GENERIC_TYPES = ['generic', 'tiktok', 'douyin', 'youtube', 'soundcloud', 'mixcloud', 'facebook'];

    return [
        { name: 'tiktok',     types: ['tiktok'],    run: url => downloadTikTokCore(url) },
        { name: 'douyin',     types: ['douyin'],     run: url => downloadDouyinCore(url) },
        { name: 'mixcloud',   types: ['mixcloud'],   run: url => downloadMixcloud(url) },
        { name: 'soundcloud', types: ['soundcloud'], run: url => downloadSoundCloud(url) },
        { name: 'snapsave',   types: ['facebook'],   run: url => snapsaveDownload(url) },
        { name: 'threads',    types: ['threads'],    run: url => downloadThreads(url) },
        { name: 'snapvie',    types: SNAPVIE_TYPES,  run: url => snapvieDownload(url) },
        { name: 'vidssave',   types: GENERIC_TYPES,  run: url => vidssaveDownload(url, { resolveLinks: true, resolveLimit: 12, timeout: 60000 }) },
        { name: 'downr',      types: GENERIC_TYPES,  run: url => downrFetch(url) },
        { name: 'j2dl',       types: GENERIC_TYPES,  run: url => j2Download(url) },
    ];
}

const TOTAL_TIMEOUT_MS    = 10000; // tổng thời gian tối đa (race kết thúc ngay khi có winner)
const PROVIDER_TIMEOUT_MS = 8000;  // timeout cho từng provider

async function downloadAuto(url, options = {}) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl) throw new Error('URL rỗng');

    const hostType = getHostType(cleanUrl);
    const all = makeProviders(options.type, options)
        .filter(p => p.types.includes(hostType) || p.types.includes('generic'))
        .filter((p, i, arr) => arr.findIndex(x => x.name === p.name) === i);

    if (all.length === 0) throw new Error('Không có provider phù hợp');

    // Lọc provider đang bị circuit breaker block
    const active  = all.filter(p => {
        if (cbIsOpen(p.name)) {
            log(`[CB] skip ${p.name} — circuit open`, 'WARN');
            return false;
        }
        return true;
    });
    // Nếu tất cả bị CB block thì fallback về toàn bộ (tránh trả lỗi oan)
    const runners = active.length > 0 ? active : all;

    const tried   = runners.map(p => p.name);
    const errors  = [];
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;

    // Chạy tất cả provider song song, ai trả media trước thì thắng.
    const racers = runners.map(provider => new Promise((resolve, reject) => {
        const remaining = deadline - Date.now();
        const timeoutMs = Math.min(PROVIDER_TIMEOUT_MS, Math.max(1, remaining));
        const timer = setTimeout(() => {
            errors.push({ provider: provider.name, message: 'Provider timeout' });
            cbRecordFail(provider.name);
            reject(new Error(`${provider.name} timeout`));
        }, timeoutMs);

        Promise.resolve()
            .then(() => provider.run(cleanUrl))
            .then(data => {
                clearTimeout(timer);
                if (hasMedia(data)) {
                    cbRecordSuccess(provider.name);
                    log(`[ALLDL] OK via ${provider.name} | ${cleanUrl.slice(0, 80)}`, 'API');
                    resolve({ provider: provider.name, data, links: [...new Set(collectLinks(data))] });
                } else {
                    cbRecordFail(provider.name);
                    errors.push({ provider: provider.name, message: 'Không có media' });
                    reject(new Error(`${provider.name} no media`));
                }
            })
            .catch(e => {
                clearTimeout(timer);
                const message = e?.message || String(e);
                cbRecordFail(provider.name);
                errors.push({ provider: provider.name, message });
                log(`[ALLDL] ${provider.name} lỗi: ${message}`, 'WARN');
                reject(e);
            });
    }));

    try {
        const winner = await Promise.any(racers);
        const normalized = normalizeData(winner.data);
        return { provider: winner.provider, tried, data: normalized, links: winner.links };
    } catch {
        const log = require('../../utils/logger');
        errors.forEach(e => log(`[DOWNLOAD-ALL] ${e.provider} lỗi: ${e.message}`, 'WARN'));
        const err = new Error('Tất cả API download đều thất bại');
        err.tried = tried;
        err.errors = errors.map(e => ({ provider: e.provider, error: 'Lỗi tải media' }));
        throw err;
    }
}

module.exports = {
    name: '/download/all',
    downloadAuto,
    index: async (req, res) => {
        const url = req.query.url;
        const type = String(req.query.type || 'auto').toLowerCase();
        const wantDl = ['1', 'true', 'yes'].includes(String(req.query.dl || '').toLowerCase());

        if (!url) {
            return res.status(400).json({
                status: false,
                message: "Thiếu tham số 'url'",
                examples: [
                    '/download/all?url=https://www.tiktok.com/...',
                    '/download/all?url=https://www.facebook.com/...',
                    '/download/all?url=https://soundcloud.com/...&dl=1',
                ],
                supported: ['tiktok', 'douyin', 'facebook', 'instagram', 'twitter', 'reddit', 'linkedin', 'pinterest', 'snapchat', 'telegram', 'bilibili', 'weibo', 'amazon', 'ximalaya', 'threads', 'mixcloud', 'soundcloud', 'generic'],
                params: {
                    type: 'auto | video | audio',
                    dl:   '1 → redirect stream file (SoundCloud)',
                }
            });
        }

        if (wantDl && getHostType(url) === 'soundcloud') {
            const params = new URLSearchParams({ url });
            const fwdKey = req.query.apikey || req.headers['x-api-key'];
            if (fwdKey) params.set('apikey', String(fwdKey));
            return res.redirect(302, `/download/scl?${params.toString()}`);
        }

        const opts = { type };

        try {
            const result = await downloadAuto(url, opts);
            const response = { status: true, provider: result.provider, tried: result.tried, links: result.links, data: result.data };
            if (getHostType(url) === 'soundcloud') {
                response.directDownload = `/download/scl?url=${encodeURIComponent(url)}`;
            }
            return res.json(response);
        } catch (e) {
            const log = require('../../utils/logger');
            log(`[DOWNLOAD-ALL] route lỗi: ${e.message}`, 'WARN');
            return res.status(500).json({
                status: false,
                message: 'Tất cả API download đều thất bại',
                tried: e.tried || [],
                errors: e.errors || []
            });
        }
    }
};