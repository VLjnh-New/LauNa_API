'use strict';

/**
 * Liệt kê toàn bộ voice của Microsoft Edge Read-Aloud (Neural).
 *
 *   GET /ai/voices                  → tất cả voice
 *   GET /ai/voices?lang=vi          → chỉ voice tiếng Việt
 *   GET /ai/voices?lang=vi-VN
 *   GET /ai/voices?gender=Female
 *   GET /ai/voices?q=jenny          → search theo tên / locale
 *
 * Cache 24h trong RAM (danh sách hiếm khi đổi).
 */

const { MsEdgeTTS } = require('msedge-tts');
const log = require('../../utils/logger');

let _cache = null;
let _cacheAt = 0;
const TTL_MS = 24 * 60 * 60 * 1000;

async function fetchVoices() {
    if (_cache && (Date.now() - _cacheAt) < TTL_MS) return _cache;
    const tts = new MsEdgeTTS();
    const list = await tts.getVoices();
    _cache = list.map(v => ({
        name:           v.ShortName || v.Name,
        displayName:    v.FriendlyName || v.DisplayName || v.LocalName,
        locale:         v.Locale,
        localeName:     v.LocaleName,
        gender:         v.Gender,
        voiceType:      v.VoiceType,
        suggestedCodec: v.SuggestedCodec,
        styles:         v.StyleList || [],
        roles:          v.RolePlayList || []
    }));
    _cacheAt = Date.now();
    return _cache;
}

module.exports = {
    name: '/ai/voices',
    index: async (req, res) => {
        const lang   = (req.query.lang   || '').toString().trim().toLowerCase();
        const gender = (req.query.gender || '').toString().trim().toLowerCase();
        const q      = (req.query.q      || '').toString().trim().toLowerCase();

        try {
            let voices = await fetchVoices();

            if (lang)   voices = voices.filter(v => (v.locale || '').toLowerCase().startsWith(lang));
            if (gender) voices = voices.filter(v => (v.gender || '').toLowerCase() === gender);
            if (q)      voices = voices.filter(v =>
                (v.name || '').toLowerCase().includes(q) ||
                (v.displayName || '').toLowerCase().includes(q) ||
                (v.locale || '').toLowerCase().includes(q) ||
                (v.localeName || '').toLowerCase().includes(q)
            );

            return res.json({
                status: true,
                total: voices.length,
                filters: { lang: lang || null, gender: gender || null, q: q || null },
                voices,
                hint: 'Dùng field `name` (vd: vi-VN-HoaiMyNeural) cho /ai/voice?voice=...'
            });
        } catch (e) {
            log.error(`[VOICES] lỗi: ${e?.message || e}`);
            return res.status(502).json({ status: false, message: 'Không lấy được danh sách voice', details: String(e?.message || e) });
        }
    }
};
